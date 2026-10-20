// DentSimco — veri katmanı (tüm modüller ortak kullanır)
// Firestore'u anahtarsız REST ile okur. Kurallar herkese okuma izni verir, yazma kapalıdır.
// Botun yazdığı biçim (bot/common.mjs başındaki "VERİ HARİTASI"):
//   live/r{realm}                  data = {t, items: {id: [t, {q: [p,a,s,v,lt]}]}}          son ölçüm (SimcoTools borsa botu)
//                                  anlik = {t, items: {id: [askT, {q: [ask, arz]}]}}        anlık borsa (Sim Companies, ayrı bot)
//   intraday/r{realm}_{gün}_s{NN}  t{SSDD} = {id: {q: [p,a,s,v]}}                          10 dk'lık noktalar (SimcoTools)
//   intraday/r{realm}_{gün}_a{NN}  a{SSDD} = {id: {q: [ask, arz]}}                         anlık borsa örnekleri
//   daily/r{realm}_{id}_{yıl}      d{AAGG} = {q: [açılış,yüksek,düşük,kapanış,ortArz,satış,tutar]}; a{AAGG} = {q: ortalama arz}
//   İki botun verisi burada birleştirilir: canlı satır [p,a,s,v,lt,ask] + askT, gün içi nokta [p,a,s,v,ask], günlük ortArz.
//   p = son işlem fiyatı (SimcoTools), a = o kalitedeki satıştaki toplam adet (arz), s = tahmini satış adedi, v = tahmini satış tutarı,
//   lt = son işlemin zamanı, ask = anlık borsa fiyatı (Sim Companies: kalitesi ≥ q olan en ucuz ilan), askT = ask ölçümünün zamanı.
//   Günlük kapanış = son işlem fiyatı. Saatler UTC.

import { urunAdi } from './urun-adlari.js';
import { LOCALE, t } from './i18n.js';

export const PROJECT_ID = 'dentsimco-e1c85';
export const START_YEAR = 2026; // botun veri toplamaya başladığı yıl
export const SHARDS = 16; // parça = ürün ID % 16
export const QUALITIES = Array.from({ length: 13 }, (_, q) => q); // Q0–Q12
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

const ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${ROOT}`;
const TIMEOUT_MS = 15_000;

// ---- Tarih (bot UTC günlerini kullanır; TR saatiyle gün 03:00'te başlar) ----

const pad2 = (n) => String(n).padStart(2, '0');
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayStart = (day) => Date.parse(`${day}T00:00:00Z`);
export const addDays = (day, n) => utcDay(dayStart(day) + n * DAY);

// Canlı kalite satırındaki sıra numaraları (live/r{realm} → items[id][1][q])
export const LIVE = { TRADE: 0, SUPPLY: 1, SOLD: 2, VALUE: 3, TRADE_T: 4, ASK: 5 };
export const ASK_FRESH_MS = 6 * HOUR; // anlık borsa fiyatı bundan eskiyse kullanılmaz (sunucu yavaşlatırsa tur saatler sürebilir)
export const ASK_LIVE_MS = 20 * MIN; // bundan eskiyse ekranda yaşı yazılır

/**
 * Hesaplar için fiyat: anlık borsa fiyatı (kalitesi ≥ q olan en ucuz ilan); taze değilse ya da ilan yoksa son işlem fiyatı.
 * Dönüş: { p, kaynak: 'borsa' | 'son', t } ya da fiyat yoksa null. t = fiyatın ölçüldüğü / son işlemin zamanı (ms).
 */
export function anlikFiyat(live, id, q, now = Date.now()) {
  const item = live?.items?.[id];
  const row = item?.[1]?.[q];
  const ask = Number(row?.[LIVE.ASK]);
  const askT = Number(item?.[2]);
  if (ask > 0 && askT > 0 && now - askT <= ASK_FRESH_MS) return { p: ask, kaynak: 'borsa', t: askT };
  const last = Number(row?.[LIVE.TRADE]);
  if (!(last > 0)) return null;
  const lt = Number(row?.[LIVE.TRADE_T]);
  return { p: last, kaynak: 'son', t: lt > 0 ? lt : (Number(item?.[0]) || null) };
}

export const PATHS = {
  live: (r) => `live/r${r}`,
  intraday: (r, day, id) => `intraday/r${r}_${day}_s${pad2(Number(id) % SHARDS)}`,
  intradayAnlik: (r, day, id) => `intraday/r${r}_${day}_a${pad2(Number(id) % SHARDS)}`,
  daily: (r, id, year) => `daily/r${r}_${id}_${year}`,
  meta: (name) => `meta/${name}`,
  system: (name) => `system/${name}`,
};

// ---- Firestore okuma ----

export class VeriHatasi extends Error {
  constructor(message) {
    super(message);
    this.name = 'VeriHatasi';
  }
}

function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = decodeValue(value);
  return out;
}

async function batchGet(paths) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}:batchGet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: paths.map((p) => `${ROOT}/${p}`) }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Teknik ayrıntı yalnız konsola yazılır; ekranda oyuncunun anlayacağı kısa mesaj çıkar.
      const body = await res.json().catch(() => null);
      console.warn('DentSimco: veri sunucusu hata verdi', res.status, body?.error?.message || '');
      if (res.status === 401 || res.status === 403) {
        throw new VeriHatasi(`Veri sunucusu şu an okuma izni vermiyor (hata ${res.status}). Biraz sonra tekrar dene.`);
      }
      if (res.status === 429) {
        throw new VeriHatasi('Veri sunucusu şu an çok yoğun (hata 429). Biraz sonra tekrar dene.');
      }
      throw new VeriHatasi(`Veri sunucusu şu an yanıt vermiyor (hata ${res.status}). Biraz sonra tekrar dene.`);
    }
    const items = await res.json();
    const out = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (item.found) out.set(item.found.name.slice(ROOT.length + 1), decodeFields(item.found.fields));
      else if (item.missing) out.set(item.missing.slice(ROOT.length + 1), null);
    }
    return out;
  } catch (e) {
    if (e instanceof VeriHatasi) throw e;
    if (e?.name === 'AbortError') throw new VeriHatasi('Veri sunucusu 15 saniyede yanıt vermedi. Biraz sonra tekrar dene.');
    throw new VeriHatasi(navigator.onLine === false
      ? 'İnternet bağlantısı yok. Bağlantını kontrol edip tekrar dene.'
      : 'Veri sunucusuna ulaşılamadı. Bağlantını kontrol edip tekrar dene.');
  } finally {
    clearTimeout(timer);
  }
}

// Önbellek: geçmiş günler değişmez, bugün ve canlı veri birkaç dakikada tazelenir.
const cache = new Map(); // yol -> { at, fields }
const pending = new Map(); // yol -> Promise

function isFresh(path, at, now) {
  const m = /^intraday\/r\d+_(\d{4}-\d{2}-\d{2})_/.exec(path);
  if (m) {
    const settled = dayStart(m[1]) + DAY + 5 * MIN; // gün bitti, son yazma da geçti
    return at >= settled || now - at < 4 * MIN;
  }
  if (path.startsWith('daily/')) return now - at < 20 * MIN;
  if (path.startsWith('live/')) return now - at < 2 * MIN;
  if (path.startsWith('system/')) return now - at < 5 * MIN; // ekonomi evresi cuma günü değişir: açık sekme eski evrede kalmasın
  return now - at < 6 * HOUR; // ürün listesi ve diğer sabitler
}

// Belgeleri tek istekte okur (100'lük gruplar). refresh(yol) true dönerse önbelleği atlar.
export async function readDocs(paths, { refresh } = {}) {
  const now = Date.now();
  const out = new Map();
  const waits = [];
  const need = [];
  for (const path of new Set(paths)) {
    const hit = cache.get(path);
    if (hit && !refresh?.(path) && isFresh(path, hit.at, now)) {
      out.set(path, hit.fields);
    } else if (pending.has(path)) {
      waits.push(pending.get(path).then((fields) => out.set(path, fields)));
    } else {
      need.push(path);
    }
  }
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    const job = batchGet(chunk).then((got) => {
      const at = Date.now();
      for (const p of chunk) cache.set(p, { at, fields: got.get(p) ?? null });
      return got;
    });
    for (const p of chunk) {
      const one = job.then((got) => got.get(p) ?? null);
      pending.set(p, one);
      one.catch(() => {}).finally(() => { if (pending.get(p) === one) pending.delete(p); });
    }
    waits.push(job.then((got) => { for (const p of chunk) out.set(p, got.get(p) ?? null); }));
  }
  await Promise.all(waits);
  return out;
}

// ---- Belge çözümleme (her belge bir kez çözülür) ----

const parsed = new WeakMap();

function parseJSON(text) {
  if (typeof text !== 'string' || !text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function memo(fields, build) {
  if (!fields) return build(null);
  if (!parsed.has(fields)) parsed.set(fields, build(fields));
  return parsed.get(fields);
}

// Belgenin 'data' alanı. Canlı borsa belgesinde anlık borsa botunun 'anlik' alanı da varsa birleştirilir.
export const dataField = (fields) => memo(fields, (f) => {
  const d = parseJSON(f?.data);
  return f?.anlik ? mergeAnlik(d, parseJSON(f.anlik)) : d;
});

/**
 * SimcoTools canlı kaydına (items: {id: [t, {q: [p,a,s,v,lt]}]}) anlık borsa kaydını (items: {id: [askT, {q: [ask, arz]}]}) işler.
 * Sonuç satırı [p, arz, s, v, lt, ask], ürün kaydı [t, satırlar, askT]. Anlık kaydı olan üründe ilanı olmayan kalite: arz 0, ask yok.
 */
export function mergeAnlik(live, anlik) {
  if (!anlik?.items) return live;
  const out = { ...(live || { t: anlik.t }), items: { ...(live?.items || {}) } };
  for (const [id, entry] of Object.entries(anlik.items)) {
    if (!Array.isArray(entry)) continue;
    const [askT, qs] = entry;
    const item = out.items[id];
    const rows = {};
    const keys = new Set([...Object.keys(item?.[1] || {}), ...Object.keys(qs || {})]);
    for (const q of keys) {
      const row = item?.[1]?.[q] ? [...item[1][q]] : [null, null, 0, 0, null];
      while (row.length < 5) row.push(null);
      const a = qs?.[q];
      row[1] = a ? (a[1] ?? null) : 0;
      row[5] = a ? (a[0] ?? null) : null;
      rows[q] = row;
    }
    out.items[id] = [item?.[0] ?? askT, rows, askT];
  }
  return out;
}

// Anlık borsa gün içi belgesi → [{t, items}] zamana göre sıralı (a{SSDD} alanları)
export function anlikPoints(fields, day) {
  return memo(fields, (f) => {
    const list = [];
    if (!f) return list;
    const base = dayStart(day);
    for (const [key, text] of Object.entries(f)) {
      const m = /^a(\d\d)(\d\d)$/.exec(key);
      if (!m) continue;
      const items = parseJSON(text);
      if (items) list.push({ t: base + (Number(m[1]) * 60 + Number(m[2])) * MIN, items });
    }
    return list.sort((a, b) => a.t - b.t);
  });
}

// Gün içi noktalara anlık borsa örneklerini işler: her noktaya, o andan önceki en yeni örneğin ask ve arzı (en çok 6 saat eski).
// Nokta [p,a,s,v] → [p, arz, s, v, ask]. Örneği olup noktada olmayan kalite eklenir (fiyatsız satır).
const ANLIK_MAX_YAS = 6 * HOUR;
export function withAnlikSamples(points, samples) {
  if (!samples?.length) return points;
  return points.map((pt) => {
    let s = null;
    for (const x of samples) { if (x.t <= pt.t) s = x; else break; }
    if (!s || pt.t - s.t > ANLIK_MAX_YAS) return pt;
    const qs = {};
    const keys = new Set([...Object.keys(pt.qs || {}), ...Object.keys(s.qs || {})]);
    for (const q of keys) {
      const m = pt.qs?.[q] ? [...pt.qs[q]] : [null, null, 0, 0];
      while (m.length < 4) m.push(null);
      const a = s.qs?.[q];
      m[1] = a ? (a[1] ?? null) : 0;
      m[4] = a ? (a[0] ?? null) : null;
      qs[q] = m;
    }
    return { t: pt.t, qs };
  });
}

// Gün içi belge → [{t, items}] zamana göre sıralı
export function intradayPoints(fields, day) {
  return memo(fields, (f) => {
    const list = [];
    if (!f) return list;
    const base = dayStart(day);
    for (const [key, text] of Object.entries(f)) {
      const m = /^t(\d\d)(\d\d)$/.exec(key);
      if (!m) continue;
      const items = parseJSON(text);
      if (items) list.push({ t: base + (Number(m[1]) * 60 + Number(m[2])) * MIN, items });
    }
    return list.sort((a, b) => a.t - b.t);
  });
}

// Günlük belge → Map(gün → {q: [açılış,yüksek,düşük,kapanış,ortArz,satış,tutar]})
export function dailyRows(fields, year) {
  return memo(fields, (f) => {
    const rows = new Map();
    for (const [key, text] of Object.entries(f || {})) {
      const m = /^d(\d\d)(\d\d)$/.exec(key);
      const qs = m && parseJSON(text);
      if (qs) rows.set(`${year}-${m[1]}-${m[2]}`, qs);
    }
    // Anlık borsa botunun günlük ortalama arzı (a{AAGG}): satırın ortArz yerine (5. eleman) işlenir
    for (const [key, text] of Object.entries(f || {})) {
      const m = /^a(\d\d)(\d\d)$/.exec(key);
      const avg = m && parseJSON(text);
      const day = m && `${year}-${m[1]}-${m[2]}`;
      if (!avg || !rows.has(day)) continue;
      const qs = { ...rows.get(day) };
      for (const [q, a] of Object.entries(avg)) if (Array.isArray(qs[q]) && Number.isFinite(Number(a))) { qs[q] = [...qs[q]]; qs[q][4] = Number(a); }
      rows.set(day, qs);
    }
    return rows;
  });
}

// ---- Yükleyiciler ----

// Realm'in ürün adları, borsadaki ürün listesi ve son ölçüm
// Ürün adlarını oyundaki Türkçe adlara çevirir (urun-adlari.js). Aynı nesne bir kez işlenir.
const duzeltilenUrunler = new WeakSet();
export function urunAdlariniDuzelt(products) {
  if (!products || typeof products !== 'object' || duzeltilenUrunler.has(products)) return products;
  for (const [id, p] of Object.entries(products)) if (p && typeof p === 'object') p.name = urunAdi(p.id ?? id, p.name);
  duzeltilenUrunler.add(products);
  return products;
}

export async function loadBasics(r, options) {
  const P = { products: PATHS.meta(`products_r${r}`), tradable: PATHS.meta('tradable'), live: PATHS.live(r) };
  const docs = await readDocs(Object.values(P), options);
  const products = urunAdlariniDuzelt(dataField(docs.get(P.products)) || {});
  const tradable = dataField(docs.get(P.tradable)) || {};
  const live = dataField(docs.get(P.live));
  let ids = (tradable[r] || []).map(Number).filter(Number.isFinite);
  if (!ids.length) ids = Object.keys(live?.items || {}).map(Number).sort((a, b) => a - b);
  return { products, ids, live };
}

// Bir ürünün gün içi noktaları (günlere göre) ve günlük özetleri
export async function loadProduct(r, id, { days = [], years = [] } = {}, options) {
  const intraPaths = days.map((d) => PATHS.intraday(r, d, id));
  const anlikPaths = days.map((d) => PATHS.intradayAnlik(r, d, id));
  const dailyPaths = years.map((y) => PATHS.daily(r, id, y));
  const docs = await readDocs([...intraPaths, ...anlikPaths, ...dailyPaths], options);
  const byDay = new Map();
  days.forEach((day, i) => {
    const points = [];
    for (const { t, items } of intradayPoints(docs.get(intraPaths[i]), day)) {
      const qs = items[id];
      if (qs) points.push({ t, qs });
    }
    const samples = [];
    for (const { t, items } of anlikPoints(docs.get(anlikPaths[i]), day)) if (items[id]) samples.push({ t, qs: items[id] });
    byDay.set(day, withAnlikSamples(points, samples));
  });
  const daily = new Map();
  years.forEach((year, i) => {
    for (const [day, qs] of dailyRows(docs.get(dailyPaths[i]), year)) daily.set(day, qs);
  });
  return { byDay, daily };
}

// Botun son çalışma kaydı (meta/status). Çok küçük bir belgedir; "yeni veri geldi mi" diye bakmak için
// büyük canlı belgeyi okumak yerine bu kullanılır. Önbelleği her seferinde atlar.
// Dönüş: { t: çalışmanın başlangıç zamanı (ms) } ya da belge yoksa null. Okunamazsa VeriHatasi fırlatır.
export async function loadBotRun() {
  const path = PATHS.meta('status');
  const docs = await readDocs([path], { refresh: () => true });
  const st = dataField(docs.get(path));
  return st && Number.isFinite(st.t) ? { t: st.t } : null;
}

// Oyundaki güncel ekonomi evresi. Bot (fetchPhase) Simcotools'tan çekip system/phase belgesine yazar:
//   { r0: { phase: 'recession' | 'normal' | 'boom', start, end, fetchedAt }, r1: { ... } }
// Dönüş: { index: 0 | 1 | 2, start, end, expired } (0 Durgunluk, 1 Normal, 2 Büyüme) ya da belge/realm yoksa null.
// Hata fırlatmaz: evre okunamazsa çağıran Durgunluk'la devam eder.
const GAME_PHASES = ['recession', 'normal', 'boom'];
export async function loadGamePhase(r, options) {
  try {
    const path = PATHS.system('phase');
    const docs = await readDocs([path], options);
    const e = docs.get(path)?.[`r${r}`];
    const index = GAME_PHASES.indexOf(e?.phase);
    if (index < 0) return null;
    const start = Date.parse(e.start);
    const end = Date.parse(e.end);
    return {
      index,
      start: Number.isFinite(start) ? start : null,
      end: Number.isFinite(end) ? end : null,
      expired: Number.isFinite(end) && end <= Date.now(), // yeni evre henüz yayınlanmamış olabilir
    };
  } catch {
    return null;
  }
}

// ---- Özetler ----

// Botun gece çıkardığı günlük özetin aynısı (bot/market.mjs → summarize)
export function summarize(points) {
  let open = null, high = null, low = null, close = null;
  let supplySum = 0, supplyN = 0, sold = 0, value = 0, soldN = 0;
  for (const [p, a, s, v] of points) {
    if (p != null) {
      if (open == null) open = p;
      close = p;
      high = high == null ? p : Math.max(high, p);
      low = low == null ? p : Math.min(low, p);
    }
    if (a != null) { supplySum += a; supplyN++; }
    if (s != null) { sold += s; value += v || 0; soldN++; }
  }
  return [open, high, low, close, supplyN ? Math.round(supplySum / supplyN) : 0, soldN ? sold : null, soldN ? Math.round(value * 100) / 100 : null];
}

// Bir günün noktaları [{t, qs}] → {q: [açılış,yüksek,düşük,kapanış,ortArz,satış,tutar]}
export function summarizeDay(points) {
  const perQ = {};
  for (const { qs } of points) for (const [q, m] of Object.entries(qs)) (perQ[q] ||= []).push(m);
  const out = {};
  for (const [q, list] of Object.entries(perQ)) out[q] = summarize(list);
  return out;
}

// ---- Biçimlendirme (seçili dilin sayı ve tarih biçimi: Türkçede 1.234,56 ve %5; İngilizcede 1,234.56 ve 5%) ----

const numberFormats = new Map();
function nf(key, options) {
  let f = numberFormats.get(key);
  if (!f) numberFormats.set(key, (f = new Intl.NumberFormat(LOCALE, options)));
  return f;
}
const fixed = (d) => nf(`f${d}`, { minimumFractionDigits: d, maximumFractionDigits: d });

export const priceDigits = (p) => (Math.abs(p) < 10 ? 3 : Math.abs(p) < 1000 ? 2 : 0);
export function fmtPrice(p, digits) {
  if (p == null || !Number.isFinite(p)) return '—';
  return `$${fixed(digits ?? priceDigits(p)).format(p)}`;
}
export const fmtNum = (n) => (n == null || !Number.isFinite(n) ? '—' : fixed(0).format(Math.round(n)));
export const fmtCompact = (n) => (n == null || !Number.isFinite(n) ? '—'
  : nf('c', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
export const fmtPct = (x) => (x == null || !Number.isFinite(x) ? '—'
  : nf('p', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(x));
export const fmtShare = (x) => (x == null || !Number.isFinite(x) ? '—'
  : nf('s', { style: 'percent', maximumFractionDigits: x < 0.1 ? 1 : 0 }).format(x));

const dateFormats = new Map();
function df(key, options) {
  let f = dateFormats.get(key);
  if (!f) dateFormats.set(key, (f = new Intl.DateTimeFormat(LOCALE, options)));
  return f;
}
export const fmtTime = (ms) => df('t', { hour: '2-digit', minute: '2-digit' }).format(ms);
export const fmtDate = (ms) => df('d', { day: 'numeric', month: 'short' }).format(ms);
export const fmtDateTime = (ms) => df('dt', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
export const fmtMonth = (ms) => df('m', { month: 'short' }).format(ms);
export const fmtMonthYear = (ms) => df('my', { month: 'short', year: 'numeric' }).format(ms);

export function fmtAgo(ms, now = Date.now()) {
  const m = Math.round((now - ms) / MIN);
  // Türkçe yazılır, seçili dile sözlükle çevrilir (t Türkçede metni olduğu gibi döndürür)
  if (m < 1) return t('az önce');
  if (m < 60) return t(`${m} dk önce`);
  const h = Math.floor(m / 60);
  if (h < 24) return t(`${h} sa önce`);
  return t(`${Math.floor(h / 24)} gün önce`);
}
