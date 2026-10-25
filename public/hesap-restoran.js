// DentSimco — Restoran hesap motoru
//
// Arayüzsüz, saf fonksiyonlar: tarayıcıda ve Node'da aynen çalışır; DOM, ağ ya da Firestore bilgisi içermez.
// Arayüz public/restoran.js, sınamalar test/restoran_test.mjs. Kaynaklar ve kanıt düzeyi her kuralın yanında:
//   [oyun]   oyunun hesap makinesi ya da döngü ekranlarıyla birebir doğrulandı (sınamalarda o ekranlar var)
//   [ölçüm]  oyuncu verisinden istatistikle ölçüldü (Ekim 2026, ~60 döngü); yeni veriyle güncellenebilir
//   [hipotez] oyun rehberi ya da Sim Companies Times makalesi (Ocak 2022); oyunda henüz doğrulanmadı
//
// Kurallar:
//   Döngü 12 saat. Koltuk: eko 1.000, lüks 500 × seviye [oyun]
//   Gelir = menü fiyatı × koltuk × doluluk [oyun]
//   Yemek ihtiyacı (ürün başına, döngü başına) = yukarı yuvarla(oran × kategori çarpanı × seviye × lüks çarpanı) [oyun]
//     oran: Times "Ratio" tablosu (seviye başına temel ihtiyaç); kategori çarpanı kategoride seçili ürün sayısına göre:
//     1 ürün 2,1; 2 ürün 1; 3 ürün 0,9; 4 ve üstü 0,8 [oyun: istemci kodu, GamePages jJ ve index.js ZMr]; lüks yemek ve maaş ×0,5 [oyun]
//   Yemek, müşteri gelsin gelmesin döngü başında harcanır (gider dolulukla değişmez) [oyun]
//   Maaş = binanın saatlik maaşı × 12 [oyun]; "iyi personel" (goodService) açıkken maaş ×5 [oyun: istemci kodu, "Maaşlar (ekstra)" = 4 × maaş]
//   Restoran kapanınca rating ×0,875 (kapanış başına bir kez; yükseltme de kapanıştır) [oyun]
//   Rating her döngü hedefine doğru yaklaşır: r' = r + k·(T − r), k ≈ 0,4 (±0,23), gürültü ±0,28 [ölçüm: aynı menüde 4 restoran, 18 geçiş;
//     restoran içi 0,36–0,5, döngü başına ortak hedefle 0,37 ± 0,23; havuzlanmış regresyon 0,17 hedef sapmasıyla aşağı yanlı]
//   Doluluk = oyunun herkese açık ısı haritası (rating × menü fiyatı, 150 bin döngü, eko + lüks karışık): rating 6 altında ve
//     fiyat yükseldikçe düşer, $60–89'da rating 7+ için ~%96–97 tavan [oyun: Sim Companies Times, Eylül 2026]
//     Kendi ölçümümüz (47 döngü, $60–67, rating 5,4–7,2) bununla çelişmiyor; tek döngüde ±%5 gürültü var [ölçüm]
//   Ekonomi fazı doluluğu kaydırır: harita ağırlıkla normal fazdır (kapsadığı dönemin %88'i normal). Resesyonda ucuz restoranların
//     doluluğu yükselir; model bunu rating'e +0,9 ekleyerek yansıtır (12 Ekim resesyon verisi, 23 döngü: hata 15,1 → 7,7 puan) [ölçüm].
//     Boom'da (23 Ekim 18:00 TR'den beri) uçurum bölgesi sağa kayıyor: rating 4,9–5,6'da $60'ta doluluk %47–52 (normal harita %62–85);
//     rating ≥ 5,8'de fark yok (%91–95). Model rating'e −0,8 ekler (5 döngü; gereken kayma −0,3…−1,1 arası, geçici) [ölçüm, kaba].
//     Gazete haritalarında boom pahalı/yüksek rating'li (lüks) restoranlara yarıyor [hipotez]
//   Lüks restoran rating'in etkisini toplamaz, çarpar [oyun: rehber ve değişiklik günlüğü]; çarpan ×1,25 [hipotez: gazete rating dağılımı
//     eko/lüks oranı ×1,2–1,5 (üst sınır, lüks sahipleri seçilmiş) ve tecrübeli oyuncu "%25"; kesin ölçüm için eko→lüks dönüşüm deneyi gerekir]
//   Menü fiyatı en az $60, en çok $350 [oyun rehberi]

