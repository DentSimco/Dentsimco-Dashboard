// node test/haberler_test.mjs — Haberler sayfasının saf yardımcıları (ağ ve tarayıcı kullanmaz)
import assert from 'node:assert/strict';
import { tickerItems, sparkPaths, splitColumns, compactUsd, chartSeries } from '../public/haberler.js';

// Şerit: canlı fiyat ana kaliteden, değişim dünkü kapanışa göre; canlı yoksa kapanış, değişim boş; fiyatsız ürün atlanır
const fiyatlar = { 1: ['Elma', 10, 1], 2: ['Su', 5, 0], 3: ['Yok', null, 0] };
const live = { 1: [0, { 0: [99, null], 1: [11, null] }] };
const t = tickerItems(fiyatlar, live, 10, () => 0);
const by = Object.fromEntries(t.map((x) => [x.id, x]));
assert.equal(t.length, 2);
assert.equal(by[1].fiyat, 11);
assert.equal(by[1].q, 1, 'şeritte ana kalite gösterilir');
assert.ok(Math.abs(by[1].degisim - 0.1) < 1e-9);
assert.equal(by[2].fiyat, 5);
assert.equal(by[2].degisim, null);
assert.equal(tickerItems(fiyatlar, live, 1).length, 1, 'en çok n ürün');
assert.deepEqual(tickerItems(null, null), []);

// Grafik yolu: ilk nokta sol, son nokta sağ; en yüksek değer üstte (y küçük)
const [line, area] = sparkPaths([['a', 1], ['b', 3], ['c', 2]], 100, 40, 0);
assert.equal(line, 'M0,40L50,0L100,20');
assert.ok(area.startsWith(line) && area.endsWith('Z'));
assert.equal(sparkPaths([['a', 1]]), null);
assert.equal(sparkPaths(null), null);
assert.ok(sparkPaths([['a', 5], ['b', 5]])[0].startsWith('M0,'), 'düz seri bölme hatası vermez');

assert.deepEqual(splitColumns([1, 2, 3, 4, 5]), [[1, 3, 5], [2, 4]]);
assert.deepEqual(splitColumns(undefined), [[], []]);
assert.match(compactUsd(48_200_000), /^\$48,2\s?Mn?$|^\$48\.2M$/);
assert.equal(compactUsd(NaN), '—');
// Grafik: kapanışların sonuna bugünkü canlı fiyat eklenir (bugün zaten varsa eklenmez)
const g = { seri: [['2026-10-09', 10], ['2026-10-10', 9]], canli: 11 };
assert.deepEqual(chartSeries(g, '2026-10-11').at(-1), ['2026-10-11', 11]);
assert.equal(chartSeries(g, '2026-10-10').length, 2);
assert.equal(chartSeries({ seri: [['2026-10-10', 9]] }, '2026-10-11').length, 1, 'canlı fiyat yoksa eklenmez');
assert.deepEqual(chartSeries(null), []);
console.log('haberler_test: tamam');
