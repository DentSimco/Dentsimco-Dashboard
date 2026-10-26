// DentSimco — restoran doluluk tablosu ve tahmini sınamaları. Çalıştırma: node test/restoran_doluluk_test.mjs
// Tablo, oyunun gazetesindeki restoran ısı haritalarından (araclar/veri/restoran-isi.json) araclar/restoran-isi.mjs ile üretilir.
// Burada: tablonun ham veriden aynen üretildiği, doluluğun fiyat ve ratingle doğru yönde değiştiği, evre farklarının oyun verisindeki
// gibi çıktığı ve kendi restoranlarımızın ölçülen dolulukları denetlenir.
import { readFileSync } from 'node:fs';
import * as R from '../public/hesap-restoran.js';
import { DOLULUK_TABLO, DOLULUK_KOSU, DOLULUK_KAYNAK, DOLULUK_FIYATLAR } from '../public/restoran-doluluk.js';
import { dolulukUyumu, evrePayi, FIYATLAR } from '../araclar/restoran-isi.mjs';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} beklenen ${b.slice(0, 200)}, bulunan ${a.slice(0, 200)}`);
}
function near(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} beklenen ${expected} (±${tol}), bulunan ${actual}`);
}
function ok(value, label = 'koşul sağlanmadı') { if (!value) throw new Error(label); }
const [RES, NOR, BOOM] = [0, 1, 2];
const ham = JSON.parse(readFileSync(new URL('../araclar/veri/restoran-isi.json', import.meta.url), 'utf8'));

