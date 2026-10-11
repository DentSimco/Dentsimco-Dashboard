// DentSimco — restoran talep analizi (yalnız yerel; site bu klasörü yayınlamaz, site.yml yalnız public/ yükler).
// Çalıştırma: node analiz/restoran/analiz.mjs [--md rapor.md] [--veri başka/klasör]
//
// Soru: Restoranlara gelen müşteri sayısı neye bağlı?
//   H1 sabit havuz       → toplam tüketim bina sayısından bağımsız (log-log eğim ≈ 0)
//   H2 kapasiteye bağlı  → toplam tüketim bina sayısıyla orantılı (eğim ≈ 1)
//   H3 ekonomiye bağlı   → toplam tüketim ekonomi evresine göre basamak yapar
//
// Veri (veri/ klasörü, ayraç ";", "#" ile başlayan satırlar yorum):
//   tuketim.csv     tarih;urun;miktar              ansiklopedi "Restoran satışları" grafiği, günlük tüketilen miktar
//   binalar.csv     tarih;bina;ekonomi;not          toplam restoran sayısı, evre (Resesyon/Normal/Boom), serbest not
//   kendi.csv       tarih;urun;satis;fiyat;doluluk;puan   kendi restoranınız (isteğe bağlı)
//   kategoriler.json {"Kategori": ["Ürün", ...]}    menü kategorileri; kategori toplamı = o günkü tüm ürünlerin toplamı
//
// Sayılar: "5.694.364" ve "5694364" aynıdır; ondalık için virgül ("4,5") ya da tek nokta ("4.5").

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- okuma ----

// Tam sayı: binlik ayraçları (nokta, boşluk) atılır
export function parseCount(text) {
  const s = String(text ?? '').trim().replace(/[.\s]/g, '');
  if (!/^-?\d+$/.test(s)) return NaN;
  return Number(s);
}

// Ondalık: virgül varsa ondalık ayraç odur; yoksa tek nokta ondalık, birden çok nokta binlik sayılır
export function parseDecimal(text) {
  let s = String(text ?? '').trim().replace(/\s/g, '').replace('%', '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

// Tarih: 2026-10-10, 10.10.2026 ya da 10/10/2026 → 2026-10-10
export function parseDate(text) {
  const s = String(text ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) [, d, mo, y] = m;
  else return null;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
}

// ";" ayraçlı metin → başlık adlarıyla nesneler. Hatalı satırlar atlanmaz, hata listesine yazılır.
export function parseTable(text, name = 'tablo') {
  const rows = [];
  const errors = [];
  let header = null;
  String(text ?? '').split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) return;
    const cells = raw.split(';').map((c) => c.trim());
    if (!header) { header = cells.map((c) => c.toLowerCase()); return; }
    if (cells.length > header.length) { errors.push(`${name} satır ${i + 1}: fazla sütun`); return; }
    rows.push({ line: i + 1, ...Object.fromEntries(header.map((h, j) => [h, cells[j] ?? ''])) });
  });
  return { rows, errors };
}

const normName = (s) => String(s ?? '').trim().toLocaleLowerCase('tr');

export function readConsumption(text) {
  const { rows, errors } = parseTable(text, 'tuketim.csv');
  const seen = new Map();
  const out = [];
  for (const r of rows) {
    const date = parseDate(r.tarih);
    const amount = parseCount(r.miktar);
    const product = String(r.urun ?? '').trim();
    if (!date || !product || !Number.isFinite(amount) || amount < 0) {
      errors.push(`tuketim.csv satır ${r.line}: tarih, ürün ya da miktar okunamadı`);
      continue;
    }
    const key = `${date}|${normName(product)}`;
    if (seen.has(key)) {
      if (seen.get(key) !== amount) errors.push(`tuketim.csv satır ${r.line}: ${product} ${date} iki farklı değerle girilmiş; ilki kullanıldı`);
      continue;
    }
    seen.set(key, amount);
    out.push({ date, product, amount });
  }
  return { rows: out, errors };
}

const PHASES = { resesyon: 'Resesyon', recession: 'Resesyon', durgunluk: 'Resesyon', normal: 'Normal', boom: 'Boom' };