export const DONGU_SAAT = 12;
export const ORTALAMA_MAAS = 345; // yedek: veri okunamazsa (meta/core AVERAGE_SALARY)
export const RESTORAN_MAAS_KATSAYISI = 1.7; // yedek: veri okunamazsa (meta/buildings, restoran)
export const FIYAT_MIN = 60;
export const FIYAT_MAX = 350;
export const KOLTUK = { eko: 1000, luks: 500 }; // seviye başına
export const LUKS_YEMEK = 0.5;
export const LUKS_MAAS = 0.5;
export const LUKS_RATING_CARPANI = 1.25; // [hipotez] lüks, ratingin etkisini çarpar; ×1,25 gazete verisinden ve oyuncu tahmininden, ölçülmedi
export const IYI_HIZMET_MAAS = 5; // goodService açıkken toplam maaş çarpanı (yönetim gideri dahil)
export const KAPANIS_CARPANI = 0.875;

// Kategori çarpanı: kategoride seçili ürün sayısı → ürün başına ihtiyaç çarpanı (4 ve üstü 0,8)
export const KATEGORI_CARPANI = { 1: 2.1, 2: 1, 3: 0.9, 4: 0.8 };
export const CARPAN_DOGRULANDI = { 1: true, 2: true, 3: true, 4: true };
export const kategoriCarpani = (n) => (n >= 4 ? KATEGORI_CARPANI[4] : KATEGORI_CARPANI[n] ?? 0);

export const KATEGORILER = [
  { key: 'salata', ad: 'Salata barı', urunler: [117, 121, 134, 122, 119, 123] },
  { key: 'ana', ad: 'Ana yemek', urunler: [129, 130, 131, 142, 143, 149] },
  { key: 'icecek', ad: 'İçecek', urunler: [132, 124, 125, 126] },
];

// oran = seviye başına döngü başına temel ihtiyaç; oyunun istemci kodundaki tablo (index.js YMr), Times tablosuyla aynı.
// Bal kabağı çorbası oyunda 9,2 (consumption × 44,45 tahmini 9,944 değildi).
export const URUNLER = {
  117: { ad: 'Süt', kat: 'salata', oran: 288 },
  121: { ad: 'Ekmek', kat: 'salata', oran: 24.89 },
  134: { ad: 'Tereyağı', kat: 'salata', oran: 92.6 },
  122: { ad: 'Peynir', kat: 'salata', oran: 38.196 },
  119: { ad: 'Kahve tozu', kat: 'salata', oran: 96.312 },
  123: { ad: 'Elmalı turta', kat: 'salata', oran: 16.667 },
  129: { ad: 'Hamburger', kat: 'ana', oran: 3.608 },
  130: { ad: 'Lazanya', kat: 'ana', oran: 4.073 },
  131: { ad: 'Köfte', kat: 'ana', oran: 3.505 },
  142: { ad: 'Salata', kat: 'ana', oran: 9.402 },
  143: { ad: 'Samosa', kat: 'ana', oran: 10.093 },
  149: { ad: 'Bal kabağı çorbası', kat: 'ana', oran: 9.2 },
  132: { ad: 'Kokteyl', kat: 'icecek', oran: 4.04 },
  124: { ad: 'Portakal suyu', kat: 'icecek', oran: 144 },
  125: { ad: 'Elma suyu', kat: 'icecek', oran: 128.955 },
  126: { ad: 'Zencefilli bira', kat: 'icecek', oran: 113.984 },
};

