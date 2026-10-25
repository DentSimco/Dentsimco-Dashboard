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
//     oran ve kategori çarpanı oyunun kendi kodundaki tablolardan (restoran ekranı, Ekim 2026) [oyun]; çarpan kategoride seçili
//     ürün sayısına göre: 1 ürün 2,1 · 2 ürün 1 · 3 ürün 0,9 · 4 ve üstü 0,8; lüks yemek ve maaş ×0,5 [oyun]
//   Yemek, müşteri gelsin gelmesin döngü başında harcanır (gider dolulukla değişmez) [oyun]
//   Maaş = binanın saatlik maaşı × 12 [oyun]
//   Restoran kapanınca rating ×0,875 (kapanış başına bir kez; yükseltme de kapanıştır) [oyun]
//   Hedef rating = [Menü puanı + Çeşitlilik puanı + Personel puanı] × Oturma çarpanı. Menü puanı = 3,33 + 0,23 × ortalama menü kalitesi [ölçüm];
//     Personel puanı = 0,01 × etkin CMO iletişim puanı + 0,02 × taban satış hızı % (bonus) [oyun]; çeşitlilik [hipotez]; oturma çarpanı eko 1, lüks 1,25 [kullanıcı]
//   Rating her döngü hedefine doğru yaklaşır: r' = r + k·(T − r), k ≈ 0,177, gürültü ±0,21 [ölçüm]
//   Doluluk = f(rating, menü fiyatı, ekonomi evresi): oyunun gazetesindeki restoran ısı haritalarından (28 dönem, ~3 milyon döngü)
//     evre paylarıyla regresyon; tablo public/restoran-doluluk.js (araclar/restoran-isi.mjs üretir). Piyasa ortalamasıdır [oyun verisi]
//   Menü fiyatı en az $60, en çok $350 [oyun rehberi]

import { DOLULUK_TABLO, DOLULUK_FIYATLAR, DOLULUK_KOSU, DOLULUK_KAYNAK } from './restoran-doluluk.js';

export const DONGU_SAAT = 12;
export const ORTALAMA_MAAS = 345; // yedek: veri okunamazsa (meta/core AVERAGE_SALARY)
export const RESTORAN_MAAS_KATSAYISI = 1.7; // yedek: veri okunamazsa (meta/buildings, restoran)
export const FIYAT_MIN = 60;
export const FIYAT_MAX = 350;
export const KOLTUK = { eko: 1000, luks: 500 }; // seviye başına
export const LUKS_YEMEK = 0.5;
export const LUKS_MAAS = 0.5;
export const KAPANIS_CARPANI = 0.875;
export const PROFESYONEL_MAAS = 5; // "Çalışan kalitesi: Profesyonel" maaşı 5 katına çıkarır [oyun kodu]; ratinge etkisi sunucuda, bilinmiyor

// Kategori çarpanı: kategoride seçili ürün sayısı → ürün başına ihtiyaç çarpanı. Oyun kodundaki dizi [2.1, 1, .9, .8, .8, .8] (1–6 ürün);
// eski makaledeki 0,7 ve 0,55 artık geçerli değil. Restoran ekranlarındaki adetlerle de doğrulandı (sınamalar).
export const KATEGORI_CARPANI = { 1: 2.1, 2: 1, 3: 0.9, 4: 0.8 };
export const kategoriCarpani = (n) => (n >= 4 ? KATEGORI_CARPANI[4] : KATEGORI_CARPANI[n] ?? 0);

export const KATEGORILER = [
  { key: 'salata', ad: 'Salata barı', urunler: [117, 121, 134, 122, 119, 123] },
  { key: 'ana', ad: 'Ana yemek', urunler: [129, 130, 131, 142, 143, 149] },
  { key: 'icecek', ad: 'İçecek', urunler: [132, 124, 125, 126] },
];

// oran = seviye başına döngü başına temel ihtiyaç; oyun kodundaki tabloyla aynı (bal kabağı 9,2: eski tahmin 9,944 yanlıştı).
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

// Rating ve doluluk modeli [ölçüm]: veri büyüdükçe bu sabitler güncellenir
export const RATING = { k: 0.177, hedef: 6.0, gurultu: 0.21, esik: 4.5, guvenli: 5.2 };

// Ekonomi evresi: hesap.js ECONOMY_PHASES ile aynı dizin (0 Durgunluk, 1 Normal, 2 Büyüme); bilinmiyorsa Normal
export const EVRE_NORMAL = 1;
export const evreOf = (e) => (e !== null && e !== '' && [0, 1, 2].includes(Number(e)) ? Number(e) : EVRE_NORMAL);
export { DOLULUK_KAYNAK };
export const DOLULUK_AZ_VERI = 1000; // hücrede 28 dönemde bundan az döngü varsa tahmin zayıf sayılır

// Tablodaki dilimin temsil ettiği nokta: rating dilimi r → r + 0,5 (rating 10 dilimi yalnız 10), fiyat dilimi p → p + 15
const RATING_MERKEZ = DOLULUK_TABLO[0][0].map((_, i) => (i < 10 ? i + 0.5 : 10));
const FIYAT_MERKEZ = DOLULUK_FIYATLAR.map((p) => p + 15);
// Sıralı merkezler arasında konum: [alt dizin, üst dizin, ağırlık]; uçlarda sabit
function konum(merkez, x) {
  if (!(x > merkez[0])) return [0, 0, 0];
  const n = merkez.length - 1;
  if (x >= merkez[n]) return [n, n, 0];
  let i = 0;
  while (merkez[i + 1] < x) i++;
  return [i, i + 1, (x - merkez[i]) / (merkez[i + 1] - merkez[i])];
}