export function readBuildings(text) {
  const { rows, errors } = parseTable(text, 'binalar.csv');
  const out = [];
  for (const r of rows) {
    const date = parseDate(r.tarih);
    const count = r.bina ? parseCount(r.bina) : null;
    const phaseRaw = normName(r.ekonomi);
    const phase = phaseRaw ? PHASES[phaseRaw] ?? null : null;
    if (!date || (count != null && !(count > 0))) { errors.push(`binalar.csv satır ${r.line}: tarih ya da bina sayısı okunamadı`); continue; }
    if (phaseRaw && !phase) errors.push(`binalar.csv satır ${r.line}: ekonomi "${r.ekonomi}" tanınmadı (Resesyon/Normal/Boom)`);
    out.push({ date, count, phase, note: r.not || '' });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { rows: out, errors };
}

export function readOwn(text) {
  const { rows, errors } = parseTable(text, 'kendi.csv');
  const out = [];
  for (const r of rows) {
    const date = parseDate(r.tarih);
    const sold = parseCount(r.satis);
    if (!date || !r.urun || !Number.isFinite(sold)) { errors.push(`kendi.csv satır ${r.line}: tarih, ürün ya da satış okunamadı`); continue; }
    const opt = (v) => (v ? parseDecimal(v) : null);
    out.push({ date, product: r.urun.trim(), sold, price: opt(r.fiyat), occupancy: opt(r.doluluk), rating: opt(r.puan) });
  }
  return { rows: out, errors };
}

// ---- hesap ----

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);
function stdev(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}
export function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

// Ürün → kategori eşlemesi (büyük/küçük harf ve Türkçe karakter duyarsız)
export function categoryIndex(categories) {
  const idx = new Map();
  for (const [cat, list] of Object.entries(categories || {})) for (const p of list || []) idx.set(normName(p), cat);
  return idx;
}

// Gün × kategori toplamları. Kategorideki her ürün o gün girilmişse "tam" sayılır; eksikse toplam alt sınırdır.
export function categoryTotals(consumption, categories) {
  const idx = categoryIndex(categories);
  const byDay = new Map();
  const uncategorized = new Set();
  for (const r of consumption) {
    const cat = idx.get(normName(r.product));
    if (!cat) { uncategorized.add(r.product); continue; }
    if (!byDay.has(r.date)) byDay.set(r.date, new Map());
    const day = byDay.get(r.date);
    if (!day.has(cat)) day.set(cat, { total: 0, products: new Set() });
    const c = day.get(cat);
    c.total += r.amount;
    c.products.add(normName(r.product));
  }
  const days = [...byDay.keys()].sort();
  const table = days.map((date) => {
    const cats = {};
    for (const [cat, list] of Object.entries(categories || {})) {
      const c = byDay.get(date).get(cat);
      if (!c) continue;
      cats[cat] = { total: c.total, complete: list.every((p) => c.products.has(normName(p))), have: c.products.size, of: list.length };
    }
    return { date, cats };
  });
  return { table, uncategorized: [...uncategorized].sort() };
}

// Kategori eşitliği sınaması: aynı gün tam olan kategorilerin toplamları birbirine ne kadar yakın?
// Her gün için oran = kategori toplamı / o günkü tam kategorilerin ortalaması. Oranlar günden güne sabitse
// kategoriler sabit bir çarpanla bağlıdır; hepsi ≈1 ise her ziyarette her kategoriden bir ürün tüketiliyor olabilir.
export function categoryTest(table) {
  const perCat = {};
  const daily = [];
  for (const { date, cats } of table) {
    const full = Object.entries(cats).filter(([, c]) => c.complete);
    if (full.length < 2) continue;
    const m = mean(full.map(([, c]) => c.total));
    const cv = stdev(full.map(([, c]) => c.total)) / m;
    daily.push({ date, n: full.length, mean: m, cv });
    for (const [cat, c] of full) (perCat[cat] ||= []).push(c.total / m);
  }
  const ratios = Object.fromEntries(Object.entries(perCat).map(([cat, rs]) => [cat, { n: rs.length, mean: mean(rs), sd: stdev(rs) }]));
  const cvMedian = median(daily.map((d) => d.cv));
  let verdict = 'yetersiz';
  if (daily.length >= 3) {
    const stable = Object.values(ratios).every((r) => r.n < 3 || r.sd < 0.05);
    if (cvMedian < 0.03) verdict = 'esit';
    else if (stable) verdict = 'sabit-carpan';
    else verdict = 'bagimsiz';
  }
  return { days: daily, ratios, cvMedian, verdict };
}

// Günlük ziyaret tahmini: tam kategori toplamlarının ortancası (yalnız "esit" sonucunda anlamlı)
export function visitEstimate(table) {
  return table
    .map(({ date, cats }) => {
      const full = Object.values(cats).filter((c) => c.complete).map((c) => c.total);
      return full.length ? { date, visits: median(full), n: full.length } : null;
    })
    .filter(Boolean);
}

