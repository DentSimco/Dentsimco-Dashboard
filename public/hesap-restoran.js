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
//     2 ürün 1 [oyun]; 1 ürün 2,1, 3 ürün 0,7, 4 ve üstü 0,55 [hipotez]; lüks yemek ve maaş ×0,5 [oyun]
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

// Kategori çarpanı: kategoride seçili ürün sayısı → ürün başına ihtiyaç çarpanı (4 ve üstü 0,55)
export const KATEGORI_CARPANI = { 1: 2.1, 2: 1, 3: 0.7, 4: 0.55 };
export const CARPAN_DOGRULANDI = { 1: false, 2: true, 3: false, 4: false };
export const kategoriCarpani = (n) => (n >= 4 ? KATEGORI_CARPANI[4] : KATEGORI_CARPANI[n] ?? 0);

export const KATEGORILER = [
  { key: 'salata', ad: 'Salata barı', urunler: [117, 121, 134, 122, 119, 123] },
  { key: 'ana', ad: 'Ana yemek', urunler: [129, 130, 131, 142, 143, 149] },
  { key: 'icecek', ad: 'İçecek', urunler: [132, 124, 125, 126] },
];

// oran = seviye başına döngü başına temel ihtiyaç (Times, 6 Ocak 2022). Bal kabağı tabloda yok: oyunun ürün katsayısı
// (consumption 0,22372) × ana yemeklerin ortak katsayısı (44,45) ile tahmin edildi.
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
  149: { ad: 'Bal kabağı çorbası', kat: 'ana', oran: 9.944, tahmini: true },
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
 *   hedef guvenli: eko formülüyle rating ≥ RATING.guvenli + RATING_PAYI; kalite: ortalama menü kalitesi ≥ o.kalite.
 *   urunSayisi: her kategoride tam bu kadar ürün (2 oyunda doğrulanmış çarpan); 0 ya da yoksa 1–3 arasında en ucuzu seçilir (OTOMATIK_EN_FAZLA).
 * Dönüş: { durum: 'seviye' } | { durum: 'yok', neden, kategori?, hedefKalite } |
 *   { durum: 'ok', hedefKalite, secim: [{ id, kalite, adet, birim, tutar }], maliyet (döngü), ortalama, rating, sayilar }
 */
export const OTOMATIK_EN_FAZLA = 3; // otomatik seçimde kategori başına en çok ürün; 4 ve üstü önerilmez
export function oneriMenu(o) {
  if (!(o.binalar || []).some((b) => Number(b?.seviye) >= 1)) return { durum: 'seviye' };
  const hedefKalite = o.hedef === 'kalite' ? clamp(Number(o.kalite) || 0, 0, MAX_KALITE)
    : Math.max(0, gerekenKalite(RATING.guvenli + RATING_PAYI, o.bonus));
  const n = Math.floor(Number(o.urunSayisi));
  const c = enUcuzMenu({ binalar: o.binalar, fiyatOf: o.fiyatOf, arzOf: o.arzOf, hedefKalite,
    ...(n > 0 ? { kategoriAdet: { salata: n, ana: n, icecek: n } } : { enFazla: OTOMATIK_EN_FAZLA }) });
  if (!c.ok) return { durum: 'yok', neden: c.neden, kategori: c.kategori, hedefKalite };
  return { durum: 'ok', hedefKalite, secim: c.secim, maliyet: c.maliyet, ortalama: c.ortalama,
    rating: KALITE_TABAN + KALITE_RATING * c.ortalama + (Number(o.bonus) || 0), sayilar: kategoriSayilari(c.secim.map((x) => x.id)) };
}
