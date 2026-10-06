// DentSimco — sinyal kartı gösterim sınamaları. Çalıştırma: node test/sinyal_test.mjs
import { signalCard } from '../public/sinyal.js';

const results = [];
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } }
const ok = (v, m = 'koşul sağlanmadı') => { if (!v) throw new Error(m); };

const doc = { t: Date.now(), gun: '2026-10-05', makro: {}, urun: { 5: { 10: { s: ['TUT', 3], a: ['AL', 2], m: 75, e: 20, u: 5, t: 1 }, 0: { s: ['SAT', 0], a: ['AL', 0], m: 1 } } } };
const products = { 5: { id: 5, name: 'Üzüm' } };
const kart = (o = {}) => signalCard(doc, { id: 5, q: 10, products, realm: 0, ...o });

test('Üç çubuklu sinyal data-guc="3" taşır; orta ve normal taşımaz', () => {
  const h = kart();
  ok(/data-yon="up" data-guc="3"/.test(h), 'TUT güçlü rolü işaretli olmalı');
  ok(/data-yon="" data-guc="2"/.test(h), 'AL orta rolü guc=2');
  ok(!/data-guc="3"[^>]*>[\s\S]*data-guc="3"/.test(h), 'yalnız bir güçlü rol var');
});
test('Çerçeve renkleri (data-yon) değişmedi: yanıp sönme yalnız zemini etkiler', () => {
  const h = kart();
  ok((h.match(/data-yon="up"/g) || []).length >= 2);
});
test('Kalitesiz üründe başlıkta Q etiketi yok; kaliteli üründe var', () => {
  ok(!/class="qtag"/.test(kart({ noQuality: true, q: 0 })), 'Q etiketi olmamalı');
  ok(/class="qtag">Q10</.test(kart()), 'Q10 etiketi olmalı');
});
test('Kalite etiketi yokken "sinyal olan kaliteler" önerisi gösterilmez', () => {
  const h = signalCard(doc, { id: 5, q: 7, products, noQuality: true });
  ok(!/sinyal olan kaliteler/.test(h));
  const k = signalCard(doc, { id: 5, q: 7, products });
  ok(/sinyal olan kaliteler/.test(k));
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
