// DentSimco — Perakende (arayüz)
// Hesapların hepsi hesap-perakende.js'te; burada yalnız ekranlar, veri yükleme ve tarayıcıda kayıt var.
// Sekmeler Üretim'deki gibi: Kurulum, Binalar, PPHPL Max ve Özet (ön muhasebe). Bina eklemek alttan açılan panelle.
// Doygunluk botun yazdığı meta/retail_r{realm}, maliyet varsayılanı live/r{realm} borsa fiyatı, ekip şirket kaydından.
// Tarayıcı kaydı: dentsimco.perakende.r{realm}. Kaydedince şirket kaydındaki "ekip dışı satış hızı" ve
// "günlük perakende marjı" alanları da buradan güncellenir.

import { LOCALE, t as ceviri } from './i18n.js';
import { readDocs, PATHS, dataField, loadProduct, summarizeDay, utcDay, addDays, START_YEAR, loadGamePhase, anlikFiyat, LIVE, ASK_FRESH_MS } from './veri.js';
import * as H from './hesap.js';
import * as Y from './yonetici.js';
import { CSS, parseNum, kisayolKucuk, kisayolSatiri, bolumUyariHtml } from './uretim.js';
import * as R from './hesap-perakende.js';
import * as RS from './perakende-restoran.js';
import * as RB from './perakende-rbina.js';
import { guideCard } from './rehber.js';
import { binaAdi } from './adlar.js';
import { urunAdi } from './urun-adlari.js';
import { esc } from './esc.js';
import { kilitAcik, kilitDene, BEKLEME_MS } from './kilit.js';

const STORE_KEY = (r) => `dentsimco.perakende.r${r}`;
const TAB_KEY = 'dentsimco.perakende.tab';
const PERIOD_KEY = 'dentsimco.perakende.period';
export const TABS = [['kurulum', 'Kurulum'], ['binalar', 'Binalar'], ['pphpl', 'PPHPL Max'], ['restoran', 'Restoran'], ['oneri', 'Menü önerisi'], ['tuketim', 'Tüketimler'], ['ozet', 'Özet']];
// Üst sekmeler; Binalar'ın altında iki, Restoran'ın altında üç alt sekme var
const GROUPS = [['kurulum', 'Kurulum', ['kurulum']], ['binalar', 'Binalar', ['binalar', 'pphpl']], ['restoran', 'Restoran', ['restoran', 'oneri', 'tuketim']], ['ozet', 'Özet', ['ozet']]];
const RESTORAN_BINALAR_ACIK = false; // Restoran > Binalar geliştirme aşamasında: erişime kapalı; Menü önerisi ve Tüketimler açık
const SUBS = { binalar: [['binalar', 'Binalar'], ['pphpl', 'PPHPL Max']], restoran: [['restoran', 'Binalar'], ['oneri', 'Menü önerisi'], ['tuketim', 'Tüketimler']] };
const PERIODS = [['hour', 'Saatlik', 1 / 24], ['day', 'Günlük', 1], ['week', 'Haftalık', 7], ['month', 'Aylık', 30]];
const REC = [['park', 'Park'], ['temple', 'Tapınak'], ['lake', 'Göl']];
const HISTORY_DAYS = 30;
const PHASE_FMT = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
// Restoran ayrı planlanacak; Satış ofisi (B) PPHPL ile ölçülmez: teklifler geliyor ama ne geleceği bilinmiyor
const EXCLUDED = new Set(['r', 'B']);

// Bina adları veride yok; emin olmadığımız harflerde "Mağaza X" yazar
const buildingName = (letter) => binaAdi(letter, 'Mağaza'); // adlar adlar.js dosyasından

// Talep (d = 2 − doygunluk, 0–2): aşırı yüksekten çok düşüğe, yeşil → sarı → kırmızı
const DEMAND = [
  { min: 1.5, label: 'Aşırı yüksek', k: 'd5' }, { min: 1, label: 'Yüksek', k: 'd4' }, { min: 0.5, label: 'Orta', k: 'd3' },
  { min: 1e-9, label: 'Düşük', k: 'd2' }, { min: -1, label: 'Çok düşük', k: 'd1' },
];
const demandOf = (sat) => (Number.isFinite(sat) ? DEMAND.find((x) => R.demand(sat) >= x.min) : null);

// ---- biçimlendirme ----
const NF = [0, 1, 2, 3].map((d) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }));
const fin = (x) => x != null && Number.isFinite(x);
const num = (x, d = 0) => (fin(x) ? NF[d].format(x) : '—');
const money = (x, d = 0) => {
  if (!fin(x)) return '—';
  const s = `$${NF[d].format(Math.abs(x))}`;
  return Math.round(x * 10 ** d) < 0 ? `−${s}` : s;
};
const price = (x) => (!fin(x) ? '—' : money(x, Math.abs(x) < 10 ? 3 : Math.abs(x) < 1000 ? 2 : 0));
const cls = (x) => (x > 0.004 ? 'c-up' : x < -0.004 ? 'c-down' : '');
const uid = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const posNum = (x) => { const n = Number(x); return x != null && x !== '' && Number.isFinite(n) && n > 0 ? n : null; };
const toInt = (x) => Math.max(0, Math.floor(Number(x) || 0));
const inputVal = (x) => (x == null ? '' : String(x).replace('.', ','));
const pctText = (x) => `%${num(x, Math.abs(x % 1) > 1e-6 ? 1 : 0)}`;

const ICON = {
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const star = (first) => `<span class="pk-star${first ? ' first' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="${first ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><polygon points="12 2.5 15 9 22 9.6 16.7 14.3 18.3 21.3 12 17.6 5.7 21.3 7.3 14.3 2 9.6 9 9"/></svg></span>`;
const kv = (label, value, c = '', strong = false) => `<div class="ur-kv${strong ? ' strong' : ''}"><span>${label}</span><span class="${c}">${value}</span></div>`;
const chip = (text, kind = '') => `<span class="ur-chip ${kind}">${esc(text)}</span>`;
const badge = (sat) => { const d = demandOf(sat); return d ? `<span class="pk-badge ${d.k}">${d.label}</span>` : ''; };
const seg = (act, options, value, label) => `<div class="ur-seg" role="group" aria-label="${esc(label)}">${options.map(([v, t]) =>
  `<button type="button" data-act="${act}" data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(t)}</button>`).join('')}</div>`;
const tri = (label, a, b, o = {}) => `<div class="ur-tri${o.strong ? ' strong' : ''}${o.line ? ' line' : ''}${o.indent ? ' indent' : ''}${o.muted ? ' muted' : ''}"><span>${label}</span><span class="${o.ca || ''}">${a}</span><span class="${o.cb || ''}">${b}</span></div>`;
function field(label, name, value, { unit = '', hint = '', mode = 'decimal', placeholder = '', attr = 'data-f' } = {}) {
  return `<label class="ur-field"><span>${esc(label)}</span><div class="ur-input">${unit === '$' ? '<i>$</i>' : ''}<input type="text" inputmode="${mode}" autocomplete="off" ${attr}="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}">${unit && unit !== '$' ? `<i>${esc(unit)}</i>` : ''}</div>${hint ? `<p class="ur-note">${hint}</p>` : ''}</label>`;
}

const EXTRA_CSS = `
.pk-star { display: inline-flex; width: 22px; justify-content: center; color: var(--muted); flex: none; }
.pk-star.first { color: var(--price); }
.pk-star svg { width: 20px; height: 20px; }
.pk-badge { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 13px; font-size: 13px; font-weight: 600; white-space: nowrap; border: 1px solid; }
.pk-badge.d5 { background: var(--d5-bg); color: var(--d5-fg); border-color: var(--d5-line); }
.pk-badge.d4 { background: var(--d4-bg); color: var(--d4-fg); border-color: var(--d4-line); }
.pk-badge.d3 { background: var(--d3-bg); color: var(--d3-fg); border-color: var(--d3-line); }
.pk-badge.d2 { background: var(--d2-bg); color: var(--d2-fg); border-color: var(--d2-line); }
.pk-badge.d1 { background: var(--d1-bg); color: var(--d1-fg); border-color: var(--d1-line); }
.pk-pick { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 56px; padding: 6px 8px; border: 0; border-top: 1px solid var(--line);
  background: transparent; color: var(--text); text-align: left; font: inherit; border-radius: 0; }
.pk-pick[aria-pressed="true"] { background: var(--tint-bg); }
.pk-pick .grow { flex: 1 1 auto; min-width: 0; }
.pk-pick .name { font-weight: 600; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-pick .vals { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pk-pick .vals b { display: block; font-size: 16px; }
.pk-pick .vals small { color: var(--muted); font-size: 12px; }
.pk-rank { display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 8px 0; border-top: 1px solid var(--line); }
.pk-rank .grow { flex: 1 1 auto; min-width: 0; }
.pk-rank .no { width: 26px; flex: none; text-align: center; color: var(--muted); font: 600 15px var(--font-c); }
.pk-step { display: flex; align-items: center; gap: 8px; }
.pk-step input[type="text"] { text-align: center; font-size: 22px; height: 50px; }
.pk-step .ur-btn { min-width: 50px; min-height: 50px; padding: 0; }
.pk-fold { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 48px; padding: 0 12px; border: 1px solid var(--line-2); border-radius: 12px;
  background: var(--raise); color: var(--text); font: 600 16px var(--font); text-align: left; }
.pk-fold .grow { flex: 1 1 auto; }
.pk-fold svg { width: 20px; height: 20px; flex: none; transition: transform 0.2s; }
.pk-fold[aria-expanded="true"] svg { transform: rotate(180deg); }
.ur-subtabs { display: flex; gap: 6px; margin: 10px 0 2px; }
.ur-subtabs a { flex: 1 1 0; display: flex; align-items: center; justify-content: center; min-height: 40px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--raise);
  color: var(--muted); font: 600 15px var(--font-c); text-decoration: none; white-space: nowrap; }
.ur-subtabs a[aria-current="page"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.pk-svg { width: 100%; height: auto; display: block; }
.pk-svg text { fill: var(--muted); font-size: 11px; font-family: var(--font); }
`;

// ---------------------------------------------------------------------------------------------------------------
// Kayıt
// ---------------------------------------------------------------------------------------------------------------
// { economyPhase: null (verinin fazı) | 0 | 1 | 2, recreation: { park, temple, lake }, salesSpeedPct: 0,
//   academyLevel: 0,
//   buildings: [{ id, letter, product, quality, level, cost: null (borsa fiyatı), price: null (en kârlı fiyat) }] }
const defaultSetup = () => ({ economyPhase: null, recreation: { park: 0, temple: 0, lake: 0 }, salesSpeedPct: 0, academyLevel: 0, buildings: [], restoran: RS.varsayilanRestoran(), restoranBinalari: RB.varsayilanRb() });
const isRetail = (letter) => !!R.buildingProducts(letter, 1).length && !EXCLUDED.has(letter);

