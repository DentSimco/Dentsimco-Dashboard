// DentSimco — Restoran › Analiz sınamaları (Harita, Grafik, Maliyet). Çalıştırma: node test/restoran_analiz_test.mjs
// Hesap (restoran-analiz.js): referans, eşik, sapma, renk kademesi, yorum, geçmiş serisi, seçim kaydı, olaylar ve çizim.

import * as A from '../public/restoran-analiz.js';
import * as R from '../public/hesap-restoran.js';

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

// Her ürünün Q0 fiyatı referansının %90'ı; kaliteyle %8 artar
const marketOf = (id, q) => A.referans(id) * 0.9 * (1 + 0.08 * q);

section('Referans ve eşik');
test('Referans = 7200 ÷ oran; Köfte ≈ 2054, Salata ≈ 766, Süt = 25', () => {
  near(A.referans(131), 2054.2, 0.1); near(A.referans(142), 765.8, 0.1); near(A.referans(117), 25, 1e-9);
  eq(A.referans(1), null);
});
test('Eşik kalite adımı başına referansın küçük bir payı kadar artar; Q0 eşiği referansın kendisi', () => {
  near(A.esik(142, 0), A.referans(142), 1e-9);
  near(A.esik(142, 10), A.referans(142) * (1 + 10 * A.ESIK_PAYI), 1e-9);
  ok(A.esik(142, 12) > A.esik(142, 11));
});
test('Sapma: fiyat ÷ eşik − 1; fiyat yoksa null', () => {
  near(A.fark(A.esik(142, 5) * 0.88, 142, 5), -0.12, 1e-9);
  eq(A.fark(null, 142, 5), null); eq(A.fark(0, 142, 5), null); eq(A.fark(100, 1, 5), null);
});

section('Renk kademesi (±%5, 10, 25, 50)');
test('Sınırlar: ±%5 içi nötr, sonra 4 ton; eşiğin altı g, üstü r, fiyat yoksa yok', () => {
  eq([0, 0.049, -0.049].map(A.ton), ['n', 'n', 'n']);
  eq([-0.05, -0.099, -0.1, -0.249, -0.25, -0.499, -0.5, -0.9].map(A.ton), ['g1', 'g1', 'g2', 'g2', 'g3', 'g3', 'g4', 'g4']);
  eq([0.05, 0.099, 0.1, 0.249, 0.25, 0.499, 0.5, 2].map(A.ton), ['r1', 'r1', 'r2', 'r2', 'r3', 'r3', 'r4', 'r4']);
  eq([null, undefined, NaN].map(A.ton), ['yok', 'yok', 'yok']);
});
test('Yüzde metni: işaretli, tam sayı; sıfır "%0"', () => {
  eq([0.123, -0.126, 0.001, -0.004, 1.5].map(A.yuzde), ['+%12', '−%13', '%0', '%0', '+%150']);
});

section('Yorum ve karar');
test('Yorum sınıfları: öncelik, marjinal, başabaş, yakın, pahalı, taban, ilan yok', () => {
  ok(A.yorum(-0.12, 3).includes('öncelik'));
  ok(A.yorum(-0.05, 3).includes('marjinal'));
  ok(A.yorum(0.002, 3).includes('başabaş'));
  ok(A.yorum(0.06, 3).includes('yakın'));
  ok(A.yorum(0.3, 3).includes('pahalı'));
  ok(A.yorum(-0.1, 0).startsWith('Taban kalite') && A.yorum(0.1, 0).includes('üstünde'));
  eq(A.yorum(null, 3), 'Borsada ilan yok');
});
test('Eşiğin altındaki en yüksek kalite (Q0 hariç); hiçbiri altında değilse en yakını', () => {
  // fiyat referansın %90'ı × (1 + 0,08 q): eşik 1 + 0,039 q → q = 1…: oran 0,9(1+0,08q)/(1+0,039q) ≤ 1 ⇔ q ≤ 2,3 (yaklaşık)
  const best = A.enYuksekKalite(marketOf, 142);
  ok(best >= 1 && best <= 3, `en yüksek ${best}`);
  ok(A.fark(marketOf(142, best), 142, best) <= 0 && A.fark(marketOf(142, best + 1), 142, best + 1) > 0);
  const pahali = (id, q) => A.referans(id) * 2;
  eq(A.enYuksekKalite(pahali, 142), null);
  ok(A.enYakinKalite(pahali, 142).q >= 1);
  eq(A.enYuksekKalite(() => null, 142), null);
  eq(A.enYakinKalite(() => null, 142), null);
});

