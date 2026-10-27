// DentSimco — Perakende restoran binaları sınamaları. Çalıştırma: node test/perakende_rbina_test.mjs
// Kayıt, "bu menüyü tüm binalara uygula", hesap ve Özet'teki kâr/zarar toplamı.

import * as RB from '../public/perakende-rbina.js';
import * as RS from '../public/perakende-restoran.js';

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

const marketOf = (id, q) => 1 + id / 100 + q * 0.1; // her üründe ve kalitede fiyat var
const ctx = { adminNet: 0, averageSalary: 345, ratingBonus: 1, evre: 1, buildings: {} };
const secili = (rb, id) => Object.keys(rb.items.find((x) => x.id === id).menu).filter((p) => rb.items.find((x) => x.id === id).menu[p].secili);
const btn = (dataset) => ({ dataset });
const env = (acik = new Set()) => ({ marketOf, acik });
function iki() {
  const rb = RB.varsayilanRb();
  const a = RB.rbEkle(rb, { ad: 'A', tip: 'eko', seviye: 8, fiyat: 75, doluluk: 58, menuFrom: '' });
  const b = RB.rbEkle(rb, { ad: '', tip: 'luks', seviye: 5, fiyat: 140, doluluk: '', menuFrom: '' });
  return { rb, a, b };
}

section('Kayıt');
test('Boş ve bozuk kayıt boş listeye döner', () => {
  eq(RB.temizleRb(null), { kaynak: null, items: [] });
  eq(RB.temizleRb({ items: 'x', kaynak: 5 }), { kaynak: null, items: [] });
});
test('Ekleme: ad boşsa sıralı ad, doluluk boşsa null, menü standart menü', () => {
  const { rb, b } = iki();
  eq(rb.items[1].ad, 'Restoran 2');
  eq(rb.items[1].doluluk, null);
  eq(rb.items[0].doluluk, 58);
  eq(secili(rb, b).sort().join(), Object.keys(RS.varsayilanMenu()).filter((k) => RS.varsayilanMenu()[k].secili).sort().join());
});
test('Kayıt temizlenince bina, menü ve kaynak korunur; geçersiz kaynak düşer', () => {
  const { rb, a } = iki();
  rb.items[0].menu[121] = { secili: true, kalite: 4, kaynak: 'manuel', manuel: 9 };
  const t = RB.temizleRb(JSON.parse(JSON.stringify({ ...rb, kaynak: a })));
  eq(t.kaynak, a);
  eq(t.items[1].menu[121], { secili: true, kalite: 4, kaynak: 'manuel', manuel: 9 }, 'kaynak menüsü kopyalandı');
  eq(RB.temizleRb({ ...rb, kaynak: 'yok' }).kaynak, null);
});

section('Bu menüyü tüm binalara uygula');
test('Anahtar açılınca kaynağın menüsü diğer binalara girer; adetler kendi seviyesine göre', () => {
  const { rb, a, b } = iki();
  rb.items[0].menu[121] = { secili: true, kalite: 6, kaynak: 'borsa', manuel: null };
  ok(RB.rbTikla(rb, btn({ act: 'x' }), env()) === false, 'ilgisiz düğme işlenmez');
  ok(RB.rbTikla(rb, btn({ act: 'pr.uygula', i: a }), env()));
  eq(rb.kaynak, a);
  eq(rb.items[1].menu[121].kalite, 6);
  const res = RB.rbDegerlendir(rb, ctx, marketOf);
  const ad = (i) => res.rows[i].gider.kalemler.find((k) => k.id === 117).adet;
  ok(ad(0) > 0 && ad(1) > 0 && ad(0) !== ad(1), 'adet seviyeye göre değişir');
});
test('Kaynağın menüsü değişince kopyalar güncellenir; kopya salt okunur', () => {
  const { rb, a, b } = iki();
  RB.rbTikla(rb, btn({ act: 'pr.uygula', i: a }), env());
  RB.rbTikla(rb, btn({ act: 'pm.urun', s: a, p: '121' }), env());
  eq(rb.items[1].menu[121].secili, true, 'kopyaya geçti');
  const once = JSON.stringify(rb.items[1].menu);
  RB.rbTikla(rb, btn({ act: 'pm.urun', s: b, p: '123' }), env());
  eq(JSON.stringify(rb.items[1].menu), once, 'kopya değişmedi');
  eq(RB.rbDegis(rb, { dataset: { pm: `${b}|117|kalite` }, value: '12' }), false, 'kopyada kalite değişmez');
  eq(RB.rbDegis(rb, { dataset: { pf: `${b}|seviye` }, value: '9' }), true, 'seviye yine düzenlenir');
  eq(rb.items[1].seviye, 9);
});
test('Başka binanın anahtarı kaynağı değiştirir; kapatınca kopyalar kalır ve düzenlenir', () => {
  const { rb, a, b } = iki();
  RB.rbTikla(rb, btn({ act: 'pr.uygula', i: a }), env());
  RB.rbTikla(rb, btn({ act: 'pm.kaynak', s: a, p: '117', v: 'manuel' }), env());
  RB.rbTikla(rb, btn({ act: 'pr.uygula', i: b }), env());
  eq(rb.kaynak, b);
  eq(rb.items[1].menu[117].kaynak, 'manuel', 'yeni kaynak o ana kadarki menüsünü korur');
  RB.rbTikla(rb, btn({ act: 'pm.urun', s: b, p: '123' }), env());
  eq(rb.items[0].menu[123].secili, true, 'yeni kaynağın değişikliği eskisine geçer');
  RB.rbTikla(rb, btn({ act: 'pr.uygula', i: b }), env());
  eq(rb.kaynak, null);
  RB.rbTikla(rb, btn({ act: 'pm.urun', s: a, p: '121' }), env());
  eq(rb.items[0].menu[121].secili, true, 'serbest kalan bina düzenlenir');
  eq(rb.items[1].menu[121].secili, false, 'diğeri etkilenmez');
});
test('Kaynak silinince uygulama kapanır; yeni bina kaynak menüsünü alır', () => {
  const { rb, a } = iki();
  RB.rbTikla(rb, btn({ act: 'pr.uygula', i: a }), env());
  RB.rbEkle(rb, { tip: 'eko', seviye: 3, menuFrom: '' });
  eq(JSON.stringify(rb.items[2].menu), JSON.stringify(rb.items[0].menu));
  RB.rbTikla(rb, btn({ act: 'pr.sil', i: a }), env());
  eq(rb.kaynak, null);
  eq(rb.items.length, 2);
});