// Rating modeli [ölçüm]: veri büyüdükçe bu sabitler güncellenir
export const RATING = { k: 0.4, hedef: 6.0, gurultu: 0.28 }; // gurultu: tek restoran, tek döngü sapması (aynı menüde 4 restoran, 18 geçiş: 0,28)
export const DOLULUK = { ust: 96.5, kabul: 90 }; // ust: tavan; kabul: "güvenli" sayılan en düşük doluluk (%)
// Faz → haritadaki rating'e eklenen kayma. resesyon: 12 Ekim verisinden uydurma (0,75–1,0 aralığı aynı hatayı verir);
// boom: 24 – 25 Ekim'deki 3 uçurum noktasından geçici uydurma (−0,3…−1,1), veri geldikçe güncellenir.
export const FAZ_RATING_KAYMA = { resesyon: 0.9, normal: 0, boom: -0.8 };
export const FAZ_OLCULDU = { resesyon: true, normal: true, boom: true }; // boom: kaba, 5 döngü
export const FAZ_ADI = ['resesyon', 'normal', 'boom']; // Perakende ekonomi fazı dizini (0 Durgunluk, 1 Normal, 2 Büyüme) → ad
export const DOLULUK_ESIK = 6; // rating bu değerin üstündeyse $60–89'da doluluk plato (~%94–97), kendi son ölçümüne güvenilir

// Sim Companies Times "Restaurant Occupancy Heatmap" (14 Tem – 8 Eyl 2026, 150.396 döngü, eko ve lüks karışık; kaynak:
// /api/v3/en/0/newspaper/420/, makale 5307, grafik "H"). Satır = fiyat dilimi (alt sınır $60, $90 ... $360; dilim genişliği $30),
// sütun = rating dilimi (0 ... 10; 10 = 10 ve üstü). Değer = o dilimdeki ortalama doluluk (%). Dilimde 5'ten az döngü varsa
// değer yok sayıldı: boşluklar komşu satırdan oranla dolduruldu; sonra gürültüyü gidermek için rating arttıkça azalmayan, fiyat arttıkça artmayan
// yapıldı (araclar/isi_haritasi.mjs aynı işlemi yapar).
// Fiyatı $270 ve üstü satırlarda örnek çok az (rating başına 1–30 döngü); orada değerler yaklaşık.
export const ISI_FIYAT = [60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360];
export const ISI_DOLULUK = [
  [12.3, 18.7, 26.4, 34.5, 46.9, 83.4, 94.2, 96.4, 96.9, 96.9, 96.9], // $60
  [7.0, 11.5, 19.0, 27.2, 35.5, 43.1, 64.6, 85.8, 92.3, 92.3, 96.8], // $90
  [5.9, 6.7, 11.5, 20.3, 26.3, 36.6, 42.6, 51.9, 60.9, 70.7, 94.6], // $120
  [5.9, 6.7, 7.0, 14.0, 22.0, 28.2, 36.9, 44.5, 53.3, 59.5, 66.0], // $150
  [5.9, 6.7, 7.0, 12.8, 13.7, 19.8, 25.7, 35.3, 42.9, 52.1, 58.4], // $180
  [5.9, 6.7, 7.0, 8.7, 10.8, 15.2, 20.7, 32.7, 35.1, 45.5, 51.4], // $210
  [5.9, 6.7, 7.0, 8.7, 10.8, 11.2, 12.4, 21.4, 24.7, 36.9, 43.1], // $240
  [5.9, 6.7, 7.0, 8.7, 9.5, 9.5, 10.6, 18.2, 21.0, 34.0, 34.0], // $270
  [5.4, 5.8, 6.2, 8.7, 9.5, 9.5, 10.6, 12.9, 13.5, 19.6, 26.8], // $300
  [5.4, 5.8, 6.2, 8.7, 9.5, 9.5, 10.6, 12.9, 13.5, 19.6, 24.0], // $330
  [5.4, 5.8, 6.2, 7.4, 7.4, 7.6, 7.8, 7.8, 9.1, 13.2, 18.8] // $360
];
// Dilim ortaları: rating b + 0,5 (b = 0 … 10), fiyat alt sınır + 15 ($60 dilimi → $75, $90 dilimi → $105 …). Ortaların
// dışındaki değerler en yakın dilime sabitlenir ($75 altı $60 dilimi gibi).
const ara = (t, n) => { const x = Math.min(n - 1, Math.max(0, t)); const i = Math.min(n - 2, Math.floor(x)); return [i, x - i]; };

