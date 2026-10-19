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
test('Hedef: elle girilen önce; önceki+mevcut varsa tahmin; yoksa eko varsayılan (bonusla kayar), lüks mevcut rating', () => {
  eq(R.hedefRating({ hedef: 7.2, tip: 'eko' }), { deger: 7.2, kaynak: 'girilen' });
  const t = R.hedefRating({ onceki: 5, rating: 5.177, tip: 'eko' });
  near(t.deger, 6, 1e-9); eq(t.kaynak, 'tahmin');
  near(R.hedefRating({ tip: 'eko' }, 0.99).deger, 6, 1e-9);
  near(R.hedefRating({ tip: 'eko' }, 1.19).deger, 6.2, 1e-9); // bonus 0,2 artınca hedef 0,2 artar
  eq(R.hedefRating({ tip: 'luks', rating: 8.75 }), { deger: 8.75, kaynak: 'bilinmiyor' });
});
test('Kalite: 11 Ekim menüsü (Q7, Q10, Q7, Q5, Q7, Q9) ortalama 7,5 ve bonus 0,99 ile hedef 6; kalite düştükçe hedef düşer', () => {
  const ref = [[117, 7], [119, 10], [142, 7], [143, 5], [124, 7], [125, 9]].map(([id, kalite]) => ({ id, birim: 1, kalite }));
  near(R.menuKalitesi(ref), 7.5, 1e-9);
  near(R.hedefRating({ tip: 'eko' }, 0.99, R.menuKalitesi(ref)).deger, 6, 1e-9);
  near(R.hedefRating({ tip: 'eko' }, 0.32, 0).deger, 0.32, 1e-9); // Q0 menü: yalnız bonus
  near(R.hedefRating({ tip: 'eko' }, 0.99, 10).deger, 10 * R.KALITE_RATING + 0.99, 1e-9);
  eq(R.menuKalitesi([{ id: 117, birim: 1 }]), null);
  const r = R.restoranDegerlendir([{ id: 'a', tip: 'eko', seviye: 2, fiyat: 62, rating: 0 }],
    { adminNet: 0, ratingBonus: 0.32, mod: 'beklenen', menuOf: () => ref.map((m) => ({ ...m, kalite: 0 })) });
  near(r.rows[0].hedef.deger, 0.32, 1e-9); eq(r.rows[0].kalite, 0);
});
test('Rating hedefe yaklaşır: 3,95 → 4,25 → 4,61 → 4,86 ölçümüyle aynı hedefi (~6) verir', () => {
  near(R.hedefRating({ onceki: 3.95, rating: 4.25 }).deger, 3.95 + 0.30 / R.RATING.k, 1e-9);
  near(R.hedefRating({ onceki: 3.95, rating: 4.25 }).deger, 5.64, 0.01);
});
test('Beklenen doluluk: eşiğin üstünde son doluluk korunur, altında düşük; eşiğin altından çıkınca varsayılan üst', () => {
  eq(R.beklenenDoluluk(6, 6.5, 91), 91);
  eq(R.beklenenDoluluk(6, 6.5, null), R.DOLULUK.ust);
  eq(R.beklenenDoluluk(4, 6, 98), R.DOLULUK.alt);
  eq(R.beklenenDoluluk(4, 4.2, 60), 60);
  eq(R.beklenenDoluluk(6, 4, 46), R.DOLULUK.ust);
});

section('Bina bazlı değerlendirme (Perakende özetine giren)');
const MENU25 = menuWith(C25, A25);
const ctxR = (extra = {}) => ({ adminNet: 0.4447, averageSalary: 345, salaryModifier: 1.7, ratingBonus: 0.99, mod: 'simdi', menuOf: () => MENU25, ...extra });
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
  eq(bek.rows[0].beklenen.doluluk, R.DOLULUK.alt);
  eq(sim.rows[0].simdi.doluluk, 98);
});
test('Satış hızı/iletişim bonusu hedefi kaydırır: bonus +0,2 → hedef +0,2 → beklenen rating +0,2', () => {
  const it = { id: 'a', tip: 'eko', seviye: 10, fiyat: 62, rating: 6, doluluk: 98 };
  const a = R.restoranDegerlendir([it], ctxR({ ratingBonus: 0.99 }));
  const b = R.restoranDegerlendir([it], ctxR({ ratingBonus: 1.19 }));
  near(b.rows[0].beklenen.rating - a.rows[0].beklenen.rating, 0.2, 1e-9);
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
