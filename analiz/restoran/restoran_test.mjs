// DentSimco — restoran talep analizi sınamaları. Çalıştırma: node analiz/restoran/restoran_test.mjs
// Yayın dışıdır (site.yml yalnız public/ ve test/ çalıştırır); veriler yapay, oyundan alınmamıştır.

import * as A from './analiz.mjs';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} beklenen ${b}, bulunan ${a}`);
}
function near(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} beklenen ${expected} (±${tol}), bulunan ${actual}`);
}

const day = (i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
// Küçük, tekrarlanabilir gürültü (Math.random yok)
const noise = (i, k = 1) => 1 + 0.01 * Math.sin(i * 1.7 + k);

test('Sayı okuma: binlik nokta ve ondalık virgül', () => {
  eq(A.parseCount('5.694.364'), 5694364);
  eq(A.parseCount('1 966'), 1966);
  eq(Number.isNaN(A.parseCount('4,5')), true);
  eq(A.parseDecimal('4,5'), 4.5);
  eq(A.parseDecimal('4.5'), 4.5);
  eq(A.parseDecimal('1.234,5'), 1234.5);
  eq(A.parseDecimal('87%'), 87);
});

test('Tarih okuma: ISO, nokta ve eğik çizgi; geçersiz gün reddedilir', () => {
  eq(A.parseDate('2026-10-10'), '2026-10-10');
  eq(A.parseDate('10.10.2026'), '2026-10-10');
  eq(A.parseDate('1/9/2026'), '2026-09-01');
  eq(A.parseDate('31.02.2026'), null);
});

test('Tüketim: yorum satırı atlanır, çelişen tekrar uyarı verir', () => {
  const { rows, errors } = A.readConsumption('# yorum\ntarih;urun;miktar\n2026-10-10;Portakal suyu;5.694.364\n2026-10-10;portakal SUYU;5\n2026-10-11;Su;x');
  eq(rows, [{ date: '2026-10-10', product: 'Portakal suyu', amount: 5694364 }]);
  eq(errors.length, 2);
});

test('Binalar: evre adları eşlenir, tanınmayan evre uyarı verir', () => {
  const { rows, errors } = A.readBuildings('tarih;bina;ekonomi\n2026-10-11;1966;boom\n2026-10-12;1970;recession\n2026-10-13;1971;çok iyi');
  eq(rows.map((r) => r.phase), ['Boom', 'Resesyon', null]);
  eq(errors.length, 1);
});

test('Bina kaydı: en yakın önceki gün, en fazla 3 gün geriye', () => {
  const b = [{ date: '2026-10-01', count: 100 }, { date: '2026-10-05', count: 120 }];
  eq(A.buildingsOn(b, '2026-10-04'), 100);
  eq(A.buildingsOn(b, '2026-10-05'), 120);
  eq(A.buildingsOn(b, '2026-10-09'), null);
  eq(A.buildingsOn(b, '2026-09-30'), null);
});

test('En küçük kareler: y = 2 + 3x tam bulunur', () => {
  const X = [0, 1, 2, 3, 4].map((x) => [1, x]);
  const fit = A.ols(X, [0, 1, 2, 3, 4].map((x) => 2 + 3 * x));
  near(fit.b[0], 2, 1e-9);
  near(fit.b[1], 3, 1e-9);
  near(fit.r2, 1, 1e-9);
});

const cats = { 'İçecek': ['Su', 'Portakal suyu'], 'Yemek': ['Burger', 'Pizza'] };
// İki kategori, her gün toplamları eşit (ziyaret sayısı V), ürün payları günden güne değişir
function equalCategories(visits, buildings) {
  const consumption = [];
  visits.forEach((v, i) => {
    const s = 0.3 + 0.02 * (i % 5);
    consumption.push({ date: day(i), product: 'Su', amount: Math.round(v * s) }, { date: day(i), product: 'Portakal suyu', amount: v - Math.round(v * s) });
    consumption.push({ date: day(i), product: 'Burger', amount: Math.round(v * 0.6) }, { date: day(i), product: 'Pizza', amount: v - Math.round(v * 0.6) });
  });
  return { consumption, buildings: buildings.map((count, i) => ({ date: day(i), count, phase: null })), categories: cats };
}

test('Kategori sınaması: eşit toplamlar "esit" ve ziyaret = kategori toplamı', () => {
  const visits = [5_800_000, 5_900_000, 5_700_000, 5_650_000, 5_750_000, 5_820_000];
  const a = A.analyze(equalCategories(visits, visits.map((_, i) => 1800 + 30 * i)));
  eq(a.catTest.verdict, 'esit');
  eq(a.visits.map((v) => v.y), visits);
});

test('Kategori sınaması: sabit oranlı toplamlar "sabit-carpan"', () => {
  const data = equalCategories([100, 110, 120, 130, 140].map((x) => x * 10_000), [1, 2, 3, 4, 5].map((x) => 1000 + x));
  data.consumption = data.consumption.map((r) => (r.product === 'Burger' || r.product === 'Pizza' ? { ...r, amount: r.amount * 2 } : r));
  eq(A.analyze(data).catTest.verdict, 'sabit-carpan');
});

test('Kategori sınaması: eksik ürünlü kategori "tam" sayılmaz', () => {
  const { table } = A.categoryTotals([{ date: day(0), product: 'Su', amount: 10 }, { date: day(0), product: 'Burger', amount: 5 }, { date: day(0), product: 'Pizza', amount: 5 }], cats);
  eq(table[0].cats['İçecek'].complete, false);
  eq(table[0].cats.Yemek, { total: 10, complete: true, have: 2, of: 2 });
});

test('Esneklik: bina artarken sabit tüketim → H1', () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ date: day(i), y: 5_800_000 * noise(i), buildings: 1500 + 50 * i }));
  const el = A.elasticity(pts);
  eq(el.verdict, 'H1');
  near(el.e, 0, 0.15);
});

