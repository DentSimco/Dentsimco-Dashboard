// node test/firlatma_test.mjs — Fırlatma Rampası ve Havacılık araştırması (oyun ansiklopedisinden, Ekim 2026)
//   400 / 2.800 araştırma, seviye 3+, kaza %50 → her kalitede yarı, süre 128 sa → her seviyede yarı, ekonomi evresinden etkilenmez.
import assert from 'node:assert/strict';
import * as H from '../public/hesap.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`BAŞARISIZ: ${name}\n  ${e.message}`); process.exitCode = 1; } };
const near = (a, b, tol = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} beklenen ${b}, bulunan ${a}`);

const products = {
  91: { id: 91, name: 'Alt yörüngesel roket', building: 'D', inputs: [], perHour: 0.7321, baseSalary: 759, exchangeTradable: false },
  94: { id: 94, name: 'BFR', building: 'D', inputs: [], perHour: 0.244, baseSalary: 759, exchangeTradable: false },
  100: { id: 100, name: 'Havacılık araştırması', building: 'l', inputs: [[91, 1], [94, 1]], perHour: 0.3823, baseSalary: 517.5, research: true },
};
const buildings = { l: { category: 'research', salaryModifier: 1.5 }, D: { category: 'production', salaryModifier: 2.2 } };
const DATA = H.normalizeData({ products, buildings, core: { AVERAGE_SALARY: 345 }, realm: 0 });
const admin = { gross: 0, net: 0 };
const pad = (level, quality = 0, rocket = 'sub', extra = {}) => ({ id: 'b', type: 'l', product: 100, level, quality, rocket, ...extra });
const rate = (b, setup = {}, effects = null) => H.buildingRate(b, setup, DATA, admin, Date.now(), effects || { researchSpeedPct: 0 });

t('fırlatma süresi: svy 1 = 128 sa, her seviyede yarıya iner', () => {
  const hours = [1, 2, 3, 4, 5, 6].map((l) => H.launchHours(l));
  assert.deepEqual(hours, [128, 64, 32, 16, 8, 4]);
});
t('kaza olasılığı: Q0 %50, Q1 %25, Q2 %12,5, Q3 %6,25, Q4 %3,13', () => {
  assert.deepEqual([0, 1, 2, 3].map(H.launchAccident), [0.5, 0.25, 0.125, 0.0625]);
  near(H.launchAccident(4), 0.03125);
});
t('seviye 3 altında fırlatma yok (hata)', () => {
  const r = rate(pad(2));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /seviye 3/);
});
t('alt yörüngesel Q0, svy 6: 4 sa, günde 6 fırlatma, fırlatma başı beklenen 200 araştırma', () => {
  const r = rate(pad(6, 0, 'sub'));
  assert.equal(r.ok, true);
  near(r.launch.hours, 4); near(r.launch.launchesDay, 6);
  near(r.launch.pointsExpected, 200); near(r.daily, 1200); near(r.hourly, 50);
});
t('BFR Q4, svy 3: 32 sa, 2.800 × (1 − 0,03125) = 2.712,5', () => {
  const r = rate(pad(3, 4, 'bfr'));
  near(r.launch.hours, 32); near(r.launch.pointsExpected, 2712.5);
  near(r.daily, 2712.5 * 24 / 32, 1e-6);
});
t('maaş: bina seviyesi × taban maaş × saat (fırlatma başına svy 6 = 6 × 517,5 × 4)', () => {
  const r = rate(pad(6));
  near(r.wageHour, 6 * 517.5);
  near(r.wageHour * r.launch.hours, 12420);
});
t('araştırma hızı (bilim) süreyi kısaltır: +%100 → yarı süre, iki kat araştırma', () => {
  const a = rate(pad(5), {}, { researchSpeedPct: 0 });
  const b = rate(pad(5), {}, { researchSpeedPct: 100 });
  near(b.launch.hours, a.launch.hours / 2); near(b.daily, a.daily * 2, 1e-6);
});
t('rekreasyon bonusu araştırma binasındaki gibi süreyi kısaltır (÷ (1 − bonus))', () => {
  const a = rate(pad(5));
  const b = rate(pad(5), { recreation: { park: 3, temple: 3, lake: 3 } });
  near(b.launch.hours, a.launch.hours * (1 - 0.09), 1e-9);
});
t('ekonomi evresi fırlatma süresini değiştirmez', () => {
  const eco = { ...DATA, economy: { ...DATA.economy, currentMid: 700, salaryMid: [655, 700, 745] } };
  const a = H.buildingRate(pad(5), { economyPhase: 0 }, eco, admin, Date.now(), { researchSpeedPct: 0 });
  const b = H.buildingRate(pad(5), { economyPhase: 2 }, eco, admin, Date.now(), { researchSpeedPct: 0 });
  near(a.launch.hours, 8); near(b.launch.hours, 8); assert.equal(a.phaseFactor, 1);
});
t('inşaattaki fırlatma rampası üretmez ve seviye hatası vermez', () => {
  const r = rate(pad(1, 0, 'sub', { construction: true }));
  assert.equal(r.ok, true); assert.equal(r.daily, 0); assert.equal(r.wageHour, 0);
});

// Plan: roket girdisi tam seçilen kalitede, fırlatma başına 1 roket, kazada da tükenir
const planOf = (b, setup = {}, market = null) => H.evaluatePlan({ buildings: [b], ...setup }, DATA, market, { effects: { researchSpeedPct: 0 } });
t('plan: günlük roket ihtiyacı = fırlatma sayısı, kalite tam eşleşir', () => {
  const plan = planOf(pad(6, 2, 'sub'), { prices: { '91:2': 100000 } });
  const d = plan.demands[0];
  assert.equal(d.product, 91); assert.equal(d.minQuality, 2); assert.equal(d.exact, true);
  near(d.qty, 6);
  const g = plan.purchases[0];
  assert.equal(g.quality, 2); near(g.qtyDay, 6); near(g.costDay, 600000);
});
t('plan: elle fiyat girilmemişse roket borsada satılmaz uyarısı', () => {
  const plan = planOf(pad(6, 0, 'bfr'));
  assert.ok(plan.warnings.some((w) => w.kind === 'price' && /borsada satılmaz/.test(w.text)));
});
t('plan: BFR fırlatma, roket maliyeti ve araştırma geliri', () => {
  const market = { '100:0': 102 };
  const plan = planOf(pad(6, 0, 'bfr'), { prices: { '94:0': 709522 } }, market);
  const pool = plan.pools[0];
  near(pool.producedDay, 1400 * 6);
  const sale = plan.sales[0];
  near(sale.price, 102);
  // roket ve maaş araştırma gelirinden fazla: bugünün fiyatlarında zarar
  assert.ok(plan.totals.profitExchangeDay < 0);
});
t('plan: yüksek kaliteli roket kullanıcı seçmediyse yerine geçmez (ikame yok)', () => {
  const plan = planOf(pad(3, 1, 'sub'), { prices: { '91:1': 90000, '91:3': 1 } });
  assert.equal(plan.purchases[0].quality, 1);
});
t('plan: rampa yeterli seviyede değilse üretim ve talep yok', () => {
  const plan = planOf(pad(2));
  assert.equal(plan.demands.length, 0);
});

console.log(process.exitCode ? 'fırlatma_test: HATA' : `firlatma_test: ${n} test geçti`);
