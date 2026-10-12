// DentSimco — Sinyal motoru sınamaları (yapay veri; Firestore'a bağlanmaz)
// Çalıştırma: node sinyal/motor_test.mjs   (sinyal.yml her çalışmada önce bunu koşar; hata varsa sinyal yazılmaz)

import { SINYALSIZ, hesapla, seriKur, sezonFazi, addDays, diffDays, sonDeger, likitMi, canliHaritasi, titresimOnle, titresimUygula, gunIciOlay, main } from './motor.mjs';

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


// 6) Gece bayrağı (likit): son 7 günde ≥5 işlem günü ve günlük ortalama ≥200 birim
{
  const on = (x) => Array.from({ length: 10 }, () => x);
  const seedL = {
    start: '2026-01-01', n: 10,
    p: {
      1: { 0: [on(10), on(300)] }, // her gün işlem, 300 birim
      2: { 0: [on(10), on(100)] }, // az hacim
      3: { 0: [[10, 10, 10, 10, 10, 10, 10, 10, 10, 10].map((v, i) => (i >= 3 && i <= 6 ? null : v)), on(1000)] }, // son 7 günün yalnız 3'ünde fiyat
      4: { 0: [[10, 10, 10, 10, 10, 10, 10, 10, 10, 10].map((v, i) => (i === 3 || i === 5 ? null : v)), on(250)] }, // son 7 günün 5'inde fiyat
    },
  };
  const SL = seriKur({ seed: seedL, daily: new Map(), start: '2026-01-01', end: '2026-01-10' });
  ok(likitMi(SL, 1, 0, 9) === true, 'likit: her gün işlem, günde 300 birim');
  ok(likitMi(SL, 2, 0, 9) === false, 'likit değil: günde 100 birim');
  ok(likitMi(SL, 3, 0, 9) === false, 'likit değil: 7 günde 3 işlem günü');
  ok(likitMi(SL, 4, 0, 9) === true, 'likit: tam 5 işlem günü, günde 250 birim (sınır dahil)');
  ok(likitMi(SL, 9, 0, 9) === false, 'serisi olmayan ürün likit değil');
}

// 7) Canlı belge → harita: yalnız fiyatı ve son işlem zamanı olanlar; eski belge boş
{
  const simdi = Date.parse('2026-10-07T12:00:00Z');
  const doc = { t: simdi - 5 * 60_000, items: { 5: [simdi, { 0: [10.5, null, 3, 30, simdi - 60_000], 1: [11, null, 0, 0, null] }] } };
  const h = canliHaritasi(doc, simdi);
  ok(h.get('5:0')?.[0] === 10.5 && h.get('5:0')[1] === simdi - 60_000, 'canlı fiyat ve son işlem zamanı okunur');
  ok(!h.has('5:1'), 'son işlem zamanı olmayan kayıt alınmaz');
  ok(canliHaritasi({ ...doc, t: simdi - 3_600_000 }, simdi).size === 0, 'canlı belge 45 dakikadan eskiyse gün içi hesap yapılmaz');
}