// Bir tarihteki bina kaydı: aynı gün, yoksa en yakın önceki gün (en fazla maxGap gün geriye)
export function buildingsOn(buildings, date, field = 'count', maxGap = 3) {
  let best = null;
  for (const b of buildings) {
    if (b.date > date) break;
    if (b[field] == null) continue;
    best = b;
  }
  if (!best) return null;
  const gap = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${best.date}T00:00:00Z`)) / 86_400_000;
  return gap <= maxGap ? best[field] : null;
}

// En küçük kareler: y = Xb. X her satırda [1, x1, x2, ...]. Katsayı, standart hata ve R² döner.
export function ols(X, y) {
  const n = y.length;
  const k = X[0]?.length ?? 0;
  if (n <= k) return null;
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => sum(X.map((r) => r[i] * r[j]))));
  const v = Array.from({ length: k }, (_, i) => sum(X.map((r, t) => r[i] * y[t])));
  const inv = invert(A);
  if (!inv) return null;
  const b = inv.map((row) => sum(row.map((a, j) => a * v[j])));
  const fit = X.map((r) => sum(r.map((x, j) => x * b[j])));
  const sse = sum(y.map((yy, t) => (yy - fit[t]) ** 2));
  const my = mean(y);
  const sst = sum(y.map((yy) => (yy - my) ** 2));
  const s2 = sse / (n - k);
  return { b, se: inv.map((row, i) => Math.sqrt(Math.max(0, s2 * row[i]))), r2: sst > 0 ? 1 - sse / sst : NaN, n };
}

function invert(M) {
  const k = M.length;
  const A = M.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    for (let j = 0; j < 2 * k; j++) A[c][j] /= d;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c];
      for (let j = 0; j < 2 * k; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((row) => row.slice(k));
}

// Bina sayısı esnekliği: ln(tüketim) = a + e·ln(bina). e ≈ 0 → H1, e ≈ 1 → H2. Aralık ±2 SE (küçük örnekte kaba).
export function elasticity(series) {
  const pts = series.filter((p) => p.y > 0 && p.buildings > 0);
  if (pts.length < 5 || new Set(pts.map((p) => p.buildings)).size < 3) return { n: pts.length, verdict: 'yetersiz' };
  const fit = ols(pts.map((p) => [1, Math.log(p.buildings)]), pts.map((p) => Math.log(p.y)));
  if (!fit) return { n: pts.length, verdict: 'yetersiz' };
  const e = fit.b[1];
  const lo = e - 2 * fit.se[1];
  const hi = e + 2 * fit.se[1];
  let verdict = 'belirsiz';
  if (lo <= 0 && 0 <= hi && hi < 0.5) verdict = 'H1';
  else if (lo <= 1 && 1 <= hi && lo > 0.5) verdict = 'H2';
  else if (hi < 0) verdict = 'ters';
  else if (lo > 0 && hi < 1) verdict = 'kismi';
  return { n: pts.length, e, lo, hi, r2: fit.r2, verdict };
}

// Evre etkisi: evre başına ortalama tüketim ve Normal'e göre yüzde fark
export function phaseEffect(series) {
  const groups = {};
  for (const p of series) if (p.phase) (groups[p.phase] ||= []).push(p.y);
  const base = groups.Normal ? mean(groups.Normal) : null;
  return Object.fromEntries(Object.entries(groups).map(([ph, ys]) => [ph, { n: ys.length, mean: mean(ys), vsNormal: base && ph !== 'Normal' ? mean(ys) / base - 1 : null }]));
}

// Günden güne en büyük değişimler; evre değişimine denk gelenler işaretlenir
export function jumps(series, top = 5) {
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    const days = (Date.parse(`${b.date}T00:00:00Z`) - Date.parse(`${a.date}T00:00:00Z`)) / 86_400_000;
    if (days !== 1 || !(a.y > 0)) continue;
    out.push({ date: b.date, change: b.y / a.y - 1, phaseChange: Boolean(a.phase && b.phase && a.phase !== b.phase) });
  }
  return out.sort((x, y) => Math.abs(y.change) - Math.abs(x.change)).slice(0, top);
}

// Bir seri (ürün ya da tahmini ziyaret) için bina, bina başına tüketim ve evre eklenir
export function enrich(points, buildings) {
  return points.map(({ date, y }) => {
    const count = buildingsOn(buildings, date);
    return { date, y, buildings: count, perBuilding: count ? y / count : null, phase: buildingsOn(buildings, date, 'phase', 31) };
  });
}

// Kendi pazar payınız: kendi satışınız / aynı gün o ürünün toplam tüketimi
export function marketShare(own, consumption) {
  const total = new Map(consumption.map((r) => [`${r.date}|${normName(r.product)}`, r.amount]));
  return own
    .map((o) => {
      const t = total.get(`${o.date}|${normName(o.product)}`);
      return t ? { ...o, total: t, share: o.sold / t } : null;
    })
    .filter(Boolean);
}

export function analyze({ consumption, buildings, own = [], categories = {} }) {
  const products = [...new Set(consumption.map((r) => r.product))].sort((a, b) => a.localeCompare(b, 'tr'));
  const productSeries = Object.fromEntries(products.map((p) => [p, enrich(
    consumption.filter((r) => r.product === p).sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: r.date, y: r.amount })),
    buildings,
  )]));
  const { table, uncategorized } = categoryTotals(consumption, categories);
  const catTest = categoryTest(table);
  const visits = enrich(visitEstimate(table).map((v) => ({ date: v.date, y: v.visits })), buildings);
  const main = visits.length >= 5 ? visits : null;
  return {
    products,
    productSeries,
    productElasticity: Object.fromEntries(products.map((p) => [p, elasticity(productSeries[p])])),
    table,
    uncategorized,
    catTest,
    visits,
    visitElasticity: main ? elasticity(main) : null,
    visitPhase: main ? phaseEffect(main) : null,
    visitJumps: main ? jumps(main) : [],
    share: marketShare(own, consumption),
  };
}

// ---- rapor ----

const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const pct = (x, d = 1) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${fmt(x * 100, d)}%` : '—');

