// DentSimco — İnşaat hesap sınamaları. Her sayı oyundan ya da oyunun ekran görüntülerinden alınmıştır.
// Çalıştırma: node test/insaat_test.mjs

import * as I from '../public/hesap-insaat.js';
import { BINA_ADLARI } from '../public/adlar.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
const eq = (a, b, label = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${label} beklenen ${JSON.stringify(b)}, bulunan ${JSON.stringify(a)}`); };
const near = (a, b, tol = 1e-6, label = '') => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${label} beklenen ${b}, bulunan ${a}`); };
const ok = (v, label = 'koşul sağlanmadı') => { if (!v) throw new Error(label); };

const T = I.binaTablosu(null);
const mat = (m) => [m.concrete, m.bricks, m.planks, m.units];

test('Seviye çarpanı: 1 ve 2. seviye 1, sonra seviye − 1', () => {
  eq([1, 2, 3, 4, 5, 6, 10].map(I.seviyeCarpani), [1, 1, 2, 3, 4, 5, 9]);
  eq(I.carpanToplami(0, 10), 46);
  eq(I.carpanToplami(10, 15), 60);
  eq(I.carpanToplami(0, 0), 0);
});

test('Cooper: Çiftlik 4 bina 0→10 = 2.208 / 30.360 / 8.832 / 552 ve 3 gün 20 saat', () => {
  const p = I.planiHesapla({ rows: [{ id: 'a', letter: 'F', count: 4, from: 0, to: 10 }] }, T);
  eq(mat(p.gerekli), [2208, 30360, 8832, 552]);
  eq(p.enUzunSn, 92 * 3600);
  eq(I.sureMetni(p.enUzunSn), '3 gün 20 saat');
});

test('Cooper: Fabrika 5 bina 10→15 = 16.800 / 231.000 / 67.200 / 4.200 ve 7 gün 12 saat', () => {
  const p = I.planiHesapla({ rows: [{ id: 'a', letter: 'Y', count: 5, from: 10, to: 15 }] }, T);
  eq(mat(p.gerekli), [16800, 231000, 67200, 4200]);
  eq(I.sureMetni(p.enUzunSn), '7 gün 12 saat');
});

test('Cooper: Elektronik fabrikası 5 bina seviye 10 hurda = 4.800 / 66.000 / 19.200 / 1.200', () => {
  const p = I.planiHesapla({ rows: [{ id: 'a', letter: 'L', count: 5, from: 10, to: 0 }] }, T);
  eq(mat(p.geriGelen), [4800, 66000, 19200, 1200]);
  eq(p.enUzunSn, 0);
});

test('Oyun: Gıda işleme tesisi (k) seviye 1…6 malzemesi ve süresi', () => {
  const k = T.k;
  eq([k.costUnits, k.sure], [25, 21600]);
  const d = I.seviyeDokumu(k, 0, 6);
  eq(d.map((x) => mat(x.malzeme)), [
    [100, 1375, 400, 25], [100, 1375, 400, 25], [200, 2750, 800, 50], [300, 4125, 1200, 75], [400, 5500, 1600, 100], [500, 6875, 2000, 125]]);
  eq(d.map((x) => x.sureSn / 3600), [6, 6, 12, 18, 24, 30]);
  eq(I.seviyeDokumu(k, 6, 10).map((x) => x.sureSn / 3600), [36, 42, 48, 54]);
});

test('Oyun: Gıda işleme tesisi referans değeri seviye × $86.250 (seviye 1 … 10)', () => {
  const k = T.k;
  for (let n = 1; n <= 10; n++) near(I.iade(k, n, 0).referans, n * 86250, 1e-6, `seviye ${n}`);
  near(I.seviyeDokumu(k, 0, 1)[0].referans, 86250);
});

test('Oyun: Gıda işleme tesisi seviye 1 yaklaşık maliyeti, oyundaki fiyatlarla ~$85.683 (referans $86.250 civarı)', () => {
  // Oyunun o andaki fiyatları bilinmiyor; yalnız tutarlılık: 1.375 tuğla + 100 betonarme + 25 gereç + 400 kereste
  const m = I.seviyeDokumu(T.k, 0, 1)[0].malzeme;
  eq(mat(m), [100, 1375, 400, 25]);
});

test('Sepet: stok ve hurda iadesi alınacak miktarı düşer; hurdayı saymama seçeneği', () => {
  const plan = { rows: [{ id: 'a', letter: 'Y', count: 5, from: 10, to: 15 }, { id: 'b', letter: 'L', count: 5, from: 10, to: 0 }], stock: { concrete: 1000, bricks: 0, planks: 0, units: 0 } };
  const fiyat = { concrete: 178.2, bricks: 2.46, planks: 8.84, units: 2490 };
  const p = I.planiHesapla(plan, T, fiyat);
  eq(mat(p.alinacak), [16800 - 1000 - 4800, 231000 - 66000, 67200 - 19200, 4200 - 1200]);
  near(p.toplam, 11000 * 178.2 + 165000 * 2.46 + 48000 * 8.84 + 3000 * 2490, 1e-6);
  const q = I.planiHesapla({ ...plan, useScrap: false }, T, fiyat);
  eq(mat(q.alinacak), [15800, 231000, 67200, 4200]);
  ok(q.toplam > p.toplam);
});

