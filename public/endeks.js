// DentSimco — Piyasa › İndeks (yalnız gösterim)
// Hesap sinyal motorunda her gece yapılır (sinyal/endeks.mjs) ve meta/endeks_r{realm} belgesine yazılır. Endeks, sinyallerin
// "piyasa geneli" kısmında kullanılan endeksin aynısıdır: Q0 fiyatları, mevsimsel ürünler hariç, her ürün son 30 günlük
// ortalama işlem tutarıyla ağırlıklı. Bu dosya belgeyi okur; grafik, gün gün tablo ve günlük / haftalık değerlendirme
// metinleri buradaki sayılardan yazılır (gunDegerlendir, haftaDegerlendir: saf işlevler, test/endeks_test.mjs sınar).
//
// Belge: { gun, bas, baz, n, g: [[gün, seviye, getiri, yükselen, düşen, tutar, artılar, eksiler, sektörler]], h: [[ilk gün,
//   son gün, getiri, yükselen, düşen, tutar, artılar, eksiler, sektörler, gün sayısı]], evre: [[başlangıç, evre]],
//   olay: [[ürün, hız %, başlangıç, bitiş]] }. getiri ve katkılar log oran × 10⁴; artı/eksi: [[ürün, ürün getirisi, katkı]].

import { readDocs, dataField, loadBasics, PATHS, DAY, HOUR, dayStart, addDays, fmtDate, fmtMonth, fmtMonthYear, fmtCompact, fmtAgo } from './veri.js';
import { createChart } from './grafik.js';
import { binaAdi } from './adlar.js';
import { DIL, LOCALE } from './i18n.js';
import { esc } from './esc.js';

const PREFS_KEY = 'dentsimco.endeks.v1';
const GUN_MAX = 30; // gün gün tabloda ilk açılışta gösterilen satır
const HAFTA_MAX = 8;

export const RANGES = [
  { key: '1A', en: '1M', name: '1 ay', days: 30 },
  { key: '3A', en: '3M', name: '3 ay', days: 91 },
  { key: '6A', en: '6M', name: '6 ay', days: 182 },
  { key: '1Y', en: '1Y', name: '1 yıl', days: 365 },
  { key: 'T', en: 'All', name: 'Tüm zamanlar', label: 'Tümü', days: Infinity },
];

const SERIES = [
  { key: 'seviye', kind: 'line', z: 10, color: 'var(--s-price)', width: 2.2, glow: 9 },
  { key: 'ort', kind: 'line', z: 8, color: 'var(--s-vwap)', width: 1.5, dash: [4, 4] },
  { key: 'tutar', kind: 'bar', z: 2, color: 'var(--s-vol)', opacity: 0.8 },
];
const SERIES_AD = { seviye: 'İndeks', ort: '20 günlük ortalama', tutar: 'İşlem tutarı' };

// ---- Biçim ----

const nfs = new Map();
const nf = (key, o) => { let f = nfs.get(key); if (!f) nfs.set(key, (f = new Intl.NumberFormat(LOCALE, o))); return f; };
const ret = (g) => Math.expm1(g / 1e4); // log × 10⁴ → oran
export const fmtYuzde = (x) => (x == null || !Number.isFinite(x) ? '—'
  : nf('p2', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(x));
const fmtYuzde1 = (x) => (x == null || !Number.isFinite(x) ? '—'
  : nf('p1', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(x));
const fmtYuzdeMutlak = (x) => nf('pa', { style: 'percent', maximumFractionDigits: 0 }).format(Math.abs(x));
export const fmtSeviye = (x) => (x == null || !Number.isFinite(x) ? '—' : nf('l', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x));
export const fmtPuan = (x) => (x == null || !Number.isFinite(x) ? '—'
  : nf('pt', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(x));
const fmtKat = (x) => nf('k', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x);
const fmtPara = (x) => (x == null || !Number.isFinite(x) ? '—' : `$${fmtCompact(x)}`);
const gunMs = (d) => dayStart(d) + 12 * HOUR;
const fmtGun = (d) => fmtDate(gunMs(d));
const fmtGunUzun = (d) => new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(gunMs(d));
const fmtHaftaGunu = (d) => new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(gunMs(d));
const yonOf = (g) => (g == null ? '' : Math.abs(g) < 5 ? 'yatay' : g > 0 ? 'up' : 'down'); // %0,05'ten küçük hareket yatay sayılır
const sinif = (g) => (g == null || Math.abs(g) < 5 ? '' : g > 0 ? 'up' : 'down');
const EVRE_AD = { recession: 'Resesyon', normal: 'Normal', boom: 'Boom' };

// ---- Veri ----

export async function loadEndeks(r, options) {
  const path = PATHS.meta(`endeks_r${r}`);
  const docs = await readDocs([path], options);
  return dataField(docs.get(path)) || null;
}

function readPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { p = {}; }
  return {
    range: RANGES.some((x) => x.key === p.range) ? p.range : '3A',
    tab: p.tab === 'hafta' ? 'hafta' : 'gun',
    visible: { seviye: true, ort: p.visible?.ort !== false, tutar: p.visible?.tutar !== false },
  };
}
function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* gizli sekme */ }
}

