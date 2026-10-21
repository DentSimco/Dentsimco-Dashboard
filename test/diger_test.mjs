// node test/diger_test.mjs — Diğer bölümü: GO durumu ve değeri, adlar, evre özeti, bina tablosu (ağ kullanmaz)
import assert from 'node:assert/strict';
import {
  digerRota, goDurum, goListeleri, teklifBitisi, teslimBitisi, gerekenMiktar, goDegeri, carpanAraligi, urunTalepleri, urunAyrintisi, urunBul,
  projeAnahtari, projeAdi, aykiriAt, sbTurleri, kurumAdi, sertAdi, evreOzeti, kalanMetni, binaSatirlari, gunEkle, bollukEsigi, donemMetni, kategoriAdi,
} from '../public/diger.js';
import { PROJELER, ADLAR_TR, ADLAR_EN } from '../public/diger-adlar.js';
import { binaGruplari, binalarHtml, parcaYolu, PARCA, ustKademeler, kademeMetni, toplamSeviye, binaSabitleri, seviyeHesabi } from '../public/sirket-bina.js';

const DAY = 86400000;
let n = 0;
const t = (ad, fn) => { fn(); n++; };

t('adres', () => {
  assert.deepEqual(digerRota('#diger'), { tab: 'go', go: null, tur: null });
  assert.deepEqual(digerRota('#diger/go/gecmis'), { tab: 'go', go: 'gecmis', tur: null });
  assert.deepEqual(digerRota('#diger/sertifika/65'), { tab: 'sertifika', go: null, tur: 65 });
  assert.deepEqual(digerRota('#diger/bina'), { tab: 'bina', go: null, tur: null });
  assert.deepEqual(digerRota('#diger/xyz'), { tab: 'go', go: null, tur: null });
});

// Çarşamba 13:00 UTC çıkan sipariş: 5 gün teklif (pazartesi 13:00), sonra 6 gün teslim
const C = Date.parse('2026-10-14T13:00:33Z');
const ilan = { id: 900, c: C, d: 6, s: 1, m: null, r: [[61, 1, 100], [26, 0, 10]] };
const verilen = { ...ilan, id: 868, m: 90 };

t('GO durumu oyunun takvimine göre', () => {
  assert.equal(teklifBitisi(ilan), C + 5 * DAY);
  assert.equal(teslimBitisi(ilan), C + 11 * DAY);
  assert.equal(goDurum(ilan, C + DAY), 'ilan');
  assert.equal(goDurum(verilen, C + DAY), 'yuruyen', 'çarpan verildiyse teklif süresi bitmese de yürüyen');
  assert.equal(goDurum(ilan, C + 6 * DAY), 'yuruyen', 'bot çarpanı görmediyse takvimle yürüyen');
  assert.equal(goDurum(verilen, C + 12 * DAY), 'gecmis');
  assert.equal(goDurum({ id: 1 }, C), 'gecmis');
  const l = goListeleri({ 900: ilan, 868: verilen, 29: { id: 29, c: C - 400 * DAY, d: 6, r: [] } }, C + DAY);
  assert.deepEqual([l.ilan.map((o) => o.id), l.yuruyen.map((o) => o.id), l.gecmis.map((o) => o.id)], [[900], [868], [29]]);
});

t('GO miktarı ve borsa değeri', () => {
  assert.equal(gerekenMiktar(96224, 90), 8660160);
  assert.equal(gerekenMiktar(1.5, 3), 5, 'yukarı yuvarlanır (oyundaki gibi)');
  assert.equal(gerekenMiktar(null, 90), null);
  assert.equal(gerekenMiktar(10, null), null);
  const fiyat = (kind, q) => ({ '61:1': 2, '26:0': 500 })[`${kind}:${q}`] ?? null;
  assert.deepEqual(goDegeri(verilen, 90, fiyat), { toplam: 9000 * 2 + 900 * 500, eksik: 0 });
  assert.deepEqual(goDegeri({ r: [[61, 1, 100], [99, 0, 5]] }, 1, fiyat), { toplam: 200, eksik: 1 }, 'fiyatı olmayan kalem eksik sayılır');
});