// 8) Hesap fiyatı, likit bayrağı ve gün içi mod
{
  const simdi = Date.parse(`${addDays(start, N)}T01:20:00Z`);
  const gece = hesapla(girdi(null)).sinyal.urun;
  ok(gece[901][0].p > 0 && gece[901][0].l === 1 && gece[901][0].g === undefined, 'gece kaydı: hesap fiyatı ve likit bayrağı var, gün içi işareti yok');
  ok(Math.abs(gece[901][0].p - yapay.get(901).get(addDays(start, N - 1))[0][0]) < 1e-3, 'gece hesap fiyatı son günün VWAP\'ı');
  ok(hesapla({ ...girdi(null), tn: 123 }).sinyal.tn === 123 && hesapla(girdi(null)).sinyal.tn === simdi, 'tn: gece hesabının zamanı');

  // 901: son gün %12 sıçradı. Canlı fiyat sıçramadan önceki düzeyde ve taze → gün içi hesap canlı fiyatı kullanır.
  const canliFiyat = Math.round((gece[901][0].p / 1.12) * 100) / 100;
  const taze = new Map([['901:0', [canliFiyat, simdi - 3_600_000]]]);
  const gun = hesapla({ ...girdi(null), canli: taze });
  const g = gun.sinyal.urun[901][0];
  ok(g.g === 1 && g.p === canliFiyat, 'likit ve taze: canlı fiyatla hesaplanır (g=1, p=canlı fiyat)');
  ok(g.e > gece[901][0].e, 'sıçrama canlıda yok: beklenti geceki hesaptan yüksek');
  ok(gun.canliSayi === 1, 'gün içi hesaplanan kayıt sayısı');
  ok(gun.sinyal.urun[902][0].g === undefined && gun.sinyal.urun[902][0].p === gece[902][0].p, 'canlı fiyatı olmayan ürün geceki hesapla aynı');

  // Bayat: son işlem 7 saat önce → canlı fiyat kullanılmaz
  const bayat = hesapla({ ...girdi(null), canli: new Map([['901:0', [canliFiyat, simdi - 7 * 3_600_000]]]) }).sinyal.urun[901][0];
  ok(bayat.g === undefined && bayat.p === gece[901][0].p && bayat.e === gece[901][0].e, 'son işlem 6 saatten eskiyse gece hesabı korunur');

  // Likit olmayan: günde 10 birim işlem gören ürün gün içi moda girmez
  const yapay2 = new Map(yapay);
  yapay2.set(904, new Map());
  for (let i = 0; i < N; i++) {
    const ham = 10 * wave(i, 1);
    const p = (ham + 2) * 1.05 * wave(i, 4);
    yapay2.get(904).set(addDays(start, i), { 0: [p, p, p, p, 100, 10, p * 10] });
  }
  const products2 = { ...products, 904: { id: 904, name: 'İnce', inputs: [[900, 1]], baseSalary: 100, perHour: 100, transport: 1 } };
  const ince = hesapla({ ...girdi(null), products: products2, ids: [13, 900, 901, 902, 903, 904], daily: yapay2, canli: new Map([['904:0', [12, simdi - 600_000]]]) }).sinyal.urun[904]?.[0];
  ok(ince && ince.l === 0 && ince.g === undefined && ince.p !== 12, 'günde 10 birim: likit değil, taze olsa da gün içi moda girmez');
}

// 9) Titreşim önleme: yön değişimi iki ardışık çalışmada aynı çıkınca geçer
{
  const eski = { e: 10, s: ['TUT', 1], a: ['AL', 1], p: 100, l: 1 };
  const ters = { e: -12, s: ['HSAT', 2], a: ['BEKLE', 2], p: 98, l: 1, g: 1 };
  const t1 = titresimOnle(ters, eski);
  ok(t1.s[0] === 'TUT' && t1.e === 10 && t1.p === 100 && t1.b?.[0] === 'HSAT' && t1.b[1] === 'BEKLE', 'ilk ters yön: eski sinyal aynen kalır, bekleyen yön işaretlenir');
  const t2 = titresimOnle(ters, t1);
  ok(t2 === ters && !t2.b, 'ikinci ardışık çalışmada aynı yön: değişim geçer');
  const t3 = titresimOnle({ ...ters, s: ['SAT', 0], a: ['AL', 0] }, t1);
  ok(t3.s[0] === 'TUT' && t3.b[0] === 'SAT', 'ikinci çalışmada başka bir yön çıkarsa yine korunur');
  const ayni = { e: 15, s: ['TUT', 3], a: ['AL', 1], p: 101, l: 1, g: 1 };
  ok(titresimOnle(ayni, eski) === ayni, 'yön aynı (yalnız güç ve beklenti değişti): hemen geçer');
  ok(titresimOnle({ ...ters, g: undefined }, eski).s[0] === 'HSAT', 'gece kaydı titreşim önlemeden geçmez');
  ok(titresimOnle(ters, { s: ['TUT', 1], a: ['AL', 1] }) === ters, 'önceki kayıtta hesap fiyatı yoksa (eski şema) hemen geçer');
  const urun = { 5: { 0: ters, 1: ayni } };
  const n = titresimUygula(urun, { 5: { 0: eski, 1: eski } });
  ok(n === 1 && urun[5][0].s[0] === 'TUT' && urun[5][1] === ayni, 'toplu uygulama: yalnız yön değişen kayıt bekletilir');
}

