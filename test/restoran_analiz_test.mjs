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

section('Referans ve rating adımı');
test('Referans = 7200 ÷ oran; Köfte ≈ 2054, Salata ≈ 766, Süt = 25', () => {
  near(A.referans(131), 2054.2, 0.1); near(A.referans(142), 765.8, 0.1); near(A.referans(117), 25, 1e-9);
  eq(A.referans(1), null);
});
test('Kalite puanı: Q0 ≈ 0,4, Q5 ≈ 4,9, Q12 ≈ 6,1; artan ve içbükey; adım artışı Q0→Q1 ≈ 1,5, Q11→Q12 ≈ 0,06', () => {
  near(RR.kalitePuani(0), 0.4, 0.01); near(RR.kalitePuani(5), 4.92, 0.03); near(RR.kalitePuani(12), 6.11, 0.03);
  eq(RR.kalitePuani(null), null);
  for (let q = 2; q <= 12; q++) ok(A.puanArtisi(q) < A.puanArtisi(q - 1), `azalan Q${q}`);
  near(A.puanArtisi(1), 1.49, 0.03); near(A.puanArtisi(12), 0.06, 0.01);
  eq(A.puanArtisi(0), null); eq(A.puanArtisi(13), null);
});
test('Adım: bir alt kaliteye göre artış, rating artışı, maliyet = artış × oran ÷ (menü artışı ÷ 0,01); ilan yoksa null', () => {
  const m = (id, q) => (q === 5 ? 100 : q === 6 ? 110 : null);
  const s = A.adim(m, 142, 6);
  near(s.onceki, 100, 1e-9); near(s.simdi, 110, 1e-9); near(s.art, 10, 1e-9); near(s.a, 0.1, 1e-9);
  near(s.puan, A.puanArtisi(6), 1e-12); near(s.menu, A.puanArtisi(6) / 6, 1e-12);
  near(s.maliyet, (10 * R.URUNLER[142].oran) / (s.menu / 0.01), 1e-9);
  eq(A.adim(m, 142, 7), null); eq(A.adim(m, 142, 5), null); eq(A.adim(m, 142, 0), null); eq(A.adim(m, 1, 6), null);
  ok(A.adim((id, q) => 100 * (1 + 0.02 * q), 142, 6).ucuz);
  ok(!A.adim((id, q) => 100 * (1 + 0.05 * q), 142, 6).ucuz);
  ok(A.adim((id, q) => 100 - q, 142, 6).maliyet < 0, 'fiyat düşerse maliyet ≤ 0');
});
test('Maliyet sırası ve yüzdelik: sıralı; en ucuz ≈ 0, en pahalı ≈ 1, eşitler ortada', () => {
  const sira = A.maliyetSirasi(marketOf);
  eq(sira.length, 16 * 12);
  for (let i = 1; i < sira.length; i++) ok(sira[i] >= sira[i - 1]);
  ok(A.yuzdelik(sira, sira[0]) < 0.02 && A.yuzdelik(sira, sira[sira.length - 1]) > 0.98);
  near(A.yuzdelik([1, 2, 2, 2, 5], 2), 0.5, 1e-9);
  eq(A.yuzdelik([], 1), null); eq(A.yuzdelik([1, 2], NaN), null);
  eq(A.maliyetSirasi(() => null), []);
});

section('Renk kademesi (yüzdelik: %10, 20, 30, 40, 60, 70, 80, 90)');
test('Sınırlar: en ucuz %10 g4 … %40 g1, orta %40–60 n, %60–70 r1 … en pahalı %10 r4; veri yoksa yok', () => {
  eq([0, 0.05, 0.1, 0.19, 0.2, 0.29, 0.3, 0.39].map(A.ton), ['g4', 'g4', 'g3', 'g3', 'g2', 'g2', 'g1', 'g1']);
  eq([0.4, 0.5, 0.59, 0.6, 0.69, 0.7, 0.79, 0.8, 0.89, 0.9, 1].map(A.ton), ['n', 'n', 'n', 'r1', 'r1', 'r2', 'r2', 'r3', 'r3', 'r4', 'r4']);
  eq([null, undefined, NaN].map(A.ton), ['yok', 'yok', 'yok']);
});
test('Yüzde metni: işaretli, tam sayı; sıfır "%0"', () => {
  eq([0.123, -0.126, 0.001, -0.004, 1.5].map(A.yuzde), ['+%12', '−%13', '%0', '%0', '+%150']);
});

