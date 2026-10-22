// DentSimco — Sinyal motoru v1 (AL / SAT / TUT / BEKLE / STOKLA)
//
// ÖZEL depoda, GitHub Actions ile her gece çalışır (.github/workflows/sinyal.yml). Bu dosya siteye
// (Firebase Hosting) hiç gitmez; katsayılar, maliyet modeli ve ara değerler yalnız burada durur.
// Siteye yalnız SONUÇ yazılır, o da yuvarlanmış hâlde:
//   meta/sinyal_r{r}              son sinyaller: eylem ve güç kodları, %0,5'lik adımla beklenti, gerekçe kodları,
//                                 hesap fiyatı (p), likit bayrağı (l), gün içi işareti (g), bekleyen yön (b)
//   meta/sinyalgecmis_r{r}_{gün}  o günün beklentileri (14 gün sonra karne için okunur)
//   meta/sinyal_karne_r{r}        canlı karne: verilen sinyallerin 14 gün sonra ne olduğu
//   meta/olaylar_r{r}             üretim hızı olaylarının birikmiş geçmişi (bot üzerine yazdığı için)
//   meta/evreler_r{r}             ekonomi evrelerinin birikmiş geçmişi
//   meta/optimum_r0               Optimum Seviye sayfası için son 28 günün borsa özeti (yalnız gece, yalnız Realm 0;
//                                 sinyal/optimum.mjs)
//   meta/endeks_r{r}              İndeks sayfası için piyasa endeksinin gün gün / hafta hafta dökümü (yalnız gece; sinyal/endeks.mjs)
//
// Veri: botun günlük belgeleri (daily/r{r}_{id}_{yıl}) + sinyal/gecmis-r0.json (botun başlamasından önceki
// 1 yıllık Realm 0 geçmişi). İkisi aynı günde çakışırsa geçmiş dosyası kullanılır.
//
// İKİ ÇALIŞMA ŞEKLİ (SINYAL_MOD ortam değişkeni ya da --gunici):
//   gece    (varsayılan) tam hesap: sinyaller + karne + olay/evre arşivi. Fiyat = son tam günün VWAP'ı.
//   gunici  (saatte bir) meta/sinyal_r{r} ve o günün gün içi karne kaydı (meta/sinyalgecmisgi_r{r}_{gün}) yazılır. Gece bayrağı LİKİT (7 günde ≥5 işlem günü ve günde ≥200 birim) ve
//           son işlemi ≤6 saat önce olan ürün×kalitede fiyat olarak canlı son işlem fiyatı kullanılır (g=1).
//           Diğerleri geceki hesapla aynıdır. Eylem yönü önceki yayından farklı çıkarsa, aynı yön iki ardışık
//           çalışmada çıkana kadar eski sinyal korunur (titreşim önleme).
//   Hedef fiyat = p × (1 + e/200). p her zaman beklentinin hesaplandığı fiyattır (g=1 ise canlı, değilse VWAP).
//
// GÜN İÇİ OLAYLAR (yalnız gunici, likit ve taze fiyatlı kayıtlarda). Olay çıkınca sinyal o çalışmada beklemeden yenilenir
// (titreşim önleme atlanır) ve kayda v = [kod, zaman] yazılır; etiket OLAY_SURE boyunca kartta kalır:
//   hd+ / hd-  gece hesabının hedef fiyatına (h) ulaşıldı (yükseliş / düşüş hedefi). Yeni hedef yeni hesaptan alınır.
//   ky         canlı fiyat son 20 günün en yüksek günlük fiyatını %1'den fazla aştı (yukarı kırılım)
//   ka         canlı fiyat son 20 günün en düşük günlük fiyatının %1'den fazla altına indi (yeni dip)
//   h = [hedef fiyat, yön] gece hesabında |beklenti| ≥ %2 ise konur; gün içinde ulaşılana kadar taşınır.
//
// Model (2025-10 – 2026-10 verisiyle, yarı yarıya örneklem dışı sınandı):
//   beklenen 14 günlük getiri = göreli kısım (ürünün kendi normaline ve maliyetine göre) + makro kısım
//   (piyasa endeksinin son haftası × ürünün piyasaya duyarlılığı). Eşikler ve kurallar aşağıda.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Firestore } from './firestore.mjs';
import { optimumOzet } from './optimum.mjs';
import { endeksOzet } from './endeks.mjs';

export const VERSION = 2;

// ---- Model ayarları (GİZLİ: hiçbir belgeye yazılmaz) ------------------------------------------

export const M = {
  pencere: 60, // "normal" fiyat ve maliyet: son 60 günün ortalaması (bugün hariç)
  enAz: 40, // bu pencerede en az bu kadar işlem günü yoksa sinyal üretilmez
  lambda: 2.0, // piyasanın ima ettiği işçilik çarpanı: maaş × 2 (yönetim gideri dahil tipik üretici)
  k14: { maliyet: [0.0025, -0.334, 0.218], fiyat: [0.0015, -0.253] }, // [sabit, fiyat sapması, maliyet sapması]
  makro: 0.4, // sonraki hafta piyasa ≈ 0,4 × son hafta
  betaOrt: 0.8, betaPay: 0.5, // ürün duyarlılığı yarı yarıya ortalamaya çekilir
  betaHafta: 15, // beta için en az bu kadar haftalık gözlem
  sinir: 0.25, // beklenti bu sınırın dışına çıkamaz
  komisyon: 0.04,
  tasimaId: 13,
  tuccarFiyat: 1000, tuccarEsik: 0.045, // tüccar yalnız $1000 üstü üründe, %4,5 + taşıma payı üstü beklentide
  belirsizlik: { maliyet: 5, fiyat: 6 }, // ± % (14 gün, 1 standart hata, yuvarlanmış)
  sezonPay: 0.5, sezonGun: 60, sezonOnce: 60, sezonSonra: 21, arzOrani: 0.8, talepOrani: 1.05,
  kaliteGun: 90, kaliteEnAz: 45,
  karneGun: 120,
  likit: { pencere: 7, gun: 5, birim: 200 }, // gece bayrağı: son 7 günde ≥5 işlem günü ve günlük ortalama ≥200 birim
  taze: 6 * 3_600_000, // son işlem bundan eskiyse canlı fiyat kullanılmaz
  canliEsik: 45 * 60_000, // canlı belge bundan eskiyse (bot durduysa) gün içi hesap yapılmaz
  hedefEnAz: 0.02, // gece hesabında bu beklentiden küçükse hedef (h) konmaz
  kirilim: 0.01, // 20 günlük tepe/dip bu oranda aşılırsa kırılım sayılır
  olaySure: 12 * 3_600_000, // olay etiketi bu kadar süre kartta kalır
};

// Hiçbir zaman sinyal verilmeyen ürün ve kalite çiftleri ("ürün:kalite"): Enerji Q12, Su Q12, Tohum Q12.
// Dashboard'daki public/sinyal.js SINYALSIZ listesiyle aynı olmalı (iki klasör ayrı iş akışlarında çalıştığı için
// birbirini içe aktaramaz; sinyal/motor_test.mjs ve test/sinyal_test.mjs aynı üç çifti ayrı ayrı sınar).
export const SINYALSIZ = new Set(['1:12', '2:12', '66:12']);

// Örneklem dışı sınama sonuçları (14 gün, 131 ürün, 40.544 ürün-gün): [n, fiyatı yükselenlerin payı, ortalama gerçekleşen]
export const ONSEL = {
  b1: [1241, 0.15, -0.0957], // beklenti ≤ −%4
  b2: [3018, 0.29, -0.0389], // −%4 … −%2
  b3: [27777, 0.51, -0.0004], // −%2 … +%2
  b4: [4887, 0.57, 0.0101], // +%2 … +%4
  b5: [3621, 0.65, 0.0271], // ≥ +%4
};