// 10) Uçtan uca: gece çalışması, sonra iki gün içi çalışma (sahte Firestore)
{
  const sessiz = console.log;
  console.log = () => {};
  const simdi0 = Date.parse(`${addDays(start, N)}T01:20:00Z`);
  const store = new Map();
  store.set('meta/tradable', { data: JSON.stringify({ 0: [13, 900, 901, 902, 903], 1: [] }) });
  store.set('meta/products_r0', { data: JSON.stringify(products) });
  const yillar = new Map();
  for (const [id, days] of yapay) {
    for (const [day, qs] of days) {
      const key = `daily/r0_${id}_${day.slice(0, 4)}`;
      const f = yillar.get(key) || {};
      f[`d${day.slice(5, 7)}${day.slice(8, 10)}`] = JSON.stringify(qs);
      yillar.set(key, f);
    }
  }
  for (const [k, v] of yillar) store.set(k, v);
  const sahteDb = () => ({
    yazilan: [],
    async getMany(paths) { const m = new Map(); for (const p of paths) if (store.has(p)) m.set(p, store.get(p)); return m; },
    async commit(w) { this.yazilan.push(...w); },
  });
  const uygula = (db) => { for (const w of db.yazilan) store.set(w.path, w.data); };
  const sinyalOku = () => JSON.parse(store.get('meta/sinyal_r0').data);

  const d0 = sahteDb();
  await main({ db: d0, simdi: simdi0, mod: 'gece', seedYukle: async () => null });
  uygula(d0);
  const gece = sinyalOku();
  ok(d0.yazilan.some((w) => w.path === 'meta/sinyal_karne_r0') && d0.yazilan.some((w) => w.path === 'meta/olaylar_r0'), 'gece çalışması karne ve arşivi de yazar');
  ok(gece.tn === simdi0 && gece.urun[901][0].s[0] === 'HSAT', 'gece: tn yazıldı, sıçrayan ürün SAT (hemen sat)');

  const canliFiyat = Math.round((gece.urun[901][0].p / 1.12) * 100) / 100;
  const simdi1 = simdi0 + 2 * 3_600_000;
  const canliDoc = (t) => ({ data: JSON.stringify({ v: 4, t, items: { 901: [t, { 0: [canliFiyat, null, 0, 0, t - 1_800_000] }] } }) });

  store.set('live/r0', canliDoc(simdi1 - 60_000));
  const d1 = sahteDb();
  await main({ db: d1, simdi: simdi1, mod: 'gunici', seedYukle: async () => null });
  const yollar = d1.yazilan.map((w) => w.path).sort();
  ok(yollar.length === 2 && yollar[0] === 'meta/sinyal_r0' && yollar[1].startsWith('meta/sinyalgecmisgi_r0_'), 'gün içi çalışma sinyal belgesini ve gün içi karne kaydını yazar (karne ve arşive dokunmaz)');
  const giKayit = d1.yazilan.find((w) => w.path.startsWith('meta/sinyalgecmisgi_r0_'));
  ok(giKayit.type === 'merge' && /^s\d\d$/.test(Object.keys(giKayit.data).find((k) => k !== 'u')), 'gün içi karne: saat alanı birleştirilerek yazılır');
  uygula(d1);
  const g1 = sinyalOku();
  // 901 gece sıçradı (SAT, düşüş hedefi). Canlı fiyat sıçrama öncesine döndü: hedefe ulaşıldı → beklemeden yenilenir
  ok(gece.urun[901][0].h?.[1] === -1 && g1.urun[901][0].v?.[0] === 'hd-' && g1.urun[901][0].b === undefined && g1.urun[901][0].s[0] !== 'HSAT', 'düşüş hedefine ulaşıldı: sinyal titreşim beklemesi olmadan yenilendi');
  ok(g1.urun[901][0].r[0] === 'hd-', 'olay gerekçe listesinin başında');
  ok(g1.tn === simdi0 && g1.t === simdi1, 'gün içi çalışma gece hesabının zamanını (tn) korur');

  const simdi2 = simdi1 + 2 * 3_600_000;
  store.set('live/r0', canliDoc(simdi2 - 60_000));
  const d2 = sahteDb();
  await main({ db: d2, simdi: simdi2, mod: 'gunici', seedYukle: async () => null });
  uygula(d2);
  const g2 = sinyalOku();
  ok(g2.urun[901][0].g === 1 && g2.urun[901][0].s[0] !== 'HSAT' && g2.urun[901][0].b === undefined && g2.urun[901][0].p === canliFiyat, 'ikinci çalışma: yenilenen sinyal sürer, canlı fiyat hesap fiyatı');
  ok(g2.urun[901][0].v?.[0] === 'hd-' && g2.urun[901][0].v[1] === g1.urun[901][0].v[1], 'olay etiketi sonraki saatte de kalır (yeniden üretilmez)');

  // Canlı belge eskiyse hiçbir şey yazılmaz
  store.set('live/r0', canliDoc(simdi2 - 3_600_000));
  const d3 = sahteDb();
  await main({ db: d3, simdi: simdi2, mod: 'gunici', seedYukle: async () => null });
  ok(d3.yazilan.length === 0, 'canlı belge eskiyse gün içi çalışma yazmaz');

  // Gece hesabı hiç yapılmadıysa gün içi çalışma yazmaz
  store.delete('meta/sinyal_r0');
  store.set('live/r0', canliDoc(simdi2 - 60_000));
  const d4 = sahteDb();
  await main({ db: d4, simdi: simdi2, mod: 'gunici', seedYukle: async () => null });
  ok(d4.yazilan.length === 0, 'önceki sinyal belgesi yoksa gün içi çalışma yazmaz');
  console.log = sessiz;
}