section('Yorum');
test('Yorum: en düşük kalite, bedava, adım ve sıralama, önceki yok, ilan yok', () => {
  const ucuz = (id, q) => A.referans(id) * (1 + 0.005 * q);
  eq(A.yorum(ucuz, 142, 0), 'İlan bulunan en düşük kalite');
  ok(A.yorum(ucuz, 142, 4).includes('Adım %') && A.yorum(ucuz, 142, 4).includes('daha ucuz'));
  ok(A.yorum(ucuz, 142, 4).includes('adım ≤ %3'));
  ok(A.yorum((id, q) => 100 - q, 142, 5).includes('bedava'));
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
test('Harita: 16 ürün × 13 kalite, her hücre düğme ve Grafik\'e gider; kademeli renk sınıfları; tek birim (ilk ilanlı kalitede fiyat değil "ilk"); kâr ve katsayı yazmaz', () => {
  const h = A.haritaHtml(A.varsayilanAnaliz(), marketOf);
  eq((h.match(/data-act="an.git"/g) || []).length, 16 * 13);
  ok(/class="an-t t-[gr]\d/.test(h) && h.includes('data-k="harita"'));
  for (const k of ['Salata barı', 'Ana yemek', 'İçecek', 'Rating başına maliyet haritası']) ok(h.includes(k), k);
  ok(h.includes('+0,01 rating') && h.includes('$'));
  eq((h.match(/class="an-t t-n ilk[^"]*"><button[^>]*>ilk</g) || []).length, 16, 'her ürünün Q0 hücresi "ilk"');
  ok(!h.includes('Referans maliyet') && !h.includes('adım ≤ %3') && !h.includes('ucuz"'), 'eski kart ve • işareti kalkmalı');
  ok(!h.includes('★') && !h.includes('an-star'), '★ (kâr kararı) olmamalı');
  ok(!/%\s?3[,.]9|3[,.]9\s?%|15\.000|15000/.test(h), 'katsayı görünüyor');
});
test('Harita: fiyatı olmayan hücre "—" ve tıklanamaz; bir alt kalitesi ilansız hücre "?"', () => {
  const h = A.haritaHtml(A.varsayilanAnaliz(), (id, q) => (id === 117 ? null : marketOf(id, q)));
  eq((h.match(/data-act="an.git"/g) || []).length, 15 * 13);
  ok(h.includes('t-yok'));
  const g = A.haritaHtml(A.varsayilanAnaliz(), (id, q) => (id === 117 && q === 4 ? null : marketOf(id, q)));
  ok(/data-u="117" data-q="5"[^>]*>\?</.test(g), 'Q4 ilansızken Q5 "?"');
});
test('Maliyet: tutar hücreleri Grafik\'e gider (kaynak maliyet), mavi en ucuz, çarpan ve oturma düğmeleri', () => {
  const h = A.maliyetHtml({ carpan: 2, tip: 'eko' }, marketOf);
  eq((h.match(/data-act="an.git"/g) || []).length, 16 * 13);
  ok(h.includes('data-k="maliyet"') && h.includes('class="an-t low"') && h.includes('data-act="rt.carpan"') && h.includes('data-act="rt.tip"'));
  ok(!/Doluluk|Kâr/.test(h));
});
test('Grafik: kalite listesi kapalıyken düğme yok, açıkken 13 düğme ve oranlar; tek fiyat grafiği ve tek özet', () => {
  const an = { urun: 142, q: 6, aralik: 30 };
  const kapali = A.grafikHtml(an, marketOf, { state: 'loading' }, { kaynak: 'harita', qAcik: false });
  eq((kapali.match(/data-act="an.q"/g) || []).length, 13); // fiyat grafiğinin noktaları, liste değil
  ok(!kapali.includes('id="an-qs"') && kapali.includes('Kalite: Q6 · $') && kapali.includes('değiştir'));
  ok(kapali.includes('Harita\'ya dön') && kapali.includes('Geçmiş yükleniyor'));
  const acik = A.grafikHtml(an, marketOf, { state: 'loading' }, { kaynak: 'maliyet', qAcik: true });
  ok(acik.includes('id="an-qs"') && acik.includes('Maliyet\'e dön'));
  eq((acik.match(/<button type="button" data-act="an.q"/g) || []).length, 13);
  ok(/Q\d+ · [+−]%\d+|Q\d+ · %0/.test(acik));
  ok(acik.includes('Q5 → Q6: +0,01 rating ≈ $') && acik.includes('menü ratingi +') && acik.includes('Kalitelere göre borsa fiyatı'));
  ok(!acik.includes('Ürün kalite puanı') && !acik.includes('an-tiles') && !acik.includes('Referans'), 'tekrarlayan grafik ve kutucuklar kalkmalı');
  ok(!acik.includes('Yükseltmeye değen') && !acik.includes('Ödenebilir'), 'kâr kararı olmamalı');
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
  ok(h.includes('Bu kalitede borsada ilan yok') && h.includes('Kalite: Q9'));
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
