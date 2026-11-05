// DentSimco — Restoran › Analiz sınamaları (Harita, Grafik, Maliyet). Çalıştırma: node test/restoran_analiz_test.mjs
// Hesap (restoran-analiz.js): referans, eşik, sapma, renk kademesi, yorum, geçmiş serisi, seçim kaydı, olaylar ve çizim.

import * as A from '../public/restoran-analiz.js';
import * as R from '../public/hesap-restoran.js';
import * as RR from '../public/restoran-rating.js';

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

section('Referans ve ödenebilir pay');
test('Referans = 7200 ÷ oran; Köfte ≈ 2054, Salata ≈ 766, Süt = 25', () => {
  near(A.referans(131), 2054.2, 0.1); near(A.referans(142), 765.8, 0.1); near(A.referans(117), 25, 1e-9);
  eq(A.referans(1), null);
});
test('Ödenebilir pay = referans × K × (f(Q) − f(Q−1)); içbükey: ilk adımlar büyük, son adımlar küçük; Q0 ve Q13 için null', () => {
  const K = 15000 / (7200 * 6);
  near(A.DEGER_KATSAYISI, K, 1e-12);
  near(A.odenebilir(142, 5), A.referans(142) * K * (RR.kalitePuani(5) - RR.kalitePuani(4)), 1e-9);
  for (let q = 2; q <= 12; q++) ok(A.odenebilir(142, q) < A.odenebilir(142, q - 1), `azalan Q${q}`);
  eq(A.odenebilir(142, 0), null); eq(A.odenebilir(142, 13), null); eq(A.odenebilir(1, 5), null);
  // referansın yüzdesi olarak: yeni eğri Q0→Q1 ≈ %52·(1/…) ölçeğinde, Q11→Q12 ≈ %2
  const yuzdeRef = (q) => A.odenebilir(142, q) / A.referans(142) / K * 6 / 2.0833; // f farkı ÷ 6'nın ×2,083'ü
  near(A.odenebilir(142, 12) / A.referans(142) * 100, 2.1, 0.2, 'Q11→Q12 ≈ referansın %2,1\'i');
  near(A.odenebilir(142, 1) / A.referans(142) * 100, 52, 1.5, 'Q0→Q1 ≈ referansın %52\'si');
  ok(yuzdeRef(1) > 0);
});
test('Kalite puanı: Q0 ≈ 0,4, Q5 ≈ 4,9, Q12 ≈ 6,1; artan ve içbükey', () => {
  near(RR.kalitePuani(0), 0.4, 0.01); near(RR.kalitePuani(5), 4.92, 0.03); near(RR.kalitePuani(12), 6.11, 0.03);
  eq(RR.kalitePuani(null), null);
  for (let q = 1; q <= 12; q++) ok(RR.kalitePuani(q) > RR.kalitePuani(q - 1));
});
test('Adım: bir alt kaliteye göre artış, ödenebilir pay, fark; ilan yoksa null', () => {
  const m = (id, q) => (q === 5 ? 100 : q === 6 ? 110 : null);
  const s = A.adim(m, 142, 6);
  near(s.onceki, 100, 1e-9); near(s.simdi, 110, 1e-9); near(s.art, 10, 1e-9); near(s.a, 0.1, 1e-9);
  near(s.pay, A.odenebilir(142, 6) / 100, 1e-9); near(s.fark, s.a - s.pay, 1e-12);
  eq(A.adim(m, 142, 7), null); eq(A.adim(m, 142, 5), null); eq(A.adim(m, 142, 0), null);
  ok(A.adim((id, q) => 100 * (1 + 0.02 * q), 142, 6).ucuz);
  ok(!A.adim((id, q) => 100 * (1 + 0.05 * q), 142, 6).ucuz);
});

section('Renk kademesi (±1, 3, 8, 20 puan)');
test('Sınırlar: ±1 puan içi nötr, sonra 4 ton; payın altı g, üstü r, veri yoksa yok', () => {
  eq([0, 0.009, -0.009].map(A.ton), ['n', 'n', 'n']);
  eq([-0.01, -0.029, -0.03, -0.079, -0.08, -0.199, -0.2, -0.9].map(A.ton), ['g1', 'g1', 'g2', 'g2', 'g3', 'g3', 'g4', 'g4']);
  eq([0.01, 0.029, 0.03, 0.079, 0.08, 0.199, 0.2, 2].map(A.ton), ['r1', 'r1', 'r2', 'r2', 'r3', 'r3', 'r4', 'r4']);
  eq([null, undefined, NaN].map(A.ton), ['yok', 'yok', 'yok']);
});
test('Yüzde ve puan metni: işaretli, tam sayı; sıfır "%0" / "0"', () => {
  eq([0.123, -0.126, 0.001, -0.004, 1.5].map(A.yuzde), ['+%12', '−%13', '%0', '%0', '+%150']);
  eq([0.123, -0.126, 0.001].map(A.puan), ['+12', '−13', '0']);
});

