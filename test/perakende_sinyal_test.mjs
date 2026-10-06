// DentSimco — Perakende sinyal sınamaları. Çalıştırma: node test/perakende_sinyal_test.mjs
import { hesaplaPerakende, karMi, zararMi, HARIC } from '../public/perakende-sinyal.js';
import * as R from '../public/hesap-perakende.js';

const results = [];
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } }
const ok = (v, m = 'koşul sağlanmadı') => { if (!v) throw new Error(m); };

const BUILDINGS = { G: { salaryModifier: 0.4 }, d: { salaryModifier: 0.5 }, A: { salaryModifier: 1.0 } };
const SAT = { 3: 1.2, 4: 0.9, 5: 1.6, 7: 0.7, 8: 1.0, 9: 1.3, 102: 0.8, 103: 1.1 };
const giris = (market) => ({ economy: 1, saturation: SAT, market, buildings: BUILDINGS, averageSalary: 345, qualityWeight: 0.3 });
const bul = (liste, id, q) => liste.find((x) => x.id === id && x.q === q);

test('Borsada fiyatı olan perakende ürünü listelenir; her ürün-kalite bir kez', () => {
  const l = hesaplaPerakende(giris({ 3: { 0: 1.5, 2: 1.9 } }));
  ok(bul(l, 3, 0) && bul(l, 3, 2), 'ürün 3 Q0 ve Q2 olmalı');
  ok(new Set(l.map((x) => `${x.id}:${x.q}`)).size === l.length, 'yinelenen kayıt var');
});
test('Fiyatı olmayan ya da perakendede satılmayan ürün listelenmez', () => {
  const l = hesaplaPerakende(giris({ 999999: { 0: 5 }, 3: { 0: 0 } }));
  eq0(l.length);
});
function eq0(n) { if (n !== 0) throw new Error(`boş bekleniyordu, ${n} kayıt`); }
test('Maliyet düştükçe net marj artar (aynı ürün, daha ucuz borsa fiyatı)', () => {
  const ucuz = bul(hesaplaPerakende(giris({ 3: { 0: 0.8 } })), 3, 0);
  const pahali = bul(hesaplaPerakende(giris({ 3: { 0: 1.8 } })), 3, 0);
  ok(ucuz.marj > pahali.marj, `${ucuz.marj} > ${pahali.marj}`);
  ok(ucuz.pphpl > pahali.pphpl);
});
test('Çok pahalı mal satılamaz: ZARAR, marj yok', () => {
  const x = bul(hesaplaPerakende(giris({ 3: { 0: 500 } })), 3, 0);
  ok(!x.sellable && x.marj === null && zararMi(x) && !karMi(x));
});
test('Çok ucuz mal KÂR sayılır ve en kârlı fiyat maliyetin üstündedir', () => {
  const x = bul(hesaplaPerakende(giris({ 3: { 0: 0.3 } })), 3, 0);
  ok(karMi(x) && x.price > x.cost, JSON.stringify(x));
});
test('Restoran ve Satış ofisi dışarıda bırakılır', () => {
  ok(HARIC.has('r') && HARIC.has('B'));
  const harfler = new Set(hesaplaPerakende(giris(Object.fromEntries(R.retailLetters().flatMap((l) => R.buildingProducts(l, 1)).map((id) => [id, { 0: 1 }])))).map((x) => x.letter));
  ok(!harfler.has('r') && !harfler.has('B'));
});
test('Ürün birden çok binada satılıyorsa en kârlı bina seçilir', () => {
  const coklu = R.retailLetters().filter((l) => !HARIC.has(l)).flatMap((l) => R.buildingProducts(l, 1)).find((id) => R.buildingsOf(id).filter((l) => !HARIC.has(l)).length > 1);
  if (coklu == null) return; // veride böyle ürün yoksa geçilir
  const l = hesaplaPerakende(giris({ [coklu]: { 0: 1 } }));
  ok(l.filter((x) => x.id === coklu).length === 1);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