// Rating ve menü fiyatına göre beklenen doluluk (%): dilim ortaları arasında çift doğrusal ara değer; faz rating'i kaydırır.
export function dolulukHaritasi(rating, fiyat = FIYAT_MIN, faz = 'normal') {
  const r = (fin(Number(rating)) ? Number(rating) : 0) + (FAZ_RATING_KAYMA[faz] ?? 0);
  const p = fin(Number(fiyat)) && Number(fiyat) > 0 ? Number(fiyat) : FIYAT_MIN;
  const [ri, rt] = ara(r - 0.5, ISI_DOLULUK[0].length);
  const [pi, pt] = ara((p - ISI_FIYAT[0] - 15) / 30, ISI_FIYAT.length);
  const sat = (i) => ISI_DOLULUK[i][ri] + (ISI_DOLULUK[i][ri + 1] - ISI_DOLULUK[i][ri]) * rt;
  return sat(pi) + (sat(pi + 1) - sat(pi)) * pt;
}
export const dolulukRating = (r, fiyat = FIYAT_MIN, faz = 'normal') => dolulukHaritasi(r, fiyat, faz);

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const pos = (x) => (fin(x) && x > 0 ? x : null);
const tipOf = (tip) => (tip === 'luks' ? 'luks' : 'eko');

// ---------------------------------------------------------------------------------------------------------------
// Menü ve gider
// ---------------------------------------------------------------------------------------------------------------

// Seçili ürünlerin kategori sayıları: { salata: 2, ana: 2, icecek: 2 }
export function kategoriSayilari(ids) {
  const say = { salata: 0, ana: 0, icecek: 0 };
  for (const id of ids) { const u = URUNLER[id]; if (u) say[u.kat] += 1; }
  return say;
}
// Menü geçerli mi: oyun her kategoriden en az bir ürün ister
export function menuEksikleri(ids) {
  const say = kategoriSayilari(ids);
  return KATEGORILER.filter((k) => !say[k.key]).map((k) => k.ad);
}

// Döngü başına ihtiyaç: { [id]: adet }
export function ihtiyac(ids, seviye, tip = 'eko') {
  const L = Math.max(0, Math.floor(Number(seviye) || 0));
  const say = kategoriSayilari(ids);
  const luks = tipOf(tip) === 'luks' ? LUKS_YEMEK : 1;
  const out = {};
  for (const id of ids) {
    const u = URUNLER[id];
    if (!u) continue;
    out[id] = Math.ceil(u.oran * kategoriCarpani(say[u.kat]) * L * luks - 1e-9);
  }
  return out;
}

export const SATIS_HIZI_RATING = 0.02; // ekip dışı satış hızı % başına
export const ILETISIM_RATING = 0.01; // etkili iletişim puanı başına
export const BONUS_REFERANS = 0.99; // varsayılan hedefin (6) ölçüldüğü andaki bonus: 0,02 × %15 + 0,01 × 69

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Restoranın ratingine eklenen bonus: ekip dışı satış hızı (rekreasyon dahil) ve ekibin etkili iletişim puanı
export const ratingBonusu = (ekipDisiHizPct, etkiliIletisim) =>
  SATIS_HIZI_RATING * Math.max(0, Number(ekipDisiHizPct) || 0) + ILETISIM_RATING * Math.max(0, Number(etkiliIletisim) || 0);

// Eko restoranın seviye başı saatlik maaşı: bina katsayısı × ortalama maaş × (1 + net yönetim gideri)
export const saatlikMaasSeviye = ({ salaryModifier, averageSalary, adminNet } = {}) =>
  (pos(salaryModifier) ?? RESTORAN_MAAS_KATSAYISI) * (pos(averageSalary) ?? ORTALAMA_MAAS) * (1 + Math.max(0, Number(adminNet) || 0));

export function donguMaasi(seviyeBasiSaatlik, seviye, tip = 'eko', iyiHizmet = false) {
  const w = pos(seviyeBasiSaatlik);
  if (w == null) return null;
  return w * DONGU_SAAT * Math.max(0, Number(seviye) || 0) * (tipOf(tip) === 'luks' ? LUKS_MAAS : 1) * (iyiHizmet ? IYI_HIZMET_MAAS : 1);
}

/**
 * Bir restoranın döngü gideri, oyunun "Menu price" hesap makinesiyle aynı düzende.
 * @param {{ menu: Array<{ id: number, birim: number|null }>, seviye: number, tip?: 'eko'|'luks', saatlikMaas?: number|null, fiyat?: number, iyiHizmet?: boolean }} o
 *   menu[].birim: ürünün birim maliyeti (sourcing cost ÷ adet). saatlikMaas: eko seviye başı saatlik maaş.
 */
