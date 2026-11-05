// DentSimco — Restoran › Analiz › Menü Seç sınamaları. Çalıştırma: node test/restoran_menusec_test.mjs
// restoran-menusec.js: yönetici bonusu, adet, en ucuz menü (kaba kuvvetle karşılaştırma), ulaşılamayan hedef, ilan eksikliği,
// diğer çeşit dağılımları, kayıt, olaylar ve çizim. Rating modeli restoran-rating.js menuRatingi (Kasım).

import * as MS from '../public/restoran-menusec.js';
import * as R from '../public/hesap-restoran.js';
import * as RR from '../public/restoran-rating.js';
import { vwapOf } from './restoran-vwap-veri-ornek.mjs';

const results = [];
let group = '';
const section = (name) => { group = name; };
function test(name, fn) {
  try { fn(); results.push({ group, name, ok: true }); } catch (e) { results.push({ group, name, ok: false, error: e.message }); }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} beklenen ${b}, bulunan ${a}`);
}
function near(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} beklenen ${expected} (±${tol}), bulunan ${actual}`);
}
function ok(value, label = 'koşul sağlanmadı') { if (!value) throw new Error(label); }

// Borsa: 4 Kasım 2026 günlük VWAP'ı (dünkü VWAP, gerçek veri). Bazı kalitelerde o gün işlem yok (null): ilan yok gibi davranır.
const marketOf = vwapOf;

// Kaba kuvvet: kategoride n farklı ürün ve her biri için her kalite; hedefe ulaşan en ucuz menünün maliyeti
function kabaKuvvet(m, cesit, { hedef, bonus = 0, tip = 'eko', seviye = 1 }) {
  const kat = R.KATEGORILER.map((k) => {
    const n = cesit[k.key], out = [];
    const rec = (i, secili) => {
      if (secili.length === n) { out.push(secili); return; }
      if (i >= k.urunler.length) return;
      rec(i + 1, secili);
      const id = k.urunler[i], a = MS.adet(id, n, seviye, tip);
      for (let q = 0; q <= 12; q++) { const p = m(id, q); if (p > 0) rec(i + 1, [...secili, { puan: MS.puanBirim(q), tutar: a * p, gercek: RR.kalitePuani(q) }]); }
    };
    rec(0, []);
    return out.map((s) => ({ p: s.reduce((t, x) => t + x.puan, 0), c: s.reduce((t, x) => t + x.tutar, 0) }));
  });
  const N = Object.values(cesit).reduce((t, x) => t + x, 0), S = MS.gerekliPuan(N, { hedef, bonus, tip });
  let best = Infinity;
  for (const a of kat[0]) for (const b of kat[1]) for (const c of kat[2]) if (a.p + b.p + c.p >= S) best = Math.min(best, a.c + b.c + c.c);
  return best;
}

section('Model ve bonus');
test('Kasım modeli: (ortalama puan × (1 + 0,037 × (N − 6)) + bonus) × oturma; lüks 1,25; 0–10 arası', () => {
  near(RR.menuRatingi({ puanOrt: 5, urunSayisi: 6, bonus: 0 }), 5, 1e-12);
  near(RR.menuRatingi({ puanOrt: 5, urunSayisi: 8, bonus: 0.5 }), 5 * 1.074 + 0.5, 1e-12);
  near(RR.menuRatingi({ puanOrt: 5, urunSayisi: 6, bonus: 1, tip: 'luks' }), 6 * 1.25, 1e-12);
  eq(RR.menuRatingi({ puanOrt: 50, urunSayisi: 6 }), 10); eq(RR.menuRatingi({ puanOrt: null, urunSayisi: 6 }), null);
});
test('Yönetici bonusu = 0,01 × etkin iletişim + 0,02 × ekip dışı satış hızı %; eksi ve boş değer 0', () => {
  const y = MS.yoneticiBonusu(34, 8);
  near(y.iletisimPuan, 0.34, 1e-12); near(y.hizPuan, 0.16, 1e-12); near(y.toplam, 0.5, 1e-12);
  eq(MS.yoneticiBonusu(-5, null).toplam, 0);
});
test('Adet = yukarı yuvarla(oran × kategori çarpanı × seviye × lüks)', () => {
  eq(MS.adet(129, 1), Math.ceil(3.608 * 2.1)); eq(MS.adet(117, 2, 3), 864); eq(MS.adet(117, 2, 3, 'luks'), 432); eq(MS.adet(1, 2), 0);
});

