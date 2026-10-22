// DentSimco — İndeks dökümü sınamaları (yapay veri; Firestore'a bağlanmaz)
// Çalıştırma: node sinyal/endeks_test.mjs   (sinyal.yml her çalışmada önce bunu koşar; hata varsa hiçbir şey yazılmaz)

import { endeksOzet, ENDEKS } from './endeks.mjs';
import { seriKur, piyasaEndeksi, addDays } from './motor.mjs';

let pass = 0;
let fail = 0;
function ok(cond, name) {
  if (cond) { pass++; return; }
  fail++;
  console.log(`BAŞARISIZ: ${name}`);
}
const yakin = (a, b, tol) => Math.abs(a - b) <= tol;

// 70 günlük yapay pazar (2026-02-02 pazartesi başlar): ürün 1 (Tarla) her gün %1 yükselir, ürün 2 (Fabrika) her gün %0,5 düşer,
// ürün 3 (Fabrika) yatay. Ürün 2 günde 3-6 kat daha çok işlem tutarı taşır.
const start = '2026-02-02';
const N = 70;
const T = addDays(start, N - 1);
const products = { 1: { building: 'P' }, 2: { building: 'Y' }, 3: { building: 'Y' } };
const daily = new Map([[1, new Map()], [2, new Map()], [3, new Map()]]);
for (let i = 0; i < N; i++) {
  const day = addDays(start, i);
  const p1 = 10 * 1.01 ** i, p2 = 20 * 0.995 ** i, p3 = 5;
  daily.get(1).set(day, { 0: [p1, p1, p1, p1, 5, 100, p1 * 100] });
  daily.get(2).set(day, { 0: [p2, p2, p2, p2, 5, 6000 / p2, 6000] });
  daily.get(3).set(day, { 0: [p3, p3, p3, p3, 5, 100, 500] });
}
const S = seriKur({ seed: null, daily, start, end: T });
const ids = [1, 2, 3];
const E = piyasaEndeksi(S, ids, new Set(), T);
const doc = endeksOzet(S, E, {
  T, products, simdi: 7, realm: 0,
  evreler: { a: ['boom', '2026-01-03T00:00:00Z', '2026-01-10T00:00:00Z'], b: ['normal', '2026-03-07T00:00:00Z', '2026-03-14T00:00:00Z'] },
  olaylar: { x: [1, -20, '2026-03-01T00:00:00Z', '2026-03-05T00:00:00Z'], y: [2, 10, '2025-01-01T00:00:00Z', '2025-01-05T00:00:00Z'] },
});

ok(doc.v === 1 && doc.t === 7 && doc.gun === T && doc.n === 3, 'belge başlığı');
ok(doc.bas === start && doc.g.length === N && doc.g[0][2] === null, 'ilk satır seviye tabanı (getiri yok)');
ok(doc.baz[0] === start && doc.baz[1] === ENDEKS.baz && doc.g[0][1] === 1000, 'bazGun pencerede değilse pencere başı = 1000');

// Her gün: katkıların toplamı = günlük getiri; seviye zinciri getiriyle uyumlu
let toplamTutar = true, zincir = true, katkiTutar = true, sektorTutar = true;
for (let i = 1; i < doc.g.length; i++) {
  const [, lv, g, up, down, tutar, arti, eksi, sek] = doc.g[i];
  const kat = [...arti, ...eksi].reduce((s, x) => s + x[2], 0);
  if (!yakin(kat, g, 0.25)) katkiTutar = false;
  if (!yakin(sek.reduce((s, x) => s + x[1], 0), g, 0.25)) sektorTutar = false;
  if (!yakin(lv, doc.g[i - 1][1] * Math.exp(g / 1e4), 0.02)) zincir = false;
  if (up !== 1 || down !== 1) toplamTutar = false;
  if (!(tutar > 2500)) toplamTutar = false;
}
ok(katkiTutar, 'ürün katkılarının toplamı günlük getiriye eşit');
ok(sektorTutar, 'sektör katkılarının toplamı günlük getiriye eşit');
ok(zincir, 'seviye = önceki seviye × e^getiri');
ok(toplamTutar, 'her gün 1 yükselen, 1 düşen; tutar endeksteki ürünlerin toplamı');
const son = doc.g.at(-1);
ok(son[6][0][0] === 1 && yakin(son[6][0][1], Math.log(1.01) * 1e4, 0.1) && son[7][0][0] === 2, 'artılar ve eksiler doğru ürün ve ürün getirisiyle');
ok(son[8][0][0] === 'Y' || son[8][0][0] === 'P', 'sektörler bina harfiyle');
ok(son[1] < 1000, 'ağır ürün düştüğü için endeks düşüyor');

