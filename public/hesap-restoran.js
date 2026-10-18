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
export const DOLULUK = { ust: 96.5, alt: 56 };
export const ZAM_ESIGI_PUAN = (fiyat, doluluk = DOLULUK.ust) => doluluk / Math.max(1, fiyat); // $1 zammın kendini ödediği doluluk kaybı (puan)

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

// Bina ekranındaki saatlik maaştan eko restoranın seviye başı saatlik maaşı (lüks binadan girildiyse ×2)
export function seviyeBasiSaatlikMaas(binaSaatlik, binaSeviye, binaTip = 'eko') {
  const w = pos(binaSaatlik);
  const L = pos(binaSeviye);
  if (w == null || L == null) return null;
  return (w / L) / (tipOf(binaTip) === 'luks' ? LUKS_MAAS : 1);
}
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
// Hedef kâr için gereken fiyat (doluluk sabit)
export function gerekliFiyat(gider, dolulukPct, hedefKar = 0) {
  const k = gider.koltuk * (dolulukPct / 100);
  return k > 0 ? (gider.toplam + hedefKar) / k : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Döngü kayıtları
// ---------------------------------------------------------------------------------------------------------------

// Gelirden seviye: gelir = fiyat × koltuk × doluluk. Tam sayıya yakın değilse null (yanlış giriş işareti)
export function seviyeTahmini({ gelir, fiyat, doluluk, tip = 'eko' }) {
  if (!pos(gelir) || !pos(fiyat) || !pos(doluluk)) return null;
  const L = gelir / (fiyat * KOLTUK[tipOf(tip)] * (doluluk / 100));
  const yuvarlak = Math.round(L);
  return yuvarlak > 0 && Math.abs(L - yuvarlak) < 0.03 ? yuvarlak : null;
}

// Tek kaydın türetilmiş değerleri: gider, seviye başı gider, rating değişimi, döngü puanı tahmini
export function kayitAnalizi(k, restoran = {}) {
  const tip = tipOf(restoran.tip);
  const seviye = pos(restoran.seviye) ?? seviyeTahmini({ ...k, tip });
  const gider = fin(k.gelir) && fin(k.kar) ? k.gelir - k.kar : null;
  const delta = fin(k.ratingOnce) && fin(k.ratingSonra) ? k.ratingSonra - k.ratingOnce : null;
  const gelirSeviyesi = seviyeTahmini({ ...k, tip });
  return {
    seviye,
    seviyeUyusmaz: gelirSeviyesi != null && pos(restoran.seviye) != null && gelirSeviyesi !== restoran.seviye,
    gider,
    giderSeviye: gider != null && seviye ? gider / seviye : null,
    delta,
    // bu döngünün "yorum puanı": rating bu değere doğru k kadar yaklaştı
    puan: delta != null ? k.ratingOnce + delta / RATING.k : null,
  };
}

// Döngü bitiş saatine göre grup: sabah biten (gece döngüsü) ya da akşam biten (gündüz döngüsü). saat "07:27" biçiminde
export function donguDilimi(saat) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(saat || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  return h < 12 ? 'sabah' : 'aksam';
}
// Aynı döngüyü tanımlayan anahtar: tarih + saat (dakika farkı ±40 dk içinde aynı döngü sayılır)
export function donguAnahtari(k) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(k.saat || '').trim());
  if (!k.tarih || !m) return null;
  const dk = Number(m[1]) * 60 + Number(m[2]);
  return `${k.tarih}#${Math.round(dk / 80)}`;
}

const sirala = (a, b) => `${a.tarih || ''} ${(a.saat || '').padStart(5, '0')}`.localeCompare(`${b.tarih || ''} ${(b.saat || '').padStart(5, '0')}`);

