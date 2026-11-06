// DentSimco — Restoran › Analiz › Isı Haritası hesap motoru
//
// Arayüzsüz, saf fonksiyonlar: tarayıcıda ve Node'da aynen çalışır (DOM, ağ ve Firestore yok). Arayüz restoran-isi.js,
// veri araclar/restoran-isi.mjs'in ürettiği restoran-isi-donem.js, sınamalar test/restoran_isi_test.mjs.
//
// Bir hücrenin (rating dilimi × menü fiyatı dilimi) seviye başına döngü kârı:
//   kâr = fiyat × koltuk × doluluk − malzeme − maaş                                  (12 saatlik döngü, 1 seviye)
//   doluluk   oyunun gazetesindeki restoran ısı haritası: seçilen sayılarda toplam doluluk ÷ döngü sayısı [oyun verisi]
//   fiyat     dilimin oyundaki değeri. Gazete menü fiyatını $30'un en yakın katına yuvarlar: $60 = $60–74, $90 = $75–104 …
//             $330 = $315–344, $360 = $345–350 (en yüksek fiyat $350). Kanıt: $360 dilimi var; $60–65 döngüleri $60, $75–80
//             döngüleri $90 diliminin doluluğunu veriyor (Ekim–Kasım 2026, 70 döngü; alt sınır varsayımı ortalama 15,5, bu 9,6
//             puan hata). Gelirde dilim değeri kullanılır; $60 ve $360 dilimleri $60 ve $350'ye sabitlenir (döngülerin çoğu
//             en düşük ve en yüksek fiyattadır)                                                             [gözlem]
//   koltuk    eko 1.000, lüks 500 (hesap-restoran.js KOLTUK)                                            [oyun]
//   malzeme   hücrenin rating dilimine ulaşan EN UCUZ menü: her ürünün kalitesi ayrı seçilir (restoran-menusec.js ile aynı arama),
//             fiyatlar SimcoTools günlük VWAP'ının o sayının dönemindeki hacim ağırlıklı ortalaması [ölçüm]
//   maaş      hesap-restoran.js donguMaasi: saatlikMaasSeviye (bina katsayısı × ortalama maaş × (1 + yönetim gideri)) × 12 saat,
//             lüks ×0,5, profesyonel çalışan ×5. Yönetim gideri ve rating bonusu şirketten (Yönetim, Kurulum, Perakende) gelir.
//
// Rating bonusu menünün puanına doğrudan eklendiği için maliyet eğrisi bonusa göre kayar: eko'da hedef − b, lüks'te hedef − 1,25·b
// ile aynı menü seçilir (rating = (puan ortalaması × çeşit + b) × oturma). Bu yüzden eğri bonussuz bir kez hesaplanır.
//
// Rating 10 dilimi: rating hedefe asimptotik yaklaştığından bu dilime ancak hedef 10'un üstündeyken girilir; dilim merkezi 10,25 alınır.

import * as R from './hesap-restoran.js';
import { kategoriTablosu, gerekliPuan } from './restoran-menusec.js';
import { menuRatingi, kalitePuani } from './restoran-rating.js';

export const FIYAT_DILIMLERI = [60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360]; // oyunun dilim değeri: fiyat $30'un en yakın katına yuvarlanır
export const DILIM_GENISLIK = 30;
export const RATING_DILIMLERI = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const EGRI_ADIM = 0.005; // maliyet eğrisinin hedef rating ızgarası
export const EGRI_SON = 2100; // son ızgara dizini: hedef 10,5
export const SEVIYE = 100; // yemek adetinin yukarı yuvarlaması etkisizleşsin diye menü 100 seviyede hesaplanıp seviyeye bölünür
export const MIN_KOSU = 100; // hücre bu kadar döngüden azsa "zayıf veri" (çizgili), kâr yorumuna girmez
export const MIN_GOSTER = 15; // oyun da 15 ve altı döngülü hücreyi göstermez
export const LIKIT_GUN = 0.6; // kalite, dönem günlerinin en az bu kadarında işlem görmeliydi
export const LIKIT_HACIM = 20; // ... ve günlük hacmi 10 seviyelik restoranın günlük ihtiyacı (oran × 10 × 2) kadar olmalıydı

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const ratingMerkez = (r) => (r < 10 ? r + 0.5 : 10.25);
const fiyatSiniri = (p) => Math.min(R.FIYAT_MAX, Math.max(R.FIYAT_MIN, p));
/** Dilimin gelirde kullanılan fiyatı: dilim değeri, $60–350 arasına sınırlı ($360 dilimi → $350). */
export const fiyatMerkez = (pi) => fiyatSiniri(FIYAT_DILIMLERI[pi]);
/** Dilimin kapsadığı fiyatlar [alt, üst]: $90 → [75, 104]; $60 → [60, 74]; $360 → [345, 350]. */
export const dilimAraligi = (pi) => [fiyatSiniri(FIYAT_DILIMLERI[pi] - DILIM_GENISLIK / 2), fiyatSiniri(FIYAT_DILIMLERI[pi] + DILIM_GENISLIK / 2 - 1)];
/** Dilim etiketi: dilimMetni "75–104", dilimAdi "$75–104". */
export const dilimMetni = (pi) => dilimAraligi(pi).join('–');
export const dilimAdi = (pi) => `$${dilimMetni(pi)}`;
/** Menü fiyatının düştüğü dilimin dizini (oyunun yuvarlaması; tam yarıda yukarı: $75 → $90 dilimi). */
export const fiyatDilimi = (fiyat) => Math.max(0, Math.min(FIYAT_DILIMLERI.length - 1, Math.round(fiyat / DILIM_GENISLIK) - FIYAT_DILIMLERI[0] / DILIM_GENISLIK));