test('Yayımlanan tablo ham veriden aynen üretilir (araclar/restoran-isi.mjs çalıştırılmadan elle değiştirilmemiş; dosya metni değil değerler karşılaştırılır, yayında dosya gizlenir)', () => {
  const u = dolulukUyumu(ham);
  eq(u.tablo, DOLULUK_TABLO, 'tablo');
  eq(u.kosu, DOLULUK_KOSU, 'döngü sayıları');
  eq([u.donem, u.ilk, u.son, u.toplamKosu], [DOLULUK_KAYNAK.donem, DOLULUK_KAYNAK.ilk, DOLULUK_KAYNAK.son, DOLULUK_KAYNAK.kosu]);
});
test('Ham veri: en az 28 dönem, ardışık ve evre listesi dönemlerin tamamını kapsıyor', () => {
  ok(ham.donemler.length >= 28, `dönem ${ham.donemler.length}`);
  ham.donemler.forEach((d, i) => { if (i) eq(d.bas, ham.donemler[i - 1].bit, `dönem ${d.sayi} başlangıcı`); });
  for (const d of ham.donemler) {
    const A = Date.parse(d.bas);
    const B = Date.parse(d.bit);
    const kapsanan = ham.evreler.reduce((s, [, a, b]) => s + Math.max(0, Math.min(B, Date.parse(b)) - Math.max(A, Date.parse(a))), 0);
    near(kapsanan / (B - A), 1, 1e-9, `sayı ${d.sayi} evre kapsamı`);
  }
});
test('Evre payı: 3 Haziran–22 Temmuz 2025 dönemi %66 boom, %34 normal (SimcoTools tarihleri)', () => {
  const p = evrePayi('2025-06-03T22:00:00+00:00', '2025-07-22T22:00:00+00:00', ham.evreler);
  near(p[BOOM], 0.659, 0.001); near(p[NOR], 0.341, 0.001); near(p[RES], 0, 1e-12);
});
test('Tablo boyutu 3 evre × 10 fiyat dilimi ($60–359) × 11 rating dilimi; değerler %0–100', () => {
  eq(DOLULUK_FIYATLAR, FIYATLAR);
  eq([DOLULUK_TABLO.length, DOLULUK_TABLO[0].length, DOLULUK_TABLO[0][0].length], [3, 10, 11]);
  ok(DOLULUK_TABLO.flat(2).every((x) => x >= 0 && x <= 100), 'aralık');
});
test('Uyum: dönem × hücre gözlemleriyle ağırlıklı hata 5,5 puanın altında', () => {
  let sw = 0; let se = 0;
  for (const d of ham.donemler) {
    const pay = evrePayi(d.bas, d.bit, ham.evreler);
    for (const [r, p, c, s] of d.hucreler) {
      const pi = FIYATLAR.indexOf(p);
      if (pi < 0 || c <= 15) continue;
      const tahmin = [RES, NOR, BOOM].reduce((t, e) => t + pay[e] * DOLULUK_TABLO[e][pi][r], 0);
      sw += c; se += c * (tahmin - (s / c) * 100) ** 2;
    }
  }
  ok(Math.sqrt(se / sw) < 5.5, `RMSE ${Math.sqrt(se / sw)}`);
});
test('Doluluk fiyat arttıkça artmaz, rating arttıkça azalmaz (her evrede, ara değerler dahil)', () => {
  for (const e of [RES, NOR, BOOM]) {
    for (let r = 0; r <= 10; r += 0.25) {
      for (let p = 60; p <= 350; p += 5) {
        const v = R.dolulukTahmini(r, p, e);
        ok(R.dolulukTahmini(r, p + 5, e) <= v + 1e-9, `fiyat: evre ${e} r ${r} $${p}`);
        ok(R.dolulukTahmini(r + 0.25, p, e) >= v - 1e-9, `rating: evre ${e} r ${r} $${p}`);
      }
    }
  }
});
test('Dilim merkezinde tablodaki değer: rating 6,5 · $105 → [Normal][$90][6]; rating 10 · $135 → [Büyüme][$120][10]', () => {
  near(R.dolulukTahmini(6.5, 105, NOR), DOLULUK_TABLO[NOR][1][6], 1e-9);
  near(R.dolulukTahmini(10, 135, BOOM), DOLULUK_TABLO[BOOM][2][10], 1e-9);
  near(R.dolulukTahmini(7, 105, NOR), (DOLULUK_TABLO[NOR][1][6] + DOLULUK_TABLO[NOR][1][7]) / 2, 1e-9, 'iki dilim arası doğrusal');
});
test('Uçlar: fiyat $60 altı $60, $350 üstü $350 sayılır; rating 0–10 dışı kırpılır; bilinmeyen evre Normal', () => {
  eq(R.dolulukTahmini(6, 40, NOR), R.dolulukTahmini(6, 60, NOR));
  eq(R.dolulukTahmini(9, 500, NOR), R.dolulukTahmini(9, 350, NOR));
  eq(R.dolulukTahmini(12, 150, NOR), R.dolulukTahmini(10, 150, NOR));
  eq(R.dolulukTahmini(6, 100, null), R.dolulukTahmini(6, 100, NOR));
  eq(R.dolulukTahmini(6, 100, 'x'), R.dolulukTahmini(6, 100, NOR));
  eq([R.evreOf(undefined), R.evreOf(''), R.evreOf('2'), R.evreOf(0)], [1, 1, 2, 0]);
});
test('Evre farkları (oyun verisi): boomda rating 9 · $120–149 en az 15 puan, resesyonda rating 6 · $90–119 en az 10 puan dolu', () => {
  ok(R.dolulukTahmini(9.5, 135, BOOM) - R.dolulukTahmini(9.5, 135, NOR) >= 15, 'boom');
  ok(R.dolulukTahmini(6.5, 105, RES) - R.dolulukTahmini(6.5, 105, NOR) >= 10, 'resesyon');
  ok(Math.abs(R.dolulukTahmini(9.5, 195, BOOM) - R.dolulukTahmini(9.5, 195, NOR)) < 3, '$180 üstünde boom farkı yok');
  for (const e of [RES, NOR, BOOM]) ok(R.dolulukTahmini(7.5, 75, e) > 93, `ucuz ve iyi restoran her evrede dolu (${e})`);
});

