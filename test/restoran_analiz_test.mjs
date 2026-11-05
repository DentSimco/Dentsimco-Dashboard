// DentSimco — Restoran › Analiz sınamaları (Rating, Maliyet). Çalıştırma: node test/restoran_analiz_test.mjs
// restoran-analiz.js: Rating eğrisi (ürün seçimi yok, yalnız rating) ve Maliyet tablosu.

import * as A from '../public/restoran-analiz.js';
import * as R from '../public/hesap-restoran.js';
import * as RR from '../public/restoran-rating.js';

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

// Her ürünün Q0 fiyatı 7200 ÷ oran'ın %90'ı; kaliteyle %8 artar
const marketOf = (id, q) => (7200 / R.URUNLER[id].oran) * 0.9 * (1 + 0.08 * q);

section('Rating');
test('Kalite puanı: Q0 ≈ 0,4, Q5 ≈ 4,9, Q12 ≈ 6,1; artan ve içbükey', () => {
  near(RR.kalitePuani(0), 0.4, 0.01); near(RR.kalitePuani(5), 4.92, 0.03); near(RR.kalitePuani(12), 6.11, 0.03);
  for (let q = 2; q <= 12; q++) ok(RR.kalitePuani(q) - RR.kalitePuani(q - 1) < RR.kalitePuani(q - 1) - RR.kalitePuani(q - 2), `içbükey Q${q}`);
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
  ok(h.includes('>0,4<') && h.includes('>6,1<') && h.includes('>Q12<'));
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