// ---- Değerlendirme (saf) ----
// Madde = parça listesi. Parça: düz metin (Türkçe cümle; sayfa çeviri katmanı çevirir), { urun: id }, { sektor: harf },
// { gun: 'YYYY-AA-GG' }, { deger: metin, yon: 'up'|'down'|'' } (sayı; çevrilmez). Metin parçaları sözlükteki kalıplarla eşleşir.

function oynaklik(g, i, gun = 60) {
  const xs = [];
  for (let j = Math.max(1, i - gun); j < i; j++) if (g[j]?.[2] != null) xs.push(g[j][2]);
  if (xs.length < 20) return null;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

function genislik(yon, up, down) {
  if (yon === 'up') return up >= 1.5 * down ? 'Yükseliş geniş tabanlı: ürünlerin çoğu yükseldi.' : down > up ? 'Ürünlerin çoğu düştü; yükselişi ağırlığı büyük birkaç ürün taşıdı.' : null;
  if (yon === 'down') return down >= 1.5 * up ? 'Düşüş geniş tabanlı: ürünlerin çoğu düştü.' : up > down ? 'Ürünlerin çoğu yükseldi; düşüşü ağırlığı büyük birkaç ürün getirdi.' : null;
  return null;
}

const yogunluk = (liste, g) => (liste[0] && Math.abs(liste[0][2]) > 0.5 * Math.abs(g) ? liste[0][0] : null);

function evreDegisimi(doc, bas, son) {
  return (doc.evre || []).filter(([t]) => String(t).slice(0, 10) >= bas && String(t).slice(0, 10) <= son);
}

// Üretim hızı olayları: indeksi en çok etkileyen ürünlerdeki olaylar adıyla, ötekiler yalnız sayıyla yazılır
function olayMaddeleri(doc, bas, son, ilgili) {
  const out = [];
  let basladi = 0, bitti = 0;
  for (const [k, s, since, until] of doc.olay || []) {
    const b = String(since).slice(0, 10), e = String(until).slice(0, 10);
    const durum = b >= bas && b <= son ? 'başladı' : e >= bas && e <= son ? 'bitti' : b < bas && e > son ? 'sürüyor' : null;
    if (!durum) continue;
    if (!ilgili.has(k)) { if (durum === 'başladı') basladi++; else if (durum === 'bitti') bitti++; continue; }
    const yukari = durum === 'bitti' ? s > 0 : s < 0; // olay bitince etkisi tersine döner
    const hiz = { deger: `${s > 0 ? '+' : '−'}\u2060%${Math.abs(s)}`, yon: yukari ? 'up' : 'down' };
    const not = durum === 'bitti' ? (yukari ? '(arz azalıyor, fiyata yukarı baskı)' : '(arz artıyor, fiyata aşağı baskı)')
      : yukari ? '(arz azalır, fiyata yukarı baskı)' : '(arz artar, fiyata aşağı baskı)';
    out.push([`Üretim hızı olayı ${durum}:`, { urun: k }, hiz, not]);
  }
  if (basladi || bitti) out.push([`Öteki ürünlerde üretim hızı olayı: ${basladi} başladı, ${bitti} bitti.`]);
  return out;
}

const katkiPuan = (onceki, c) => onceki * Math.expm1(c / 1e4);

/**
 * Bir günün değerlendirmesi. i: doc.g içindeki sıra.
 * Dönüş: { gun, yon, getiri (oran), puan, seviye, baslik, maddeler: [[parça…]], arti, eksi, sektor } ya da veri yoksa yon ''.
 */
export function gunDegerlendir(doc, i) {
  const g = doc?.g || [];
  const row = g[i];
  if (!row) return null;
  const [gun, seviye, getiri, up, down, tutar, arti = [], eksi = [], sektor = []] = row;
  if (getiri == null) {
    return { gun, yon: '', seviye, baslik: i === 0 ? 'Başlangıç günü' : 'Veri yok', maddeler: [[i === 0 ? 'Grafik bu günün seviyesiyle başlar.' : 'Bu gün için borsada yeterli işlem verisi yok.']], arti: [], eksi: [], sektor: [] };
  }
  const onceki = g[i - 1]?.[1] ?? seviye;
  const yon = yonOf(getiri);
  const maddeler = [];

  // Büyüklük: son 60 günün olağan günlük hareketine göre
  const s = oynaklik(g, i);
  if (s > 0 && Math.abs(getiri) >= 2 * s) maddeler.push([`Sert hareket: son 60 günün olağan günlük oynaklığının ${fmtKat(Math.abs(getiri) / s)} katı.`]);
  else if (s > 0 && Math.abs(getiri) <= 0.5 * s) maddeler.push(['Sakin gün: hareket olağan günlük oynaklığın yarısından küçük.']);
  if (yon === 'up' || yon === 'down') {
    let n = 0;
    for (let j = i - 1; j >= 1 && g[j]; j--) {
      const x = g[j][2];
      if (x != null && (yon === 'up' ? x >= getiri : x <= getiri)) break;
      n++;
    }
    if (n >= 20) maddeler.push([`Son ${n + 1} günün en büyük ${yon === 'up' ? 'yükselişi' : 'düşüşü'}.`]);
  }

  // Genişlik: kaç ürün yükseldi, kaç ürün düştü
  const gen = genislik(yon, up, down);
  maddeler.push([...(gen ? [gen] : []), `Yükselen ürün: ${up}, düşen ürün: ${down}.`]);

  // Sürükleyenler
  const yonde = yon === 'down' ? eksi : arti;
  if (yon !== 'yatay' && yonde[0]) {
    const tek = yogunluk(yonde, getiri);
    if (tek != null) maddeler.push(['Hareketin yarısından fazlası tek üründen geldi:', { urun: tek }]);
    else maddeler.push([yon === 'up' ? 'En çok yukarı çeken:' : 'En çok aşağı çeken:', { urun: yonde[0][0] }, { deger: fmtYuzde(ret(yonde[0][1])), yon: sinif(yonde[0][1]) }]);
  }
  const sek = sektor.find(([, c]) => (yon === 'down' ? c < 0 : c > 0));
  if (yon !== 'yatay' && sek) maddeler.push(['Bina türüne göre en büyük etki:', { sektor: sek[0] }, { deger: `${fmtPuan(katkiPuan(onceki, sek[1]))} puan`, yon: sinif(sek[1]) }]);

  // Hacim: işlem tutarı son 20 günün ortalamasına göre
  const gecmis = [];
  for (let j = Math.max(1, i - 20); j < i; j++) if (g[j]?.[2] != null && g[j][5] > 0) gecmis.push(g[j][5]);
  if (gecmis.length >= 10 && tutar > 0) {
    const ort = gecmis.reduce((a, b) => a + b, 0) / gecmis.length;
    const fark = tutar / ort - 1;
    if (fark >= 0.25) maddeler.push([`İşlem tutarı 20 günlük ortalamanın ${fmtYuzdeMutlak(fark)} üstünde: hareket güçlü işlemle geldi.`]);
    else if (fark <= -0.25) maddeler.push([`İşlem tutarı 20 günlük ortalamanın ${fmtYuzdeMutlak(fark)} altında: işlem az, hareket zayıf kalabilir.`]);
  }

  // Seri: üst üste kaçıncı gün, ya da yön dönüşü
  if (yon === 'up' || yon === 'down') {
    let n = 1;
    for (let j = i - 1; j >= 1 && yonOf(g[j]?.[2]) === yon; j--) n++;
    if (n >= 3) maddeler.push([`Üst üste ${n}. ${yon === 'up' ? 'yükseliş' : 'düşüş'} günü.`]);
    else if (n === 1) {
      let m = 0;
      const ters = yon === 'up' ? 'down' : 'up';
      for (let j = i - 1; j >= 1 && yonOf(g[j]?.[2]) === ters; j--) m++;
      if (m >= 3) maddeler.push([`${m} günlük ${ters === 'down' ? 'düşüşten' : 'yükselişten'} sonra ilk ${yon === 'up' ? 'yükseliş' : 'düşüş'}.`]);
    }
  }

  // Ekonomi evresi (cuma günü değişir; etkisi değişim günü ve ertesi gün görülür) ve üretim hızı olayları
  for (const [t, ad] of evreDegisimi(doc, addDays(gun, -1), gun)) {
    maddeler.push(['Ekonomi evresi değişti:', { deger: EVRE_AD[ad] || ad }, { gun: String(t).slice(0, 10) }]);
    maddeler.push(['Evre değişiminden sonraki ilk günlerde fiyatlar yeni evreye göre yeniden ayarlanır.']);
  }
  const ilgili = new Set([...arti, ...eksi].map(([id]) => id));
  maddeler.push(...olayMaddeleri(doc, gun, gun, ilgili));

  const baslik = yon === 'up' ? 'İndeks yükseldi' : yon === 'down' ? 'İndeks düştü' : 'İndeks yatay';
  return { gun, yon, getiri: ret(getiri), puan: seviye - onceki, seviye, onceki, baslik, maddeler, arti, eksi, sektor };
}

/** Bir haftanın değerlendirmesi. k: doc.h içindeki sıra. */
export function haftaDegerlendir(doc, k) {
  const h = doc?.h || [];
  const row = h[k];
  if (!row) return null;
  const [bas, son, getiri, up, down, tutar, arti = [], eksi = [], sektor = [], n] = row;
  const g = doc.g || [];
  const i0 = g.findIndex((r) => r[0] === bas);
  const i1 = g.findIndex((r) => r[0] === son);
  const acilis = g[i0 - 1]?.[1] ?? g[i0]?.[1];
  const kapanis = g[i1]?.[1];
  const yon = yonOf(getiri);
  const suruyor = son === doc.gun && n < 7 && new Date(dayStart(son)).getUTCDay() !== 0;
  const maddeler = [];

  if (suruyor) maddeler.push([`Hafta sürüyor: ${n} günlük veri.`]);

  // Günler: kaç gün yükseldi, en iyi ve en kötü gün
  const gunler = g.slice(i0, i1 + 1).filter((r) => r[2] != null);
  const artiGun = gunler.filter((r) => yonOf(r[2]) === 'up').length;
  const eksiGun = gunler.filter((r) => yonOf(r[2]) === 'down').length;
  maddeler.push([`Hafta içinde ${artiGun} gün yükseliş, ${eksiGun} gün düşüş.`]);
  if (gunler.length >= 2) {
    const enIyi = gunler.reduce((a, b) => (b[2] > a[2] ? b : a));
    const enKotu = gunler.reduce((a, b) => (b[2] < a[2] ? b : a));
    if (enIyi[2] > 0) maddeler.push(['En iyi gün:', { gun: enIyi[0] }, { deger: fmtYuzde(ret(enIyi[2])), yon: 'up' }]);
    if (enKotu[2] < 0) maddeler.push(['En kötü gün:', { gun: enKotu[0] }, { deger: fmtYuzde(ret(enKotu[2])), yon: 'down' }]);
  }

  const gen = genislik(yon, up, down);
  maddeler.push([...(gen ? [gen] : []), `Yükselen ürün: ${up}, düşen ürün: ${down}.`]);

  const yonde = yon === 'down' ? eksi : arti;
  if (yon !== 'yatay' && yonde[0]) {
    const tek = yogunluk(yonde, getiri);
    if (tek != null) maddeler.push(['Hareketin yarısından fazlası tek üründen geldi:', { urun: tek }]);
    else maddeler.push([yon === 'up' ? 'En çok yukarı çeken:' : 'En çok aşağı çeken:', { urun: yonde[0][0] }, { deger: fmtYuzde(ret(yonde[0][1])), yon: sinif(yonde[0][1]) }]);
  }
  const sek = sektor.find(([, c]) => (yon === 'down' ? c < 0 : c > 0));
  if (yon !== 'yatay' && sek) maddeler.push(['Bina türüne göre en büyük etki:', { sektor: sek[0] }, { deger: `${fmtPuan(katkiPuan(acilis, sek[1]))} puan`, yon: sinif(sek[1]) }]);

  // Önceki hafta ve son 4 hafta
  const once = h[k - 1];
  if (once && once[2] != null) {
    const oy = yonOf(once[2]);
    if (yon === 'up' && oy === 'up') maddeler.push(['Önceki hafta da yükselişteydi: yükseliş sürüyor.']);
    else if (yon === 'down' && oy === 'down') maddeler.push(['Önceki hafta da düşüşteydi: düşüş sürüyor.']);
    else if (yon === 'up' && oy === 'down') maddeler.push(['Önceki haftanın düşüşü tersine döndü.']);
    else if (yon === 'down' && oy === 'up') maddeler.push(['Önceki haftanın yükselişi tersine döndü.']);
  }
  const dortOnce = h[k - 4];
  if (dortOnce) {
    const j = g.findIndex((r) => r[0] === dortOnce[1]);
    if (j >= 0 && kapanis > 0) {
      const x = kapanis / g[j][1] - 1;
      maddeler.push([`Son 4 haftada indeks ${x >= 0 ? 'yükseldi' : 'düştü'}:`, { deger: fmtYuzde(x), yon: x > 0.0005 ? 'up' : x < -0.0005 ? 'down' : '' }]);
    }
  }

  // Hacim: günlük ortalama işlem tutarı önceki 4 haftaya göre
  const gecmis = h.slice(Math.max(0, k - 4), k).filter((x) => x[9] > 0);
  if (gecmis.length >= 2 && n > 0 && tutar > 0) {
    const ort = gecmis.reduce((a, x) => a + x[5] / x[9], 0) / gecmis.length;
    const fark = tutar / n / ort - 1;
    if (fark >= 0.15) maddeler.push([`Günlük ortalama işlem tutarı önceki 4 haftanın ${fmtYuzdeMutlak(fark)} üstünde.`]);
    else if (fark <= -0.15) maddeler.push([`Günlük ortalama işlem tutarı önceki 4 haftanın ${fmtYuzdeMutlak(fark)} altında.`]);
  }

  for (const [t, ad] of evreDegisimi(doc, bas, son)) {
    maddeler.push(['Ekonomi evresi değişti:', { deger: EVRE_AD[ad] || ad }, { gun: String(t).slice(0, 10) }]);
  }
  const ilgili = new Set([...arti, ...eksi].map(([id]) => id));
  maddeler.push(...olayMaddeleri(doc, bas, son, ilgili));

  const baslik = suruyor
    ? (yon === 'up' ? 'Hafta sürüyor: şimdilik yükselişte' : yon === 'down' ? 'Hafta sürüyor: şimdilik düşüşte' : 'Hafta sürüyor: şimdilik yatay')
    : (yon === 'up' ? 'Hafta yükselişle kapandı' : yon === 'down' ? 'Hafta düşüşle kapandı' : 'Hafta yatay kapandı');
  return { bas, son, yon, suruyor, getiri: ret(getiri), puan: kapanis - acilis, acilis, kapanis, baslik, maddeler, arti, eksi, sektor };
}

// Aralık değişimi: son seviye, `gun` gün önceki seviyeye göre (o gün yoksa ilk satıra göre)
export function donemDegisimi(doc, gun) {
  const g = doc?.g || [];
  if (g.length < 2) return null;
  const son = g[g.length - 1];
  const hedef = addDays(son[0], -gun);
  let ilk = g[0];
  for (const r of g) { if (r[0] <= hedef) ilk = r; else break; }
  return ilk === son ? null : son[1] / ilk[1] - 1;
}

// ---- Grafik verisi ----

export function seriKur(doc, range) {
  const g = doc?.g || [];
  const rg = RANGES.find((x) => x.key === range) || RANGES[1];
  const son = g.length ? g[g.length - 1][0] : null;
  const ilk = son && Number.isFinite(rg.days) ? addDays(son, -rg.days) : '';
  const xs = [], seviye = [], ort = [], tutar = [], idx = [];
  g.forEach((r, i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - 19); j <= i; j++) { s += g[j][1]; n++; }
    if (r[0] < ilk) return;
    xs.push(gunMs(r[0]));
    seviye.push(r[1]);
    ort.push(i >= 19 ? s / n : null);
    tutar.push(r[5] > 0 ? r[5] : null);
    idx.push(i);
  });
  return { xs, values: { seviye, ort, tutar }, daily: true, idx };
}