section('Bina ekle taslağı');
test('Taslakta seçilen menü eklenen binaya geçer; olaylar taslağı değiştirir', () => {
  const rb = RB.varsayilanRb();
  const d = RB.yeniTaslak();
  d.seviye = 6;
  RB.rbTikla(RB.taslakRb(d), btn({ act: 'pm.urun', s: RB.TASLAK_ID, p: '121' }), env());
  eq(d.menu[121].secili, true, 'taslak değişti');
  eq(RB.rbDegis(RB.taslakRb(d), { dataset: { pm: `${RB.TASLAK_ID}|121|kalite` }, value: '5' }), true);
  eq(d.menu[121].kalite, 5);
  const id = RB.rbEkle(rb, d);
  eq(rb.items.find((x) => x.id === id).menu[121].kalite, 5);
  d.menu[121].kalite = 9;
  eq(rb.items[0].menu[121].kalite, 5, 'eklenen bina taslaktan bağımsız');
});
test('Başka binanın menüsü taslağa kopyalanır', () => {
  const { rb, a } = iki();
  rb.items[0].menu[121] = { secili: true, kalite: 4, kaynak: 'borsa', manuel: null };
  const d = RB.yeniTaslak();
  d.menuFrom = a;
  RB.taslakMenuKaynagi(d, rb);
  eq(d.menu[121].kalite, 4);
});

section('Hesap');
test('Kâr, gelir − malzeme − maaş; doluluk girilince o doluluk, boşsa tahmin', () => {
  const { rb } = iki();
  const res = RB.rbDegerlendir(rb, ctx, marketOf);
  const r = res.rows[0];
  eq(r.simdi.doluluk, 58);
  near(r.secili.profitDay, r.secili.revenueDay - r.costDay - r.wagesDay, 1e-6);
  near(r.secili.revenueDay, 75 * 1000 * 8 * 0.58 * 2, 1e-6, 'koltuk 1.000 × seviye, günde 2 döngü');
  ok(res.rows[1].simdi.doluluk > 0 && res.rows[1].simdi.doluluk <= 100, 'tahmin');
  near(res.totals.profitDay, res.rows[0].secili.profitDay + res.rows[1].secili.profitDay, 1e-6);
});
test('Her kategoriden ürün yoksa kâr hesaplanmaz (eksik)', () => {
  const { rb, a } = iki();
  for (const p of secili(rb, a).filter((p) => RS.varsayilanMenu()[p].secili)) rb.items[0].menu[p].secili = false;
  const res = RB.rbDegerlendir(rb, ctx, marketOf);
  eq(res.rows[0].eksik, true);
  eq(res.totals.profitDay, null);
});
test('Manuel maliyet borsa fiyatını geçersiz kılar', () => {
  const { rb, a } = iki();
  const once = RB.rbDegerlendir(rb, ctx, marketOf).rows[0].costDay;
  RB.rbTikla(rb, btn({ act: 'pm.kaynak', s: a, p: '117', v: 'manuel' }), env());
  RB.rbDegis(rb, { dataset: { pm: `${a}|117|satir` }, value: '1' });
  ok(RB.rbDegerlendir(rb, ctx, marketOf).rows[0].costDay < once, 'süt $1 toplam: malzeme düştü');
});
test('Seviye toplamı', () => eq(RB.rbSeviye(iki().rb), 13));

section('Özet toplamı');
test('Kâr eden, zarar eden ve net toplam', () => {
  eq(RB.karZarar([100, -30, 50, -20]), { kar: 150, zarar: -50, net: 100, eksik: 0 });
});
test('Bilinmeyen bina varsa net toplam null', () => {
  const z = RB.karZarar([100, null, -20]);
  eq(z.net, null); eq(z.eksik, 1); eq(z.kar, 100);
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
