// DentSimco — borsa: canlı ölçümün grafiğe ve gün aralığına katılması. Çalıştırma: node test/borsa_canli_test.mjs
import { withLive, intradaySeries } from '../public/borsa.js';
import { summarizeDay } from '../public/veri.js';

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

const failed = results.filter((r) => !r.ok);
for (const r of failed) console.log(`✗ ${r.name}: ${r.error}`);
console.log(`${results.length - failed.length}/${results.length} borsa canlı sınaması geçti.`);
process.exitCode = failed.length ? 1 : 0;
