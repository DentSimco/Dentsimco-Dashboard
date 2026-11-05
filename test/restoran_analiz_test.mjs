// DentSimco — Restoran › Analiz sınamaları (Harita, Grafik, Maliyet). Çalıştırma: node test/restoran_analiz_test.mjs
// restoran-analiz.js: rating hücresi, renk kademesi, seçim kaydı, olaylar ve çizim. Harita ve Grafik yalnız rating gösterir.

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

// Her ürünün Q0 fiyatı 7200 ÷ oran'ın %90'ı; kaliteyle %8 artar
const marketOf = (id, q) => (7200 / R.URUNLER[id].oran) * 0.9 * (1 + 0.08 * q);

section('Rating');
test('Kalite puanı: Q0 ≈ 0,4, Q5 ≈ 4,9, Q12 ≈ 6,1; artan ve içbükey', () => {
  near(RR.kalitePuani(0), 0.4, 0.01); near(RR.kalitePuani(5), 4.92, 0.03); near(RR.kalitePuani(12), 6.11, 0.03);
  for (let q = 2; q <= 12; q++) ok(RR.kalitePuani(q) - RR.kalitePuani(q - 1) < RR.kalitePuani(q - 1) - RR.kalitePuani(q - 2), `içbükey Q${q}`);
});
test('Hücre ratingi = ürünün kalite puanı; ilan yoksa ya da ürün bilinmiyorsa null', () => {
  near(A.ratingOf(marketOf, 142, 6), RR.kalitePuani(6), 1e-12);
  eq(A.ratingOf(() => null, 142, 6), null); eq(A.ratingOf(marketOf, 1, 6), null);
});
test('Renk kademesi: <2 h1, <3,5 h2, <4,8 h3, <5,6 h4, üstü h5; veri yoksa yok', () => {
  eq([0.4, 1.99, 2, 3.49, 3.5, 4.79, 4.8, 5.59, 5.6, 6.1].map(A.ton), ['h1', 'h1', 'h2', 'h2', 'h3', 'h3', 'h4', 'h4', 'h5', 'h5']);
  eq([null, undefined, NaN].map(A.ton), ['yok', 'yok', 'yok']);
});

section('Seçim kaydı ve olaylar');
test('Bozuk kayıt temizlenir; ürün ve kalite sınırları', () => {
  eq(A.temizleAnaliz(null), A.varsayilanAnaliz());
  eq(A.temizleAnaliz({ urun: 5, q: 99, aralik: 3 }), { urun: A.varsayilanAnaliz().urun, q: 12 });
  eq(A.temizleAnaliz({ urun: '131', q: '4' }), { urun: 131, q: 4 });
});
test('an.git: ürün ve kaliteyi seçer, kaynağı bilir, Grafik\'e geçer; geçersiz değer reddedilir', () => {
  const an = A.varsayilanAnaliz(), ui = { kaynak: 'harita' };
  const b = (dataset) => ({ dataset });
  eq(A.analizTikla(an, ui, b({ act: 'an.git', u: '131', q: '8', k: 'maliyet' })), 'git');
  eq([an.urun, an.q, ui.kaynak], [131, 8, 'maliyet']);
  eq(A.analizTikla(an, ui, b({ act: 'an.git', u: '999', q: '8' })), false);
  eq(A.analizTikla(an, ui, b({ act: 'an.git', u: '131', q: '13' })), false);
  eq(A.analizTikla(an, ui, b({ act: 'rt.metrik' })), false);
  eq(an.urun, 131);
});
test('Ürün seçici', () => {
  const an = A.varsayilanAnaliz();
  ok(A.analizDegis(an, { dataset: { an: 'urun' }, value: '124' })); eq(an.urun, 124);
  eq(A.analizDegis(an, { dataset: { an: 'urun' }, value: '1' }), false);
  eq(A.analizDegis(an, { dataset: {}, value: '124' }), false);
});
test('Sekmeler: Harita, Grafik, Maliyet, Menü Seç (Menü Seç Maliyet\'in sağında)', () => {
  eq(A.SEKMELER.map(([k]) => k), ['harita', 'grafik', 'maliyet', 'menusec']);
});

section('Çizim');
test('Harita: 16 ürün × 13 kalite, hücre = rating, Grafik\'e gider; açıklama, fiyat ve maliyet yok', () => {
  const h = A.haritaHtml(A.varsayilanAnaliz(), marketOf);
  eq((h.match(/data-act="an.git"/g) || []).length, 16 * 13);
  ok(h.includes('Rating haritası') && h.includes('Salata barı') && h.includes('Ana yemek') && h.includes('İçecek'));
  ok(h.includes('>6,11<') && h.includes('>0,40<'), 'rating değerleri');
  ok(/class="an-t h[1-5]/.test(h));
  ok(!/\$|ur-sub|ur-note|an-leg|maliyet|Kâr|yorum/i.test(h.replace(/data-k="harita"/g, '')), 'açıklama ya da maliyet görünüyor');
});
test('Harita: ilanı olmayan hücre "—" ve tıklanamaz', () => {
  const h = A.haritaHtml(A.varsayilanAnaliz(), (id, q) => (id === 117 ? null : marketOf(id, q)));
  eq((h.match(/data-act="an.git"/g) || []).length, 15 * 13);
  ok(h.includes('<td class="yok">—</td>'));
});
test('Maliyet: tutar hücreleri Grafik\'e gider (kaynak maliyet), mavi en ucuz, çarpan ve oturma düğmeleri', () => {
  const h = A.maliyetHtml({ carpan: 2, tip: 'eko' }, marketOf);
  eq((h.match(/data-act="an.git"/g) || []).length, 16 * 13);
  ok(h.includes('data-k="maliyet"') && h.includes('class="an-t low"') && h.includes('data-act="rt.carpan"') && h.includes('data-act="rt.tip"'));
});
test('Grafik: yalnız rating eğrisi; fiyat, geçmiş, yorum ve kutucuk yok', () => {
  const g = A.grafikHtml({ urun: 142, q: 6 }, marketOf, { kaynak: 'harita' });
  ok(g.includes('Harita\'ya dön') && g.includes('data-an="urun"') && g.includes('Kaliteye göre rating'));
  eq((g.match(/<circle/g) || []).length, 13);
  ok(g.includes('>6,1<') && g.includes('class="an-sel"'));
  ok(!/\$|Borsa|geçmiş|Yorum|an-tiles|an-verdict|ur-note|ur-sub|<table/i.test(g), 'açıklama ya da fiyat görünüyor');
  ok(A.grafikHtml({ urun: 142, q: 6 }, marketOf, { kaynak: 'maliyet' }).includes('Maliyet\'e dön'));
});
test('Grafik: ilanı olmayan kaliteler çizilmez, hiç ilan yokken bozulmaz', () => {
  const g = A.grafikHtml({ urun: 142, q: 6 }, (id, q) => (q === 5 ? null : marketOf(id, q)), {});
  eq((g.match(/<circle/g) || []).length, 12); eq((g.match(/<polyline/g) || []).length, 2);
  const bos = A.grafikHtml({ urun: 117, q: 9 }, () => null, {});
  eq((bos.match(/<circle/g) || []).length, 0); ok(!bos.includes('<polyline'));
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