function cleanBuilding(b) {
  const product = Number(b?.product);
  if (!b || !isRetail(b.letter) || !R.buildingProducts(b.letter, 1).includes(product)) return null;
  return { id: b.id || uid(), letter: b.letter, product, quality: R.clampQuality(b.quality), level: toInt(b.level), cost: posNum(b.cost), price: posNum(b.price), construction: !!b.construction };
}
function sanitize(raw) {
  const s = defaultSetup();
  if (!raw || typeof raw !== 'object') return s;
  s.economyPhase = raw.economyPhase != null && [0, 1, 2].includes(Number(raw.economyPhase)) ? Number(raw.economyPhase) : null;
  for (const [k] of REC) s.recreation[k] = Math.min(3, toInt(raw.recreation?.[k]));
  s.salesSpeedPct = Math.max(0, Number(raw.salesSpeedPct) || 0);
  s.academyLevel = toInt(raw.academyLevel);
  s.restoran = RS.temizleRestoran(raw.restoran);
  s.restoranBinalari = RB.temizleRb(raw.restoranBinalari);
  for (const b of Array.isArray(raw.buildings) ? raw.buildings : []) {
    if (Array.isArray(b?.products)) {
      // önceki sürümün biçimi: bina başına ürün listesi → her ürün ayrı bina
      for (const p of b.products) {
        const row = (p.rows || []).find((x) => x.id === p.use) || (p.rows || [])[0] || {};
        const one = cleanBuilding({ letter: b.letter, product: p.product, quality: row.quality, level: p.levels ?? b.level, cost: row.cost, price: row.price });
        if (one) s.buildings.push(one);
      }
    } else {
      const one = cleanBuilding(b);
      if (one) s.buildings.push(one);
    }
  }
  return s;
}
function loadSetup(r) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORE_KEY(r)) || 'null'); } catch { raw = null; }
  const s = sanitize(raw); // Perakende kurulumu Üretim'den bağımsızdır
  if (!raw) { const eski = RS.eskiKayittanAktar(r); if (eski) s.restoran = RS.temizleRestoran(eski); } // eski Restoran sayfasındaki menü ve fiyat
  return s;
}
function saveSetup(r, setup) {
  try { localStorage.setItem(STORE_KEY(r), JSON.stringify(setup)); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------------------------------------------
// Veri
// ---------------------------------------------------------------------------------------------------------------
function parseLive(doc) {
  const out = {};
  for (const [id, e] of Object.entries(doc?.items || {})) {
    const byQ = Array.isArray(e) ? e[1] : e;
    if (!byQ || typeof byQ !== 'object') continue;
    const m = {};
    for (const q of Object.keys(byQ)) { const f = anlikFiyat(doc, id, q); if (f) m[q] = f.p; } // ilan yoksa fiyat yok
    out[id] = m;
  }
  return out;
}
// Anlık borsa arzı: tam q kalitesindeki ilan adedi {id: {q: adet}}; yalnız anlık veri tazeyken (eskiyse arz sınırı uygulanmaz)
function parseArz(doc, now = Date.now()) {
  const out = {};
  for (const [id, e] of Object.entries(doc?.items || {})) {
    const askT = Array.isArray(e) ? Number(e[2]) : 0;
    if (!(askT > 0 && now - askT <= ASK_FRESH_MS) || !e[1] || typeof e[1] !== 'object') continue;
    const m = {};
    for (const [q, row] of Object.entries(e[1])) { const a = Number(row?.[LIVE.SUPPLY]); if (Number.isFinite(a)) m[q] = a; }
    out[id] = m;
  }
  return out;
}
async function loadData(r) {
  const P = { products: PATHS.meta(`products_r${r}`), buildings: PATHS.meta('buildings'), core: PATHS.meta('core'),
    retail: PATHS.meta(`retail_r${r}`), restaurant: PATHS.meta(`restaurant_r${r}`), modifiers: PATHS.meta(`modifiers_r${r}`), live: PATHS.live(r) };
  const [docs, gamePhase] = await Promise.all([readDocs(Object.values(P)), loadGamePhase(r)]); // evre okunamazsa null
  const get = (k) => dataField(docs.get(P[k]));
  const products = get('products');
  if (!products || !Object.keys(products).length) throw new Error('Ürün verisi okunamadı.');
  const core = get('core') || {};
  const saturation = {};
  for (const [id, p] of Object.entries(products)) {
    const s = p?.marketSaturation;
    if (s != null && s !== '' && Number.isFinite(Number(s))) saturation[id] = Number(s);
  }
  const ri = get('retail');
  Object.assign(saturation, R.parseSaturation(Array.isArray(ri) ? ri : ri?.items ?? ri));
  const qw = core.RETAIL_MODELING_QUALITY_WEIGHT;
  return {
    norm: H.normalizeData({ products, buildings: get('buildings') || {}, core, modifiers: get('modifiers') || {}, realm: r }),
    names: Object.fromEntries(Object.entries(products).map(([id, p]) => [id, urunAdi(id, p?.name) || `#${id}`])),
    saturation,
    market: parseLive(get('live')),
    arz: parseArz(get('live')),
    liveT: Number(get('live')?.t) || null,
    qualityWeight: qw != null && Number.isFinite(Number(qw)) ? Number(qw) : undefined,
    hasRetailInfo: !!ri,
    consumption: RS.tuketimVerisi(Array.isArray(ri) ? ri : ri?.items, get('restaurant')),
    gamePhase,
  };
}

// Son 30 günün borsa ortalama fiyatı (VWAP = satış tutarı ÷ satış adedi)
async function loadHistory(r, id) {
  const today = utcDay(Date.now());
  const first = addDays(today, -(HISTORY_DAYS - 1));
  const years = [...new Set([first.slice(0, 4), today.slice(0, 4)].map(Number))].filter((y) => y >= START_YEAR);
  const { byDay, daily } = await loadProduct(r, id, { days: [addDays(today, -1), today], years });
  const rows = new Map(daily);
  for (const [day, points] of byDay) if (points.length && (day === today || !rows.has(day))) rows.set(day, summarizeDay(points));
  return { rows, today };
}
function vwapSeries(h, quality) {
  const out = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const day = addDays(h.today, -i);
    const e = h.rows.get(day)?.[quality];
    out.push({ day, v: e && e[5] > 0 && e[6] != null ? e[6] / e[5] : null });
  }
  return out;
}
function chartSvg(series, quality) {
  const W = 320, Ht = 120, L = 54, Rt = 8, T = 10, B = 20;
  const vals = series.filter((x) => x.v != null);
  if (vals.length < 2) return `<p class="ur-note">Q${quality} için son 30 günde yeterli borsa satışı yok.</p>`;
  let lo = Math.min(...vals.map((x) => x.v));
  let hi = Math.max(...vals.map((x) => x.v));
  if (hi - lo < 1e-9) { lo *= 0.98; hi *= 1.02; }
  const X = (i) => L + (i * (W - L - Rt)) / (series.length - 1);
  const Yv = (v) => T + (1 - (v - lo) / (hi - lo)) * (Ht - T - B);
  let d = '';
  let pen = false;
  series.forEach((x, i) => {
    if (x.v == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Yv(x.v).toFixed(1)}`;
    pen = true;
  });
  const date = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  const avg = vals.reduce((t, x) => t + x.v, 0) / vals.length;
  return `<svg class="pk-svg" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Q${quality} son 30 gün borsa ortalama fiyatı, ortalama ${esc(price(avg))}">
    <line x1="${L}" y1="${T}" x2="${W - Rt}" y2="${T}" stroke="var(--line)"/><line x1="${L}" y1="${Ht - B}" x2="${W - Rt}" y2="${Ht - B}" stroke="var(--line)"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="${L - 6}" y="${T + 4}" text-anchor="end">${esc(price(hi))}</text><text x="${L - 6}" y="${Ht - B + 4}" text-anchor="end">${esc(price(lo))}</text>
    <text x="${L}" y="${Ht - 4}">${date(series[0].day)}</text><text x="${W - Rt}" y="${Ht - 4}" text-anchor="end">${date(series[series.length - 1].day)}</text></svg>
    <p class="ur-note">Q${quality} borsa ortalama fiyatı (VWAP). ${num(vals.length)} günün ortalaması ${esc(price(avg))}.</p>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Modül
// ---------------------------------------------------------------------------------------------------------------
export function mountPerakende(root, { realm = 0 } = {}) {
  let r = realm;
  let company = Y.loadCompanyRecord(r).company;
  let setup = loadSetup(r);
  let data = null;
  let loadError = null;
  let loadToken = 0;
  let destroyed = false;
  let toastTimer = null;
  let tuketimMetrik = 'adet'; // 'adet' | 'tutar'
  let tuketimAralik = 28;
  let tuketimUrun = null;
  let tuketimGun = null;
  const restoranAcik = new Set(); // ayrı menülü restoran kartlarında açık menüler
  const restoranBinaAcik = new Set(); // Binalar sekmesindeki restoran kartlarından açık olanlar
  const ozetAcik = new Set(); // Özet'te ayrıntısı açık restoranlar
  let kilitDurum = ''; // Restoran parola kapısı: '' | 'bakiliyor' | 'yanlis' | 'bekle'
  let kbOnay = false; // öteki bölümün binalarını kaldırma onayı bekleniyor
  let kbGeri = null; // kaldırılanı geri almak için eski durum
  let sheet = null; // { draft: { index, id, letter, product, quality, level, cost, price } }
  let rankFilter = 'all';
  let period = 'day';
  try { period = PERIODS.some(([k]) => k === localStorage.getItem(PERIOD_KEY)) ? localStorage.getItem(PERIOD_KEY) : 'day'; } catch { /* gizli sekme */ }
  let tab = 'binalar';
  try { tab = localStorage.getItem(TAB_KEY) || 'binalar'; } catch { /* gizli sekme */ }
  const fromHash = location.hash.split('/')[1];
  if (TABS.some(([k]) => k === fromHash)) tab = fromHash;
  if (!TABS.some(([k]) => k === tab)) tab = 'binalar';
  const history = new Map(); // ürün → { state, h }

  const style = document.createElement('style');
  style.dataset.module = 'perakende';
  style.textContent = CSS + EXTRA_CSS + RS.RESTORAN_CSS + RS.TUKETIM_CSS + RB.RBINA_CSS;
  document.head.append(style);
  root.innerHTML = '<div class="ur"></div><div data-sheet></div><div data-toast></div>';
  const view = root.querySelector('.ur');
  const sheetHost = root.querySelector('[data-sheet]');
  const toastHost = root.querySelector('[data-toast]');
  const nameOf = (id) => data?.names[id] || `#${id}`;

  // Kutuya yazıp hemen bir düğmeye dokununca "change" dokunmanın ortasında gelir; o anda çizim yapılırsa dokunma kaybolur
  let pointerActive = false;
  let pendingRender = false;
  let settleTimer = null;
  const flush = () => { clearTimeout(settleTimer); pointerActive = false; if (pendingRender) render(); };
  let downOnBackdrop = false; // basış panelin dışında başladıysa bırakınca kapanır
  const onPointerDown = (ev) => { pointerActive = true; downOnBackdrop = ev?.target?.dataset?.act === 'sheetBackdrop'; clearTimeout(settleTimer); };
  const onPointerUp = () => { clearTimeout(settleTimer); settleTimer = setTimeout(flush, 450); };
  const onAnyClick = () => setTimeout(flush, 0);
  const softRender = () => { if (pointerActive) pendingRender = true; else render(); };

  function toastKbGeri(text) {
    toastHost.innerHTML = `<div class="ur-toast" role="status">${esc(text)} <button type="button" class="ur-btn" data-act="kbGeri" style="min-height:36px;margin-left:10px">Geri al</button></div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastHost.innerHTML = ''; kbGeri = null; }, 8000);
  }
  function toast(text) {
    toastHost.innerHTML = `<div class="ur-toast" role="status">${esc(text)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastHost.innerHTML = ''; }, 3200);
  }

  async function load() {
    const my = ++loadToken;
    data = null;
    loadError = null;
    history.clear();
    render();
    try {
      const d = await loadData(r);
      if (destroyed || my !== loadToken) return;
      data = d;
      syncCompany(); // Yönetim ekibinin değeri için şirket kaydı güncel kalsın (Üretim binaları değişmiş olabilir)
    } catch (e) {
      if (destroyed || my !== loadToken) return;
      loadError = e?.message || String(e);
    }
    render();
  }
  async function ensureHistory(id) {
    if (!Number.isFinite(id) || history.has(id)) return;
    history.set(id, { state: 'loading' });
    const my = loadToken;
    try {
      const h = await loadHistory(r, id);
      if (destroyed || my !== loadToken) return;
      history.set(id, { state: 'ok', h });
    } catch {
      if (destroyed || my !== loadToken) return;
      history.set(id, { state: 'err' });
    }
    softRender();
  }

  // ---- hesap ----
  const marketOf = (id, q) => data?.market?.[id]?.[q] ?? null;
  const arzOf = (id, q) => data?.arz?.[id]?.[q] ?? null;
  const letters = () => R.retailLetters().filter((l) => !EXCLUDED.has(l) && R.buildingProducts(l, 1).length)
    .sort((a, b) => buildingName(a).localeCompare(buildingName(b), 'tr'));

  function context() {
    // Otomatik: oyunun güncel evresi (system/phase); okunamazsa verinin fazı (bot Durgunluk ister) ya da Durgunluk
    const phase = Number.isInteger(data.gamePhase?.index) ? data.gamePhase.index
      : Number.isInteger(data.norm.economy?.currentPhase) ? data.norm.economy.currentPhase : 0;
    const econ = setup.economyPhase ?? phase;
    const recPct = H.recreationBonus(setup.recreation) * 100;
    const baseSpeed = setup.salesSpeedPct + recPct; // ekip hariç toplam satış hızı
    const team = H.teamEffects(company.executives, { bankLevel: company.finance?.bankLevel });
    const teamPct = Math.max(0, Number(team.salesSpeedPct) || 0);
    const bonusPct = R.retailBonusPct({ otherSpeedPct: baseSpeed, teamSalesSpeedPct: teamPct });
    const retailLevels = setup.buildings.reduce((t, b) => t + b.level, 0) + RB.rbSeviye(setup.restoranBinalari);
    let adm = { totalLevels: retailLevels + setup.academyLevel, gross: 0, net: 0 };
    try {
      const o = Y.otherAdminLevels(company, 'perakende'); // Üretim binaları da yönetim giderine girer
      adm = H.adminInfo({ buildings: [], academyLevel: Math.max(setup.academyLevel, o.academy), otherLevels: retailLevels + o.levels,
        executives: company.executives, finance: company.finance, admin: { mode: 'executives' } }, data.norm);
    } catch { /* yönetim gideri hesaplanamadı: 0 */ }
    const ctx = { saturation: data.saturation, weather: R.noWeather, bonusPct, adminNet: adm.net || 0, qualityWeight: data.qualityWeight,
      buildings: data.norm.buildings, averageSalary: data.norm.averageSalary,
      ratingBonus: RS.ratingBonusu(baseSpeed, team.effective?.cmo) };
    return { econ, phase, recPct, baseSpeed, teamPct, bonusPct, retailLevels, prodLevels: Y.otherAdminLevels(company, 'perakende').levels, adm, ctx };
  }
  const baseWage = (c, letter, product, quality) => R.storeWage({ modelW: R.getModel(c.econ, product, quality)?.W,
    salaryModifier: c.ctx.buildings?.[letter]?.salaryModifier, averageSalary: c.ctx.averageSalary, adminNet: 0 });
  function calc(c, { letter, product, quality, cost, price: p }) {
    const cAct = cost ?? marketOf(product, quality);
    return R.calcProduct({ economy: c.econ, productId: product, quality, saturation: c.ctx.saturation[product], cAct, price: p,
      bonusPct: c.ctx.bonusPct, weather: 1, qualityWeight: c.ctx.qualityWeight, wage: baseWage(c, letter, product, quality) * (1 + c.ctx.adminNet), strictCost: true });
  }
  const engineSetup = (c, list = setup.buildings) => ({ economyPhase: c.econ, buildings: list.map((b) => ({ id: b.id, letter: b.letter, level: b.level, construction: !!b.construction,
    lines: [{ product: b.product, quality: b.quality, cost: b.cost ?? marketOf(b.product, b.quality), price: b.price }] })) });
  // Kalite seçenekleri: borsada ilanı olan kaliteler (maliyet = borsa fiyatı); ilanı olmayan kaliteye model maliyeti uydurulmaz
  function qualityOptions(c, letter, product) {
    const out = [];
    for (let q = 0; q <= R.MAX_QUALITY; q++) {
      const x = calc(c, { letter, product, quality: q, cost: null, price: null });
      if (x.ok) out.push({ quality: q, market: marketOf(product, q) != null, x });
    }
    return out.filter((o) => o.market);
  }
  function bestQuality(c, letter, product) {
    const list = qualityOptions(c, letter, product);
    return list.length ? list.reduce((a, b) => (b.x.pphplMax > a.x.pphplMax ? b : a)) : null;
  }
  function ranking(c, ls, top = 10) {
    const all = [];
    for (const letter of ls) for (const product of R.buildingProducts(letter, c.econ)) {
      for (const o of qualityOptions(c, letter, product)) all.push({ letter, product, quality: o.quality, market: o.market, x: o.x });
    }
    // Maliyeti satılamayacak kadar yüksek olan (kâr ≤ 0) ürünler listeye girmez
    const good = all.filter((x) => x.x.sellable && x.x.pphplMax > 0);
    good.sort((a, b) => b.x.pphplMax - a.x.pphplMax);
    return good.slice(0, top);
  }

  // Mağazalar + restoranlar: toplamlar birleşir (adet ve marj yalnız mağazalara aittir)
  function evaluateAll(c) {
    const ev = R.evaluateRetail(engineSetup(c), c.ctx);
    const rs = RB.rbDegerlendir(setup.restoranBinalari, { ...c.ctx, evre: c.econ }, marketOf);
    const a = ev.totals;
    const b = rs.totals;
    // Borsada fiyatı olmayan ürün (mağaza ya da restoran) varsa toplam kâr hesaplanmaz; elle girilmesi istenir
    const eksik = ev.buildings.reduce((t, x) => t + x.lines.filter((l) => l.needsCost).length, 0) + (b.eksik || 0);
    return { ...ev, stores: a, restoran: rs, restoranBolum: RS.degerlendirRestoran(setup.restoran, { ...c.ctx, evre: c.econ }, marketOf), eksik, totals: { ...a, levels: a.levels + b.levels, revenueDay: a.revenueDay + b.revenueDay, costDay: a.costDay + b.costDay,
      wagesDay: a.wagesDay + b.wagesDay, profitDay: eksik ? null : a.profitDay + b.profitDay } };
  }
  const hasPlan = () => setup.buildings.length > 0 || setup.restoranBinalari.items.length > 0;

  // Yönetim ekibinin değeri için şirket kaydı buradan beslenir (ekip dışı satış hızı, günlük perakende marjı, yönetim gideri payı)
  function syncCompany() {
    if (!data) return;
    if (!hasPlan()) { // tüm mağazalar silindi ya da kurulum sıfırlandı: Yönetim'deki eski marj kalmasın
      try {
        const fresh = Y.loadCompanyRecord(r).company;
        if (fresh.retail?.marginDay) {
          fresh.retail = { ...fresh.retail, marginDay: 0 };
          Y.saveCompanyRecord(r, fresh);
        }
        company = Y.setCompanyPart(r, 'perakende', { levels: 0, academy: setup.academyLevel, wagesDay: 0 });
      } catch (e) { console.error(e); }
      return;
    }
    try {
      const c = context();
      const ev = evaluateAll(c);
      const fresh = Y.loadCompanyRecord(r).company;
      fresh.retail = { ...(fresh.retail || {}), otherSpeedPct: Math.round(c.baseSpeed * 100) / 100, marginDay: Math.round(ev.totals.marginDay) };
      Y.saveCompanyRecord(r, fresh);
      company = Y.setCompanyPart(r, 'perakende', { levels: c.retailLevels, academy: setup.academyLevel, wagesDay: ev.totals.wagesDay });
    } catch (e) { console.error(e); }
  }
  function commit(next, { sync = true } = {}) {
    const had = hasPlan();
    setup = sanitize(next);
    if (!saveSetup(r, setup)) toast('Tarayıcı kaydı açık değil; değişiklikler sayfa kapanınca kaybolur.');
    if (sync || (had && !hasPlan())) syncCompany();
    softRender();
  }
  const clone = () => JSON.parse(JSON.stringify(setup));

  // ---- ekran ----
  function render() {
    if (destroyed) return;
    pendingRender = false;
    const group = GROUPS.find(([, , views]) => views.includes(tab)) || GROUPS[1];
    const tabs = `<nav class="ur-tabs" aria-label="Perakende bölümleri">${GROUPS.map(([k, t, views]) =>
      `<a href="#perakende/${views.includes(tab) ? tab : k === 'restoran' && !RESTORAN_BINALAR_ACIK ? 'tuketim' : views[0]}" ${views.includes(tab) ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`
      + (SUBS[group[0]] ? `<nav class="ur-subtabs" aria-label="${esc(group[1])} alt bölümleri">${SUBS[group[0]].map(([k, t]) =>
        `<a href="#perakende/${k}" ${k === tab ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>` : '');
    let body;
    if (group[0] === 'restoran' && !kilitAcik()) {
      body = kilitHtml();
    } else if (loadError) {
      body = `<div class="ur-msg err" role="alert">Veriler okunamadı: ${esc(loadError)}</div><button type="button" class="ur-btn" data-act="retry">Tekrar dene</button>`;
    } else if (!data) {
      body = '<p class="ur-sub" aria-busy="true">Ürün ve bina verileri yükleniyor…</p>';
    } else {
      try {
        const c = context();
        const ev = evaluateAll(c);
        body = tab === 'kurulum' ? viewKurulum(c) : tab === 'pphpl' ? viewPphpl(c) : tab === 'ozet' ? viewOzet(c, ev) : tab === 'restoran' ? viewRestoran(c, ev) : tab === 'oneri' ? viewOneri(c) : tab === 'tuketim' ? viewTuketim() : viewBinalar(c, ev);
      } catch (e) {
        console.error(e);
        body = `<div class="ur-msg err" role="alert">Bu ekran gösterilemedi: ${esc(e?.message || e)}. Sayfayı yenileyin; sürerse bize bildirin.</div>`;
      }
    }
    const scroll = window.scrollY;
    const tabloKayma = view.querySelector('.tk-wrap')?.scrollLeft || 0; // tablo yeniden çizilince başa sıçramasın
    view.innerHTML = tabs + (data && !loadError && tab !== 'tuketim' && tab !== 'oneri' ? bolumUyariHtml(company, 'perakende', kbOnay) : '') + body;
    window.scrollTo(0, scroll);
    const tablo = view.querySelector('.tk-wrap');
    if (tablo) {
      tablo.scrollLeft = tabloKayma;
      // seçili gün sütunu görünür alanın dışındaysa yumuşakça içeri alınır
      const th = tablo.querySelector('th.selday');
      if (th) {
        const a = th.getBoundingClientRect(), b = tablo.getBoundingClientRect();
        const ad = tablo.querySelector('th.nm')?.getBoundingClientRect().width || 0;
        if (a.right > b.right) tablo.scrollTo({ left: tablo.scrollLeft + (a.right - b.right) + 8, behavior: 'smooth' });
        else if (a.left < b.left + ad) tablo.scrollTo({ left: tablo.scrollLeft - (b.left + ad - a.left) - 8, behavior: 'smooth' });
      }
    }
    if (sheet) renderSheet();
  }

  // Tüketim grafiği: parmakla ya da fareyle sürükleyince gün gün gezilir; bırakınca o gün seçilir
  let grafikGun = null;
  function grafikGez(ev) {
    const chart = ev.target.closest?.('[data-chart]');
    if (!chart || !chart.contains(ev.target) && ev.type !== 'pointermove') return;
    if (ev.type === 'pointerdown') { chart.setPointerCapture?.(ev.pointerId); chart.dataset.drag = '1'; }
    if (chart.dataset.drag !== '1' && ev.pointerType !== 'mouse') return;
    const bars = [...chart.children];
    const r = chart.getBoundingClientRect();
    const i = Math.max(0, Math.min(bars.length - 1, Math.floor(((ev.clientX - r.left) / r.width) * bars.length)));
    const bar = bars[i];
    if (!bar) return;
    bars.forEach((b) => b.classList.remove('hot'));
    bar.classList.add('hot');
    const read = chart.parentElement.querySelector('[data-read]');
    if (read) read.textContent = bar.dataset.txt;
    grafikGun = bar.dataset.day;
  }
  function grafikBirak(ev) {
    const chart = ev.target.closest?.('[data-chart]');
    if (!chart || chart.dataset.drag !== '1') return;
    chart.dataset.drag = '0';
    if (grafikGun && grafikGun !== tuketimGun) { tuketimGun = grafikGun; softRender(); }
    grafikGun = null;
  }

  const headChips = (c) => `<div class="ur-chips">${chip(`Toplam satış bonusu ${pctText(c.bonusPct)}`, c.bonusPct > 0 ? '' : 'muted')}${chip(`Yönetim gideri ${pctText(c.ctx.adminNet * 100)}`, 'muted')}
    ${data.hasRetailInfo ? '' : chip('Doygunluk verisi yok', 'down')}</div>`;

  function phaseNote(c) {
    const g = data.gamePhase;
    if (setup.economyPhase == null) {
      if (!g) return `Oyun evresi okunamadı; ${esc(H.ECONOMY_PHASES[c.phase])} varsayıldı. Elle seçebilirsiniz.`;
      const until = Number.isFinite(g.end) ? ` · ${PHASE_FMT.format(g.end)}'e kadar` : '';
      return `Şu an: <b>${esc(H.ECONOMY_PHASES[g.index])}</b>${g.expired ? ' (süresi dolmuş görünüyor; yeni evre henüz yayınlanmamış olabilir)' : until}.`;
    }
    return g && g.index !== setup.economyPhase ? `Oyundaki güncel evre: ${esc(H.ECONOMY_PHASES[g.index])}. Seçiminiz farklı; oyunu izlemek için Otomatik'e dokunun.` : '';
  }

  // ---- KURULUM ----
  function viewKurulum(c) {
    return `
      <div class="ur-head"><div><h1>Realm ${r + 1} perakende kurulumu</h1><p class="ur-sub">Bu tarayıcıda saklanır.</p></div></div>

      <section class="ur-card" aria-labelledby="h-faz"><h2 id="h-faz">Ekonomi fazı</h2>
        <p class="ur-sub">Otomatik, oyunun güncel evresini kullanır (her cuma 18:00'de değişir); başka bir evreyi denemek için elle seçin. Faz, mağaza modelinin sabitlerini değiştirir.</p>
        ${seg('phase', [['auto', 'Otomatik'], ...H.ECONOMY_PHASES.map((t, i) => [i, t])], setup.economyPhase == null ? 'auto' : setup.economyPhase, 'Ekonomi fazı')}
        ${phaseNote(c) ? `<p class="ur-note">${phaseNote(c)}</p>` : ''}</section>

      <section class="ur-card" aria-labelledby="h-rec"><h2 id="h-rec">Rekreasyon binaları</h2>
        <p class="ur-sub">Seviye başına %1 hız; mağaza satış hızına da eklenir. Yönetim giderine girmez.</p>
        ${REC.map(([k, t]) => `<div class="ur-row"><span style="min-width:78px;font-weight:600">${t}</span><div class="grow">${seg(`rec.${k}`, [[0, '0'], [1, '1'], [2, '2'], [3, '3']], setup.recreation[k], `${t} seviyesi`)}</div></div>`).join('')}
        <div class="ur-hr"></div>${kv('Rekreasyon bonusu', pctText(c.recPct))}</section>

      <section class="ur-card" aria-labelledby="h-hiz"><h2 id="h-hiz">Satış hızı</h2>
        ${field('Satış hızı (elle)', 'salesSpeedPct', inputVal(setup.salesSpeedPct || ''), { unit: '%', placeholder: '0', hint: 'Rekreasyon ve yönetici dışındaki satış hızı bonusunuz. Rekreasyon bonusu buna her zaman eklenir.' })}
        <div class="ur-hr"></div>${kv('Toplam satış hızı', pctText(c.baseSpeed), 'c-price', true)}
        <p class="ur-note">Elle girdiğiniz değer ile rekreasyon bonusunun toplamıdır. Yönetim ekibinin ${pctText(c.teamPct)} satış hızı buna eklenir; hesapta toplam ${pctText(c.bonusPct)} kullanılır.</p></section>

      <section class="ur-card" aria-labelledby="h-diger"><h2 id="h-diger">Diğer binalar</h2>
        <p class="ur-sub">Perakende planına girmeyen binalar. Akademi yönetim giderine girer. Banka girmez, yalnız vergilendirme başlangıcını yükseltir.</p>
        ${field('Akademi seviyesi', 'academyLevel', setup.academyLevel || '', { mode: 'numeric', placeholder: '0' })}
        ${field('Banka seviyesi', 'bankLevel', company.finance.bankLevel || '', { mode: 'numeric', placeholder: '0', hint: 'Bankanız yoksa 0. Seviye başı, muhasebe puanı başı +$50k vergi eşiği (en çok 40). Üretim ve Yönetim ile ortaktır.' })}
        <div class="ur-hr"></div>
        ${kv('Perakende binaları', num(c.retailLevels))}${kv('Üretim binaları', num(c.prodLevels))}${kv('Akademi', num(Math.max(setup.academyLevel, Y.otherAdminLevels(company, 'perakende').academy)))}
        ${kv('Toplam bina seviyesi', num(c.adm.totalLevels), '', true)}${kv('Yönetim gideri (ekiple)', pctText(c.ctx.adminNet * 100))}
        <p class="ur-note">Yönetim gideri bu toplamdan ve Yönetim sekmesindeki ekipten hesaplanır. Üretim planınızdaki binalar da toplama girer (Üretim bölümünü kaydettiyseniz).</p></section>

      ${cardEvents()}

      <section class="ur-card" aria-labelledby="h-gen"><h2 id="h-gen">Genel</h2>
        <button type="button" class="ur-btn danger" data-act="reset">${icon('trash')}Perakende kurulumunu sıfırla</button>
        <p class="ur-note">Realm ${r + 1} perakende binalarını ve ayarlarını bu tarayıcıdan siler.</p></section>

      ${kisayolKucuk('perakendeBinalar')}`;
  }
  function cardEvents() {
    const t = Date.now();
    const sold = new Set(letters().flatMap((l) => R.buildingProducts(l, 1)));
    const seen = new Map();
    for (const e of data.norm.events || []) if (e.since <= t && t < e.until && sold.has(e.product)) seen.set(e.product, e);
    const list = [...seen.values()].sort((a, b) => nameOf(a.product).localeCompare(nameOf(b.product), 'tr'));
    const when = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' });
    const inPlan = new Set(setup.buildings.map((b) => b.product));
    const rows = list.map((e) => `<div class="ur-line"><div class="grow"><div class="ur-row" style="flex-wrap:wrap"><span class="title">${esc(nameOf(e.product))}</span>${chip(`${e.pct > 0 ? '+' : '−'}%${Math.abs(e.pct)}`, e.pct > 0 ? '' : 'down')}${inPlan.has(e.product) ? chip('Planda', 'muted') : ''}</div>
      <span class="ur-note">${Number.isFinite(e.until) ? `${when.format(e.until)}'e kadar` : 'süresiz'}</span></div></div>`).join('');
    return `<section class="ur-card" aria-labelledby="h-olay"><h2 id="h-olay">Oyun olayları</h2>
      <p class="ur-sub">Mağazalarda satılan ürünlerin etkin üretim olayları. Mağaza satış hızını değiştirmez; ürünü kendiniz üretiyorsanız maliyetinizi değiştirir.</p>
      ${rows || '<p class="ur-note">Şu an etkin olay yok.</p>'}</section>`;
  }

  // ---- BİNALAR ----
  function buildingCard(c, b, line, i) {
    const title = esc(nameOf(b.product));
    const chips = [];
    if (b.construction) {
      chips.push(chip('İnşaatta', 'muted'));
      chips.push(chip('Satmaz, maaş ödemez; seviyesi yönetim giderine girer', 'muted'));
    } else if (line?.ok) {
      chips.push(chip(`PPHPL ${money(line.pphpl, 2)}`, line.pphpl > 0 ? 'up' : 'down'));
      chips.push(chip(`Kâr ${money(line.profitDay)}/gün`, line.profitDay > 0 ? 'up' : 'down'));
      chips.push(chip(`Fiyat ${price(line.price)}${b.price == null ? ' (en kârlı)' : ''}`, 'muted'));
      chips.push(chip(`Maliyet ${price(line.cAct)}${b.cost == null ? ' (borsa)' : ''}`, 'muted'));
      if (!line.sellable) chips.push(chip('Bu maliyetle satılmaz', 'down'));
    } else chips.push(chip(line?.needsCost ? 'Borsada fiyat yok: maliyeti elle girin' : line?.reason || 'Hesaplanamadı', 'down'));
    return `<article class="ur-card" aria-label="${title}, ${esc(buildingName(b.letter))}, seviye ${b.level}">
      <div class="ur-row" style="gap:12px">
        <div class="grow"><div class="ur-row" style="flex-wrap:wrap;gap:6px"><span style="font:600 19px var(--font-c)">${title}</span>${chip(`Q${b.quality}`)}${badge(c.ctx.saturation[b.product])}</div>
          <span class="ur-note">${esc(buildingName(b.letter))}</span></div>
        <div class="ur-level"><small>Seviye</small><b>${num(b.level)}</b></div></div>
      <div class="ur-hr"></div>
      <div class="ur-metrics">
        <div class="ur-stat"><span>Saatlik</span><span class="c-price">${line?.ok ? num(line.unitsHour, 2) : '—'}</span></div>
        <div class="ur-stat"><span>Günlük</span><span>${line?.ok ? num(line.unitsDay) : '—'}</span></div>
        <div class="ur-stat"><span>Maaş/gün</span><span>${line?.ok ? money(line.wagesHour * 24) : '—'}</span></div></div>
      <div class="ur-chips">${chips.join('')}</div>
      <div class="ur-row"><button type="button" class="ur-btn grow${b.construction ? ' tint' : ''}" data-act="build" data-i="${i}" aria-pressed="${!!b.construction}">İnşaatta</button></div>
      <div class="ur-row"><button type="button" class="ur-btn tint grow" data-act="edit" data-i="${i}">${icon('edit')}Düzenle</button>
        <button type="button" class="ur-btn" data-act="copy" data-i="${i}" aria-label="Aynı özelliklerle kopyala">${icon('copy')}</button>
        <button type="button" class="ur-btn danger" data-act="del" data-i="${i}" aria-label="Sil">${icon('trash')}</button></div>
    </article>`;
  }
  // Borsada fiyatı olmayan ürün varken kâr hesaplanmaz; kullanıcıdan elle maliyet istenir
  // Her eksik mağaza için "maliyeti gir" düğmesi (bina panelini açar), restoran için Restoran sekmesine bağlantı; girilince uyarı kaybolur
  const eksikKarti = (ev, sekme) => {
    if (!ev.eksik) return '';
    const dugmeler = setup.buildings.map((b, i) => (ev.buildings[i]?.lines.some((l) => l.needsCost)
      ? `<button type="button" class="ur-btn primary" data-act="edit" data-i="${i}">${esc(nameOf(b.product))} Q${b.quality}: maliyeti gir</button>` : '')).join('');
    const restoran = !ev.restoran.totals.eksik ? '' : sekme === 'binalar'
      ? setup.restoranBinalari.items.map((it, i) => (ev.restoran.rows[i]?.eksik ? `<button type="button" class="ur-btn primary" data-act="pr.ac" data-i="${esc(it.id)}">${esc(it.ad || 'Restoran')}: menüyü aç</button>` : '')).join('')
      : '<a class="ur-btn primary" href="#perakende/binalar" style="text-decoration:none">Restoran: menü maliyetini gir</a>';
    return `<div class="ur-card" role="alert" style="border-color:var(--down)"><h2 class="c-down">Kâr hesaplanamadı</h2>
      <p class="ur-note">${num(ev.eksik)} kalemde borsada fiyat yok. Maliyeti elle girin${ev.restoran.totals.eksik ? " (restoranda menüdeki ürünün Sourcing Cost'u; her kategoriden en az bir ürün de gerekir)" : ''}; girer girmez uyarı kaybolur ve kâr hesaplanır. Girene kadar kâr ve zarar gösterilmez.</p>
      <div class="ur-row" style="flex-wrap:wrap;gap:8px">${dugmeler}${restoran}</div></div>`;
  };
  function viewBinalar(c, ev) {
    const cards = setup.buildings.map((b, i) => buildingCard(c, b, ev.buildings[i]?.lines[0], i)).join('');
    const empty = '<div class="ur-card ur-empty"><h2>Henüz bina yok</h2><p class="ur-sub">Bina ekleyin: tür, ürün, seviye ve kalite seçin. Restoran için seviye, doluluk ve menü girersiniz. PPHPL Max sekmesindeki önerilerden de ekleyebilirsiniz.</p></div>';
    const hepsi = ev.totals;
    const restoranKartlar = RB.rbKartlarHtml(setup.restoranBinalari, ev.restoran, marketOf, restoranBinaAcik);
    return `
      ${guideCard({ title: 'Perakende', lead: 'Mağazalarınızın hangi ürünle ne kadar kazandıracağını hesaplar. PPHPL, bir bina seviyesinin saatlik kârıdır (maaş düşülmüş).',
        chips: [[`Toplam satış bonusu ${pctText(c.bonusPct)}`, c.bonusPct > 0 ? '' : 'muted'], [`Yönetim gideri ${pctText(c.ctx.adminNet * 100)}`, 'muted'],
          data.hasRetailInfo ? null : ['Doygunluk verisi yok', 'down']] })}
      ${eksikKarti(ev, 'binalar')}
      ${hasPlan() ? `<div class="ur-stats">
        <div class="ur-stat"><span>Günlük kâr</span><span class="${ev.eksik ? '' : cls(hepsi.profitDay)}">${ev.eksik ? '—' : money(hepsi.profitDay)}</span></div>
        <div class="ur-stat"><span>Toplam maaş</span><span>${money(hepsi.wagesDay)}</span></div>
        <div class="ur-stat"><span>Kullanılan seviye</span><span>${num(hepsi.levels)}</span></div></div>` : ''}
      <button type="button" class="ur-btn primary" data-act="add" style="width:100%">${icon('plus')}Bina ekle</button>
      ${setup.buildings.length ? `<div class="ur-bgrid">${cards}</div>` : hasPlan() ? '' : empty}
      ${restoranKartlar}
      ${kisayolSatiri('perakendePphpl', 'perakendeOzet')}`;
  }

  // ---- RESTORAN PAROLA KAPISI ----
  function kilitHtml() {
    const msg = kilitDurum === 'yanlis' ? '<div class="ur-msg err" role="alert">Parola yanlış. Tekrar deneyin.</div>'
      : kilitDurum === 'bekle' ? '<div class="ur-msg" role="status">Biraz bekleyip tekrar deneyin.</div>'
        : kilitDurum === 'bakiliyor' ? '<div class="ur-msg" role="status">Kontrol ediliyor…</div>' : '';
    return `<section class="ur-card" aria-labelledby="h-kilit"><div class="ur-head"><h2 id="h-kilit">Restoran bölümü</h2></div>
      <p class="ur-sub">Bu bölüm yalnızca davet edilenlere açıktır. Parolayı sizinle paylaşan kişiden isteyin.</p>
      <label class="ur-field"><span>Parola</span><div class="ur-input"><input type="password" inputmode="numeric" autocomplete="off" data-kilit="1"></div></label>
      ${msg}<button type="button" class="ur-btn primary" data-act="kilitAc" ${kilitDurum === 'bakiliyor' || kilitDurum === 'bekle' ? 'disabled' : ''}>Giriş yap</button></section>`;
  }
  async function kilitGiris() {
    const girilen = view.querySelector('input[data-kilit]')?.value;
    if (kilitDurum === 'bakiliyor' || kilitDurum === 'bekle') return;
    kilitDurum = 'bakiliyor';
    render();
    let dogru = false;
    try { dogru = await kilitDene(girilen); } catch { dogru = false; }
    if (destroyed) return;
    if (dogru) { kilitDurum = ''; return render(); }
    kilitDurum = 'bekle';
    render();
    setTimeout(() => { if (destroyed) return; kilitDurum = 'yanlis'; render(); }, BEKLEME_MS); // yanlış denemelerin art arda yapılmasını yavaşlatır
  }

  // ---- RESTORAN ----
  function viewRestoran(c, ev) {
    if (!RESTORAN_BINALAR_ACIK) {
      return `<div class="ur-card ur-empty"><h2>Geliştiriliyor</h2><p class="ur-sub">Restoran binaları bölümü şu an geliştirme aşamasında; erişime kapalı. Restoran tüketimlerini Tüketimler sekmesinden görebilirsiniz.</p><div class="ur-row" style="gap:8px;flex-wrap:wrap"><a class="ur-btn" href="#perakende/oneri">Menü önerisine git</a><a class="ur-btn" href="#perakende/tuketim">Tüketimlere git</a></div></div>`;
    }
    const t = ev.restoranBolum.totals;
    return `
      ${eksikKarti(ev, 'restoran')}
      ${setup.restoran.items.length ? `<div class="ur-stats">
        <div class="ur-stat"><span>Günlük kâr</span><span class="${cls(t.profitDay)}">${money(t.profitDay)}</span></div>
        <div class="ur-stat"><span>Toplam maaş</span><span>${money(t.wagesDay)}</span></div>
        <div class="ur-stat"><span>Kullanılan seviye</span><span>${num(t.levels)}</span></div></div>` : ''}
      ${RS.restoranBinalarHtml(setup.restoran, ev.restoranBolum, marketOf, restoranAcik)}
      ${kisayolSatiri('perakendeOzet')}`;
  }

  // ---- MENÜ ÖNERİSİ ----
  function viewOneri(c) {
    // Yöneticilerin iletişim puanı rating bonusuna girer; girilmediyse bonus eksik hesaplanır ve güvenli hedef için gereken kalite yükselir
    const uyari = Y.bolumUyarilari(company, 'perakende').yoneticiYok ? `<div class="ur-msg err" role="alert"><b>Yönetici girilmedi</b>
      <p style="margin:6px 0 10px">Yöneticilerinizin iletişim puanı restoranın rating bonusuna girer. Girmediğiniz için bonus eksik hesaplanıyor; hedef rating için önerilen menü olduğundan pahalı çıkabilir.</p>
      <a class="ur-btn" href="#yonetim/ekip" style="text-decoration:none">Yönetim › Ekip'e git</a></div>` : '';
    return uyari + RS.menuOnerisiSekmeHtml(setup.restoran, { marketOf, arzOf, ratingBonus: c.ctx.ratingBonus, oyunEvresi: data.gamePhase,
      maas: { adminNet: c.ctx.adminNet, averageSalary: c.ctx.averageSalary, salaryModifier: c.ctx.buildings?.r?.salaryModifier } });
  }

  // ---- TÜKETİMLER ----
  function viewTuketim() {
    // Kayıtta fiyatı olmayan ürünlerde borsanın kalite ortalaması
    const fiyatYedek = (id) => { const v = Object.values(data.market?.[id] || {}); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    return RS.tuketimHtml(data.consumption, { nameOf, metrik: tuketimMetrik, aralik: tuketimAralik, urun: tuketimUrun, gun: tuketimGun, fiyatYedek });
  }

  // ---- PPHPL MAX ----
  function viewPphpl(c) {
    const ls = letters();
    const scope = rankFilter === 'all' ? ls : ls.filter((l) => l === rankFilter);
    const list = ranking(c, scope, 10);
    const opts = [['all', 'Tüm binalar'], ...ls.map((l) => [l, buildingName(l)])].map(([v, t]) =>
      `<option value="${esc(v)}" ${v === rankFilter ? 'selected' : ''}>${esc(t)}</option>`).join('');
    const rows = list.map((x, i) => `<div class="pk-rank"><span class="no">${i === 0 ? star(true) : num(i + 1)}</span>
      <div class="grow"><div class="ur-row" style="flex-wrap:wrap"><span class="title" style="font-weight:600;font-size:16px">${esc(nameOf(x.product))}</span>${chip(`Q${x.quality}`)}${badge(c.ctx.saturation[x.product])}</div>
        <span class="ur-note">${esc(buildingName(x.letter))} · PPHPL <b class="${cls(x.x.pphplMax)}">${money(x.x.pphplMax, 2)}</b> · fiyat ${esc(price(x.x.rMax))} · maliyet ${esc(price(x.x.cAct))}${x.market ? '' : ' (model)'}</span></div>
      <button type="button" class="ur-btn tint" data-act="addFrom" data-v="${esc(`${x.letter}|${x.product}|${x.quality}`)}">${icon('plus')}Ekle</button></div>`).join('');
    return `<section class="ur-card" aria-labelledby="h-max"><h2 id="h-max">PPHPL Max</h2>
        <p class="ur-sub">Kalite fark etmeden en yüksek PPHPL'li 10 ürün. Maliyet borsadaki fiyat, satış fiyatı en kârlı fiyat. Ekle'ye dokununca bina, ürün ve kalite seçili gelir; yalnız seviyeyi yazarsınız.</p>
        ${headChips(c)}
        <label class="ur-field"><span>Bina</span><select data-f="rankFilter" aria-label="Bina">${opts}</select></label>
        ${rows || '<p class="ur-note">Doygunluk verisi olan ürün yok.</p>'}</section>`;
  }

  // ---- ÖZET ----
  const grp = (t) => `<div class="ur-grp">${t}</div>`;
  const ago = (t) => {
    if (!t) return '';
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    return mins < 1 ? 'az önce' : mins < 60 ? `${mins} dk önce` : mins < 1440 ? `${Math.round(mins / 60)} sa önce` : `${Math.round(mins / 1440)} gün önce`;
  };
  // Gün bazında hesap tablosu (Üretim özetindeki muhasebenin karşılığı)
  function accounts(c, ev) {
    const t = ev.totals;
    let baseDay = 0;
    setup.buildings.forEach((b) => { baseDay += baseWage(c, b.letter, b.product, b.quality) * b.level * 24; });
    baseDay += ev.restoran.totals.baseWagesDay;
    const adminDay = Math.max(0, t.wagesDay - baseDay);
    const sim = Y.executiveSimulation({ executives: company.executives, finance: company.finance,
      admin: { totalLevels: c.adm.totalLevels, wagesDay: t.wagesDay }, retail: { marginDay: t.marginDay, otherSpeedPct: c.baseSpeed } });
    // Satış hızının değeri: adet 1/(1 − b/100) ile arttığı için motorun kendi formülüyle (Yönetim sekmesi de aynı formülü kullanır)
    const cmo = R.cmoValueDay(engineSetup(c), c.ctx, { otherSpeedPct: c.baseSpeed, teamSalesSpeedPct: c.teamPct });
    return { t, baseDay, adminDay, sim, coo: sim.sectors.coo, cfo: sim.sectors.cfo, cmo, salaries: sim.salariesDay,
      profit: t.profitDay, cash: t.profitDay == null ? null : t.profitDay - sim.salariesDay };
  }
  // Bina bazında kâr ve zarar: mağazalar ve restoranlar tek listede, altında kâr eden, zarar eden ve net toplam
  function karZararKarti(ev, k, periodName) {
    const m = (v) => (v == null ? '—' : money(v * k));
    const ms = (v) => (v == null ? '—' : v * k > 0.5 ? `+${money(v * k)}` : money(v * k));
    const rows = [];
    setup.buildings.forEach((b, i) => {
      const l = ev.buildings[i]?.lines[0];
      const v = b.construction ? 0 : l?.ok ? l.profitDay : null;
      rows.push({ v, html: `<div class="ur-kv"><span>${esc(nameOf(b.product))} Q${b.quality} <span class="ur-note">${esc(buildingName(b.letter))} · seviye ${num(b.level)}${b.construction ? ' · inşaatta' : ''}</span></span><span class="${cls(v)}">${ms(v)}</span></div>` });
    });
    setup.restoranBinalari.items.forEach((it, i) => {
      const row = ev.restoran.rows[i];
      const v = row.eksik ? null : row.secili.profitDay;
      const acik = ozetAcik.has(it.id);
      rows.push({ v, html: `<div><button type="button" class="rb-ozet-ac ur-kv" data-act="pr.ozet" data-i="${esc(it.id)}" aria-expanded="${acik}" style="width:100%"><span>${esc(it.ad || 'Restoran')} <span class="ur-note">Restoran · seviye ${num(it.seviye)} · ${acik ? 'ayrıntıyı gizle' : 'ayrıntıyı aç'}</span></span><span class="${cls(v)}">${ms(v)}</span></button>${acik ? RB.ozetDetayHtml(row, k) : ''}</div>` });
    });
    const z = RB.karZarar(rows.map((x) => x.v));
    return `<section class="ur-card" aria-labelledby="h-kz"><h2 id="h-kz">Kâr ve zarar dağılımı (${periodName})</h2>
      <p class="ur-sub">Her bina tek satır; restoranın satırına dokununca gelir, malzeme ve maaşı açılır.</p>
      ${rows.map((x) => x.html).join('')}
      <div class="ur-hr"></div>
      ${kv('Kâr eden binaların toplamı', z.kar ? `+${m(z.kar)}` : m(0), z.kar ? 'c-up' : '')}${kv('Zarar eden binaların toplamı', m(z.zarar), z.zarar ? 'c-down' : '')}
      ${kv('Net toplam', ms(z.net), cls(z.net), true)}
      ${z.eksik ? `<p class="ur-note c-down">${num(z.eksik)} binanın kârı hesaplanamadı (maliyet ya da menü eksik); net toplam gösterilmez.</p>` : ''}</section>`;
  }
  function viewOzet(c, ev) {
    const [, periodLabel, k] = PERIODS.find(([key]) => key === period);
    const periodName = periodLabel.toLocaleLowerCase('tr');
    if (!hasPlan()) {
      return `<div class="ur-card ur-empty"><h2>Özet için bina ekleyin</h2><p class="ur-sub">Binalar sekmesinde mağazalarınızı eklediğinizde gelir tablosu burada oluşur.</p>
        <a class="ur-btn primary" href="#perakende/binalar" style="text-decoration:none;margin-top:10px">Binalar'a git</a></div>`;
    }
    const A = accounts(c, ev);
    const t = A.t;
    const m = (v) => (v == null ? '—' : money(v * k));
    const ms = (v) => (v == null ? '—' : v * k > 0.5 ? `+${money(v * k)}` : money(v * k));
    const restoranVar = setup.restoranBinalari.items.length > 0; // adet yalnız mağazalara ait; restoranla karışınca adet başı değer anlamsız
    const unit = (v) => (v != null && t.unitsDay > 0 && !restoranVar ? price(v / t.unitsDay) : restoranVar ? '' : '—');
    const triHead = `<div class="ur-tri head"><span></span><span>Toplam</span><span>${restoranVar ? '' : 'Adet başı'}</span></div>`;
    const margin = t.revenueDay > 0 && t.profitDay != null ? pctText((t.profitDay / t.revenueDay) * 100) : '—';

    const income = `<section class="ur-card" aria-labelledby="h-inc"><h2 id="h-inc">Gelir tablosu (${periodName})</h2>
      <p class="ur-sub">Mağaza satışında komisyon ve taşıma yoktur. Satış fiyatı ve mal maliyeti binalarda girdiğiniz değerlerdir; boş fiyat en kârlı fiyat, boş maliyet borsa fiyatıdır.</p>
      ${triHead}
      ${grp('Gelir')}${tri('Satış geliri', m(t.revenueDay), unit(t.revenueDay), { strong: true })}
      ${grp('Maliyet')}${tri('Mal maliyeti', m(-t.costDay), unit(-t.costDay), { indent: true })}${tri('Bina maaşları', m(-A.baseDay), unit(-A.baseDay), { indent: true })}
      ${tri('Yönetim gideri', m(-A.adminDay), unit(-A.adminDay), { indent: true })}
      ${tri('Toplam maliyet', m(-(t.costDay + t.wagesDay)), unit(-(t.costDay + t.wagesDay)), { strong: true, line: true })}
      ${tri('Brüt kâr', ms(t.profitDay), unit(t.profitDay), { strong: true, line: true, ca: cls(t.profitDay), cb: cls(t.profitDay) })}
      ${grp('İşletme gideri')}${tri('Yönetici maaşları', m(-A.salaries), unit(-A.salaries), { indent: true })}
      ${tri('Net nakit', ms(A.cash), unit(A.cash), { strong: true, line: true, ca: cls(A.cash), cb: cls(A.cash) })}
      <div class="ur-hr"></div>
      ${tri('Brüt kâr marjı', margin, '', { muted: true })}
      ${tri('Yönetici tasarrufu', ms(A.coo), '', { muted: true, ca: 'c-up' })}
      <p class="ur-note">Brüt kâr: satış gelirinden mal maliyeti, bina maaşı ve yönetim gideri düşülmüş hâli. Net nakit: yönetici maaşları da düşülünce günün sonunda kasaya giren. Yönetici tasarrufu bilgi satırıdır, toplama girmez.</p></section>`;

    const parts = [['Mal maliyeti', t.costDay, 'var(--accent)'], ['Bina maaşları', A.baseDay, 'var(--s-vol)'], ['Yönetim gideri', A.adminDay, 'var(--price)'],
      ['Yönetici maaşları', A.salaries, 'var(--faint)']].filter((x) => x[1] > 0);
    const total = parts.reduce((a, x) => a + x[1], 0);
    const costs = total > 0 ? `<section class="ur-card" aria-labelledby="h-cost"><h2 id="h-cost">Maliyet dağılımı (${periodName})</h2>
      <div class="ur-bar" role="img" aria-label="${parts.map(([n, v]) => `${n} ${pctText((v / total) * 100)}`).join(', ')}">${parts.map(([, v, col]) => `<span style="width:${((v / total) * 100).toFixed(2)}%;background:${col}"></span>`).join('')}</div>
      ${parts.map(([n, v, col]) => `<div class="ur-kv"><span><i class="ur-dot" style="background:${col}"></i>${n}</span><span>${m(v)} <small class="c-muted">${pctText((v / total) * 100)}</small></span></div>`).join('')}
      <div class="ur-hr"></div>${kv('Toplam gider', m(total), '', true)}</section>` : '';

    const products = setup.buildings.map((b, i) => {
      const l = ev.buildings[i]?.lines[0];
      const head = `<div class="ur-row" style="gap:6px;flex-wrap:wrap"><span style="font-size:18px;font-weight:600">${esc(nameOf(b.product))}</span>${chip(`Q${b.quality}`)}${badge(c.ctx.saturation[b.product])}
        <span class="ur-note" style="margin-left:auto">${l?.ok ? `${num(l.unitsDay * k)} adet` : ''}</span></div>
        <span class="ur-note">${esc(buildingName(b.letter))} · seviye ${num(b.level)}</span>`;
      if (b.construction) return `<div class="ur-card" style="padding:12px">${head}<p class="ur-note">İnşaatta: satış ve maaş yok; seviyesi yönetim giderine girer.</p></div>`;
      if (!l?.ok) return `<div class="ur-card" style="padding:12px">${head}<p class="ur-note c-down">${esc(l?.reason || 'Hesaplanamadı')}</p></div>`;
      const gross = l.price - l.cAct;
      const has = l.unitsHour > 0;
      const wagePer = has ? l.wagesHour / l.unitsHour : null;
      const netPer = has ? l.profitHour / l.unitsHour : null;
      return `<div class="ur-card" style="padding:12px">${head}
        ${kv('Birim maliyet', price(l.cAct))}${kv(`Satış fiyatı${b.price == null ? ' (en kârlı)' : ''}`, price(l.price))}
        ${kv('Birim kâr (maaş hariç)', money(gross, 2), cls(gross), true)}
        ${kv('Birim maaş ve yönetim', has ? money(-wagePer, 2) : '—')}
        ${kv('Net birim kâr', has ? money(netPer, 2) : '—', cls(netPer), true)}
        <div class="ur-hr"></div>
        ${kv(`Kâr (${periodName})`, ms(l.profitDay), cls(l.profitDay))}
        ${kv('Saat başı, seviye başı kâr (PPHPL)', money(l.pphpl, 2), cls(l.pphpl))}
        ${has ? '' : '<p class="ur-note c-down">Bu fiyatta ürün satılmıyor; yalnız maaş ödeniyor.</p>'}</div>`;
    }).join('');

    const sim = A.sim;
    const gross = (c.adm.gross || 0) * 100;
    const net = (c.adm.net || 0) * 100;
    const savedPts = Math.max(0, gross - net);
    const savings = gross > 0 ? savedPts / gross : 0;
    const hasTeam = company.executives.length > 0;
    const worth = A.coo + A.cfo + A.cmo;
    const gain = worth - A.salaries;
    const execs = `<section class="ur-card" aria-labelledby="h-ex2"><h2 id="h-ex2">Yönetim ve vergi (${periodName})</h2>
        <p class="ur-sub">Ekip Yönetim sekmesinde girilir; bu plandaki binalar için hesaplanır.${hasTeam ? '' : ' Henüz yönetici yok.'}</p>
        <div class="ur-box">${kv('Brüt yönetim gideri', `%${NF[2].format(gross)} − ${NF[2].format(savedPts)}`)}
          ${kv('Net yönetim gideri', `%${NF[2].format(net)}`, 'c-price', true)}
          ${kv('Yönetim tasarrufu', `%${NF[(savings * 100) % 1 ? 2 : 0].format(savings * 100)}`, savings > 0 ? 'c-up' : '', true)}</div>
        <div class="ur-box">${kv('Yönetimin kazandırdığı', m(A.coo), A.coo > 0 ? 'c-up' : '')}
          ${kv('İletişimin kazandırdığı (satış hızı)', m(A.cmo), A.cmo > 0 ? 'c-up' : '')}
          ${kv('Günlük vergi', m(sim.tax.day), 'c-price')}${kv('Yöneticisiz olsaydı', m(sim.tax.withoutDay))}
          ${kv('Muhasebenin kazandırdığı', m(A.cfo), A.cfo > 0 ? 'c-up' : '')}
          <div class="ur-hr"></div>
          ${kv('Yöneticilerin kazandırdığı', m(worth), '', true)}${kv('Yönetici maaşları', m(A.salaries))}
          ${kv('Net getiri', ms(gain), cls(gain), true)}</div>
        ${hasTeam ? `<p class="ur-note">İletişim: satış hızı +%${NF[0].format(c.teamPct)}. Bilim: araştırma hızı +%${NF[0].format(sim.team.researchSpeedPct)} (araştırma binalarına uygulanır, mağazalarda değil).</p>` : ''}
        ${!sim.tax.assets ? '<p class="ur-note">Muhasebenin vergi değeri için Yönetim › Simülasyon › Muhasebe altında nakit ve bonoyu girin.</p>' : ''}
        <a class="ur-btn" href="#yonetim/ekip" style="text-decoration:none">Yönetim'de düzenle</a></section>`;

    const manualCost = setup.buildings.filter((b) => b.cost != null).length;
    const manualPrice = setup.buildings.filter((b) => b.price != null).length;
    const noMarket = setup.buildings.filter((b) => b.cost == null && marketOf(b.product, b.quality) == null).length;
    const notes = [
      data.liveT ? `Borsa fiyatları ${ago(data.liveT)} güncellendi.` : 'Borsa fiyatları okunamadı; maliyetleri elle girin.',
      manualCost || manualPrice ? `${manualCost} maliyet, ${manualPrice} satış fiyatı elle girildi.` : 'Bütün maliyetler borsadan, satış fiyatları en kârlı fiyat.',
      noMarket ? `${noMarket} üründe borsa fiyatı yok; maliyet elle girilene kadar kâr hesaplanmaz.` : null,
      `Ekonomi fazı: ${H.ECONOMY_PHASES[c.econ]}${setup.economyPhase == null ? ' (otomatik)' : ''}.`,
      `Satış hızı: kurulum ${pctText(c.baseSpeed)}, ekip ${pctText(c.teamPct)}; hesapta toplam ${pctText(c.bonusPct)}.`,
      setup.restoranBinalari.items.length ? 'Restoran: girdiğiniz doluluk (boşsa ısı haritası tahmini) ve menüyle hesaplandı; yönetim gideri mağazalarla ortaktır, satış hızı restoranı etkilemez.' : null,
      'Satış ofisi bu hesaba girmez.',
      data.hasRetailInfo ? null : 'Doygunluk (talep) verisi bulunamadı; hesaplar eksik olabilir.',
      'Vergi (muhasebe ücreti) kâra dahil değil; nakde bağlıdır. Günlük vergi ve muhasebecinin değeri bu sayfadaki Yönetim ve vergi kartında.',
    ].filter(Boolean);

    return `
      <div class="ur-head"><div><h1>Ön muhasebe</h1><p class="ur-sub">Planınızın gelir, gider ve kâr tablosu.</p></div></div>
      ${seg('period', PERIODS.map(([key, label]) => [key, label]), period, 'Dönem')}
      ${eksikKarti(ev, 'ozet')}
      <div class="ur-card" style="padding:12px;gap:2px"><span class="ur-note" style="font-weight:600">Brüt kâr</span><span class="${cls(t.profitDay)}" style="font:600 22px var(--font-c)">${ms(t.profitDay)}</span><span class="ur-note">Net nakit ${ms(A.cash)} · kullanılan seviye ${num(t.levels)}</span></div>
      ${karZararKarti(ev, k, periodName)}
      ${income}${costs}
      <section style="display:flex;flex-direction:column;gap:10px"><h2>Ürün bazında kârlılık</h2><p class="ur-sub">Her binadaki ürünün maliyeti, satış fiyatı ve maaş payı.</p>${products}</section>
      ${execs}
      <section class="ur-card" aria-labelledby="h-notes"><h2 id="h-notes">Hesap notları</h2>${notes.map((n) => `<p class="ur-note">• ${esc(n)}</p>`).join('')}</section>
      <div class="ur-row"><button type="button" class="ur-btn grow" data-act="copySummary">${icon('copy')}Özeti kopyala</button><a class="ur-btn grow" href="#perakende/binalar" style="text-decoration:none">Binalara dön</a></div>`;
  }
  function summaryText(c, ev) {
    const [, periodLabel, k] = PERIODS.find(([key]) => key === period);
    const A = accounts(c, ev);
    const t = A.t;
    const mm = (v) => (v == null ? '—' : money(v * k));
    const rows = [['Satış geliri', t.revenueDay], ['Mal maliyeti', -t.costDay], ['Bina maaşları', -A.baseDay], ['Yönetim gideri', -A.adminDay],
      ['Brüt kâr', t.profitDay], ['Yönetici maaşları', -A.salaries], ['Net nakit', A.cash]];
    // Panoya giden metin sayfada değil; seçili dile burada çevrilir (etiketler hizalamadan önce)
    return [ceviri(`DentSimco perakende özeti · Realm ${r + 1} · ${periodLabel} · ${H.ECONOMY_PHASES[c.econ]}`),
      ceviri(`Satış hızı: kurulum ${pctText(c.baseSpeed)} + ekip ${pctText(c.teamPct)} · Yönetim gideri ${pctText(c.ctx.adminNet * 100)}`),
      `${ceviri('Binalar:')} ${[...setup.buildings.map((b) => `${nameOf(b.product)} Q${b.quality} (${buildingName(b.letter)} ${b.level})`), ...setup.restoranBinalari.items.map((it) => `${it.ad || buildingName('r')} (${buildingName('r')} ${it.seviye})`)].join(', ')}`, '',
      ...rows.map(([n, v]) => `${ceviri(n).padEnd(20)}${mm(v).padStart(14)}`), '',
      ceviri(`Yönetimin kazandırdığı ${mm(A.coo + A.cfo + A.cmo)} · yönetici net getirisi ${mm(A.coo + A.cfo + A.cmo - A.salaries)}`)].join('\n');
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* eski tarayıcı: aşağıdaki yedek yol */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch { return false; }
  }

  // ---- BİNA PANELİ ----
  function openSheet(draft) {
    sheet = { draft };
    if (draft.product) ensureHistory(draft.product);
    document.body.style.overflow = 'hidden';
    renderSheet(true);
  }
  function closeSheet() {
    sheet = null;
    sheetHost.innerHTML = '';
    document.body.style.overflow = '';
  }
  function setProduct(d, c, product, quality = null) {
    d.product = product;
    const best = product ? bestQuality(c, d.letter, product) : null;
    d.quality = quality ?? best?.quality ?? 0;
    d.cost = null;
    d.price = null;
    if (product) ensureHistory(product);
  }
  // Panelin kârlılık kutusu: hem panel çizilirken hem seviye yazılırken (panel yeniden çizilmeden) kullanılır
  const resultBox = (x, lv) => (x.ok ? `
            ${kv('PPHPL', money(x.pphpl, 2), cls(x.pphpl), true)}
            ${kv('En kârlı fiyat', x.sellable ? price(x.rMax) : '—')}
            ${kv('Saatlik satış', `${num(x.usphpl * lv, 1)} adet`)}
            ${kv(`Günlük kâr (seviye ${num(lv)})`, money(x.pphpl * lv * 24), cls(x.pphpl), true)}
            ${!x.sellable ? '<p class="ur-note c-down">Bu maliyetle hiçbir fiyatta kâr yok; ürün satılmaz, yalnız maaş ödenir.</p>' : x.belowCost ? '<p class="ur-note c-down">Fiyat maliyetin altında.</p>' : x.aboveOptimum ? '<p class="ur-note">Fiyat en kârlı fiyatın üstünde; satış yavaşlar.</p>' : ''}` : `<p class="ur-note c-down">${esc(x.reason)}</p>`);
  function renderSheet(first = false) {
    if (!sheet || !data) return;
    const keep = sheetHost.querySelector('.ur-panel')?.scrollTop || 0;
    const ae = document.activeElement;
    const focusKey = ae?.dataset?.d ? `[data-d="${ae.dataset.d}"]`
      : ae?.dataset?.act && ae.closest?.('.ur-panel') ? `[data-act="${ae.dataset.act}"]${ae.dataset.v != null ? `[data-v="${ae.dataset.v}"]` : ''}` : null; // +/− düğmesi de odakta kalır
    const c = context();
    const d = sheet.draft;
    const editing = d.index != null;
    const lopts = `<option value="" ${d.letter ? '' : 'selected'} disabled>Bina türü seçin</option>${[...letters(), 'r'].sort((a, b) => buildingName(a).localeCompare(buildingName(b), 'tr')).map((l) => `<option value="${esc(l)}" ${d.letter === l ? 'selected' : ''}>${esc(buildingName(l))}</option>`).join('')}`;
    let rest = '';
    if (d.letter === 'r') {
      d.rb ||= RB.yeniTaslak();
      rest = RB.sheetHtml(d.rb, setup.restoranBinalari);
    } else if (d.letter) {
      const top = ranking(c, [d.letter], 10);
      const picks = top.map((x, i) => `<button type="button" class="pk-pick" data-act="pick" data-v="${x.product}|${x.quality}" aria-pressed="${x.product === d.product && x.quality === d.quality}">
          ${star(i === 0)}<span class="grow"><span class="name">${esc(nameOf(x.product))} <span class="ur-chip" style="margin-left:4px">Q${x.quality}</span></span><br>${badge(c.ctx.saturation[x.product])}</span>
          <span class="vals"><b class="${cls(x.x.pphplMax)}">${money(x.x.pphplMax, 2)}</b><small>fiyat ${esc(price(x.x.rMax))}</small></span></button>`).join('');
      const products = R.buildingProducts(d.letter, c.econ).slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'tr'));
      const popts = `<option value="" ${d.product ? '' : 'selected'} disabled>Ürün seçin</option>${products.map((id) => {
        const dem = demandOf(c.ctx.saturation[id]);
        return `<option value="${id}" ${d.product === id ? 'selected' : ''}>${esc(nameOf(id))} — ${dem ? `${dem.label} talep` : 'talep verisi yok'}</option>`;
      }).join('')}`;
      const topOpen = sheet.topOpen ?? !d.product; // ürün seçilince kendiliğinden kapanır
      rest = `<label class="ur-field"><span>Ürün</span><select data-d="product" aria-label="Ürün">${popts}</select></label>
        <section aria-label="En kârlı 10 ürün"><button type="button" class="pk-fold" data-act="toggleTop" aria-expanded="${topOpen}" aria-controls="pk-top">
            <span class="grow">En kârlı 10 ürün</span>${chip(`${top.length} ürün`, 'muted')}${icon('chev')}</button>
          <div id="pk-top" ${topOpen ? '' : 'hidden'}><p class="ur-note" style="margin-top:8px">Borsa maliyeti ve en kârlı fiyatla, kalitesiyle birlikte. Dokununca ürün ve kalite seçilir.</p>
            <div style="margin-top:6px">${picks || '<p class="ur-note">Bu bina için kâr getiren ürün yok.</p>'}</div></div></section>`;
      if (d.product) {
        const sat = c.ctx.saturation[d.product];
        const qs = qualityOptions(c, d.letter, d.product);
        const best = qs.length ? qs.reduce((a, b) => (b.x.pphplMax > a.x.pphplMax ? b : a)) : null;
        const qList = qs.some((o) => o.quality === d.quality) ? qs : [...qs, { quality: d.quality, market: false, x: calc(c, { ...d, cost: null, price: null }) }].sort((a, b) => a.quality - b.quality);
        const bestOk = !!best && best.x.sellable && best.x.pphplMax > 0;
        const qopts = qList.map((o) => `<option value="${o.quality}" ${o.quality === d.quality ? 'selected' : ''}>Q${o.quality} · PPHPL ${o.x.ok ? money(o.x.pphplMax, 2) : '—'}${bestOk && o.quality === best.quality ? ' · önerilen' : ''}</option>`).join('');
        const x = calc(c, d);
        const mk = marketOf(d.product, d.quality);
        const h = history.get(d.product);
        const chart = !h || h.state === 'loading' ? '<p class="ur-note" aria-busy="true">Geçmiş fiyatlar yükleniyor…</p>'
          : h.state === 'err' ? '<p class="ur-note">Geçmiş fiyatlar okunamadı.</p>' : chartSvg(vwapSeries(h.h, d.quality), d.quality);
        const lv = Math.max(0, d.level || 0);
        rest += `<div class="ur-chips">${badge(sat)}${Number.isFinite(sat) ? chip(`Doygunluk ${num(sat, 2)}`, 'muted') : chip('Doygunluk verisi yok', 'down')}</div>
          <label class="ur-field"><span>Seviye</span><div class="pk-step">
            <button type="button" class="ur-btn" data-act="step" data-v="-1" aria-label="Seviyeyi azalt">${icon('minus')}</button>
            <input type="text" inputmode="numeric" autocomplete="off" data-d="level" value="${d.level || ''}" placeholder="0" aria-label="Seviye">
            <button type="button" class="ur-btn" data-act="step" data-v="1" aria-label="Seviyeyi artır">${icon('plus')}</button></div></label>
          <label class="ur-field"><span>Kalite</span><select data-d="quality" aria-label="Kalite">${qopts}</select>
            ${bestOk ? `<p class="ur-note">Önerilen: <b>Q${best.quality}</b>, en yüksek PPHPL ${money(best.x.pphplMax, 2)}.${best.quality !== d.quality ? ' <button type="button" class="ur-btn tint" data-act="useBest" style="min-height:36px;margin-left:6px">Önerileni seç</button>' : ''}</p>` : best ? '<p class="ur-note c-down">Şu borsa fiyatlarıyla hiçbir kalite kâr getirmiyor.</p>' : ''}</label>
          ${field('Birim maliyet', 'cost', inputVal(d.cost), { unit: '$', attr: 'data-d', placeholder: x.ok ? NF[x.cAct < 10 ? 3 : 2].format(x.cAct) : '', hint: mk != null ? 'Boşsa bu kalitenin borsa fiyatı.' : 'Borsada bu kalite için ilan yok; kâr için maliyeti elle girin.' })}
          ${field('Satış fiyatı', 'price', inputVal(d.price), { unit: '$', attr: 'data-d', placeholder: x.ok && x.sellable ? NF[x.rMax < 10 ? 3 : 2].format(x.rMax) : '', hint: 'Boşsa en kârlı fiyat.' })}
          <div class="ur-box" aria-live="polite" data-result>${resultBox(x, lv)}</div>
          <section aria-labelledby="h-gr"><h2 id="h-gr" style="font-size:17px">Fiyat geçmişi, 30 gün</h2>${chart}</section>`;
      }
    }
    const canSave = d.letter === 'r' ? Number(d.rb?.seviye) > 0 : d.letter && d.product && d.level > 0;
    sheetHost.innerHTML = `<div class="ur-sheet ur" style="padding:0;max-width:none;margin:0" data-act="sheetBackdrop"><div class="ur-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="ur-panel-head"><div class="grow" style="flex:1"><h2 id="sheet-title">${editing ? 'Binayı düzenle' : 'Bina ekle'}</h2><p class="ur-sub">Seviye ve kaliteye göre kârlılık anında hesaplanır.</p></div>
        <button type="button" class="ur-btn" data-act="sheetClose" aria-label="Kapat">${icon('close')}</button></div>
      <label class="ur-field"><span>Bina türü</span><select data-d="letter" aria-label="Bina türü">${lopts}</select></label>
      ${rest}
      <div class="ur-panel-foot">${editing ? `<button type="button" class="ur-btn danger" data-act="sheetDel" aria-label="Sil">${icon('trash')}</button>` : ''}
        <button type="button" class="ur-btn grow" data-act="sheetClose">Vazgeç</button>
        <button type="button" class="ur-btn primary grow" data-act="sheetSave" ${canSave ? '' : 'disabled'}>${editing ? 'Kaydet' : 'Ekle'}</button></div>
    </div></div>`;
    const panel = sheetHost.querySelector('.ur-panel');
    if (first) {
      const target = d.product && !d.level ? sheetHost.querySelector('[data-d="level"]') : sheetHost.querySelector('select');
      target?.focus({ preventScroll: true });
    } else {
      if (panel) panel.scrollTop = keep;
      if (focusKey) sheetHost.querySelector(focusKey)?.focus({ preventScroll: true });
    }
  }
  function saveSheet() {
    const d = sheet?.draft;
    if (d?.letter === 'r') {
      if (!(Number(d.rb?.seviye) > 0)) return;
      const next = clone();
      restoranBinaAcik.add(RB.rbEkle(next.restoranBinalari, d.rb));
      closeSheet();
      commit(next);
      return toast('Restoran eklendi. Menüyü kartında seçin.');
    }
    if (!d?.letter || !d.product || !(d.level > 0)) return;
    const next = clone();
    const b = { id: d.id || uid(), letter: d.letter, product: d.product, quality: d.quality, level: d.level, cost: d.cost, price: d.price, construction: !!d.construction };
    if (d.index != null && next.buildings[d.index]) next.buildings[d.index] = b; else next.buildings.push(b);
    const added = d.index == null;
    closeSheet();
    commit(next);
    toast(added ? `${nameOf(b.product)} eklendi.` : 'Bina güncellendi.');
  }

  // ---- olaylar ----
  function onClick(ev) {
    const btn = ev.target.closest('[data-act]');
    if (!btn || !root.contains(btn)) return;
    const act = btn.dataset.act;
    if (act === 'sheetBackdrop' && (ev.target !== btn || !downOnBackdrop)) return;
    if (act === 'retry') return load();
    if (act === 'kilitAc') return kilitGiris();
    if (!data) return;
    if (act === 'kbOnay') { kbOnay = true; return render(); }
    if (act === 'kbIptal') { kbOnay = false; return render(); }
    if (act === 'kbSil') {
      kbOnay = false;
      const eski = Y.karsiBolumuKaldir(r, 'uretim');
      company = Y.loadCompanyRecord(r).company;
      render();
      if (!eski) return toast('Kaldırılamadı: tarayıcı kaydı açık değil.');
      kbGeri = eski;
      return toastKbGeri('Üretim binaları kaldırıldı.');
    }
    if (act === 'kbGeri') {
      const geri = Y.karsiBolumuGeriYukle(kbGeri);
      kbGeri = null;
      toastHost.innerHTML = '';
      company = Y.loadCompanyRecord(r).company;
      render();
      return toast(geri ? 'Üretim binaları geri yüklendi.' : 'Geri alınamadı.');
    }
    if (act === 'sheetBackdrop' || act === 'sheetClose') return closeSheet();
    if (act === 'sheetSave') return saveSheet();
    if (act === 'sheetDel') {
      const i = sheet?.draft?.index;
      closeSheet();
      if (i == null) return;
      const next = clone();
      next.buildings.splice(i, 1);
      return commit(next);
    }
    const c = context();
    if (sheet) {
      const d = sheet.draft;
      if (act === 'rb.tip') { d.rb.tip = btn.dataset.v === 'luks' ? 'luks' : 'eko'; return renderSheet(); }
      if (act === 'toggleTop') { sheet.topOpen = !(sheet.topOpen ?? !d.product); return renderSheet(); }
      if (act === 'pick') { const [p, q] = btn.dataset.v.split('|').map(Number); setProduct(d, c, p, q); sheet.topOpen = false; return renderSheet(); }
      if (act === 'step') { d.level = Math.max(0, (d.level || 0) + Number(btn.dataset.v)); return renderSheet(); }
      if (act === 'useBest') { const best = bestQuality(c, d.letter, d.product); if (best) d.quality = best.quality; return renderSheet(); }
    }
    if (act === 'add') return openSheet({ index: null, letter: '', product: null, quality: 0, level: 0, cost: null, price: null });
    if (act === 'addFrom') {
      const [letter, p, q] = btn.dataset.v.split('|');
      return openSheet({ index: null, letter, product: Number(p), quality: Number(q), level: 0, cost: null, price: null });
    }
    if (act === 'edit') {
      const i = Number(btn.dataset.i);
      const b = setup.buildings[i];
      if (b) openSheet({ ...b, index: i });
      return;
    }
    if (act === 'build') {
      const i = Number(btn.dataset.i);
      if (!setup.buildings[i]) return;
      const next = clone();
      next.buildings[i] = { ...next.buildings[i], construction: !next.buildings[i].construction };
      commit(next);
      return toast(next.buildings[i].construction ? 'Bina inşaatta: satış ve maaş yok, seviyesi yönetim giderine girer.' : 'Bina inşaattan çıktı.');
    }
    if (act === 'copy') {
      const i = Number(btn.dataset.i);
      const b = setup.buildings[i];
      if (!b) return;
      const next = clone();
      next.buildings.splice(i + 1, 0, { ...b, id: uid() });
      commit(next);
      return toast('Bina kopyalandı.');
    }
    if (act === 'del') {
      const next = clone();
      next.buildings.splice(Number(btn.dataset.i), 1);
      commit(next);
      return toast('Bina silindi.');
    }
    if (act === 'copySummary') {
      const c0 = context();
      const text = summaryText(c0, evaluateAll(c0));
      copyText(text).then((ok) => toast(ok ? 'Özet kopyalandı.' : 'Kopyalanamadı; metni elle seçip kopyalayın.'));
      return;
    }
    if (act === 'period') {
      period = btn.dataset.v;
      try { localStorage.setItem(PERIOD_KEY, period); } catch { /* gizli sekme */ }
      return softRender();
    }
    if (act === 'rt.metrik') { tuketimMetrik = btn.dataset.v === 'tutar' ? 'tutar' : 'adet'; return softRender(); }
    if (act === 'rt.aralik') { tuketimAralik = [7, 14, 28].includes(Number(btn.dataset.v)) ? Number(btn.dataset.v) : 28; return softRender(); }
    if (act === 'rt.urun') { tuketimUrun = btn.dataset.v; return softRender(); }
    if (act === 'rt.gun') { tuketimGun = btn.dataset.v; return softRender(); }
    if (act === 'pr.ozet') { if (ozetAcik.has(btn.dataset.i)) ozetAcik.delete(btn.dataset.i); else ozetAcik.add(btn.dataset.i); return softRender(); }
    if (/^p[rm]\./.test(act)) {
      const nx = clone();
      if (RB.rbTikla(nx.restoranBinalari, btn, { marketOf, acik: restoranBinaAcik })) return commit(nx);
    }
    if (/^r[kfmo]\./.test(act)) {
      const nx = clone();
      if (RS.restoranTikla(nx.restoran, btn, { marketOf, acik: restoranAcik })) return commit(nx);
    }
    const next = clone();
    if (act === 'phase') { next.economyPhase = btn.dataset.v === 'auto' ? null : Number(btn.dataset.v); return commit(next); }
    if (act.startsWith('rec.')) { next.recreation[act.slice(4)] = Number(btn.dataset.v); return commit(next); }
    if (act === 'reset') {
      if (!window.confirm(`Realm ${r + 1} perakende kurulumu silinsin mi?`)) return;
      return commit(defaultSetup(), { sync: false });
    }
  }
  function onChange(ev) {
    const t = ev.target;
    if (!data) return;
    if (t?.dataset?.d && sheet) {
      const d = sheet.draft;
      const c = context();
      const k = t.dataset.d;
      if (k === 'letter') { d.letter = t.value; setProduct(d, c, null); sheet.topOpen = undefined; if (d.letter === 'r') d.rb ||= RB.yeniTaslak(); }
      else if (k === 'product') { setProduct(d, c, Number(t.value)); sheet.topOpen = false; }
      else if (k === 'quality') { d.quality = Number(t.value); d.cost = null; }
      else if (k === 'level') d.level = toInt(parseNum(t.value));
      else if (k.startsWith('rb.')) {
        d.rb ||= RB.yeniTaslak();
        const f = k.slice(3), n = parseNum(t.value);
        if (f === 'seviye') d.rb.seviye = toInt(n);
        else if (f === 'doluluk') d.rb.doluluk = n == null ? null : Math.min(100, Math.max(0, n));
        else if (f === 'fiyat') d.rb.fiyat = posNum(n);
        else if (f === 'ad') d.rb.ad = t.value.trim().slice(0, 40);
        else if (f === 'menuFrom') d.rb.menuFrom = t.value;
      }
      // Belirsiz "2.345" gibi yazımlar borsa maliyetine / en kârlı fiyata yakın olan biçimde okunur
      else if (k === 'cost') d.cost = posNum(parseNum(t.value, { ref: marketOf(d.product, d.quality) ?? calc(c, { ...d, cost: null, price: null }).cAct }));
      else if (k === 'price') d.price = posNum(parseNum(t.value, { ref: calc(c, { ...d, price: null }).rMax }));
      if (pointerActive) { pendingRender = true; return; }
      return renderSheet();
    }
    if (t?.dataset?.pf || t?.dataset?.pm) {
      const nx = clone();
      if (RB.rbDegis(nx.restoranBinalari, t)) commit(nx);
      return;
    }
    if (t?.dataset?.rk || t?.dataset?.rf || t?.dataset?.rm || t?.dataset?.ro) {
      const nx = clone();
      if (RS.restoranDegis(nx.restoran, t, { marketOf })) commit(nx);
      return;
    }
    const f = t?.dataset?.f;
    if (!f) return;
    if (f === 'rankFilter') { rankFilter = t.value; return softRender(); }
    const next = clone();
    const n = parseNum(t.value);
    if (f === 'salesSpeedPct') next.salesSpeedPct = Math.max(0, n ?? 0);
    else if (f === 'academyLevel') next.academyLevel = toInt(n);
    else if (f === 'bankLevel') {
      const fresh = Y.loadCompanyRecord(r).company;
      fresh.finance.bankLevel = toInt(n);
      Y.saveCompanyRecord(r, fresh);
      company = Y.loadCompanyRecord(r).company;
      return softRender();
    }
    else return;
    commit(next);
  }
  // Seviye yazılırken kârlılık kutusu canlı güncellenir (panel yeniden çizilmeden)
  function onInput(ev) {
    const t = ev.target;
    if (sheet?.draft?.letter === 'r' && t?.dataset?.d === 'rb.seviye') {
      const save = sheetHost.querySelector('[data-act="sheetSave"]');
      sheet.draft.rb.seviye = toInt(parseNum(t.value));
      if (save) save.disabled = !(sheet.draft.rb.seviye > 0);
      return;
    }
    if (!sheet || t?.dataset?.d !== 'level') return;
    const d = sheet.draft;
    d.level = toInt(parseNum(t.value));
    const save = sheetHost.querySelector('[data-act="sheetSave"]');
    if (save) save.disabled = !(d.letter && d.product && d.level > 0);
    const box = sheetHost.querySelector('[data-result]');
    if (box && d.letter && d.product && data) box.innerHTML = resultBox(calc(context(), d), Math.max(0, d.level || 0));
  }
  function onKey(ev) {
    if (ev.key === 'Enter' && ev.target.matches?.('input[data-kilit]')) { ev.preventDefault(); kilitGiris(); return; }
    if (ev.key === 'Escape' && sheet) { ev.preventDefault(); closeSheet(); }
    if (ev.key === 'Enter' && ev.target.matches?.('.ur input[data-f], .ur input[data-rf], .ur input[data-rm], .ur input[data-rk], .ur input[data-ro], .ur input[data-pf], .ur input[data-pm], .ur-panel input[data-d]')) ev.target.blur();
  }
  function onHash() {
    const [key, sub] = location.hash.slice(1).split('/');
    if (key !== 'perakende') return;
    const next = TABS.some(([k]) => k === sub) ? sub : tab;
    if (next === tab) return;
    tab = next;
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* gizli sekme */ }
    closeSheet();
    render();
    window.scrollTo(0, 0);
  }
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);
  document.addEventListener('click', onAnyClick, true);
  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', grafikGez);
  root.addEventListener('pointermove', grafikGez);
  root.addEventListener('pointerup', grafikBirak);
  root.addEventListener('pointercancel', grafikBirak);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', onHash);
  if (location.hash.split('/')[1] !== tab) history_replace(`#perakende/${tab}`);
  load();

  return {
    setRealm(next) {
      if (next === r) return;
      closeSheet();
      r = next;
      company = Y.loadCompanyRecord(r).company;
      setup = loadSetup(r);
      load();
    },
    destroy() {
      destroyed = true;
      clearTimeout(toastTimer);
      clearTimeout(settleTimer);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
      document.removeEventListener('click', onAnyClick, true);
      root.removeEventListener('click', onClick);
      root.removeEventListener('pointerdown', grafikGez);
      root.removeEventListener('pointermove', grafikGez);
      root.removeEventListener('pointerup', grafikBirak);
      root.removeEventListener('pointercancel', grafikBirak);
      root.removeEventListener('change', onChange);
      root.removeEventListener('input', onInput);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
      document.body.style.overflow = '';
      style.remove();
      root.replaceChildren();
    },
  };
}
function history_replace(hash) { try { window.history.replaceState(null, '', hash); } catch { /* yok */ } }