// Kendi restoranlarımız, 20–23 Ekim 2026 (Normal evre), eko, $60–68: [döngü başı rating, menü fiyatı, ölçülen doluluk %]
const KENDI = [[6.47, 68, 100], [6.47, 65, 100], [6.48, 65, 100], [6.06, 65, 87], [5.40, 64, 72], [6.65, 68, 100], [6.32, 65, 87], [6.63, 65, 95],
  [6.62, 65, 99], [6.23, 64, 90], [5.65, 60, 100], [5.93, 60, 92], [6.87, 65, 100], [6.01, 60, 100], [5.88, 60, 97], [6.61, 60, 90], [5.65, 60, 100],
  [6.41, 65, 94], [6.61, 65, 97], [6.31, 64, 100], [6.12, 60, 94], [5.84, 60, 100], [6.52, 67, 100], [6.33, 68, 91], [6.11, 68, 99], [5.98, 66, 100],
  [5.91, 66, 100], [5.65, 66, 75], [6.56, 65, 100], [6.30, 65, 100], [6.38, 65, 92], [6.42, 64, 100], [6.38, 65, 100], [6.10, 67, 99], [5.88, 66, 97],
  [5.81, 65, 100], [6.33, 65, 94], [6.10, 65, 96]];
// Yeni açılan Sky Eco restoranları, 23–25 Ekim (ekran görüntüleri): [döngü başı rating, ölçülen doluluk %, menü fiyatı]
const SKY = [[3.77, 34.03, 75], [3.09, 34.93, 65], [2.45, 41.75, 65], [1.36, 20.53, 65], [2.35, 34.88, 75], [1.26, 20.64, 65], [0, 25.37, 65],
  [4.17, 45.75, 75], [3.35, 25.21, 65], [2.64, 34.45, 65], [2.28, 18.45, 65], [3.95, 32.48, 75], [3.47, 40.95, 65], [2.56, 21.23, 65], [1.84, 16.49, 65],
  [1.16, 17.31, 65], [1.49, 24.32, 65]];
const mae = (rows) => rows.reduce((s, [r, p, d]) => s + Math.abs(R.dolulukTahmini(r, p, NOR) - d), 0) / rows.length;
test('Doğrulama: kendi 38 döngümüzde ortalama hata 8 puanın altında', () => { ok(mae(KENDI) < 8, `${mae(KENDI)}`); });
test('Doğrulama: Sky Eco (rating 0–4,2, $65–75) 17 döngüde ortalama hata 8 puanın altında', () => {
  const v = mae(SKY.map(([r, d, p]) => [r, p, d]));
  ok(v < 8, `${v}`);
});

test('Kâr formülü oyunun fiyat kutusuyla aynı: $75, 1.000 koltuk, gider $50.683 → %100 doluda +$24.317, başabaş %68', () => {
  const g = { koltuk: 1000, toplam: 50683 };
  near(R.donguKari(g, 75, 100), 24317, 1e-9);
  near(R.donguKari(g, 75, 0), -50683, 1e-9);
  near(50683 / 75000, 0.676, 0.001);
});
test('En kârlı fiyat: $1 adımla bütün fiyatları denemekle aynı sonuç; doluluk o fiyattaki tahmin', () => {
  const g = { koltuk: 25000, toplam: 1.3e6 };
  for (const [r, e] of [[6.2, NOR], [6.2, RES], [9.4, BOOM], [9.4, NOR], [4, NOR]]) {
    const iyi = R.enKarliFiyat(g, r, e);
    let max = -Infinity;
    for (let p = 60; p <= 350; p++) max = Math.max(max, R.donguKari(g, p, R.dolulukTahmini(r, p, e)));
    near(iyi.kar, max, 1e-6, `r ${r} evre ${e}`);
    near(iyi.doluluk, R.dolulukTahmini(r, iyi.fiyat, e), 1e-12);
  }
  ok(R.enKarliFiyat(g, 6.2, RES).fiyat > R.enKarliFiyat(g, 6.2, NOR).fiyat, 'resesyonda orta rating daha pahalı satılır');
  ok(R.enKarliFiyat(g, 9.4, BOOM).kar > 1.3 * R.enKarliFiyat(g, 9.4, NOR).kar, 'boomda yüksek rating çok daha kârlı');
  ok(R.enKarliFiyat(g, 9.4, BOOM).doluluk > 90, 'boomda yüksek ratingin en kârlı fiyatında restoran dolu');
  eq(R.enKarliFiyat(null, 6, NOR), null);
  eq(R.enKarliFiyat({ koltuk: 0, toplam: 1 }, 6, NOR), null);
});

