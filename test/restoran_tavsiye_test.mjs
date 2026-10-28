// DentSimco — Restoran Maliyetler ve Tavsiye sınamaları. Çalıştırma: node test/restoran_tavsiye_test.mjs
// Hesap (restoran-tavsiye.js): adet, maliyet tablosu, en ucuz ürün seçimi, elle ve otomatik menü, ayar kaydı ve olaylar.

import * as T from '../public/restoran-tavsiye.js';
import * as R from '../public/hesap-restoran.js';
import * as M from '../public/restoran-rating.js';

const results = [];
let group = '';
const section = (name) => { group = name; };
function test(name, fn) {
  try { fn(); results.push({ group, name, ok: true }); } catch (e) { results.push({ group, name, ok: false, error: e.message }); }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} beklenen ${b}, bulunan ${a}`);
}
function near(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} beklenen ${expected} (±${tol}), bulunan ${actual}`);
}
function ok(value, label = 'koşul sağlanmadı') { if (!value) throw new Error(label); }

// Her üründe ve kalitede farklı, kaliteyle artan fiyat. Pahalı ürünler (oran düşük) daha yüksek birim fiyatlı.
const fiyat = (id, q) => 2 + (id % 7) * 1.5 + q * 0.4 + (R.URUNLER[id].oran < 20 ? 300 : 0);
const marketOf = (id, q) => fiyat(id, q);
const idler = (key) => R.KATEGORILER.find((k) => k.key === key).urunler;

section('Adet');
test('Adet = yukarı yuvarla(oran × çarpan × seviye × lüks); Süt 288, Köfte 2 üründe 4, tek üründe 8', () => {
  eq(T.adet(117, 2, 1), 288);
  eq(T.adet(131, 2, 1), 4); // 3,505 → 4
  eq(T.adet(131, 1, 1), 8); // 3,505 × 2,1 = 7,36 → 8
  eq(T.adet(117, 3, 10), Math.ceil(288 * 0.9 * 10));
  eq(T.adet(117, 4, 1), 231); // 288 × 0,8 = 230,4
});
test('Lüks yemek ×0,5', () => { eq(T.adet(117, 2, 1, 'luks'), 144); eq(T.adet(142, 2, 1, 'luks'), 5); }); // Salata 9,402 × 0,5 = 4,7
test('Oyun hesabıyla (ihtiyac) aynı: 2-2-2 menüde seviye 17', () => {
  const ids = [117, 119, 142, 143, 124, 125];
  const beklenen = R.ihtiyac(ids, 17, 'eko');
  for (const id of ids) eq(T.adet(id, 2, 17, 'eko'), beklenen[id], `ürün ${id}`);
});

section('Maliyet tablosu (seviye 1)');
test('Her kategori, her ürün, 13 kalite; tutar = adet × birim fiyat', () => {
  const t = T.maliyetTablosu(marketOf, { carpan: 2 });
  eq(t.map((k) => k.key), ['salata', 'ana', 'icecek']);
  eq(t.map((k) => k.urunler.length), [6, 6, 4]);
  const u = t[0].urunler.find((x) => x.id === 117);
  eq(u.hucre.length, 13);
  near(u.hucre[7].tutar, 288 * fiyat(117, 7), 1e-6);
  eq(u.adet, 288);
});
test('Kategoride aynı kalitenin en ucuzu işaretlenir; her sütunda en az bir işaret', () => {
  const t = T.maliyetTablosu(marketOf, { carpan: 2 });
  for (const k of t) for (let q = 0; q < 13; q++) {
    const sutun = k.urunler.map((u) => u.hucre[q]);
    const min = Math.min(...sutun.map((h) => h.tutar));
    ok(sutun.some((h) => h.enUcuz), 'işaret yok');
    for (const h of sutun) eq(h.enUcuz, h.tutar === min);
  }
});
test('Çarpan ve lüks adedi değiştirir; fiyatı olmayan hücre null ve işaretsiz', () => {
  const a = T.maliyetTablosu(marketOf, { carpan: 1 })[2].urunler.find((x) => x.id === 124);
  eq(a.adet, Math.ceil(144 * 2.1));
  const l = T.maliyetTablosu(marketOf, { carpan: 2, tip: 'luks' })[2].urunler.find((x) => x.id === 124);
  eq(l.adet, 72);
  const eksik = (id, q) => (id === 117 ? null : marketOf(id, q));
  const e = T.maliyetTablosu(eksik, { carpan: 2 })[0].urunler.find((x) => x.id === 117);
  ok(e.hucre.every((h) => h.tutar === null && !h.enUcuz));
});

