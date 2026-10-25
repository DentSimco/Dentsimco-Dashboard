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
  near(R.hedefRating({ tip: 'eko' }, 0.99).deger, 6.045, 1e-9); // kalite bilinmiyorsa referans menü (Q7,5)
  near(R.hedefRating({ tip: 'eko' }, 1.19).deger, 6.245, 1e-9); // bonus 0,2 artınca hedef 0,2 artar
  eq(R.hedefRating({ tip: 'luks', rating: 8.75 }), { deger: 8.75, kaynak: 'bilinmiyor' });
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
test('Beklenen doluluk: eşiğin üstünde son doluluk korunur, altında düşük; eşiğin altından çıkınca varsayılan üst', () => {
  eq(R.beklenenDoluluk(6, 6.5, 91), 91);
  eq(R.beklenenDoluluk(6, 6.5, null), R.DOLULUK.ust);
  near(R.beklenenDoluluk(4, 6, 98), R.dolulukRating(4), 1e-9);
  near(R.dolulukRating(0), 13, 1e-9); near(R.dolulukRating(4.61), 96.5, 1e-9); near(R.dolulukRating(8), 96.5, 1e-9);
  ok(R.dolulukRating(4.1) > R.dolulukRating(3.5) && R.dolulukRating(3.5) > R.dolulukRating(1), 'doluluk ratingle artar');
  eq(R.beklenenDoluluk(4, 4.2, 60), 60);
  eq(R.beklenenDoluluk(6, 4, 46), R.DOLULUK.ust);
});

section('Bina bazlı değerlendirme (Perakende özetine giren)');
const MENU25 = menuWith(C25, A25);
const ctxR = (extra = {}) => ({ adminNet: 0.4447, averageSalary: 345, salaryModifier: 1.7, ratingBonus: 0.99, mod: 'simdi', menuOf: () => MENU25, ...extra });
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
  near(bek.rows[0].beklenen.doluluk, R.dolulukRating(3.5), 1e-9);
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