section('Geçmiş serisi');
test('Son n gün: kapanışı olan günler, düşük–yüksek ile; olmayan günler atlanır', () => {
  const h = { today: '2026-10-28', rows: new Map([['2026-10-28', { 3: [10, 14, 9, 12] }], ['2026-10-27', { 3: [10, 11, 8, 10] }], ['2026-10-25', { 3: [0, 0, 0, 0] }], ['2026-10-20', { 3: [1, 2, 0.5, 1.5] }]]) };
  const s = A.gecmisSeri(h, 3, 7);
  eq(s.map((x) => x.day), ['2026-10-27', '2026-10-28']);
  eq(s[1], { day: '2026-10-28', low: 9, close: 12, high: 14 });
  eq(A.gecmisSeri(h, 3, 30).map((x) => x.day), ['2026-10-20', '2026-10-27', '2026-10-28']);
  eq(A.gecmisSeri(h, 4, 7), []); eq(A.gecmisSeri(null, 3, 7), []);
});

section('Seçim kaydı ve olaylar');
test('Bozuk kayıt temizlenir; ürün ve kalite sınırları', () => {
  eq(A.temizleAnaliz(null), A.varsayilanAnaliz());
  eq(A.temizleAnaliz({ urun: 5, q: 99, aralik: 3 }), { urun: A.varsayilanAnaliz().urun, q: 12, aralik: 30 });
  eq(A.temizleAnaliz({ urun: '131', q: '4', aralik: 7 }), { urun: 131, q: 4, aralik: 7 });
});
test('an.git: ürün ve kaliteyi seçer, kaynağı bilir, Grafik\'e geçer; geçersiz değer reddedilir', () => {
  const an = A.varsayilanAnaliz(), ui = { kaynak: 'harita', qAcik: true };
  const b = (dataset) => ({ dataset });
  eq(A.analizTikla(an, ui, b({ act: 'an.git', u: '131', q: '8', k: 'maliyet' })), 'git');
  eq([an.urun, an.q, ui.kaynak, ui.qAcik], [131, 8, 'maliyet', false]);
  eq(A.analizTikla(an, ui, b({ act: 'an.git', u: '999', q: '8' })), false);
  eq(A.analizTikla(an, ui, b({ act: 'an.git', u: '131', q: '13' })), false);
  eq(an.urun, 131);
});
test('Kalite listesi aç/kapat, kalite seçince kapanır, dönem seçimi', () => {
  const an = A.varsayilanAnaliz(), ui = { kaynak: 'harita', qAcik: false };
  const b = (dataset) => ({ dataset });
  eq(A.analizTikla(an, ui, b({ act: 'an.qac' })), 'ciz'); eq(ui.qAcik, true);
  eq(A.analizTikla(an, ui, b({ act: 'an.q', q: '2' })), 'ciz'); eq([an.q, ui.qAcik], [2, false]);
  eq(A.analizTikla(an, ui, b({ act: 'an.aralik', v: '14' })), 'ciz'); eq(an.aralik, 14);
  eq(A.analizTikla(an, ui, b({ act: 'an.aralik', v: '5' })), false);
  eq(A.analizTikla(an, ui, b({ act: 'rt.metrik' })), false);
});
test('Ürün seçici', () => {
  const an = A.varsayilanAnaliz();
  ok(A.analizDegis(an, { dataset: { an: 'urun' }, value: '124' })); eq(an.urun, 124);
  eq(A.analizDegis(an, { dataset: { an: 'urun' }, value: '1' }), false);
  eq(A.analizDegis(an, { dataset: {}, value: '124' }), false);
});

