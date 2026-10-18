// DentSimco — restoran hesap motoru sınamaları. Çalıştırma: node test/restoran_test.mjs
// "Oyun ekranı" bölümleri, oyunun Menu price hesap makinesinin ekran görüntülerindeki rakamlarla birebir karşılaştırır
// (R1, Ekim 2026). Birim maliyet = ekrandaki "Sourcing Cost" ÷ "Amount Needed"; maaş = bina ekranındaki Wages/h.

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

const MENU = [117, 119, 142, 143, 124, 125]; // süt, kahve tozu, salata, samosa, portakal suyu, elma suyu
const menuWith = (costs, amounts) => MENU.map((id, i) => ({ id, birim: costs[i] / amounts[i] }));

section('Oyun ekranı: 18 Ekim, eko seviye 25, $62');
const A25 = [7200, 2408, 236, 253, 3600, 3224];
const C25 = [87366, 142072, 237908, 209674, 165513, 180544];
const W25 = 254196 / (12 * 25); // hesap makinesindeki maaştan seviye başı saatlik
test('İhtiyaç adetleri birebir (oran × seviye, yukarı yuvarlama)', () => {
  const a = R.ihtiyac(MENU, 25, 'eko');
  eq(MENU.map((id) => a[id]), A25);
});
test('Malzeme $1.023.078, maaş $254.196, toplam $1.277.274 (±$2 kuruş yuvarlaması)', () => {
  const g = R.donguGideri({ menu: menuWith(C25, A25), seviye: 25, tip: 'eko', saatlikMaas: W25, fiyat: 62 });
  near(g.malzeme, 1023078, 2, 'malzeme');
  near(g.maas, 254196, 0.01, 'maaş');
  near(g.toplam, 1277274, 2, 'toplam');
  near(g.gelir100, 1550000, 0, '%100 gelir');
  near(g.kar100, 272726, 2, '%100 kâr');
  eq(Math.round(g.basabas * 100), 82, 'başabaş (oyun %82)');
});

section('Oyun ekranı: 11 Ekim, eko seviye 24, $63');
const A24 = [6912, 2312, 226, 243, 3456, 3095];
const C24 = [114048, 137920, 233601, 213549, 164441, 146793];
test('İhtiyaç adetleri birebir', () => {
  const a = R.ihtiyac(MENU, 24, 'eko');
  eq(MENU.map((id) => a[id]), A24);
});
test('Maaş = bina ekranındaki $23.018/saat × 12; toplam $1.286.573 (±$10, saatlik maaş ekranda yuvarlanmış)', () => {
  const w = R.seviyeBasiSaatlikMaas(23018, 24, 'eko');
  const g = R.donguGideri({ menu: menuWith(C24, A24), seviye: 24, tip: 'eko', saatlikMaas: w, fiyat: 63 });
  near(g.maas, 276216, 0.01, 'maaş');
  near(g.toplam, 1286573, 10, 'toplam');
  near(g.kar100, 225427, 10, '%100 kâr');
  eq(Math.round(g.basabas * 100), 85, 'başabaş (oyun %85)');
});

section('Oyun ekranı: lüks seviye 11, $62 (yemek ve maaş yarı)');
const AL = [1584, 530, 52, 56, 792, 710];
const CL = [19221, 31270, 52420, 46410, 36413, 39760];
test('İhtiyaç adetleri birebir (×0,5)', () => {
  const a = R.ihtiyac(MENU, 11, 'luks');
  eq(MENU.map((id) => a[id]), AL);
});
test('Maaş eko seviye başı maaşın yarısı: $55.924; toplam $281.418; %100 kâr $59.582', () => {
  const g = R.donguGideri({ menu: menuWith(CL, AL), seviye: 11, tip: 'luks', saatlikMaas: W25, fiyat: 62 });
  near(g.maas, 55924, 2, 'maaş');
  near(g.malzeme, 225494, 1, 'malzeme');
  near(g.toplam, 281418, 2, 'toplam');
  eq(g.koltuk, 5500, 'koltuk');
  near(g.kar100, 59582, 2, '%100 kâr');
  eq(Math.round(g.basabas * 100), 83, 'başabaş (oyun %83)');
});
test('Lüks binanın saatlik maaşından eko seviye başına çevirme (×2)', () => {
  near(R.seviyeBasiSaatlikMaas(55924 / 12, 11, 'luks'), W25, 0.02); // oyun maaşı tam dolara yuvarlar
});

