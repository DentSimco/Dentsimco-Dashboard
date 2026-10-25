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
//   Maaş = binanın saatlik maaşı × 12 [oyun]
//   Restoran kapanınca rating ×0,875 (kapanış başına bir kez; yükseltme de kapanıştır) [oyun]
//   Rating her döngü hedefine doğru yaklaşır: r' = r + k·(T − r), k ≈ 0,177, gürültü ±0,21 [ölçüm]
//   Doluluk: rating ~4,5 altında çöker (%40–70), üstünde fiyat ($60–64) ve ratingden bağımsız ~%96,5 [ölçüm]
//   Menü fiyatı en az $60, en çok $350 [oyun rehberi]

export const DONGU_SAAT = 12;
export const ORTALAMA_MAAS = 345; // yedek: veri okunamazsa (meta/core AVERAGE_SALARY)
export const RESTORAN_MAAS_KATSAYISI = 1.7; // yedek: veri okunamazsa (meta/buildings, restoran)
export const FIYAT_MIN = 60;
export const FIYAT_MAX = 350;
export const KOLTUK = { eko: 1000, luks: 500 }; // seviye başına
export const LUKS_YEMEK = 0.5;
export const LUKS_MAAS = 0.5;
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

// Rating ve doluluk modeli [ölçüm]: veri büyüdükçe bu sabitler güncellenir
export const RATING = { k: 0.177, hedef: 6.0, gurultu: 0.21, esik: 4.5, guvenli: 5.2 };
export const DOLULUK = { ust: 96.5 };
// Düşük ratingte doluluk [ölçüm]: rating ~0'da rastgele (%3–27, ortalama ~%13), 3,9–4,6 arasında hızla yükselir, 4,6'dan sonra ~%96,5.
export const DOLULUK_EGRI = [[0, 13], [3.9, 38], [3.95, 40.6], [4.11, 56], [4.25, 69], [4.61, DOLULUK.ust]];
export function dolulukRating(r) {
  const x = Number(r);
  if (!fin(x) || x <= 0) return DOLULUK_EGRI[0][1];
  for (let i = 1; i < DOLULUK_EGRI.length; i++) {
    const [a, b] = [DOLULUK_EGRI[i - 1], DOLULUK_EGRI[i]];
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return DOLULUK.ust;
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

export function donguMaasi(seviyeBasiSaatlik, seviye, tip = 'eko') {
  const w = pos(seviyeBasiSaatlik);
  if (w == null) return null;
  return w * DONGU_SAAT * Math.max(0, Number(seviye) || 0) * (tipOf(tip) === 'luks' ? LUKS_MAAS : 1);
}

/**
 * Bir restoranın döngü gideri, oyunun "Menu price" hesap makinesiyle aynı düzende.
 * @param {{ menu: Array<{ id: number, birim: number|null }>, seviye: number, tip?: 'eko'|'luks', saatlikMaas?: number|null, fiyat?: number }} o
 *   menu[].birim: ürünün birim maliyeti (sourcing cost ÷ adet). saatlikMaas: eko seviye başı saatlik maaş.
 */
export function donguGideri({ menu = [], seviye, tip = 'eko', saatlikMaas = null, fiyat = FIYAT_MIN }) {
  const t = tipOf(tip);
  const L = Math.max(0, Math.floor(Number(seviye) || 0));
  const ids = menu.map((m) => Number(m.id)).filter((id) => URUNLER[id]);
  const adet = ihtiyac(ids, L, t);
  const kalemler = menu.filter((m) => URUNLER[m.id]).map((m) => {
    const birim = fin(m.birim) && m.birim >= 0 ? m.birim : null;
    return { id: Number(m.id), adet: adet[m.id], birim, tutar: birim == null ? null : adet[m.id] * birim };
  });
  const malzeme = kalemler.reduce((s, k) => s + (k.tutar ?? 0), 0);
  const maas = donguMaasi(saatlikMaas, L, t);
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
 *  3) eko: varsayılan hedef, bonus farkıyla kaydırılır; lüks: veri yok, mevcut rating değişmez varsayılır.
 */
// Eko hedef rating = KALITE_TABAN + KALITE_RATING × ortalama menü kalitesi + bonus.
// Üç ölçümden: 11 Ekim menüsü (ort. Q7,5, bonus 0,99 → ~6,0), 20 Ekim (aynı menü, bonus 1,09 → ~6,4) ve seviye 2 testi
// (ort. Q0,5, bonus 0,32 → ~3,6). Belirsizlik: taban ±1,2, eğim ±0,15.
export const KALITE_TABAN = 3.33;
export const KALITE_RATING = 0.23;
export const REFERANS_KALITE = 7.5; // menü kalitesi bilinmiyorsa
// Seçili ürünlerin ortalama kalitesi; kalite bilgisi yoksa null
export function menuKalitesi(menu) {
  const q = (menu || []).map((m) => Number(m?.kalite)).filter((x) => fin(x));
  return q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
}

export function hedefRating(item, bonus = BONUS_REFERANS, kalite = REFERANS_KALITE) {
  const elle = pos(Number(item?.hedef));
  if (elle != null) return { deger: clamp(elle, 0, 10), kaynak: 'girilen' };
  const once = Number(item?.onceki);
  const simdi = Number(item?.rating);
  if (fin(once) && fin(simdi) && item?.onceki !== '' && item?.onceki != null) return { deger: clamp(once + (simdi - once) / RATING.k, 0, 10), kaynak: 'tahmin' };
  if (tipOf(item?.tip) === 'luks') return { deger: fin(simdi) ? simdi : RATING.hedef, kaynak: 'bilinmiyor' };
  return { deger: clamp(KALITE_TABAN + KALITE_RATING * (fin(kalite) ? kalite : REFERANS_KALITE) + bonus, 0, 10), kaynak: 'varsayilan' };
}

/** Rating yerleşince beklenen doluluk (%). Eşiğin üstünde son doluluk korunur; altında düşük doluluk. */
export function beklenenDoluluk(beklenenRating, mevcutRating, sonDoluluk) {
  const son = fin(Number(sonDoluluk)) && sonDoluluk !== '' && sonDoluluk != null ? clamp(Number(sonDoluluk), 0, 100) : null;
  if (beklenenRating < RATING.esik) return son != null && mevcutRating < RATING.esik ? son : dolulukRating(beklenenRating);
  if (mevcutRating >= RATING.esik) return son ?? DOLULUK.ust;
  return DOLULUK.ust;
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
    const g = donguGideri({ menu, seviye: L, tip, saatlikMaas: saatlik, fiyat });
    const kalite = menuKalitesi(menu);
    const hedef = hedefRating(it, ctx.ratingBonus, kalite ?? REFERANS_KALITE);
    const simdiR = fin(Number(it.rating)) && it.rating !== '' && it.rating != null ? Number(it.rating) : hedef.deger;
    const sonD = fin(Number(it.doluluk)) && it.doluluk !== '' && it.doluluk != null ? clamp(Number(it.doluluk), 0, 100) : null;
    // Borsada fiyatı olmayan ürün ya da eksik kategori varsa maliyet bilinmez: kâr hesaplanmaz (null), elle fiyat girilmesi istenir
    const eksik = !!g.eksikFiyat || g.eksikKategori.length > 0;
    const senaryo = (rating, doluluk) => {
      const gelirDong = fiyat * g.koltuk * (doluluk / 100);
      return { rating, doluluk, customersDay: g.koltuk * (doluluk / 100) * GUN_DONGU, revenueDay: gelirDong * GUN_DONGU, profitDay: eksik ? null : (gelirDong - g.toplam) * GUN_DONGU };
    };
    const simdi = senaryo(simdiR, sonD ?? beklenenDoluluk(simdiR, simdiR, null));
    const beklenen = senaryo(hedef.deger, beklenenDoluluk(hedef.deger, simdiR, sonD));
    const secili = ctx.mod === 'simdi' ? simdi : beklenen;
    const costDay = g.malzeme * GUN_DONGU;
    const wagesDay = (g.maas ?? 0) * GUN_DONGU;
    const baseWagesDay = taban * 24 * L * (tip === 'luks' ? LUKS_MAAS : 1);
    rows.push({ id: it.id, ad: it.ad, tip, seviye: L, fiyat, gider: g, eksik, kalite, hedef, simdi, beklenen, secili, costDay, wagesDay, baseWagesDay,
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