const MENU = [117, 119, 142, 143, 124, 125].map((id) => ({ id, birim: 20, kalite: 6 }));
const ctx = (extra = {}) => ({ adminNet: 0.4, averageSalary: 345, salaryModifier: 1.7, ratingBonus: 1, mod: 'beklenen', model: 'maliyet', menuOf: () => MENU, ...extra });
test('Bina değerlendirmesi evreyi kullanır: beklenen doluluk = tahmin(hedef rating, fiyat, evre); en kârlı fiyat satırda', () => {
  const it = { id: 'a', tip: 'eko', seviye: 10, fiyat: 100, rating: 6 };
  for (const e of [RES, NOR, BOOM]) {
    const row = R.restoranDegerlendir([it], ctx({ evre: e })).rows[0];
    eq(row.evre, e);
    near(row.beklenen.doluluk, R.dolulukTahmini(row.hedef.deger, 100, e), 1e-12);
    near(row.simdi.doluluk, R.dolulukTahmini(6, 100, e), 1e-12, 'son doluluk girilmemişse şimdiki rating ile');
    eq(row.enKarli, R.enKarliFiyat(row.gider, row.hedef.deger, e));
  }
  eq(R.restoranDegerlendir([it], ctx()).rows[0].evre, NOR, 'evre verilmezse Normal');
  eq(R.restoranDegerlendir([{ ...it, doluluk: 77 }], ctx()).rows[0].simdi.doluluk, 77, 'girilen son doluluk korunur');
});
test('Fiyatı olmayan ürün varsa en kârlı fiyat hesaplanmaz', () => {
  const row = R.restoranDegerlendir([{ id: 'a', tip: 'eko', seviye: 10, fiyat: 100 }], ctx({ menuOf: () => MENU.map((m, i) => (i ? m : { ...m, birim: null })) })).rows[0];
  eq(row.enKarli, null);
});
test('Az veri işareti: rating 10 · $120 çok veri, rating 1 · $270 veri yok', () => {
  ok(R.dolulukVerisi(10, 130) >= R.DOLULUK_AZ_VERI);
  ok(R.dolulukVerisi(1.5, 280) < R.DOLULUK_AZ_VERI);
});

