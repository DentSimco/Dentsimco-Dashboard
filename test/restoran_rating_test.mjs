// DentSimco — Restoran rating tahmini sınamaları. Çalıştırma: node test/restoran_rating_test.mjs
// Model (restoran-rating.js) ölçümlerden kuruldu; burada formülün kendisi ve ölçüm verisiyle uyumu sınanır.

import * as M from '../public/restoran-rating.js';

const results = [];
let group = '';
const section = (name) => { group = name; };
function test(name, fn) {
  try { fn(); results.push({ group, name, ok: true }); } catch (e) { results.push({ group, name, ok: false, error: e.message }); }
}
function near(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} beklenen ${expected} (±${tol}), bulunan ${actual}`);
}
function eq(actual, expected, label = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} beklenen ${JSON.stringify(expected)}, bulunan ${JSON.stringify(actual)}`);
}
function ok(value, label = 'koşul sağlanmadı') { if (!value) throw new Error(label); }

section('Terimler');
test('Kalite puanı q(Q): içbükey, Q0–Q1 eksi, Q2 ≈ 0,2, Q5 ≈ 4,1, Q12 ≈ 4,3; çeşitten ve bonustan bağımsız', () => {
  near(M.kalitePuani(0), -20.3, 0.05); near(M.kalitePuani(1), -5.75, 0.05); near(M.kalitePuani(2), 0.21, 0.02);
  near(M.kalitePuani(5), 4.06, 0.03); near(M.kalitePuani(12), 4.34, 0.03);
  for (let q = 1; q <= 12; q++) ok(M.kalitePuani(q) > M.kalitePuani(q - 1), `artan Q${q}`);
  for (let q = 2; q <= 12; q++) ok(M.kalitePuani(q) - M.kalitePuani(q - 1) < M.kalitePuani(q - 1) - M.kalitePuani(q - 2), `içbükey Q${q}`);
  eq(M.kalitePuani(NaN), null);
});
test('Çeşit puanı 1,5 × N/16: ürün başına +0,09375, toplanan', () => {
  near(M.cesitPuani(16), 1.5, 1e-12); near(M.cesitPuani(9) - M.cesitPuani(8), 0.09375, 1e-12); near(M.cesitPuani(6), 0.5625, 1e-12);
});
test('Lüks çarpanı 1,25, eko 1', () => { eq([M.tipCarpani('eko'), M.tipCarpani('luks'), M.tipCarpani(undefined)], [1, 1.25, 1]); });
test('Geçersiz girdi null döner; hedef 0–10 arasında kalır', () => {
  eq(M.menuRatingi({ puanOrt: NaN, urunSayisi: 6 }), null);
  eq(M.menuRatingi({ puanOrt: 4, urunSayisi: 0 }), null);
  eq(M.menuRatingi({ puanOrt: 4.3, urunSayisi: 16, bonus: 5, tip: 'luks' }), 10);
  eq(M.menuRatingi({ puanOrt: -20, urunSayisi: 6 }), 0);
});
test('Hedef = (puan + çeşit + bonus [+ profesyonel]) × oturma', () => {
  near(M.menuRatingi({ puanOrt: 4, urunSayisi: 6, bonus: 1 }), 4 + 0.5625 + 1, 1e-12);
  near(M.menuRatingi({ puanOrt: 4, urunSayisi: 6, bonus: 1, tip: 'luks' }), (4 + 0.5625 + 1) * 1.25, 1e-12);
  near(M.menuRatingi({ puanOrt: 2, urunSayisi: 6, bonus: 1, tip: 'luks', profesyonel: true }), (2 + 0.5625 + 1 + 3.94) * 1.25, 1e-12);
});
test('Aralık: orta ± hata; lüksde hata çarpanla büyür; 0–10 dışına taşmaz', () => {
  const a = M.ratingAraligi({ puanOrt: 4, urunSayisi: 6, bonus: 0.5 });
  near(a.ust - a.alt, 2 * M.MODEL.hata, 1e-9); near((a.alt + a.ust) / 2, a.orta, 1e-9);
  const l = M.ratingAraligi({ puanOrt: 4, urunSayisi: 6, bonus: 0.5, tip: 'luks' });
  near(l.ust - l.alt, 2 * M.MODEL.hata * 1.25, 1e-9);
  eq(M.ratingAraligi({ puanOrt: 4.3, urunSayisi: 16, bonus: 5 }).ust, 10);
});
test('Hedefe yaklaşma: %90 için döngü sayısı (k 0,27)', () => {
  eq(M.yaklasmaDongusu(0.9), 8); // ln(0,1) / ln(0,73)
  eq([M.yaklasmaDongusu(0), M.yaklasmaDongusu(1)], [null, null]);
});

section('Ölçümlerle uyum (modelin dayandığı veriler; hedefler ±0,5–1 içinde)');
const veri = [
  // [ad, ürün kaliteleri, bonus, oturma, gözlenen hedef, tolerans]
  ['Sky Eco (1-1-1, Q6, bonus 1,05)', [6, 6, 6], 1.05, 'eko', 5.6, 0.5],
  ['ANARCHY (2-2-2, Q5–Q10, bonus 0,99)', [7, 10, 7, 9, 7, 5], 0.99, 'eko', 5.88, 0.4],
  ['QUAL eko Q5 (bonus 0,83)', [5, 5, 5, 5, 5, 5], 0.83, 'eko', 5.1, 0.5],
  ['QUAL lüks Q11–12 (bonus 0,83)', [12, 12, 11, 11, 12, 12], 0.83, 'luks', 7.05, 0.6],
  ['Dentium Q2 (bonus 0,14)', [2, 2, 2, 2, 2, 2], 0.14, 'eko', 0.77, 0.6],
  ['QUAL lüks Q4 (bonus 0,83): rating değişmedi', [4, 4, 4, 4, 4, 4], 0.83, 'luks', 6.2, 0.7],
];
for (const [ad, qs, bonus, tip, hedef, tol] of veri) {
  test(ad, () => near(M.menuRatingi({ puanOrt: qs.reduce((t, q) => t + M.kalitePuani(q), 0) / qs.length, urunSayisi: qs.length, bonus, tip }), hedef, tol));
}

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