/** Tahmini doluluk (%): rating (lüks çarpanı dahil), menü fiyatı ve evreye göre tablodan iki yönlü ara değer. */
export function dolulukTahmini(rating, fiyat, evre = EVRE_NORMAL) {
  const t = DOLULUK_TABLO[evreOf(evre)];
  const r = clamp(fin(Number(rating)) ? Number(rating) : 0, 0, 10);
  const p = clamp(fin(Number(fiyat)) ? Number(fiyat) : FIYAT_MIN, FIYAT_MIN, FIYAT_MAX);
  const [r0, r1, a] = konum(RATING_MERKEZ, r);
  const [p0, p1, b] = konum(FIYAT_MERKEZ, p);
  const satir = (pi) => t[pi][r0] + (t[pi][r1] - t[pi][r0]) * a;
  return satir(p0) + (satir(p1) - satir(p0)) * b;
}

/** Tahminin dayandığı hücredeki döngü sayısı (en yakın dilim); DOLULUK_AZ_VERI altı zayıf. */
export function dolulukVerisi(rating, fiyat) {
  const r = clamp(Math.floor(Number(rating) || 0), 0, 10);
  const p = clamp(Number(fiyat) || FIYAT_MIN, FIYAT_MIN, FIYAT_MAX);
  let pi = 0;
  while (pi + 1 < DOLULUK_FIYATLAR.length && DOLULUK_FIYATLAR[pi + 1] <= p) pi++;
  return DOLULUK_KOSU[pi][r];
}

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

export function donguMaasi(seviyeBasiSaatlik, seviye, tip = 'eko', profesyonel = false) {
  const w = pos(seviyeBasiSaatlik);
  if (w == null) return null;
  return w * DONGU_SAAT * Math.max(0, Number(seviye) || 0) * (tipOf(tip) === 'luks' ? LUKS_MAAS : 1) * (profesyonel ? PROFESYONEL_MAAS : 1);
}

/**
 * Bir restoranın döngü gideri, oyunun "Menu price" hesap makinesiyle aynı düzende.
 * @param {{ menu: Array<{ id: number, birim: number|null }>, seviye: number, tip?: 'eko'|'luks', saatlikMaas?: number|null, fiyat?: number }} o
 *   menu[].birim: ürünün birim maliyeti (sourcing cost ÷ adet). saatlikMaas: eko seviye başı saatlik maaş.
 */