// ---------------------------------------------------------------------------------------------------------------
// Dönem fiyatları ve maliyet eğrisi
// ---------------------------------------------------------------------------------------------------------------

/**
 * Dönemin borsa fiyatı: marketOf(id, kalite) → birim fiyat ya da null (likit değil / işlem yok).
 * donem.fiyat[id][q] = [vwap, işlemGünü, hacim] | 0; donem.gun dönemin gün sayısı.
 */
export function marketOfDonem(donem, { likidite = true } = {}) {
  return (id, q) => {
    const x = donem.fiyat?.[id]?.[q];
    if (!Array.isArray(x) || !(x[0] > 0)) return null;
    if (likidite) {
      const oran = R.URUNLER[id]?.oran || 0;
      if (x[1] < LIKIT_GUN * donem.gun || x[2] / donem.gun < oran * LIKIT_HACIM) return null;
    }
    return x[0];
  };
}

// puan ≥ s için en ucuz seçim (sonek minimumu); kategori tablosu: Map(puan → { toplam, urunler })
function sonek(map) {
  let mx = -1;
  for (const s of map.keys()) mx = Math.max(mx, s);
  const a = new Array(mx + 2).fill(null);
  for (let s = mx; s >= 0; s--) { const o = map.get(s); a[s] = o && (!a[s + 1] || o.toplam < a[s + 1].toplam - 1e-9) ? o : a[s + 1]; }
  return a;
}
// A ve B kategorilerinin birleşimi: puan ≥ s için en ucuz (A[s1] + B[s − s1])
function birlestir(A, B) {
  const n = A.length - 1 + B.length - 1;
  const best = new Array(n + 1).fill(Infinity);
  const arg = new Int32Array(n + 1).fill(-1);
  for (let s1 = 0; s1 < A.length; s1++) {
    const a = A[s1]; if (!a) continue;
    for (let s2 = 0; s2 < B.length; s2++) {
      const b = B[s2]; if (!b) continue;
      const t = a.toplam + b.toplam, s = s1 + s2;
      if (t < best[s]) { best[s] = t; arg[s] = s1; }
    }
  }
  for (let s = n - 1; s >= 0; s--) if (best[s + 1] < best[s]) { best[s] = best[s + 1]; arg[s] = -(s + 3); } // sonek: s+1'in seçimi
  return { best, arg, A, B };
}
function geriAl(ab, s) {
  while (ab.arg[s] < -1) s = -ab.arg[s] - 2;
  const s1 = ab.arg[s];
  if (s1 < 0) return null;
  return [ab.A[s1], ab.B[Math.max(0, Math.min(ab.B.length - 1, s - s1))]];
}

/** Dönem ve oturma için menü cephesi: her kategori ve çeşit sayısı için "puan ≥ s" en ucuz seçimi. */
export function menuCephesi(donem, tip, opt = {}) {
  const marketOf = marketOfDonem(donem, opt);
  const tab = {};
  for (const k of R.KATEGORILER) {
    tab[k.key] = {};
    for (let n = 1; n <= k.urunler.length; n++) {
      const m = kategoriTablosu(marketOf, k.key, n, { seviye: SEVIYE, tip });
      if (m.size) tab[k.key][n] = sonek(m);
    }
  }
  const AB = {};
  for (const a of Object.keys(tab.salata)) for (const b of Object.keys(tab.ana)) AB[`${a}-${b}`] = birlestir(tab.salata[a], tab.ana[b]);
  return { tip, tab, AB };
}

/**
 * Cepheden hedef ratinge ulaşan en ucuz menü; bonus rating'e doğrudan eklenir.
 * Dönen: { maliyet (seviye başına, döngü), cesit '5-2-2', urunSayisi, urunler: [{ id, q, tutar, birim }], puanOrt, rating } | null
 */