// Hedef rating tahmini: her kayıtta T = r + Δ/k; ortalama ve belirsizlik (rating hedeften uzaktayken daha güvenilir)
export function hedefTahmini(kayitlar, k = RATING.k) {
  const t = kayitlar.map((x) => kayitAnalizi(x)).map((a) => a.puan).filter(fin);
  if (!t.length) return null;
  const ort = t.reduce((s, x) => s + x, 0) / t.length;
  const sapma = RATING.gurultu / k / Math.sqrt(t.length); // tek kaydın belirsizliği gürültü/k
  return { hedef: ort, belirsizlik: sapma, n: t.length };
}

// Rating yolu: n döngü boyunca beklenen değer (gürültüsüz)
export function ratingYolu(r0, hedef, n, { k = RATING.k, kapanis = false } = {}) {
  let r = Number(r0) || 0;
  if (kapanis) r *= KAPANIS_CARPANI;
  const out = [r];
  for (let i = 0; i < n; i++) { r += k * (hedef - r); out.push(r); }
  return out;
}
// Eşiğe kaç döngüde varılır (yukarı ya da aşağı); hiç varılmazsa null
export function esigeDongu(r0, hedef, esik = RATING.esik, { k = RATING.k, en = 200 } = {}) {
  let r = Number(r0) || 0;
  const yukari = r < esik;
  if (yukari ? hedef <= esik : hedef >= esik) return null;
  for (let i = 1; i <= en; i++) {
    r += k * (hedef - r);
    if (yukari ? r >= esik : r < esik) return i;
  }
  return null;
}
// Ratinge göre beklenen doluluk (iki rejimli basit model)
export const beklenenDoluluk = (rating) => (rating >= RATING.esik ? DOLULUK.ust : DOLULUK.alt);
// Kapanış (yükseltme) güvenli mi: kapanış sonrası rating güvenli eşiğin üstünde kalmalı
export const kapanisSonrasi = (r) => r * KAPANIS_CARPANI;
export const yukseltmeGuvenli = (r) => kapanisSonrasi(r) >= RATING.esik + 0.05;

/**
 * Restoranın son döngülerinden durum ve fiyat önerisi.
 * Çıktı: oneri = { yon: 'zam' | 'sabit' | 'indir' | 'bekle' | 'rating', adim }.
 */
export function restoranOzeti(kayitlar, { son = 4 } = {}) {
  const hepsi = [...kayitlar].filter((k) => fin(k.doluluk) && fin(k.fiyat)).sort(sirala);
  const sonlar = hepsi.slice(-son);
  const n = sonlar.length;
  if (!n) return { n: 0, oneri: { yon: 'bekle', adim: 0 } };
  const analiz = sonlar.map((k) => kayitAnalizi(k));
  const deltalar = analiz.map((a) => a.delta).filter(fin);
  const ortDelta = deltalar.length ? deltalar.reduce((s, x) => s + x, 0) / deltalar.length : null;
  const ortDoluluk = sonlar.reduce((s, k) => s + k.doluluk, 0) / n;
  const tamDolu = sonlar.filter((k) => k.doluluk >= 99.995).length;
  const sonKayit = sonlar[n - 1];
  const rating = fin(sonKayit.ratingSonra) ? sonKayit.ratingSonra : fin(sonKayit.ratingOnce) ? sonKayit.ratingOnce : null;
  const fiyat = sonKayit.fiyat;
  const hedef = hedefTahmini(hepsi.slice(-8));
  const ozet = { n, ortDoluluk, tamDolu, ortDelta, rating, fiyat, hedef };

  let oneri;
  if (n < 2) oneri = { yon: 'bekle', adim: 0 };
  else if (rating != null && rating < RATING.esik) {
    oneri = { yon: 'rating', adim: 0 };
  } else if (ortDelta != null && Math.abs(ortDelta) > 0.2) {
    oneri = { yon: 'bekle', adim: 0 };
  } else if (tamDolu >= Math.min(3, n) || ortDoluluk >= 99) {
    const adim = tamDolu === n && n >= 3 ? 2 : 1;
    oneri = { yon: 'zam', adim };
  } else if (ortDoluluk >= 95) {
    oneri = { yon: 'sabit', adim: 0 };
  } else {
    // Fiyat yakın zamanda arttıysa ve doluluk o zamandan beri $ başına 1,6 puandan fazla düştüyse geri dön
    const onceki = hepsi.slice(0, -n).filter((k) => k.fiyat < fiyat);
    const oncekiOrt = onceki.length ? onceki.slice(-son).reduce((s, k) => s + k.doluluk, 0) / Math.min(son, onceki.length) : null;
    const oncekiFiyat = onceki.length ? onceki[onceki.length - 1].fiyat : null;
    if (oncekiOrt != null && (oncekiOrt - ortDoluluk) > ZAM_ESIGI_PUAN(fiyat) * (fiyat - oncekiFiyat)) {
      oneri = { yon: 'indir', adim: fiyat - oncekiFiyat };
    } else if (ortDoluluk < 90 && n >= 3) {
      oneri = { yon: 'indir', adim: 1 };
    } else {
      oneri = { yon: 'sabit', adim: 0 };
    }
  }
  return { ...ozet, oneri };
}