export function donguGideri({ menu = [], seviye, tip = 'eko', saatlikMaas = null, fiyat = FIYAT_MIN, iyiHizmet = false }) {
  const t = tipOf(tip);
  const L = Math.max(0, Math.floor(Number(seviye) || 0));
  const ids = menu.map((m) => Number(m.id)).filter((id) => URUNLER[id]);
  const adet = ihtiyac(ids, L, t);
  const kalemler = menu.filter((m) => URUNLER[m.id]).map((m) => {
    const birim = fin(m.birim) && m.birim >= 0 ? m.birim : null;
    return { id: Number(m.id), adet: adet[m.id], birim, tutar: birim == null ? null : adet[m.id] * birim };
  });
  const malzeme = kalemler.reduce((s, k) => s + (k.tutar ?? 0), 0);
  const maas = donguMaasi(saatlikMaas, L, t, !!iyiHizmet);
  const toplam = malzeme + (maas ?? 0);
  const koltuk = KOLTUK[t] * L;
  const gelir100 = pos(fiyat) ? fiyat * koltuk : 0;
  return {
    tip: t, seviye: L, iyiHizmet: !!iyiHizmet, koltuk, kalemler, malzeme, maas, toplam,
    eksikFiyat: kalemler.some((k) => k.birim == null), eksikMaas: maas == null, eksikKategori: menuEksikleri(ids),
    gelir100, kar100: gelir100 - toplam,
    basabas: gelir100 > 0 ? toplam / gelir100 : null, // doluluk oranı (0–1); oyun yüzde olarak tam sayıya yuvarlar
    seviyeBasi: L > 0 ? { malzeme: malzeme / L, maas: maas == null ? null : maas / L, toplam: toplam / L } : null,
  };
}

// Doluluk yüzdesiyle döngü kârı
export const donguKari = (gider, fiyat, dolulukPct) => fiyat * gider.koltuk * (dolulukPct / 100) - gider.toplam;

// ---------------------------------------------------------------------------------------------------------------
// Rating ve doluluk beklentisi
// ---------------------------------------------------------------------------------------------------------------
export const kapanisSonrasi = (r) => r * KAPANIS_CARPANI;
// Kapanış (ya da yükseltme) sonrası rating'de, bu fiyatta ısı haritasına göre doluluk kabul edilebilir mi
export const yukseltmeGuvenli = (r, fiyat = FIYAT_MIN, faz = 'normal') => dolulukHaritasi(kapanisSonrasi(r), fiyat, faz) >= DOLULUK.kabul;

/**
 * Restoranın ratingin yerleşeceği hedef.
 *  1) elle girilen hedef;
 *  2) önceki ve mevcut rating girildiyse: rating her döngü farkın k kadarını kapatır, hedef = önceki + (mevcut − önceki) ÷ k;
 *  3) varsayılan hedef (eko formülü), bonus farkıyla kaydırılır; lüks restoranda bu hedef LUKS_RATING_CARPANI ile çarpılır (10'a kırpılı).
 */
