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
  const w = 23018 / 24;
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
  near(55924 / 12 / 11 / R.LUKS_MAAS, W25, 0.02); // oyun maaşı tam dolara yuvarlar
});

section('Kategori çarpanı');
test('Kategori çarpanı oyun kodundaki diziyle aynı: [2,1; 1; 0,9; 0,8; 0,8; 0,8] (1–6 ürün)', () => {
  eq([1, 2, 3, 4, 5, 6].map(R.kategoriCarpani), [2.1, 1, 0.9, 0.8, 0.8, 0.8]);
});
// Oyun ekranları (Ekim 2026, "Gerekli Miktar" sütunu), eko
test('Ekran: Sky Eco Resto III, seviye 1, 3-3-3 menü (çarpan 0,9) → 260 süt, 87 kahve, 16 turta, 9 salata, 10 samosa, 9 bal kabağı, 130 portakal, 117 elma, 103 zencefil', () => {
  const ids = [117, 119, 123, 142, 143, 149, 124, 125, 126];
  const a = R.ihtiyac(ids, 1, 'eko');
  eq(ids.map((id) => a[id]), [260, 87, 16, 9, 10, 9, 130, 117, 103]);
});
test('Ekran: Sky Eco Resto, seviye 2, 2-2-2 menü → 576 süt, 50 ekmek, 19 salata, 19 bal kabağı (oran 9,2), 288 portakal, 258 elma', () => {
  const ids = [117, 121, 142, 149, 124, 125];
  const a = R.ihtiyac(ids, 2, 'eko');
  eq(ids.map((id) => a[id]), [576, 50, 19, 19, 288, 258]);
});
test('Ekran: 1-1-1 menüler (çarpan 2,1) → seviye 1: 605 süt, 20 salata, 8 köfte, 8 hamburger, 271 elma; seviye 2: 1.210 süt, 43 samosa, 542 elma', () => {
  eq(R.ihtiyac([117, 142, 125], 1, 'eko'), { 117: 605, 142: 20, 125: 271 });
  eq(R.ihtiyac([117, 131, 125], 1, 'eko')[131], 8);
  eq(R.ihtiyac([117, 129, 125], 1, 'eko')[129], 8);
  eq(R.ihtiyac([117, 143, 125], 2, 'eko'), { 117: 1210, 143: 43, 125: 542 });
});
test('Ekran: kapanış ratingi ×0,875 yapar (Sky Eco Resto: 0,84 → 0,74 · 1,71 → 1,49)', () => {
  near(R.kapanisSonrasi(0.84), 0.74, 0.01);
  near(R.kapanisSonrasi(1.71), 1.49, 0.01);
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

section('Profesyonel çalışan (maaş ×5, oyun kodu)');
test('Profesyonel çalışan maaşı 5 katına çıkarır: donguMaasi, donguGideri, bina değerlendirmesi ve yönetimsiz taban maaş', () => {
  near(R.donguMaasi(100, 10, 'eko', true), 5 * R.donguMaasi(100, 10, 'eko', false), 1e-9);
  near(R.donguMaasi(100, 10, 'luks', true), 5 * R.donguMaasi(100, 10, 'luks', false), 1e-9);
  const menu = [{ id: 117, birim: 1 }, { id: 142, birim: 1 }, { id: 124, birim: 1 }];
  const g = (profesyonel) => R.donguGideri({ menu, seviye: 5, saatlikMaas: 800, profesyonel });
  near(g(true).maas, 5 * g(false).maas, 1e-9);
  near(g(true).malzeme, g(false).malzeme, 1e-9);
  const ev = (profesyonel) => R.restoranDegerlendir([{ id: 'a', tip: 'eko', profesyonel, seviye: 10, fiyat: 62, rating: 6, doluluk: 100 }],
    { adminNet: 0.3, averageSalary: 345, salaryModifier: 1.7, mod: 'simdi', menuOf: () => menu }).rows[0];
  near(ev(true).wagesDay, 5 * ev(false).wagesDay, 1e-6);
  near(ev(true).baseWagesDay, 5 * ev(false).baseWagesDay, 1e-6);
  eq(ev(true).profesyonel, true);
  near(ev(true).hedef.deger, ev(false).hedef.deger, 1e-12, 'ratinge etkisi bilinmiyor: hedef aynı');
});
test('Menü fiyatı sınırları $60–350', () => {
  eq([R.FIYAT_MIN, R.FIYAT_MAX], [60, 350]);
});

section('Yönetim, satış hızı ve rating bonusu');
test('Maaş: 1,7 × 345 × (1 + net yönetim gideri); 18 Ekim net %44,47 → $847,3/saat/seviye (oyun: $254.196 ÷ 12 ÷ 25)', () => {
  near(R.saatlikMaasSeviye({ salaryModifier: 1.7, averageSalary: 345, adminNet: 0.4447 }), 254196 / 12 / 25, 0.05);
  near(R.saatlikMaasSeviye({ adminNet: 0 }), 586.5, 1e-9);
});
test('Rating bonusu: ekip dışı satış hızı %15 × 0,02 + etkili iletişim 69 × 0,01 = 0,99 (yönetici ekranı: +0,3 +0,690)', () => {
  near(R.ratingBonusu(15, 69), 0.99, 1e-9);
  near(R.ratingBonusu(0, 0), 0, 1e-9);
});
test('Kapanış ratingi ×0,875 yapar: 7 yükseltme vakasında ±0,02 içinde', () => {
  for (const [once, sonra] of [[4.70, 4.11], [4.58, 4.01], [4.86, 4.26], [6.58, 5.75], [6.69, 5.86], [5.95, 5.20], [5.86, 5.13]]) {
    near(R.kapanisSonrasi(once), sonra, 0.02, `${once}`);
  }
});
test('Yükseltme güvenliği: 5,2 güvenli, 5,0 değil', () => {
  eq(R.yukseltmeGuvenli(5.2), true);
  eq(R.yukseltmeGuvenli(5.0), false);
});

section('Hedef rating ve beklenen doluluk');
test('Hedef: elle girilen önce; önceki+mevcut varsa tahmin; yalnız mevcut varsa mevcut; hiçbiri yoksa 0 (menüden tahmin yok)', () => {
  eq(R.hedefRating({ hedef: 7.2, tip: 'eko' }), { deger: 7.2, kaynak: 'girilen' });
  const t = R.hedefRating({ onceki: 5, rating: 5.177, tip: 'eko' });
  near(t.deger, 6, 1e-9); eq(t.kaynak, 'tahmin');
  eq(R.hedefRating({ rating: 4.2, tip: 'luks' }), { deger: 4.2, kaynak: 'mevcut' });
  eq(R.hedefRating({ tip: 'eko' }), { deger: 0, kaynak: 'yok' });
  eq(R.hedefRating({ tip: 'luks', rating: '' }), { deger: 0, kaynak: 'yok' });
  eq(R.hedefRating({ hedef: 15, tip: 'eko' }).deger, 10, 'hedef 10 ile sınırlanır');
});
test('Rating hedefe yaklaşır: 3,95 → 4,25 → 4,61 → 4,86 ölçümüyle aynı hedefi (~6) verir', () => {
  near(R.hedefRating({ onceki: 3.95, rating: 4.25 }).deger, 3.95 + 0.30 / R.RATING.k, 1e-9);
  near(R.hedefRating({ onceki: 3.95, rating: 4.25 }).deger, 5.64, 0.01);
});

section('Bina bazlı değerlendirme (Perakende özetine giren)');
const MENU25 = menuWith(C25, A25);
const ctxR = (extra = {}) => ({ adminNet: 0.4447, averageSalary: 345, salaryModifier: 1.7, mod: 'simdi', menuOf: () => MENU25, ...extra });
test('Menüdeki bir ürünün fiyatı yoksa (borsada ilan yok) kâr hesaplanmaz: null, satır ve toplam eksik işaretlenir', () => {
  const eksikMenu = () => MENU25.map((m, i) => (i === 0 ? { ...m, birim: null } : m));
  const r = R.restoranDegerlendir([{ id: 'a', tip: 'eko', seviye: 25, fiyat: 62, rating: 6, doluluk: 100 }], ctxR({ menuOf: eksikMenu }));
  eq([r.rows[0].eksik, r.rows[0].secili.profitDay, r.rows[0].simdi.profitDay, r.rows[0].beklenen.profitDay, r.totals.profitDay, r.totals.eksik], [true, null, null, null, null, 1]);
  const ok2 = R.restoranDegerlendir([{ id: 'a', tip: 'eko', seviye: 25, fiyat: 62, rating: 6, doluluk: 100 }], ctxR());
  eq([ok2.rows[0].eksik, Number.isFinite(ok2.totals.profitDay)], [false, true]);
});
test('18 Ekim, eko seviye 25, $62, %100 doluluk: döngü kârı oyunun %100 kârı ($272.726); günlük ×2', () => {
  const r = R.restoranDegerlendir([{ id: 'a', ad: 'x', tip: 'eko', seviye: 25, fiyat: 62, rating: 6, doluluk: 100 }], ctxR());
  near(r.totals.profitDay, 2 * 272726, 40);
  near(r.totals.revenueDay, 2 * 1550000, 1e-6);
  near(r.totals.costDay, 2 * 1023078, 4);
  near(r.totals.wagesDay, 2 * 254196, 4);
  eq(r.totals.levels, 25);
});
test('Yönetim gideri sıfırken maaş taban maaştır ve baseWagesDay ile aynıdır', () => {
  const r = R.restoranDegerlendir([{ id: 'a', tip: 'eko', seviye: 10, fiyat: 62, rating: 6, doluluk: 100 }], ctxR({ adminNet: 0 }));
  near(r.totals.wagesDay, 586.5 * 24 * 10, 1e-6);
  near(r.totals.wagesDay, r.totals.baseWagesDay, 1e-6);
});
test('Çoklu bina toplanır; lüks maaş ve yemek yarı, koltuk 500', () => {
  const rs = [{ id: 'a', tip: 'eko', seviye: 10, fiyat: 62, rating: 6, doluluk: 100 }, { id: 'b', tip: 'luks', seviye: 10, fiyat: 62, rating: 6, doluluk: 100 }];
  const r = R.restoranDegerlendir(rs, ctxR());
  near(r.rows[1].gider.koltuk * 2, r.rows[0].gider.koltuk, 0);
  near(r.rows[1].wagesDay * 2, r.rows[0].wagesDay, 1e-6);
  near(r.totals.revenueDay, r.rows[0].secili.revenueDay + r.rows[1].secili.revenueDay, 1e-6);
  eq(r.totals.levels, 20);
});
test('Şimdi ve beklenen: rating hedefi eşiğin altındaysa beklenen kâr düşer; mod seçimi toplamı değiştirir', () => {
  const it = { id: 'a', tip: 'eko', seviye: 10, fiyat: 62, rating: 6, doluluk: 98, hedef: 3.5 };
  const bek = R.restoranDegerlendir([it], ctxR({ mod: 'beklenen' }));
  const sim = R.restoranDegerlendir([it], ctxR({ mod: 'simdi' }));
  ok(bek.totals.profitDay < sim.totals.profitDay, 'beklenen daha düşük');
  near(bek.rows[0].beklenen.doluluk, R.dolulukTahmini(3.5, 62), 1e-9);
  eq(sim.rows[0].simdi.doluluk, 98);
});
test('Her restoran kendi menüsünü kullanabilir (menuOf bina başına)', () => {
  const kucuk = [{ id: 117, birim: 10 }, { id: 142, birim: 900 }, { id: 124, birim: 50 }];
  const rs = [{ id: 'a', tip: 'eko', seviye: 10, fiyat: 62, rating: 6, doluluk: 100 }, { id: 'b', tip: 'eko', seviye: 10, fiyat: 62, rating: 6, doluluk: 100 }];
  const r = R.restoranDegerlendir(rs, ctxR({ menuOf: (it) => (it.id === 'b' ? kucuk : MENU25) }));
  ok(r.rows[0].costDay !== r.rows[1].costDay, 'farklı menü farklı maliyet');
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
