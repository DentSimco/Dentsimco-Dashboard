// DentSimco — Şirket geçmişi (son 30 gün): veri okuma, birleştirme ve çizgi grafik (saf; DOM kullanmaz).
// Veri (bot/history.mjs ve history_backfill.mjs yazar):
//   meta/rhist_r{realm}_{NNN}    günlük birikim, NNN = şirket numarası % 256 (3 hane)
//   meta/rhistbf_r{realm}_{NNN}  geri doldurma (ilk 30 gün); günlük geçmiş 30 güne tamamlanınca bot siler
//   gün = [YYYYMMDD, sıra, evaSırası (1 en iyi, 0 yok), değer, bina, patent, işçi (×100), bono, ayrıntıVar]  artan tarih
// İki belge tarihe göre birleştirilir; aynı gün ikisinde de varsa ayrıntısı olan ya da günlük olan geçer.

import { PATHS, readDocs, dataField } from './veri.js';
import { LOCALE } from './i18n.js';

export const GUN_SAYISI = 30;
export const PARCA = 256;
const histYolu = (r, id) => `meta/rhist_r${r}_${String(Number(id) % PARCA).padStart(3, '0')}`;
const bfYolu = (r, id) => `meta/rhistbf_r${r}_${String(Number(id) % PARCA).padStart(3, '0')}`;

// Gün sütunları: [anahtar, başlık, gün dizisindeki sıra, tür]. tür: usd | sira | sayi. sira: küçük iyidir.
export const METRIKLER = [
  { key: 'value', ad: 'Şirket değeri', i: 3, tur: 'usd' },
  { key: 'rank', ad: 'Sıra', i: 1, tur: 'sira' },
  { key: 'eva', ad: 'EVA sırası', i: 2, tur: 'sira' },
  { key: 'buildings', ad: 'Bina değeri', i: 4, tur: 'usd' },
  { key: 'patents', ad: 'Patent değeri', i: 5, tur: 'usd' },
  { key: 'workers', ad: 'İşçi', i: 6, tur: 'sayi', bol: 100 },
  { key: 'bonds', ad: 'Satılan bono', i: 7, tur: 'usd' },
];

// Bir günün ölçüt değeri; yoksa (ayrıntı gelmemiş, EVA yok) null
export function metrikDegeri(m, gun) {
  const v = gun?.[m.i];
  if (v == null || !Number.isFinite(v)) return null;
  if (m.key === 'eva' && v <= 0) return null;
  return m.bol ? v / m.bol : v;
}

const ordinal = (day) => Date.UTC(Math.floor(day / 10000), Math.floor(day / 100) % 100 - 1, day % 100) / 86400000;
export const gunMetni = (day, secenek = { day: 'numeric', month: 'short' }) => new Date(ordinal(day) * 86400000).toLocaleDateString(LOCALE, { timeZone: 'UTC', ...secenek });

// Günlük ve geri doldurma günlerini birleştirir; son tarihten geriye 30 günlük pencere kalır. Sonuç artan tarihli.
export function gecmisBirlestir(gunluk, geriDoldurma) {
  const out = new Map();
  for (const [liste, oncelik] of [[geriDoldurma, 0], [gunluk, 1]]) {
    for (const g of Array.isArray(liste) ? liste : []) {
      if (!Array.isArray(g) || !Number.isFinite(g[0])) continue;
      const var_ = out.get(g[0]);
      if (!var_ || (g[8] === 1 && var_[8] !== 1) || (g[8] === var_[8] && oncelik === 1)) out.set(g[0], g);
    }
  }
  const days = [...out.values()].sort((a, b) => a[0] - b[0]);
  if (!days.length) return days;
  const son = ordinal(days.at(-1)[0]);
  return days.filter((g) => son - ordinal(g[0]) < GUN_SAYISI);
}

// ids için geçmiş: Map(id → gün listesi). Veri yoksa ya da şirket geçmişte yoksa listesi boş.
export async function gecmisYukle(realm, ids) {
  const list = [...new Set(ids.map(Number))];
  const yollar = new Set();
  for (const id of list) { yollar.add(histYolu(realm, id)); yollar.add(bfYolu(realm, id)); }
  const docs = await readDocs([...yollar]);
  const out = new Map();
  for (const id of list) {
    const gunluk = dataField(docs.get(histYolu(realm, id)))?.[id];
    const bf = dataField(docs.get(bfYolu(realm, id)))?.[id];
    out.set(id, gecmisBirlestir(gunluk, bf));
  }
  return out;
}

// Gün gün tablo için farklar: her satır { gun, sira, siraFark, eva, evaFark, deger, degerFark, degerYuzde, bina, binaFark, patent, patentFark, isci, iciFark, bono, bonoFark }.
// Fark, bir önceki günle; ilk günde yok (null). Sıra ve EVA farkı: + iyileşme (küçülen sıra).
export function gunFarklari(days) {
  const fark = (a, b) => (a == null || b == null ? null : a - b);
  return days.map((g, i) => {
    const p = days[i - 1];
    const sira = metrikDegeri(METRIKLER[1], g);
    const eva = metrikDegeri(METRIKLER[2], g);
    const deger = g[3];
    const pEva = p ? metrikDegeri(METRIKLER[2], p) : null;
    return {
      gun: g[0], sira, siraFark: p ? fark(p[1], g[1]) : null, eva, evaFark: fark(pEva, eva),
      deger, degerFark: p ? fark(g[3], p[3]) : null, degerYuzde: p && p[3] ? (g[3] - p[3]) / p[3] : null,
      bina: g[4], binaFark: p ? fark(g[4], p[4]) : null, patent: g[5], patentFark: p ? fark(g[5], p[5]) : null,
      isci: g[6] == null ? null : g[6] / 100, isciFark: p ? fark(g[6] == null ? null : g[6] / 100, p[6] == null ? null : p[6] / 100) : null,
      bono: g[7], bonoFark: p ? fark(g[7], p[7]) : null,
    };
  });
}