section('En ucuz seçim ve menü');
test('n ürün seçilir, tutara göre sıralı en ucuzlar; fiyatı olan ürün n\'den azsa null', () => {
  const s = T.enUcuzSecim(marketOf, 'salata', 3, 7);
  eq(s.urunler.length, 3);
  const hepsi = idler('salata').map((id) => T.adet(id, 3, 1) * fiyat(id, 7)).sort((a, b) => a - b);
  near(s.toplam, hepsi[0] + hepsi[1] + hepsi[2], 1e-6);
  const az = (id, q) => (id === 117 || id === 121 ? marketOf(id, q) : null);
  eq(T.enUcuzSecim(az, 'salata', 3, 7), null);
  ok(T.enUcuzSecim(az, 'salata', 2, 7));
});
test('Seviye adedi büyütür (yuvarlama seviye başına değil toplamda)', () => {
  const bir = T.enUcuzSecim(marketOf, 'ana', 2, 5, 1);
  const yirmi = T.enUcuzSecim(marketOf, 'ana', 2, 5, 20);
  ok(yirmi.toplam > 19 * bir.toplam * 0.9 && yirmi.toplam <= 20 * bir.toplam + 1e-6);
});
test('Elle menü: toplam, çeşit, ürün sayısı, günlük ve seviye başı maliyet; rating modelden', () => {
  const m = T.menuOner(marketOf, { kalite: 7, seviye: 5, tip: 'eko', cesit: { salata: 2, ana: 3, icecek: 1 }, bonus: 1.1 });
  eq([m.cesit, m.urunSayisi], ['2-3-1', 6]);
  near(m.toplam, m.kategoriler.reduce((t, k) => t + k.toplam, 0), 1e-6);
  near(m.gunluk, m.toplam * 2, 1e-9); near(m.seviyeBasi, m.toplam / 5, 1e-9);
  const r = M.ratingAraligi({ kalite: 7, urunSayisi: 6, bonus: 1.1, tip: 'eko' });
  near(m.rating.orta, r.orta, 1e-9);
  near(M.hedefRating({ kalite: 7, urunSayisi: 6, bonus: 1.1 }), 6.58, 0.02);
});
test('Lüks: adet yarıya iner, rating × 1,25', () => {
  const e = T.menuOner(marketOf, { kalite: 7, seviye: 1, tip: 'eko', cesit: { salata: 2, ana: 2, icecek: 2 }, bonus: 1 });
  const l = T.menuOner(marketOf, { kalite: 7, seviye: 1, tip: 'luks', cesit: { salata: 2, ana: 2, icecek: 2 }, bonus: 1 });
  ok(l.toplam < e.toplam * 0.6);
  near(l.rating.orta, e.rating.orta * 1.25, 1e-9);
});
test('Yeterli fiyatlı ürün olmayan kategori eksik olarak bildirilir', () => {
  const az = (id, q) => (idler('icecek').includes(id) ? null : marketOf(id, q));
  eq(T.menuOner(az, { kalite: 5, cesit: { salata: 2, ana: 2, icecek: 2 } }).eksik, ['İçecek']);
});

section('Otomatik');
test('Hedefe ulaşan en ucuz menü: kaba kuvvetle doğrulanır', () => {
  const hedef = 7;
  const o = T.otomatikOner(marketOf, { kalite: 7, seviye: 3, tip: 'eko', hedef, bonus: 1.1 });
  ok(o.en); ok(o.en.rating.orta >= hedef - 1e-9, 'hedefin altında');
  let min = Infinity;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 4; c++) {
    const m = T.menuOner(marketOf, { kalite: 7, seviye: 3, tip: 'eko', cesit: { salata: a, ana: b, icecek: c }, bonus: 1.1 });
    if (m.rating.orta >= hedef - 1e-9) min = Math.min(min, m.toplam);
  }
  near(o.en.toplam, min, 1e-6);
  ok(o.secenekler.length === 4 && o.secenekler.every((m) => m.toplam >= o.en.toplam && m.rating.orta >= hedef - 1e-9));
});
test('Hedef çok yüksekse yok ve en yüksek tahmin; fiyat yoksa fiyatYok', () => {
  const y = T.otomatikOner(marketOf, { kalite: 0, seviye: 1, hedef: 10, bonus: 0 });
  ok(y.yok && y.enYuksek > 0 && y.enYuksek < 10);
  eq(T.otomatikOner(() => null, { kalite: 7, hedef: 5 }), { fiyatYok: true });
});
test('Daha yüksek hedef daha pahalı (ya da eşit) menü demektir', () => {
  const a = T.otomatikOner(marketOf, { kalite: 9, seviye: 1, hedef: 6, bonus: 1.1 }).en.toplam;
  const b = T.otomatikOner(marketOf, { kalite: 9, seviye: 1, hedef: 7.5, bonus: 1.1 }).en.toplam;
  ok(b >= a);
});

