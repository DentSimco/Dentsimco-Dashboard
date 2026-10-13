// DentSimco — Optimum Seviye gece özeti sınamaları (yapay veri; Firestore'a bağlanmaz)
// Çalıştırma: node sinyal/optimum_test.mjs   (sinyal.yml her çalışmada önce bunu koşar; hata varsa hiçbir şey yazılmaz)

import { optimumOzet, OPT } from './optimum.mjs';
import { seriKur, addDays } from './motor.mjs';

let pass = 0;
let fail = 0;
function ok(cond, name) {
  if (cond) { pass++; return; }
  fail++;
  console.log(`BAŞARISIZ: ${name}`);
}
const yakin = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// 40 günlük yapay pazar: ürün 1 her gün işlem görür (Q0 ve Q3), ürün 2 yalnız çift günlerde (Q0),
// ürün 3 hiç işlem görmez. Fiyat günle artar ki pencere sınırı ölçülebilsin.
const start = '2026-01-01';
const N = 40;
const T = addDays(start, N - 1);
const daily = new Map([[1, new Map()], [2, new Map()], [3, new Map()]]);
for (let i = 0; i < N; i++) {
  const day = addDays(start, i);
  const p = 10 + i; // fiyat
  const u = 100 + 10 * i; // satış adedi
  daily.get(1).set(day, { 0: [p, p, p, p, 5, u, p * u], 3: [2 * p, 2 * p, 2 * p, 2 * p, 1, 10, 2 * p * 10] });
  if (i % 2 === 0) daily.get(2).set(day, { 0: [1, 1, 1, 1, 5, 50, 50] });
  daily.get(3).set(day, { 0: [0, 0, 0, 0, 0, 0, 0] });
}
const S = seriKur({ seed: null, daily, start, end: T });
const doc = optimumOzet(S, { T, ids: [1, 2, 3], simdi: 123, realm: 0 });

// Pencere: son 28 gün (i = 12 … 39)
let tutar = 0;
let adet = 0;
for (let i = N - OPT.pencere; i < N; i++) { tutar += (10 + i) * (100 + 10 * i); adet += 100 + 10 * i; }
ok(doc.n === 28 && doc.gun === T && doc.bas === addDays(start, N - 28), 'pencere son 28 gün');
ok(doc.v === 1 && doc.t === 123 && doc.r === 0, 'belge başlığı');
// Kapsama: 3 ürünün %40'ı = 1 ürün; ürün 1 her gün fiyatlı → 28 gün
ok(doc.k === 28, `kapsama 28 gün (bulunan ${doc.k})`);
ok(yakin(doc.u[1][0][0], Number((tutar / adet).toPrecision(5))), 'VWAP = toplam tutar ÷ toplam adet (pencere içi)');
ok(yakin(doc.u[1][0][1], Number((adet / 28).toPrecision(5))), 'günlük adet = toplam adet ÷ veri günü');
ok(doc.u[1][0][2] === 28, 'işlem günü sayısı');
// Q3: her gün 10 adet, fiyat 2p → VWAP = 2 × pencerenin ortalama fiyatı = 2 × (22 + 49) ÷ 2 = 71
ok(doc.u[1][3][0] === 71 && doc.u[1][3][1] === 10 && doc.u[1][3][2] === 28, 'kaliteler ayrı tutulur (Q3 fiyatı ve adedi)');
ok(doc.u[2][0][2] === 14 && doc.u[2][0][1] === Number((50 * 14 / 28).toPrecision(5)), 'seyrek ürün: işlem günü 14, adet 28 güne bölünür');
ok(!doc.u[3], 'hiç işlem görmeyen ürün belgeye girmez');
ok(Object.values(doc.u).every((qs) => Object.values(qs).every((x) => x.length === 3 && x.every(Number.isFinite))), 'her kayıt [fiyat, adet, gün]');

// Pencere dışı veri sayılmaz: yalnız ilk günlerde işlem gören ürün
const eski = new Map([[1, daily.get(1)], [4, new Map([[start, { 0: [99, 99, 99, 99, 1, 7, 693] }]])]]);
const S2 = seriKur({ seed: null, daily: eski, start, end: T });
ok(!optimumOzet(S2, { T, ids: [1, 4], simdi: 1 }).u[4], 'pencereden önceki işlem sayılmaz');

// Yetersiz veri: pencerede 20 günden az veri günü varsa belge yazılmaz
const kisa = new Map([[1, new Map([...daily.get(1)].slice(-15))]]);
const S3 = seriKur({ seed: null, daily: kisa, start, end: T });
const y = optimumOzet(S3, { T, ids: [1], simdi: 1 });
ok(y.yetersiz === true && y.k === 15, 'yetersiz veri: yetersiz bayrağı ve gün sayısı');

// Geçmiş dosyası + bot: geçmişteki adetler botun ölçeğine çekilir (seriKur), özet o ölçeği kullanır
const seed = { start, n: 30, p: { 7: { 0: [Array.from({ length: 30 }, () => 10), Array.from({ length: 30 }, () => 200)] } } };
const bot = new Map([[7, new Map()]]);
for (let i = 27; i < N; i++) bot.get(7).set(addDays(start, i), { 0: [0, 0, 0, 0, 1, 100, 1000] }); // çakışan 3 günde bot 100, geçmiş 200 der
const S4 = seriKur({ seed, daily: bot, start, end: T });
const d4 = optimumOzet(S4, { T, ids: [7], simdi: 1 });
ok(d4.u[7][0][1] === 100 && d4.u[7][0][0] === 10, 'geçmiş adetleri botun ölçeğine çekilmiş (günde 100), fiyat 10');

console.log(`${pass}/${pass + fail} test geçti`);
if (fail) process.exit(1);