// Eko hedef rating = KALITE_TABAN + KALITE_RATING × ortalama menü kalitesi + çeşitlilik + bonus.
// Üç kalite düzeyinde, hepsi 2-2-2 menü ve stajyer personel [ölçüm]: Q̄ 3,0 (17 J, hedef 5,53 − bonus 1,10 = 4,43), Q̄ 7,0 (19–22 Ekim,
// 73 geçiş, 6,29 − 1,10 = 5,19) ve Q̄ 7,83 (12 Ekim, 5,98 − 0,59 = 5,39): doğrusal uydurma eğim 0,196, taban 3,84 (nokta başına ±0,3;
// eğim ±0,1). Hedefler k = 0,4 ile döngü geçişlerinden çıkarıldı.
export const KALITE_TABAN = 3.84;
export const KALITE_RATING = 0.20;
// Çeşitlilik [hipotez, zayıf kanıt]: Q3 sabitken kategori başına ortalama ürün sayısı → 2-2-2'ye göre hedef farkı. Menüler her kategoride birim
// fiyatı en düşük Q3 ürünlerinden iç içe kuruldu (17 Ekim borsa fiyatlarıyla: süt, kahve tozu, tereyağı · samosa, bal kabağı çorbası, salata ·
// portakal suyu, elma suyu, zencefilli bira), maliyet neredeyse sabit. Boom döngülerinden ortalama hedef: 1-1-1 (17 L, 3 döngü) 5,15 ± 0,22;
// 2-2-2 (17 J, 4 döngü) 5,39 ± 0,25; 3-3-3 (17 D, 4 döngü) 6,45 ± 0,18 → 2-2-2'ye göre −0,24 ve +1,06 (±0,3). 3'ten sonrası ölçülmedi,
// 3'te sabit tutulur (iyimser olmamak için). 3-3-3'ün üçüncü ana yemeği doğrulanmadı.
export const CESIT_RATING = [[1, -0.2], [2, 0], [3, 0.9]];
export function cesitlilikRating(say) {
  const n = say ? (Number(say.salata) || 0) + (Number(say.ana) || 0) + (Number(say.icecek) || 0) : 0;
  if (!(n > 0)) return 0;
  const c = clamp(n / 3, CESIT_RATING[0][0], CESIT_RATING.at(-1)[0]);
  for (let i = 1; i < CESIT_RATING.length; i++) {
    const [a, va] = CESIT_RATING[i - 1], [b, vb] = CESIT_RATING[i];
    if (c <= b) return va + ((vb - va) * (c - a)) / (b - a);
  }
  return CESIT_RATING.at(-1)[1];
}
export const REFERANS_KALITE = 7.5; // menü kalitesi bilinmiyorsa
// Seçili ürünlerin ortalama kalitesi; kalite bilgisi yoksa null
export function menuKalitesi(menu) {
  const q = (menu || []).map((m) => Number(m?.kalite)).filter((x) => fin(x));
  return q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
}

export function hedefRating(item, bonus = BONUS_REFERANS, kalite = REFERANS_KALITE, cesit = 0) {
  const elle = pos(Number(item?.hedef));
  if (elle != null) return { deger: clamp(elle, 0, 10), kaynak: 'girilen' };
  const once = Number(item?.onceki);
  const simdi = Number(item?.rating);
  if (fin(once) && fin(simdi) && item?.onceki !== '' && item?.onceki != null) return { deger: clamp(once + (simdi - once) / RATING.k, 0, 10), kaynak: 'tahmin' };
  const eko = KALITE_TABAN + KALITE_RATING * (fin(kalite) ? kalite : REFERANS_KALITE) + (fin(cesit) ? cesit : 0) + bonus;
  return tipOf(item?.tip) === 'luks'
    ? { deger: clamp(eko * LUKS_RATING_CARPANI, 0, 10), kaynak: 'varsayilan', luksCarpani: LUKS_RATING_CARPANI }
    : { deger: clamp(eko, 0, 10), kaynak: 'varsayilan' };
}

/**
 * Rating yerleşince beklenen doluluk (%): ısı haritası (rating × fiyat). Rating değişmiyorsa ya da hem şimdiki hem beklenen rating
 * platoda (≥ DOLULUK_ESIK) ise kullanıcının son ölçümü haritadan daha iyi bilgidir (aynı bina, fiyat ve rakipler).
 */
export function beklenenDoluluk(beklenenRating, mevcutRating, sonDoluluk, fiyat = FIYAT_MIN, faz = 'normal') {
  const son = fin(Number(sonDoluluk)) && sonDoluluk !== '' && sonDoluluk != null ? clamp(Number(sonDoluluk), 0, 100) : null;
  if (son != null && (Math.abs(beklenenRating - mevcutRating) < 0.25 || (mevcutRating >= DOLULUK_ESIK && beklenenRating >= DOLULUK_ESIK))) return son;
  return dolulukHaritasi(beklenenRating, fiyat, faz);
}

// ---------------------------------------------------------------------------------------------------------------
// Binalar: Perakende özetine giren değerlendirme
// ---------------------------------------------------------------------------------------------------------------
export const GUN_DONGU = 24 / DONGU_SAAT;