// ---- Menü önerisi: doluluk ve kâr ----
const ONERI = { durum: 'ok', rating: 6.2, maliyet: 40000 };
test('Öneri kârı: eko seviye 1, $75, Normal: gelir = fiyat × 1.000 × doluluk × 2; malzeme ve maaş doluluktan bağımsız', () => {
  const k = R.oneriKari({ oneri: ONERI, fiyat: 75, evre: NOR, seviye: 1, tip: 'eko', saatlikMaas: 847.5 });
  const d = R.dolulukTahmini(6.2, 75, NOR);
  near(k.doluluk, d, 1e-12);
  near(k.gelir, 75 * 1000 * (d / 100) * 2, 1e-6);
  near(k.malzeme, 80000, 1e-9);
  near(k.maas, 847.5 * 12 * 2, 1e-9);
  near(k.kar, k.gelir - k.malzeme - k.maas, 1e-6);
  near(k.basabas, ((40000 + 847.5 * 12) / 75000) * 100, 1e-9);
  eq([k.fiyat, k.evre, k.rating], [75, NOR, 6.2]);
});
test('Öneri kârı: lüks koltuk 500, maaş yarı; evre doluluğu ve kârı değiştirir; en kârlı fiyat günlük ve girilenden kötü değil', () => {
  const eko = R.oneriKari({ oneri: ONERI, fiyat: 100, evre: NOR, seviye: 10, tip: 'eko', saatlikMaas: 800 });
  const luks = R.oneriKari({ oneri: ONERI, fiyat: 100, evre: NOR, seviye: 10, tip: 'luks', saatlikMaas: 800 });
  near(luks.maas * 2, eko.maas, 1e-9);
  near(luks.gelir * 2, eko.gelir, 1e-6);
  const res = R.oneriKari({ oneri: ONERI, fiyat: 100, evre: RES, seviye: 10, tip: 'eko', saatlikMaas: 800 });
  ok(res.doluluk > eko.doluluk + 10 && res.kar > eko.kar, 'resesyonda rating 6 · $100 daha dolu ve kârlı');
  for (const k of [eko, luks, res]) ok(k.enKarli.kar >= k.kar - 1e-6, 'en kârlı fiyat girilenden kötü değil');
  const g = { koltuk: 10000, toplam: 40000 + 800 * 12 * 10 };
  near(eko.enKarli.kar, 2 * R.enKarliFiyat(g, 6.2, NOR).kar, 1e-6, 'günlük = 2 döngü');
});
test('Öneri kârı: fiyat $60–350 içine alınır; seviye yoksa ya da öneri yoksa null; maaş bilinmiyorsa kâr null', () => {
  eq(R.oneriKari({ oneri: ONERI, fiyat: 20, seviye: 1, saatlikMaas: 800 }).fiyat, 60);
  eq(R.oneriKari({ oneri: ONERI, fiyat: 900, seviye: 1, saatlikMaas: 800 }).fiyat, 350);
  eq(R.oneriKari({ oneri: ONERI, fiyat: 75, seviye: 0, saatlikMaas: 800 }), null);
  eq(R.oneriKari({ oneri: { durum: 'yok' }, fiyat: 75, seviye: 1, saatlikMaas: 800 }), null);
  const k = R.oneriKari({ oneri: ONERI, fiyat: 75, seviye: 1, saatlikMaas: null });
  eq([k.kar, k.basabas, k.enKarli, k.maas], [null, null, null, null]);
  ok(k.doluluk > 0 && k.gelir > 0);
});

