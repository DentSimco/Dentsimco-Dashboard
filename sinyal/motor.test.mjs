// DentSimco — Sinyal motoru sınamaları (yapay veri; Firestore'a bağlanmaz)
// Çalıştırma: node sinyal/motor.test.mjs   (sinyal.yml her çalışmada önce bunu koşar; hata varsa sinyal yazılmaz)

import { hesapla, seriKur, sezonFazi, addDays, diffDays, sonDeger } from './motor.mjs';

let pass = 0;
let fail = 0;
function ok(cond, name) {
  if (cond) { pass++; return; }
  fail++;
  console.log(`BAŞARISIZ: ${name}`);
}

// 1) Tarih yardımcıları
ok(addDays('2026-12-31', 1) === '2027-01-01', 'yıl geçişi');
ok(diffDays('2026-03-01', '2026-02-27') === 2, 'gün farkı');

// 2) Sezon evreleri
const noel = { tip: 'talep', ag: '12-01', uzun: 20, capa: null, kayma: 0 };
ok(sezonFazi(noel, '2026-11-15').faz === 'once', 'sezon öncesi');
ok(sezonFazi(noel, '2026-12-10').faz === 'sezon', 'sezon içi');
ok(sezonFazi(noel, '2026-12-25').faz === 'sonra', 'sezon sonrası');
ok(sezonFazi(noel, '2026-07-01').faz === 'dis', 'sezon dışı');
const paskalya = { tip: 'talep', ag: '04-01', uzun: 10, capa: 'paskalya', kayma: -4 };
ok(sezonFazi(paskalya, '2027-03-25').faz === 'sezon' && sezonFazi(paskalya, '2027-03-25').b === '2027-03-24', 'paskalya kayması');

// 3) Birleştirme: çakışan günde geçmiş dosyası, sonrasında bot
const seed = { start: '2026-01-01', n: 3, p: { 7: { 0: [[10, 11, 12], [100, 100, 100]] } } };
const daily = new Map([[7, new Map([
  ['2026-01-03', { 0: [0, 0, 0, 0, 5, 50, 650] }], // çakışan gün (bot 13 der, geçmiş 12 der)
  ['2026-01-04', { 0: [0, 0, 0, 0, 5, 50, 700] }], // geçmişten sonra: 700 / 50 = 14
])]]);
const S = seriKur({ seed, daily, start: '2026-01-01', end: '2026-01-04' });
ok(S.P(7, 0)[2] === 12, 'çakışan günde geçmiş esas');
ok(S.P(7, 0)[3] === 14, 'bot fiyatı = tutar ÷ satış');
ok(sonDeger(S.P(7, 0), 3) === 14 && S.get(S.a, 7, 0)[3] === 5, 'son değer ve arz');

// 4) Uçtan uca: 130 günlük yapay pazar
const start = '2026-01-01';
const N = 130;
const products = {
  900: { id: 900, name: 'Hammadde', inputs: [], baseSalary: 100, perHour: 1000, transport: 1 },
  901: { id: 901, name: 'Pahalanan', inputs: [[900, 1]], baseSalary: 100, perHour: 100, transport: 1 },
  902: { id: 902, name: 'Ucuzlayan', inputs: [[900, 1]], baseSalary: 100, perHour: 100, transport: 1 },
  903: { id: 903, name: 'Yeni ürün', inputs: [[900, 1]], baseSalary: 100, perHour: 100, transport: 1 },
  13: { id: 13, name: 'Taşıma', inputs: [], baseSalary: 1, perHour: 1, transport: 0 },
};
const wave = (i, k) => 1 + 0.01 * Math.sin(i / 3 + k);
const yapay = new Map();
for (const id of [900, 901, 902, 903, 13]) yapay.set(id, new Map());
for (let i = 0; i < N; i++) {
  const day = addDays(start, i);
  const ham = 10 * wave(i, 1);
  const maliyet = ham + 2 * 1; // girdi + λ×(maaş ÷ saatlik üretim)
  let p901 = maliyet * 1.05 * wave(i, 2);
  let p902 = maliyet * 1.05 * wave(i, 3);
  if (i === N - 1) { p901 *= 1.12; p902 *= 0.88; } // son gün: biri sıçrar, biri çöker
  const put = (id, p) => yapay.get(id).set(day, { 0: [p, p, p, p, 100, 1000, p * 1000] });
  put(900, ham);
  put(901, p901);
  put(902, p902);
  put(13, 0.3);
  if (i >= N - 20) put(903, maliyet * 1.05);
}
const girdi = (modifiers) => ({
  realm: 0, simdi: Date.parse(`${addDays(start, N)}T01:20:00Z`), products, ids: [13, 900, 901, 902, 903],
  modifiers, phase: null, seed: null, daily: yapay, mevsimHazir: {}, gecmisDocs: new Map(), karneDoc: null,
});
const olay = { resourceProductionModifiers: [{ id: 1, kind: 902, speedModifier: 25, since: `${addDays(start, N - 5)}T00:00:00Z`, until: `${addDays(start, N + 15)}T00:00:00Z` }] };
const res = hesapla(girdi(olay));
const resYok = hesapla(girdi(null));
const u = res.sinyal.urun;
ok(res.T === addDays(start, N - 1), 'son tam gün');
ok(u[901]?.[0]?.e < 0 && u[901][0].s[0] === 'HSAT' && u[901][0].a[0] === 'BEKLE', 'normalinin üstüne sıçrayan: hemen sat / alımı ertele');
ok(u[902]?.[0]?.e > 0 && u[902][0].s[0] === 'TUT', 'normalinin altına düşen: tut');
ok(u[902][0].o?.[0]?.[3] === 'kendi' && resYok.sinyal.urun[902][0].s[0] === 'TUT' && u[902][0].s[1] === Math.max(1, resYok.sinyal.urun[902][0].s[1] - 1), 'kendi hız artışı olayı TUT gücünü bir kademe düşürür');
ok(u[901][0].r.includes('p+3') && u[902][0].r.includes('p-3'), 'gerekçe kodları');
ok(!u[903], 'yetersiz geçmişte sinyal yok');
ok(Number.isInteger(u[901][0].e) && u[901][0].e7 === undefined, 'yalnız yuvarlanmış 14 günlük beklenti yayınlanır');
ok(res.gecmis.items[901]?.[0]?.length === 2, 'karne için günlük kayıt');
ok(typeof res.sinyal.makro.m7 === 'number', 'piyasa endeksi hesaplandı');

// 5) Karne: 14 gün önceki kayıt değerlendirilir
const gecmisDocs = new Map([[addDays(res.T, -14), { d: addDays(res.T, -14), items: { 900: { 0: [-10, 20] } } }]]);
const res2 = hesapla({
  realm: 0, simdi: Date.parse(`${addDays(start, N)}T01:20:00Z`), products, ids: [13, 900, 901, 902, 903],
  modifiers: null, phase: null, seed: null, daily: yapay, mevsimHazir: {}, gecmisDocs, karneDoc: null,
});
const b1 = res2.karne.gunler[addDays(res.T, -14)]?.b1;
ok(b1 && b1[0] === 1 && b1[1] === 0, 'karne: ≤ −%4 beklentisi sonrası fiyat düştü');

console.log(`${pass}/${pass + fail} test geçti`);
if (fail) process.exit(1);
