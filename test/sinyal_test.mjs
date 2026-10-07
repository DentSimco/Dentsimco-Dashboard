// DentSimco — sinyal kartı gösterim sınamaları. Çalıştırma: node test/sinyal_test.mjs
import { signalCard, hedefFiyat, tazelik } from '../public/sinyal.js';

const results = [];
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } }
const ok = (v, m = 'koşul sağlanmadı') => { if (!v) throw new Error(m); };

const doc = { t: Date.now(), gun: '2026-10-05', makro: {}, urun: { 5: { 10: { s: ['TUT', 3], a: ['AL', 2], m: 75, e: 20, u: 5, t: 1 }, 0: { s: ['SAT', 0], a: ['AL', 0], m: 1 } } } };
const products = { 5: { id: 5, name: 'Üzüm' } };
const kart = (o = {}) => signalCard(doc, { id: 5, q: 10, products, realm: 0, ...o });

test('Üç çubuklu sinyal data-guc="3" taşır; orta ve normal taşımaz', () => {
  const h = kart();
  ok(/data-yon="up" data-guc="3"/.test(h), 'TUT güçlü rolü işaretli olmalı');
  ok(/data-yon="" data-guc="2"/.test(h), 'AL orta rolü guc=2');
  ok(!/data-guc="3"[^>]*>[\s\S]*data-guc="3"/.test(h), 'yalnız bir güçlü rol var');
});
test('Çerçeve renkleri (data-yon) değişmedi: yanıp sönme yalnız zemini etkiler', () => {
  const h = kart();
  ok((h.match(/data-yon="up"/g) || []).length >= 2);
});
test('Kalitesiz üründe başlıkta Q etiketi yok; kaliteli üründe var', () => {
  ok(!/class="qtag"/.test(kart({ noQuality: true, q: 0 })), 'Q etiketi olmamalı');
  ok(/class="qtag">Q10</.test(kart()), 'Q10 etiketi olmalı');
});
test('Kalite etiketi yokken "sinyal olan kaliteler" önerisi gösterilmez', () => {
  const h = signalCard(doc, { id: 5, q: 7, products, noQuality: true });
  ok(!/sinyal olan kaliteler/.test(h));
  const k = signalCard(doc, { id: 5, q: 7, products });
  ok(/sinyal olan kaliteler/.test(k));
});


// ---- Hedef fiyat ve tazelik rozeti ----
const SA = 3_600_000;
const simdi = Date.parse('2026-10-07T12:00:00Z');
// p = hesap fiyatı, e = beklenti (yarım yüzde adımı: 19 → +%9,5), l = likit, g = gün içi
const hDoc = (e, t = simdi - 30 * 60_000) => ({ t, tn: t, gun: '2026-10-06', makro: {}, urun: { 5: { 10: { s: ['TUT', 2], a: ['AL', 1], u: 5, ...e } } } });
const hKart = (e, live, extra = {}) => signalCard(hDoc(e, extra.docT), { id: 5, q: 10, products, realm: 0, live, now: simdi });
const canli = (fiyat, yasSa) => [fiyat, null, 0, 0, simdi - yasSa * SA];

