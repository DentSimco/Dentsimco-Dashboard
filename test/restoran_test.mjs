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

test('İyi personel (goodService): maaş ×5; oyun ekranı lüks seviye 1: maaş $4.461 + ekstra $17.844', () => {
  const w = 4461 / R.DONGU_SAAT / 0.5; // eko seviye başı saatlik maaş
  near(R.donguMaasi(w, 1, 'luks'), 4461, 1e-6);
  near(R.donguMaasi(w, 1, 'luks', true), 4461 + 17844, 1e-6);
  near(R.donguMaasi(w, 1, 'luks', true) - R.donguMaasi(w, 1, 'luks'), 17844, 1e-6);
  const g = (iyi) => R.donguGideri({ menu: [{ id: 117, birim: 10 }, { id: 142, birim: 10 }, { id: 124, birim: 10 }], seviye: 3, saatlikMaas: 900, iyiHizmet: iyi });
  near(g(true).maas, g(false).maas * 5, 1e-6);
  eq(g(true).malzeme, g(false).malzeme);
  eq(g(false).iyiHizmet, false);
});
test('Lüks seviye 1 oyun ekranı: yemek adetleri ×0,5 (süt 144, ekmek 13, salata 5, samosa 6, portakal suyu 72, elma suyu 65)', () => {
  const a = R.ihtiyac([117, 121, 142, 143, 124, 125], 1, 'luks');
  eq([117, 121, 142, 143, 124, 125].map((id) => a[id]), [144, 13, 5, 6, 72, 65]);
});

