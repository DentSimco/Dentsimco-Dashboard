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
test('Menü puanı: Q6\'da ürün ratingi, kaliteyle doğrusal artar (Q0 → Q12 yaklaşık +%25)', () => {
  near(M.menuPuani(6), 5.37, 1e-9);
  near(M.menuPuani(12) / M.menuPuani(0), 1.126 / 0.874, 1e-9);
  near(M.menuPuani(12) - M.menuPuani(6), M.menuPuani(6) - M.menuPuani(0), 1e-9, 'doğrusal');
});
test('Çeşit puanı: 6 ürün 1, ürün başına +0,06', () => {
  eq([M.cesitPuani(6), M.cesitPuani(3) < 1, M.cesitPuani(16) > 1.5], [1, true, true]);
  near(M.cesitPuani(9) - M.cesitPuani(8), 0.06, 1e-12);
});
test('Lüks çarpanı 1,25, eko 1', () => { eq([M.tipCarpani('eko'), M.tipCarpani('luks'), M.tipCarpani(undefined)], [1, 1.25, 1]); });
test('Geçersiz girdi null döner; hedef 0–10 arasında kalır', () => {
  eq(M.hedefRating({ kalite: NaN, urunSayisi: 6 }), null);
  eq(M.hedefRating({ kalite: 7, urunSayisi: 0 }), null);
  eq(M.hedefRating({ kalite: 12, urunSayisi: 16, bonus: 5, tip: 'luks' }), 10);
  ok(M.hedefRating({ kalite: 0, urunSayisi: 1, bonus: 0 }) >= 0);
});
test('Bonus ve lüks formüle göre uygulanır: (M × V + bonus) × L', () => {
  const m = M.menuPuani(7) * M.cesitPuani(6);
  near(M.hedefRating({ kalite: 7, urunSayisi: 6, bonus: 1.1 }), m + 1.1, 1e-9);
  near(M.hedefRating({ kalite: 7, urunSayisi: 6, bonus: 1.1, tip: 'luks' }), (m + 1.1) * 1.25, 1e-9);
});
test('Aralık: orta ± hata; lüksde hata çarpanla büyür; 0–10 dışına taşmaz', () => {
  const a = M.ratingAraligi({ kalite: 7, urunSayisi: 6, bonus: 1.1 });
  near(a.ust - a.alt, 2 * M.MODEL.hata, 1e-9); near((a.alt + a.ust) / 2, a.orta, 1e-9);
  const l = M.ratingAraligi({ kalite: 7, urunSayisi: 6, bonus: 1.1, tip: 'luks' });
  near(l.ust - l.alt, 2 * M.MODEL.hata * 1.25, 1e-9);
  eq(M.ratingAraligi({ kalite: 12, urunSayisi: 16, bonus: 5 }).ust, 10);
});
test('Hedefe yaklaşma: %90 için döngü sayısı', () => {
  eq(M.yaklasmaDongusu(0.9), 11); // ln(0,1) / ln(0,8)
  eq([M.yaklasmaDongusu(0), M.yaklasmaDongusu(1)], [null, null]);
});

section('Ölçümlerle uyum (modelin dayandığı veriler; hedefler ±0,5–1 içinde)');
const veri = [
  // [ad, kalite, ürün sayısı, bonus, gözlenen hedef, tolerans]
  ['17\'li grup 27 Ekim (2-2-2, Q7)', 7, 6, 1.10, 6.6, 0.4],
  ['Sky Eco III (2-2-2, Q7, pahalı ürünler)', 7, 6, 0.95, 6.4, 0.5],
  ['Sky Eco IV (2-2-2, Q10–11)', 10.5, 6, 0.95, 7.1, 0.7],
  ['17 D (3-3-3, Q3, tek adım)', 3, 9, 1.10, 7.3, 1.4],
  ['17 G (6-6-4, Q3): tavana yakın', 3, 16, 1.10, 9.6, 1.4],
];
for (const [ad, kalite, n, bonus, hedef, tol] of veri) {
  test(ad, () => near(M.hedefRating({ kalite, urunSayisi: n, bonus }), hedef, tol));
}
test('Kontrol örnekleri: 2-2-2 Q7 bonus 1,10 → 6,6; 3-3-3 Q7 → 7,6; 1-1-1 Q7 → 5,5', () => {
  near(M.hedefRating({ kalite: 7, urunSayisi: 6, bonus: 1.1 }), 6.6, 0.05);
  near(M.hedefRating({ kalite: 7, urunSayisi: 9, bonus: 1.1 }), 7.6, 0.1);
  near(M.hedefRating({ kalite: 7, urunSayisi: 3, bonus: 1.1 }), 5.6, 0.15);
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