t('verilmiş çarpan aralığı ve istenen ürünler', () => {
  const o = { 1: { m: 65, s: 1 }, 2: { m: 142, s: 1 }, 3: { m: 90, s: 1 }, 4: { m: 353, s: 2 }, 5: { m: null, s: 1 } };
  assert.deepEqual(carpanAraligi(o, 1), { n: 3, min: 65, orta: 90, max: 142 });
  assert.equal(carpanAraligi(o, 3), null);
  const u = urunTalepleri({ 1: { c: 5, r: [[61, 1], [26, 0]] }, 2: { c: 9, r: [[61, 2]] } });
  assert.deepEqual(u.map((x) => [x.kind, x.n, x.son]), [[61, 2, 9], [26, 1, 5]]);
  assert.deepEqual([...u[0].kaliteler], [[1, 1], [2, 1]]);
});

t('ürün ayrıntısı: sipariş, kalite ve toplam gereken miktar', () => {
  const o = { 1: { id: 1, c: 5, m: 2, r: [[61, 1, 10], [26, 0, 5]] }, 2: { id: 2, c: 9, m: null, r: [[61, 1, 7]] }, 3: { id: 3, c: 7, m: 3, r: [[61, 2, 4]] } };
  const d = urunAyrintisi(o, 61);
  assert.equal(d.n, 3);
  assert.deepEqual(d.siparisler.map((x) => x.id), [2, 3, 1]);
  assert.equal(d.miktar, 20 + 12);
  assert.equal(d.miktarliSiparis, 2);
  assert.deepEqual([...d.kaliteler].map(([q, x]) => [q, x.n, x.miktar]), [[1, 2, 20], [2, 1, 12]]);
  assert.equal(urunAyrintisi(o, 99).n, 0);
});

t('ürün bulma: ID, tam ad, tek eşleşen parça', () => {
  const adlar = [[61, 'Pil'], [26, 'Çelik'], [7, 'Çelik levha']];
  assert.equal(urunBul('61', adlar), 61);
  assert.equal(urunBul('#26', adlar), 26);
  assert.equal(urunBul(' pil ', adlar), 61);
  assert.equal(urunBul('çelik', adlar), 26); // tam ad, parçadan önce
  assert.equal(urunBul('levha', adlar), 7);
  assert.equal(urunBul('çe', adlar), null); // birden çok eşleşme
  assert.equal(urunBul('999', adlar), null);
  assert.equal(urunBul('', adlar), null);
});

t('proje adları: anahtardan, Simcotools adından ve aynı adlı projelerde ürünlerden', () => {
  assert.equal(projeAdi({ k: 'FIRE_TRUCKS' }), ADLAR_TR.p.FIRE_TRUCKS);
  assert.equal(projeAnahtari({ n: 'Fire Trucks', r: [[57, 3, null]] }), 'FIRE_TRUCKS');
  // Medical Supplies iki projede var: ürünleri 61, 26, 73 olan MEDICAL_SUPPLIES_2
  const ikinci = PROJELER.MEDICAL_SUPPLIES_2.r;
  assert.equal(projeAnahtari({ n: 'Medical Supplies', r: ikinci.map((k) => [k, 0, null]) }), 'MEDICAL_SUPPLIES_2');
  assert.equal(kurumAdi({ k: 'MEDICAL_SUPPLIES_2' }), ADLAR_TR.a.PUBLIC_HEALTH_DEPARTMENT);
  assert.equal(projeAdi({ n: 'Bilinmeyen Proje' }), 'Bilinmeyen Proje', 'tanınmayan ad olduğu gibi');
  assert.equal(kurumAdi({ n: 'Bilinmeyen Proje' }), '');
  for (const k of Object.keys(PROJELER)) {
    assert.ok(ADLAR_EN.p[k] && ADLAR_TR.p[k], `proje adı eksik: ${k}`);
    assert.ok(ADLAR_EN.a[PROJELER[k].a] && ADLAR_TR.a[PROJELER[k].a], `kurum adı eksik: ${PROJELER[k].a}`);
  }
  assert.equal(sertAdi(65), ADLAR_TR.c[65]);
  assert.equal(sertAdi(999), '#999');
});