// Bir ölçütün seri noktaları: [[YYYYMMDD, değer | null], ...]
export const seriNoktalari = (days, m) => days.map((g) => [g[0], metrikDegeri(m, g)]);

// Kıyas için ilk güne göre yüzde değişim noktaları (ilk geçerli değer 0 %); değer 0 ya da yoksa null
export function yuzdeNoktalari(noktalar) {
  const ilk = noktalar.find(([, v]) => v != null && v !== 0)?.[1];
  if (ilk == null) return noktalar.map(([d]) => [d, null]);
  return noktalar.map(([d, v]) => [d, v == null ? null : ((v - ilk) / Math.abs(ilk)) * 100]);
}

// ---- Çizgi grafik (SVG metni) ----
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Renk körlüğüne uygun (Okabe-Ito) beş ayrı ton; gündüz ve gece temasında okunur
export const RENKLER = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00'];
const KOMPAKT = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 2 });
const TAM = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

export function degerMetni(m, v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return m.tur === 'usd' ? `$${TAM.format(v)}` : TAM.format(v);
}
export function eksenMetni(m, v) {
  if (m.tur === 'usd') return `$${KOMPAKT.format(v)}`;
  return Math.abs(v) >= 100000 ? KOMPAKT.format(v) : TAM.format(v);
}

/**
 * seriler: [{ ad, renk, noktalar: [[YYYYMMDD, değer | null], ...] }]
 * secenek: { bicim: (v) => eksen etiketi, ters: küçük değer yukarıda (sıra), doldur: tek seride çizginin altı boyanır, ad: erişilebilir ad }
 */
export function cizgiGrafik(seriler, { bicim = (v) => TAM.format(v), ters = false, doldur = false, ad = '' } = {}) {
  const W = 640; const H = 240; const L = 62; const R = 12; const T = 12; const B = 26;
  const gunler = [...new Set(seriler.flatMap((s) => s.noktalar.map((n) => n[0])))].sort((a, b) => a - b);
  const degerler = seriler.flatMap((s) => s.noktalar.map((n) => n[1]).filter((v) => v != null && Number.isFinite(v)));
  if (!gunler.length || !degerler.length) return '<p class="sg-bos">Grafik için yeterli veri yok.</p>';
  let lo = Math.min(...degerler); let hi = Math.max(...degerler);
  if (lo === hi) { const p = Math.max(1, Math.abs(lo) * 0.01); lo -= p; hi += p; } else { const p = (hi - lo) * 0.08; lo -= p; hi += p; }
  const o0 = ordinal(gunler[0]); const o1 = ordinal(gunler.at(-1));
  const x = (day) => (o1 === o0 ? (L + W - R) / 2 : L + ((ordinal(day) - o0) / (o1 - o0)) * (W - L - R));
  const y = (v) => { const t = (v - lo) / (hi - lo); return T + (ters ? t : 1 - t) * (H - T - B); };
  const yTik = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const grid = yTik.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="sg-grid"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="sg-lbl">${esc(bicim(v))}</text>`).join('');
  const xi = [...new Set([0, Math.round((gunler.length - 1) / 3), Math.round(((gunler.length - 1) * 2) / 3), gunler.length - 1])];
  const xEtiket = xi.map((i, k) => `<text x="${x(gunler[i]).toFixed(1)}" y="${H - 7}" text-anchor="${k === 0 ? 'start' : k === xi.length - 1 ? 'end' : 'middle'}" class="sg-lbl">${esc(gunMetni(gunler[i]))}</text>`).join('');
  const cizgiler = seriler.map((s, k) => {
    const renk = s.renk || RENKLER[k % RENKLER.length];
    const parcalar = [];
    let cur = [];
    for (const [d, v] of s.noktalar) {
      if (v == null || !Number.isFinite(v)) { if (cur.length) parcalar.push(cur); cur = []; continue; }
      cur.push([x(d), y(v)]);
    }
    if (cur.length) parcalar.push(cur);
    const yol = parcalar.map((p) => `M${p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' L')}`).join(' ');
    const alan = doldur && seriler.length === 1 ? parcalar.map((p) => `<path d="M${p[0][0].toFixed(1)},${H - B} L${p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' L')} L${p.at(-1)[0].toFixed(1)},${H - B} Z" style="fill:${renk};opacity:.16"/>`).join('') : '';
    const son = parcalar.at(-1)?.at(-1);
    const nokta = son ? `<circle cx="${son[0].toFixed(1)}" cy="${son[1].toFixed(1)}" r="3.5" style="fill:${renk}"/>` : '';
    return `${alan}<path d="${yol}" class="sg-line" style="stroke:${renk}"/>${nokta}`;
  }).join('');
  return `<svg class="sg-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ad)}" preserveAspectRatio="xMidYMid meet"><title>${esc(ad)}</title>${grid}<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="sg-base"/>${xEtiket}${cizgiler}</svg>`;
}

export const GRAFIK_CSS = `
.sg-svg { width: 100%; height: auto; display: block; }
.sg-grid { stroke: var(--row-line); stroke-width: 1; }
.sg-base { stroke: var(--line-2); stroke-width: 1; }
.sg-lbl { fill: var(--muted); font: 500 11px var(--font-c); }
.sg-line { fill: none; stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
.sg-bos { color: var(--muted); font-size: 14px; margin: 8px 0; }
`;