export function enUcuzMenu(cephe, hedef, bonus = 0) {
  let best = null;
  for (const [key, ab] of Object.entries(cephe.AB)) {
    const [a, b] = key.split('-').map(Number);
    for (const [cs, C] of Object.entries(cephe.tab.icecek)) {
      const N = a + b + Number(cs);
      const S = gerekliPuan(N, { hedef, bonus, tip: cephe.tip });
      for (let s3 = 0; s3 < C.length; s3++) {
        const z = C[s3]; if (!z) continue;
        const need = Math.max(0, S - s3);
        if (need >= ab.best.length) continue;
        const t = ab.best[need] + z.toplam;
        if (!Number.isFinite(t)) continue;
        if (!best || t < best.t - 1e-9) best = { t, key, c: Number(cs), need, N, C: z };
      }
    }
  }
  if (!best) return null;
  const par = geriAl(cephe.AB[best.key], best.need);
  if (!par) return null;
  const urunler = [...par[0].urunler, ...par[1].urunler, ...best.C.urunler];
  const puanOrt = urunler.reduce((s, u) => s + u.puan, 0) / urunler.length;
  return {
    maliyet: best.t / SEVIYE, cesit: `${par[0].urunler.length}-${par[1].urunler.length}-${best.C.urunler.length}`, urunSayisi: urunler.length,
    urunler: urunler.map((u) => ({ id: u.id, q: u.q, tutar: u.tutar / SEVIYE, birim: u.birim })),
    puanOrt, rating: menuRatingi({ puanOrt, urunSayisi: urunler.length, bonus, tip: cephe.tip }),
  };
}

/**
 * Bonussuz maliyet eğrisi: hedef rating 0,0 … 10,5 (EGRI_ADIM = 0,005 ızgara) için seviye başına döngü malzeme maliyeti ($, tam sayı) ya da null
 * (ulaşılamaz). Maliyet basamaklı arttığından yalnız değiştiği noktalar saklanır: [[ızgara dizini, maliyet | null], ...], dizinler artan, ilki 0.
 */
export function maliyetEgrisi(donem, tip, cephe = menuCephesi(donem, tip)) {
  const out = [];
  let onceki;
  for (let i = 0; i <= EGRI_SON; i++) {
    const m = enUcuzMenu(cephe, i * EGRI_ADIM, 0), c = m ? Math.round(m.maliyet) : null;
    if (i === 0 || c !== onceki) { out.push([i, c]); onceki = c; }
  }
  return out;
}

/** Eğrinin ızgara dizinindeki değeri (en son değişiklik); dizin eğrinin ötesindeyse null. */
export function egriDegeri(egri, i) {
  if (!Array.isArray(egri) || !egri.length || !(i <= EGRI_SON)) return null;
  let lo = 0, hi = egri.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (egri[m][0] <= i) lo = m; else hi = m - 1; }
  const c = egri[lo][1];
  return fin(c) ? c : null;
}

// Eğri dizini: rating bonusu eko'da hedefi b, lüks'te 1,25·b kadar düşürür (menu rating = (puan × çeşit + b) × oturma). Yukarı yuvarlanır:
// maliyet hedefe ulaşan menüden ucuz çıkmaz (en çok bir ızgara adımı = 0,005 rating kadar, birkaç yüz $ üstten sapar).
export function egriDizini(tip, bonus, hedef) {
  const kayma = (Number(bonus) || 0) * (tip === 'luks' ? 1 / 0.8 : 1);
  return Math.max(0, Math.ceil((hedef - kayma) / EGRI_ADIM - 1e-9));
}

// Menü cephesi önbelleği (dönem × oturma): menü ayrıntısı için; maliyet eğrisi hazır veriden gelir
const CEPHE_ONBELLEK = new Map();
export function cepheOnbellek(donem, tip) {
  const k = `${donem.sayi}|${tip}`;
  if (!CEPHE_ONBELLEK.has(k)) CEPHE_ONBELLEK.set(k, menuCephesi(donem, tip));
  return CEPHE_ONBELLEK.get(k);
}
/** Seçili hücrenin en ucuz menüsü (bir dönemin fiyatlarıyla). */
export function menuDetayi(donem, tip, bonus, hedef) {
  return enUcuzMenu(cepheOnbellek(donem, tip), hedef, bonus);
}

// ---------------------------------------------------------------------------------------------------------------
// Seçilen sayıların birleşik görünümü
// ---------------------------------------------------------------------------------------------------------------

/**
 * Seçilen dönemlerin görünümü: hucre[fiyat dilimi][rating dilimi] = [döngü, ortalama doluluk (0–1) | null] (döngü ağırlıklı),
 * evre (gün ağırlıklı [resesyon, normal, boom] payları), son (en yeni seçilen dönem; menü ayrıntısı onun fiyatlarıyla).
 */