/**
 * @param {Array} restoranlar  [{ id, ad, tip, seviye, fiyat, rating, onceki, doluluk, hedef, menu? }]
 * @param {{ adminNet: number, averageSalary?: number, salaryModifier?: number, ratingBonus: number, mod: 'beklenen'|'simdi',
 *           menuOf: (item) => Array<{ id: number, birim: number|null, kalite?: number }> }} ctx
 * Dönen toplamlar Perakende'nin toplamlarıyla aynı adlarla: revenueDay, costDay (malzeme), wagesDay (yönetim dahil),
 * baseWagesDay (yönetimsiz), profitDay, levels.
 */
// ctx.faz: 'resesyon' | 'normal' | 'boom' (verilmezse normal)
export function restoranDegerlendir(restoranlar, ctx) {
  const saatlik = saatlikMaasSeviye(ctx);
  const taban = saatlikMaasSeviye({ ...ctx, adminNet: 0 });
  const rows = [];
  const T = { levels: 0, customersDay: 0, revenueDay: 0, costDay: 0, wagesDay: 0, baseWagesDay: 0, profitDay: 0 };
  for (const it of restoranlar || []) {
    const tip = tipOf(it.tip);
    const L = Math.max(0, Math.floor(Number(it.seviye) || 0));
    const fiyat = clamp(pos(Number(it.fiyat)) ?? FIYAT_MIN, FIYAT_MIN, FIYAT_MAX);
    const menu = ctx.menuOf(it);
    const iyiHizmet = !!it.iyiHizmet;
    const faz = ctx.faz in FAZ_RATING_KAYMA ? ctx.faz : 'normal';
    const g = donguGideri({ menu, seviye: L, tip, saatlikMaas: saatlik, fiyat, iyiHizmet });
    const kalite = menuKalitesi(menu);
    const cesit = cesitlilikRating(kategoriSayilari(menu.map((m) => Number(m.id)).filter((id) => URUNLER[id])));
    const hedef = hedefRating(it, ctx.ratingBonus, kalite ?? REFERANS_KALITE, cesit);
    const simdiR = fin(Number(it.rating)) && it.rating !== '' && it.rating != null ? Number(it.rating) : hedef.deger;
    const sonD = fin(Number(it.doluluk)) && it.doluluk !== '' && it.doluluk != null ? clamp(Number(it.doluluk), 0, 100) : null;
    // Borsada fiyatı olmayan ürün ya da eksik kategori varsa maliyet bilinmez: kâr hesaplanmaz (null), elle fiyat girilmesi istenir
    const eksik = !!g.eksikFiyat || g.eksikKategori.length > 0;
    const senaryo = (rating, doluluk) => {
      const gelirDong = fiyat * g.koltuk * (doluluk / 100);
      return { rating, doluluk, customersDay: g.koltuk * (doluluk / 100) * GUN_DONGU, revenueDay: gelirDong * GUN_DONGU, profitDay: eksik ? null : (gelirDong - g.toplam) * GUN_DONGU };
    };
    const simdi = senaryo(simdiR, sonD ?? beklenenDoluluk(simdiR, simdiR, null, fiyat, faz));
    const beklenen = senaryo(hedef.deger, beklenenDoluluk(hedef.deger, simdiR, sonD, fiyat, faz));
    const secili = ctx.mod === 'simdi' ? simdi : beklenen;
    const costDay = g.malzeme * GUN_DONGU;
    const wagesDay = (g.maas ?? 0) * GUN_DONGU;
    const baseWagesDay = taban * 24 * L * (tip === 'luks' ? LUKS_MAAS : 1) * (iyiHizmet ? IYI_HIZMET_MAAS : 1);
    rows.push({ id: it.id, ad: it.ad, tip, seviye: L, fiyat, gider: g, eksik, kalite, hedef, simdi, beklenen, secili, costDay, wagesDay, baseWagesDay,
      kapanis: { sonra: kapanisSonrasi(simdiR), guvenli: yukseltmeGuvenli(simdiR, fiyat, faz) } });
    T.levels += L;
    T.customersDay += secili.customersDay;
    T.revenueDay += secili.revenueDay;
    T.costDay += costDay;
    T.wagesDay += wagesDay;
    T.baseWagesDay += baseWagesDay;
    if (eksik) T.eksik = (T.eksik || 0) + 1;
    else T.profitDay += secili.revenueDay - costDay - wagesDay;
  }
  if (T.eksik) T.profitDay = null;
  return { rows, totals: T };
}