section('Ayar kaydı ve olaylar');
test('Bozuk kayıt temizlenir, sınırlar uygulanır', () => {
  eq(T.temizleTavsiye(null), T.varsayilanTavsiye());
  const s = T.temizleTavsiye({ kalite: 99, seviye: -4, tip: 'x', mod: 'elle', hedef: 'abc', carpan: 9, cesit: { salata: 0, ana: 99, icecek: 3 } });
  eq([s.kalite, s.seviye, s.tip, s.mod, s.carpan, s.cesit], [12, 1, 'eko', 'elle', 4, { salata: 1, ana: 6, icecek: 3 }]);
  eq(s.hedef, T.varsayilanTavsiye().hedef);
});
test('Düğmeler: çarpan, oturma, mod, çeşit sayacı (1 ile üst sınır arasında kalır)', () => {
  const st = T.varsayilanTavsiye();
  const b = (dataset) => ({ dataset });
  ok(T.tavsiyeTikla(st, b({ act: 'rt.carpan', v: '3' }))); eq(st.carpan, 3);
  ok(T.tavsiyeTikla(st, b({ act: 'rt.tip', v: 'luks' }))); eq(st.tip, 'luks');
  ok(T.tavsiyeTikla(st, b({ act: 'rt.mod', v: 'elle' }))); eq(st.mod, 'elle');
  for (let i = 0; i < 10; i++) T.tavsiyeTikla(st, b({ act: 'rt.cesit', k: 'icecek', v: '1' }));
  eq(st.cesit.icecek, 4);
  for (let i = 0; i < 10; i++) T.tavsiyeTikla(st, b({ act: 'rt.cesit', k: 'icecek', v: '-1' }));
  eq(st.cesit.icecek, 1);
  eq(T.tavsiyeTikla(st, b({ act: 'rt.bilinmeyen' })), false);
  eq(T.tavsiyeTikla(st, b({ act: 'rt.cesit', k: 'yok', v: '1' })), false);
});
test('Alanlar: kalite, seviye ("1.250" gibi binlik yazımlar dahil), hedef', () => {
  const st = T.varsayilanTavsiye();
  const e = (rt, value) => ({ dataset: { rt }, value });
  ok(T.tavsiyeDegis(st, e('kalite', '10'))); eq(st.kalite, 10);
  ok(T.tavsiyeDegis(st, e('seviye', '25'))); eq(st.seviye, 25);
  T.tavsiyeDegis(st, e('seviye', '1.250')); eq(st.seviye, 1250);
  ok(T.tavsiyeDegis(st, e('hedef', '7,5'))); eq(st.hedef, 7.5);
  T.tavsiyeDegis(st, e('hedef', '99')); eq(st.hedef, 10);
  T.tavsiyeDegis(st, e('seviye', '0')); eq(st.seviye, 1);
  eq(T.tavsiyeDegis(st, { dataset: {}, value: '1' }), false);
});

section('Çizim');
test('Maliyetler: üç kategori, mavi hücre sınıfı, "adet" yazısı, doluluk ve kâr yok', () => {
  const h = T.maliyetHtml(T.varsayilanTavsiye(), marketOf);
  for (const ad of ['Salata barı', 'Ana yemek', 'İçecek']) ok(h.includes(ad), ad);
  ok(h.includes('class="low') && h.includes('data-act="rt.carpan"') && h.includes('data-act="rt.tip"'));
  ok(!/Doluluk|Kâr/.test(h.replace(/Doluluk ve kâr hesaplanmaz\./, '')));
});
test('Tavsiye otomatik: hedef alanı, sonuç ve rating aralığı; doluluk ve kâr tutarı yok', () => {
  const h = T.tavsiyeHtml(T.varsayilanTavsiye(), marketOf, { bonus: 1.1 });
  ok(h.includes('data-rt="hedef"') && h.includes('Tahmini rating') && h.includes('Maliyet / döngü'));
  ok(!h.includes('data-act="rt.cesit"'));
  ok(!/Gelir|Kâr\b/.test(h));
});
test('Tavsiye: her kategoride en ucuz ürün mavi işaretlenir, menü kategorilere ayrılır', () => {
  const h = T.tavsiyeHtml({ ...T.varsayilanTavsiye(), mod: 'elle', cesit: { salata: 3, ana: 2, icecek: 4 } }, marketOf, { bonus: 1 });
  const bolumler = h.split('class="grp"').slice(1);
  eq(bolumler.length, 3);
  for (const b of bolumler) eq((b.split('<tr class="grp"')[0].match(/class="low"/g) || []).length >= 1, true);
  ok(h.includes('SALATA') === false && h.includes('Salata barı · 3'));
});
test('Tavsiye elle: üç sayaç; fiyat yoksa hata mesajı', () => {
  const st = { ...T.varsayilanTavsiye(), mod: 'elle' };
  const h = T.tavsiyeHtml(st, marketOf, { bonus: 1 });
  eq((h.match(/data-act="rt.cesit"/g) || []).length, 6);
  ok(T.tavsiyeHtml(st, () => null, { bonus: 1 }).includes('borsada yeterli ilan yok'));
});
test('Bonus gösterilir; betik içermez', () => {
  const h = T.tavsiyeHtml(T.varsayilanTavsiye(), marketOf, { bonus: 1.1 });
  ok(h.includes('+1,10') || h.includes('+1.10'));
  ok(!h.includes('<script'));
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
