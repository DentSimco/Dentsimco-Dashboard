// DentSimco — borsa: canlı ölçümün grafiğe ve gün aralığına katılması. Çalıştırma: node test/borsa_canli_test.mjs
import { withLive, intradaySeries, buildSeries, RANGES } from '../public/borsa.js';
import { summarizeDay, anlikFiyat, ASK_FRESH_MS, mergeAnlik, withAnlikSamples, dataField, dailyRows } from '../public/veri.js';

const results = [];
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } }
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} beklenen ${JSON.stringify(b)}, gelen ${JSON.stringify(a)}`); };

const T = Date.parse('2026-10-12T09:18:00Z');
const byDay = () => new Map([['2026-10-12', [{ t: T, qs: { 1: [1890, null, 0, 0] } }]]]);
const snap = { t: T + 9 * 60_000, qs: { 1: [1600, null, 7, 11200, T - 60_000] } };

test('Canlı ölçüm yeniyse son nokta olarak eklenir; giriş değişmez', () => {
  const src = byDay();
  const out = withLive(src, snap);
  eq(out.get('2026-10-12').length, 2);
  eq(src.get('2026-10-12').length, 1, 'kaynak');
  const s = intradaySeries(out, 1);
  eq(s.values.anlik.at(-1), 1600);
  eq(s.values.dusuk.at(-1), 1600);
  eq(s.values.yuksek.at(-1), 1890);
});
test('Satış adedi canlıdan sayılmaz (çift sayım olmaz)', () => {
  const d = summarizeDay(withLive(byDay(), snap).get('2026-10-12'));
  eq(d[1][5], 0);
  eq(d[1][2], 1600);
});
test('Son nokta canlıdan yeni ya da aynıysa değişiklik yok', () => {
  const src = byDay();
  eq(withLive(src, { t: T, qs: { 1: [1600] } }), src);
});
test('Canlı yok ya da bugün belgesi yoksa değişiklik yok', () => {
  const src = byDay();
  eq(withLive(src, null), src);
  eq(withLive(src, { t: T + 2 * 86_400_000, qs: { 1: [5] } }), src);
});


// ---- Anlık borsa fiyatı (ask): Sim Companies ilanlarından; canlı satır [fiyat, arz, satış, tutar, sonİşlem, ask], gün içi nokta [fiyat, arz, satış, tutar, ask] ----

test('Canlı ölçümdeki anlık borsa fiyatı gün içi noktanın 5. elemanı olur; yalnız ilanı olan kalite de eklenir', () => {
  const s = { t: T + 9 * 60_000, askT: T + 9 * 60_000, qs: { 1: [1600, 80, 7, 11200, T - 60_000, 1610], 4: [null, 12, 0, 0, null, 1900] } };
  const pts = withLive(byDay(), s).get('2026-10-12');
  eq(pts.at(-1).qs[1], [1600, 80, null, null, 1610]);
  eq(pts.at(-1).qs[4], [null, 12, null, null, 1900]);
});
test('Anlık veri eskiyse (askT 20 dakikadan eski) noktaya ask yazılmaz', () => {
  const s = { t: T + 60 * 60_000, askT: T + 9 * 60_000 - ASK_FRESH_MS, qs: { 1: [1600, 80, 7, 11200, T - 60_000, 1610] } };
  eq(withLive(byDay(), s).get('2026-10-12').at(-1).qs[1][4], null);
});
test('Gün içi seride ask çizgisi: geçmiş noktalardan ve canlıdan; eski noktalarda ask yoksa boş', () => {
  const src = new Map([['2026-10-12', [{ t: T, qs: { 1: [1890, null, 0, 0] } }, { t: T + 600_000, qs: { 1: [1880, 50, 3, 5600, 1895] } }]]]);
  const sr = intradaySeries(src, 1);
  eq(sr.values.ask, [null, 1895]);
  eq(sr.values.anlik, [1890, 1880]);
});
test('Günlük aralıkta ask serisi boştur (kapanış son işlem fiyatıdır)', () => {
  const rg = RANGES.find((r) => r.kind === 'daily');
  const product = { byDay: new Map(), daily: new Map([['2026-10-11', { 1: [1, 2, 0.5, 1.5, 10, 100, 150] }]]) };
  const out = buildSeries(product, rg, 1, Date.parse('2026-10-12T10:00:00Z'));
  eq(out.values.ask, [null]);
  eq(out.values.anlik, [1.5]);
});
test('anlikFiyat: taze anlık borsa fiyatı; ilan yoksa null (borsada yok); anlık veri eski ya da yoksa son işlem fiyatı', () => {
  const now = T + 10 * 60_000;
  const live = { t: now, items: { 1: [now, { 0: [0.24, 100, 0, 0, now - 3_600_000, 0.242], 2: [0.3, 5, 0, 0, now - 7_200_000, null] }, now - 60_000] } };
  eq(anlikFiyat(live, 1, 0, now), { p: 0.242, kaynak: 'borsa', t: now - 60_000 });
  eq(anlikFiyat(live, 1, 2, now), null, 'ilan yok: eski işlem fiyatı verilmez');
  eq(anlikFiyat(live, 1, 2, now + ASK_FRESH_MS + 120_000), { p: 0.3, kaynak: 'son', t: now - 7_200_000 }, 'anlık veri eski');
  eq(anlikFiyat(live, 1, 0, now + ASK_FRESH_MS + 120_000), { p: 0.24, kaynak: 'son', t: now - 3_600_000 }, 'anlık veri eski');
  eq(anlikFiyat(live, 1, 7, now), null);
  eq(anlikFiyat(live, 99, 0, now), null);
  eq(anlikFiyat({ items: { 1: [now, { 0: [0.24, null, 0, 0, null] }] } }, 1, 0, now), { p: 0.24, kaynak: 'son', t: now }, 'eski kayıt biçimi (ask yok)');
});


// ---- İki botun verisinin birleşmesi: SimcoTools (data) + Sim Companies (anlik) ----
test('mergeAnlik: canlı satıra arz ve ask işlenir; ilanı olmayan kalite arz 0, yalnız ilanı olan kalite eklenir', () => {
  const live = { t: 10, items: { 1: [10, { 0: [0.24, null, 5, 1.2, 9], 2: [0.25, null, 0, 0, 8] }] } };
  const anlik = { t: 20, items: { 1: [20, { 0: [0.242, 100], 3: [0.3, 7] }], 9: [21, { 1: [1.5, 4] }] } };
  const m = mergeAnlik(live, anlik);
  eq(m.items[1], [10, { 0: [0.24, 100, 5, 1.2, 9, 0.242], 2: [0.25, 0, 0, 0, 8, null], 3: [null, 7, 0, 0, null, 0.3] }, 20]);
  eq(m.items[9], [21, { 1: [null, 4, 0, 0, null, 1.5] }, 21], 'SimcoTools kaydı olmayan ürün');
  eq(live.items[1][1][0].length, 5, 'giriş değişmez');
});
test('dataField: canlı belgede anlik alanı varsa birleştirir, yoksa data aynen', () => {
  const f = { data: JSON.stringify({ t: 1, items: { 1: [1, { 0: [0.24, null, 0, 0, 1] }] } }), anlik: JSON.stringify({ t: 2, items: { 1: [2, { 0: [0.25, 50] }] } }) };
  eq(dataField(f).items[1][1][0], [0.24, 50, 0, 0, 1, 0.25]);
  eq(dataField({ data: JSON.stringify({ a: 1 }) }), { a: 1 });
});
test('withAnlikSamples: her noktaya önceki en yeni örneğin ask ve arzı işlenir; 6 saatten eski örnek kullanılmaz', () => {
  const pts = [{ t: 1000, qs: { 1: [1, null, 2, 3] } }, { t: 2000, qs: { 1: [1.1, null, 0, 0] } }, { t: 1000 + 7 * 3_600_000, qs: { 1: [1.2, null, 0, 0] } }];
  const out = withAnlikSamples(pts, [{ t: 1500, qs: { 1: [1.05, 40], 2: [1.3, 2] } }]);
  eq(out[0], pts[0], 'örnekten önceki nokta değişmez');
  eq(out[1].qs[1], [1.1, 40, 0, 0, 1.05]);
  eq(out[1].qs[2], [null, 2, 0, 0, 1.3]);
  eq(out[2], pts[2], '6 saatten eski örnek');
});
test('dailyRows: anlık botun günlük ortalama arzı (a alanı) satırın ortArz yerine işlenir', () => {
  const f = { d1018: JSON.stringify({ 1: [1, 2, 0.5, 1.5, 0, 10, 15] }), a1018: JSON.stringify({ 1: 333, 4: 9 }) };
  const rows = dailyRows(f, 2026);
  eq(rows.get('2026-10-18')[1][4], 333);
  eq(rows.get('2026-10-18')[4], undefined, 'günlük satırı olmayan kalite eklenmez');
});

const failed = results.filter((r) => !r.ok);
for (const r of failed) console.log(`✗ ${r.name}: ${r.error}`);
console.log(`${results.length - failed.length}/${results.length} borsa canlı sınaması geçti.`);
process.exitCode = failed.length ? 1 : 0;