section('Zincir, eşik ve yorum');
// Fiyat kalite başına referansın %2 artıyor (Q0 = referans): her adım küçük pay altında
const ucuzKademe = (id, q) => A.referans(id) * (1 + 0.005 * q);
const pahaliKademe = (id, q) => A.referans(id) * (1 + 1.0 * q);
test('Yükseltmeye değen en yüksek kalite: ucuz kademede Q12, çok pahalı kademede en düşük kalite; ilan yoksa null', () => {
  eq(A.yukseltmeKalitesi(ucuzKademe, 142), 12);
  eq(A.yukseltmeKalitesi(pahaliKademe, 142), 0);
  eq(A.yukseltmeKalitesi(() => null, 142), null);
  eq(A.enDusukKalite((id, q) => (q >= 3 ? 10 : null), 142), 3);
  eq(A.yukseltmeKalitesi((id, q) => (q >= 3 ? 10 : null), 142), 12, 'fiyat aynı: bedava yükseltme');
});
test('Zincir ilk aşılan adımda ya da ilansız adımda durur', () => {
  const m = (id, q) => (q <= 4 ? A.referans(id) * (1 + 0.005 * q) : q === 5 ? A.referans(id) * 3 : A.referans(id) * (3 + 0.005 * q));
  eq(A.yukseltmeKalitesi(m, 142), 4);
  eq(A.yukseltmeKalitesi((id, q) => (q <= 2 || q === 4 ? 100 : null), 142), 2, 'Q3 ilansız');
});
test('Eşik çizgisi: en düşük ilanlı kalitenin fiyatından başlar, her adımda ödenebilir payı ekler; altındaki kalite ve ilansız ürün null', () => {
  const m = (id, q) => (q >= 2 ? 100 + q : null);
  near(A.tavan(m, 142, 2), 102, 1e-9);
  near(A.tavan(m, 142, 5), 102 + A.odenebilir(142, 3) + A.odenebilir(142, 4) + A.odenebilir(142, 5), 1e-9);
  eq(A.tavan(m, 142, 1), null); eq(A.tavan(() => null, 142, 5), null);
});
test('Yorum: en düşük kalite, yükseltin (ucuz), yükseltmeye değer, yükseltmeyin, önceki yok, ilan yok', () => {
  eq(A.yorum(ucuzKademe, 142, 0), 'İlan bulunan en düşük kalite');
  ok(A.yorum(ucuzKademe, 142, 4).includes('ucuz, yükseltin'));
  ok(A.yorum(pahaliKademe, 142, 4).includes('yükseltmeyin'));
  const m = (id, q) => A.referans(id) * (1 + 0.08 * q); // adım ≈ %8: Q3'te pay yüksek, Q10'da düşük
  ok(A.yorum(m, 142, 3).includes('yükseltmeye değer') || A.yorum(m, 142, 3).includes('yükseltin'));
  ok(A.yorum(m, 142, 12).includes('yükseltmeyin'));
  eq(A.yorum((id, q) => (q === 5 ? 10 : null), 142, 6), 'Borsada ilan yok');
  eq(A.yorum((id, q) => (q === 6 || q === 3 ? 10 : null), 142, 6), 'Bir alt kalitede ilan yok');
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
  eq((h.match(/class="an-t [^"]*best/g) || []).length, 16, 'her ürüne bir ★');
  eq((h.match(/data-act="an.git"/g) || []).length, 16 * 13);
  ok(/class="an-t t-[gr]\d/.test(h) && h.includes('data-k="harita"'));
  for (const k of ['Salata barı', 'Ana yemek', 'İçecek', 'Referans maliyet', 'Kalite adımı haritası']) ok(h.includes(k), k);
  // her hücre bir alt kaliteye göre artışı gösterir; ilk ilanlı kalitede fiyatın kendisi
  ok(/\+%\d+|−%\d+|%0/.test(h) && h.includes('$'));
  ok(h.includes('adım ≤ %3'));
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
  ok(/Q\d+ · [+−]%\d+|Q\d+ · %0/.test(acik));
  ok(acik.includes('Yükseltmeye değen en yüksek kalite: Q') || acik.includes('Yükseltmeye değen kalite yok'));
  ok(acik.includes('Ödenebilir pay') && acik.includes('Fiyat artışı') && acik.includes('Fark (puan)'));
  ok(!/%\s?3[,.]9|3[,.]9\s?%/.test(acik), '%3,9 görünüyor');
  ok(!/<table/.test(acik), 'Grafik sekmesinde tablo olmamalı');
});
test('Grafik: geçmiş yüklenmiş, hata ve kayıt yok durumları', () => {
  const an = { urun: 142, q: 6, aralik: 30 };
  const h = { today: '2026-10-28', rows: new Map([['2026-10-27', { 6: [900, 950, 890, 940] }], ['2026-10-28', { 6: [940, 960, 930, 950] }]]) };
  const dolu = A.grafikHtml(an, marketOf, { state: 'ok', h }, {});
  ok(dolu.includes('Fiyat geçmişi') && dolu.includes('en düşük') && dolu.includes('günün') && dolu.includes('bugün eşiğin') || dolu.includes('Fiyat geçmişi') && dolu.includes('en düşük'));
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
