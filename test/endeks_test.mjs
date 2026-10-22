// DentSimco — Piyasa › İndeks: günlük / haftalık değerlendirme ve grafik verisi (yapay belge; ağ kullanmaz)
// Çalıştırma: node test/endeks_test.mjs
import EN from '../public/dil-en.js';
import { sozlukDerle, cevirMetin } from '../public/i18n.js';
import { gunDegerlendir, haftaDegerlendir, donemDegisimi, seriKur } from '../public/endeks.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
const eq = (a, b, label = '') => { if (a !== b) throw new Error(`${label} beklenen «${b}», bulunan «${a}»`); };
const ok = (c, label) => { if (!c) throw new Error(label); };

// 69 gün (son gün cumartesi, son hafta sürüyor): 60 gün sakin (±10), sonra 5 gün düşüş, ardından sert yükseliş; son 4 gün yüksek hacim
const gun = (i) => new Date(Date.UTC(2026, 6, 6) + i * 86_400_000).toISOString().slice(0, 10); // 2026-07-06 pazartesi
const g = [];
let lv = 1000;
for (let i = 0; i < 69; i++) {
  let x = i === 0 ? null : i % 2 ? 10 : -10;
  if (i >= 61 && i <= 65) x = -20;
  if (i === 66) x = 120;
  if (i > 0) lv *= Math.exp(x / 1e4);
  const tutar = i >= 66 ? 2e6 : 1e6;
  const arti = [[7, 900, x > 0 ? x * 0.7 : 3], [8, 50, 2]];
  const eksi = [[9, -400, x < 0 ? x * 0.4 : -3]];
  g.push([gun(i), Math.round(lv * 100) / 100, x, i === 66 ? 90 : 60, i === 66 ? 30 : 70, tutar, arti, eksi, [['P', x * 0.6], ['Y', x * 0.4]]]);
}
const h = [];
for (let k = 0; k * 7 + 1 < 69; k++) {
  const a = k * 7 + 1, b = Math.min(68, a + 6);
  const rows = g.slice(a, b + 1);
  h.push([rows[0][0], rows.at(-1)[0], rows.reduce((s, r) => s + r[2], 0), 70, 60, rows.reduce((s, r) => s + r[5], 0), [[7, 500, 30]], [[9, -300, -20]], [['P', 10]], rows.length]);
}
const doc = {
  gun: g.at(-1)[0], g, h, n: 131,
  evre: [[`${gun(65)}T15:00:00Z`, 'normal']],
  olay: [[7, -20, `${gun(66)}T00:00:00Z`, `${gun(80)}T00:00:00Z`], [55, 10, `${gun(66)}T00:00:00Z`, `${gun(80)}T00:00:00Z`]],
};

test('Sert yükseliş günü: büyüklük, rekor, genişlik, sürükleyen, sektör, hacim, dönüş, evre, olay', () => {
  const x = gunDegerlendir(doc, 66);
  eq(x.yon, 'up');
  eq(x.baslik, 'İndeks yükseldi');
  const metin = x.maddeler.map((m) => m.filter((p) => typeof p === 'string').join(' ')).join(' | ');
  ok(/Sert hareket: son 60 günün olağan günlük oynaklığının \S+ katı\./.test(metin), `büyüklük: ${metin}`);
  ok(/Son \d+ günün en büyük yükselişi\./.test(metin), 'rekor');
  ok(metin.includes('Yükseliş geniş tabanlı') && metin.includes('Yükselen ürün: 90, düşen ürün: 30.'), 'genişlik');
  ok(x.maddeler.some((m) => m[0] === 'Hareketin yarısından fazlası tek üründen geldi:' && m[1].urun === 7), 'tek ürün yoğunluğu');
  ok(x.maddeler.some((m) => m[0] === 'Bina türüne göre en büyük etki:' && m[1].sektor === 'P'), 'sektör');
  ok(/İşlem tutarı 20 günlük ortalamanın \S+ üstünde/.test(metin), 'hacim');
  ok(metin.includes('6 günlük düşüşten sonra ilk yükseliş.'), 'dönüş');
  ok(x.maddeler.some((m) => m[0] === 'Ekonomi evresi değişti:'), 'evre (değişimin ertesi günü)');
  ok(x.maddeler.some((m) => m[0] === 'Üretim hızı olayı başladı:' && m[1].urun === 7), 'ilgili ürünün olayı adıyla');
  ok(metin.includes('Öteki ürünlerde üretim hızı olayı: 1 başladı, 0 bitti.'), 'ilgisiz olay sayıyla');
  ok(Math.abs(x.puan - (g[66][1] - g[65][1])) < 1e-9 && x.getiri > 0.0119 && x.getiri < 0.0121, 'puan ve getiri');
});

