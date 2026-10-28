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

section('Kategori seçenekleri (dinamik programlama)');
// Kaba kuvvet: kategorinin her ürünü için "seçilmez" ya da bir kalite; n ürün seçilen tüm atamalar
function kabaKuvvet(katKey, n, kMin, kMax, seviye = 1, tip = 'eko') {
  const ids = idler(katKey);
  const en = new Map();
  const rec = (i, secilen, s, toplam) => {
    if (i === ids.length) {
      if (secilen !== n) return;
      if (!en.has(s) || toplam < en.get(s)) en.set(s, toplam);
      return;
    }
    rec(i + 1, secilen, s, toplam);
    if (secilen < n) for (let q = kMin; q <= kMax; q++) rec(i + 1, secilen + 1, s + q, toplam + T.adet(ids[i], n, seviye, tip) * fiyat(ids[i], q));
  };
  rec(0, 0, 0, 0);
  return en;
}
test('Her kalite toplamı için en ucuz çözüm kaba kuvvetle aynı (salata, ana, içecek; küçük aralık)', () => {
  for (const [kat, n] of [['salata', 2], ['salata', 3], ['ana', 2], ['icecek', 4], ['icecek', 2]]) {
    const dp = T.kategoriSecenekleri(marketOf, kat, n, { kMin: 3, kMax: 5 });
    const kk = kabaKuvvet(kat, n, 3, 5);
    eq([...dp.keys()].sort((x, y) => x - y), [...kk.keys()].sort((x, y) => x - y), `${kat} ${n} toplamlar`);
    for (const [s, v] of dp) {
      near(v.toplam, kk.get(s), 1e-6, `${kat} ${n} toplam ${s}`);
      eq(v.urunler.length, n); eq(v.urunler.reduce((t, u) => t + u.q, 0), s);
      eq(new Set(v.urunler.map((u) => u.id)).size, n, 'ürün tekrarı');
      ok(v.urunler.every((u) => u.q >= 3 && u.q <= 5), 'aralık dışı');
    }
  }
});
test('Seviye ve lüks adedi yansır; aralık dışı ve fiyatsız kalite seçilmez', () => {
  const bir = T.kategoriSecenekleri(marketOf, 'ana', 2, { kMin: 5, kMax: 5, seviye: 1 }).get(10).toplam;
  const yirmi = T.kategoriSecenekleri(marketOf, 'ana', 2, { kMin: 5, kMax: 5, seviye: 20 }).get(10).toplam;
  ok(yirmi > 19 * bir * 0.9 && yirmi <= 20 * bir + 1e-6);
  const luks = T.kategoriSecenekleri(marketOf, 'ana', 2, { kMin: 5, kMax: 5, tip: 'luks' }).get(10).toplam;
  ok(luks < bir * 0.7);
  const sadeceYedi = (id, q) => (q === 7 ? marketOf(id, q) : null);
  const m = T.kategoriSecenekleri(sadeceYedi, 'salata', 2, { kMin: 0, kMax: 12 });
  eq([...m.keys()], [14]);
  eq(T.kategoriSecenekleri(() => null, 'salata', 2, {}).size, 0);
});

section('Gereken kalite toplamı');
test('Hedefe ulaşan en küçük toplam: bir eksiği hedefin altında kalır', () => {
  const o = { hedef: 5.5, bonus: 1.1, tip: 'eko' };
  for (const n of [3, 6, 8]) {
    const s = T.gerekliKaliteToplami(n, o);
    ok(s != null);
    ok(M.hedefRating({ kalite: s / n, urunSayisi: n, bonus: 1.1 }) >= 5.5 - 1e-9);
    if (s > 0) ok(M.hedefRating({ kalite: (s - 1) / n, urunSayisi: n, bonus: 1.1 }) < 5.5);
  }
  eq(T.gerekliKaliteToplami(2, { hedef: 10, bonus: 0 }), null);
});