test('Esneklik: binayla orantılı tüketim → H2', () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ date: day(i), y: 3000 * (1500 + 50 * i) * noise(i), buildings: 1500 + 50 * i }));
  const el = A.elasticity(pts);
  eq(el.verdict, 'H2');
  near(el.e, 1, 0.15);
});

test('Esneklik: 5 günden az ya da tek bina sayısı → yetersiz', () => {
  eq(A.elasticity([{ y: 1, buildings: 1 }]).verdict, 'yetersiz');
  eq(A.elasticity(Array.from({ length: 6 }, () => ({ y: 5, buildings: 1966 }))).verdict, 'yetersiz');
});

test('Evre etkisi ve günlük sıçrama evre değişimine bağlanır', () => {
  const s = [100, 100, 100, 130, 130].map((y, i) => ({ date: day(i), y, phase: i < 3 ? 'Normal' : 'Boom' }));
  const ph = A.phaseEffect(s);
  near(ph.Boom.vsNormal, 0.3, 1e-9);
  const j = A.jumps(s, 1)[0];
  eq([j.date, j.phaseChange], [day(3), true]);
  near(j.change, 0.3, 1e-9);
});

test('Pazar payı: kendi satış / aynı gün ürün toplamı', () => {
  const sh = A.marketShare([{ date: day(0), product: 'su', sold: 580, price: 1, occupancy: 90, rating: 4 }], [{ date: day(0), product: 'Su', amount: 5_800_000 }]);
  near(sh[0].share, 0.0001, 1e-12);
});

test('Rapor: veri uyarıları ve kategorisiz ürün listelenir', () => {
  const a = A.analyze({ consumption: [{ date: day(0), product: 'Kahve', amount: 10 }], buildings: [], categories: cats });
  const text = A.report(a, { errors: ['örnek uyarı'] });
  eq(text.includes('örnek uyarı') && text.includes('Kahve'), true);
});

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      → ${r.error}`}`);
}
console.log(`\n${results.length - failed}/${results.length} test geçti${failed ? `, ${failed} başarısız` : ''}.`);
process.exitCode = failed ? 1 : 0;