// Aynı döngüde farklı fiyatlardaki restoranları kıyaslar: her kaydın doluluğundan o döngünün ortalaması çıkarılır,
// fiyat başına ortalama sapma hesaplanır. Rakiplerin ve pazarın o döngüdeki ortak etkisi böylece silinir.
export function ayniDonguKiyasi(kayitlar) {
  const gruplar = new Map();
  for (const k of kayitlar) {
    const a = donguAnahtari(k);
    if (!a || !fin(k.doluluk) || !fin(k.fiyat)) continue;
    if (!gruplar.has(a)) gruplar.set(a, []);
    gruplar.get(a).push(k);
  }
  const fiyatlar = new Map();
  let donguSayisi = 0;
  for (const g of gruplar.values()) {
    if (g.length < 2 || new Set(g.map((k) => k.fiyat)).size < 2) continue; // tek fiyatlı döngü fiyat hakkında bilgi vermez
    donguSayisi += 1;
    const ort = g.reduce((s, k) => s + k.doluluk, 0) / g.length;
    for (const k of g) {
      const f = fiyatlar.get(k.fiyat) || { fiyat: k.fiyat, n: 0, sapma: 0, doluluk: 0 };
      f.n += 1; f.sapma += k.doluluk - ort; f.doluluk += k.doluluk;
      fiyatlar.set(k.fiyat, f);
    }
  }
  const satirlar = [...fiyatlar.values()].map((f) => ({ fiyat: f.fiyat, n: f.n, sapma: f.sapma / f.n, doluluk: f.doluluk / f.n }))
    .sort((a, b) => a.fiyat - b.fiyat);
  return { donguSayisi, satirlar };
}