section('Menü önerisi: hedef ortalama kaliteyle en ucuz dağılım');
// Fiyat tablosu: { id: { q: birim } }; tabloda olmayan kalite borsada yok sayılır
const tabloFiyat = (t) => (id, q) => t[id]?.[q] ?? null;
const sabitQ6 = (ids, p = 100) => Object.fromEntries(ids.map((id) => [id, { 6: p }]));
// Örnek: süt Q2 + köfte Q10 (ortalama Q6). Süt Q2→Q3 basamağı 2.880 × $0,1 = $288, köfte Q10→Q9 basamağı 36 × $20 = $720.
const ORNEK = [117, 121, 131, 129, 124, 125]; // süt, ekmek | köfte, hamburger | portakal, elma suyu
const ORNEK_FIYAT = { ...sabitQ6([121, 129, 124, 125], 10), 117: { 2: 2, 3: 2.1, 4: 2.5 }, 131: { 8: 1060, 9: 1080, 10: 1100 } };
const ORNEK_MENU = [[117, 2], [121, 6], [131, 10], [129, 6], [124, 6], [125, 6]].map(([id, kalite]) => ({ id, kalite }));
const B10 = [{ seviye: 10, tip: 'eko' }];
const FIYAT = tabloFiyat(ORNEK_FIYAT);
test('Süt Q2 + köfte Q10 → süt Q3 + köfte Q9: aynı ortalama Q6, döngüde $288 − $720 = $432 tasarruf', () => {
  const o = R.enUcuzMenu({ binalar: B10, fiyatOf: FIYAT, hedefKalite: 6, urunler: ORNEK });
  eq(o.secim.map((x) => [x.id, x.kalite]), [[117, 3], [121, 6], [129, 6], [131, 9], [124, 6], [125, 6]]); // kategori sırası
  near(o.ortalama, 6, 1e-9);
  near(R.menuMaliyeti(ORNEK_MENU, { binalar: B10, fiyatOf: FIYAT }).maliyet - o.maliyet, 432, 1e-6);
});
test('Süt Q3 basamağında arz yetmezse kalite değişmez; Q4 ilanları Q3 ihtiyacını karşılar (Σ q′ ≥ q)', () => {
  const arz = (yuksek) => (id, q) => (id === 117 ? { 2: 1e6, 3: 1000, 4: yuksek }[q] ?? 0 : null);
  const yok = R.enUcuzMenu({ binalar: B10, fiyatOf: FIYAT, arzOf: arz(0), hedefKalite: 6, urunler: ORNEK });
  eq(yok.secim.filter((x) => [117, 131].includes(x.id)).map((x) => [x.id, x.kalite]), [[117, 2], [131, 10]]);
  const var_ = R.enUcuzMenu({ binalar: B10, fiyatOf: FIYAT, arzOf: arz(5000), hedefKalite: 6, urunler: ORNEK });
  eq(var_.secim.find((x) => x.id === 117).kalite, 3);
  const m = R.menuMaliyeti([{ id: 117, kalite: 3 }, { id: 131, kalite: 9 }, { id: 124, kalite: 6 }], { binalar: B10, fiyatOf: FIYAT, arzOf: arz(0) });
  eq(m.arzYetersiz, [117]);
});
test('Fiyatı olmayan kalite seçilmez; hiçbir kombinasyon hedefe ulaşmıyorsa çözüm yok', () => {
  const o = R.enUcuzMenu({ binalar: B10, fiyatOf: FIYAT, hedefKalite: 6, urunler: ORNEK });
  ok(o.secim.every((x) => ORNEK_FIYAT[x.id][x.kalite] != null), 'yalnız fiyatı olan kaliteler');
  eq(R.enUcuzMenu({ binalar: B10, fiyatOf: FIYAT, hedefKalite: 7, urunler: ORNEK }), { ok: false, neden: 'ulasilamaz' });
  eq(R.enUcuzMenu({ binalar: B10, fiyatOf: FIYAT, hedefKalite: 6, urunler: [117, 124] }).neden, 'kategori');
});
test('Ürün de seçilince kategorideki ürün sayısı korunur; birim fiyatı değil, toplam tutarı ucuz olan seçilir', () => {
  // Hepsi Q6: tereyağının birim fiyatı ($5) ekmeğin ($10) yarısı ama oranı (92,6) ekmeğinkinin (24,89) ~4 katı
  const f = { ...sabitQ6([131, 129, 124, 125], 10), 117: { 6: 1 }, 121: { 6: 10 }, 134: { 6: 5 } };
  const o = R.enUcuzMenu({ binalar: B10, fiyatOf: tabloFiyat(f), hedefKalite: 6, kategoriAdet: { salata: 2, ana: 2, icecek: 2 } });
  eq(R.kategoriSayilari(o.secim.map((x) => x.id)), { salata: 2, ana: 2, icecek: 2 });
  eq(o.secim.filter((x) => R.URUNLER[x.id].kat === 'salata').map((x) => x.id), [117, 121]); // tereyağı: 926 × $5 > ekmek: 249 × $10
});
test('Menü önerisi: seviye yoksa öneri yok; güvenli hedef rating 5,2 + 0,3 → ortalama ≥ (5,5 − 3,33 − 0,99) ÷ 0,23 ≈ Q5,13', () => {
  eq(R.oneriMenu({ binalar: [{ seviye: 0 }], fiyatOf: FIYAT, hedef: 'guvenli' }).durum, 'seviye');
  near(R.gerekenKalite(5.5, 0.99), 5.1304, 1e-4);
  const o = R.oneriMenu({ binalar: B10, fiyatOf: FIYAT, hedef: 'guvenli', bonus: 0.99, urunSayisi: 2 });
  eq(o.durum, 'ok');
  near(o.hedefKalite, 5.1304, 1e-4);
  ok(o.ortalama >= o.hedefKalite && o.rating >= R.RATING.guvenli + R.RATING_PAYI - 1e-9, 'hedef ve tahmini rating güvenli');
  eq(o.sayilar, { salata: 2, ana: 2, icecek: 2 });
});
test('Otomatik: kategorilerin ürün sayısı birbirinden bağımsız seçilir (1-2-1, 2-1-1 …); hiçbiri 3\'ü aşmaz', () => {
  // Kategori maliyeti: 1 ürün 2,1 × c₁; 2 ürün c₁ + c₂ (çarpan 1) → c₂ < 1,1 × c₁ ise 2 ürün, değilse 1 ürün kazanır.
  // c = ⌈oran × çarpan × seviye⌉ × fiyat. Fiyatı oranla ters orantılı vermek maliyetleri eşitler.
  const esit = (ids) => Object.fromEntries(ids.map((id) => [id, { 6: 1000 / R.URUNLER[id].oran }]));
  // Salata barı: tek ucuz ürün (1) · ana yemek: maliyeti eşit iki ürün (2) · içecek: yalnız bir ürünün fiyatı var (1) → 1-2-1
  const a = { 117: { 6: 0.01 }, 121: { 6: 1e6 }, 134: { 6: 1e6 }, ...esit([129, 131]), 124: { 6: 1 } };
  eq(R.oneriMenu({ binalar: B10, fiyatOf: tabloFiyat(a), hedef: 'kalite', kalite: 6, urunSayisi: 0 }).sayilar, { salata: 1, ana: 2, icecek: 1 });
  // Salata barı: maliyeti eşit iki ürün (2) · ana yemek: tek ucuz ürün (1) · içecek: tek ürün (1) → 2-1-1
  const b = { ...esit([117, 121]), 131: { 6: 1 }, 129: { 6: 1e6 }, 124: { 6: 1 } };
  eq(R.oneriMenu({ binalar: B10, fiyatOf: tabloFiyat(b), hedef: 'kalite', kalite: 6, urunSayisi: 0 }).sayilar, { salata: 2, ana: 1, icecek: 1 });
  for (const f of [a, b]) {
    const o = R.oneriMenu({ binalar: B10, fiyatOf: tabloFiyat(f), hedef: 'kalite', kalite: 6, urunSayisi: 0 });
    ok(Object.values(o.sayilar).every((n) => n >= 1 && n <= R.OTOMATIK_EN_FAZLA), '1–3 arası');
  }
});
test('Menü önerisi: hedef kalite; ürün sayısı verilmezse en ucuz sayı seçilir; ulaşılamayan ya da fiyatsız kategori bildirilir', () => {
  const f = sabitQ6(Object.keys(R.URUNLER).map(Number), 10);
  const sabit = R.oneriMenu({ binalar: B10, fiyatOf: tabloFiyat(f), hedef: 'kalite', kalite: 6, urunSayisi: 3 });
  eq(sabit.sayilar.salata, 3);
  const oto = R.oneriMenu({ binalar: B10, fiyatOf: tabloFiyat(f), hedef: 'kalite', kalite: 6, urunSayisi: 0 });
  ok(oto.maliyet <= sabit.maliyet, 'serbest seçim sabit sayıdan pahalı olamaz');
  eq(R.oneriMenu({ binalar: B10, fiyatOf: tabloFiyat(f), hedef: 'kalite', kalite: 7, urunSayisi: 2 }).neden, 'ulasilamaz');
  // Otomatik en çok 3 ürün seçer (4 ve üstü önerilmez); 1 ürün seçilince çarpan 2,1: ⌈oran × 2,1 × seviye⌉
  ok(Object.values(oto.sayilar).every((n) => n >= 1 && n <= R.OTOMATIK_EN_FAZLA), 'otomatik 1–3 ürün');
  const bir = R.oneriMenu({ binalar: B10, fiyatOf: tabloFiyat(f), hedef: 'kalite', kalite: 6, urunSayisi: 1 });
  eq(bir.sayilar, { salata: 1, ana: 1, icecek: 1 });
  eq(bir.secim.map((x) => x.adet), bir.secim.map((x) => Math.ceil(R.URUNLER[x.id].oran * 2.1 * 10 - 1e-9)));
  eq(R.enUcuzMenu({ binalar: B10, fiyatOf: tabloFiyat(f), hedefKalite: 6, enFazla: 6 }).secim.length > 0, true);
  eq(R.oneriMenu({ binalar: B10, fiyatOf: tabloFiyat(sabitQ6([117, 121])), hedef: 'kalite', kalite: 6, urunSayisi: 2 }).kategori, 'Ana yemek');
});
test('Ortak menü: ihtiyaç binaların toplamı, her bina ayrı yuvarlanır (köfte tek başına: 2 × ⌈3,505 × 2,1⌉ = 16, seviye 2 tek bina 15)', () => {
  const f = tabloFiyat({ 117: { 0: 1 }, 131: { 0: 1 }, 124: { 0: 1 } });
  const menu = [117, 131, 124].map((id) => ({ id, kalite: 0 }));
  const iki = R.menuMaliyeti(menu, { binalar: [{ seviye: 1 }, { seviye: 1 }], fiyatOf: f });
  const tek = R.menuMaliyeti(menu, { binalar: [{ seviye: 2 }], fiyatOf: f });
  eq([iki.kalemler[1].adet, tek.kalemler[1].adet], [16, 15]);
  eq(R.menuMaliyeti(menu, { binalar: [{ seviye: 2, tip: 'luks' }], fiyatOf: f }).kalemler[1].adet, 8);
});
// Kaba kuvvet: tüm ürün alt kümeleri ve kalite kombinasyonları denenir; motorun maliyeti en küçükle aynı olmalı
let tohum = 7;
const rastgele = () => { tohum = (tohum * 1103515245 + 12345) % 2147483648; return tohum / 2147483648; };
function rastgeleFiyat(ids, kaliteler) {
  const t = {};
  for (const id of ids) {
    let p = 1 + rastgele() * 50;
    t[id] = {};
    for (let q = 0; q <= 12; q++) { p += rastgele() * 8; if (kaliteler.includes(q) && rastgele() > 0.15) t[id][q] = p; } // kalitesi ≥ q en ucuz ilan: artan
  }
  return t;
}
function kabaKuvvet(adaylar, f, binalar, hedef, kaliteler) {
  const katlar = R.KATEGORILER.map((k) => k.urunler.filter((id) => adaylar.includes(id)));
  const altlar = katlar.map((l) => Array.from({ length: (1 << l.length) - 1 }, (_, m) => l.filter((_, i) => m + 1 & (1 << i))));
  let en = Infinity;
  for (const a of altlar[0]) for (const b of altlar[1]) for (const c of altlar[2]) {
    const ids = [...a, ...b, ...c];
    const kombi = (i, acc) => {
      if (i === ids.length) {
        const m = R.menuMaliyeti(ids.map((id, j) => ({ id, kalite: acc[j] })), { binalar, fiyatOf: f });
        if (m.maliyet != null && m.ortalama >= hedef - 1e-9) en = Math.min(en, m.maliyet);
        return;
      }
      for (const q of kaliteler) kombi(i + 1, [...acc, q]);
    };
    kombi(0, []);
  }
  return en;
}
test('Kaba kuvvetle aynı sonuç: 40 rastgele borsa, ürün seçimi serbest, birden çok bina', () => {
  const adaylar = [117, 121, 131, 142, 124, 132];
  const kaliteler = [1, 4, 6, 9];
  for (let i = 0; i < 40; i++) {
    const t = rastgeleFiyat(adaylar, kaliteler);
    const binalar = [{ seviye: 1 + Math.floor(rastgele() * 30) }, { seviye: 1 + Math.floor(rastgele() * 10), tip: 'luks' }];
    const hedef = Math.round(rastgele() * 18) / 2;
    const o = R.enUcuzMenu({ binalar, fiyatOf: tabloFiyat(t), hedefKalite: hedef });
    const k = kabaKuvvet(adaylar, tabloFiyat(t), binalar, hedef, kaliteler);
    if (k === Infinity) { eq(o.ok, false, `#${i}`); continue; }
    near(o.maliyet, k, 1e-6, `#${i}`);
    const m = R.menuMaliyeti(o.secim, { binalar, fiyatOf: tabloFiyat(t) });
    near(m.maliyet, o.maliyet, 1e-6, `#${i} motorun maliyeti menü hesabıyla aynı`);
    ok(m.ortalama >= hedef - 1e-9 && m.eksikKategori.length === 0, `#${i} hedef ve kategori`);
  }
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