const VERDICT = {
  H1: 'H1 ile uyumlu: tüketim bina sayısından büyük ölçüde bağımsız (sabit havuz).',
  H2: 'H2 ile uyumlu: tüketim bina sayısıyla orantılı artıyor.',
  kismi: 'Kısmi: bina arttıkça tüketim artıyor ama orantıdan az (havuz kısmen büyüyor).',
  ters: 'Ters yönlü: bina arttıkça tüketim düşmüş. Ürün değişimi ya da ekonomi etkisi olabilir.',
  belirsiz: 'Belirsiz: aralık çok geniş, daha fazla gün ve daha farklı bina sayıları gerekli.',
  yetersiz: 'Yetersiz veri: en az 5 gün ve 3 farklı bina sayısı gerekli.',
};
const CAT_VERDICT = {
  esit: 'Kategori toplamları neredeyse eşit. Her ziyarette her kategoriden bir ürün tüketiliyor olabilir; kategori toplamı = ziyaret sayısı.',
  'sabit-carpan': 'Kategori toplamları eşit değil ama oranları sabit. Ziyaret sayısı bir çarpanla bulunabilir.',
  bagimsiz: 'Kategori toplamları birbirinden bağımsız oynuyor. Kategori toplamı ziyaret sayısı olarak kullanılamaz.',
  yetersiz: 'Yetersiz veri: en az 3 gün, aynı gün en az 2 tam kategori gerekli.',
};