test('Seri, sakin gün, ilk satır', () => {
  const x = gunDegerlendir(doc, 64);
  eq(x.yon, 'down');
  ok(x.maddeler.some((m) => m[0] === 'Üst üste 5. düşüş günü.'), 'üst üste düşüş');
  const y = gunDegerlendir(doc, 68);
  ok(y.maddeler.some((m) => m[0] === 'Sakin gün: hareket olağan günlük oynaklığın yarısından küçük.') === false, 'yüksek oynaklıktan sonra ±10 sakin değil');
  eq(gunDegerlendir(doc, 0).baslik, 'Başlangıç günü');
  eq(gunDegerlendir(doc, 99), null);
});

test('Hafta: sürüyor, gün sayıları, en iyi / kötü gün, önceki hafta, 4 hafta', () => {
  const k = doc.h.length - 1;
  const x = haftaDegerlendir(doc, k);
  ok(x.suruyor && x.baslik.startsWith('Hafta sürüyor'), 'sürüyor');
  const tam = haftaDegerlendir(doc, k - 1);
  ok(!tam.suruyor && /^Hafta (yükselişle|düşüşle|yatay) kapandı$/.test(tam.baslik), 'tam hafta');
  const metin = tam.maddeler.map((m) => m.filter((p) => typeof p === 'string').join(' ')).join(' | ');
  ok(/Hafta içinde \d+ gün yükseliş, \d+ gün düşüş\./.test(metin), 'gün sayıları');
  ok(tam.maddeler.some((m) => m[0] === 'En iyi gün:') && tam.maddeler.some((m) => m[0] === 'En kötü gün:'), 'en iyi / kötü gün');
  ok(/Son 4 haftada indeks (yükseldi|düştü):/.test(metin), '4 hafta');
  ok(Math.abs(tam.puan - (tam.kapanis - tam.acilis)) < 1e-9 && tam.acilis === g[g.findIndex((r) => r[0] === doc.h[k - 1][0]) - 1][1], 'açılış önceki günün kapanışı');
});

test('Dönem değişimi ve grafik aralığı', () => {
  ok(Math.abs(donemDegisimi(doc, 7) - (g[68][1] / g[61][1] - 1)) < 1e-12, '7 gün');
  ok(Math.abs(donemDegisimi(doc, 500) - (g[68][1] / g[0][1] - 1)) < 1e-12, 'pencereden uzun: ilk satır');
  const s = seriKur(doc, '1A');
  eq(s.xs.length, 31);
  eq(s.idx[0], 38);
  ok(s.values.ort.every((v) => v != null), '20 günlük ortalama (yeterli geçmiş)');
  eq(seriKur(doc, 'T').values.ort[18], null);
});

test('Değerlendirme cümlelerinin İngilizcesi var (sözlük kalıpları)', () => {
  const d = sozlukDerle(EN);
  const TR = /[çğıöşüÇĞİÖŞÜ]/;
  const eksik = new Set();
  const bak = (x) => { for (const m of x.maddeler) for (const p of m) if (typeof p === 'string' && TR.test(cevirMetin(p, d, 'en'))) eksik.add(p); if (TR.test(cevirMetin(x.baslik, d, 'en'))) eksik.add(x.baslik); };
  for (let i = 0; i < doc.g.length; i++) bak(gunDegerlendir(doc, i));
  for (let k = 0; k < doc.h.length; k++) bak(haftaDegerlendir(doc, k));
  if (eksik.size) throw new Error([...eksik].slice(0, 5).join(' | '));
  eq(cevirMetin('Sert hareket: son 60 günün olağan günlük oynaklığının 2,4 katı.', d, 'en'), 'A sharp move: 2,4 times the typical daily volatility of the last 60 days.');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