section('En ucuz menü');
for (const [cesit, hedef, bonus, tip] of [[{ salata: 2, ana: 1, icecek: 2 }, 5.5, 0.5, 'eko'], [{ salata: 1, ana: 2, icecek: 1 }, 5, 0, 'eko'], [{ salata: 2, ana: 2, icecek: 1 }, 4.5, 0.3, 'luks']]) {
  const k = Object.values(cesit).join('-');
  test(`${k}, hedef ${hedef}, ${tip}: kaba kuvvetle aynı maliyet; rating ≥ hedef; çeşit ve ürünler doğru`, () => {
    const m = MS.menuSec(marketOf, { cesit, hedef, bonus, tip });
    ok(m.kategoriler, JSON.stringify(m));
    near(m.toplam, kabaKuvvet(marketOf, cesit, { hedef, bonus, tip }), 1e-6, 'maliyet');
    ok(m.rating >= hedef - 1e-9, `rating ${m.rating}`);
    eq(m.cesit, k); eq(m.urunSayisi, Object.values(cesit).reduce((t, x) => t + x, 0));
    for (const kt of m.kategoriler) {
      eq(kt.urunler.length, cesit[kt.key]);
      eq(new Set(kt.urunler.map((u) => u.id)).size, kt.urunler.length, 'aynı ürün iki kez');
      for (const u of kt.urunler) { ok(R.URUNLER[u.id].kat === kt.key); near(u.tutar, u.adet * marketOf(u.id, u.q), 1e-9); }
    }
    near(m.rating, RR.menuRatingi({ puanOrt: m.puanOrt, urunSayisi: m.urunSayisi, bonus, tip }), 1e-12);
  });
}
test('Yönetici bonusu arttıkça menü ucuzlar (ya da aynı kalır)', () => {
  const o = { cesit: { salata: 2, ana: 2, icecek: 2 }, hedef: 6 };
  const a = MS.menuSec(marketOf, { ...o, bonus: 0 }), b = MS.menuSec(marketOf, { ...o, bonus: 0.8 });
  ok(a.kategoriler && b.kategoriler && b.toplam <= a.toplam + 1e-9);
});
test('Seviye maliyeti ölçekler', () => {
  const o = { cesit: { salata: 2, ana: 1, icecek: 2 }, hedef: 5 };
  const a = MS.menuSec(marketOf, o), b = MS.menuSec(marketOf, { ...o, seviye: 10 });
  ok(b.toplam > a.toplam * 9);
});
test('Hedef çok yüksek: ulaşılamaz, en yüksek rating verilir ve hedefin altındadır', () => {
  const m = MS.menuSec(marketOf, { cesit: { salata: 1, ana: 1, icecek: 1 }, hedef: 9.5 });
  ok(m.yok && m.enYuksek > 0 && m.enYuksek < 9.5, JSON.stringify(m));
});
test('Borsada yeterli ilan yok: eksik kategori adları', () => {
  const m = MS.menuSec((id, q) => (R.URUNLER[id].kat === 'icecek' ? null : marketOf(id, q)), { cesit: { salata: 1, ana: 1, icecek: 1 }, hedef: 5 });
  eq(m.eksik, ['İçecek']);
});
test('Diğer dağılımlar: seçilenden daha ucuz, ucuzdan pahalıya, en çok 3, seçilen yok', () => {
  const o = { cesit: { salata: 3, ana: 3, icecek: 3 }, hedef: 6 };
  const ana = MS.menuSec(marketOf, o), alt = MS.digerDagilimlar(marketOf, o);
  ok(alt.length >= 1 && alt.length <= 3);
  for (let i = 0; i < alt.length; i++) { ok(alt[i].toplam < ana.toplam); ok(alt[i].cesit !== '3-3-3'); ok(alt[i].rating >= 6 - 1e-9); if (i) ok(alt[i].toplam >= alt[i - 1].toplam); }
});