export function gorunum(donemler) {
  const t = FIYAT_DILIMLERI.map(() => RATING_DILIMLERI.map(() => [0, 0]));
  const evre = [0, 0, 0];
  let gun = 0;
  for (const d of donemler) {
    for (const [r, pi, n, s] of d.h) { if (t[pi] && t[pi][r]) { t[pi][r][0] += n; t[pi][r][1] += s; } }
    gun += d.gun;
    for (let k = 0; k < 3; k++) evre[k] += d.evre[k] * d.gun;
  }
  return {
    donemler, gun,
    son: donemler[donemler.length - 1] || null,
    evre: gun ? evre.map((x) => x / gun) : [0, 1, 0],
    hucre: t.map((row) => row.map((c) => [c[0], c[0] ? c[1] / c[0] : null])),
  };
}

/** Seçili dönemlerin ortalama malzeme maliyeti (seviye başına döngü) ya da null (dönemlerden birinde ulaşılamıyor). */
export function malzeme(gor, tip, bonus, hedef) {
  const i = egriDizini(tip, bonus, hedef);
  let s = 0;
  for (const d of gor.donemler) {
    const c = egriDegeri(d.egri[tip], i);
    if (!fin(c)) return null;
    s += c;
  }
  return gor.donemler.length ? s / gor.donemler.length : null;
}

/** Eko ya da lüks seviyenin döngü maaşı: şirketin yönetim gideri ve çalışan kalitesiyle (hesap-restoran.js ile aynı fonksiyonlar). */
export function maasSeviye(tip, { adminNet = 0, averageSalary, salaryModifier, profesyonel = false } = {}) {
  return R.donguMaasi(R.saatlikMaasSeviye({ salaryModifier, averageSalary, adminNet }), 1, tip, profesyonel);
}

/**
 * Hücrenin seviye başına döngü kârı ve parçaları ya da null (veri yok / menüyle ulaşılamıyor).
 * o: { bonus, maas }  (maas: maasSeviye sonucu)
 */
export function hucreKari(gor, tip, pi, r, o) {
  const [n, occ] = gor.hucre[pi][r];
  if (occ == null || n < MIN_GOSTER) return null;
  const C = malzeme(gor, tip, o.bonus || 0, ratingMerkez(r));
  if (C == null) return null;
  const gelir = fiyatMerkez(pi) * R.KOLTUK[tip] * occ;
  return { kar: gelir - C - o.maas, gelir, malzeme: C, maas: o.maas, doluluk: occ, kosu: n, fiyat: fiyatMerkez(pi), basabas: (C + o.maas) / (fiyatMerkez(pi) * R.KOLTUK[tip]) };
}

/** En kârlı güvenilir (≥ MIN_KOSU döngü) hücre: { pi, r, kar, ... } ya da null. */
export function enKarliHucre(gor, tip, o) {
  let best = null;
  for (let pi = 0; pi < FIYAT_DILIMLERI.length; pi++) for (const r of RATING_DILIMLERI) {
    if (gor.hucre[pi][r][0] < MIN_KOSU) continue;
    const h = hucreKari(gor, tip, pi, r, o);
    if (h && (!best || h.kar > best.kar)) best = { pi, r, ...h };
  }
  return best;
}

/** Rating diliminde koltuk başına geliri en yüksek fiyat dilimi (maliyetten bağımsız) ya da null. */
export function enIyiFiyat(gor, r) {
  let best = null;
  for (let pi = 0; pi < FIYAT_DILIMLERI.length; pi++) {
    const [n, occ] = gor.hucre[pi][r];
    if (n < MIN_KOSU || occ == null) continue;
    const v = fiyatMerkez(pi) * occ;
    if (!best || v > best.koltukGeliri) best = { pi, koltukGeliri: v, doluluk: occ, kosu: n };
  }
  return best;
}

/** Rating dilimi başına en iyi fiyat ve kâr (tablo satırları; R0…R10). */
export function ratingTablosu(gor, tip, o) {
  return RATING_DILIMLERI.map((r) => {
    const f = enIyiFiyat(gor, r);
    if (!f) return { r, fiyat: null };
    const h = hucreKari(gor, tip, f.pi, r, o);
    return { r, fiyat: f, pi: f.pi, doluluk: f.doluluk, malzeme: h ? h.malzeme : null, kar: h ? h.kar : null };
  });
}

/** Restoran kartındaki fiyat ve rating'in düştüğü hücre: { pi, r } ya da null. */
export function hucreOf(fiyat, rating) {
  if (!(fiyat > 0) || !fin(rating)) return null;
  return { pi: fiyatDilimi(fiyat), r: Math.max(0, Math.min(10, Math.floor(rating))) };
}

export { kalitePuani };