// 11) Gün içi olaylar
{
  const simdi = 1_000_000_000;
  const hi = Math.log(110), lo = Math.log(90);
  ok(gunIciOlay({ p: 121, once: { h: [120, 1] }, hi, lo, nn: 20, simdi }) === 'hd+', 'yükseliş hedefine ulaşıldı');
  ok(gunIciOlay({ p: 80, once: { h: [85, -1] }, hi, lo, nn: 20, simdi }) === 'hd-', 'düşüş hedefine ulaşıldı');
  ok(gunIciOlay({ p: 112, once: { h: [120, 1] }, hi, lo, nn: 20, simdi }) === 'ky', 'hedef yok ama 20 günlük tepe %1+ aşıldı: yukarı kırılım');
  ok(gunIciOlay({ p: 110.5, once: {}, hi, lo, nn: 20, simdi }) === null, 'tepenin %1 içi kırılım sayılmaz');
  ok(gunIciOlay({ p: 88, once: {}, hi, lo, nn: 20, simdi }) === 'ka', '20 günlük dip %1+ kırıldı: yeni dip');
  ok(gunIciOlay({ p: 88, once: { v: ['ka', simdi - 3_600_000] }, hi, lo, nn: 20, simdi }) === null, 'aynı kırılım 12 saat içinde tekrar üretilmez');
  ok(gunIciOlay({ p: 88, once: { v: ['ka', simdi - 13 * 3_600_000] }, hi, lo, nn: 20, simdi }) === 'ka', '12 saat sonra yeni dip yeniden olay olur');
  ok(gunIciOlay({ p: 88, once: {}, hi, lo, nn: 5, simdi }) === null, 'yeterli geçmiş yoksa kırılım yok');
  const t = titresimOnle({ e: 10, s: ['TUT', 3], a: ['STOKLA', 2], p: 100, g: 1, v: ['ky', simdi] }, { e: -10, s: ['HSAT', 3], a: ['BEKLE', 3], p: 95, v: ['ka', simdi - 1] });
  ok(t.s[0] === 'TUT', 'yeni olay titreşim beklemesini atlar');
  const t2 = titresimOnle({ e: 10, s: ['TUT', 3], a: ['STOKLA', 2], p: 100, g: 1, v: ['ka', 5] }, { e: -10, s: ['HSAT', 3], a: ['BEKLE', 3], p: 95, v: ['ka', 5] });
  ok(t2.s[0] === 'HSAT', 'taşınan (eski) olay beklemeyi atlatmaz');
}