// ---- Sayfa ----

const SAYFA = `
<section class="sy ix">
  <div class="sy-head">
    <div>
      <h1 class="sy-title">İndeks</h1>
      <p class="sy-when" data-el="when">Yükleniyor</p>
    </div>
    <button type="button" class="icon-btn" data-el="reload" aria-label="İndeksi yenile" title="Yenile"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M16.2 10a6.2 6.2 0 1 1-1.9-4.5M16.4 3.4v3.4H13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </div>
  <div class="alert" data-el="alert" role="alert" hidden><span data-el="alertText"></span></div>
  <div class="ix-hero" data-el="hero"></div>
  <div class="plot" data-el="plot" aria-busy="true">
    <div class="ranges" data-el="ranges" role="radiogroup" aria-label="Zaman aralığı">
      ${RANGES.map((r) => `<button type="button" role="radio" data-range="${r.key}" aria-checked="false" aria-label="${r.name}" tabindex="-1"><span data-no-t>${DIL === 'tr' ? r.label || r.key : r.key === 'T' ? 'All' : r.en}</span></button>`).join('')}
    </div>
    <div class="legend" data-el="legend">
      ${SERIES.map((s) => `<button type="button" class="lg" data-key="${s.key}" aria-pressed="true"${s.key === 'seviye' ? ' disabled' : ''}>
        <span class="lg-head"><i class="sw ${s.kind === 'bar' ? 'bar' : s.dash ? 'dash' : ''}" style="--c:${s.color}" aria-hidden="true"></i><span class="lg-label">${SERIES_AD[s.key]}</span></span>
        <span class="lg-val" data-val="${s.key}">—</span></button>`).join('')}
    </div>
    <p class="when" data-el="point"></p>
    <div class="chart" data-el="chart"></div>
    <p class="foot">Grafiğe dokunup sürükleyince o günün değerleri görünür; dokunduğun gün aşağıda değerlendirilir.</p>
  </div>
  <div class="sy-tabs" role="tablist" aria-label="Değerlendirme" data-el="tabs">
    <button type="button" role="tab" data-tab="gun" aria-selected="true">Günlük</button>
    <button type="button" role="tab" data-tab="hafta" aria-selected="false">Haftalık</button>
  </div>
  <div class="sy-body" data-el="body"></div>
  <p class="sy-note">İndeks, borsadaki ürünlerin Q0 fiyatlarından her gece hesaplanır (mevsimsel ürünler hariç). Her ürünün ağırlığı son 30 günlük ortalama işlem tutarıdır: çok işlem gören ürün indeksi daha çok etkiler. Günlük değişim, ürünlerin gün ortalaması fiyatının (VWAP) önceki güne göre değişiminin ağırlıklı ortalamasıdır. Katkı, bir ürünün ya da bina türünün o günkü değişime puan olarak payıdır; katkıların toplamı günün değişimini verir. Sinyallerdeki "piyasa geneli" bu indekse dayanır.</p>
</section>`;