// Sabah/akşam biten döngülerin karşılaştırması
export function dilimKiyasi(kayitlar) {
  const out = { sabah: { n: 0, ort: null, tam: 0 }, aksam: { n: 0, ort: null, tam: 0 } };
  for (const d of ['sabah', 'aksam']) {
    const g = kayitlar.filter((k) => donguDilimi(k.saat) === d && fin(k.doluluk));
    out[d] = { n: g.length, ort: g.length ? g.reduce((s, k) => s + k.doluluk, 0) / g.length : null, tam: g.filter((k) => k.doluluk >= 99.995).length };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Yapıştırılan döngü satırlarını okuma
// ---------------------------------------------------------------------------------------------------------------
// Oyunun döngü kutusu (İngilizce ya da Türkçe), ör.:
//   6.46 (-0.17) 6.29 … 75.57% Occupancy $62 Menu price Revenue: $796,455 Profit: (-) $123,539
// Bir metinde birden çok döngü olabilir; her biri "rating (değişim) rating" ile başlar.
const SAYI = '\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?'; // düz metin: kod gizleyici etiketli şablonları bozabilir
const RATING_RE = /(\d{1,2}[.,]\d{2})\s*\(\s*([+\-−]?\s*\d{1,2}[.,]\d{2})\s*\)\s*(\d{1,2}[.,]\d{2})/g;

function sayiOku(s) {
  let t = String(s).trim().replace(/−/g, '-').replace(/\s/g, '');
  if (!t) return null;
  const virgul = (t.match(/,/g) || []).length;
  const nokta = (t.match(/\./g) || []).length;
  if (virgul && nokta) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (virgul > 1 || (virgul === 1 && /,\d{3}$/.test(t))) t = t.replace(/,/g, '');
  else if (virgul === 1) t = t.replace(',', '.');
  else if (nokta > 1 || (nokta === 1 && /\.\d{3}$/.test(t) && t.replace(/^-/, '').split('.')[0].length <= 3 && Number(t.split('.')[0]) >= 1)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function satirlariCoz(metin) {
  const s = String(metin || '');
  const basla = [...s.matchAll(RATING_RE)];
  const out = [];
  for (let i = 0; i < basla.length; i++) {
    const m = basla[i];
    const parca = s.slice(m.index + m[0].length, i + 1 < basla.length ? basla[i + 1].index : s.length);
    const ratingOnce = sayiOku(m[1]);
    const ratingSonra = sayiOku(m[3]);
    const doluluk = sayiOku((new RegExp(`(${SAYI})\\s*%`).exec(parca) || new RegExp(`%\\s*(${SAYI})`).exec(parca) || [])[1]);
    const fiyatM = new RegExp(`\\$\\s*(${SAYI})\\s*(?:Menu|Menü)`, 'i').exec(parca) || new RegExp(`(?:Menu price|Menü fiyatı)\\s*:?\\s*\\$?\\s*(${SAYI})`, 'i').exec(parca);
    const gelirM = new RegExp(`(?:Revenue|Gelir)\\s*:?\\s*\\$?\\s*(${SAYI})`, 'i').exec(parca);
    const karM = new RegExp(`(?:Profit|Kâr|Kar)\\s*:?\\s*(\\(\\s*[-\\u2212]\\s*\\)|[-\\u2212])?\\s*\\$?\\s*(${SAYI})`, 'i').exec(parca);
    const kayit = {
      ratingOnce, ratingSonra, onceSaat: onceSaatOku(parca),
      doluluk, fiyat: fiyatM ? sayiOku(fiyatM[1]) : null,
      gelir: gelirM ? sayiOku(gelirM[1]) : null,
      kar: karM ? (karM[1] ? -1 : 1) * sayiOku(karM[2]) : null,
    };
    if (kayit.doluluk == null && kayit.gelir == null) continue; // "collecting…" satırı: döngü henüz bitmedi
    out.push(kayit);
  }
  return out;
}

// Döngü kutusundaki "about 3 hours ago", "a day ago", "2 days ago" (ya da Türkçesi) → kaç saat önce bittiği (yaklaşık)
export function onceSaatOku(metin) {
  const s = String(metin || '').toLowerCase();
  let m = /(\d+)\s*(?:hours?|saat)\s*(?:ago|önce)/.exec(s);
  if (m) return Number(m[1]);
  if (/\b(?:an|one|bir)\s*(?:hour|saat)\s*(?:ago|önce)/.exec(s)) return 1;
  m = /(\d+)\s*(?:days?|gün)\s*(?:ago|önce)/.exec(s);
  if (m) return Number(m[1]) * 24;
  if (/\b(?:a|one|bir)\s*(?:day|gün)\s*(?:ago|önce)/.exec(s)) return 24;
  if (/(?:minutes?|dakika)\s*(?:ago|önce)/.exec(s)) return 0;
  return null;
}