export function donguGideri({ menu = [], seviye, tip = 'eko', saatlikMaas = null, fiyat = FIYAT_MIN, profesyonel = false }) {
  const t = tipOf(tip);
  const L = Math.max(0, Math.floor(Number(seviye) || 0));
  const ids = menu.map((m) => Number(m.id)).filter((id) => URUNLER[id]);
  const adet = ihtiyac(ids, L, t);
  const kalemler = menu.filter((m) => URUNLER[m.id]).map((m) => {
    const birim = fin(m.birim) && m.birim >= 0 ? m.birim : null;
    return { id: Number(m.id), adet: adet[m.id], birim, tutar: birim == null ? null : adet[m.id] * birim };
  });
  const malzeme = kalemler.reduce((s, k) => s + (k.tutar ?? 0), 0);
  const maas = donguMaasi(saatlikMaas, L, t, profesyonel);
  const toplam = malzeme + (maas ?? 0);
  const koltuk = KOLTUK[t] * L;
  const gelir100 = pos(fiyat) ? fiyat * koltuk : 0;
  return {
    tip: t, seviye: L, koltuk, kalemler, malzeme, maas, toplam,
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
export const yukseltmeGuvenli = (r) => kapanisSonrasi(r) >= RATING.esik + 0.05;

/**
 * Restoranın ratingin yerleşeceği hedef.
 *  1) elle girilen hedef;
 *  2) önceki ve mevcut rating girildiyse: rating her döngü farkın k kadarını kapatır, hedef = önceki + (mevcut − önceki) ÷ k;
 *  3) varsayılan: [menü puanı + çeşitlilik + bonus] × oturma çarpanı (eko 1, lüks 1,25).
 */
// Eko hedef rating = KALITE_TABAN + KALITE_RATING × ortalama menü kalitesi + bonus.
// Üç ölçümden: 11 Ekim menüsü (ort. Q7,5, bonus 0,99 → ~6,0), 20 Ekim (aynı menü, bonus 1,09 → ~6,4) ve seviye 2 testi
// (ort. Q0,5, bonus 0,32 → ~3,6). Belirsizlik: taban ±1,2, eğim ±0,15.
export const KALITE_TABAN = 3.33;
export const KALITE_RATING = 0.23;
export const REFERANS_KALITE = 7.5; // menü kalitesi bilinmiyorsa
// Hedef rating köşeli parantezin sonucu bu çarpanla çarpılır: eko 1, lüks 1,25 (değer kullanıcıdan; oyunda ayrıca ölçülmedi)
export const LUKS_OTURMA_CARPANI = 1.25;
export const oturmaCarpani = (tip) => (tipOf(tip) === 'luks' ? LUKS_OTURMA_CARPANI : 1);
// Ürün çeşitliliğinin hedef ratinge etkisi: [kategorideki ürün sayısı, eklenen puan]. [hipotez] Başka bir sohbette tahmin edildi, oyunda ölçülmedi.
// Kalibrasyon menüleri kategori başına 2 ürünlüydü; bu yüzden 2 → 0 alınır (etki KALITE_TABAN'a karışmış durumdadır). Üç kategorinin değerlerinin ORTALAMASI eklenir.
export const CESIT_RATING = [[1, -0.2], [2, 0], [3, 0.9]];
const cesitDegeri = (n) => {
  const t = CESIT_RATING;
  if (n <= t[0][0]) return t[0][1]; // tablodan küçük (0 ürün: eksik kategori) ilk satır gibi
  if (n >= t[t.length - 1][0]) return t[t.length - 1][1]; // tablodan büyük (4 ve üstü) son satır gibi; 4+ ürün ölçülmedi
  return (t.find(([k]) => k === n) ?? [0, 0])[1];
};
// sayilar: kategoriSayilari çıktısı { salata, ana, icecek }
export const cesitRating = (sayilar) => KATEGORILER.reduce((t, k) => t + cesitDegeri(Math.floor(Number(sayilar?.[k.key]) || 0)), 0) / KATEGORILER.length;

// Seçili ürünlerin ortalama kalitesi; kalite bilgisi yoksa null
export function menuKalitesi(menu) {
  const q = (menu || []).map((m) => Number(m?.kalite)).filter((x) => fin(x));
  return q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Rating modeli B: "maliyet puanı" [hipotez]
// ---------------------------------------------------------------------------------------------------------------
// Oyun rehberi: "Her yemeğin yeni ratinge etkisi çoğunlukla maliyetine bağlıdır". Oranlar referans fiyattan türetilmiş (oran × Ref = 7200,
// R² = 0,99; Süt 25 $, Portakal suyu 50 $ …). Bir ürünün maliyet puanı = o kalitedeki borsa fiyatının referans fiyata oranı.
// Puan, ödenen güncel fiyata değil bu SABİT tabloya bağlanır (aksi halde fazla ödemek ratingi artırır, sözleşme indirimi düşürürdü).
// Tablo: 21 Eylül–25 Ekim 2026 borsa medyan fiyatı (VWAP) ÷ (7200 ÷ oran); eksik kaliteler komşulardan, kaliteyle azalmaz.
export const REF_C = 7200;
export const referansFiyat = (id) => (URUNLER[id] ? REF_C / URUNLER[id].oran : null);
export const MALIYET_PUANI = {
  117: [0.28, 0.3, 0.33, 0.35, 0.38, 0.45, 0.5, 0.52, 0.54, 0.74, 0.74, 0.76, 0.8],
  121: [0.48, 0.54, 0.59, 0.65, 0.7, 0.73, 0.74, 0.8, 0.89, 0.89, 0.9, 0.92, 0.94],
  134: [0.57, 0.59, 0.6, 0.62, 0.67, 0.7, 0.77, 0.79, 0.82, 0.9, 0.99, 1.04, 1.1],
  122: [0.62, 0.63, 0.63, 0.66, 0.68, 0.72, 0.75, 0.76, 0.83, 0.85, 0.9, 1.12, 1.16],
  119: [0.44, 0.46, 0.47, 0.5, 0.53, 0.68, 0.72, 0.73, 0.79, 0.81, 0.83, 0.88, 0.89],
  123: [0.64, 0.64, 0.64, 0.65, 0.66, 0.67, 0.72, 0.72, 0.76, 0.79, 0.84, 0.89, 0.94],
  129: [0.96, 0.99, 1.06, 1.24, 1.31, 1.37, 1.4, 1.47, 1.57, 1.71, 1.85, 1.98, 2.0],
  130: [1.04, 1.08, 1.18, 1.29, 1.34, 1.42, 1.58, 1.62, 1.64, 1.65, 1.69, 1.73, 2.26],
  131: [1.07, 1.07, 1.13, 1.14, 1.24, 1.37, 1.38, 1.41, 1.43, 1.43, 1.44, 1.53, 1.74],
  142: [1.0, 1.04, 1.04, 1.12, 1.16, 1.2, 1.25, 1.3, 1.39, 1.53, 1.53, 1.67, 1.89],
  143: [1.03, 1.03, 1.06, 1.14, 1.17, 1.21, 1.29, 1.35, 1.43, 1.53, 1.53, 1.77, 1.95],
  149: [0.87, 0.93, 0.99, 1.09, 1.15, 1.22, 1.22, 1.29, 1.37, 1.37, 1.51, 1.73, 1.95],
  132: [1.09, 1.19, 1.32, 1.43, 1.55, 1.56, 1.59, 1.68, 1.74, 1.8, 1.85, 1.98, 2.25],
  124: [0.66, 0.67, 0.68, 0.72, 0.75, 0.82, 0.89, 0.96, 1.0, 1.04, 1.25, 1.34, 1.54],
  125: [0.47, 0.48, 0.51, 0.61, 0.7, 0.73, 0.82, 0.85, 0.88, 0.9, 1.0, 1.0, 1.2],
  126: [0.81, 0.81, 0.82, 0.84, 0.88, 0.91, 0.98, 1.0, 1.09, 1.22, 1.4, 1.62, 1.84],
};
export const maliyetPuani = (id, q) => MALIYET_PUANI[id]?.[clamp(Math.floor(Number(q) || 0), 0, 12)] ?? null;
// Menünün ortalama maliyet puanı ρ = Σ çarpan × puan ÷ Σ çarpan (çarpan: kategorideki ürün sayısına göre). Bu, gerçek malzeme gideri ÷ referans bütçeye eşittir.
// Fotoğraflardaki 9 restoranın 26 döngüsünde gider ÷ referans bütçe 0,90–0,95 çıktı; puan tablosundan 0,94 hesaplanıyor.
export function menuMaliyetPuani(menu) {
  const list = (menu || []).filter((m) => URUNLER[m?.id] && maliyetPuani(m.id, m.kalite) != null);
  if (!list.length) return null;
  const say = kategoriSayilari(list.map((m) => Number(m.id)));
  let a = 0;
  let w = 0;
  for (const m of list) { const c = kategoriCarpani(say[URUNLER[m.id].kat]); a += c * maliyetPuani(m.id, m.kalite); w += c; }
  return a / w;
}
// Menü puanı = B_TABAN + B_EGIM × ρ. Taban: 9 restoranın (aynı menü, ρ = 0,94, bonus ≈ 1,0) ortalama ratingi 6,45 ± 0,15 → menü puanı 5,43.
// Eğim: kalite başına 0,23 puanın kalite başına ρ artışına (≈ 0,058) oranı ≈ 4,0; Süt/Köfte/Elma deneyi ≈ 4,3. Belirsizlik: eğim ± 1.
export const B_TABAN = 1.47;
export const B_EGIM = 4.2;
export const menuPuaniB = (rho) => B_TABAN + B_EGIM * rho;
export const rhoGerekli = (rating, bonus, cesit, carpan = 1) => (rating / carpan - (Number(cesit) || 0) - (Number(bonus) || 0) - B_TABAN) / B_EGIM;

export function hedefRating(item, bonus = BONUS_REFERANS, kalite = REFERANS_KALITE, cesit = 0, menuPuani = null) {
  const elle = pos(Number(item?.hedef));
  if (elle != null) return { deger: clamp(elle, 0, 10), kaynak: 'girilen' };
  const once = Number(item?.onceki);
  const simdi = Number(item?.rating);
  if (fin(once) && fin(simdi) && item?.onceki !== '' && item?.onceki != null) return { deger: clamp(once + (simdi - once) / RATING.k, 0, 10), kaynak: 'tahmin' };
  const menu = fin(menuPuani) ? menuPuani : KALITE_TABAN + KALITE_RATING * (fin(kalite) ? kalite : REFERANS_KALITE);
  return { deger: clamp((menu + (Number(bonus) || 0) + (fin(cesit) ? cesit : 0)) * oturmaCarpani(item?.tip), 0, 10), kaynak: 'varsayilan' };
}

/**
 * Döngü kârını en yükselten menü fiyatı ($1 adım, $60–350). Gider fiyattan bağımsızdır (yemek her döngü harcanır).
 * Dönen: { fiyat, doluluk, kar } (kar döngü başına); gider eksikse (fiyatı olmayan ürün) null.
 */
export function enKarliFiyat(gider, rating, evre = EVRE_NORMAL) {
  if (!gider || !(gider.koltuk > 0) || !fin(gider.toplam)) return null;
  let iyi = null;
  for (let fiyat = FIYAT_MIN; fiyat <= FIYAT_MAX; fiyat++) {
    const doluluk = dolulukTahmini(rating, fiyat, evre);
    const kar = donguKari(gider, fiyat, doluluk);
    if (!iyi || kar > iyi.kar + 1e-9) iyi = { fiyat, doluluk, kar };
  }
  return iyi;
}

// ---------------------------------------------------------------------------------------------------------------
// Binalar: Perakende özetine giren değerlendirme
// ---------------------------------------------------------------------------------------------------------------
export const GUN_DONGU = 24 / DONGU_SAAT;

/**
 * @param {Array} restoranlar  [{ id, ad, tip, profesyonel?, seviye, fiyat, rating, onceki, doluluk, hedef, menu? }]
 * @param {{ adminNet: number, averageSalary?: number, salaryModifier?: number, ratingBonus: number, mod: 'beklenen'|'simdi', model?: 'kalite'|'maliyet', evre?: 0|1|2,
 *           menuOf: (item) => Array<{ id: number, birim: number|null, kalite?: number }> }} ctx
 * Dönen toplamlar Perakende'nin toplamlarıyla aynı adlarla: revenueDay, costDay (malzeme), wagesDay (yönetim dahil),
 * baseWagesDay (yönetimsiz), profitDay, levels.
 */
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
    const g = donguGideri({ menu, seviye: L, tip, saatlikMaas: saatlik, fiyat, profesyonel: !!it.profesyonel });
    const kalite = menuKalitesi(menu);
    const cesit = menu.length ? cesitRating(kategoriSayilari(menu.map((m) => Number(m.id)))) : 0;
    const rho = menuMaliyetPuani(menu);
    const hedef = hedefRating(it, ctx.ratingBonus, kalite ?? REFERANS_KALITE, cesit, ctx.model === 'maliyet' && rho != null ? menuPuaniB(rho) : null);
    const simdiR = fin(Number(it.rating)) && it.rating !== '' && it.rating != null ? Number(it.rating) : hedef.deger;
    const sonD = fin(Number(it.doluluk)) && it.doluluk !== '' && it.doluluk != null ? clamp(Number(it.doluluk), 0, 100) : null;
    // Borsada fiyatı olmayan ürün ya da eksik kategori varsa maliyet bilinmez: kâr hesaplanmaz (null), elle fiyat girilmesi istenir
    const eksik = !!g.eksikFiyat || g.eksikKategori.length > 0;
    const senaryo = (rating, doluluk) => {
      const gelirDong = fiyat * g.koltuk * (doluluk / 100);
      return { rating, doluluk, customersDay: g.koltuk * (doluluk / 100) * GUN_DONGU, revenueDay: gelirDong * GUN_DONGU, profitDay: eksik ? null : (gelirDong - g.toplam) * GUN_DONGU };
    };
    const evre = evreOf(ctx.evre);
    const simdi = senaryo(simdiR, sonD ?? dolulukTahmini(simdiR, fiyat, evre));
    const beklenen = senaryo(hedef.deger, dolulukTahmini(hedef.deger, fiyat, evre));
    const secili = ctx.mod === 'simdi' ? simdi : beklenen;
    const costDay = g.malzeme * GUN_DONGU;
    const wagesDay = (g.maas ?? 0) * GUN_DONGU;
    const baseWagesDay = taban * 24 * L * (tip === 'luks' ? LUKS_MAAS : 1) * (it.profesyonel ? PROFESYONEL_MAAS : 1);
    rows.push({ id: it.id, ad: it.ad, tip, profesyonel: !!it.profesyonel, seviye: L, fiyat, gider: g, eksik, kalite, maliyetPuani: rho, hedef, simdi, beklenen, secili, costDay, wagesDay, baseWagesDay,
      evre, enKarli: eksik || g.eksikMaas ? null : enKarliFiyat(g, hedef.deger, evre), dolulukVerisi: dolulukVerisi(hedef.deger, fiyat),
      kapanis: { sonra: kapanisSonrasi(simdiR), guvenli: yukseltmeGuvenli(simdiR) } });
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

// ---------------------------------------------------------------------------------------------------------------
// Menü önerisi: hedef ortalama kaliteyi (rating hedefini) sağlayan en ucuz ürün ve kalite dağılımı
// ---------------------------------------------------------------------------------------------------------------
// Hedef rating ürüne değil, seçili ürünlerin ortalama kalitesine bağlıdır (hedefRating). Ortalama aynı kalırken kaliteyi basamağı ucuz
// ürüne kaydırmak (süt Q2 → Q3, köfte Q10 → Q9) ya da kategoride daha ucuz ürünü seçmek ratingi değiştirmeden gideri düşürür.
// Fiyat: anlık borsa fiyatı (kalitesi ≥ q olan en ucuz ilan). Arz: tam q kalitesindeki ilan adedi; q için alınabilecek adet Σ q' ≥ q.
// Çözüm tamdır (dinamik programlama): kategori başına ürün alt kümesi × kalite toplamı, sonra kategoriler birleştirilir.

export const MAX_KALITE = 12;
export const RATING_PAYI = 0.3; // güvenli hedefte formül belirsizliğine karşı pay

// Hedef rating için gereken ortalama menü kalitesi (eko hedef formülünün tersi)
export const gerekenKalite = (rating, bonus = BONUS_REFERANS) => (rating - KALITE_TABAN - (Number(bonus) || 0)) / KALITE_RATING;

// Menüyü kullanan binaların toplam döngü ihtiyacı; her bina oyundaki gibi ayrı yuvarlanır (ihtiyac ile aynı sıra)
function toplamIhtiyac(oran, carpan, binalar) {
  let t = 0;
  for (const b of binalar) {
    const L = Math.max(0, Math.floor(Number(b?.seviye) || 0));
    t += Math.ceil(oran * carpan * L * (tipOf(b?.tip) === 'luks' ? LUKS_YEMEK : 1) - 1e-9);
  }
  return t;
}

// Kalite başına alınabilecek adet (Σ q' ≥ q arz); arz hiç bilinmiyorsa null (sınır yok)
function alinabilir(arzOf, id) {
  const a = Array.from({ length: MAX_KALITE + 1 }, (_, q) => (arzOf ? arzOf(id, q) : null));
  if (!a.some(fin)) return null;
  const out = new Array(MAX_KALITE + 1).fill(0);
  for (let q = MAX_KALITE, t = 0; q >= 0; q--) { t += fin(a[q]) && a[q] > 0 ? a[q] : 0; out[q] = t; }
  return out;
}

// k elemanlı alt kümeler (liste sırası korunur)
function altKumeler(list, k, bas = 0, acc = [], out = []) {
  if (acc.length === k) { out.push([...acc]); return out; }
  for (let i = bas; i <= list.length - (k - acc.length); i++) { acc.push(list[i]); altKumeler(list, k, i + 1, acc, out); acc.pop(); }
  return out;
}

/**
 * Menünün döngü malzeme gideri (binaların toplamı): enUcuzMenu'dan bağımsız bir hesap; sınamalar çözümü bununla doğrular.
 * @param {Array<{ id: number, kalite: number }>} menu  seçili ürünler
 * @param {{ binalar: Array<{ seviye: number, tip?: string }>, fiyatOf: (id, q) => number|null, arzOf?: (id, q) => number|null }} o
 * Dönüş: kalemler [{ id, kalite, adet, birim, tutar, arzYetersiz }], maliyet (fiyatı olmayan ürün varsa null), ortalama kalite,
 *   eksikFiyat ve arzYetersiz (ürün numaraları), eksikKategori (kategori adları)
 */
export function menuMaliyeti(menu, o) {
  const list = (menu || []).filter((m) => URUNLER[m?.id]);
  const say = kategoriSayilari(list.map((m) => m.id));
  const kalemler = list.map((m) => {
    const id = Number(m.id);
    const kalite = clamp(Math.floor(Number(m.kalite) || 0), 0, MAX_KALITE);
    const adet = toplamIhtiyac(URUNLER[id].oran, kategoriCarpani(say[URUNLER[id].kat]), o.binalar || []);
    const f = o.fiyatOf(id, kalite);
    const birim = fin(f) && f >= 0 ? f : null;
    const alin = alinabilir(o.arzOf, id);
    return { id, kalite, adet, birim, tutar: birim == null ? null : adet * birim, arzYetersiz: !!alin && adet > alin[kalite] };
  });
  const eksikFiyat = kalemler.filter((k) => k.birim == null).map((k) => k.id);
  return {
    kalemler, maliyet: eksikFiyat.length ? null : kalemler.reduce((s, k) => s + k.tutar, 0), ortalama: menuKalitesi(kalemler), eksikFiyat,
    arzYetersiz: kalemler.filter((k) => k.arzYetersiz).map((k) => k.id), eksikKategori: menuEksikleri(kalemler.map((k) => k.id)),
  };
}

/**
 * Ortalama kalitesi en az hedefKalite olan en ucuz menü. Fiyatı olmayan ya da arzı ihtiyaca yetmeyen kalite seçilmez.
 * @param {{ binalar: Array<{ seviye: number, tip?: string }>, fiyatOf: (id, q) => number|null, arzOf?: (id, q) => number|null,
 *           hedefKalite: number, urunler?: number[], kategoriAdet?: { salata?: number, ana?: number, icecek?: number } }} o
 *   urunler verilirse menü bu ürünlerden oluşur (hepsi kalır, yalnız kaliteler değişir). Yoksa ürünler de seçilir: kategoriAdet'te
 *   sayısı verilen kategoride tam o kadar, verilmeyende 1'den enFazla'ya (yoksa tümüne) kadar (oyun her kategoriden en az bir ürün ister).
 * Dönüş: { ok: true, secim: [{ id, kalite, adet, birim, tutar }], maliyet (döngü), ortalama } ya da { ok: false, neden, kategori? }
 */
export function enUcuzMenu(o) {
  const hedef = Number(o.hedefKalite);
  if (!fin(hedef)) return { ok: false, neden: 'hedef' };
  if (hedef > MAX_KALITE + 1e-9) return { ok: false, neden: 'ulasilamaz' };
  const sabit = Array.isArray(o.urunler) ? new Set(o.urunler.map(Number)) : null;
  // Birleşik tablo: anahtar ürün sayısı × 1000 + kalite toplamı → en ucuz { c, onceki, ekle }
  let tablo = new Map([[0, { c: 0, onceki: null, ekle: null }]]);
  for (const kat of KATEGORILER) {
    const aday = kat.urunler.filter((id) => !sabit || sabit.has(id));
    if (!aday.length) return { ok: false, neden: 'kategori', kategori: kat.ad };
    const istek = Number(o.kategoriAdet?.[kat.key]);
    const sayilar = sabit ? [aday.length] : istek > 0 ? [Math.min(Math.floor(istek), aday.length)] : aday.map((_, i) => i + 1).filter((k) => k <= (o.enFazla || Infinity));
    const alin = Object.fromEntries(aday.map((id) => [id, alinabilir(o.arzOf, id)]));
    const katTablo = new Map();
    for (const k of sayilar) {
      const carpan = kategoriCarpani(k);
      const sec = {};
      for (const id of aday) {
        const adet = toplamIhtiyac(URUNLER[id].oran, carpan, o.binalar || []);
        sec[id] = [];
        for (let q = 0; q <= MAX_KALITE; q++) {
          const birim = o.fiyatOf(id, q);
          if (!fin(birim) || birim < 0 || (alin[id] && adet > alin[id][q])) continue;
          sec[id].push({ id, kalite: q, adet, birim, tutar: adet * birim });
        }
      }
      for (const alt of altKumeler(aday, k)) {
        if (alt.some((id) => !sec[id].length)) continue;
        let dp = new Map([[0, { c: 0, secim: [] }]]);
        for (const id of alt) {
          const nx = new Map();
          for (const [s, e] of dp) for (const x of sec[id]) {
            const c = e.c + x.tutar;
            const cur = nx.get(s + x.kalite);
            if (!cur || c < cur.c - 1e-9) nx.set(s + x.kalite, { c, secim: [...e.secim, x] });
          }
          dp = nx;
        }
        for (const [s, e] of dp) {
          const cur = katTablo.get(k * 1000 + s);
          if (!cur || e.c < cur.c - 1e-9) katTablo.set(k * 1000 + s, e);
        }
      }
    }
    if (!katTablo.size) return { ok: false, neden: 'fiyat', kategori: kat.ad };
    const yeni = new Map();
    for (const [a, ea] of tablo) for (const [b, eb] of katTablo) {
      const c = ea.c + eb.c;
      const cur = yeni.get(a + b);
      if (!cur || c < cur.c - 1e-9) yeni.set(a + b, { c, onceki: ea, ekle: eb.secim });
    }
    tablo = yeni;
  }
  let en = null;
  let enOrt = -1;
  for (const [key, e] of tablo) {
    const n = Math.floor(key / 1000);
    const ort = (key % 1000) / n;
    if (ort < hedef - 1e-9) continue;
    // Eşit maliyette ortalaması yüksek olan (ratingi daha yüksek) seçilir
    if (!en || e.c < en.c - 1e-9 || (e.c <= en.c + 1e-9 && ort > enOrt)) { en = e; enOrt = ort; }
  }
  if (!en) return { ok: false, neden: 'ulasilamaz' };
  const secim = [];
  for (let e = en; e?.ekle; e = e.onceki) secim.unshift(...e.ekle);
  return { ok: true, secim, maliyet: en.c, ortalama: enOrt };
}

/**
 * Menü önerisi: hedefe göre en ucuz menü (mevcut menü gerekmez).
 * @param {{ binalar: Array<{ seviye: number, tip?: string }>, fiyatOf: (id, q) => number|null, arzOf?: (id, q) => number|null,
 *           hedef: 'guvenli'|'kalite', kalite?: number, bonus?: number, urunSayisi?: number }} o
 *   hedef guvenli: formülle (çeşitlilik ve oturma çarpanı dahil) rating ≥ RATING.guvenli + RATING_PAYI; kalite: ortalama menü kalitesi ≥ o.kalite.
 *   urunSayisi: her kategoride tam bu kadar ürün (2 oyunda doğrulanmış çarpan); 0 ya da yoksa 1–3 arasında en ucuzu seçilir (OTOMATIK_EN_FAZLA).
 * Dönüş: { durum: 'seviye' } | { durum: 'yok', neden, kategori?, hedefKalite } |
 *   { durum: 'ok', hedefKalite, secim: [{ id, kalite, adet, birim, tutar }], maliyet (döngü), ortalama, rating, cesit, carpan, sayilar }
 */
export const OTOMATIK_EN_FAZLA = 3; // otomatik seçimde kategori başına en çok ürün; 4 ve üstü önerilmez
function oneriMenuA(o) {
  if (!(o.binalar || []).some((b) => Number(b?.seviye) >= 1)) return { durum: 'seviye' };
  const bonus = Number(o.bonus) || 0;
  const carpan = oturmaCarpani(o.binalar.find((b) => Number(b?.seviye) >= 1)?.tip); // eko 1, lüks 1,25
  const n = Math.floor(Number(o.urunSayisi));
  const temel = { binalar: o.binalar, fiyatOf: o.fiyatOf, arzOf: o.arzOf };
  const sonuc = (c, hedefKalite) => ({ durum: 'ok', hedefKalite, secim: c.secim, maliyet: c.maliyet, ortalama: c.ortalama, sayilar: kategoriSayilari(c.secim.map((x) => x.id)) });
  let en = null;
  if (o.hedef === 'kalite') {
    // Hedef kalite olarak verilir; çeşitlilik yalnız gösterilen tahmini ratingi etkiler. Kategorilerin ürün sayısı serbest seçilebilir.
    const hedefKalite = clamp(Number(o.kalite) || 0, 0, MAX_KALITE);
    const c = enUcuzMenu({ ...temel, hedefKalite, ...(n > 0 ? { kategoriAdet: { salata: n, ana: n, icecek: n } } : { enFazla: OTOMATIK_EN_FAZLA }) });
    if (!c.ok) return { durum: 'yok', neden: c.neden, kategori: c.kategori, hedefKalite };
    en = sonuc(c, hedefKalite);
  } else {
    // Güvenli rating: gereken ortalama kalite, seçilen ürün sayılarının çeşitlilik puanına bağlıdır. Ürün sayısı desenleri (kategori başına 1–3)
    // tek tek denenir, her desenin kendi hedef kalitesiyle en ucuz menü bulunur; en ucuzu seçilir (eşitlikte ortalaması yüksek olan).
    const desenler = n > 0 ? [[n, n, n]] : [1, 2, 3].flatMap((a) => [1, 2, 3].flatMap((b) => [1, 2, 3].map((c) => [a, b, c])));
    const hedefRatingi = RATING.guvenli + RATING_PAYI;
    let yok = null;
    for (const [a, b, c3] of desenler) {
      const hedefKalite = Math.max(0, gerekenKalite(hedefRatingi / carpan - cesitRating({ salata: a, ana: b, icecek: c3 }), bonus));
      const c = enUcuzMenu({ ...temel, hedefKalite, kategoriAdet: { salata: a, ana: b, icecek: c3 } });
      if (!c.ok) { if (!yok || hedefKalite < yok.hedefKalite) yok = { durum: 'yok', neden: c.neden, kategori: c.kategori, hedefKalite }; continue; }
      if (!en || c.maliyet < en.maliyet - 1e-9 || (c.maliyet <= en.maliyet + 1e-9 && c.ortalama > en.ortalama)) en = sonuc(c, hedefKalite);
    }
    if (!en) return yok;
  }
  const cesit = cesitRating(en.sayilar);
  return { ...en, cesit, carpan, rating: (KALITE_TABAN + KALITE_RATING * en.ortalama + bonus + cesit) * carpan };
}

// ---------------------------------------------------------------------------------------------------------------
// Menü önerisi, model B (maliyet puanı): maliyet puanı hedefi sağlayan en ucuz menü
// ---------------------------------------------------------------------------------------------------------------
const PUAN_COZUNURLUK = 50; // ağırlıklı puan toplamı 1/50 adımla ayrıklaştırılır; aşağı yuvarlandığı için bulunan menü hedefi gerçekten sağlar

// Kategoride tam k ürünlük menüler: tablo.get(u) = { c: en düşük maliyet, secim } (u = ağırlıklı puan toplamı × çözünürlük, aşağı yuvarlanmış)
function kategoriTablosuB(kat, k, o) {
  const carpan = kategoriCarpani(k);
  const tablo = new Map();
  for (const alt of altKumeler(kat.urunler, k)) {
    const secenekler = alt.map((id) => {
      const adet = toplamIhtiyac(URUNLER[id].oran, carpan, o.binalar || []);
      const alin = alinabilir(o.arzOf, id);
      const ops = [];
      for (let q = 0; q <= MAX_KALITE; q++) {
        const birim = o.fiyatOf(id, q);
        if (!fin(birim) || birim < 0 || (alin && adet > alin[q])) continue;
        ops.push({ id, kalite: q, adet, birim, tutar: adet * birim, u: Math.floor(carpan * maliyetPuani(id, q) * PUAN_COZUNURLUK + 1e-9) });
      }
      return ops;
    });
    if (secenekler.some((x) => !x.length)) continue;
    let dp = new Map([[0, { c: 0, secim: [] }]]);
    for (const ops of secenekler) {
      const nx = new Map();
      for (const [s0, e] of dp) for (const x of ops) {
        const c = e.c + x.tutar;
        const cur = nx.get(s0 + x.u);
        if (!cur || c < cur.c - 1e-9) nx.set(s0 + x.u, { c, secim: [...e.secim, x] });
      }
      dp = nx;
    }
    for (const [s0, e] of dp) { const cur = tablo.get(s0); if (!cur || e.c < cur.c - 1e-9) tablo.set(s0, e); }
  }
  return tablo;
}
function birlestirB(A, B) {
  const out = new Map();
  for (const [a, ea] of A) for (const [b, eb] of B) {
    const c = ea.c + eb.c;
    const cur = out.get(a + b);
    if (!cur || c < cur.c - 1e-9) out.set(a + b, { c, l: ea, r: eb });
  }
  return out;
}
const duzlestir = (e) => (e.secim ? e.secim : [...duzlestir(e.l), ...duzlestir(e.r)]);

function oneriMenuB(o) {
  if (!(o.binalar || []).some((b) => Number(b?.seviye) >= 1)) return { durum: 'seviye' };
  const bonus = Number(o.bonus) || 0;
  const carpan = oturmaCarpani(o.binalar.find((b) => Number(b?.seviye) >= 1)?.tip);
  const n = Math.floor(Number(o.urunSayisi));
  const hedefR = clamp(o.hedef === 'rating' ? Number(o.rating) || 0 : RATING.guvenli + RATING_PAYI, 0, 10);
  const sayilar = n > 0 ? [n] : Array.from({ length: OTOMATIK_EN_FAZLA }, (_, i) => i + 1);
  const desenler = n > 0 ? [[n, n, n]] : sayilar.flatMap((a) => sayilar.flatMap((b) => sayilar.map((c) => [a, b, c])));
  const tablolar = KATEGORILER.map((kat) => Object.fromEntries(sayilar.map((k) => [k, kategoriTablosuB(kat, k, o)])));
  let en = null;
  let yok = null;
  for (const d of desenler) {
    const tb = d.map((k, i) => tablolar[i][k]);
    const bosKat = tb.findIndex((t) => !t.size);
    if (bosKat >= 0) { yok ||= { durum: 'yok', neden: 'fiyat', kategori: KATEGORILER[bosKat].ad }; continue; }
    const sayi = { salata: d[0], ana: d[1], icecek: d[2] };
    const cesit = cesitRating(sayi);
    const w = d.reduce((t, k) => t + k * kategoriCarpani(k), 0);
    const rhoH = rhoGerekli(hedefR, bonus, cesit, carpan);
    const jMin = Math.max(0, Math.ceil(rhoH * w * PUAN_COZUNURLUK - 1e-9));
    const birlesik = birlestirB(birlestirB(tb[0], tb[1]), tb[2]);
    let iyi = null;
    for (const [u, e] of birlesik) if (u >= jMin && (!iyi || e.c < iyi.c - 1e-9)) iyi = e;
    if (!iyi) { if (!yok || (yok.neden !== 'fiyat' && rhoH < yok.hedefPuan)) yok = { durum: 'yok', neden: 'ulasilamaz', hedefPuan: rhoH }; continue; }
    const secim = duzlestir(iyi);
    const rho = menuMaliyetPuani(secim);
    if (!en || iyi.c < en.maliyet - 1e-9 || (iyi.c <= en.maliyet + 1e-9 && rho > en.maliyetPuani)) {
      en = { durum: 'ok', hedefPuan: Math.max(0, rhoH), secim, maliyet: iyi.c, maliyetPuani: rho, sayilar: sayi, cesit };
    }
  }
  if (!en) return yok || { durum: 'yok', neden: 'ulasilamaz', hedefPuan: null };
  return { ...en, carpan, rating: (menuPuaniB(en.maliyetPuani) + bonus + en.cesit) * carpan, ortalama: menuKalitesi(en.secim) };
}

/**
 * Menü önerisi (model seçimli). o.model 'maliyet' (B, varsayılan değil: çağıran seçer) ya da 'kalite' (A).
 * B için hedef: 'guvenli' (rating ≥ RATING.guvenli + RATING_PAYI) ya da 'rating' (o.rating); A için 'guvenli' ya da 'kalite' (o.kalite).
 * B dönüşü: { durum: 'ok', hedefPuan, secim, maliyet, maliyetPuani, ortalama (kalite), rating, cesit, carpan, sayilar } ya da { durum: 'yok', neden, kategori?, hedefPuan }
 */
export function oneriMenu(o) {
  return o.model === 'maliyet' ? oneriMenuB(o) : oneriMenuA(o);
}

/**
 * Menü önerisinin günlük kâr hesabı. oneri: oneriMenu sonucu (durum 'ok'; rating lüks çarpanı dahil, maliyet döngü başına);
 * fiyat: menü fiyatı; evre: 0 Durgunluk, 1 Normal, 2 Büyüme; seviye ve tip önerinin bina bilgisi; saatlikMaas: seviye başına (yönetim dahil).
 * Dönen (tutarlar günlük): { rating, fiyat, evre, doluluk, veri, gelir, malzeme, maas, kar, basabas (%), enKarli: { fiyat, doluluk, kar } };
 * maaş bilinmiyorsa kar, basabas ve enKarli null. Seviye yoksa null.
 */
export function oneriKari({ oneri, fiyat, evre = EVRE_NORMAL, seviye, tip = 'eko', saatlikMaas = null }) {
  if (!oneri || oneri.durum !== 'ok') return null;
  const t = tipOf(tip);
  const L = Math.max(0, Math.floor(Number(seviye) || 0));
  const koltuk = KOLTUK[t] * L;
  if (!(koltuk > 0)) return null;
  const f = clamp(fin(Number(fiyat)) ? Number(fiyat) : FIYAT_MIN, FIYAT_MIN, FIYAT_MAX);
  const maas = donguMaasi(saatlikMaas, L, t);
  const gider = maas == null ? null : { koltuk, toplam: oneri.maliyet + maas };
  const doluluk = dolulukTahmini(oneri.rating, f, evre);
  const gelir = f * koltuk * (doluluk / 100);
  // Açık if: gizlenmiş kodda `enKarli && { ...enKarli, kar: enKarli.kar … }` enKarli boşken de nesneyi hesaplıyordu
  let enKarli = null;
  if (gider) {
    const iyi = enKarliFiyat(gider, oneri.rating, evre);
    if (iyi) enKarli = { fiyat: iyi.fiyat, doluluk: iyi.doluluk, kar: iyi.kar * GUN_DONGU };
  }
  return {
    rating: oneri.rating, fiyat: f, evre: evreOf(evre), doluluk, veri: dolulukVerisi(oneri.rating, f),
    gelir: gelir * GUN_DONGU, malzeme: oneri.maliyet * GUN_DONGU, maas: maas == null ? null : maas * GUN_DONGU,
    kar: gider ? (gelir - gider.toplam) * GUN_DONGU : null,
    basabas: gider ? (gider.toplam / (f * koltuk)) * 100 : null,
    enKarli,
  };
}