export function report(a, { errors = [] } = {}) {
  const L = [];
  const p = (s = '') => L.push(s);
  p('# Restoran talep analizi');
  p();
  if (errors.length) {
    p('## Veri uyarıları');
    for (const e of errors) p(`- ${e}`);
    p();
  }

  p('## Ürünler');
  p();
  p('| Ürün | Gün | İlk → son | Son tüketim | Son bina | Bina başına | Esneklik (bina) |');
  p('|---|---:|---|---:|---:|---:|---|');
  for (const name of a.products) {
    const s = a.productSeries[name];
    const last = s[s.length - 1];
    const el = a.productElasticity[name];
    p(`| ${name} | ${s.length} | ${s[0].date} → ${last.date} | ${fmt(last.y)} | ${fmt(last.buildings)} | ${fmt(last.perBuilding, 1)} | ${el.verdict === 'yetersiz' ? 'yetersiz' : `${fmt(el.e, 2)} [${fmt(el.lo, 2)}, ${fmt(el.hi, 2)}]`} |`);
  }
  p();
  p('Esneklik: bina sayısı %1 artınca tüketimin yüzde kaç değiştiği. 0 civarı = sabit havuz (H1), 1 civarı = orantılı (H2).');
  p('Tek ürün, oyuncuların menü seçimlerinden de etkilenir; asıl sınama kategori toplamıyla yapılır.');
  p();

  p('## Kategori sınaması');
  p();
  if (a.uncategorized.length) p(`Kategorisi tanımsız ürünler (kategoriler.json'a ekleyin): ${a.uncategorized.join(', ')}`), p();
  p(`**Sonuç:** ${CAT_VERDICT[a.catTest.verdict]}`);
  if (a.catTest.days.length) {
    p();
    p(`Sınanan gün: ${a.catTest.days.length}, günlük farkın ortancası (değişim katsayısı): ${pct(a.catTest.cvMedian).replace('+', '')}`);
    p();
    p('| Kategori | Gün | Ortalamaya oran | Oran sapması |');
    p('|---|---:|---:|---:|');
    for (const [cat, r] of Object.entries(a.catTest.ratios)) p(`| ${cat} | ${r.n} | ${fmt(r.mean, 3)} | ${fmt(r.sd, 3)} |`);
  }
  p();

  p('## Tahmini ziyaret');
  p();
  if (!a.visits.length) p('Tam kategori günü yok.');
  else {
    if (a.catTest.verdict !== 'esit') p('Not: kategori sınaması "eşit" çıkmadığı için bu sayı ziyaret değil, tam kategori toplamlarının ortancasıdır.'), p();
    p('| Tarih | Tahmini ziyaret | Bina | Bina başına | Evre |');
    p('|---|---:|---:|---:|---|');
    for (const v of a.visits) p(`| ${v.date} | ${fmt(v.y)} | ${fmt(v.buildings)} | ${fmt(v.perBuilding, 1)} | ${v.phase ?? '—'} |`);
    p();
    if (a.visitElasticity) {
      const el = a.visitElasticity;
      p(`**Bina sayısı esnekliği:** ${el.verdict === 'yetersiz' ? '—' : `${fmt(el.e, 2)} (aralık ${fmt(el.lo, 2)} – ${fmt(el.hi, 2)}, R² ${fmt(el.r2, 2)}, ${el.n} gün)`}`);
      p(`${VERDICT[el.verdict]}`);
      p();
    }
    if (a.visitPhase && Object.keys(a.visitPhase).length) {
      p('| Evre | Gün | Ortalama | Normal\'e göre |');
      p('|---|---:|---:|---:|');
      for (const [ph, r] of Object.entries(a.visitPhase)) p(`| ${ph} | ${r.n} | ${fmt(r.mean)} | ${pct(r.vsNormal)} |`);
      p();
    }
    if (a.visitJumps.length) {
      p('En büyük günlük değişimler:');
      for (const j of a.visitJumps) p(`- ${j.date}: ${pct(j.change)}${j.phaseChange ? ' (evre değişimiyle aynı gün)' : ''}`);
      p();
    }
  }

  if (a.share.length) {
    p('## Kendi pazar payınız');
    p();
    p('| Tarih | Ürün | Satış | Toplam | Pay | Fiyat | Doluluk | Puan |');
    p('|---|---|---:|---:|---:|---:|---:|---:|');
    for (const s of a.share) p(`| ${s.date} | ${s.product} | ${fmt(s.sold)} | ${fmt(s.total)} | ${fmt(s.share * 100, 4)}% | ${fmt(s.price, 2)} | ${fmt(s.occupancy, 1)} | ${fmt(s.rating, 2)} |`);
    p();
  }
  return L.join('\n');
}

// ---- komut satırı ----

export function loadDir(dir) {
  const read = (f) => (existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), 'utf8') : '');
  const c = readConsumption(read('tuketim.csv'));
  const b = readBuildings(read('binalar.csv'));
  const o = readOwn(read('kendi.csv'));
  let categories = {};
  const errors = [...c.errors, ...b.errors, ...o.errors];
  const catText = read('kategoriler.json');
  if (catText) {
    try {
      categories = Object.fromEntries(Object.entries(JSON.parse(catText)).filter(([k]) => !k.startsWith('_')));
    } catch (e) {
      errors.push(`kategoriler.json okunamadı: ${e.message}`);
    }
  }
  return { consumption: c.rows, buildings: b.rows, own: o.rows, categories, errors };
}

function main(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const dir = path.resolve(arg('--veri') || path.join(here, 'veri'));
  const data = loadDir(dir);
  if (!data.consumption.length) {
    console.log(`Tüketim verisi yok: ${path.join(dir, 'tuketim.csv')}`);
    return;
  }
  const text = report(analyze(data), { errors: data.errors });
  const out = arg('--md');
  if (out) { writeFileSync(out, `${text}\n`); console.log(`Rapor yazıldı: ${out}`); } else console.log(text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
