// DentSimco — Restoran › Analiz sınamaları (Rating, Maliyet). Çalıştırma: node test/restoran_analiz_test.mjs
// restoran-analiz.js: Rating eğrisi (ürün seçimi yok, yalnız rating) ve Maliyet tablosu.

import * as A from '../public/restoran-analiz.js';
import * as R from '../public/hesap-restoran.js';
import * as RR from '../public/restoran-rating.js';
import { vwapOf } from './restoran-vwap-veri-ornek.mjs';

const results = [];
let group = '';
const section = (name) => { group = name; };
function test(name, fn) {
  try { fn(); results.push({ group, name, ok: true }); } catch (e) { results.push({ group, name, ok: false, error: e.message }); }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} beklenen ${b}, bulunan ${a}`);
}
function near(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} beklenen ${expected} (±${tol}), bulunan ${actual}`);
}
function ok(value, label = 'koşul sağlanmadı') { if (!value) throw new Error(label); }

// Borsa: 4 Kasım 2026 günlük VWAP'ı (dünkü VWAP, gerçek veri; işlem olmayan kaliteler null)
const marketOf = vwapOf;

section('Rating');
test('Kalite puanı: Q0–Q1 0 (kesik), Q2 ≈ 0,7, Q5 ≈ 4,6, Q12 ≈ 4,9; artan ve içbükey', () => {
  near(RR.kalitePuani(0), 0, 1e-9); near(RR.kalitePuani(2), 0.77, 0.02); near(RR.kalitePuani(4), 4.19, 0.02); near(RR.kalitePuani(5), 4.60, 0.03); near(RR.kalitePuani(12), 4.89, 0.03);
  for (let q = 4; q <= 12; q++) ok(RR.kalitePuani(q) - RR.kalitePuani(q - 1) < RR.kalitePuani(q - 1) - RR.kalitePuani(q - 2), `içbükey Q${q}`);
});
test('Sekmeler: Rating, Maliyet, Menü Seç (Harita yok, Menü Seç Maliyet\'in sağında)', () => {
  eq(A.SEKMELER, [['rating', 'Rating'], ['maliyet', 'Maliyet'], ['menusec', 'Menü Seç'], ['isi', 'Isı Haritası']]);
  for (const k of ['haritaHtml', 'grafikHtml', 'analizTikla', 'analizDegis', 'temizleAnaliz', 'ratingOf']) eq(typeof A[k], 'undefined', k);
});

section('Çizim');
test('Rating: Q0–Q12 eğrisi ve değerleri; ürün seçici, düğme, açıklama, fiyat ve maliyet yok', () => {
  const h = A.ratingHtml();
  ok(h.includes('<h2 id="h-an-rt">Rating</h2>') && h.includes('aria-label="Kaliteye göre rating"'));
  eq((h.match(/<circle/g) || []).length, 13); eq((h.match(/<polyline/g) || []).length, 1);
  ok(h.includes('>0,0<') && h.includes('>4,9<') && h.includes('>Q12<'));
  ok(!/<select|<button|data-an|data-act|\$|Borsa|geçmiş|Yorum|ur-note|ur-sub|<table|Harita|Grafik/i.test(h), 'ürün seçimi, açıklama ya da fiyat görünüyor');
});
test('Maliyet: hücreler düz tutar (düğme yok), mavi en ucuz, çarpan ve oturma düğmeleri', () => {
  const h = A.maliyetHtml({ carpan: 2, tip: 'eko' }, marketOf);
  ok(h.includes('class="low"') && h.includes('data-act="rt.carpan"') && h.includes('data-act="rt.tip"'));
  ok(!h.includes('an.git') && !h.includes('grafiği aç') && !h.includes('an-b'));
  eq((h.match(/<td/g) || []).length, 16 * 13);
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