// Kayan bayramlar (mevsimsel ürünlerin takvimi her yıl kayar)
const PASKALYA = { 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16', 2029: '2029-04-01', 2030: '2030-04-21' };
const RAMAZAN = { 2025: '2025-03-01', 2026: '2026-02-18', 2027: '2027-02-08', 2028: '2028-01-28', 2029: '2029-01-16', 2030: '2030-01-06' };

// ---- Yardımcılar ------------------------------------------------------------------------------

const DAY = 86_400_000;
const fin = Number.isFinite;
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d, n) => utcDay(dayMs(d) + n * DAY);
export const diffDays = (a, b) => Math.round((dayMs(a) - dayMs(b)) / DAY); // a − b (gün)
const weekday = (d) => new Date(dayMs(d)).getUTCDay(); // 6 = cumartesi
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round1 = (x) => Math.round(x * 10) / 10;
export function parseJSON(text) {
  if (typeof text !== 'string' || !text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
function median(list) {
  const a = list.filter(fin).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ---- Seri deposu: her ürün × kalite için günlük fiyat (VWAP), satılan birim, arz ------------------

export class Seriler {
  constructor(start, end) {
    this.start = start;
    this.end = end;
    this.n = diffDays(end, start) + 1;
    this.p = new Map();
    this.u = new Map();
    this.a = new Map();
  }
  idx(day) { return diffDays(day, this.start); }
  day(i) { return addDays(this.start, i); }
  get(map, id, q, create = false) {
    const k = `${id}:${q}`;
    let x = map.get(k);
    if (!x && create) { x = new Float64Array(this.n).fill(NaN); map.set(k, x); }
    return x || null;
  }
  P(id, q) { return this.get(this.p, id, q); }
  U(id, q) { return this.get(this.u, id, q); }
}

// i gününde ya da en çok `back` gün öncesine kadar son geçerli değer
export function sonDeger(arr, i, back = 3) {
  if (!arr) return NaN;
  for (let j = i; j >= Math.max(0, i - back); j--) if (fin(arr[j])) return arr[j];
  return NaN;
}

// Seri birleştirme. seed: gecmis-r0.json içeriği (ya da null). daily: Map(id -> Map(gün -> {q: [7 alan]}))
export function seriKur({ seed, daily, start, end }) {
  const S = new Seriler(start, end);
  const seedEnd = seed ? addDays(seed.start, seed.n - 1) : null;
  const overlap = new Map(); // id -> [bot satış / geçmiş satış] oranları (Q0)
  if (seed) {
    for (const [idText, qs] of Object.entries(seed.p || {})) {
      const id = Number(idText);
      for (const [qText, pair] of Object.entries(qs)) {
        const q = Number(qText);
        const [pv, uv] = pair;
        const P = S.get(S.p, id, q, true);
        const U = S.get(S.u, id, q, true);
        for (let i = 0; i < seed.n; i++) {
          const j = S.idx(addDays(seed.start, i));
          if (j < 0 || j >= S.n) continue;
          if (pv[i] > 0) P[j] = pv[i];
          if (uv[i] != null && uv[i] >= 0) U[j] = uv[i];
        }
      }
    }
  }
  for (const [id, days] of daily) {
    for (const [day, qs] of days) {
      const j = S.idx(day);
      if (j < 0 || j >= S.n || !qs) continue;
      const inSeed = seedEnd && day <= seedEnd;
      for (const [qText, row] of Object.entries(qs)) {
        if (!Array.isArray(row)) continue;
        const q = Number(qText);
        const arz = Number(row[4]);
        const sat = row[5] == null ? NaN : Number(row[5]);
        const deger = row[6] == null ? NaN : Number(row[6]);
        if (fin(arz) && arz >= 0) S.get(S.a, id, q, true)[j] = arz;
        if (inSeed) {
          if (q === 0 && sat > 0) {
            const su = S.U(id, 0)?.[j];
            if (su > 0) (overlap.get(id) || overlap.set(id, []).get(id)).push(sat / su);
          }
          continue; // çakışan günde geçmiş dosyası esas
        }
        if (sat > 0 && deger > 0) {
          S.get(S.p, id, q, true)[j] = deger / sat;
          S.get(S.u, id, q, true)[j] = sat;
        } else if (sat === 0) {
          S.get(S.u, id, q, true)[j] = 0;
        }
      }
    }
  }
  // Bot satışı ilan farkından tahmin ettiği için geçmiş dosyasından düşük çıkar: geçmişteki satış adetleri
  // çakışan günlerdeki orana göre botun ölçeğine çekilir (hacim karşılaştırmaları tutarlı kalsın).
  if (seedEnd) {
    const cut = Math.min(S.idx(seedEnd), S.n - 1);
    for (const [key, U] of S.u) {
      const id = Number(key.split(':')[0]);
      const ratios = overlap.get(id) || [];
      const k = ratios.length >= 2 ? clamp(median(ratios), 0.3, 1.5) : 1;
      if (k === 1) continue;
      for (let j = 0; j <= cut; j++) if (fin(U[j])) U[j] *= k;
    }
  }
  return S;
}

// Bir dizinin [i-geri, i-1] penceresinde log ortalaması (en az `enAz` gözlem)
function logOrt(arr, i, geri, enAz) {
  let s = 0, n = 0;
  for (let j = Math.max(0, i - geri); j < i; j++) if (arr[j] > 0) { s += Math.log(arr[j]); n++; }
  return n >= enAz ? s / n : NaN;
}

function kapsama(arr, i, gun) {
  let n = 0;
  for (let j = Math.max(0, i - gun + 1); j <= i; j++) if (fin(arr[j])) n++;
  return n / gun;
}

// ---- Likidite, tazelik, titreşim önleme ------------------------------------------------------

// Gece bayrağı: Ti gününe kadar son 7 günde en az 5 gün fiyat var ve işlem olan günlerde günlük ortalama ≥200 birim
export function likitMi(S, id, q, Ti) {
  const P = S.P(id, q);
  if (!P) return false;
  const U = S.U(id, q);
  let gun = 0, toplam = 0, n = 0;
  for (let j = Math.max(0, Ti - M.likit.pencere + 1); j <= Ti; j++) {
    if (P[j] > 0) gun++;
    if (U && U[j] > 0) { toplam += U[j]; n++; }
  }
  return gun >= M.likit.gun && n > 0 && toplam / n >= M.likit.birim;
}

// live/r{r} belgesi → Map("id:kalite" → [son işlem fiyatı, son işlem zamanı]). Belge eskiyse boş döner.
export function canliHaritasi(doc, simdi) {
  const out = new Map();
  if (!doc?.items || !(simdi - Number(doc.t) <= M.canliEsik)) return out;
  for (const [idText, e] of Object.entries(doc.items)) {
    const byQ = Array.isArray(e) ? e[1] : e;
    if (!byQ || typeof byQ !== 'object') continue;
    for (const [qText, v] of Object.entries(byQ)) {
      const fiyat = Number(v?.[0]);
      const lt = Number(v?.[4]);
      if (fiyat > 0 && lt > 0) out.set(`${Number(idText)}:${Number(qText)}`, [fiyat, lt]);
    }
  }
  return out;
}

const canliTazeMi = (cl, simdi) => Boolean(cl) && cl[0] > 0 && cl[1] > 0 && simdi - cl[1] <= M.taze;

// Titreşim önleme (yalnız gün içi kayıtlar): eylem yönü (kod) önceki yayından farklıysa, aynı yön ardışık ikinci
// çalışmada da çıkana kadar önceki kayıt AYNEN korunur ve bekleyen yön b = [satıcı kodu, alıcı kodu] olarak işaretlenir.
// Yön aynıysa (yalnız güç ya da beklenti değiştiyse) yeni kayıt hemen geçer.
export function titresimOnle(yeni, onceki) {
  if (!yeni?.g || !yeni.s || !yeni.a || !onceki?.s || !onceki?.a || !(onceki.p > 0)) return yeni;
  if (yeni.v && yeni.v[1] !== onceki.v?.[1]) return yeni; // yeni gün içi olay (hedef, kırılım): sinyal hemen yenilenir
  if (onceki.s[0] === yeni.s[0] && onceki.a[0] === yeni.a[0]) return yeni;
  const b = onceki.b;
  if (b && b[0] === yeni.s[0] && b[1] === yeni.a[0]) return yeni; // ikinci ardışık çalışma: değişim onaylandı
  return { ...onceki, b: [yeni.s[0], yeni.a[0]] };
}

// urun: {id: {q: kayıt}} (yerinde değişir). Dönüş: korunan (değişimi bekletilen) kayıt sayısı.
export function titresimUygula(urun, oncekiUrun) {
  let tutulan = 0;
  for (const [idText, qs] of Object.entries(urun || {})) {
    for (const [qText, e] of Object.entries(qs)) {
      const sonuc = titresimOnle(e, oncekiUrun?.[idText]?.[qText]);
      if (sonuc !== e) { qs[qText] = sonuc; tutulan++; }
    }
  }
  return tutulan;
}

// ---- Makro: değer ağırlıklı piyasa endeksi (Q0, mevsimsel ürünler hariç) -------------------------

export function piyasaEndeksi(S, ids, haric, T) {
  const Ti = S.idx(T);
  const L = new Float64Array(Ti + 1).fill(0);
  const art = new Float64Array(Ti + 1).fill(0);
  const use = ids.filter((id) => !haric.has(id) && S.P(id, 0) && kapsama(S.P(id, 0), Ti, 120) >= 0.5);
  const val = new Map();
  for (const id of use) {
    const P = S.P(id, 0), U = S.U(id, 0);
    const v = new Float64Array(Ti + 1).fill(NaN);
    let s = 0, n = 0;
    for (let t = 0; t <= Ti; t++) {
      if (t > 0) v[t] = n ? s / n : NaN; // önceki 30 günün ortalama işlem değeri (bugün hariç)
      const x = P[t] * (U ? U[t] : NaN);
      if (fin(x)) { s += x; n++; }
      const o = t - 30;
      if (o >= 0) { const y = P[o] * (U ? U[o] : NaN); if (fin(y)) { s -= y; n--; } }
    }
    val.set(id, v);
  }
  for (let t = 1; t <= Ti; t++) {
    let num = 0, den = 0;
    for (const id of use) {
      const P = S.P(id, 0);
      const a = P[t - 1], b = P[t], w = val.get(id)[t];
      if (a > 0 && b > 0 && w > 0) { num += w * Math.log(b / a); den += w; }
    }
    art[t] = den > 0 ? num / den : 0;
    L[t] = L[t - 1] + art[t];
  }
  return { L, art, kullanilan: use.length, use, val }; // use, val: İndeks sayfası katkı hesabı (sinyal/endeks.mjs)
}

function beta(S, id, L, T) {
  const P = S.P(id, 0);
  const Ti = S.idx(T);
  if (!P) return M.betaOrt;
  const xs = [], ys = [];
  for (let k = 0; k < 52; k++) {
    const a = Ti - 7 * k, b = a - 7;
    if (b < 0) break;
    const pa = sonDeger(P, a), pb = sonDeger(P, b);
    if (!(pa > 0 && pb > 0)) continue;
    xs.push(L[a] - L[b]);
    ys.push(Math.log(pa / pb));
  }
  if (xs.length < M.betaHafta) return M.betaOrt;
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  let cov = 0, vr = 0;
  for (let i = 0; i < xs.length; i++) { cov += (xs[i] - mx) * (ys[i] - my); vr += (xs[i] - mx) ** 2; }
  if (!(vr > 0)) return M.betaOrt;
  return M.betaPay * clamp(cov / vr, -0.5, 2.5) + (1 - M.betaPay) * M.betaOrt;
}

// ---- Mevsim: yıllık işlem değerinin yarısı ≤ 60 günde toplanan ürünler ---------------------------

function paskalyaYakin(day) {
  const y = Number(day.slice(0, 4));
  for (const yy of [y - 1, y, y + 1]) if (PASKALYA[yy] && Math.abs(diffDays(day, PASKALYA[yy])) <= 14) return PASKALYA[yy];
  return null;
}
function ramazanYakin(day) {
  const y = Number(day.slice(0, 4));
  for (const yy of [y - 1, y, y + 1]) {
    const r = RAMAZAN[yy];
    if (r && diffDays(day, r) >= -10 && diffDays(day, r) <= 30) return r;
  }
  return null;
}

export function mevsimleriBul(S, ids, T) {
  const Ti = S.idx(T);
  const out = {};
  if (Ti < 364) return out;
  const base = Ti - 364;
  for (const id of ids) {
    const v = new Float64Array(365);
    let tot = 0;
    for (let q = 0; q <= 12; q++) {
      const P = S.P(id, q), U = S.U(id, q);
      if (!P || !U) continue;
      for (let i = 0; i < 365; i++) { const x = P[base + i] * U[base + i]; if (fin(x) && x > 0) { v[i] += x; tot += x; } }
    }
    if (!(tot > 0)) continue;
    // Dairesel en kısa pencere (yıl başı/sonu kesişen sezonlar için)
    let best = { len: 366, s: 0 };
    let j = 0, acc = 0;
    for (let i = 0; i < 365; i++) {
      while (acc < M.sezonPay * tot && j < i + 365) { acc += v[j % 365]; j++; }
      if (acc >= M.sezonPay * tot && j - i < best.len) best = { len: j - i, s: i };
      acc -= v[i];
    }
    if (best.len > M.sezonGun) continue;
    // Sezon içi / dışı Q0 fiyat oranı → talep sezonu mu, arz (hasat) sezonu mu
    const P0 = S.P(id, 0);
    const icI = [], disI = [];
    for (let i = 0; i < 365; i++) {
      const inWin = ((i - best.s + 365) % 365) < best.len;
      const p = P0 ? P0[base + i] : NaN;
      if (fin(p)) (inWin ? icI : disI).push(p);
    }
    const oran = median(icI) / median(disI);
    const basGun = S.day(base + best.s);
    let capa = null, kayma = 0;
    const pk = paskalyaYakin(addDays(basGun, Math.floor(best.len / 2)));
    const rm = !pk && ramazanYakin(basGun);
    if (pk) { capa = 'paskalya'; kayma = diffDays(basGun, pk); }
    else if (rm) { capa = 'ramazan'; kayma = diffDays(basGun, rm); }
    // talep: sezonda fiyat primi var | hacim: sezonda yalnız satış hacmi artıyor | arz: sezonda fiyat düşüyor (bolluk)
    const tip = !fin(oran) ? 'hacim' : oran < M.arzOrani ? 'arz' : oran >= M.talepOrani ? 'talep' : 'hacim';
    out[id] = { tip, ag: basGun.slice(5), uzun: best.len, capa, kayma, oran: fin(oran) ? oran : null };
  }
  return out;
}

function sezonBaslangic(m, yil) {
  if (m.capa === 'paskalya' && PASKALYA[yil]) return addDays(PASKALYA[yil], m.kayma);
  if (m.capa === 'ramazan' && RAMAZAN[yil]) return addDays(RAMAZAN[yil], m.kayma);
  return `${yil}-${m.ag === '02-29' ? '02-28' : m.ag}`;
}

// Bugün sezonun neresindeyiz: 'once' (≤60 gün kala), 'sezon', 'sonra' (bittikten sonra ≤21 gün), 'dis'
export function sezonFazi(m, gun) {
  const y = Number(gun.slice(0, 4));
  const occ = [y - 1, y, y + 1].map((yy) => { const b = sezonBaslangic(m, yy); return { b, s: addDays(b, m.uzun - 1) }; });
  for (const o of occ) if (gun >= o.b && gun <= o.s) return { faz: 'sezon', ...o };
  for (const o of occ) if (gun > o.s && diffDays(gun, o.s) <= M.sezonSonra) return { faz: 'sonra', ...o };
  const next = occ.filter((o) => o.b > gun).sort((a, b) => (a.b < b.b ? -1 : 1))[0];
  if (next && diffDays(next.b, gun) <= M.sezonOnce) return { faz: 'once', ...next };
  return { faz: 'dis', ...(next || occ[1]) };
}

// ---- Ürün sinyali -------------------------------------------------------------------------------

function kova(e) {
  if (e <= -0.04) return 'b1';
  if (e <= -0.02) return 'b2';
  if (e < 0.02) return 'b3';
  if (e < 0.04) return 'b4';
  return 'b5';
}

const derece = (x) => { const a = Math.abs(x); return a >= 0.10 ? 3 : a >= 0.05 ? 2 : a >= 0.02 ? 1 : 0; };

// Girdi fiyatı: kalite en az q−1 kuralı; önce tam q−1, yoksa daha yüksek kaliteler
function girdiFiyati(S, j, q, t) {
  for (let qq = Math.max(q - 1, 0); qq <= 12; qq++) {
    const v = S.P(j, qq)?.[t];
    if (v > 0) return v;
  }
  return NaN;
}

function maliyetSerisi(S, info, q, from, to) {
  const out = new Float64Array(to + 1).fill(NaN);
  const ciplak = new Float64Array(to + 1).fill(NaN);
  const w0 = info.baseSalary / info.perHour;
  for (let t = Math.max(0, from); t <= to; t++) {
    let m = 0, ok = true;
    for (const [j, a] of info.inputs) {
      const pj = girdiFiyati(S, j, q, t);
      if (!(pj > 0)) { ok = false; break; }
      m += a * pj;
    }
    if (ok) { out[t] = m + M.lambda * w0; ciplak[t] = m + w0; }
  }
  return { C: out, Cc: ciplak };
}

function maliyetliMi(info, S) {
  return info && !info.research && Array.isArray(info.inputs) && info.inputs.length > 0
    && info.baseSalary > 0 && info.perHour > 0 && info.inputs.every(([j]) => S.P(j, 0) || S.P(j, 1));
}

// Gün içi olay: önceki yayın (once) ve canlı fiyat (p) ile. hi/lo = son 20 günün günlük fiyatlarının log tepe/dibi.
// Aynı olay OLAY_SURE içinde tekrar üretilmez (her saat yeniden "kırıldı" denmesin).
export function gunIciOlay({ p, once, hi, lo, nn, simdi }) {
  if (!(p > 0)) return null;
  const tekrar = (kod) => once?.v?.[0] === kod && simdi - once.v[1] < M.olaySure;
  const h = once?.h;
  if (Array.isArray(h) && h[0] > 0) {
    if (h[1] > 0 && p >= h[0]) return 'hd+';
    if (h[1] < 0 && p <= h[0]) return 'hd-';
  }
  if (nn >= 10) {
    const lp = Math.log(p);
    if (lp > hi + Math.log(1 + M.kirilim) && !tekrar('ky')) return 'ky';
    if (lp < lo - Math.log(1 + M.kirilim) && !tekrar('ka')) return 'ka';
  }
  return null;
}

function dusur(sig, kod) {
  if (sig[1] > 1) sig[1] -= 1;
  return kod;
}

export function urunSinyali(ctx, id, q) {
  const { S, Ti, products, m7, betalar, olaylar, mevsim, gun, tasimaFiyati } = ctx;
  let P = S.P(id, q);
  if (!P) return null;
  // son fiyat: en çok 3 gün eski
  let ti = -1;
  for (let j = Ti; j >= Ti - 3; j--) if (P[j] > 0) { ti = j; break; }
  if (ti < 0) return null;
  const ui = ti; // hacim ve arz dizini: son tam işlem günü (gün içi modda fiyat bir gün ileri kayar)
  const info = products[id] || {};
  const r = [];
  const entry = { r };

  // Mevsimsel ürün: model yerine takvim kuralı
  const mv = mevsim[id];
  if (mv) {
    const f = sezonFazi(mv, gun);
    entry.z = f.faz;
    const bozulur = Number(info.decay) > 0;
    let s = ['SAT', 0], a = ['AL', 0];
    if (mv.tip === 'talep') {
      if (f.faz === 'once') { s = ['TUT', 2]; a = ['STOKLA', 2]; }
      else if (f.faz === 'sezon') { s = ['SAT', 2]; a = ['AL', 1]; }
      else if (f.faz === 'sonra') { s = ['HSAT', 2]; a = ['BEKLE', 2]; }
    } else if (mv.tip === 'hacim') {
      if (f.faz === 'sezon') { s = ['SAT', 1]; a = ['AL', 0]; }
      else if (f.faz === 'sonra') { s = ['HSAT', 1]; a = ['BEKLE', 1]; }
    } else {
      if (f.faz === 'once') { s = ['HSAT', 2]; a = ['BEKLE', 2]; }
      else if (f.faz === 'sezon') { s = ['TUT', 2]; a = ['STOKLA', 2]; }
      else if (f.faz === 'sonra') { s = ['TUT', 1]; a = ['STOKLA', 1]; }
    }
    if (bozulur && (s[0] === 'TUT' || a[0] === 'STOKLA')) {
      if (s[0] === 'TUT') s[1] = 1;
      if (a[0] === 'STOKLA') a[1] = 1;
      r.push('bz');
    }
    entry.s = s; entry.a = a; entry.e = null; entry.t = 0;
    r.push('sz');
    olayIliskileri(entry, id, olaylar, products, ctx.simdi);
    return entry;
  }

  // Gün içi mod: likit ve son işlemi taze ürün×kalitede "bugün" olarak canlı son işlem fiyatı eklenir.
  // Normal fiyat (60 günlük ortalama) ve maliyet son tam günle aynı kalır; yalnız fiyat sapması canlıdır.
  const likit = likitMi(S, id, q, Ti);
  const cl = ctx.canli?.get(`${id}:${q}`);
  const gunici = likit && canliTazeMi(cl, ctx.simdi);
  if (gunici) {
    const Pn = new Float64Array(ti + 2).fill(NaN);
    Pn.set(P.subarray(0, ti + 1));
    Pn[ti + 1] = cl[0];
    P = Pn;
    ti += 1;
  }
  const p = P[ti];

  const lp = Math.log(p);
  const muP = logOrt(P, ti, M.pencere, M.enAz);
  if (!fin(muP)) return null; // yeterli geçmiş yok
  const pdev = lp - muP;

  // Maliyet tarafı
  let cdev = NaN, C2 = NaN, Cc = NaN;
  if (maliyetliMi(info, S)) {
    const { C, Cc: cc } = maliyetSerisi(S, info, q, ti - M.pencere - 1, ti);
    C2 = sonDeger(C, ti);
    Cc = sonDeger(cc, ti);
    const muC = logOrt(C, ti, M.pencere, M.enAz);
    if (C2 > 0 && fin(muC)) cdev = Math.log(C2) - muC;
  }
  const maliyetli = fin(cdev);
  const k14 = maliyetli ? M.k14.maliyet : M.k14.fiyat;
  const b = betalar.get(id) ?? M.betaOrt;
  const x14 = k14[0] + k14[1] * pdev + (maliyetli ? k14[2] * cdev : 0);
  const e14 = clamp(x14 + b * M.makro * m7 * 2, -M.sinir, M.sinir);
  entry.e = Math.round(e14 * 200); // yarım yüzde adımı (×2 tamsayı); 7 günlük beklenti ve ara değerler yazılmaz
  entry.u = maliyetli ? M.belirsizlik.maliyet : M.belirsizlik.fiyat;
  entry.p = Math.round(p * 1e4) / 1e4; // hesap fiyatı: Hedef = p × (1 + e/200)
  entry.l = likit ? 1 : 0;
  if (gunici) entry.g = 1;

  // Satıcı (elinde mal olan üretici): komisyon bugün de sonra da ödenir, karar yalnız fiyat beklentisine bağlı
  // +%2…+%4 yükseliş beklentisi geçmiş sınamada zayıftı (%57 isabet, ortalama +%1): eylem olarak nötr gösterilir.
  const s = e14 >= 0.04 ? ['TUT', 3] : e14 <= -0.04 ? ['HSAT', 3] : e14 <= -0.02 ? ['HSAT', 2] : ['SAT', 0];
  // Alıcı (girdi alacak üretici)
  const a = e14 <= -0.04 ? ['BEKLE', 3] : e14 <= -0.02 ? ['BEKLE', 2] : e14 >= 0.04 ? ['STOKLA', 2] : ['AL', 0];
  entry.s = s;
  entry.a = a;

  // Gerekçeler (kaba aralıklar; ham sapma yazılmaz)
  const dp = derece(pdev);
  if (dp) r.push(`p${pdev > 0 ? '+' : '-'}${dp}`);
  if (maliyetli) { const dc = derece(cdev); if (dc) r.push(`c${cdev > 0 ? '+' : '-'}${dc}`); }
  if (Math.abs(m7) >= 0.01) r.push(m7 > 0 ? 'mk+' : 'mk-');

  // Sıçrama ve hacimli kırılım (geçmişte çoğunlukla geri döndü)
  const ret = [];
  for (let j = Math.max(1, ti - M.pencere); j < ti; j++) if (P[j] > 0 && P[j - 1] > 0) ret.push(Math.log(P[j] / P[j - 1]));
  const prev = sonDeger(P, ti - 1, 3);
  if (ret.length >= 30 && prev > 0) {
    const mu = ret.reduce((x, y) => x + y, 0) / ret.length;
    const sd = Math.sqrt(ret.reduce((x, y) => x + (y - mu) ** 2, 0) / (ret.length - 1));
    const z = sd > 0 ? Math.log(p / prev) / sd : 0;
    if (z > 3) r.push('sp+');
    if (z < -3) r.push('sp-');
  }
  let hi = -Infinity, lo = Infinity, nn = 0;
  for (let j = Math.max(0, ti - 20); j < ti; j++) if (P[j] > 0) { const l = Math.log(P[j]); hi = Math.max(hi, l); lo = Math.min(lo, l); nn++; }
  // Gece hesabının hedefi (h): gün içinde ulaşılana kadar taşınır
  const once = ctx.onceki?.[id]?.[q];
  if (!gunici) {
    if (Math.abs(e14) >= M.hedefEnAz) entry.h = [Math.round(p * (1 + e14) * 1e4) / 1e4, e14 > 0 ? 1 : -1];
  } else {
    const olay = gunIciOlay({ p, once, hi, lo, nn, simdi: ctx.simdi });
    if (olay) {
      entry.v = [olay, ctx.simdi];
      r.unshift(olay);
      // Hedefe ulaşıldıysa yeni hedef bu (canlı) hesaptan; değilse gece hedefi korunur
      if (olay.startsWith('hd')) { if (Math.abs(e14) >= M.hedefEnAz) entry.h = [Math.round(p * (1 + e14) * 1e4) / 1e4, e14 > 0 ? 1 : -1]; }
      else if (once?.h) entry.h = once.h;
    } else {
      if (once?.h) entry.h = once.h;
      if (once?.v && ctx.simdi - once.v[1] < M.olaySure) { entry.v = once.v; r.unshift(once.v[0]); }
    }
  }

  const U = S.U(id, q);
  if (!gunici && nn >= 10 && U && U[ti] > 0) {
    const muU = logOrt(U, ti, 30, 15);
    const yuksekHacim = fin(muU) && Math.log(U[ti]) - muU > Math.log(1.5);
    if (yuksekHacim && lp > hi) r.push('kr+');
    if (yuksekHacim && lp < lo) r.push('kr-');
  }
  if (Cc > 0 && p < Cc) r.push('mc');

  // Piyasa üretim marjı (tipik üretici maliyetiyle, komisyon ve taşıma sonrası)
  const tasima = (Number(info.transportNeeded ?? info.transport) || 0) * (tasimaFiyati || 0);
  if (C2 > 0) entry.m = Math.round(((p * (1 - M.komisyon) - tasima) / C2 - 1) * 100);

  // Tüccar: yalnız pahalı ürünlerde ve yüksek beklentide (komisyon + taşıma burada önemli)
  entry.t = p >= M.tuccarFiyat && e14 >= M.tuccarEsik + tasima / p ? 1 : 0;

  // Stok kapsama: satıştaki arz kaç günlük satışa denk (yalnız bot verisi)
  const A = S.get(S.a, id, q);
  if (A && A[ui] > 0 && U) { // arz verisi olmayan kaynakta (0) gösterilmez
    let su = 0, sn = 0;
    for (let j = ui - 6; j <= ui; j++) if (fin(U[j])) { su += U[j]; sn++; }
    if (sn >= 3 && su > 0) entry.k = round1(A[ui] / (su / sn));
  }

  // Olaylar: yalnız ürünün kendi olayı sinyal gücünü düşürebilir; girdi/çıktı ilişkileri bilgi olarak gösterilir
  olayIliskileri(entry, id, olaylar, products, ctx.simdi);
  const kendi = (entry.o || []).find((o) => o[3] === 'kendi' && o[4] === 'aktif');
  if (kendi) {
    const kalan = (Date.parse(kendi[2]) - ctx.simdi) / DAY;
    const yon = kendi[1] > 0 ? -1 : 1; // hız artışı: arz artar → fiyata aşağı baskı
    if (kalan > 5) {
      if (yon < 0 && s[0] === 'TUT') dusur(s);
      if (yon > 0 && s[0] === 'HSAT') dusur(s);
      if (yon > 0 && a[0] === 'BEKLE') dusur(a);
      if (yon < 0 && a[0] === 'STOKLA') dusur(a);
    }
  }
  return entry;
}

function olayIliskileri(entry, id, olaylar, products, simdi) {
  const list = [];
  for (const ev of olaylar) {
    const durum = Date.parse(ev.since) > simdi ? 'yakinda' : Date.parse(ev.until) > simdi ? 'aktif' : 'bitti';
    if (ev.kind === id) { list.push([ev.kind, ev.s, ev.until, 'kendi', durum]); continue; }
    const kInfo = products[ev.kind];
    if (kInfo?.inputs?.some(([j]) => j === id)) list.push([ev.kind, ev.s, ev.until, 'girdi', durum]); // bu ürün olaylı ürünün girdisi
    else if (products[id]?.inputs?.some(([j]) => j === ev.kind)) list.push([ev.kind, ev.s, ev.until, 'cikti', durum]); // olaylı ürün bu ürünün girdisi
  }
  if (list.length) { entry.o = list; entry.r.push('ev'); }
}

// Kalite önerisi: son 90 günde hangi kalitede net marj (komisyon ve taşıma sonrası) en yüksekti
function kaliteOnerisi(S, info, Ti, tasima) {
  const sonuc = [];
  for (let q = 0; q <= 12; q++) {
    const P = S.P(info.id, q);
    if (!P) continue;
    const { C } = maliyetSerisi(S, info, q, Ti - M.kaliteGun + 1, Ti);
    const m = [];
    for (let t = Ti - M.kaliteGun + 1; t <= Ti; t++) {
      if (P[t] > 0 && C[t] > 0) m.push((P[t] * (1 - M.komisyon) - (tasima[t] || 0)) / C[t] - 1);
    }
    if (m.length >= M.kaliteEnAz) sonuc.push([q, median(m)]);
  }
  if (sonuc.length < 2) return null;
  const best = sonuc.reduce((x, y) => (y[1] > x[1] ? y : x));
  const q0 = sonuc.find((x) => x[0] === 0);
  return [best[0], Math.round(best[1] * 100), q0 ? Math.round(q0[1] * 100) : null];
}

// ---- Bir realm için tüm hesap (saf işlev: okuma/yazma yapmaz, sınanabilir) ------------------------

export function hesapla({ realm, simdi, products, ids, modifiers, phase, seed, daily, mevsimHazir, gecmisDocs, gecmisGiDocs = null, karneDoc, canli: canliFiyat = null, tn = null, onceki = null }) {
  // Son tam gün: borsadaki ürünlerin en az %40'ında Q0 fiyatı olan en yeni gün
  const bugun = utcDay(simdi);
  const start = addDays(bugun, -430);
  const S = seriKur({ seed, daily, start, end: addDays(bugun, -1) });
  const esik = Math.max(1, Math.floor(ids.length * 0.4));
  let Ti = -1;
  for (let j = S.n - 1; j >= Math.max(0, S.n - 30); j--) {
    let n = 0;
    for (const id of ids) if (S.P(id, 0)?.[j] > 0) n++;
    if (n >= esik) { Ti = j; break; }
  }
  if (Ti < 0) Ti = S.n - 1; // son 30 günde hiç veri yok: dünü son gün say (sinyal üretilmez)
  const T = S.day(Ti);

  const mevsim = mevsimHazir || mevsimleriBul(S, ids, T);
  const haric = new Set(Object.keys(mevsim).map(Number));
  const endeks = piyasaEndeksi(S, ids, haric, T);
  const { L, art, kullanilan } = endeks;
  const endeksVar = kullanilan > 0 && Ti >= 7;
  const m7 = endeksVar ? L[Ti] - L[Ti - 7] : 0;
  let cmt = null;
  if (endeksVar) for (let j = Ti; j > Ti - 7 && j > 0; j--) if (weekday(S.day(j)) === 6) { cmt = { gun: S.day(j), x: art[j] }; break; }
  const betalar = new Map(ids.map((id) => [id, beta(S, id, L, T)]));

  const olaylar = (modifiers?.resourceProductionModifiers || [])
    .filter((x) => x && (x.realm == null || Number(x.realm) === realm))
    .map((x) => ({ id: x.id, kind: Number(x.kind), s: Number(x.speedModifier), since: x.since, until: x.until }))
    .filter((x) => fin(x.kind) && fin(x.s) && x.since && x.until && simdi - Date.parse(x.until) <= 7 * DAY);

  const tasimaSeri = S.P(M.tasimaId, 0);
  const ctx = { S, Ti, products, m7, betalar, olaylar, mevsim, gun: bugun, simdi, canli: canliFiyat, onceki: onceki?.urun || null, tasimaFiyati: sonDeger(tasimaSeri, Ti, 7) };

  const urun = {};
  const gunluk = {};
  const kalite = {};
  const gunIci = {}; // gün içi karne: canlı fiyatla hesaplanan kayıtlar {id: {q: [e, canlı fiyat]}}
  let sayac = 0;
  let canliSayi = 0;
  for (const id of ids) {
    const qs = {};
    for (let q = 0; q <= 12; q++) {
      if (SINYALSIZ.has(`${id}:${q}`)) continue;
      const e = urunSinyali(ctx, id, q);
      if (!e) continue;
      qs[q] = e;
      sayac++;
      if (e.g) { canliSayi++; if (e.e != null) (gunIci[id] ||= {})[q] = [e.e, e.p]; }
      if (e.e != null) {
        const p = sonDeger(S.P(id, q), Ti);
        (gunluk[id] ||= {})[q] = [e.e, Math.round(p * 1e4) / 1e4];
      }
    }
    if (Object.keys(qs).length) urun[id] = qs;
    const info = products[id];
    if (!mevsim[id] && maliyetliMi(info, S)) {
      const tr = (Number(info.transportNeeded ?? info.transport) || 0);
      const tasima = tasimaSeri ? Array.from(tasimaSeri, (x) => (x > 0 ? x * tr : 0)) : [];
      const k = kaliteOnerisi(S, { ...info, id }, Ti, tasima);
      if (k) kalite[id] = k;
    }
  }

  // Canlı karne: 14 gün önceki beklentiler 14 gün sonra ne oldu. Bir gece çalışması kaçarsa o günün kaydı sonraki
  // gecelerde (en çok 18 gün geriye) yine değerlendirilir; gerçekleşen fiyat kaydın gününden tam 14 gün sonrasıdır.
  const degerlendir = (doc, gun, ufuk = 14) => {
    const j = S.idx(gun) + ufuk;
    if (j > Ti || !doc?.items) return null;
    const top = {};
    const ekle = (items) => {
      for (const [idText, qs] of Object.entries(items || {})) {
        for (const [qText, [eh, p0]] of Object.entries(qs)) {
          const p1 = sonDeger(S.P(Number(idText), Number(qText)), j, 3);
          if (!(p0 > 0 && p1 > 0)) continue;
          const r = Math.log(p1 / p0);
          const c = (top[kova(eh / 200)] ||= [0, 0, 0]);
          c[0]++; if (r > 0) c[1]++; c[2] += r;
        }
      }
    };
    if (doc.saat) for (const items of Object.values(doc.saat)) ekle(items); // gün içi belge: saat → kayıtlar
    else ekle(doc.items);
    return top;
  };
  // gunler7: aynı kayıtların 7 gün sonraki sonucu (ara durum; 14 günlük karneden ayrı tutulur)
  const karne = { gunler: { ...(karneDoc?.gunler || {}) }, gunler7: { ...(karneDoc?.gunler7 || {}) }, gunici: { ...(karneDoc?.gunici || {}) } };
  for (const doc of gecmisDocs?.values() || []) {
    if (!doc?.d) continue;
    if (!karne.gunler[doc.d]) {
      const top = degerlendir(doc, doc.d);
      if (top) karne.gunler[doc.d] = top;
    }
    if (!karne.gunler7[doc.d]) {
      const top7 = degerlendir(doc, doc.d, 7);
      if (top7) karne.gunler7[doc.d] = top7;
    }
  }
  for (const [gun, doc] of gecmisGiDocs || []) {
    if (!doc || karne.gunici[gun]) continue;
    const top = degerlendir({ ...doc, items: {} }, gun);
    if (top) karne.gunici[gun] = top;
  }
  for (const grup of [karne.gunler, karne.gunler7, karne.gunici]) for (const d of Object.keys(grup)) if (diffDays(T, d) > M.karneGun) delete grup[d];
  const topla = (grup) => {
    const c = {};
    for (const top of Object.values(grup)) {
      for (const [k, [n, up, sum]] of Object.entries(top)) {
        const x = (c[k] ||= [0, 0, 0]);
        x[0] += n; x[1] += up; x[2] += sum;
      }
    }
    return Object.fromEntries(Object.entries(c).map(([k, [n, up, sum]]) => [k, [n, Math.round((up / n) * 100) / 100, Math.round((sum / n) * 1e4) / 1e4]]));
  };
  const canliOzet = topla(karne.gunler);
  const canli7Ozet = topla(karne.gunler7);
  const giOzet = topla(karne.gunici);

  const sezonListe = {};
  for (const [id, m] of Object.entries(mevsim)) {
    const f = sezonFazi(m, bugun);
    sezonListe[id] = [m.tip, f.b, f.s, f.faz];
  }

  const evre = phase ? { ad: phase.phase, bas: phase.start, bit: phase.end, yeni: phase.start ? simdi - Date.parse(phase.start) < 7 * DAY : false } : null;

  const sinyal = {
    v: VERSION, t: simdi, tn: tn ?? simdi, gun: T, realm, sayi: sayac,
    makro: endeksVar
      ? { m7: round1(m7 * 100), rejim: m7 <= -0.01 ? -1 : m7 >= 0.01 ? 1 : 0, cmt: cmt ? round1(cmt.x * 100) : null, cmtGun: cmt?.gun ?? null, endeksUrun: kullanilan }
      : { m7: null, rejim: 0, cmt: null, cmtGun: null, endeksUrun: kullanilan },
    evre,
    olaylar: olaylar.map((x) => [x.kind, x.s, x.since, x.until, Date.parse(x.since) > simdi ? 'yakinda' : Date.parse(x.until) > simdi ? 'aktif' : 'bitti']),
    sezon: sezonListe,
    kalite,
    karne: { onsel: ONSEL, canli: canliOzet, canli7: canli7Ozet, gunici: giOzet },
    urun,
  };
  return { sinyal, gecmis: { t: simdi, d: T, items: gunluk }, gunIci, karne, mevsim, T, canliSayi, S, endeks };
}

// ---- Okuma / yazma ------------------------------------------------------------------------------

async function seedOku(realm) {
  if (realm !== 0) return null;
  try {
    return JSON.parse(await readFile(new URL('./gecmis-r0.json', import.meta.url), 'utf8'));
  } catch (e) {
    console.log(`UYARI: sinyal/gecmis-r0.json okunamadı (${e.message}). Yalnız botun verisiyle devam ediliyor; sinyaller 60 gün sonra dolar.`);
    return null;
  }
}

function dailyCoz(docs, ids, realm, years) {
  const out = new Map();
  for (const id of ids) {
    const days = new Map();
    for (const y of years) {
      const f = docs.get(`daily/r${realm}_${id}_${y}`);
      if (!f) continue;
      for (const [key, text] of Object.entries(f)) {
        const m = /^d(\d\d)(\d\d)$/.exec(key);
        const qs = m && parseJSON(text);
        if (qs) days.set(`${y}-${m[1]}-${m[2]}`, qs);
      }
      // Anlık borsa botunun günlük ortalama arzı (a{AAGG}) satırın ortArz yerine işlenir
      for (const [key, text] of Object.entries(f)) {
        const m = /^a(\d\d)(\d\d)$/.exec(key);
        const avg = m && parseJSON(text);
        const qs = m && days.get(`${y}-${m[1]}-${m[2]}`);
        if (!avg || !qs) continue;
        for (const [q, a] of Object.entries(avg)) if (Array.isArray(qs[q]) && Number.isFinite(Number(a))) { qs[q] = [...qs[q]]; qs[q][4] = Number(a); }
      }
    }
    out.set(id, days);
  }
  return out;
}

export async function main({
  db = new Firestore(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
  simdi = Date.now(),
  mod = process.env.SINYAL_MOD === 'gunici' || process.argv.includes('--gunici') ? 'gunici' : 'gece',
  seedYukle = seedOku, // sınamada geçmiş dosyası kapatılabilir
} = {}) {
  const t0 = simdi;
  const basla = Date.now();
  const gunici = mod === 'gunici';
  const realms = [0, 1];
  const meta = await db.getMany([
    'meta/tradable', 'system/phase',
    ...realms.flatMap((r) => [
      `meta/products_r${r}`, `meta/modifiers_r${r}`, `meta/sinyal_karne_r${r}`, `meta/olaylar_r${r}`, `meta/evreler_r${r}`,
      ...(gunici ? [`live/r${r}`, `meta/sinyal_r${r}`] : [`meta/endeks_r${r}`]),
    ]),
  ]);
  const tradable = parseJSON(meta.get('meta/tradable')?.data) || {};
  const phaseDoc = meta.get('system/phase') || {};
  let mevsimR0 = null;
  const writes = [];
  const ozet = [];
  for (const realm of realms) {
    const products = parseJSON(meta.get(`meta/products_r${realm}`)?.data) || {};
    const seed = await seedYukle(realm);
    let ids = (tradable[realm] || []).map(Number).filter(fin);
    if (!ids.length && seed) ids = Object.keys(seed.p).map(Number);
    if (!ids.length) { ozet.push(`r${realm}: ürün listesi yok, atlandı`); continue; }
    ids.sort((a, b) => a - b);
    const bugun = utcDay(t0);
    const years = [];
    for (let y = Number(addDays(bugun, -430).slice(0, 4)); y <= Number(bugun.slice(0, 4)); y++) years.push(y);
    const docs = await db.getMany(ids.flatMap((id) => years.map((y) => `daily/r${realm}_${id}_${y}`)));
    const daily = dailyCoz(docs, ids, realm, years);
    const modifiers = parseJSON(meta.get(`meta/modifiers_r${realm}`)?.data);
    const karneDoc = parseJSON(meta.get(`meta/sinyal_karne_r${realm}`)?.data);

    // Gün içi çalışma: önceki yayın (titreşim önleme, gece hesabının zamanı) ve canlı fiyatlar
    const onceki = gunici ? parseJSON(meta.get(`meta/sinyal_r${realm}`)?.data) : null;
    const canli = gunici ? canliHaritasi(parseJSON(meta.get(`live/r${realm}`)?.data), t0) : null;

    // 14 gün (ve 7 gün ara durum için 8-11 gün) önceki beklentiler (karne). Son tam gün botun gece özetine bağlı olduğundan birkaç aday gün okunur.
    // Gün içi çalışmada karne güncellenmez: yeni gün eklenmez, belgedeki karne olduğu gibi yayında kalır.
    let gecmisDocs = new Map();
    let gecmisGiDocs = new Map();
    if (!gunici) {
      const adaylar = [8, 9, 10, 11, 15, 16, 17, 18].map((k) => addDays(bugun, -k));
      const gDocs = await db.getMany(adaylar.flatMap((d) => [`meta/sinyalgecmis_r${realm}_${d}`, `meta/sinyalgecmisgi_r${realm}_${d}`]));
      gecmisDocs = new Map(adaylar.map((d) => [d, parseJSON(gDocs.get(`meta/sinyalgecmis_r${realm}_${d}`)?.data)]));
      // Gün içi belge: her saat bir alan (sHH); karnede o günün tüm saatleri değerlendirilir
      gecmisGiDocs = new Map(adaylar.map((d) => {
        const f = gDocs.get(`meta/sinyalgecmisgi_r${realm}_${d}`);
        if (!f) return [d, null];
        const saat = {};
        for (const [k, v] of Object.entries(f)) if (/^s\d\d$/.test(k)) { const x = parseJSON(v); if (x) saat[k] = x; }
        return [d, Object.keys(saat).length ? { saat } : null];
      }));
    }

    const sonuc = hesapla({
      realm, simdi: t0, products, ids, modifiers, phase: phaseDoc[`r${realm}`] || null, seed, daily,
      mevsimHazir: realm === 0 ? null : mevsimR0, gecmisDocs, gecmisGiDocs, karneDoc,
      canli, tn: gunici ? (onceki?.tn ?? onceki?.t ?? null) : null, onceki,
    });
    if (realm === 0) mevsimR0 = sonuc.mevsim; // gün içi çalışmada atlanan realm 0 da hesaplanır: R2 mevsim takvimini ondan alır

    if (gunici) {
      if (!onceki?.urun) { ozet.push(`r${realm}: önceki sinyal belgesi yok, gece çalışması bekleniyor`); continue; }
      if (!canli.size) { ozet.push(`r${realm}: canlı veri eski ya da boş, gün içi hesap atlandı`); continue; }
      const tutulan = titresimUygula(sonuc.sinyal.urun, onceki.urun);
      const metin = JSON.stringify(sonuc.sinyal);
      if (metin.length > 900_000) throw new Error(`sinyal belgesi çok büyük (${metin.length} karakter)`);
      writes.push({ type: 'set', path: `meta/sinyal_r${realm}`, data: { data: metin, u: t0 } });
      // Gün içi karne: bu saatin canlı fiyatlı beklentileri (14 gün sonra gece çalışması değerlendirir)
      if (Object.keys(sonuc.gunIci).length) {
        const saat = `s${String(new Date(t0).getUTCHours()).padStart(2, '0')}`;
        writes.push({ type: 'merge', path: `meta/sinyalgecmisgi_r${realm}_${bugun}`, data: { [saat]: JSON.stringify(sonuc.gunIci), u: t0 } });
      }
      const olaySay = Object.values(sonuc.sinyal.urun).reduce((n, qs) => n + Object.values(qs).filter((e) => e.v && e.v[1] === t0).length, 0);
      ozet.push(`r${realm}: gün içi, canlı fiyatla ${sonuc.canliSayi} / ${sonuc.sinyal.sayi} sinyal, yeni olay ${olaySay}, ${tutulan} yön değişimi bekletildi, ${Math.round(metin.length / 1024)} KB`);
      continue;
    }

    // Olay ve evre arşivi (bot bu belgeleri üzerine yazdığı için geçmiş burada birikir)
    const arsiv = parseJSON(meta.get(`meta/olaylar_r${realm}`)?.data) || {};
    for (const x of modifiers?.resourceProductionModifiers || []) {
      if (x?.id != null && (x.realm == null || Number(x.realm) === realm)) arsiv[x.id] = [Number(x.kind), Number(x.speedModifier), x.since, x.until];
    }
    const evreler = parseJSON(meta.get(`meta/evreler_r${realm}`)?.data) || {};
    const ph = phaseDoc[`r${realm}`];
    if (ph?.start) evreler[ph.start] = [ph.phase, ph.start, ph.end];

    const metin = JSON.stringify(sonuc.sinyal);
    if (metin.length > 900_000) throw new Error(`sinyal belgesi çok büyük (${metin.length} karakter)`);
    writes.push(
      { type: 'set', path: `meta/sinyal_r${realm}`, data: { data: metin, u: t0 } },
      { type: 'set', path: `meta/sinyalgecmis_r${realm}_${sonuc.T}`, data: { data: JSON.stringify(sonuc.gecmis), u: t0 } },
      { type: 'set', path: `meta/sinyal_karne_r${realm}`, data: { data: JSON.stringify(sonuc.karne), u: t0 } },
      { type: 'set', path: `meta/olaylar_r${realm}`, data: { data: JSON.stringify(arsiv), u: t0 } },
      { type: 'set', path: `meta/evreler_r${realm}`, data: { data: JSON.stringify(evreler), u: t0 } },
    );
    ozet.push(`r${realm}: son gün ${sonuc.T}, ${sonuc.sinyal.sayi} sinyal, piyasa 7g ${sonuc.sinyal.makro.m7 ?? "yok"}%, mevsimsel ${Object.keys(sonuc.mevsim).length}, karne günü ${Object.keys(sonuc.karne.gunler).length} (gün içi ${Object.keys(sonuc.karne.gunici).length}), ${Math.round(metin.length / 1024)} KB`);

    // İndeks sayfası: endeksin gün gün ve hafta hafta dökümü (sinyal/endeks.mjs). Hata olursa son iyi belge yayında kalır.
    try {
      const ix = endeksOzet(sonuc.S, sonuc.endeks, {
        T: sonuc.T, products, simdi: t0, realm, onceki: parseJSON(meta.get(`meta/endeks_r${realm}`)?.data), evreler, olaylar: arsiv,
      });
      if (ix.yetersiz) {
        ozet.push(`endeks r${realm}: veri yok, yazılmadı`);
      } else {
        const ixMetin = JSON.stringify(ix);
        if (ixMetin.length > 900_000) throw new Error(`belge çok büyük (${ixMetin.length} karakter)`);
        writes.push({ type: 'set', path: `meta/endeks_r${realm}`, data: { data: ixMetin, u: t0 } });
        ozet.push(`endeks r${realm}: ${ix.bas} – ${ix.gun}, ${ix.g.length} gün, ${ix.h.length} hafta, seviye ${ix.g.at(-1)[1]}, ${Math.round(ixMetin.length / 1024)} KB`);
      }
    } catch (e) {
      ozet.push(`endeks r${realm}: hesaplanamadı (${e?.message || e})`);
    }

    // Optimum Seviye (yalnız Realm 0): son 28 günün borsa özeti, aynı seriden (sinyal/optimum.mjs).
    // Hata ya da yetersiz veri olursa yazılmaz, son iyi belge yayında kalır; sinyaller bundan etkilenmez.
    if (realm === 0) {
      try {
        const opt = optimumOzet(sonuc.S, { T: sonuc.T, ids, simdi: t0, realm });
        if (opt.yetersiz) {
          ozet.push(`optimum: yetersiz veri (${opt.k} gün), yazılmadı`);
        } else {
          const optMetin = JSON.stringify(opt);
          if (optMetin.length > 900_000) throw new Error(`belge çok büyük (${optMetin.length} karakter)`);
          writes.push({ type: 'set', path: `meta/optimum_r${realm}`, data: { data: optMetin, u: t0 } });
          ozet.push(`optimum: ${opt.bas} – ${opt.gun}, ${opt.k} gün, ${Object.keys(opt.u).length} ürün, ${Math.round(optMetin.length / 1024)} KB`);
        }
      } catch (e) {
        ozet.push(`optimum: hesaplanamadı (${e?.message || e})`);
      }
    }
  }
  if (writes.length) await db.commit(writes);
  console.log(`DentSimco sinyal (${gunici ? 'gün içi' : 'gece'}) | ${ozet.join(' | ')} | ${((Date.now() - basla) / 1000).toFixed(1)} sn`);
  return { writes, ozet };
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) {
  main().then(() => process.exit(0), (e) => { console.error('HATA:', e?.stack || e); process.exit(1); });
}