test('Hedef fiyat = hesap fiyatı × (1 + beklenti): 900 ve +%9,5 → 985,50', () => {
  ok(Math.abs(hedefFiyat({ e: 19, p: 900 }) - 985.5) < 1e-9, 'hedef 985,5 olmalı');
  const h = hKart({ e: 19, p: 900, l: 1 }, canli(900, 0.2));
  ok(/\+%9,5/.test(h), 'beklenti yüzdesi görünmeli');
  ok(/Hedef: <b>\$985,50<\/b>/.test(h), 'Hedef: $985,50 yazmalı');
  ok(/belirsizlik ±%5/.test(h), 'belirsizlik yazmalı');
  ok(/Hesap fiyatı \$900,00 \(son tam günün VWAP/.test(h), 'hesap fiyatının kaynağı yazmalı');
});
test('Düşüş beklentisinde hedef hesap fiyatının altında; gün içi hesapta kaynak "son işlem fiyatı"', () => {
  const h = hKart({ e: -10, p: 200, l: 1, g: 1 }, canli(200, 0.2));
  ok(/Hedef: <b>\$190,00<\/b>/.test(h), '200 × 0,95 = 190');
  ok(/Hesap fiyatı \$200,00 \(son işlem fiyatı\)/.test(h), 'gün içi kaynak');
});
test('Hesap fiyatı olmayan eski belgede Hedef satırı çıkmaz, kart bozulmaz', () => {
  const h = hKart({ e: 19 }, canli(900, 0.2));
  ok(!/Hedef:/.test(h) && /14 gün beklentisi/.test(h), 'hedefsiz ama beklentili');
  ok(!/sg-rozet/.test(h), 'rozet de yok');
});
test('Likit ve taze, fiyat oynamadı: rozet yok, kart soluk değil', () => {
  const h = hKart({ e: 19, p: 900, l: 1 }, canli(910, 0.5));
  ok(!/sg-rozet/.test(h) && !/data-eski/.test(h));
});
test('Likit üründe son işlem 6 saatten eski: "Son işlem X önce" rozeti, kart soluk', () => {
  const h = hKart({ e: 19, p: 900, l: 1 }, canli(900, 9));
  ok(/data-tip="bayat"/.test(h) && /data-eski="bayat"/.test(h), 'bayat rozeti');
  ok(/Son işlem 9 sa önce/.test(h), 'süre yazmalı');
  ok(/gün sonu verisine dayanıyor/.test(h), 'gece hesabı için açıklama');
  ok(/son hesaptaki fiyata dayanıyor/.test(hKart({ e: 19, p: 900, l: 1, g: 1 }, canli(900, 9))), 'gün içi hesap için açıklama');
});
test('Likit olmayan üründe son işlemin eski olması rozet çıkarmaz (ince piyasa)', () => {
  ok(!/sg-rozet/.test(hKart({ e: 19, p: 900, l: 0 }, canli(900, 50))));
});
test('Fiyat hesap fiyatından %5–%10 oynadı: "Fiyat değişti" rozeti', () => {
  const h = hKart({ e: 19, p: 900, l: 1 }, canli(963, 0.5)); // +%7
  ok(/data-tip="degisti"/.test(h) && /%7 yukarıda/.test(h) && /birkaç saat içinde/.test(h), 'likit: birkaç saat içinde');
  const ince = hKart({ e: 19, p: 900, l: 0 }, canli(837, 0.5)); // −%7
  ok(/data-tip="degisti"/.test(ince) && /%7 aşağıda/.test(ince) && /gece yeniden hesaplanır/.test(ince), 'ince: gece');
});
test('Likit ve taze üründe ≥%10 oynadı: "Güncelleniyor"; gün içi hesap durmuşsa söylenmez', () => {
  const h = hKart({ e: 19, p: 900, l: 1 }, canli(1010, 0.5)); // +%12
  ok(/data-tip="guncelleniyor"/.test(h) && /yeniden hesaplanıyor/.test(h), 'güncelleniyor');
  const durmus = hKart({ e: 19, p: 900, l: 1 }, canli(1010, 0.5), { docT: simdi - 10 * SA });
  ok(/data-tip="degisti"/.test(durmus) && /gece yeniden hesaplanır/.test(durmus), 'son hesap 10 saat önceyse "Güncelleniyor" denmez');
  const ince = hKart({ e: 19, p: 900, l: 0 }, canli(1010, 0.5));
  ok(/data-tip="degisti"/.test(ince), 'likit olmayan üründe "Güncelleniyor" denmez (gün içi hesaba girmez)');
});
test('tazelik: canlı kayıt yoksa ya da mevsimsel kayıtta (e yok) rozet yok', () => {
  ok(tazelik({ e: 19, p: 900, l: 1 }, undefined, simdi) === null, 'canlı yok');
  ok(tazelik({ e: 19, p: 900, l: 1 }, [900, null, 0, 0, null], simdi) === null, 'son işlem zamanı yok');
  ok(tazelik({ e: null, p: 900, l: 1 }, canli(2000, 0.1), simdi) === null, 'mevsimsel kayıt');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