// 12) Zayıf yükseliş (+%2…+%4) nötr; gece hedefi
{
  const gece = hesapla(girdi(null)).sinyal.urun;
  let zayif = 0, yanlis = 0;
  for (const qs of Object.values(gece)) for (const e of Object.values(qs)) {
    if (e.e == null) continue;
    const o = e.e / 200;
    if (o >= 0.02 && o < 0.04) { zayif++; if (e.s[0] !== 'SAT' || e.a[0] !== 'AL' || e.s[1] || e.a[1]) yanlis++; }
    if (Math.abs(o) >= 0.02 && !e.h) yanlis++;
    if (Math.abs(o) < 0.02 && e.h) yanlis++;
  }
  ok(yanlis === 0, `zayıf yükseliş nötr ve hedef yalnız |beklenti| ≥ %2'de (${zayif} zayıf kayıt)`);
}

// 13) Karne: kaçan gece sonraki gece değerlendirilir; gün içi karne
{
  const T = addDays(start, N - 1);
  const d15 = addDays(T, -15); // bir gece kaçtı: bu kayıt 15 gün önceden
  const gecmisDocs = new Map([[d15, { d: d15, items: { 900: { 0: [-10, 20] } } }]]);
  const gecmisGiDocs = new Map([[d15, { saat: { s10: { 900: { 0: [10, 5] } }, s11: { 900: { 0: [10, 5] } } } }]]);
  const r = hesapla({ ...girdi(null), gecmisDocs, gecmisGiDocs });
  ok(r.karne.gunler[d15]?.b1?.[0] === 1, 'kaçan gecenin kaydı sonraki gece değerlendirildi');
  ok(r.karne.gunici[d15]?.b5?.[0] === 2 && r.karne.gunici[d15].b5[1] === 2, 'gün içi karne: her saatin kaydı sayılır (fiyat 5 → ~10, yükseldi)');
  ok(r.sinyal.karne.gunici?.b5?.[0] === 2, 'gün içi karne özeti yayında');
  const r2 = hesapla({ ...girdi(null), gecmisDocs, karneDoc: { gunler: { [d15]: { b1: [9, 9, 9] } } } });
  ok(r2.karne.gunler[d15].b1[0] === 9, 'karnede olan gün yeniden sayılmaz');
}

// 5) Sinyal verilmeyen çiftler: Enerji Q12, Su Q12, Tohum Q12 hiçbir zaman üretilmez; aynı ürünlerin diğer kaliteleri üretilir
{
  const ids = [1, 2, 66];
  const prod = { ...products };
  const piyasa = new Map(yapay);
  for (const id of ids) {
    prod[id] = { id, name: `Ürün ${id}`, inputs: [[900, 1]], baseSalary: 100, perHour: 100, transport: 1 };
    const g = new Map();
    for (let i = 0; i < N; i++) {
      const day = addDays(start, i);
      const p = (10 * wave(i, 1) + 2) * 1.05 * wave(i, id);
      const row = [p, p, p, p, 100, 1000, p * 1000];
      g.set(day, { 0: row, 12: row });
    }
    piyasa.set(id, g);
  }
  const r = hesapla({ ...girdi(null), products: prod, ids: [13, 900, 901, 902, 903, ...ids], daily: piyasa });
  for (const id of ids) {
    ok(r.sinyal.urun[id]?.[0], `ürün ${id} Q0 için sinyal üretilir`);
    ok(r.sinyal.urun[id]?.[12] === undefined, `ürün ${id} Q12 için sinyal üretilmez`);
    ok(r.gecmis.items[id]?.[12] === undefined, `ürün ${id} Q12 karneye girmez`);
  }
  ok(SINYALSIZ.size === 3 && SINYALSIZ.has('1:12') && SINYALSIZ.has('2:12') && SINYALSIZ.has('66:12'), 'sinyalsiz liste');
}

console.log(`${pass}/${pass + fail} test geçti`);
if (fail) process.exit(1);
