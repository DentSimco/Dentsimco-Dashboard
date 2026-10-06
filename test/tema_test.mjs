// DentSimco — tema sınamaları: her renk iki temada da tanımlı mı, metinler okunabilir mi (WCAG kontrastı).
// Çalıştırma: node test/tema_test.mjs

import { readFileSync } from 'node:fs';
import { cozumle, sonraki, SIRA } from '../public/tema.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
const eq = (a, b, label = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${label} beklenen ${JSON.stringify(b)}, bulunan ${JSON.stringify(a)}`); };

// Tema bloklarından değişkenleri oku
function blok(baslangic) {
  const i = html.indexOf(baslangic);
  if (i < 0) throw new Error(`blok bulunamadı: ${baslangic}`);
  const a = html.indexOf('{', i);
  const b = html.indexOf('\n  }', a);
  const vars = {};
  for (const m of html.slice(a, b).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
const KOYU = blok(':root, :root[data-theme="dark"]');
const ACIK = blok(':root[data-theme="light"]');

// Kontrast
const hex = (c) => { const h = c.replace('#', ''); const n = parseInt(h.length === 3 ? [...h].map((x) => x + x).join('') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const kontrast = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('Her renk değişkeni gündüz ve gece temasında tanımlı', () => {
  const fark = Object.keys(KOYU).filter((k) => !(k in ACIK) && !['--font', '--font-c'].includes(k));
  eq(fark, [], 'gündüzde eksik');
  eq(Object.keys(ACIK).filter((k) => !(k in KOYU)), [], 'gecede eksik');
});

test('Sayfada sabit renk kodu kalmadı (tema blokları dışında)', () => {
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const temaSonu = css.indexOf('*, *::before, *::after');
  const kalan = css.slice(temaSonu).match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || [];
  eq(kalan, []);
});

// [ön plan, arka plan, en düşük oran, ad]
const ciftler = (v) => [
  [v['--text'], v['--bg'], 7, 'metin / zemin'], [v['--text'], v['--surface'], 7, 'metin / kart'], [v['--text'], v['--raise'], 7, 'metin / yükseltilmiş'],
  [v['--muted'], v['--bg'], 4.5, 'soluk metin / zemin'], [v['--muted'], v['--surface'], 4.5, 'soluk metin / kart'], [v['--muted'], v['--raise'], 4.5, 'soluk metin / yükseltilmiş'],
  [v['--faint'], v['--surface'], 3.5, 'silik metin / kart'],
  [v['--accent'], v['--surface'], 4.5, 'vurgu / kart'], [v['--accent'], v['--bg'], 4.5, 'vurgu / zemin'],
  [v['--on-accent'], v['--accent'], 4.5, 'düğme yazısı / vurgu'],
  [v['--price'], v['--bg'], 4.5, 'fiyat / zemin'], [v['--price'], v['--surface'], 4.5, 'fiyat / kart'],
  [v['--up'], v['--surface'], 4.5, 'yükseliş / kart'], [v['--down'], v['--surface'], 4.5, 'düşüş / kart'], [v['--late'], v['--surface'], 4.5, 'uyarı / kart'],
  [v['--up'], v['--up-bg'], 4.5, 'yükseliş çipi'], [v['--down'], v['--down-bg'], 4.5, 'düşüş çipi'], [v['--down-text'], v['--down-bg'], 4.5, 'hata yazısı'],
  [v['--late'], v['--late-bg'], 4.5, 'uyarı etiketi'], [v['--accent'], v['--tint-bg'], 4.5, 'vurgu çipi'],
  ...[1, 2, 3, 4, 5].map((n) => [v[`--d${n}-fg`], v[`--d${n}-bg`], 4.5, `talep rozeti d${n}`]),
  [v['--chart-pill-text'], v['--chart-pill'], 7, 'grafik balonu'], [v['--chart-tag-text'], v['--s-price'], 4.5, 'grafik son fiyat etiketi'],
  [v['--s-price'], v['--surface'], 3, 'grafik fiyat çizgisi'], [v['--s-low'], v['--surface'], 3, 'grafik düşük çizgisi'], [v['--s-high'], v['--surface'], 3, 'grafik yüksek çizgisi'],
  [v['--s-vwap'], v['--surface'], 3, 'grafik VWAP çizgisi'], [v['--s-vol'], v['--surface'], 3, 'grafik hacim çubuğu'],
];
for (const [ad, v] of [['gece', KOYU], ['gündüz', ACIK]]) {
  test(`${ad}: yazı ve çizgi renkleri okunabilir (WCAG: metin ≥ 4,5, çizgi ≥ 3)`, () => {
    const kotu = ciftler(v).map(([a, b, min, n]) => ({ n, oran: kontrast(a, b), min })).filter((x) => x.oran < x.min);
    if (kotu.length) throw new Error(kotu.map((x) => `${x.n}: ${x.oran.toFixed(2)} < ${x.min}`).join('; '));
  });
}

test('Gece teması eskisinden daha az parlak: fiyat, yükseliş ve düşüş renkleri kısıldı (doygunluk düştü)', () => {
  const doygun = (c) => { const [r, g, b] = hex(c).map((x) => x / 255); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
  const ESKI = { '--price': '#3cefff', '--up': '#46f0a0', '--down': '#ff5f7e' };
  for (const [k, eski] of Object.entries(ESKI)) {
    if (!(doygun(KOYU[k]) < doygun(eski))) throw new Error(`${k}: ${KOYU[k]} eskisinden (${eski}) doygun`);
  }
  if (!(parseFloat(KOYU['--chart-glow']) <= 0.6)) throw new Error('grafik parlaması yeterince kısılmadı');
});

test('Gündüz temasında grafik parlaması yok', () => eq(parseFloat(ACIK['--chart-glow']), 0));

test('Tercih çözümleme: açık seçim her zaman kazanır, seçim yoksa cihaz ayarı izlenir', () => {
  eq(cozumle(null, true), 'light');
  eq(cozumle(null, false), 'dark');
  eq(cozumle('auto', true), 'light'); // eski "otomatik" kaydı seçim sayılmaz, cihaz ayarı geçerli
  eq(cozumle('light', false), 'light');
  eq(cozumle('dark', true), 'dark');
  eq(cozumle('bozuk', false), 'dark');
});

test('Yalnız iki tema var: Gündüz ve Gece; düğme ikisi arasında geçer', () => {
  eq(SIRA, ['light', 'dark']);
  eq(sonraki('light'), 'dark');
  eq(sonraki('dark'), 'light');
  eq(sonraki(null, true), 'dark');  // cihaz gündüzse düğme geceye geçer
  eq(sonraki(null, false), 'light');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