t('evre özeti', () => {
  const H = 7 * DAY;
  const r = [['normal', 0, 2 * H], ['boom', 2 * H, 3 * H], ['recession', 3 * H, 6 * H], ['normal', 6 * H, 7 * H]];
  const o = evreOzeti(r, 6 * H + DAY);
  assert.deepEqual(o.simdiki, ['normal', 6 * H, 7 * H]);
  assert.deepEqual(o.istatistik.map((x) => [x.adet, x.hafta]), [[1, 3], [2, 3], [1, 1]]);
  assert.equal(o.toplamHafta, 7);
  assert.equal(o.istatistik[1].ort, 1.5);
  assert.equal(evreOzeti([], 0).simdiki, null);
});

t('kalan süre metni', () => {
  assert.equal(kalanMetni(2 * DAY + 5 * 3600000 + 60000), '2 g 5 sa');
  assert.equal(kalanMetni(3 * DAY), '3 g');
  assert.equal(kalanMetni(5 * 3600000 + 12 * 60000), '5 sa 12 dk');
  assert.equal(kalanMetni(30000), '1 dk');
  assert.equal(kalanMetni(0), null);
  assert.equal(kalanMetni(-5), null);
});

t('bina tablosu: dünden ve 7 günden fark, sabitler, ürünler', () => {
  assert.equal(gunEkle(20261001, -1), 20260930);
  assert.equal(gunEkle(20261228, 7), 20270104);
  const bina = { date: 20261021, counts: { E: [100, 0.5], P: [50, 0.25] }, hist: { 20261021: { E: 100, P: 50 }, 20261020: { E: 90 }, 20261014: { E: 80, P: 60 } } };
  const sabit = { E: { dbLetter: 'E', category: 'production', costUnits: 2, buildDuration: 3600 } };
  const rows = binaSatirlari(bina, sabit, { 1: { id: 1, building: 'E' }, 2: { id: 2, building: 'P' } });
  const E = rows.find((r) => r.harf === 'E');
  const P = rows.find((r) => r.harf === 'P');
  assert.deepEqual([E.n, E.f1, E.f7, E.cu, E.kat, E.urunler], [100, 10, 20, 2, 'production', [1]]);
  assert.deepEqual([P.f1, P.f7], [null, -10], 'dün kaydı olmayan türde fark yok');
  assert.deepEqual(binaSatirlari({ date: 20261021, counts: { E: [1, 1] }, hist: {} }, null, null)[0].f1, null, 'ilk gün fark yok');
  assert.equal(kategoriAdi('sales'), 'Satış');
});

t('bolluk eşiği ve sertifika dönemi', () => {
  assert.equal(bollukEsigi('Exceptional'), 98);
  assert.equal(bollukEsigi('Very Good'), 95);
  assert.equal(bollukEsigi('Trash'), 0);
  assert.equal(bollukEsigi('?'), null);
  assert.equal(donemMetni('2026-W42'), '2026 · 42. hafta');
  assert.match(donemMetni('2026-09'), /Eylül 2026/);
  assert.equal(donemMetni(''), '');
});

t('grafikte yarım kalmış gün ayıklanır', () => {
  const gun = (i, v) => [20261000 + i, v];
  const a = aykiriAt([gun(1, 300), gun(2, 305), gun(3, 5), gun(4, 0), gun(5, 310), gun(6, 290), gun(7, null), gun(8, 302)]);
  assert.deepEqual(a.map((x) => x[1]), [300, 305, 310, 290, 302]);
  assert.deepEqual(aykiriAt([gun(1, 100), gun(2, 70)]).length, 2, 'gerçek düşüş (komşu ortancasının %60\'ından fazla) kalır');
  assert.deepEqual(aykiriAt([gun(1, 5)]), [gun(1, 5)]);
});

t('şirket binaları: türe göre gruplar, özet tablosu, parça yolu', () => {
  const g = binaGruplari([['6', 15, 'b', 9e12, 0], ['6', 10, null, null, 0], ['r', 15, null, null, 1], ['y', 20, 'u', 1, 0]]);
  assert.deepEqual(g.map((x) => [x.harf, x.adet, x.toplam, x.seviyeler, x.mesgul.length, x.luks]), [['6', 2, 25, [15, 10], 1, 0], ['y', 1, 20, [20], 1, 0], ['r', 1, 15, [15], 0, 1]]);
  assert.match(binalarHtml(null), /henüz yok/);
  const h = binalarHtml({ n: 'A', t: 0, lv: 25, rt: 'AAA', go: 4, b: [['6', 15, 'b', 9e12, 0]] }, 0);
  assert.match(h, /İnşa \/ yükseltme/);
  assert.match(h, />T4</);
  assert.equal(parcaYolu(0, 4479420), `meta/sb_r0_${String(4479420 % PARCA).padStart(3, '0')}`);
  const s = sbTurleri({ kinds: { 6: [2, 3, 55, 30, {}], r: [1, 1, 5, 5, {}], x: [0, 0, 0, 0, {}] } });
  assert.deepEqual(s.map((x) => [x.harf, x.sirket, x.seviye]), [['6', 2, 55], ['r', 1, 5]]);
});

