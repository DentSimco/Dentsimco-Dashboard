// node test/diger_test.mjs — Diğer bölümü: GO durumu ve değeri, adlar, evre özeti, bina tablosu (ağ kullanmaz)
import assert from 'node:assert/strict';
import {
  digerRota, goDurum, goListeleri, teklifBitisi, teslimBitisi, gerekenMiktar, goDegeri, carpanAraligi, urunTalepleri, urunAyrintisi, urunBul,
  projeAnahtari, projeAdi, aykiriAt, sbTurleri, kurumAdi, sertAdi, evreOzeti, kalanMetni, binaTurleri, binaSirala, donemMetni, kategoriAdi,
} from '../public/diger.js';
import { PROJELER, ADLAR_TR, ADLAR_EN } from '../public/diger-adlar.js';
import { binaGruplari, binalarHtml, parcaYolu, PARCA, ustKademeler, kademeMetni, toplamSeviye, binaSabitleri, seviyeCoz, mevsimlikMi, HEDIYE_SEVIYE } from '../public/sirket-bina.js';
import { bvGuvenilir, BV_BIRIM } from '../public/seviye-coz.js';

const DAY = 86400000;
let n = 0;
const t = (ad, fn) => { fn(); n++; };

t('adres', () => {
  assert.deepEqual(digerRota('#diger'), { tab: 'go', go: null, tur: null });
  assert.deepEqual(digerRota('#diger/go/gecmis'), { tab: 'go', go: 'gecmis', tur: null });
  assert.deepEqual(digerRota('#diger/sertifika/65'), { tab: 'sertifika', go: null, tur: 65 });
  assert.deepEqual(digerRota('#diger/bina'), { tab: 'bina', go: null, tur: null });
  for (const k of ['evre', 'ozet', 'olay', 'yarisma']) assert.deepEqual(digerRota(`#diger/${k}`), { tab: k, go: null, tur: null });
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

t('bina türleri tablosu: realm sayısı ve şirketlerdeki seviye tek satırda; sıralama', () => {
  const bina = { counts: { E: [100, 0.5], P: [50, 0.25], t: [30, 0.15], r: [20, 0.1] } };
  const sb = { kinds: { E: [10, 40, 400, 15, {}], t: [5, 8, 24, 3, {}], P: [0, 0, 0, 0, {}] } };
  const sabit = { a: { dbLetter: 'E', category: 'production' }, b: { dbLetter: 't', category: 'seasonal' }, c: { dbLetter: 'P', category: 'production' } };
  const rows = binaTurleri(bina, sb, sabit);
  const E = rows.find((r) => r.harf === 'E'); const P = rows.find((r) => r.harf === 'P'); const T = rows.find((r) => r.harf === 't'); const R = rows.find((r) => r.harf === 'r');
  assert.deepEqual([E.n, E.pay, E.kat, E.sirket, E.seviye, E.ort], [100, 0.5, 'production', 10, 400, 10]);
  assert.deepEqual([T.sirket, T.seviye, T.ort], [5, null, null], 'mevsimlik pazarda seviye yok');
  assert.deepEqual([P.sirket, P.seviye, P.ort], [null, null, null], 'şirketlerde hiç yoksa bilgi yok');
  assert.deepEqual([R.kat, R.sirket, R.ort], [null, null, null], 'taranmamış tür: seviye bilgisi yok');
  assert.deepEqual(binaSirala(rows, 'ort', -1).map((r) => r.harf), ['E', 'P', 't', 'r'], 'boş değerler hep sonda, kendi içinde sayıya göre azalan');
  assert.deepEqual(binaSirala(rows, 'n', 1).map((r) => r.harf), ['r', 't', 'P', 'E']);
  assert.deepEqual(binaSirala(rows, 'harf', 1, (r) => ({ E: 'Enerji', P: 'Tarla', t: 'Cadı', r: 'Restoran' })[r.harf]).map((r) => r.harf), ['t', 'E', 'r', 'P'], 'ada göre');
  assert.deepEqual(binaTurleri({ counts: { E: [1, 1] } }, null, null)[0].sirket, null, 'tarama yokken şirket sütunları boş');
  assert.equal(kategoriAdi('sales'), 'Satış');
});

t('sertifika dönemi', () => {
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
  assert.equal(kademeMetni('y', 20, ust), '20', 'akademinin sınırı 20: kesin');
  assert.equal(kademeMetni('v', 50, ust), '50', 'kademesi olmayan binada değer gerçek seviyedir');
  const h = binalarHtml({ n: 'A', t: 0, b: [['r', 15, null, null, 0]] }, 0, ust);
  assert.match(h, /15\+/);
  assert.doesNotMatch(h, /Kaynak:|Tarama:|Simcotools/, 'ayrıntı penceresinde kaynak ve tarama yazısı yok');
});

t('seviye çözümü: toplam seviye (yönetim gideri) akademi dahil; banka, dinlenme ve ücretsiz pazar hariç; tür toplamı aralık', () => {
  assert.equal(toplamSeviye(3.0235294117647058), 345);
  assert.equal(toplamSeviye(null), null);
  const lv = (...l) => l.map((level) => ({ level }));
  const sabit = binaSabitleri({
    a: { dbLetter: '6', category: 'production', costUnits: 10, levelImages: lv(1, 2, 3, 6, 10, 15) }, b: { dbLetter: 'y', category: 'other', costUnits: 19, levelImages: lv(1, 5, 10, 15, 20) },
    n: { dbLetter: 'n', category: 'other', costUnits: 40, levelImages: lv(1, 2, 3, 6, 10, 15) }, c: { dbLetter: 't', category: 'seasonal', costUnits: 4, levelImages: lv(1, 2, 3) },
    d: { dbLetter: '3', category: 'recreation', costUnits: 40, levelImages: lv(1, 2, 3) }, e: { dbLetter: 'l', category: 'production', costUnits: 30, levelImages: lv(1, 2, 3, 6, 10, 15) },
    f: { dbLetter: 'r', category: 'sales', costUnits: 3, levelImages: lv(1, 2, 3, 6, 10, 15) },
  });
  assert.equal(sabit['6'].c, 10);
  const ao = (L) => 1 + (L - 1) / 170;
  // 14 içecek fabrikası 15+, akademi 20, banka 15+ (sayılmaz), tapınak (sayılmaz), ücretsiz pazar (sayılmaz): L = 345 → fabrikalar toplam 325
  const bina = [...Array(14)].map(() => ['6', 15, null, null, 0, 0]).concat([['y', 20, null, null, 0, 0], ['n', 15, null, null, 0, 0], ['3', 3, 'b', 1, 0, 0], ['t', 3, null, null, 0, 1]]);
  const h = seviyeCoz({ ao: ao(345), b: bina }, sabit);
  assert.deepEqual([h.L, h.turler['6'], h.turler.y, h.turler.n, h.turler.t, h.celiski], [345, { adet: 14, alt: 325, ust: 325 }, { adet: 1, alt: 20, ust: 20 }, { adet: 1, alt: 15, ust: 40 }, undefined, false]);
  assert.deepEqual(h.binalar.filter((x) => x.harf === '6').map((x) => [x.alt, x.ust])[0], [15, 130], 'tek bina: diğer 13 bina en az 15 (325 − 195)');
  // Alt kademede boşluk: 6 → en çok 9: tür toplamı kesin (30), binalar aralık
  const h2 = seviyeCoz({ ao: ao(50), b: [['6', 15, null, null, 0, 0], ['6', 6, null, null, 0, 0], ['y', 20, null, null, 0, 0]] }, sabit);
  assert.deepEqual([h2.L, h2.turler['6'], h2.binalar.map((x) => [x.alt, x.ust])], [50, { adet: 2, alt: 30, ust: 30 }, [[21, 24], [6, 9], [20, 20]]]);
  // Satın alınmış mevsimlik pazar en az 1; ücretsiz olan sayılmaz (bayraksız eski kayıtta ilk Halloween pazarı ücretsiz varsayılır)
  const pazar = seviyeCoz({ ao: ao(40), b: [['t', 3, null, null, 0, 1], ['t', 3, null, null, 0, 0], ['t', 3, null, null, 0, 0]] }, sabit);
  assert.deepEqual(pazar.turler.t, { adet: 2, alt: 40, ust: 40 });
  assert.deepEqual(seviyeCoz({ ao: ao(40), b: [['t', 3], ['t', 3], ['t', 3]] }, sabit).turler.t, { adet: 2, alt: 40, ust: 40 });
  // Bayraksız kayıtta toplam ancak pazar satın alınmışsa tutuyorsa: ücretli sayılır
  const alinmis = seviyeCoz({ ao: ao(3), b: [['6', 2], ['t', 3]] }, sabit);
  assert.deepEqual([alinmis.celiski, alinmis.turler['6'], alinmis.turler.t], [false, { adet: 1, alt: 2, ust: 2 }, { adet: 1, alt: 1, ust: 1 }]);
  // Fırlatma rampası en çok 10: L=30 iki rampaya sığmaz → çelişki
  assert.equal(seviyeCoz({ ao: ao(30), b: [['l', 10, null, null, 0, 0], ['l', 6, null, null, 0, 0]] }, sabit).celiski, true);
  assert.deepEqual(seviyeCoz({ ao: ao(16), b: [['l', 10, null, null, 0, 0], ['l', 6, null, null, 0, 0]] }, sabit).turler.l, { adet: 2, alt: 16, ust: 16 });
  assert.deepEqual(seviyeCoz({ ao: 1, b: [['t', 3, null, null, 0, 1]] }, sabit).turler, {}, 'boş şirket');
  assert.equal(seviyeCoz({ ao: null, b: bina }, sabit), null);
  assert.equal(seviyeCoz({ ao: ao(2), b: [['?', 1]] }, sabit), null, 'bilinmeyen tür');
  assert.equal(kademeMetni('y', 20, { y: 20 }), '20', 'üst sınırı olan bina "+" almaz');
  assert.equal(kademeMetni('n', 15, { n: 15 }), '15+', 'banka 40\'a kadar çıkar');
  assert.equal(kademeMetni('l', 10, { l: 15 }), '10');
});

t('seviye çözümü: güvenilir bina değeri iki belirsiz türü kesinleştirir; bayat değer kullanılmaz', () => {
  const lv = (...l) => l.map((level) => ({ level }));
  const sabit = binaSabitleri({
    a: { dbLetter: '6', category: 'production', costUnits: 10, levelImages: lv(1, 2, 3, 6, 10, 15) },
    f: { dbLetter: 'r', category: 'sales', costUnits: 3, levelImages: lv(1, 2, 3, 6, 10, 15) },
    n: { dbLetter: 'n', category: 'other', costUnits: 40, levelImages: lv(1, 2, 3, 6, 10, 15) },
  });
  const ao = (L) => 1 + (L - 1) / 170;
  // Gerçek: fabrikalar 22 + 17, mağaza 24, banka 30 → L = 63, V = 10·39 + 3·24 + 40·30 = 1662
  const k = { ao: ao(63), bv: 1662 * BV_BIRIM, b: [['6', 15, null, null, 0, 0], ['6', 15, null, null, 0, 0], ['r', 15, null, null, 0, 0], ['n', 15, null, null, 0, 0]] };
  const yalnizL = seviyeCoz(k, sabit);
  assert.equal(yalnizL.bvKullanildi, false, 'bg yok: bina değeri kullanılmaz');
  assert.deepEqual([yalnizL.turler['6'], yalnizL.turler.r], [{ adet: 2, alt: 30, ust: 48 }, { adet: 1, alt: 15, ust: 33 }]);
  const ikisi = seviyeCoz({ ...k, bg: 1 }, sabit);
  assert.equal(ikisi.bvKullanildi, true);
  // 3 tür, 2 denklem: banka aralıkta kalır; yayılım aralıkları daraltır
  assert.ok(ikisi.turler['6'].alt <= 39 && ikisi.turler['6'].ust >= 39 && ikisi.turler['6'].ust - ikisi.turler['6'].alt < 18);
  // Banka yoksa: iki tür, iki denklem → kesin
  const k2 = { ao: ao(63), bv: (10 * 39 + 3 * 24) * BV_BIRIM, bg: 1, b: [['6', 15, null, null, 0, 0], ['6', 15, null, null, 0, 0], ['r', 15, null, null, 0, 0]] };
  assert.deepEqual([seviyeCoz(k2, sabit).turler['6'], seviyeCoz(k2, sabit).turler.r], [{ adet: 2, alt: 39, ust: 39 }, { adet: 1, alt: 24, ust: 24 }]);
  // Bayat bina değeri çelişirse yalnız toplam seviyeyle çözülür
  const bayat = seviyeCoz({ ...k2, bv: 5 * BV_BIRIM }, sabit);
  assert.deepEqual([bayat.bvKullanildi, bayat.bvCelisti, bayat.turler.r], [false, true, { adet: 1, alt: 15, ust: 33 }]);
  // Güvenilirlik: toplam seviye ve binalar değişmemiş, arada günlük kayıt alınmış (bv değişmiş ya da ≥ 24 saat)
  const o = { t: 0, ao: ao(63), bv: 100, b: k2.b };
  assert.equal(bvGuvenilir(o, { ...o, t: 3600_000, bv: 200 }), true);
  assert.equal(bvGuvenilir(o, { ...o, t: 3600_000 }), false, 'aynı bv, 1 saat: kayıt öncesi değişmiş olabilir');
  assert.equal(bvGuvenilir(o, { ...o, t: 25 * 3600_000 }), true);
  assert.equal(bvGuvenilir(o, { ...o, t: 25 * 3600_000, ao: ao(64) }), false, 'seviye değişmiş');
  assert.equal(bvGuvenilir(o, { ...o, t: 25 * 3600_000, b: [...k2.b, ['r', 1, null, null, 0, 0]] }), false, 'bina eklenmiş');
  assert.equal(bvGuvenilir(null, o), false);
});

t('şirket ayrıntısı: çözülmüş tür toplamı ve bina başına aralık', () => {
  const lv = (...l) => l.map((level) => ({ level }));
  const ham = { a: { dbLetter: '6', category: 'production', costUnits: 10, levelImages: lv(1, 2, 3, 6, 10, 15) } };
  const h = binalarHtml({ n: 'A', t: 0, ao: 1 + 49 / 170, b: [['6', 15, null, null, 0, 0], ['6', 6, null, null, 0, 0]] }, 0, {}, ham);
  assert.match(h, /<b>50<\/b>/, 'tür toplamı kesin');
  assert.match(h, /<b>25<\/b>/, 'ortalama: 50 ÷ 2');
  assert.match(h, /Bina başına/);
  assert.doesNotMatch(h, /Kademeler/);
});

t('mevsimlik pazarlara seviye gösterilmez', () => {
  assert.ok(mevsimlikMi('t') && mevsimlikMi('u') && !mevsimlikMi('r'));
  const h = binalarHtml({ n: 'A', t: 0, b: [['t', 3, null, null, 0, 0], ['r', 15, null, null, 0, 0]] }, 0, { r: 15, t: 3 });
  assert.doesNotMatch(h, /3\+/, 'pazar "3+" yazmaz');
  assert.match(h, /15\+/);
  assert.match(h, /<td>1<\/td><td>—<\/td>/, 'pazar satırı: adet 1, seviye —');
});

t('ücretsiz hediye pazar: bayraklı kayıtta "5" ve rozet, satın alınan "—"', () => {
  assert.equal(HEDIYE_SEVIYE.t, 5);
  const h = binalarHtml({ n: 'A', t: 0, b: [['t', 3, null, null, 0, 1], ['t', 3, null, null, 0, 0]] }, 0, {});
  assert.match(h, /Ücretsiz hediye/);
  assert.match(h, /<td class="l" data-no-t>5, —<\/td>/);
  const eski = binalarHtml({ n: 'A', t: 0, b: [['t', 3, null, null, 0]] }, 0, {});
  assert.doesNotMatch(eski, /Ücretsiz hediye/, 'bayraksız kayıtta rozet yok');
});

console.log(`${n}/${n} test geçti.`);