section('Kategori çarpanı');
test('Kategoride 2 ürün: çarpan 1 (oyunda doğrulandı); 1 ürün 2,1 · 3 ürün 0,7 · 4+ 0,55 (makale)', () => {
  eq([1, 2, 3, 4, 5, 6].map(R.kategoriCarpani), [2.1, 1, 0.7, 0.55, 0.55, 0.55]);
  eq(R.CARPAN_DOGRULANDI[2], true);
});
test('Makale örneği: süt + ekmek + tereyağı, seviye 2 → 404 süt, 35 ekmek, 130 tereyağı', () => {
  const a = R.ihtiyac([117, 121, 134, 142, 124], 2, 'eko');
  eq([a[117], a[121], a[134]], [404, 35, 130]);
});
test('Oyun rehberi kartı: tek başına salata, seviye 1 → 20', () => {
  eq(R.ihtiyac([117, 142, 124], 1, 'eko')[142], 20);
});
test('Eksik kategori bildirilir (oyun her kategoriden en az bir ürün ister)', () => {
  eq(R.menuEksikleri([117, 124]), ['Ana yemek']);
  eq(R.menuEksikleri(MENU), []);
});
test('Fiyatı bilinmeyen ürün toplama girmez, işaretlenir', () => {
  const g = R.donguGideri({ menu: [{ id: 117, birim: 10 }, { id: 142, birim: null }, { id: 124, birim: 50 }], seviye: 1, saatlikMaas: 900 });
  eq(g.eksikFiyat, true);
  near(g.malzeme, Math.ceil(288 * 2.1) * 10 + Math.ceil(144 * 2.1) * 50, 1e-6);
});

section('Döngü kayıtları');
test('Gelirden seviye: 18 Eki 19C %84,24 $62 → 19; 14 Eki 19B %100 $64 → 19; yanlış girişte null', () => {
  eq(R.seviyeTahmini({ gelir: 992303, fiyat: 62, doluluk: 84.24 }), 19);
  eq(R.seviyeTahmini({ gelir: 1216000, fiyat: 64, doluluk: 100 }), 19);
  eq(R.seviyeTahmini({ gelir: 1000000, fiyat: 62, doluluk: 84.24 }), null);
});
test('Kayıt analizi: gider, seviye başı gider, rating değişimi', () => {
  const a = R.kayitAnalizi({ fiyat: 62, doluluk: 98.73, gelir: 1040593, kar: 189259, ratingOnce: 5.72, ratingSonra: 5.74 }, { seviye: 17, tip: 'eko' });
  eq(a.seviye, 17);
  near(a.gider, 851334, 0);
  near(a.giderSeviye, 50078.47, 0.01);
  near(a.delta, 0.02, 1e-9);
});
test('Yapıştırılan oyun metni okunur (çok döngülü, "(-)" zarar, "collecting" satırı atlanır)', () => {
  const metin = `6.51 ★★★★★★★ (collecting customer feedback and occupancy stats) $64 Menu price
6.87 (-0.36) 6.51 about 3 hours ago I didn't give 5 stars because it's too expensive, not worth every penny.
100% Occupancy Revenue: $1,216,000 $64 Menu price Profit: $196,938
6.46 (-0.17) 6.29 about 4 hours ago I disliked the scent of soap in the bathroom, but the service was superb.
75.57% Occupancy Revenue: $796,455 $62 Menu price Profit: (-) $123,539`;
  const k = R.satirlariCoz(metin);
  eq(k.length, 2);
  eq(k[0], { ratingOnce: 6.87, ratingSonra: 6.51, onceSaat: 3, doluluk: 100, fiyat: 64, gelir: 1216000, kar: 196938 });
  eq(k[1], { ratingOnce: 6.46, ratingSonra: 6.29, onceSaat: 4, doluluk: 75.57, fiyat: 62, gelir: 796455, kar: -123539 });
});

test('"kaç saat önce" okunur: about 15 hours ago → 15, a day ago → 24, 2 days ago → 48, yaklaşık 5 saat önce → 5', () => {
  eq([R.onceSaatOku('about 15 hours ago'), R.onceSaatOku('a day ago'), R.onceSaatOku('2 days ago'), R.onceSaatOku('yaklaşık 5 saat önce'), R.onceSaatOku('x')], [15, 24, 48, 5, null]);
});

section('Rating modeli');
test('Kapanış ratingi ×0,875 yapar: 7 yükseltme vakasında ±0,02 içinde', () => {
  for (const [once, sonra] of [[4.70, 4.11], [4.58, 4.01], [4.86, 4.26], [6.58, 5.75], [6.69, 5.86], [5.95, 5.20], [5.86, 5.13]]) {
    near(R.kapanisSonrasi(once), sonra, 0.02, `${once}`);
  }
});
test('Yükseltme güvenliği: 5,2 güvenli, 5,0 değil (kapanış sonrası 4,5 altına iner)', () => {
  eq(R.yukseltmeGuvenli(5.2), true);
  eq(R.yukseltmeGuvenli(5.0), false);
});
test('Rating yolu ölçülen gidişe uyar: 3,95 → 4,25 → 4,61 → 4,86 (±0,07)', () => {
  const y = R.ratingYolu(3.95, 6, 3);
  near(y[1], 4.25, 0.07); near(y[2], 4.61, 0.07); near(y[3], 4.86, 0.07);
});
test('Yeni restoran (0) hedef 6 ile 4,5 eşiğine 8 döngüde; hedef eşiğin altındaysa hiç (null)', () => {
  eq(R.esigeDongu(0, 6, 4.5), 8);
  eq(R.esigeDongu(0, 4, 4.5), null);
  eq(R.esigeDongu(8.75, 2, 4.5), 6);
});
test('Hedef tahmini: döngü puanlarının ortalaması', () => {
  const h = R.hedefTahmini([{ ratingOnce: 5, ratingSonra: 5.177 }, { ratingOnce: 7, ratingSonra: 6.823 }]);
  near(h.hedef, 6, 1e-9);
  eq(h.n, 2);
});