section('Kategori çarpanı');
test('Kategori çarpanı oyunun istemci kodundan (index.js ZMr): 2,1 · 1 · 0,9 · 0,8 · 0,8 · 0,8', () => {
  eq([1, 2, 3, 4, 5, 6].map(R.kategoriCarpani), [2.1, 1, 0.9, 0.8, 0.8, 0.8]);
  eq(Object.values(R.CARPAN_DOGRULANDI).every(Boolean), true);
});
test('Salata barında 3 ürün (süt + ekmek + tereyağı), seviye 2 → 519 süt, 45 ekmek, 167 tereyağı', () => {
  const a = R.ihtiyac([117, 121, 134, 142, 124], 2, 'eko');
  eq([a[117], a[121], a[134]], [519, 45, 167]);
});
test('Bal kabağı çorbası oranı oyunda 9,2', () => {
  eq(R.URUNLER[149].oran, 9.2);
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
test('Yükseltme güvenliği (ısı haritası): $60\'ta kapanış sonrası doluluk ≥ %90 için rating ~7 gerekir; pahalı fiyatta daha çok', () => {
  eq(R.yukseltmeGuvenli(7.2), true);
  eq(R.yukseltmeGuvenli(6.5), false);
  eq(R.yukseltmeGuvenli(7.2, 90), false);
  eq(R.yukseltmeGuvenli(9.5, 90), true);
});

section('Hedef rating ve beklenen doluluk');
test('Hedef: elle girilen önce; önceki+mevcut varsa tahmin; yoksa eko varsayılan (bonusla kayar), lüks eko hedefin ×1,25 katı', () => {
  eq(R.hedefRating({ hedef: 7.2, tip: 'eko' }), { deger: 7.2, kaynak: 'girilen' });
  const t = R.hedefRating({ onceki: 5, rating: 5.177, tip: 'eko' });
  near(t.deger, 6, 1e-9); eq(t.kaynak, 'tahmin');
  near(R.hedefRating({ tip: 'eko' }, 0.99).deger, 6.045, 1e-9); // kalite bilinmiyorsa referans menü (Q7,5)
  near(R.hedefRating({ tip: 'eko' }, 1.19).deger, 6.245, 1e-9); // bonus 0,2 artınca hedef 0,2 artar
  // lüks: eko hedef × 1,25 [hipotez], 10'a kırpılı; mevcut rating hedefi etkilemez
  eq(R.hedefRating({ tip: 'luks', rating: 8.75 }, 0.99), { deger: 6.045 * 1.25, kaynak: 'varsayilan', luksCarpani: 1.25 });
  near(R.hedefRating({ tip: 'luks' }, 0.99).deger, R.hedefRating({ tip: 'eko' }, 0.99).deger * R.LUKS_RATING_CARPANI, 1e-9);
  eq(R.hedefRating({ tip: 'luks' }, 3).deger, 10);
  eq(R.hedefRating({ tip: 'luks', hedef: 7.2 }), { deger: 7.2, kaynak: 'girilen' }); // elle girilen çarpılmaz
  near(R.hedefRating({ tip: 'luks', onceki: 5, rating: 5.177 }).deger, 6, 1e-9); // ölçülmüş geçişten çıkan hedef çarpılmaz
});
test('Kalite: 11 Ekim menüsü (Q7, Q10, Q7, Q5, Q7, Q9) ortalama 7,5 ve bonus 0,99 ile hedef ~6; seviye 2 testi (Q0,5, bonus 0,32) ~3,8', () => {
  const ref = [[117, 7], [119, 10], [142, 7], [143, 5], [124, 7], [125, 9]].map(([id, kalite]) => ({ id, birim: 1, kalite }));
  near(R.menuKalitesi(ref), 7.5, 1e-9);
  near(R.hedefRating({ tip: 'eko' }, 0.99, R.menuKalitesi(ref)).deger, 6.045, 1e-9);
  near(R.hedefRating({ tip: 'eko' }, 0.32, 0).deger, 3.65, 1e-9); // Q0 menü: taban + bonus
  near(R.hedefRating({ tip: 'eko' }, 0.32, 0.5).deger, 3.765, 1e-9); // seviye 2 testi: ilk döngü artışı 0,177 × 3,765 ≈ 0,67 (gözlenen 0,64)
  near(R.hedefRating({ tip: 'eko' }, 0.99, 10).deger, R.KALITE_TABAN + 10 * R.KALITE_RATING + 0.99, 1e-9);
  eq(R.menuKalitesi([{ id: 117, birim: 1 }]), null);
  const r = R.restoranDegerlendir([{ id: 'a', tip: 'eko', seviye: 2, fiyat: 62, rating: 0 }],
    { adminNet: 0, ratingBonus: 0.32, mod: 'beklenen', menuOf: () => ref.map((m) => ({ ...m, kalite: 0 })) });
  near(r.rows[0].hedef.deger, 3.65, 1e-9); eq(r.rows[0].kalite, 0);
});
test('Rating hedefe yaklaşır: 3,95 → 4,25 → 4,61 → 4,86 ölçümüyle aynı hedefi (~6) verir', () => {
  near(R.hedefRating({ onceki: 3.95, rating: 4.25 }).deger, 3.95 + 0.30 / R.RATING.k, 1e-9);
  near(R.hedefRating({ onceki: 3.95, rating: 4.25 }).deger, 5.64, 0.01);
});
test('Doluluk ısı haritası: dilim ortalarında tablo değeri (Sim Companies Times, Eylül 2026)', () => {
  near(R.dolulukHaritasi(5.5, 75), 83.4, 1e-9); // rating 5, $60 dilimi
  near(R.dolulukHaritasi(6.5, 75), 94.2, 1e-9);
  near(R.dolulukHaritasi(4.5, 75), 46.9, 1e-9);
  near(R.dolulukHaritasi(8.5, 105), 92.3, 1e-9); // rating 8, $90 dilimi
  near(R.dolulukHaritasi(10.5, 135), 94.6, 1e-9); // rating 10+, $120 dilimi (lüks ağırlıklı)
  near(R.dolulukHaritasi(5.5, 105), 43.1, 1e-9);
});
test('Doluluk ısı haritası: ara değer, sınır ve yedek davranışı', () => {
  near(R.dolulukHaritasi(6, 60), R.dolulukHaritasi(6, 75), 1e-9); // $75 altı $60 dilimi
  near(R.dolulukHaritasi(5.5, 90), (83.4 + 43.1) / 2, 1e-9); // $75 ile $105 ortası
  near(R.dolulukHaritasi(0, 60), R.dolulukHaritasi(0.5, 60), 1e-9);
  near(R.dolulukHaritasi(11, 60), R.dolulukHaritasi(10.5, 60), 1e-9);
  near(R.dolulukHaritasi(NaN, NaN), R.dolulukHaritasi(0, 60), 1e-9);
  near(R.dolulukRating(5.5), 83.4, 1e-9); // eski ad, $60
});
test('Doluluk ısı haritası: rating arttıkça artar, fiyat arttıkça azalır (240 dolara kadar, rating 4,5+; düşük ratingde örnek az ve gürültülü), %0–100 içinde', () => {
  for (let p = 60; p <= 360; p += 15) {
    let onceki = -1;
    for (let r = 0; r <= 10.5; r += 0.25) {
      const v = R.dolulukHaritasi(r, p);
      ok(v >= onceki - 1e-9 && v >= 0 && v <= 100, `rating ${r} fiyat ${p}: ${v}`);
      onceki = v;
    }
  }
  for (let r = 4.5; r <= 10.5; r += 0.5) for (let p = 60; p < 240; p += 15) ok(R.dolulukHaritasi(r, p + 15) <= R.dolulukHaritasi(r, p) + 1e-9, `fiyat ${p} rating ${r}`);
});
test('Beklenen doluluk: rating değişmiyorsa ya da platoda kalıyorsa son ölçüm, değilse harita', () => {
  eq(R.beklenenDoluluk(6.5, 6.8, 91, 62), 91); // plato (≥ DOLULUK_ESIK) ve değişim
  eq(R.beklenenDoluluk(4.2, 4.3, 60, 62), 60); // rating yerinde (±0,25)
  near(R.beklenenDoluluk(6.5, 6.8, null, 62), R.dolulukHaritasi(6.5, 62), 1e-9);
  near(R.beklenenDoluluk(4, 6.5, 98, 62), R.dolulukHaritasi(4, 62), 1e-9); // platodan düşüyor: harita
  near(R.beklenenDoluluk(7, 4, 46, 62), R.dolulukHaritasi(7, 62), 1e-9); // platoya çıkıyor: harita
  ok(R.beklenenDoluluk(5, 5, null, 62) > R.beklenenDoluluk(5, 5, null, 100), 'aynı rating, pahalı fiyatta düşük');
});

section('Bina bazlı değerlendirme (Perakende özetine giren)');
const MENU25 = menuWith(C25, A25);
const ctxR = (extra = {}) => ({ adminNet: 0.4447, averageSalary: 345, salaryModifier: 1.7, ratingBonus: 0.99, mod: 'simdi', menuOf: () => MENU25, ...extra });

section('Ekonomi fazı ve doluluk');
// 12 Ekim (resesyon): [rating, fiyat, doluluk %] — iki restoran grubunun döngüleri
const RESESYON = [[4.01, 60, 46.18], [4.26, 60, 67.30], [3.95, 60, 40.64], [4.25, 60, 70.54], [4.61, 60, 100], [5.13, 60, 98.16], [5.09, 64, 100], [5.23, 62, 98.14],
  [5.20, 63, 100], [5.41, 63, 100], [5.66, 62, 100], [6.04, 62, 93.87], [5.75, 62, 100], [5.84, 62, 100], [6.36, 61, 85.42], [5.86, 64, 100], [5.90, 64, 93],
  [6.46, 63, 100], [6.55, 63, 98.05], [6.57, 62, 87.87], [6.46, 62, 75.57], [8.75, 61, 100], [8.17, 63, 94.98]];
const mae = (faz) => RESESYON.reduce((t, [r, p, o]) => t + Math.abs(R.dolulukHaritasi(r, p, faz) - o), 0) / RESESYON.length;
test('Faz: normal haritayı kaydırmaz; resesyon rating +0,9, boom −0,8 gibi davranır', () => {
  near(R.dolulukHaritasi(5, 62), R.dolulukHaritasi(5, 62, 'normal'), 0);
  near(R.dolulukHaritasi(5, 62, 'boom'), R.dolulukHaritasi(4.2, 62, 'normal'), 1e-9);
  ok(R.dolulukHaritasi(5, 62, 'boom') < R.dolulukHaritasi(5, 62, 'normal') - 15, 'boom uçurumu sağa kaydırır');
  near(R.dolulukHaritasi(5, 62, 'resesyon'), R.dolulukHaritasi(5.9, 62, 'normal'), 1e-9);
  near(R.dolulukHaritasi(5, 62, 'bilinmeyen'), R.dolulukHaritasi(5, 62), 0);
  ok(R.dolulukHaritasi(4.5, 60, 'resesyon') > R.dolulukHaritasi(4.5, 60, 'normal') + 15, 'düşük ratingte resesyon doluluğu belirgin yükseltir');
  near(R.dolulukHaritasi(10, 60, 'resesyon'), R.dolulukHaritasi(10, 60, 'normal'), 1.0); // tavan değişmez
  eq(R.FAZ_ADI, ['resesyon', 'normal', 'boom']);
  eq(R.FAZ_OLCULDU.boom, true);
});
// Boom (23 Ekim 15:00 UTC'den beri), $60: [rating, doluluk %]
const BOOM = [[6.304, 95.32], [5.830, 90.59], [5.387, 48.94], [4.907, 51.63], [5.61, 47.44]];
test('Boom verisi (5 döngü): faz kaymasıyla hata normal haritanın üçte ikisine iner', () => {
  const mae = (faz) => BOOM.reduce((t, [r, o]) => t + Math.abs(R.dolulukHaritasi(r, 60, faz) - o), 0) / BOOM.length;
  ok(mae('normal') > 15, `normal: ${mae('normal')}`);
  ok(mae('boom') < 12.5, `boom: ${mae('boom')}`);
});
test('12 Ekim resesyon verisi (23 döngü): faz kaymasıyla hata normal haritanın yarısına iner', () => {
  ok(mae('normal') > 14, `normal harita: ${mae('normal')}`);
  ok(mae('resesyon') < 8.5, `resesyon: ${mae('resesyon')}`);
});
test('Faz bina değerlendirmesine ve yükseltme güvenliğine girer', () => {
  const ctx = { adminNet: 0.4447, averageSalary: 345, salaryModifier: 1.7, ratingBonus: 0.99, mod: 'simdi', menuOf: () => MENU25 };
  const it = { id: 'a', tip: 'eko', seviye: 10, fiyat: 62, rating: 5, hedef: 5 };
  const n = R.restoranDegerlendir([it], { ...ctx, faz: 'normal' }).rows[0].beklenen.doluluk;
  const r = R.restoranDegerlendir([it], { ...ctx, faz: 'resesyon' }).rows[0].beklenen.doluluk;
  ok(r > n + 10, `resesyon ${r} normal ${n}`);
  near(R.restoranDegerlendir([it], ctx).rows[0].beklenen.doluluk, n, 0); // faz verilmezse normal
  eq(R.yukseltmeGuvenli(6.6, 60, 'normal'), false);
  eq(R.yukseltmeGuvenli(6.6, 60, 'resesyon'), true);
});
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
  near(bek.rows[0].beklenen.doluluk, R.dolulukHaritasi(3.5, 62), 1e-9);
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