section('Çizim');
test('Harita: 16 ürün × 13 kalite, her hücre düğme ve Grafik\'e gider; kademeli renk sınıfları; "%3,9" yazmaz', () => {
  const h = A.haritaHtml(A.varsayilanAnaliz(), marketOf);
  eq((h.match(/data-act="an.git"/g) || []).length, 16 * 13);
  ok(/class="an-t t-[gr]\d/.test(h) && h.includes('data-k="harita"'));
  for (const k of ['Salata barı', 'Ana yemek', 'İçecek', 'Referans maliyet']) ok(h.includes(k), k);
  ok(!/%\s?3[,.]9|3[,.]9\s?%/.test(h), '%3,9 görünüyor');
  ok(!h.includes('data-act="an.renk"'));
});
test('Harita: fiyatı olmayan hücre "—" ve tıklanamaz', () => {
  const h = A.haritaHtml(A.varsayilanAnaliz(), (id, q) => (id === 117 ? null : marketOf(id, q)));
  eq((h.match(/data-act="an.git"/g) || []).length, 15 * 13);
  ok(h.includes('t-yok'));
});
test('Maliyet: tutar hücreleri Grafik\'e gider (kaynak maliyet), mavi en ucuz, çarpan ve oturma düğmeleri', () => {
  const h = A.maliyetHtml({ carpan: 2, tip: 'eko' }, marketOf);
  eq((h.match(/data-act="an.git"/g) || []).length, 16 * 13);
  ok(h.includes('data-k="maliyet"') && h.includes('class="an-t low"') && h.includes('data-act="rt.carpan"') && h.includes('data-act="rt.tip"'));
  ok(!/Doluluk|Kâr/.test(h));
});
test('Grafik: kalite listesi kapalıyken düğme yok, açıkken 13 düğme ve oranlar; karar ve yorum', () => {
  const an = { urun: 142, q: 6, aralik: 30 };
  const kapali = A.grafikHtml(an, marketOf, { state: 'loading' }, { kaynak: 'harita', qAcik: false });
  eq((kapali.match(/data-act="an.q"/g) || []).length, 13); // grafik noktaları (svg), liste değil
  ok(!kapali.includes('id="an-qs"') && kapali.includes('Kalite: Q6') && kapali.includes('değiştir'));
  ok(kapali.includes('Harita\'ya dön') && kapali.includes('Geçmiş yükleniyor'));
  const acik = A.grafikHtml(an, marketOf, { state: 'loading' }, { kaynak: 'maliyet', qAcik: true });
  ok(acik.includes('id="an-qs"') && acik.includes('Maliyet\'e dön'));
  eq((acik.match(/<button type="button" data-act="an.q"/g) || []).length, 13);
  ok(/Q\d+ · [+−]%\d+/.test(acik));
  ok(acik.includes('Eşiğin altındaki en yüksek kalite') || acik.includes('Hiçbir kalite eşiğin altında değil'));
  ok(!/%\s?3[,.]9|3[,.]9\s?%/.test(acik), '%3,9 görünüyor');
  ok(!/<table/.test(acik), 'Grafik sekmesinde tablo olmamalı');
});
test('Grafik: geçmiş yüklenmiş, hata ve kayıt yok durumları', () => {
  const an = { urun: 142, q: 6, aralik: 30 };
  const h = { today: '2026-10-28', rows: new Map([['2026-10-27', { 6: [900, 950, 890, 940] }], ['2026-10-28', { 6: [940, 960, 930, 950] }]]) };
  const dolu = A.grafikHtml(an, marketOf, { state: 'ok', h }, {});
  ok(dolu.includes('Fiyat geçmişi') && dolu.includes('en düşük') && dolu.includes('günün') && dolu.includes('bugün eşiğin'));
  ok(A.grafikHtml(an, marketOf, { state: 'err' }, {}).includes('Geçmiş okunamadı'));
  ok(A.grafikHtml(an, marketOf, { state: 'ok', h: { today: '2026-10-28', rows: new Map() } }, {}).includes('için bu dönemde kayıt yok'));
  ok(!dolu.includes('<script'));
});
test('Grafik: borsada fiyat yokken bozulmaz', () => {
  const h = A.grafikHtml({ urun: 117, q: 9, aralik: 7 }, () => null, { state: 'loading' }, {});
  ok(h.includes('Bu ürün için borsada fiyat yok') && h.includes('Kalite: Q9'));
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