// Haftalar: pazartesi–pazar, haftalık getiri = günlük getirilerin toplamı
ok(doc.h[0][0] === addDays(start, 1) && doc.h[0][1] === addDays(start, 6) && doc.h[0][9] === 6, 'ilk hafta taban gününden sonra başlar, pazara kadar');
ok(doc.h[1][0] === addDays(start, 7) && doc.h[1][1] === addDays(start, 13) && doc.h[1][9] === 7, 'tam hafta pazartesi–pazar, 7 gün');
const h1 = doc.g.filter((r) => r[0] >= doc.h[1][0] && r[0] <= doc.h[1][1]).reduce((s, r) => s + r[2], 0);
ok(yakin(doc.h[1][2], h1, 0.5), 'haftalık getiri = günlük getirilerin toplamı');
ok(doc.h.at(-1)[1] === T, 'son hafta son tam günle biter (sürüyor olabilir)');
ok(doc.h[1][3] === 1 && doc.h[1][4] === 1 && yakin(doc.h[1][6][0][1], 7 * Math.log(1.01) * 1e4, 0.5), 'haftalık ürün getirisi günlerin toplamı');

// Evre ve olay arşivi: pencereye değenler
ok(doc.evre.length === 2 && doc.evre[0][1] === 'boom' && doc.evre[1][1] === 'normal', 'pencereden önce başlayıp süren evre ve pencere içindeki evre');
ok(doc.olay.length === 1 && doc.olay[0][0] === 1 && doc.olay[0][1] === -20, 'pencereden önce biten olay girmez');

// Önceki belgeye bağlama: aynı gün aynı seviyeyi korur
const onceki = { g: [[addDays(start, 10), 1234.5]] };
const doc2 = endeksOzet(S, E, { T, products, simdi: 8, onceki });
ok(doc2.baz[0] === addDays(start, 10) && doc2.g[10][1] === 1234.5, 'önceki belgenin seviyesine bağlanır');
ok(yakin(doc2.g.at(-1)[1] / doc2.g[10][1], son[1] / doc.g[10][1], 1e-4), 'bağlama yalnız ölçeği değiştirir');

// Uzun pencere: bazGun pencerede ise orada 1000
const start3 = '2025-12-01';
const daily3 = new Map([[1, new Map()]]);
for (let i = 0; i < 60; i++) { const d = addDays(start3, i); const p = 10 * 1.002 ** i; daily3.get(1).set(d, { 0: [p, p, p, p, 1, 50, p * 50] }); }
const T3 = addDays(start3, 59);
const S3 = seriKur({ seed: null, daily: daily3, start: start3, end: T3 });
const doc3 = endeksOzet(S3, piyasaEndeksi(S3, [1], new Set(), T3), { T: T3, simdi: 1 });
ok(doc3.baz[0] === ENDEKS.bazGun && doc3.g.find((r) => r[0] === ENDEKS.bazGun)[1] === 1000 && doc3.g[0][1] < 1000, 'bazGun pencerede: o gün 1000');

// Veri yok
const bos = seriKur({ seed: null, daily: new Map(), start, end: T });
ok(endeksOzet(bos, piyasaEndeksi(bos, [1], new Set(), T), { T, simdi: 1 }).yetersiz === true, 'veri yoksa yetersiz');

console.log(`${pass}/${pass + fail} test geçti`);
process.exit(fail ? 1 : 0);