t('kademe: profildeki değer gerçek seviye değil; en yüksek kademe "+" ile yazılır', () => {
  const ust = ustKademeler({ a: { dbLetter: 'r', levelImages: [{ level: 1 }, { level: 6 }, { level: 15 }] }, b: { dbLetter: 'y', levelImages: [{ level: 5 }, { level: 20 }] }, c: { dbLetter: 'v' } });
  assert.deepEqual(ust, { r: 15, y: 20 });
  assert.equal(kademeMetni('r', 15, ust), '15+');
  assert.equal(kademeMetni('r', 10, ust), '10');
  assert.equal(kademeMetni('y', 20, ust), '20+');
  assert.equal(kademeMetni('v', 50, ust), '50', 'kademesi olmayan binada değer gerçek seviyedir');
  const h = binalarHtml({ n: 'A', t: 0, b: [['r', 15, null, null, 0]] }, 0, ust);
  assert.match(h, /15\+/);
  assert.match(h, /Bina bazında gerçek seviye görünmez/);
});

t('kesin toplam seviye yönetim giderinden; üst kademe ortalaması aralık olarak', () => {
  assert.equal(toplamSeviye(3.0235294117647058), 345);
  assert.equal(toplamSeviye(null), null);
  const sabit = { a: { dbLetter: '6', category: 'production', levelImages: [1, 2, 3, 6, 10, 15].map((level) => ({ level })) }, b: { dbLetter: 'y', category: 'other', levelImages: [1, 5, 10, 15, 20].map((level) => ({ level })) },
    c: { dbLetter: 't', category: 'seasonal', levelImages: [{ level: 1 }, { level: 3 }] }, d: { dbLetter: '3', category: 'recreation', levelImages: [{ level: 1 }, { level: 3 }] } };
  // Dentium Citrosuco: 14 içecek fabrikası 15+, akademi 20, Halloween pazarı 3, tapınak 3; yönetim gideri 3,0235…
  const b = [...Array(14)].map(() => ['6', 15, null, null, 0]).concat([['y', 20, null, null, 0], ['t', 3, null, null, 0], ['3', 3, 'b', 1, 0]]);
  const h = seviyeHesabi({ ao: 3.0235294117647058, b }, binaSabitleri(sabit));
  assert.equal(h.L, 345);
  assert.equal(h.ustAdet, 14);
  assert.equal(Math.round(h.ortAlt * 100) / 100, 24.64);
  assert.equal(h.ortAlt, h.ortUst, 'alt kademede boşluk yoksa aralık tek değer');
  // Alt kademede boşluk varsa aralık açılır: 6 → en çok 9 (3 fazla seviye olabilir)
  const h2 = seviyeHesabi({ ao: 1 + (15 + 6 + 20 - 1) / 170, b: [['6', 15], ['6', 6]] }, binaSabitleri(sabit));
  assert.equal(h2.L, 41);
  assert.deepEqual([h2.ortAlt, h2.ortUst], [15 + (41 - 21 - 3), 15 + (41 - 21)], 'aralık: boşluk 3');
  assert.equal(seviyeHesabi({ ao: 1, b: [['6', 15]] }, binaSabitleri(sabit)).ortAlt, null, 'tutarsız veri (L < kademe toplamı): ortalama verilmez');
  assert.equal(seviyeHesabi({ ao: null, b }, binaSabitleri(sabit)), null);
  assert.equal(seviyeHesabi({ ao: 3, b: [['6', 10]] }, binaSabitleri(sabit)).ustAdet, 0, 'üst kademede bina yoksa ortalama yok');
});

console.log(`${n}/${n} test geçti.`);