const RS = await import('../public/perakende-restoran.js');
test('Menü önerisi kaydı: eski model/hedef alanları atılır; güvenli hedefli eski kayıt 5,5 ile açılır; evre, rating ve fiyat sınırlanır', () => {
  eq(RS.temizleRestoran({ oneri: { model: 'kalite', hedef: 'guvenli', rating: 8, kalite: 9, seviye: 4, tip: 'luks' } }).oneri,
    { evre: null, rating: 5.5, fiyat: 65, urunSayisi: 2, seviye: 4, tip: 'luks', fiyatTablosu: false });
  eq(RS.temizleRestoran({ oneri: { hedef: 'rating', rating: 7.3, evre: 2, fiyat: 512, urunSayisi: 0, fiyatTablosu: true } }).oneri,
    { evre: 2, rating: 7.25, fiyat: 350, urunSayisi: 0, seviye: 0, tip: 'eko', fiyatTablosu: true });
  eq(RS.temizleRestoran({ oneri: { evre: 5, rating: 1, fiyat: 59.6 } }).oneri.evre, null);
  eq(RS.temizleRestoran({ oneri: { rating: 1, fiyat: 59.6 } }).oneri.rating, 3);
  eq(RS.temizleRestoran({ oneri: { fiyat: 59.6 } }).oneri.fiyat, 60);
});
// Sekme çıktısı: her ürün her kalitede $50, arz sınırsız
const ENV = (extra = {}) => ({ marketOf: () => 50, arzOf: () => 1e9, ratingBonus: 1, maas: { adminNet: 0.4, averageSalary: 345, salaryModifier: 1.7 }, oyunEvresi: null, ...extra });
const sekme = (oneri, env) => RS.menuOnerisiSekmeHtml(RS.temizleRestoran({ oneri: { seviye: 10, ...oneri } }), ENV(env));
test('Menü önerisi sekmesi: evre seçici, hedef rating, menü fiyatı, doluluk ve kâr bölümü; model ve kalite hedefi yok', () => {
  const h = sekme({ fiyat: 90, rating: 6 });
  for (const parca of ['data-act="ro.evre"', 'data-ro="rating"', 'data-ro="fiyat"', 'Doluluk ve kâr', 'Tahmini doluluk', 'Kâr/gün', 'Başabaş doluluk', 'en kârlı fiyat', 'data-act="ro.fiyattablo"'])
    ok(h.includes(parca), parca);
  for (const parca of ['ro.model', 'data-ro="kalite"', 'Güvenli rating', 'Kalite modeli', 'Maliyet puanı', '<th>Puan</th>']) ok(!h.includes(parca), `kalmamalı: ${parca}`);
  for (const parca of ['Ortalama kalite', 'ortalama menü kalitesi en az']) ok(h.includes(parca), parca);
  ok(!h.includes('<th>Doluluk</th>'), 'fiyat tablosu kapalıyken çizilmez');
  ok(sekme({ fiyat: 90, rating: 6, fiyatTablosu: true }).includes('<th>Doluluk</th>'), 'açıkken çizilir');
});
test('Menü önerisi A modeliyle çalışır: hedef rating → gereken ortalama kalite = (rating ÷ çarpan − çeşitlilik − bonus − 3,33) ÷ 0,23; tahmini rating hedefi sağlar', () => {
  const o = (rating, tip = 'eko', urunSayisi = 2) => R.oneriMenu({ model: 'kalite', binalar: [{ seviye: 10, tip }], fiyatOf: () => 50, arzOf: () => 1e9, hedef: 'rating', rating, bonus: 1.06, urunSayisi });
  const e = o(6.5);
  eq(e.durum, 'ok');
  near(e.hedefKalite, (6.5 - 0 - 1.06 - R.KALITE_TABAN) / R.KALITE_RATING, 1e-9);
  ok(e.ortalama >= e.hedefKalite - 1e-9 && e.rating >= 6.5 - 1e-9, 'menü hedefi sağlar');
  near(e.rating, R.KALITE_TABAN + R.KALITE_RATING * e.ortalama + 1.06, 1e-9);
  const l = o(8, 'luks');
  near(l.hedefKalite, (8 / 1.25 - 1.06 - R.KALITE_TABAN) / R.KALITE_RATING, 1e-9);
  ok(l.rating >= 8 - 1e-9, 'lüks çarpan dahil hedef sağlanır');
  ok(o(6.5, 'eko', 1).hedefKalite > o(6.5, 'eko', 3).hedefKalite, '1 ürün (−0,2) daha yüksek, 3 ürün (+0,9) daha düşük kalite ister');
  eq(o(10).durum, 'yok');
});
test('Menü önerisi sekmesi: Otomatik evre oyunun evresini kullanır; süresi dolmuşsa uyarı; elle seçim önceliklidir', () => {
  const oyun = (index, expired) => ({ oyunEvresi: { index, end: Date.UTC(2026, 9, 23, 15), expired } });
  ok(sekme({}, oyun(0, false)).includes('Otomatik: oyunun güncel evresi Durgunluk.'));
  ok(sekme({}, oyun(1, true)).includes('Evre bilgisi güncel değil: son bilinen Normal'));
  ok(sekme({}, {}).includes('Oyunun güncel evresi okunamadı; Normal kullanılıyor.'));
  const elle = sekme({ evre: 2 }, oyun(0, false));
  ok(!elle.includes('Otomatik: oyunun') && elle.includes(' · Büyüme</span>'), 'elle seçilen evre');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exitCode = failed.length ? 1 : 0;