section('Fiyat önerisi');
const rec = (saat, tarih, fiyat, doluluk, ratingOnce, ratingSonra) => ({ tarih, saat, fiyat, doluluk, ratingOnce, ratingSonra });
test('17L (18 Eki): %95 · %100 · %100, ort. %98,4 → hedef bantta, sabit (3 döngüden 2\'si %100 yetmez)', () => {
  const o = R.restoranOzeti([rec('19:27', '2026-10-17', 60, 95.13, 6.15, 5.81), rec('07:27', '2026-10-18', 60, 100, 5.81, 5.47), rec('19:27', '2026-10-18', 62, 100, 5.47, 5.71)]);
  eq(o.oneri.yon, 'sabit');
});
test('Rating sabit, son 4 döngünün 3\'ü %100 → zam $1', () => {
  const o = R.restoranOzeti([rec('07:27', '2026-10-17', 62, 100, 6.0, 6.05), rec('19:27', '2026-10-17', 62, 97, 6.05, 6.0), rec('07:27', '2026-10-18', 62, 100, 6.0, 6.02), rec('19:27', '2026-10-18', 62, 100, 6.02, 6.0)]);
  eq(o.oneri.yon, 'zam'); eq(o.oneri.adim, 1);
});
test('Tek kötü döngü (19C %84) → sabit, indirim yok', () => {
  const o = R.restoranOzeti([rec('19:27', '2026-10-17', 60, 100, 6.16, 6.10), rec('07:27', '2026-10-18', 60, 95.69, 6.10, 6.12), rec('19:27', '2026-10-18', 62, 84.24, 6.12, 6.11)]);
  eq(o.oneri.yon, 'sabit');
});
test('Rating 4,5 altında → fiyat değil rating önerisi', () => {
  const o = R.restoranOzeti([rec('07:27', '2026-10-12', 60, 46.18, 4.01, 4.26), rec('19:27', '2026-10-12', 60, 67.3, 4.26, 4.36)]);
  eq(o.oneri.yon, 'rating');
});
test('Zam sonrası doluluk $ başına 1,6 puandan fazla düştü → eski fiyata dön', () => {
  const k = [rec('07:27', '2026-10-16', 62, 99, 6, 6), rec('19:27', '2026-10-16', 62, 98, 6, 6), rec('07:27', '2026-10-17', 62, 99, 6, 6), rec('19:27', '2026-10-17', 62, 98, 6, 6),
    rec('07:27', '2026-10-18', 66, 88, 6, 6), rec('19:27', '2026-10-18', 66, 90, 6, 6), rec('07:27', '2026-10-19', 66, 91, 6, 6), rec('19:27', '2026-10-19', 66, 89, 6, 6)];
  const o = R.restoranOzeti(k);
  eq(o.oneri.yon, 'indir'); eq(o.oneri.adim, 4);
});
test('Aynı döngü kıyası (14 Eki 07:27): döngü ortalamasından sapma fiyat başına', () => {
  const k = [[64, 100], [63, 100], [63, 85.92], [63, 100], [63, 91.69], [63, 100], [64, 98.16], [60, 96.62], [61, 100]]
    .map(([f, d]) => rec('07:27', '2026-10-14', f, d));
  const s = R.ayniDonguKiyasi(k);
  eq(s.donguSayisi, 1);
  const f64 = s.satirlar.find((x) => x.fiyat === 64);
  near(f64.doluluk, 99.08, 0.01);
  ok(f64.sapma > 0, '$64 döngü ortalamasının üstünde');
});
test('Sabah/akşam biten döngü ayrımı', () => {
  eq(R.donguDilimi('07:27'), 'sabah'); eq(R.donguDilimi('19:27'), 'aksam'); eq(R.donguDilimi(''), null);
  const d = R.dilimKiyasi([rec('07:27', 'x', 60, 100), rec('19:27', 'x', 60, 90)]);
  eq([d.sabah.ort, d.aksam.ort, d.sabah.tam], [100, 90, 1]);
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
