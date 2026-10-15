// node test/sirket_gecmis_test.mjs — şirket geçmişi (birleştirme, farklar, grafik) ve izleme listeleri (ağ kullanmaz)
import assert from 'node:assert/strict';
import * as G from '../public/sirket-gecmis.js';
import * as Li from '../public/sirket-liste.js';

// gün = [YYYYMMDD, sıra, eva, değer, bina, patent, işçi, bono, ayrıntıVar]
const gun = (d, extra = {}) => [d, 1, 5, 1000, 10, 20, 300, 40, 1].map((v, i) => (i in extra ? extra[i] : v)).map((v, i) => (i === 0 ? d : v));

// Birleştirme: iki kaynak tarihe göre; aynı günde ayrıntılı olan, eşitse günlük olan geçer
const gunluk = [gun(20261014), gun(20261015, { 3: 2000, 8: 0, 4: null, 5: null, 6: null, 7: null })];
const geri = [gun(20261013), gun(20261014, { 3: 999 }), gun(20261015, { 3: 1500 })];
let b = G.gecmisBirlestir(gunluk, geri);
assert.deepEqual(b.map((x) => x[0]), [20261013, 20261014, 20261015]);
assert.equal(b[1][3], 1000, 'eşit ayrıntıda günlük geçer');
assert.equal(b[2][3], 1500, 'günlüğün ayrıntısı yok, geri doldurmada var → ayrıntılı olan geçer');
assert.deepEqual(G.gecmisBirlestir(null, undefined), []);
// 30 günlük pencere: son tarihten geriye 30 gün (Eylül 30 gün çeker)
const otuzbes = [];
for (let i = 0; i < 35; i++) otuzbes.push(gun(i < 30 ? 20260901 + i : 20261001 + (i - 30)));
const pencere = G.gecmisBirlestir(otuzbes, []);
assert.equal(pencere.length, G.GUN_SAYISI, '35 gün verilince son 30 gün kalır');
assert.equal(pencere[0][0], 20260906);
assert.equal(pencere.at(-1)[0], 20261005);

// Ölçütler
const M = Object.fromEntries(G.METRIKLER.map((m) => [m.key, m]));
assert.equal(G.metrikDegeri(M.workers, gun(20261015)), 3, 'işçi ÷ 100');
assert.equal(G.metrikDegeri(M.eva, gun(20261015, { 2: 0 })), null, 'EVA 0 = yok');
assert.equal(G.metrikDegeri(M.buildings, gun(20261015, { 4: null })), null);
assert.equal(G.metrikDegeri(M.value, gun(20261015)), 1000);

// Farklar
const f = G.gunFarklari([gun(20261013, { 1: 3, 2: 10, 3: 1000 }), gun(20261014, { 1: 2, 2: 8, 3: 1100 })]);
assert.equal(f[0].degerFark, null, 'ilk günde fark yok');
assert.equal(f[1].degerFark, 100);
assert.ok(Math.abs(f[1].degerYuzde - 0.1) < 1e-9);
assert.equal(f[1].siraFark, 1, 'sıra 3 → 2: +1 iyileşme');
assert.equal(f[1].evaFark, 2, 'EVA 10 → 8: +2 iyileşme');

// Yüzde noktaları
assert.deepEqual(G.yuzdeNoktalari([[1, 100], [2, 110], [3, null], [4, 90]]), [[1, 0], [2, 10], [3, null], [4, -10]]);
assert.deepEqual(G.yuzdeNoktalari([[1, null], [2, null]]), [[1, null], [2, null]]);

// Grafik
const svg = G.cizgiGrafik([{ ad: 'A', noktalar: [[20261013, 100], [20261014, null], [20261015, 120]] }], { doldur: true, ad: 'deneme' });
assert.ok(svg.startsWith('<svg') && svg.includes('role="img"') && svg.includes('aria-label="deneme"'));
assert.equal((svg.match(/class="sg-line"/g) || []).length, 1);
assert.ok((svg.match(/ M/g) || []).length >= 1, 'boşluk (null) çizgiyi böler');
assert.ok(G.cizgiGrafik([{ ad: 'A', noktalar: [[20261013, null]] }]).includes('yeterli veri yok'));
assert.ok(G.cizgiGrafik([{ ad: 'A', noktalar: [[20261013, 5]] }]).includes('<svg'), 'tek nokta çizilir');
const tersSvg = G.cizgiGrafik([{ ad: 'A', noktalar: [[20261013, 1], [20261014, 9]] }], { ters: true });
const yler = [...tersSvg.matchAll(/d="M([\d.]+),([\d.]+) L([\d.]+),([\d.]+)"/g)][0];
assert.ok(Number(yler[2]) < Number(yler[4]), 'ters eksen: küçük değer (iyi sıra) yukarıda');

// ---- İzleme listeleri ----
let d = Li.duzenle(null);
assert.deepEqual(d, { v: 1, aktif: null, listeler: [] });
d = Li.olustur(d, '  Rakipler  ');
assert.equal(d.listeler[0].ad, 'Rakipler');
assert.equal(d.aktif, d.listeler[0].id);
const id1 = d.listeler[0].id;
d = Li.ekle(d, id1, 1664165);
d = Li.ekle(d, id1, '1664165');
d = Li.ekle(d, id1, 7);
d = Li.ekle(d, id1, 'x');
assert.deepEqual(d.listeler[0].idler, [1664165, 7], 'aynı şirket bir kez; bozuk numara atılır');
assert.ok(Li.listedeMi(Li.aktifListe(d), 7));
d = Li.cikar(d, id1, 7);
assert.deepEqual(d.listeler[0].idler, [1664165]);
d = Li.adlandir(d, id1, 'Dostlar');
assert.equal(Li.aktifListe(d).ad, 'Dostlar');
d = Li.olustur(d, 'İkinci');
assert.equal(d.listeler.length, 2);
const id2 = d.aktif;
assert.equal(Li.sec(d, 'yok').aktif, id2, 'olmayan liste seçilmez');
d = Li.sil(d, id2);
assert.equal(d.aktif, id1, 'aktif liste silinince ilk liste aktif olur');
assert.equal(Li.olustur(d, '   ').listeler.length, 1, 'boş ad kabul edilmez');
// Sınırlar ve bozuk kayıt
let dolu = Li.duzenle(null);
for (let i = 0; i < Li.LISTE_MAX + 3; i++) dolu = Li.olustur(dolu, `L${i}`);
assert.equal(dolu.listeler.length, Li.LISTE_MAX, 'en çok 20 liste');
const bozuk = Li.duzenle({ aktif: 'yok', listeler: [{ id: 'a', ad: 'A', idler: [1, 1, -2, 'z', 3] }, { id: 'a', ad: 'Tekrar', idler: [] }, { id: 'b', ad: '', idler: [] }, null] });
assert.deepEqual(bozuk, { v: 1, aktif: 'a', listeler: [{ id: 'a', ad: 'A', idler: [1, 3] }] });
// Kayıt: tarayıcı kaydı yoksa hata vermez; varsa realm başına ayrı
assert.deepEqual(Li.oku(0), { v: 1, aktif: null, listeler: [] });
const depo = new Map();
globalThis.localStorage = { getItem: (k) => depo.get(k) ?? null, setItem: (k, v) => depo.set(k, String(v)) };
try {
  assert.ok(Li.yaz(0, d));
  assert.equal(Li.oku(0).listeler[0].ad, 'Dostlar');
  assert.equal(Li.oku(1).listeler.length, 0, 'R2 listeleri ayrı');
} finally { delete globalThis.localStorage; }
console.log('sirket_gecmis_test: tamam');
