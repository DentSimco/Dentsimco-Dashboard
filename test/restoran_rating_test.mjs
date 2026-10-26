// DentSimco — restoran tahmini rating formülü yapısı sınamaları. Çalıştırma: node test/restoran_rating_test.mjs
import { tahminiRating, CMO_KATSAYISI, SATIS_HIZI_KATSAYISI } from '../public/restoran-rating.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} beklenen ${b}, bulunan ${a}`);
}
function near(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} beklenen ${expected} (±${tol}), bulunan ${actual}`);
}

test('Katsayılar: CMO 0,01 ve taban satış hızı 0,02', () => { eq([CMO_KATSAYISI, SATIS_HIZI_KATSAYISI], [0.01, 0.02]); });
test('Yapı: (menü × çeşitlilik + CMO + satış hızı) ve lüks yokken çarpan 1', () => {
  const r = tahminiRating({ menuPuani: 4, cesitPuani: 1.5, etkinCmo: 27, tabanSatisHiziPct: 10 });
  near(r.ham, 4 * 1.5 + 0.27 + 0.2, 1e-12);
  eq(r.parcalar.luks, 1);
});
test('Profesyonel personel puanı yalnız profesyonel iken eklenir', () => {
  const taban = { menuPuani: 4, cesitPuani: 1, profesyonelPuani: 0.5 };
  near(tahminiRating(taban).ham, 4, 1e-12, 'profesyonel yok');
  near(tahminiRating({ ...taban, profesyonel: true }).ham, 4.5, 1e-12, 'profesyonel var');
});
test('Lüks çarpanı tüm köşeli parantezi çarpar', () => {
  const r = tahminiRating({ menuPuani: 2, cesitPuani: 2, etkinCmo: 100, tabanSatisHiziPct: 50, luks: true, luksCarpani: 1.5 });
  near(r.ham, (4 + 1 + 1) * 1.5, 1e-12);
});
test('Bilinmeyen terim verilmediyse null (varsayılan uydurulmaz)', () => {
  eq(tahminiRating({}), null);
  eq(tahminiRating({ menuPuani: 4 }), null, 'çeşitlilik yok');
  eq(tahminiRating({ menuPuani: 4, cesitPuani: 1, profesyonel: true }), null, 'profesyonel puanı yok');
  eq(tahminiRating({ menuPuani: 4, cesitPuani: 1, luks: true }), null, 'lüks çarpanı yok');
});
test('Eksik ya da negatif CMO ve satış hızı 0 sayılır; sonuç 0–10 arasına kırpılır, ham değer korunur', () => {
  near(tahminiRating({ menuPuani: 4, cesitPuani: 1, etkinCmo: -5, tabanSatisHiziPct: NaN }).ham, 4, 1e-12);
  const y = tahminiRating({ menuPuani: 20, cesitPuani: 1 });
  eq([y.rating, y.ham], [10, 20]);
  eq(tahminiRating({ menuPuani: -3, cesitPuani: 1 }).rating, 0);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exitCode = failed.length ? 1 : 0;