section('Elle menü');
test('Çeşit sayıları: toplam, günlük, seviye başı; her ürünün kalitesi; rating modelden', () => {
  const m = T.menuOner(marketOf, { seviye: 5, tip: 'eko', cesit: { salata: 2, ana: 3, icecek: 1 }, bonus: 1.1, hedef: 6.5 });
  eq([m.cesit, m.urunSayisi], ['2-3-1', 6]);
  near(m.toplam, m.kategoriler.reduce((t, k) => t + k.toplam, 0), 1e-6);
  near(m.gunluk, m.toplam * 2, 1e-9); near(m.seviyeBasi, m.toplam / 5, 1e-9);
  eq(m.kategoriler.map((k) => k.urunler.length), [2, 3, 1]);
  ok(m.rating.orta >= 6.5 - 1e-9, 'hedefin altında');
  const ort = m.kategoriler.flatMap((k) => k.urunler).reduce((t, u) => t + u.q, 0) / 6;
  near(m.ortKalite, ort, 1e-9);
  near(m.rating.orta, M.hedefRating({ kalite: ort, urunSayisi: 6, bonus: 1.1 }), 1e-9);
});
test('Elle menü, tüm ürün-kalite atamalarının en ucuzuyla aynı (1-1-1, Q0–Q2)', () => {
  const cesit = { salata: 1, ana: 1, icecek: 1 };
  const g = { seviye: 1, tip: 'eko', bonus: 0, hedef: 3.2, kMin: 0, kMax: 2 };
  const m = T.menuOner(marketOf, { ...g, cesit });
  let min = Infinity;
  for (const a of idler('salata')) for (const b of idler('ana')) for (const c of idler('icecek')) for (let qa = 0; qa <= 2; qa++) for (let qb = 0; qb <= 2; qb++) for (let qc = 0; qc <= 2; qc++) {
    if (M.hedefRating({ kalite: (qa + qb + qc) / 3, urunSayisi: 3, bonus: 0 }) < 3.2 - 1e-9) continue;
    min = Math.min(min, T.adet(a, 1) * fiyat(a, qa) + T.adet(b, 1) * fiyat(b, qb) + T.adet(c, 1) * fiyat(c, qc));
  }
  ok(Number.isFinite(min)); near(m.toplam, min, 1e-6);
});
test('Her ürüne ayrı kalite: kalite ucuza yükselen ürüne verilir', () => {
  // maliyet = 10 + eğim × q: 117'de eğim çok küçük, diğerlerinde büyük
  const fp = (id, q) => (10 + (id === 117 ? 0.01 : 5) * q) / T.adet(id, 2, 1);
  const m = T.menuOner(fp, { cesit: { salata: 2, ana: 1, icecek: 1 }, bonus: 0, hedef: 4.2, kMin: 0, kMax: 12 });
  ok(!m.yok && !m.eksik);
  const [x, y] = m.kategoriler[0].urunler;
  const k117 = [x, y].find((u) => u.id === 117);
  ok(k117, '117 seçilmedi');
  const diger = [x, y].find((u) => u.id !== 117);
  ok(k117.q >= diger.q && k117.q > 0, 'ucuza yükselen ürüne kalite verilmedi');
});
test('Lüks: adet yarıya iner, rating × 1,25; aynı hedef daha ucuz', () => {
  const g = { seviye: 1, cesit: { salata: 2, ana: 2, icecek: 2 }, bonus: 1, hedef: 6 };
  const e = T.menuOner(marketOf, { ...g, tip: 'eko' });
  const l = T.menuOner(marketOf, { ...g, tip: 'luks' });
  ok(l.toplam < e.toplam, 'lüks daha pahalı');
  ok(l.rating.orta >= 6 - 1e-9);
});
test('Yeterli fiyatlı ürün olmayan kategori eksik; ulaşılamayan hedef yok + en yüksek tahmin', () => {
  const az = (id, q) => (idler('icecek').includes(id) ? null : marketOf(id, q));
  eq(T.menuOner(az, { cesit: { salata: 2, ana: 2, icecek: 2 } }).eksik, ['İçecek']);
  const y = T.menuOner(marketOf, { cesit: { salata: 1, ana: 1, icecek: 1 }, bonus: 0, hedef: 10, kMin: 0, kMax: 3 });
  ok(y.yok && y.enYuksek > 0 && y.enYuksek < 10);
});

section('Otomatik');
test('Hedefe ulaşan en ucuz menü: tüm çeşit sayıları taranarak doğrulanır', () => {
  const g = { seviye: 3, tip: 'eko', hedef: 7, bonus: 1.1, kMin: 0, kMax: 12 };
  const o = T.otomatikOner(marketOf, g);
  ok(o.en); ok(o.en.rating.orta >= 7 - 1e-9, 'hedefin altında');
  let min = Infinity;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 4; c++) {
    const m = T.menuOner(marketOf, { ...g, cesit: { salata: a, ana: b, icecek: c } });
    if (m.toplam != null) min = Math.min(min, m.toplam);
  }
  near(o.en.toplam, min, 1e-6);
  ok(o.secenekler.length === 4 && o.secenekler.every((m) => m.toplam >= o.en.toplam - 1e-9 && m.rating.orta >= 7 - 1e-9));
});
test('Menüdeki her ürünün kalitesi aralıkta; kategoride ürün tekrarı yok', () => {
  const o = T.otomatikOner(marketOf, { hedef: 6.5, bonus: 1, kMin: 4, kMax: 9 });
  for (const k of o.en.kategoriler) {
    eq(new Set(k.urunler.map((u) => u.id)).size, k.urunler.length);
    ok(k.urunler.every((u) => u.q >= 4 && u.q <= 9));
  }
});
test('Hedef çok yüksekse yok ve en yüksek tahmin; fiyat yoksa fiyatYok', () => {
  const y = T.otomatikOner(marketOf, { seviye: 1, hedef: 10, bonus: 0, kMin: 0, kMax: 0 });
  ok(y.yok && y.enYuksek > 0 && y.enYuksek < 10);
  eq(T.otomatikOner(() => null, { hedef: 5 }), { fiyatYok: true });
});
test('Daha yüksek hedef daha pahalı (ya da eşit) menü demektir', () => {
  const a = T.otomatikOner(marketOf, { seviye: 1, hedef: 6, bonus: 1.1 }).en.toplam;
  const b = T.otomatikOner(marketOf, { seviye: 1, hedef: 7.5, bonus: 1.1 }).en.toplam;
  ok(b >= a);
});
test('Kalite aralığı daraldıkça maliyet düşmez (aralık serbestken en ucuzdur)', () => {
  const genis = T.otomatikOner(marketOf, { hedef: 6.5, bonus: 1.1, kMin: 0, kMax: 12 }).en.toplam;
  const dar = T.otomatikOner(marketOf, { hedef: 6.5, bonus: 1.1, kMin: 6, kMax: 9 }).en.toplam;
  ok(dar >= genis - 1e-9);
});