section('Kayıt ve olaylar');
test('Bozuk kayıt temizlenir', () => {
  eq(MS.temizleMenuSec(null), MS.varsayilanMenuSec());
  eq(MS.temizleMenuSec({ cesit: { salata: 9, ana: 0, icecek: '3' }, hedef: 12, seviye: -2, tip: 'x' }), { cesit: { salata: 6, ana: 1, icecek: 3 }, hedef: 10, seviye: 1, tip: 'eko' });
});
test('Çeşit düğmeleri sınırda durur; oturma; dağılım seçimi; değer girişleri', () => {
  const st = MS.varsayilanMenuSec(), b = (dataset) => ({ dataset });
  ok(MS.menuSecTikla(st, b({ act: 'ms.cesit', k: 'ana', v: '-1' }))); eq(st.cesit.ana, 1);
  MS.menuSecTikla(st, b({ act: 'ms.cesit', k: 'ana', v: '-1' })); eq(st.cesit.ana, 1);
  for (let i = 0; i < 9; i++) MS.menuSecTikla(st, b({ act: 'ms.cesit', k: 'icecek', v: '1' })); eq(st.cesit.icecek, 4);
  eq(MS.menuSecTikla(st, b({ act: 'ms.cesit', k: 'x', v: '1' })), false);
  ok(MS.menuSecTikla(st, b({ act: 'ms.tip', v: 'luks' }))); eq(st.tip, 'luks');
  ok(MS.menuSecTikla(st, b({ act: 'ms.dagilim', v: '1-2-3' }))); eq(st.cesit, { salata: 1, ana: 2, icecek: 3 });
  eq(MS.menuSecTikla(st, b({ act: 'ms.dagilim', v: '1-2-9' })), false);
  ok(MS.menuSecDegis(st, { dataset: { ms: 'hedef' }, value: '6,75' })); eq(st.hedef, 6.75);
  eq(MS.menuSecDegis(st, { dataset: { ms: 'hedef' }, value: 'abc' }), false);
  ok(MS.menuSecDegis(st, { dataset: { ms: 'seviye' }, value: '4' })); eq(st.seviye, 4);
  eq(MS.menuSecDegis(st, { dataset: {}, value: '4' }), false);
});

section('Çizim');
test('Menü Seç: çeşit düğmeleri, hedef, etkin iletişim dökümü, rating hesabı ve menü tablosu', () => {
  const h = MS.menuSecHtml({ cesit: { salata: 2, ana: 1, icecek: 2 }, hedef: 5.5, seviye: 1, tip: 'eko' }, marketOf, { iletisim: 34, hiz: 8 });
  for (const s of ['Menü Seç', 'data-ms="hedef"', 'data-ms="seviye"', 'data-act="ms.tip"', 'Etkin iletişim 34 × 0,01', '+0,34', 'satış hızı %8 × 0,02', '+0,16', 'Yönetici bonusu', '+0,50', 'Tahmini rating', 'Önerilen menü'
  ]) ok(h.includes(s), s);
  ok(!h.includes('Ort. ürün puanı'), 'formül gösterilmez');
  eq((h.match(/data-act="ms.cesit"/g) || []).length, 6);
  ok(!h.includes('CMO'), 'CMO yazmamalı');
});
test('Menü Seç: ulaşılamayan hedef ve ilan eksikliği mesajı', () => {
  ok(MS.menuSecHtml({ cesit: { salata: 1, ana: 1, icecek: 1 }, hedef: 9.5, seviye: 1, tip: 'eko' }, marketOf).includes('ulaşılamıyor'));
  ok(MS.menuSecHtml({ cesit: { salata: 1, ana: 1, icecek: 1 }, hedef: 5, seviye: 1, tip: 'eko' }, () => null).includes('Borsada yeterli ilan yok'));
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