export function mountEndeks(root, { realm = 0 } = {}) {
  root.innerHTML = SAYFA;
  const el = {};
  root.querySelectorAll('[data-el]').forEach((n) => { el[n.dataset.el] = n; });
  const prefs = readPrefs();
  let r = realm;
  let doc = null;
  let products = {};
  let token = 0;
  let destroyed = false;
  let secili = null; // seçili gün (doc.g sırası); null = son gün
  let hover = null;
  let sonHover = null; // grafikte en son üstünde durulan nokta (dokunma bırakılınca hover sıfırlanır; tıklama bunu seçer)
  let shown = null;
  let yukleniyor = true;
  let acikGun = false;
  let acikHafta = false;

  const adOf = (id) => products?.[id]?.name || `Ürün ${id}`;

  const chart = createChart(el.chart, {
    series: SERIES.map((s) => ({ ...s, visible: prefs.visible[s.key] !== false })),
    formatPrice: (v, step) => nf(`ax${step < 1 ? 2 : step < 10 ? 1 : 0}`, { maximumFractionDigits: step < 1 ? 2 : step < 10 ? 1 : 0 }).format(v),
    formatVolume: fmtPara,
    formatTick: (t, step) => {
      const d = new Date(t);
      if (step < 28 * DAY) return fmtDate(t);
      return d.getMonth() === 0 ? fmtMonthYear(t) : fmtMonth(t);
    },
    formatPoint: (t) => fmtDate(t),
    onHover: (i) => {
      hover = i;
      if (i != null) sonHover = i;
      legend();
    },
  });

  async function refresh(fresh = false) {
    const my = ++token;
    el.reload.classList.add('spin');
    el.plot.setAttribute('aria-busy', 'true');
    try {
      const [d, b] = await Promise.all([
        loadEndeks(r, fresh ? { refresh: (p) => p.startsWith('meta/endeks_') } : undefined),
        loadBasics(r).catch(() => null),
      ]);
      if (my !== token || destroyed) return;
      yukleniyor = false;
      doc = d?.g?.length ? d : null;
      products = b?.products || {};
      el.alert.hidden = true;
      secili = null;
      render('sweep');
    } catch (e) {
      if (my !== token || destroyed) return;
      yukleniyor = false;
      el.alertText.textContent = e?.message || String(e);
      el.alert.hidden = false;
    } finally {
      if (my === token && !destroyed) { el.reload.classList.remove('spin'); el.plot.setAttribute('aria-busy', 'false'); }
    }
  }

  // ---- Parçalar ----

  function parcaHtml(p) {
    if (typeof p === 'string') return `<span>${esc(p)}</span>`;
    if (p.urun != null) return `<b class="ix-ad" data-no-t>${esc(adOf(p.urun))}</b>`;
    if (p.sektor != null) return `<b class="ix-ad" data-no-t>${esc(binaAdi(p.sektor))}</b>`;
    if (p.gun) return `<span class="ix-num" data-no-t>${esc(fmtHaftaGunu(p.gun))}</span>`;
    return `<b class="ix-num ${p.yon || ''}">${esc(p.deger)}</b>`;
  }
  const maddeHtml = (m) => `<li>${m.map(parcaHtml).join(' ')}</li>`;

  function katkiListesi(baslik, liste, onceki, bos) {
    const satir = liste.map(([id, rr, c]) => `<li><span class="ix-ad" data-no-t>${esc(adOf(id))}</span>
      <span class="ix-num ${sinif(rr)}">${esc(fmtYuzde(ret(rr)))}</span>
      <span class="ix-num ix-pt ${sinif(c)}">${esc(fmtPuan(katkiPuan(onceki, c)))}</span></li>`).join('');
    return `<div class="ix-col"><h3 class="ix-h3">${esc(baslik)}</h3>${liste.length ? `<ul class="ix-kat">${satir}</ul>` : `<p class="sy-empty">${esc(bos)}</p>`}</div>`;
  }

  function sektorListesi(liste, onceki) {
    if (!liste.length) return '';
    const max = Math.max(...liste.map(([, c]) => Math.abs(c)), 1e-9);
    return `<div class="ix-sek"><h3 class="ix-h3">Bina türlerine göre katkı</h3><ul>${liste.map(([b, c]) => `<li>
      <span class="ix-ad" data-no-t>${esc(binaAdi(b))}</span>
      <span class="ix-bar" aria-hidden="true"><i class="${c >= 0 ? 'up' : 'down'}" style="width:${Math.max(2, Math.round((Math.abs(c) / max) * 100))}%"></i></span>
      <span class="ix-num ${sinif(c)}">${esc(fmtPuan(katkiPuan(onceki, c)))}</span></li>`).join('')}</ul></div>`;
  }

  function degerlendirmeKarti(x, { ust, baslik, onceki }) {
    const deg = x.getiri != null ? `<b class="ix-num ${sinif(Math.log1p(x.getiri) * 1e4)}">${esc(fmtYuzde(x.getiri))}</b> <span class="ix-num ${sinif(Math.log1p(x.getiri) * 1e4)}">${esc(fmtPuan(x.puan))}</span> <span>puan</span>` : '';
    return `<section class="sy-block ix-card">
      <p class="ix-ust" data-no-t>${esc(ust)}</p>
      <h2 class="ix-baslik"><span data-yon="${x.yon}">${esc(baslik)}</span> ${deg}</h2>
      <ul class="sg-why ix-why">${x.maddeler.map(maddeHtml).join('')}</ul>
      ${x.getiri != null ? `<div class="sy-pair ix-pair">${katkiListesi('Yukarı çekenler', x.arti, onceki, 'Yukarı çeken ürün yok.')}${katkiListesi('Aşağı çekenler', x.eksi, onceki, 'Aşağı çeken ürün yok.')}</div>${sektorListesi(x.sektor, onceki)}` : ''}
    </section>`;
  }

  // ---- Çizim ----

  function hero() {
    if (!doc && yukleniyor) { el.hero.innerHTML = ''; return; }
    if (!doc) {
      el.hero.innerHTML = `<p class="sy-big">${r === 1 ? 'R2 için indeks henüz hesaplanmadı' : 'İndeks henüz hesaplanmadı'}</p>
        <p class="sy-line">${r === 1 ? 'R2 için geçmiş veri az: indeks, ürünlerin çoğunda en az 60 günlük işlem verisi biriktiğinde hesaplanmaya başlar.' : 'İndeks her gece sinyallerle birlikte hesaplanır. Biraz sonra tekrar dene.'}</p>`;
      return;
    }
    const g = doc.g;
    const son = g[g.length - 1];
    const gx = gunDegerlendir(doc, g.length - 1);
    const kutu = (ad, x, alt = '') => `<div><dt>${esc(ad)}</dt><dd class="${x == null ? '' : x > 0.00005 ? 'up' : x < -0.00005 ? 'down' : ''}">${esc(fmtYuzde(x))}${alt}</dd></div>`;
    const ilkGun = g[0][0];
    el.hero.innerHTML = `
      <div class="hero-price"><span class="price" data-no-t>${esc(fmtSeviye(son[1]))}</span>
        <span class="chg ${sinif(son[2])}">${esc(fmtYuzde(gx.getiri))} · ${esc(fmtPuan(gx.puan))}</span> <span class="chg ${sinif(son[2])}">puan</span></div>
      <p class="sy-line"><span>${esc(gx.baslik)}</span> <span data-no-t>(${esc(fmtGunUzun(son[0]))})</span></p>
      <dl class="figs">
        ${kutu('Son 7 gün', donemDegisimi(doc, 7))}
        ${kutu('Son 30 gün', donemDegisimi(doc, 30))}
        ${kutu('Son 90 gün', donemDegisimi(doc, 90))}
        ${kutu(`${fmtGun(ilkGun)} tarihinden beri`, son[1] / g[0][1] - 1)}
      </dl>`;
  }

  function ranges() {
    for (const b of el.ranges.querySelectorAll('[data-range]')) {
      const on = b.dataset.range === prefs.range;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  function legend() {
    for (const b of el.legend.querySelectorAll('.lg')) b.setAttribute('aria-pressed', String(prefs.visible[b.dataset.key] !== false));
    const i = hover != null ? hover : shown?.xs.length ? shown.xs.length - 1 : null;
    const val = (k) => (i == null ? null : shown.values[k][i]);
    el.legend.querySelector('[data-val="seviye"]').textContent = fmtSeviye(val('seviye'));
    el.legend.querySelector('[data-val="ort"]').textContent = fmtSeviye(val('ort'));
    el.legend.querySelector('[data-val="tutar"]').textContent = fmtPara(val('tutar'));
    const row = i == null ? null : doc?.g[shown.idx[i]];
    el.point.innerHTML = row ? `<span data-no-t>${esc(fmtGunUzun(row[0]))}</span> · <span class="${sinif(row[2])}">${esc(row[2] == null ? '—' : fmtYuzde(ret(row[2])))}</span>` : '';
  }

  function grafik(transition) {
    shown = doc ? seriKur(doc, prefs.range) : null;
    chart.setData(shown?.xs.length ? shown : null, transition);
    chart.setMessage(shown?.xs.length ? null : 'İndeks verisi yok.');
    chart.setLabel('İndeks grafiği');
    hover = null;
    sonHover = null;
    legend();
  }

  function gunKarti() {
    const box = el.body.querySelector('[data-el="gunkart"]');
    if (!box || !doc) return;
    const i = secili ?? doc.g.length - 1;
    const x = gunDegerlendir(doc, i);
    box.innerHTML = degerlendirmeKarti(x, { ust: fmtGunUzun(x.gun), baslik: x.baslik, onceki: x.onceki ?? x.seviye });
    for (const tr of el.body.querySelectorAll('tr[data-i]')) tr.classList.toggle('sel', Number(tr.dataset.i) === i);
  }

  function gunTablosu() {
    const g = doc.g;
    const sira = [];
    for (let i = g.length - 1; i >= 1; i--) sira.push(i);
    const goster = acikGun ? sira : sira.slice(0, GUN_MAX);
    const satir = goster.map((i) => {
      const [gun, lv, gt, up, down, tutar, arti = [], eksi = []] = g[i];
      const yon = yonOf(gt);
      const ana = (yon === 'down' ? eksi : arti)[0];
      return `<tr data-i="${i}" tabindex="0">
        <th scope="row" data-no-t>${esc(fmtHaftaGunu(gun))}</th>
        <td>${esc(fmtSeviye(lv))}</td>
        <td class="${sinif(gt)}">${esc(gt == null ? '—' : fmtYuzde(ret(gt)))}</td>
        <td class="${sinif(gt)}">${esc(gt == null ? '—' : fmtPuan(lv - g[i - 1][1]))}</td>
        <td><span class="up">${up}</span> / <span class="down">${down}</span></td>
        <td>${esc(fmtPara(tutar))}</td>
        <td class="ix-ana" data-no-t>${ana && yon !== 'yatay' ? esc(adOf(ana[0])) : '—'}</td></tr>`;
    }).join('');
    const more = !acikGun && sira.length > GUN_MAX ? `<button type="button" class="sy-more" data-more="gun">Tümünü göster (${sira.length})</button>` : '';
    return `<section class="sy-block"><h2 class="sy-h2">Gün gün hesap <span class="sy-count">${sira.length}</span></h2>
      <p class="sy-hint">Bir güne dokununca yukarıda o günün değerlendirmesi açılır. Puan, indeksin önceki güne göre değişimidir. En büyük etki: o günün yönünde indekse en çok katkı yapan ürün.</p>
      <div class="table-wrap"><table class="qt ix-tablo"><thead><tr><th scope="col">Gün</th><th scope="col">Seviye</th><th scope="col">Değişim</th><th scope="col">Puan</th><th scope="col">Yükselen / Düşen</th><th scope="col">İşlem tutarı</th><th scope="col">En büyük etki</th></tr></thead>
      <tbody>${satir}</tbody></table></div>${more}</section>`;
  }

  function haftalar() {
    const h = doc.h || [];
    if (!h.length) return '<section class="sy-block"><p class="sy-empty">Henüz tamamlanan hafta yok.</p></section>';
    const sira = [];
    for (let k = h.length - 1; k >= 0; k--) sira.push(k);
    const goster = acikHafta ? sira : sira.slice(0, HAFTA_MAX);
    const kartlar = goster.map((k) => {
      const x = haftaDegerlendir(doc, k);
      return degerlendirmeKarti(x, { ust: `${fmtGun(x.bas)} – ${fmtGun(x.son)} · ${fmtSeviye(x.acilis)} → ${fmtSeviye(x.kapanis)}`, baslik: x.baslik, onceki: x.acilis });
    }).join('');
    const more = !acikHafta && sira.length > HAFTA_MAX ? `<button type="button" class="sy-more" data-more="hafta">Tümünü göster (${sira.length})</button>` : '';
    return `${kartlar}${more}`;
  }

  function body() {
    for (const b of el.tabs.querySelectorAll('[data-tab]')) {
      const on = b.dataset.tab === prefs.tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (!doc) { el.body.innerHTML = ''; return; }
    if (prefs.tab === 'hafta') { el.body.innerHTML = haftalar(); return; }
    el.body.innerHTML = `<div data-el="gunkart"></div>${gunTablosu()}`;
    gunKarti();
  }

  function render(transition = 'update') {
    if (doc) {
      const yas = Date.now() - Number(doc.t);
      el.when.textContent = `Son tam gün: ${fmtGun(doc.gun)} · ${doc.n} ürün · hesap ${fmtAgo(Number(doc.t))}`;
      el.when.classList.toggle('stale', yas > 36 * HOUR);
    } else {
      el.when.textContent = 'Veri yok';
      el.when.classList.remove('stale');
    }
    hero();
    ranges();
    grafik(transition);
    body();
  }

  // ---- Olaylar ----

  function onClick(e) {
    const rb = e.target.closest('[data-range]');
    if (rb) { prefs.range = rb.dataset.range; savePrefs(prefs); ranges(); grafik('sweep'); return; }
    const lg = e.target.closest('.lg');
    if (lg && lg.dataset.key !== 'seviye') {
      const k = lg.dataset.key;
      prefs.visible[k] = prefs.visible[k] === false;
      savePrefs(prefs);
      chart.setVisible(k, prefs.visible[k]);
      legend();
      return;
    }
    const tab = e.target.closest('[data-tab]');
    if (tab) { prefs.tab = tab.dataset.tab; savePrefs(prefs); body(); return; }
    const more = e.target.closest('[data-more]');
    if (more) { if (more.dataset.more === 'gun') acikGun = true; else acikHafta = true; body(); return; }
    const tr = e.target.closest('tr[data-i]');
    if (tr) secGun(Number(tr.dataset.i));
  }

  // Grafikte bir güne tıklayınca / dokununca o gün Günlük sekmesinde değerlendirilir
  function onChartClick() {
    const i = shown?.idx[hover ?? sonHover];
    if (i == null || !doc?.g[i]) return;
    if (prefs.tab !== 'gun') { prefs.tab = 'gun'; savePrefs(prefs); body(); }
    secGun(i);
  }

  function secGun(i) {
    secili = i;
    gunKarti();
    el.body.querySelector('[data-el="gunkart"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function onKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      const tr = e.target.closest?.('tr[data-i]');
      if (tr) { e.preventDefault(); secGun(Number(tr.dataset.i)); return; }
    }
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const grup = el.tabs.contains(e.target) ? el.tabs : el.ranges.contains(e.target) ? el.ranges : null;
    if (!grup) return;
    const items = [...grup.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items[j].click();
    items[j].focus();
  }

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  el.reload.addEventListener('click', () => refresh(true));
  el.chart.addEventListener('click', onChartClick);
  document.title = 'İndeks | DentSimco';
  render('none');
  refresh();

  return {
    setRealm(next) {
      if (next === r) return;
      r = next;
      doc = null;
      yukleniyor = true;
      render('none');
      el.when.textContent = 'Yükleniyor';
      refresh();
    },
    destroy() {
      destroyed = true;
      token++;
      chart.destroy();
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      root.replaceChildren();
    },
  };
}