section('Ayar kaydı ve olaylar');
test('Bozuk kayıt temizlenir, sınırlar uygulanır; eski "kalite" anahtarı yok sayılır', () => {
  eq(T.temizleTavsiye(null), T.varsayilanTavsiye());
  const s = T.temizleTavsiye({ kalite: 7, kMin: 99, kMax: 3, seviye: -4, tip: 'x', mod: 'elle', hedef: 'abc', carpan: 9, cesit: { salata: 0, ana: 99, icecek: 3 } });
  eq([s.kMin, s.kMax, s.seviye, s.tip, s.mod, s.carpan, s.cesit], [12, 12, 1, 'eko', 'elle', 4, { salata: 1, ana: 6, icecek: 3 }]);
  eq(s.hedef, T.varsayilanTavsiye().hedef);
  ok(!('kalite' in s));
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
test('Alanlar: kalite aralığı (en düşük ≤ en yüksek kalır), seviye ("1.250" dahil), hedef', () => {
  const st = T.varsayilanTavsiye();
  const e = (rt, value) => ({ dataset: { rt }, value });
  ok(T.tavsiyeDegis(st, e('kmin', '10'))); eq([st.kMin, st.kMax], [10, 12]);
  T.tavsiyeDegis(st, e('kmax', '4')); eq([st.kMin, st.kMax], [4, 4]);
  T.tavsiyeDegis(st, e('kmin', '8')); eq([st.kMin, st.kMax], [8, 8]);
  ok(T.tavsiyeDegis(st, e('seviye', '25'))); eq(st.seviye, 25);
  T.tavsiyeDegis(st, e('seviye', '1.250')); eq(st.seviye, 1250);
  ok(T.tavsiyeDegis(st, e('hedef', '7,5'))); eq(st.hedef, 7.5);
  T.tavsiyeDegis(st, e('hedef', '99')); eq(st.hedef, 10);
  T.tavsiyeDegis(st, e('seviye', '0')); eq(st.seviye, 1);
  eq(T.tavsiyeDegis(st, { dataset: {}, value: '1' }), false);
});

section('Çizim');
test('Maliyetler: üç kategori, mavi hücre sınıfı, doluluk ve kâr yok', () => {
  const h = T.maliyetHtml(T.varsayilanTavsiye(), marketOf);
  for (const ad of ['Salata barı', 'Ana yemek', 'İçecek']) ok(h.includes(ad), ad);
  ok(h.includes('class="low') && h.includes('data-act="rt.carpan"') && h.includes('data-act="rt.tip"'));
  ok(!/Doluluk|Kâr/.test(h));
});
test('Tavsiye otomatik: kalite aralığı ve hedef alanları, sonuç, rating aralığı; doluluk ve kâr yok', () => {
  const h = T.tavsiyeHtml(T.varsayilanTavsiye(), marketOf, { bonus: 1.1 });
  ok(h.includes('data-rt="hedef"') && h.includes('data-rt="kmin"') && h.includes('data-rt="kmax"'));
  ok(h.includes('Tahmini rating') && h.includes('Maliyet / döngü') && h.includes('Ort. Q'));
  ok(!h.includes('data-act="rt.cesit"'));
  ok(!/Gelir|Kâr\b/.test(h.replace('Doluluk ve kâr hesaplanmaz.', '')));
});
test('Tavsiye: menü tablosunda her ürünün kalitesi (Q) görünür, kategorilere ayrılır', () => {
  const h = T.tavsiyeHtml({ ...T.varsayilanTavsiye(), mod: 'elle', cesit: { salata: 3, ana: 2, icecek: 4 }, hedef: 6 }, marketOf, { bonus: 1 });
  eq(h.split('class="grp"').length - 1, 3);
  ok(h.includes('<th scope="col">Kalite</th>') && h.includes('Salata barı · 3'));
  eq((h.match(/<td class="q">Q\d+<\/td>/g) || []).length, 9);
  ok(!h.includes('class="low"'));
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
