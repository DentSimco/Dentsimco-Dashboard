// node test/haberler_test.mjs — Haberler sayfasının saf yardımcıları (ağ ve tarayıcı kullanmaz)
import assert from 'node:assert/strict';
import { tickerItems, sparkPaths, splitColumns, compactUsd, chartSeries, guncelBaski, OZEL_MANSETLER } from '../public/haberler.js';

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
// Sıra: en çok yükselen, en çok düşen, ikinci yükselen, ikinci düşen... sonra değişimi olmayanlar
const fz = { 1: ['A', 10, 0], 2: ['B', 10, 0], 3: ['C', 10, 0], 4: ['D', 10, 0], 5: ['E', 10, 0], 6: ['F', 10, 0] };
const lv = { 1: [0, { 0: [10.5] }], 2: [0, { 0: [12] }], 3: [0, { 0: [9] }], 4: [0, { 0: [9.9] }], 5: [0, { 0: [10] }] };
const sira = tickerItems(fz, lv, 10, () => 0).map((x) => x.ad);
assert.deepEqual(sira.slice(0, 4), ['B', 'C', 'A', 'D']);
assert.deepEqual(sira.slice(4).sort(), ['E', 'F'], 'değişimi olmayanlar sonda');
assert.deepEqual(tickerItems(fz, lv, 3, () => 0).map((x) => x.ad), ['B', 'C', 'A'], 'en çok n');

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

// Güncel baskı: geçmiş günün haberleri ayıklanır, bugünkü elle yazılmış manşet öne geçer, eski manşet haberlerin başına iner
const NOW = new Date(2026, 9, 12, 18, 0).getTime(); // yerel 12 Ekim 18:00
const dun = new Date(2026, 9, 11, 20, 0).getTime();
const bugun = new Date(2026, 9, 12, 8, 0).getTime();
const H = (id, t) => ({ id, t, kategori: 'PİYASA', tr: { baslik: id, spot: '', govde: ['x'] }, en: null });
const belge = { manset: H('m', bugun), haberler: [H('a', bugun), H('eski', dun), H('b', bugun)], fiyatlar: { 1: ['x', 1, 0] } };
const ozel = [{ id: 'oz', realm: 0, t: new Date(2026, 9, 12, 17, 55).getTime() }];
const g1 = guncelBaski(belge, 0, NOW, ozel);
assert.equal(g1.manset.id, 'oz');
assert.deepEqual(g1.haberler.map((h) => h.id), ['m', 'a', 'b'], 'önceki manşet altta, dünkü haber yok');
assert.equal(g1.fiyatlar, belge.fiyatlar, 'diğer alanlar korunur');
assert.equal(belge.haberler.length, 3, 'belge değişmez');
assert.equal(guncelBaski(belge, 1, NOW, ozel).manset.id, 'm', 'başka realmde elle manşet çıkmaz');
assert.deepEqual(guncelBaski(belge, 1, NOW, ozel).haberler.map((h) => h.id), ['a', 'b']);
const ertesi = new Date(2026, 9, 13, 9, 0).getTime();
assert.equal(guncelBaski(belge, 0, ertesi, ozel).manset.id, 'm', 'ertesi gün elle manşet kalkar; haberin kendisi de eskidiği için eski manşet kalır');
const eskiBelge = { manset: H('m', dun), haberler: [H('a', dun), H('b', bugun)] };
assert.equal(guncelBaski(eskiBelge, 0, NOW, []).manset.id, 'b', 'manşet eskiyse bugünkü haber manşet olur');
assert.equal(guncelBaski({ manset: H('m', dun), haberler: [H('a', dun)] }, 0, NOW, []).manset.id, 'm', 'bugün hiç haber yoksa eski manşet kalır');
assert.equal(guncelBaski(null, 0, NOW, ozel).manset.id, 'oz', 'haber belgesi yokken de elle manşet çıkar');
assert.equal(guncelBaski(null, 0, NOW, []), null);
assert.ok(OZEL_MANSETLER.every((o) => o.tr?.baslik && o.en?.baslik && o.tr.govde.length && o.en.govde.length), 'elle manşetlerin iki dili de dolu');

// Şerit bağlantısı: #borsa/ürün/kalite
import { borsaHedefi } from '../public/borsa.js';
assert.deepEqual(borsaHedefi('#borsa/12/4'), { id: 12, q: 4 });
assert.deepEqual(borsaHedefi('#borsa/12'), { id: 12, q: 0 });
assert.equal(borsaHedefi('#borsa'), null);
assert.equal(borsaHedefi('#sinyal/12/4'), null);
assert.equal(borsaHedefi('#borsa/abc/1'), null);
assert.equal(borsaHedefi('#borsa/12/99'), null);
console.log('haberler_test: tamam');
