// node test/haberler_test.mjs — Haberler sayfasının saf yardımcıları (ağ ve tarayıcı kullanmaz)
import assert from 'node:assert/strict';
import { tickerItems, sparkPaths, splitColumns, compactUsd, chartSeries, guncelBaski, OZEL_MANSETLER, viewArticle } from '../public/haberler.js';

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

// Güncel baskı: "gün" son baskının gününe bağlı; elle manşet yeni baskıya kadar kalır, eski manşet haberlerin başına iner
const NOW = new Date(2026, 9, 12, 18, 0).getTime(); // yerel 12 Ekim 18:00
const dun = new Date(2026, 9, 11, 20, 0).getTime();
const bugun = new Date(2026, 9, 12, 8, 0).getTime();
const H = (id, t) => ({ id, t, kategori: 'PİYASA', tr: { baslik: id, spot: '', govde: ['x'] }, en: null });
const belge = { t: bugun, manset: H('m', bugun), haberler: [H('a', bugun), H('eski', dun), H('b', bugun)], fiyatlar: { 1: ['x', 1, 0] } };
const ozel = [{ id: 'oz', realm: 0, t: new Date(2026, 9, 12, 17, 55).getTime() }];
const g1 = guncelBaski(belge, 0, NOW, ozel);
assert.equal(g1.manset.id, 'oz');
assert.deepEqual(g1.haberler.map((h) => h.id), ['m', 'a', 'b'], 'önceki manşet altta, dünkü haber yok');
assert.equal(g1.fiyatlar, belge.fiyatlar, 'diğer alanlar korunur');
assert.equal(belge.haberler.length, 3, 'belge değişmez');
assert.equal(guncelBaski(belge, 1, NOW, ozel).manset.id, 'm', 'başka realmde elle manşet çıkmaz');
assert.deepEqual(guncelBaski(belge, 1, NOW, ozel).haberler.map((h) => h.id), ['a', 'b']);
// Gece yarısı geçti (13 Ekim 00:16) ama yeni baskı yok: sayfa değişmez
const geceYarisi = new Date(2026, 9, 13, 0, 16).getTime();
const g2 = guncelBaski(belge, 0, geceYarisi, ozel);
assert.equal(g2.manset.id, 'oz', 'yeni baskı gelene kadar elle manşet kalır');
assert.deepEqual(g2.haberler.map((h) => h.id), ['m', 'a', 'b'], 'bugünün haberleri gece yarısı kaybolmaz');
// Yeni baskı (13 Ekim 08:00) gelince: elle manşet kalkar, önceki günün haberleri gider
const sabah = new Date(2026, 9, 13, 8, 0).getTime();
const yeni = { t: sabah, manset: H('n', sabah), haberler: [H('n2', sabah), H('m', bugun), H('a', bugun)] };
const g3 = guncelBaski(yeni, 0, sabah + 60_000, ozel);
assert.equal(g3.manset.id, 'n');
assert.deepEqual(g3.haberler.map((h) => h.id), ['n2'], 'önceki günün haberleri görünmez');
// Bot hiç yazmazsa elle manşet 2 gün sonra kalkar
assert.equal(guncelBaski(belge, 0, new Date(2026, 9, 15, 0, 0).getTime(), ozel).manset.id, 'm');
const eskiBelge = { t: bugun, manset: H('m', dun), haberler: [H('a', dun), H('b', bugun)] };
assert.equal(guncelBaski(eskiBelge, 0, NOW, []).manset.id, 'b', 'manşet eskiyse güncel haber manşet olur');
assert.equal(guncelBaski({ t: bugun, manset: H('m', dun), haberler: [H('a', dun)] }, 0, NOW, []).manset.id, 'm', 'güncel haber yoksa eski manşet kalır');
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

// ---- Kayan şerit: kendiliğinden akış, sürükleme, ivme ----
{
  const { seritKaydir } = await import('../public/haberler.js');
  const L = {};
  const view = { classList: { add() {}, remove() {} }, addEventListener: (n, f) => { L[n] = f; }, setPointerCapture() {} };
  const track = { scrollWidth: 2000, style: {} };
  let cb = null, t = 0;
  const dur = seritKaydir(view, track, { raf: (f) => { cb = f; return 1; }, caf() {}, now: () => t });
  const px = () => Number(/translate3d\((-?[\d.]+)px/.exec(track.style.transform)[1]);
  const tick = (ms) => { t += ms; const f = cb; cb = null; f(t); };
  tick(0); tick(1000);
  assert.ok(px() < 0 && px() > -1000, 'kendiliğinden sola akar');
  const a = px();
  L.pointerdown({ pointerType: 'touch', clientX: 500 });
  t += 50; L.pointermove({ pointerType: 'touch', clientX: 560, pointerId: 1 });
  t += 50; L.pointermove({ pointerType: 'touch', clientX: 640, pointerId: 1 });
  assert.ok(Math.abs(px() - (a + 140)) < 1e-6 || Math.abs(px() - (((a + 140) % 1000) - 1000)) < 1e-6 || px() <= 0, 'parmakla sağa kayar');
  let engellendi = false;
  L.pointerup({});
  L.click({ preventDefault() { engellendi = true; }, stopPropagation() {} });
  assert.ok(engellendi, 'sürükleme sonrası tıklama bağlantıya gitmez');
  const b = px();
  tick(16); tick(100);
  assert.ok(px() > b, 'bırakınca sağa doğru kaymaya devam eder');
  for (let i = 0; i < 80; i++) tick(100);
  const c = px(); tick(1000);
  assert.ok(px() !== c, 'sonunda yine kendiliğinden akar');
  dur();
  console.log('✓ şerit kaydırma');
}

// Köşe yazısı sayfası açılır (yerel değişken i18n çeviri işlevini gölgelediğinde "t is not a function" hatası veriyordu)
{
  const yazi = { id: 'k1', t: Date.now(), tr: { baslik: 'Başlık', spot: 'Özet', govde: ['Bir.', 'İki.'] }, en: { baslik: 'Title', spot: 'Sum', govde: ['One.'] } };
  const html = viewArticle({ news: { manset: { id: 'm', t: Date.now(), tr: { baslik: 'M', govde: [] }, en: { baslik: 'M', govde: [] } }, haberler: [], kose: yazi } }, 'k1');
  assert.ok(html.includes('KÖŞE YAZISI') && html.includes('nw-art kose'), 'köşe yazısı çizilir');
  console.log('✓ köşe yazısı sayfası');
}