test('Stok gerekenden fazlaysa alınacak 0 (eksiye düşmez)', () => {
  const p = I.planiHesapla({ rows: [{ id: 'a', letter: 'F', count: 1, from: 0, to: 1 }], stock: { concrete: 9999, bricks: 9999, planks: 9999, units: 9999 } }, T, { concrete: 1, bricks: 1, planks: 1, units: 1 });
  eq(mat(p.alinacak), [0, 0, 0, 0]);
  eq(p.toplam, 0);
});

test('Fiyatı olmayan malzeme: maliyet null, eksikFiyat işaretlenir, toplama katılmaz', () => {
  const p = I.planiHesapla({ rows: [{ id: 'a', letter: 'F', count: 1, from: 0, to: 1 }] }, T, { concrete: 100, bricks: 2, planks: 8, units: null });
  eq(p.eksikFiyat, true);
  eq(p.maliyet.units, null);
  ok(p.toplam > 0);
  eq(p.referansaFark, null);
});

test('Referansa göre fark: piyasa referanstan pahalıysa pozitif', () => {
  // 1 birim referansı $3.450; fiyatlar 4×166,66 + 55×2,16 + 16×9,08 + 2501,71 = 3.432,43 → −%0,5
  const p = I.planiHesapla({ rows: [{ id: 'a', letter: 'P', count: 1, from: 0, to: 1 }] }, T, { concrete: 166.66, bricks: 2.16, planks: 9.08, units: 2501.71 });
  near(p.referansaFark, 3432.43 / 3450 - 1, 1e-9);
});

test('Süre: aynı anda inşa; toplam süre en uzun satırdır, bitiş başlangıca eklenir', () => {
  const plan = { rows: [{ id: 'a', letter: 'F', count: 4, from: 0, to: 10 }, { id: 'b', letter: 'Y', count: 5, from: 10, to: 15 }] };
  const baslangic = Date.UTC(2026, 9, 6, 12, 0, 0);
  const p = I.planiHesapla(plan, T, {}, { baslangic });
  eq(p.enUzunSn, 180 * 3600);
  eq(p.bitis, baslangic + 180 * 3600 * 1000);
});

test('Nakit farkı = nakit − toplam maliyet', () => {
  const plan = { rows: [{ id: 'a', letter: 'F', count: 1, from: 0, to: 1 }] };
  const f = { concrete: 100, bricks: 2, planks: 8, units: 2500 };
  const p = I.planiHesapla(plan, T, f, { nakit: 100000 });
  near(p.nakitFarki, 100000 - p.toplam);
  eq(I.planiHesapla(plan, T, f).nakitFarki, null);
});

test('Seviye düşürme: düşen seviye × costUnits iade; kısmi düşürme (12 → 9 = 3 seviye)', () => {
  const x = I.iade(T.Y, 12, 9);
  eq(x.dusen, 3);
  eq(x.birim, 42);
  eq(mat(x.malzeme), [168, 2310, 672, 42]);
});

test('Hatalı satırlar: bina yok, adet 0, seviye aynı → hesaba katılmaz', () => {
  const p = I.planiHesapla({ rows: [{ id: 'a', letter: '?', count: 1, from: 0, to: 5 }, { id: 'b', letter: 'F', count: 0, from: 0, to: 5 }, { id: 'c', letter: 'F', count: 2, from: 4, to: 4 }] }, T);
  eq(mat(p.gerekli), [0, 0, 0, 0]);
  eq(p.rows.map((x) => !!x.hata), [true, true, false]);
  eq(p.rows[2].tur, 'yok');
});

test('Bot belgesi bina tablosunu geçersiz kılar; eksik/hatalı alan yedeğe düşer', () => {
  const t = I.binaTablosu({ Y: { costUnits: 99, buildDuration: 7200, category: 'production' }, F: { costUnits: 'x' }, Z9: { costUnits: 5, buildDuration: 3600 } });
  eq(t.Y.costUnits, 99);
  eq(t.F.costUnits, 3);
  eq(t.Z9.costUnits, 5);
  eq(Object.keys(I.binaTablosu(null)).length, 54);
});

test('Oyundaki 54 binanın hepsinde costUnits, süre ve Türkçe ad var', () => {
  for (const [h, b] of Object.entries(T)) ok(b.costUnits > 0 && b.sure > 0, `${h} eksik`);
  const eksik = Object.keys(T).filter((h) => !BINA_ADLARI[h]);
  eq(eksik, [], 'adı olmayan binalar');
});

test('Plan temizleme: sınırlar, kayıp alanlar ve bozuk değerler', () => {
  const p = I.planTemizle({ rows: [{ letter: 'F', count: -3, from: -5, to: 99999 }, null], stock: { concrete: -4, bricks: '12' }, manual: { units: '0', concrete: 5 }, priceMode: 'xx', start: 'a' });
  eq(p.rows.length, 1);
  eq([p.rows[0].count, p.rows[0].from, p.rows[0].to], [1, 0, I.MAKS_SEVIYE]);
  eq([p.stock.concrete, p.stock.bricks], [0, 12]);
  eq([p.manual.units, p.manual.concrete], [null, 5]);
  eq(p.priceMode, 'last');
  eq(p.start, null);
  eq(I.planTemizle(null).rows.length, 0);
});

test('Süre metni', () => {
  eq([6, 18, 24, 54, 180].map((h) => I.sureMetni(h * 3600)), ['6 saat', '18 saat', '1 gün', '2 gün 6 saat', '7 gün 12 saat']);
  eq(I.sureMetni(0), '—');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
