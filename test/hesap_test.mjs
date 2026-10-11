// DentSimco — hesap motoru testleri. Çalıştırma: node test/hesap.test.mjs
// Beklenen değerlerin hepsi oyunun kendi ekranlarından, Cooper's Tools'tan ya da oyunculardan alınan ekran
// görüntülerinden; "İç tutarlılık" bölümü motorun kendi kurallarını, "Yaklaşık" bölümü doğrulanmamış çıkarımları sınar.

import * as H from '../public/hesap.js';
import { products, buildings, core, modifiers, NOW } from './veri-ornek.mjs';

const DATA = H.normalizeData({ products, buildings, core, modifiers, realm: 0 });
// Cooper saatlik maaşı tam dolara yuvarlıyor (241,5 → 242; 448,5 → 449). Onun ekranlarıyla karşılaştırmak için:
const COOPER = {
  ...DATA,
  products: Object.fromEntries(Object.entries(DATA.products).map(([k, p]) => [k, { ...p, baseSalary: Math.round(p.baseSalary + 1e-6) }])),
};
const REC9 = { park: 3, temple: 3, lake: 3 };

// ---- küçük test düzeneği ----
const results = [];
let group = '';
const section = (name) => { group = name; };
function test(name, fn) {
  try {
    fn();
    results.push({ group, name, ok: true });
  } catch (e) {
    results.push({ group, name, ok: false, error: e.message });
  }
}
function near(actual, expected, decimals, label = '') {
  const tol = 0.5 * 10 ** -decimals + 1e-9;
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} beklenen ${expected}, bulunan ${actual}`);
}
function within(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} beklenen ${expected} (±${tol}), bulunan ${actual}`);
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} beklenen ${b}, bulunan ${a}`);
}
function ok(value, label = 'koşul sağlanmadı') {
  if (!value) throw new Error(label);
}

function plan(setup, market = {}, data = DATA) {
  return H.evaluatePlan(setup, data, market, { now: NOW });
}
function one(product, level, o = {}) {
  const setup = {
    buildings: [{ product, level, quality: o.quality ?? 0, robots: !!o.robots, efficiency: o.efficiency ?? 100, event: o.event ?? false }],
    extraBonusPct: o.bonus ?? 0, // arayüzde yok; oyunun kendi hesaplayıcısındaki bonus kutusuyla karşılaştırma için
    economyPhase: o.phase ?? null,
    admin: o.net != null ? { mode: 'net', netPct: o.net } : { mode: 'savings', savingsPct: o.savings ?? 0 },
    recreation: o.recreation,
    otherLevels: o.otherLevels ?? 0,
    academyLevel: o.academy ?? 0,
  };
  const result = plan(setup, o.market ?? {}, o.data ?? DATA);
  return { setup, result, row: result.rows[0] };
}
const purchase = (result, product, minQuality) => result.purchases.find((p) => p.product === product && p.minQuality === minQuality);
const execs = (list) => list.map(([name, position, salary, coo, cfo, cmo, cto, active = true]) =>
  ({ name, position, salary, skills: { coo, cfo, cmo, cto }, active }));

// =====================================================================================================
section('Oyun · Üretim hesaplayıcı');
// Oyun yönetim giderini ekranda yuvarlayarak gösterir (%72,65) ama hesapta tam değeri kullanır:
// sizin şirket 325 ÷ 170 × (1 − 0,62) = %72,647…; "+" düğmesiyle 18 kez artırılınca %90,647…
const MY_NET = (325 / 170) * 0.38 * 100;
// [ad, ürün, seviye, bonus %, yönetim %, robot, verimlilik %, saatlik, işçi birim, yönetici birim]
const calculator = [
  ['Ekonomik e-araba, seviye 1', 53, 1, 0, MY_NET, false, 100, 21.73, 20.64, 15.0],
  ['Ekonomik e-araba, seviye 5', 53, 5, 0, MY_NET, false, 100, 108.64, 20.64, 15.0],
  ['Ekonomik e-araba, seviye 5, %5 bonus', 53, 5, 5, MY_NET, false, 100, 114.36, 19.61, 14.25],
  ['Ekonomik e-araba, seviye 5, %5 bonus, yönetim %90,65', 53, 5, 5, MY_NET + 18, false, 100, 114.36, 19.61, 17.78],
  ['Ekonomik e-araba, seviye 20', 53, 20, 0, MY_NET, false, 100, 434.56, 20.64, 15.0],
  ['Ekonomik e-araba, seviye 20, %12 bonus', 53, 20, 12, MY_NET, false, 100, 493.82, 18.16, 13.2],
  ['Ham petrol, seviye 1', 10, 1, 0, MY_NET, false, 100, 45.87, 11.28, 8.2],
  ['Ham petrol, seviye 1, verimlilik %90', 10, 1, 0, MY_NET, false, 90, 41.28, 12.53, 9.11],
  ['İnşaat gereci, %10 bonus, yönetim %75,6, robotsuz', 111, 1, 10, 75.6, false, 100, 1.17, 294.75, 222.83],
  ['İnşaat gereci, %10 bonus, yönetim %75,6, robotlu', 111, 1, 10, 75.6, true, 100, 1.17, 285.91, 216.15],
  ['Roket motoru, seviye 1', 86, 1, 0, MY_NET, false, 100, 0.32, 1969.03, 1430.44],
];
for (const [name, product, level, bonus, net, robots, efficiency, hourly, worker, adminCost] of calculator) {
  test(`${name} → ${hourly}/sa, işçi $${worker}, yönetici $${adminCost}`, () => {
    const { row } = one(product, level, { bonus, net, robots, efficiency });
    near(row.hourly, hourly, 2, 'saatlik üretim');
    near(row.unitWorker, worker, 2, 'işçi birim maliyeti');
    near(row.unitAdmin, adminCost, 2, 'yönetici birim maliyeti');
  });
}
test('Roket motoru: 1 adet 3 sa 10 dk', () => {
  const minutes = one(86, 1, { net: MY_NET }).row.hoursPerUnit * 60;
  eq([Math.floor(minutes / 60), Math.floor(minutes % 60)], [3, 10]);
});

// =====================================================================================================
section('Oyun · Üretim ekranı ve olaylar');
const juice22 = () => one(124, 22, { event: true, recreation: REC9, net: MY_NET });
test('Portakal suyu, İçecek fabrikası 22, olay +%27, rekreasyon %9 → 2.940,23/sa', () => {
  near(juice22().row.hourly, 2940.23, 2);
});
test('Aynı bina: maaş $9.173/sa (yönetim gideri dahil), olay maaşı değiştirmez', () => {
  const { row } = juice22();
  near(row.wageHour * (1 + MY_NET / 100), 9173, 0);
});
test('70.565 adet portakal suyu için 352.825 portakal ve 70.565 şeker', () => {
  eq(DATA.products[124].inputs.map(([id, a]) => [id, a * 70565]), [[4, 352825], [135, 70565]]);
});
test('Olay 12.10.2026 03:00\'te (Türkiye) bitiyor', () => {
  eq(H.activeEventPct(DATA, 124, Date.parse('2026-10-11T23:59:00Z')), 27);
  eq(H.activeEventPct(DATA, 124, Date.parse('2026-10-12T00:00:00Z')), 0);
});
test('Olumsuz olay: Pil −%21 → üretim ×0,79 (oyuncu doğruladı)', () => {
  near(one(22, 10, { event: true }).row.hourly, 27.170539637693224 * 10 * 0.79, 9);
});

// =====================================================================================================
section('Oyun · Kâr hesaplayıcı ve satış ekranı');
const profitCalc = () => plan(
  { buildings: [{ product: 53, level: 1 }], recreation: REC9, otherLevels: 325, admin: { mode: 'savings', savingsPct: 63 } },
  { '22:0': 97.5, '47:0': 458, '48:0': 212, '50:0': 310, '51:0': 800, '53:0': 3290 },
);
test('E-araba kaynak maliyeti $3.486,57 (girdiler $3.454,50 + işçilik ve yönetim $32,07)', () => {
  const r = profitCalc();
  near(r.rows[0].unitLabor, 32.07, 2, 'işçilik');
  near(r.totals.purchasesDay / r.rows[0].daily, 3454.5, 6, 'girdiler');
  near(r.sales[0].unitCost, 3486.57, 2, 'kaynak maliyeti');
});
test('Birim kâr −$196,57 (komisyon ve taşıma hariç, oyundaki gibi)', () => {
  near(profitCalc().sales[0].beforeFeesUnit, -196.57, 2);
});
test('Saat başına seviye başına kâr −$4.693,51', () => {
  within(profitCalc().sales[0].pphplBeforeFees, -4693.51, 0.011);
});
test('Borsa satışı: 1.000 portakal suyu × $50, kaynak $41.300,96 → tahmini kâr $6.340,84', () => {
  near(1000 * H.saleUnitNet(50, 1, 0.3582, 'exchange') - 41300.96, 6340.84, 2);
});
test('Kontrat satışı: taşıma 500 birim (borsadakinin yarısı), komisyon yok', () => {
  near(1000 * (50 - H.saleUnitNet(50, 1, 0.3582, 'contract')), 500 * 0.3582, 6);
});

// =====================================================================================================
section('Oyun · Yönetim ve yönetici ekranları');
for (const [levels, pct] of [[10, 5.29], [275, 161.18], [295, 172.94], [326, 191.18], [414, 242.94], [477, 280.0], [496, 291.18]]) {
  test(`${levels} seviye → brüt yönetim gideri %${pct}`, () => near(H.grossOverhead(levels) * 100, pct, 2));
}
test('Oyunun sunucu yanıtıyla aynı: 496 seviye → 2,9117647…', () => near(H.grossOverhead(496), 2.9117647058823533, 12));
const myCompany = () => ({
  buildings: [
    ...Array.from({ length: 3 }, () => ({ product: 124, level: 21 })),
    ...Array.from({ length: 10 }, () => ({ product: 124, level: 22 })),
    { product: 124, level: 23 },
  ],
  academyLevel: 20,
  recreation: REC9,
  admin: { mode: 'savings', savingsPct: 62 },
});
test('Sizin şirket: 306 seviye içecek fabrikası + 20 akademi = 326 (rekreasyon hariç) → %191,18', () => {
  const a = H.adminInfo(myCompany(), DATA);
  eq(a.totalLevels, 326);
  near(a.gross * 100, 191.18, 2);
  near(a.net * 100, 72.65, 2);
});
const myExecutivesApi = { executives: [
  { name: 'Marie Flores', salary: 225000, skills: { coo: 50, cfo: 10, cmo: 17, cto: 9 }, strikeUntil: '2026-08-27T04:00:18Z', currentWorkHistory: { position: 'o' } },
  { name: 'Nicholas Cook', salary: 7500, skills: { coo: 26, cfo: 4, cmo: 3, cto: 17 }, strikeUntil: '2026-08-27T04:00:18Z', currentWorkHistory: { position: 't' } },
  { name: 'Matthew Watson', salary: 8250, skills: { coo: 21, cfo: 5, cmo: 6, cto: 7 }, currentWorkHistory: { position: 'v' }, currentTraining: { training: 'o' } },
  { name: 'Ann Edwards', salary: 2323, skills: { coo: 11, cfo: 6, cmo: 5, cto: 4 }, currentWorkHistory: { position: '2' }, currentTraining: { training: 'o' } },
  { name: 'Teresa Jackson', salary: 37500, skills: { coo: 36, cfo: 7, cmo: 9, cto: 8 }, strikeUntil: '2026-08-27T04:00:18Z', currentWorkHistory: { position: 'm' } },
  { name: 'Sandra Johnson', salary: 1399, skills: { coo: 4, cfo: 4, cmo: 4, cto: 4 }, currentWorkHistory: { position: '1' }, currentTraining: { training: 'f' } },
  { name: 'Gloria Cook', salary: 1993, skills: { coo: 5, cfo: 12, cmo: 5, cto: 6 }, currentWorkHistory: { position: 'f' }, currentTraining: { training: 'f' } },
  { name: 'Sota Hara', salary: 2103, skills: { coo: 5, cfo: 5, cmo: 4, cto: 4 }, currentWorkHistory: { position: 'x' }, currentTraining: { training: 'f' } },
] };
test('Sizin yöneticiler (API): eğitimdekiler sayılmaz, yönetim puanı 65,5 → tasarruf %62 (oyun: 118,53 ÷ 191,18)', () => {
  const list = H.parseExecutives(JSON.stringify(myExecutivesApi), NOW);
  eq(list.filter((e) => e.active).map((e) => e.name), ['Marie Flores', 'Nicholas Cook', 'Teresa Jackson']);
  near(H.teamScores(list).coo, 65.5, 6);
  eq(H.managementSavingsPct(H.teamScores(list).coo), 62);
});
test('Sizin yöneticilerin toplam maaşı $286.068/gün', () => {
  eq(H.executiveAnalysis({ executives: H.parseExecutives(myExecutivesApi, NOW) }, DATA, plan(myCompany())).salariesDay, 286068);
});
const dogan = H.parseExecutives({ executives: [
  { name: 'Joyce Bennett', salary: 150000, skills: { coo: 7, cfo: 8, cmo: 13, cto: 82 }, currentWorkHistory: { position: 't' } },
  { name: 'Nancy Simmons', salary: 41250, skills: { coo: 12, cfo: 78, cmo: 15, cto: 11 }, strikeUntil: '2026-08-09T04:00:28Z', currentWorkHistory: { position: '1' } },
  { name: 'Long Ly', salary: 2414, skills: { coo: 4, cfo: 5, cmo: 5, cto: 6 }, currentWorkHistory: { position: 'x' }, currentTraining: {} },
  { name: 'Yolanda Kelly', salary: 79000, skills: { coo: 2, cfo: 2, cmo: 5, cto: 51 }, currentWorkHistory: { position: '4' }, currentTraining: {} },
  { name: 'James James', salary: 185000, skills: { coo: 7, cfo: 6, cmo: 8, cto: 59 }, currentWorkHistory: { position: 'o' } },
  { name: 'Andre Hughes', salary: 110000, skills: { coo: 12, cfo: 4, cmo: 6, cto: 59 }, currentWorkHistory: { position: 'y' }, currentTraining: {} },
  { name: 'Lakshya Agarwal', salary: 285000, skills: { coo: 5, cfo: 6, cmo: 11, cto: 57 }, currentWorkHistory: { position: 'f' } },
  { name: 'Xavier Foster', salary: 150000, skills: { coo: 10, cfo: 8, cmo: 19, cto: 60 }, currentWorkHistory: { position: 'm' } },
  { name: 'Diamond Woods', salary: 1685, skills: { coo: 4, cfo: 4, cmo: 4, cto: 4 }, currentWorkHistory: { position: 'v' }, currentTraining: {} },
  { name: 'Zuri Cruz', salary: 145000, skills: { coo: 8, cfo: 13, cmo: 10, cto: 64 }, currentWorkHistory: { position: 'z' } },
] }, NOW);
test('DOGAN HOLDING: yönetim puanı 12,5 → tasarruf %12 (oyun: 9,11 ÷ 75,88)', () => {
  near(H.teamScores(dogan).coo, 12.5, 6);
  eq(H.managementSavingsPct(12.5), 12);
});
test('DOGAN HOLDING: iletişim puanı 27 (oyun: satış hızı +%9, restoran +0,270); bilim 158', () => {
  near(H.teamScores(dogan).cmo, 27, 6);
  near(H.teamScores(dogan).cto, 158, 6);
});
test('DOGAN HOLDING: toplam maaş $1.149.349 (personel ve stajyerler dahil)', () => {
  eq(dogan.reduce((s, e) => s + e.salary, 0), 1149349);
});
const player2 = execs([
  ['Danielle Morgan', 'o', 0, 58, 10, 14, 8], ['Quang Cai', 'v', 0, 49, 6, 30, 6],
  ['Sandra Howard', 'f', 0, 9, 7, 3, 42], ['Joyce Long', 'x', 0, 16, 56, 14, 8],
  ['Claudia Catchings', 'y', 0, 8, 18, 16, 21], ['Min Miura', 't', 0, 15, 15, 13, 61],
  ['Justin Evans', 'z', 0, 7, 8, 7, 54],
  ['Rishabh Solanki', '1', 0, 8, 6, 4, 6, false], ['Elijah Webb', '2', 0, 11, 5, 6, 8, false],
  ['Pranav Bose', '3', 0, 3, 3, 4, 22, false], ['Zara Parker', '4', 0, 5, 4, 5, 8, false],
]);
test('İkinci oyuncu (CMO boş): yönetim puanı 88,5 → tasarruf %72 (oyun: 92,75 ÷ 128,82)', () => {
  near(H.teamScores(player2).coo, 88.5, 6);
  eq(H.managementSavingsPct(88.5), 72);
});
test('İkinci oyuncu: iletişim 15,5 → oyun satış +%5 ve restoran +0,150 (puan tabana iner: 15)', () => {
  near(H.teamScores(player2).cmo, 15.5, 6);
  eq(Math.floor(H.teamScores(player2).cmo), 15);
});
const mesar = H.parseExecutives({ executives: [
  { name: 'Malikah West', salary: 1158, skills: { coo: 5, cfo: 5, cmo: 5, cto: 6 }, currentWorkHistory: { position: '3' }, currentTraining: {} },
  { name: 'Gary Gonzalez', salary: 2101, skills: { coo: 4, cfo: 4, cmo: 5, cto: 4 }, currentWorkHistory: { position: 'z' }, currentTraining: {} },
  { name: 'Jamal Freeman', salary: 1698, skills: { coo: 4, cfo: 5, cmo: 5, cto: 4 }, currentWorkHistory: { position: '1' }, currentTraining: {} },
  { name: 'Janet Coleman', salary: 2313, skills: { coo: 5, cfo: 5, cmo: 6, cto: 4 }, currentWorkHistory: { position: 'y' }, currentTraining: {} },
  { name: 'Nicholas Bell', salary: 157500, skills: { coo: 44, cfo: 8, cmo: 9, cto: 15 }, currentWorkHistory: { position: 'v' } },
  { name: 'Frances Flores', salary: 1754, skills: { coo: 6, cfo: 5, cmo: 5, cto: 5 }, currentWorkHistory: { position: '2' }, currentTraining: {} },
  { name: 'Jean Parker', salary: 1308, skills: { coo: 5, cfo: 4, cmo: 5, cto: 5 }, currentWorkHistory: { position: 't' }, currentTraining: {} },
  { name: 'Cheryl Gray', salary: 157500, skills: { coo: 54, cfo: 5, cmo: 5, cto: 5 }, currentWorkHistory: { position: 'o' } },
  { name: 'Donna Edwards', salary: 100000, skills: { coo: 39, cfo: 9, cmo: 9, cto: 12 }, currentWorkHistory: { position: 'f' } },
  { name: 'Tamara Alexander', salary: 41250, skills: { coo: 39, cfo: 11, cmo: 9, cto: 10 }, currentWorkHistory: { position: 'm' } },
] }, NOW);
test('Dr. Mesar: yönetim puanı 95,5 → tasarruf %73 (oyun: 204,40 ÷ 280,00)', () => {
  near(H.teamScores(mesar).coo, 95.5, 6);
  eq(H.managementSavingsPct(95.5), 73);
});
test('Dr. Mesar: iletişim 12,5 (oyun +%4, +0,120), bilim 6,75 (oyun araştırma hızı %12,0), maaş $466.582', () => {
  const s = H.teamScores(mesar);
  near(s.cmo, 12.5, 6);
  near(s.cto, 6.75, 6);
  eq(mesar.reduce((t, e) => t + e.salary, 0), 466582);
});

// =====================================================================================================
section("Cooper's Tools");
test('Portakal suyu, İçecek fabrikası 10, bonussuz: 958/sa, 22.983,01/gün', () => {
  const { row } = one(124, 10);
  near(row.hourly, 958, 0);
  near(row.daily, 22983.01, 2);
});
test('Aynısı: 114.915,06 portakal ve 22.983,01 şeker alınır; düğmeler "+26" ve "+22"', () => {
  const { result } = one(124, 10);
  near(purchase(result, 4, 0).qtyDay, 114915.06, 2);
  near(purchase(result, 135, 0).qtyDay, 22983.01, 2);
  eq([purchase(result, 4, 0).suggestion.levels, purchase(result, 135, 0).suggestion.levels], [26, 22]);
});
test('%9 rekreasyonla: 25.256,06/gün, 126.280,29 portakal; düğmeler yine "+26" ve "+22"', () => {
  const { row, result } = one(124, 10, { recreation: REC9 });
  near(row.daily, 25256.06, 2);
  near(purchase(result, 4, 0).qtyDay, 126280.29, 2);
  eq([purchase(result, 4, 0).suggestion.levels, purchase(result, 135, 0).suggestion.levels], [26, 22]);
});
test('Ham petrol, seviye 1: 1.100,93/gün, 27.523 enerji; %90 verimle 990,84/gün ve 24.771 enerji', () => {
  const full = one(10, 1).result;
  const low = one(10, 1, { efficiency: 90 }).result;
  near(full.rows[0].daily, 1100.93, 2);
  near(purchase(full, 1, 0).qtyDay, 27523, 0);
  near(low.rows[0].daily, 990.84, 2);
  near(purchase(low, 1, 0).qtyDay, 24771, 0);
});
const cooperWages = (setup) => plan(setup, {}, COOPER).totals;
test('İçecek fabrikası 10 seviye, tasarruf %62: brüt $61.155, net $59.248, tasarruf $1.906', () => {
  const t = cooperWages({ buildings: [{ product: 124, level: 10 }], admin: { savingsPct: 62 } });
  near(t.wagesDayGross, 61155, 0); near(t.wagesDayNet, 59248, 0); near(t.executiveSavingsDay, 1906, 0);
});
test('Aynısı robotlu: $59.320, $57.471, $1.849', () => {
  const t = cooperWages({ buildings: [{ product: 124, level: 10, robots: true }], admin: { savingsPct: 62 } });
  near(t.wagesDayGross, 59320, 0); near(t.wagesDayNet, 57471, 0); near(t.executiveSavingsDay, 1849, 0);
});
test('E-araba 20 seviye, tasarruf %62: $239.608, $224.673, $14.934', () => {
  const t = cooperWages({ buildings: [{ product: 53, level: 20 }], admin: { savingsPct: 62 } });
  near(t.wagesDayGross, 239608, 0); near(t.wagesDayNet, 224673, 0); near(t.executiveSavingsDay, 14934, 0);
});
test('275 seviye araba fabrikası + 20 akademi, tasarruf %67: $8.088.339, $4.654.630, $3.433.709', () => {
  const t = cooperWages({ buildings: [{ product: 53, level: 150 }, { product: 51, level: 125 }], academyLevel: 20, admin: { savingsPct: 67 } });
  near(t.wagesDayGross, 8088339, 0); near(t.wagesDayNet, 4654630, 0); near(t.executiveSavingsDay, 3433709, 0);
});
test('Aynısı akademisiz (275 seviye): $7.739.704, $4.539.580, $3.200.123', () => {
  const t = cooperWages({ buildings: [{ product: 53, level: 150 }, { product: 51, level: 125 }], admin: { savingsPct: 67 } });
  near(t.wagesDayGross, 7739704, 0); near(t.wagesDayNet, 4539580, 0); near(t.executiveSavingsDay, 3200123, 0);
});

// =====================================================================================================
section("Ekonomi fazı (Durgunluk, Normal, Büyüme) · Cooper ekranları");
// Cooper'da aynı plan üç fazda: Portakal suyu Q6 (İçecek fabrikası) ve Portakal Q5 (Tarla), üretim bonusu %9, olaylar yok.
// Portakal suyu toplam 31 seviye. Portakal için Cooper 78,79 etkin seviye gösteriyor (71 Tarla değil; nedeni belli değil),
// bu yüzden portakalda fazlar arası ORANLAR sınanır. [faz, ad, saatlik, günlük]
const COOPER_PHASE = {
  0: { juice: [3263, 78310.41], orange: [16430, 394327.36] },
  1: { juice: [3115, 74751.48], orange: [16106, 386544.85] },
  2: { juice: [2982, 71561.43], orange: [15808, 379386.98] },
};
const phasePlan = (phase, orangeLevel) => plan({
  buildings: [{ product: 124, level: 31, quality: 6, event: false }, { product: 4, level: orangeLevel, quality: 5 }],
  recreation: REC9, economyPhase: phase,
});
for (const [name, ph] of [['Durgunluk', 0], ['Normal', 1], ['Büyüme', 2]]) {
  // Cooper'ın rakamı 31 seviyeye göre %0,02 yüksek (31,007 seviyeye denk). Fazlar arası oran ise dört basamak tutuyor.
  test(`${name}: Portakal suyu 31 seviye → ${COOPER_PHASE[ph].juice[0]}/sa, ${COOPER_PHASE[ph].juice[1]}/gün (±%0,05)`, () => {
    const row = phasePlan(ph, 79).rows[0];
    within(row.hourly, COOPER_PHASE[ph].juice[0], COOPER_PHASE[ph].juice[0] * 0.0005, 'saatlik');
    within(row.daily, COOPER_PHASE[ph].juice[1], COOPER_PHASE[ph].juice[1] * 0.0005, 'günlük');
  });
  test(`${name}: Portakal suyunun Cooper'daki toplam seviyesi her fazda aynı (31,007)`, () => {
    const perLevel = phasePlan(ph, 79).rows[0].perLevelHour;
    near(COOPER_PHASE[ph].juice[1] / 24 / perLevel, 31.007, 2);
  });
}
test('Portakal: fazlar arası oran Cooper ile aynı (Durgunluk → Normal → Büyüme)', () => {
  const day = (ph) => phasePlan(ph, 79).rows[1].daily;
  near(day(1) / day(0), 386544.85 / 394327.36, 5, 'Normal ÷ Durgunluk');
  near(day(2) / day(1), 379386.98 / 386544.85, 5, 'Büyüme ÷ Normal');
});
test('Portakal suyu ve portakal fazlar arasında AYNI çarpanla değil, maaş çarpanına göre değişir (0,7 ve 0,3)', () => {
  const a = phasePlan(0, 79).rows; const b = phasePlan(1, 79).rows;
  const f = (r0, r1) => Math.log(r1.daily / r0.daily);
  near(f(a[0], b[0]) / f(a[1], b[1]), 0.7 / 0.3, 3);
});
test('Faz çarpanı = (SALARY_MID ÷ 345)^(−çarpan): Roket motoru (1,8) Normal ×0,8872, Büyüme ×0,7931', () => {
  near(one(86, 1, { phase: 1 }).row.phaseFactor, Math.pow(700 / 655, -1.8), 9);
  near(one(86, 1, { phase: 2 }).row.hourly, 0.31538427169891814 * Math.pow(745 / 655, -1.8), 9);
});
test('Faz seçilmemişse (otomatik) çarpan 1: API zaten oyunun o anki fazının değerini veriyor', () => {
  eq(one(86, 1).row.phaseFactor, 1);
  eq(one(86, 1, { phase: 0 }).row.phaseFactor, 1);
});
test('Faz algılama: verinin tamamı SALARY_MID[0] = 655 ile uyumlu → veri Durgunluk fazının (bot faz 0 istiyor)', () => {
  eq([DATA.economy.currentPhase, DATA.economy.currentMid], [0, 655]);
  eq(H.ECONOMY_PHASES[DATA.economy.currentPhase], 'Durgunluk');
});
test('Ham değerler: 59 ürünün hepsinde perHourRaw × (655÷345)^(−çarpan) = perHour', () => {
  for (const p of Object.values(DATA.products)) {
    const mod = p.baseSalary / 345;
    near(p.perHourRaw * Math.pow(655 / 345, -mod), p.perHour, 8, p.name);
  }
});
test('Oyun Normal faza geçerse: perHour Normal değerine göre gelir, algılanan faz 1 olur ve faz seçimi tutarlı kalır', () => {
  const shifted = H.normalizeData({
    products: Object.fromEntries(Object.entries(products).map(([k, p]) => [k, { ...p, perHour: p.perHourRaw * Math.pow(700 / 345, -(p.baseSalary / 345)) }])),
    buildings, core, modifiers, realm: 0,
  });
  eq(shifted.economy.currentPhase, 1);
  const juice = (data, phase) => plan({ buildings: [{ product: 124, level: 10, event: false }], economyPhase: phase }, {}, data).rows[0].hourly;
  near(juice(shifted, null), juice(DATA, 1), 6, 'Normal fazın değeri');
  near(juice(shifted, 0), juice(DATA, 0), 6, 'Durgunluğa simülasyon');
});
test('Olay ürün bazında kapatılır: portakal suyu +%27 kapatılırsa bütün portakal suyu binalarında kalkar', () => {
  const on = plan({ buildings: [{ product: 124, level: 22 }, { product: 124, level: 21 }] }).rows;
  const off = plan({ buildings: [{ product: 124, level: 22 }, { product: 124, level: 21 }], events: { 124: false } }).rows;
  eq(on.map((r) => r.eventPct), [27, 27]);
  eq(off.map((r) => r.eventPct), [0, 0]);
  near(on[0].hourly / off[0].hourly, 1.27, 9);
});

// ---- Roket motoru (çarpan 1,8), seviye 1, Cooper'ın üç fazı: tahminim henüz bilinmeden yazılmıştı ----
const ROCKET = { 0: [7.57, 60.55, 75.69, 151], 1: [6.72, 53.73, 67.16, 134], 2: [6.0, 48.03, 60.03, 120] }; // günlük, e-bilgisayar, alüminyum, çelik
for (const [name, ph] of [['Durgunluk', 0], ['Normal', 1], ['Büyüme', 2]]) {
  test(`Roket motoru seviye 1, ${name}: günlük ${ROCKET[ph][0]}; eksik e-bilgisayar ${ROCKET[ph][1]}, alüminyum ${ROCKET[ph][2]}, çelik ${ROCKET[ph][3]}`, () => {
    const r = plan({ buildings: [{ product: 86, level: 1, event: false }], economyPhase: ph });
    near(r.rows[0].daily, ROCKET[ph][0], 2, 'günlük üretim');
    near(purchase(r, 79, 0).qtyDay, ROCKET[ph][1], 2, 'e-bilgisayar');
    near(purchase(r, 18, 0).qtyDay, ROCKET[ph][2], 2, 'alüminyum');
    near(purchase(r, 43, 0).qtyDay, ROCKET[ph][3], 0, 'çelik');
  });
}
test('Faz bina maaşını değiştirmez: Cooper üç fazda da $16.657 (Roket motoru 1 + akademi 20 → 621 × 24 × (1 + 20/170))', () => {
  for (const ph of [0, 1, 2]) {
    const t = plan({ buildings: [{ product: 86, level: 1 }], academyLevel: 20, economyPhase: ph, admin: { savingsPct: 0 } }).totals;
    near(t.wagesDayGross, 16657, 0, `faz ${ph} brüt`);
    near(t.wagesDayNet, 16657, 0, `faz ${ph} net`);
  }
});

// =====================================================================================================
section('Oyunun yardım tablosu · "Ekonomik değişimlerin etkisi"');
// Oyunun yardım sayfasındaki tablo: her bina için birim işçilik maliyetinin Normal faza göre değişimi (%).
// Tablo ESKİ SALARY_MID değerleriyle (670 / 700 / 730) hazırlanmış; şimdiki çekirdek veri 655 / 700 / 745 ve etki yaklaşık
// %50 daha büyük. Tablonun 30 satırının hepsi aynı formülle üç ondalığa kadar tutuyor.
const HELP = [['0', 'Hangar', -9.187, 9.672], ['9', 'Dikey entegrasyon', -9.187, 9.672], ['8', 'Havacılık elektroniği', -8.788, 9.212],
  ['7', 'Havacılık fabrikası', -7.176, 7.395], ['h', 'Fizik laboratuvarı', -7.176, 7.395], ['s', 'Yazılım Ar-Ge', -7.176, 7.395],
  ['D', 'İtici fabrikası', -7.582, 7.846], ['a', 'Otomotiv Ar-Ge', -6.768, 6.945], ['O', 'Petrol kuyusu', -6.359, 6.497],
  ['l', 'Fırlatma rampası', -6.359, 6.497], ['R', 'Rafineri', -5.948, 6.051], ['x', 'İnşaat fabrikası', -5.948, 6.051],
  ['1', 'Araba fabrikası', -5.535, 5.607], ['f', 'Moda ve tasarım', -5.535, 5.607], ['p', 'Bitki araştırma merkezi', -5.535, 5.607],
  ['E', 'Enerji santrali', -5.121, 5.165], ['Y', 'Fabrika', -5.121, 5.165], ['b', 'Islah laboratuvarı', -5.121, 5.165],
  ['c', 'Kimya laboratuvarı', -5.121, 5.165], ['L', 'Elektronik fabrikası', -4.704, 4.724], ['o', 'Beton tesisi', -4.704, 4.724],
  ['W', 'Su deposu', -4.286, 4.286], ['g', 'Genel müteahhit', -4.286, 4.286], ['S', 'Nakliye deposu', -3.866, 3.849],
  ['M', 'Maden', -3.444, 3.414], ['Q', 'Taş ocağı', -3.444, 3.414], ['6', 'İçecek fabrikası', -3.020, 2.981],
  ['F', 'Çiftlik', -1.737, 1.693], ['T', 'Moda fabrikası', -1.737, 1.693], ['P', 'Plantasyon', -1.305, 1.267]];
const OLD = H.normalizeData({
  products: Object.fromEntries(HELP.map(([letter], i) => {
    const mod = buildings[letter].salaryModifier;
    return [1000 + i, { id: 1000 + i, name: letter, building: letter, inputs: [], perHourRaw: 100, perHour: 100 * Math.pow(670 / 345, -mod), baseSalary: mod * 345 }];
  })),
  buildings, core: { AVERAGE_SALARY: 345, SALARY_MID: { 0: 670, 1: 700, 2: 730 } }, realm: 0,
});
test('Eski çekirdek değerleri (670, 700, 730) için faz algılanır: Durgunluk', () => eq([OLD.economy.currentPhase, OLD.economy.currentMid], [0, 670]));
test('Yardım tablosu: 30 binanın hepsinde, Durgunluk ve Büyüme sütunları (60 sayı) formülle ±0,0015 puan tutar', () => {
  let worst = 0;
  HELP.forEach(([letter, name, recession, boom], i) => {
    const prod = OLD.products[1000 + i];
    const speed = (ph) => H.phaseSpeedFactor(OLD, { economyPhase: ph }, prod);
    const laborChange = (ph) => (speed(1) / speed(ph) - 1) * 100; // birim işçilik maliyeti = 1 ÷ üretim, Normal'e göre
    for (const [got, want, label] of [[laborChange(0), recession, 'Durgunluk'], [laborChange(2), boom, 'Büyüme']]) {
      worst = Math.max(worst, Math.abs(got - want));
      if (Math.abs(got - want) > 0.0015) throw new Error(`${name} ${label}: beklenen ${want}, bulunan ${got.toFixed(4)}`);
    }
  });
  ok(worst < 0.0015, 'en büyük sapma');
});
test('Şimdiki çekirdek değerlerle (655, 700, 745) etki eski tablodan yaklaşık %50 büyük: Hangar Durgunluk −%13,6', () => {
  const now = H.normalizeData({ products: { 1: { id: 1, name: 'x', building: '0', inputs: [], perHourRaw: 100, perHour: 100 * Math.pow(655 / 345, -2.2), baseSalary: 2.2 * 345 } }, buildings, core, realm: 0 });
  const p = now.products[1];
  const change = (H.phaseSpeedFactor(now, { economyPhase: 1 }, p) / H.phaseSpeedFactor(now, { economyPhase: 0 }, p) - 1) * 100;
  near(change, -13.6, 1);
});

// =====================================================================================================
section('İç tutarlılık');

// ---- Kalitesi olmayan ürünler: araştırma ürünleri ve Taşıma ----
test('hasQuality: araştırma ve Taşıma kalitesiz, portakal suyu kaliteli', () => {
  eq([H.hasQuality(DATA.products[29]), H.hasQuality(DATA.products[13]), H.hasQuality(DATA.products[124]), H.hasQuality(undefined)], [false, false, true, false]);
});
test('Kalitesiz üründe kayıtlı kalite yok sayılır (hep Q0); kaliteli ürün etkilenmez', () => {
  const r = plan({ buildings: [{ product: 29, level: 1, quality: 7 }, { product: 13, level: 1, quality: 5 }, { product: 124, level: 1, quality: 5 }] });
  eq(r.rows.map((x) => x.quality), [0, 0, 5]);
});

// ---- Üretim hızı: elle girilen bonus + rekreasyon (kullanıcı örnekleri) ----
test('Üretim hızı: elle %9, rekreasyon 0 → toplam %9', () => {
  near(H.speedBonus({ extraBonusPct: 9, recreation: { park: 0, temple: 0, lake: 0 } }, 'production'), 0.09, 6);
});
test('Üretim hızı: elle %7 + rekreasyon 9 seviye (3+3+3) → toplam %16', () => {
  near(H.speedBonus({ extraBonusPct: 7, recreation: { park: 3, temple: 3, lake: 3 } }, 'production'), 0.16, 6);
});
test('Üretim hızı: elle %9 + rekreasyon 9 seviye → toplam %18', () => {
  near(H.speedBonus({ extraBonusPct: 9, recreation: { park: 3, temple: 3, lake: 3 } }, 'production'), 0.18, 6);
});
test('Üretim hızı: elle bonus girilmemişse yalnız rekreasyon sayılır (eski kurulumlar değişmez)', () => {
  near(H.speedBonus({ recreation: { park: 3, temple: 3, lake: 3 } }, 'production'), 0.09, 6);
});

test('Veri: her ürünün maaşı = 345 × binanın maaş çarpanı', () => {
  for (const p of Object.values(DATA.products)) {
    near(p.baseSalary, 345 * DATA.buildings[p.building].salaryModifier, 6, p.name);
  }
});
test('BFR: seviye 1 binada 1 adet 4,10 saat', () => near(1 / DATA.products[94].perHour, 4.0976, 4));
test('BFR ağacı, ayrı yazılmış hesapla aynı: 610.872,84 enerji, 4.200 altın cevheri, 41 roket motoru, 40 gövde, 22 tank', () => {
  const need = Object.fromEntries(H.chainTotals(94, 1, DATA).map((x) => [x.product, x.qty]));
  near(need[1], 610872.84, 2); near(need[68], 4200, 6); near(need[86], 41, 6); near(need[77], 40, 6);
  near(need[84], 22, 6); near(need[87], 10, 6); near(need[82], 4, 6); near(need[81], 2, 6);
  near(need[86] / DATA.products[86].perHour, 130.0, 2, 'roket motoru bina-saati');
});
const chainSetup = () => ({
  buildings: [
    { product: 53, level: 5, quality: 1 }, { product: 51, level: 3, quality: 0 },
    { product: 18, level: 40, quality: 0 }, { product: 1, level: 3, quality: 0 },
  ],
  admin: { savingsPct: 50 }, otherLevels: 30,
});
const chainMarket = { ...Object.fromEntries([1, 15, 18, 22, 43, 45, 47, 48, 50, 51, 13].map((id) => [`${id}:0`, id * 3 + 1])), '53:1': 3400 };
test('Maliyet korunumu: satılan ürünlerin toplam maliyeti = alımlar + maaşlar', () => {
  const r = plan(chainSetup(), chainMarket);
  const soldCost = r.sales.reduce((s, x) => s + x.surplusDay * x.unitCost, 0);
  within(soldCost, r.totals.costDay, 1e-6 * r.totals.costDay);
  eq(r.warnings.filter((w) => w.kind === 'price').length, 0, 'fiyat uyarısı');
});
test('Kâr = gelir − (alımlar + maaşlar); nakit = kâr − yönetici maaşları', () => {
  const r = plan({ ...chainSetup(), executiveSalaryDay: 1000 }, chainMarket);
  const t = r.totals;
  near(t.profitExchangeDay, t.revenueExchangeDay - t.purchasesDay - t.wagesDayNet, 6);
  near(t.netCashContractDay, t.revenueContractDay - t.costDay - 1000, 6);
});
const JUICE10_ORANGES = 5 * 95.7625529787592 * 10 * 24; // 10 seviye portakal suyunun günlük portakal ihtiyacı (114.915,06)
const orangeSetup = (juiceQ, orangeQ, orangeLevel, extra = {}) => ({
  buildings: [{ product: 124, level: 10, quality: juiceQ, event: false }, { product: 4, level: orangeLevel, quality: orangeQ }],
  ...extra,
});
test('Kalite ikamesi açık: fazla Q6 portakal, Q5 portakal suyunun (Q4+) ihtiyacını karşılar; kalanı alınır', () => {
  const r = plan(orangeSetup(5, 6, 10), { '4:4': 4 });
  near(purchase(r, 4, 4).qtyDay, JUICE10_ORANGES - 10 * 189.75847196995113 * 24, 6);
  eq(r.sales.some((s) => s.product === 4), false, 'portakal satılmamalı');
});
test('Kalite ikamesi kapalı: Q6 portakal kullanılmaz ve satılır; ihtiyacın tamamı alınır', () => {
  const r = plan(orangeSetup(5, 6, 10, { substitution: false }), { '4:4': 4, '4:6': 6 });
  near(purchase(r, 4, 4).qtyDay, JUICE10_ORANGES, 6);
  ok(r.sales.some((s) => s.product === 4 && s.quality === 6), 'Q6 portakal satılmalı');
});
test('Dağıtım: Q7 ürün Q6 portakalı, Q3 ürün Q2 portakalı alır; eksik ucuz kaliteden (Q2+) alınır', () => {
  const r = plan({ buildings: [
    { product: 124, level: 10, quality: 7, event: false }, { product: 124, level: 10, quality: 3, event: false },
    { product: 4, level: 30, quality: 6 }, { product: 4, level: 10, quality: 2 },
  ] }, { '4:2': 3, '4:6': 9 });
  eq(purchase(r, 4, 6), undefined, 'Q6+ portakal alınmamalı');
  near(purchase(r, 4, 2).qtyDay, 2 * JUICE10_ORANGES - 40 * 189.75847196995113 * 24, 6);
});
test('Eksik girdi izinli kalitelerin en ucuzundan alınır (Q5 ürün → Q4+ portakal)', () => {
  const r = plan({ buildings: [{ product: 124, level: 10, quality: 5, event: false }] }, { '4:4': 4, '4:5': 3.5, '4:6': 5 });
  eq([purchase(r, 4, 4).quality, purchase(r, 4, 4).price], [5, 3.5]);
});
test('"Tam kalite" seçeneğinde alt kalite alınır; elle kalite ve elle fiyat önceliklidir', () => {
  const market = { '4:4': 4, '4:5': 3.5, '4:6': 5 };
  const exact = plan({ buildings: [{ product: 124, level: 10, quality: 5 }], buyPolicy: 'exact' }, market);
  eq([purchase(exact, 4, 4).quality, purchase(exact, 4, 4).price], [4, 4]);
  const forced = plan({ buildings: [{ product: 124, level: 10, quality: 5 }], buyQuality: { 4: 6 }, prices: { '4:6': 2.5 } }, market);
  eq([purchase(forced, 4, 4).quality, purchase(forced, 4, 4).price, purchase(forced, 4, 4).priceSource], [6, 2.5, 'manual']);
});
test('Otomatik kalite: Q3 e-araba → karoseri Q2, alüminyum Q1, enerji Q0', () => {
  const s = H.autoQuality({ buildings: [
    { product: 53, level: 1, quality: 3 }, { product: 51, level: 1, quality: 0 },
    { product: 18, level: 1, quality: 0 }, { product: 1, level: 1, quality: 5 },
  ] }, DATA);
  eq(s.buildings.map((b) => b.quality), [3, 2, 1, 0]);
});
test('Kısmen tüketilen üründe kâr, satılan kısmı üreten seviyeye bölünür', () => {
  const r = plan({ buildings: [{ product: 1, level: 2 }, { product: 10, level: 1 }] }, { '1:0': 0.2, '10:0': 30 });
  const power = r.sales.find((s) => s.product === 1);
  const share = (2 * power.surplusDay) / power.producedDay;
  near(power.pphplBeforeFees, (power.surplusDay * (0.2 - power.unitCost)) / 24 / share, 9);
});
test('Kontrat fiyatı elle girilir; kontratta yarım taşıma, komisyon yok', () => {
  const r = plan({ buildings: [{ product: 10, level: 1 }], contractPrices: { '10:0': 29 }, transportPrice: 0.4 }, { '1:0': 0.2, '10:0': 30 });
  const s = r.sales[0];
  near(s.exchangeUnit, 30 * 0.96 - 0.4, 9);
  near(s.contractUnit, 29 - 0.2, 9);
});
test('Araştırma binasına robot kurulamaz; robot yok sayılır ve not düşülür', () => {
  const { row } = one(29, 1, { robots: true });
  eq(row.robots, false);
  ok(row.notes.length === 1, 'not bekleniyordu');
});
test('Fiyatı olmayan girdi ve ürün için uyarı; bonus %100 ve üstü hata', () => {
  const r = plan({ buildings: [{ product: 124, level: 1 }] }, {});
  eq(r.warnings.filter((w) => w.kind === 'price').length, 3);
  eq(one(124, 1, { bonus: 100 }).row.ok, false);
});
const myPlan = () => plan(myCompany());
test('Yönetici değeri: takım tasarrufu = taban maaş × brüt gider × %62 ($2,10M/gün)', () => {
  const a = H.executiveAnalysis({ executives: H.parseExecutives(myExecutivesApi, NOW) }, DATA, myPlan());
  near(a.baseDay, 241.5 * 306 * 24, 6);
  near(a.teamValueDay, 241.5 * 306 * 24 * (325 / 170) * 0.62, 4);
  near(a.teamNetDay, a.teamValueDay - 286068, 4);
});
test('Personel ve eğitimdekilerin bugünkü değeri 0; eğitimdeki COO stajyeri göreve başlayınca değer kazanır', () => {
  const a = H.executiveAnalysis({ executives: H.parseExecutives(myExecutivesApi, NOW) }, DATA, myPlan());
  const by = Object.fromEntries(a.members.map((m) => [m.name, m]));
  eq([by['Ann Edwards'].valueDay, by['Matthew Watson'].valueDay], [0, 0]);
  ok(by['Matthew Watson'].ifActiveValueDay > 0, 'stajyer değeri artı olmalı');
  ok(by['Marie Flores'].valueDay > by['Teresa Jackson'].valueDay && by['Teresa Jackson'].valueDay > 0, 'COO en değerli olmalı');
  ok(by['Marie Flores'].perPointDay > by['Teresa Jackson'].perPointDay, 'COO puanı daha değerli olmalı');
});

test('Tüm şirket kapsamı: planda olmayan maaş (yönetim dahil) tabana yönetimsiz olarak eklenir', () => {
  const setup = { ...myCompany(), executives: H.parseExecutives(myExecutivesApi, NOW), otherWagesDay: 1000000 };
  const p = plan(setup);
  const planOnly = H.executiveAnalysis(setup, DATA, p);
  const company = H.executiveAnalysis(setup, DATA, p, { scope: 'company' });
  near(company.otherBaseDay, 1000000 / (1 + p.admin.net), 6);
  near(company.teamValueDay - planOnly.teamValueDay, company.otherBaseDay * p.admin.gross * p.admin.savings, 6);
  eq(planOnly.otherBaseDay, 0);
});
test('Tüm şirket kapsamında kişi başı değer, kapsamla orantılı büyür', () => {
  const setup = { ...myCompany(), executives: H.parseExecutives(myExecutivesApi, NOW), otherWagesDay: 2000000 };
  const p = plan(setup);
  const a = H.executiveAnalysis(setup, DATA, p).members[0];
  const b = H.executiveAnalysis(setup, DATA, p, { scope: 'company' }).members[0];
  near(b.valueDay / a.valueDay, (p.totals.wageBaseDay + 2000000 / (1 + p.admin.net)) / p.totals.wageBaseDay, 9);
});

// =====================================================================================================
section('Oyun · Yönetici etkileri, eğri ve vergi');
// Etkili beceri: oyun rehberi (60 üstü yarım, 80 üstü çeyrek) ve oyunun kendi grafiğindeki noktalar
test('Oyunun grafiği: 40→40, 47→47, 61→60,5, 68→64, 75→67,5, 82→70,5, 89→72,25, 96→74', () => {
  eq([40, 47, 61, 68, 75, 82, 89, 96].map(H.effectiveSkillShown), [40, 47, 60.5, 64, 67.5, 70.5, 72.25, 74]);
});
test('Oyun: "Etkili yetenek 64, 69\'dan düşürüldü" (Dentium, yönetim 69,75)', () => {
  eq([H.effectiveSkillShown(69.75), H.effectiveSkill(69.75)], [64.5, 64]);
});
test('Rehber grafiği: 150 puan → 87,5', () => { near(H.effectiveSkillRaw(150), 87.5, 9); });
test('Cooper (170 seviye, brüt %99,4): yönetim 0/60/61/62/70 → tasarruf %0/60/60/61/65', () => {
  eq([0, 60, 61, 62, 70].map(H.managementSavingsPct), [0, 60, 60, 61, 65]);
});
test('Eğitimi biten CFO ile 66,75 puan → %63 (oyunun Kâr hesaplayıcısındaki $32,07\'den)', () => {
  eq(H.managementSavingsPct(66.75), 63);
});
test('Tasarruf en çok %100', () => { eq(H.managementSavingsPct(10000), 100); });

const NTL = execs([
  ['Isabella Patterson', 'y', 2039, 23, 8, 18, 7], ['Kim Weissmuller', 'x', 65000, 8, 35, 8, 7],
  ['Linda Bailey', '1', 1991, 5, 4, 4, 3, false], ['Preston James', 'f', 16650, 25, 25, 7, 11],
  ['Frank Peterson', 't', 15000, 31, 11, 19, 13], ['Jonathan Cox', 'o', 135000, 50, 14, 13, 13],
  ['Elizabeth Wilson', 'm', 350000, 7, 8, 51, 14], ['Barbara Howard', 'v', 386250, 49, 8, 7, 9],
]);
const SFENX = execs([
  ['Kendrick Watson', 'f', 2027, 18, 27, 13, 20], ['Ryan Gonzales', 'z', 7500, 9, 13, 20, 40],
  ['Kennedy Watson', 'o', 15000, 20, 10, 7, 15], ['Jack Cook', '2', 1194, 5, 7, 6, 16, false],
  ['Megan White', '3', 1347, 8, 5, 5, 5, false], ['Jay More', 'v', 14250, 34, 9, 7, 9],
  ['Zeynep Yılmaz', '1', 1544, 9, 9, 13, 12, false], ['Zayan Saxena', 'x', 2312, 4, 5, 4, 5],
  ['Aisha Ross', 'y', 1132, 7, 20, 26, 12], ['Chloe Griffin', 'm', 1406, 8, 9, 8, 26],
  ['Brandon Henderson', 't', 13000, 7, 5, 4, 42],
]);
const ATLAS = execs([
  ['Aaron Watson', 'x', 13000, 8, 13, 30, 13], ['Derek Parker', '3', 2800, 7, 10, 18, 8, false],
  ['Maurice Torres', 'o', 290000, 57, 15, 7, 6], ['Zion Turner', 'v', 3200, 33, 10, 15, 17],
  ['Sung Bae', 'm', 112500, 4, 9, 45, 4], ['Scott Lewis', 'y', 13000, 5, 5, 32, 7],
  ['Diamond Anderson', '2', 2800, 4, 1, 16, 1, false], ['Mitsuo Nadi', 'f', 15000, 6, 35, 8, 2],
]);
const DENTIUM = execs([
  ['Marie Flores', 'o', 225000, 50, 10, 17, 9], ['Ann Edwards', 'm', 2323, 12, 6, 5, 4, false],
  ['Nicholas Cook', 't', 7500, 26, 4, 3, 18], ['Matthew Watson', 'v', 60000, 24, 5, 6, 7],
  ['Sandra Johnson', '1', 1399, 4, 5, 4, 4, false], ['Gloria Cook', 'f', 1993, 5, 13, 5, 6],
  ['Sota Hara', 'x', 2103, 5, 8, 4, 4, false],
]);
// [ekip, banka, tasarruf %, eşik artışı, satış %, restoran, araştırma %, patent, maaş] — oyunun "Ekibinizin etkisi"
const EFFECTS = [
  ['Dr. Mesar', mesar, 0, 73, 6.5e6, 4, 0.12, 12, 0.38, 466582],
  ['NothingToLose', NTL, 27, 72, 92.5e6, 21, 0.64, 44, 1.38, 971930],
  ['Dentium', DENTIUM, 0, 64, 8.0e6, 2, 0.06, 42, 1.31, 300318],
  ['SFENX', SFENX, 22, 45, 56.0e6, 9, 0.27, 136, 4.25, 60712],
  ['ATLAS', ATLAS, 0, 68, 23.5e6, 20, 0.62, 6, 0.19, 452300],
];
for (const [name, team, bank, adm, lift, sales, rest, research, patent, salary] of EFFECTS) {
  test(`${name}: yönetim %${adm}, vergi +$${lift / 1e6}M, satış +%${sales}, restoran +${rest}, araştırma %${research}, patent +${patent}`, () => {
    const t = H.teamEffects(team, { bankLevel: bank });
    eq([t.adminSavingsPct, t.thresholdLift, t.salesSpeedPct, t.researchSpeedPct], [adm, lift, sales, research]);
    near(t.restaurantRating, rest, 3);
    near(t.patentPct, patent, 2);
    eq(team.reduce((x, e) => x + e.salary, 0), salary);
  });
}
test('Oyun tasarruf oranları: NTL 187,62÷260,59, Dentium 122,35÷191,18, SFENX 42,88÷95,29, ATLAS 88,40÷130', () => {
  eq([187.62 / 260.59, 122.35 / 191.18, 42.88 / 95.29, 88.4 / 130].map((x) => Math.round(x * 100)), [72, 64, 45, 68]);
});
test('Banka: seviye 10 muhasebeyi ikiye, 20 üçe katlar; en çok 40', () => {
  const one = [{ position: 'f', skills: { coo: 0, cfo: 10, cmo: 0, cto: 0 } }];
  eq([0, 10, 20, 99].map((b) => H.teamEffects(one, { bankLevel: b }).thresholdLift), [5e6, 10e6, 15e6, 25e6]);
});
// Vergi: oyun rehberindeki örnekler
test('Vergi rehberi: 5M varlık, eşik 3M → $10.000; 2M → 0', () => {
  eq([H.accountingOverheadDay(5e6, 3e6), H.accountingOverheadDay(2e6, 3e6)], [10000, 0]);
});
test('Vergi rehberi: 11M varlık, eşik 3M → 40k + 25k + 10k = $75.000', () => { near(H.accountingOverheadDay(11e6, 3e6), 75000, 6); });
test('Vergi rehberi: 22M varlık → eşik 3M $360.000, eşik 9M $180.000', () => {
  near(H.accountingOverheadDay(22e6, 3e6), 360000, 6);
  near(H.accountingOverheadDay(22e6, 9e6), 180000, 6);
});
test('Vergilenen varlık = nakit + alınan tahvil − ihraç edilen (rehber: 3M + 3M − 1M = 5M)', () => {
  eq(H.assessableAssets({ cash: 3e6, bondsBought: 3e6, bondsIssued: 1e6 }), 5e6);
});
test('CFO değeri: Dentium, $4,49M nakit → yöneticisiz vergi $7.466, eşik $11M ile 0; Gloria ayrılsa eşik $4,5M, yine 0', () => {
  const setup = { ...myCompany(), executives: DENTIUM, finance: { cash: 4493226 } };
  const a = H.executiveAnalysis(setup, DATA, plan(setup));
  near(a.taxWithoutDay, 7466.13, 2);
  eq([a.taxDay, a.threshold], [0, 11e6]);
  near(a.teamCfoValueDay, 7466.13, 2);
  const gloria = a.members.find((m) => m.name === 'Gloria Cook');
  eq(gloria.cfoValueDay, 0); // diğerlerinin 3 muhasebe puanı eşiği $4,5M'ye çıkarır, nakit ($4,49M) altında kalır
  near(a.teamValueDay, a.teamCooValueDay + a.teamCfoValueDay, 6);
});
test('CFO değeri: nakit yoksa vergi değeri 0; eğitimdeki muhasebe stajyeri başlayınca kazanç hesaplanır', () => {
  const setup = { ...myCompany(), executives: DENTIUM, finance: { cash: 30e6 } };
  const a = H.executiveAnalysis(setup, DATA, plan(setup));
  const sota = a.members.find((m) => m.name === 'Sota Hara');
  ok(sota.ifActiveValueDay > 0, 'stajyer başlayınca eşik yükselir, vergi düşer');
  const none = H.executiveAnalysis({ ...setup, finance: {} }, DATA, plan(setup));
  eq(none.teamCfoValueDay, 0);
});
test('İletişim ve bilim paraya çevrilmez, ayrılırsa kaybedilecek etki gösterilir (NTL: Elizabeth Wilson)', () => {
  const setup = { ...myCompany(), executives: NTL };
  const a = H.executiveAnalysis(setup, DATA, plan(setup));
  const el = a.members.find((m) => m.name === 'Elizabeth Wilson');
  ok(el.effects.salesSpeedPct >= 15, `satış hızı kaybı büyük olmalı: ${el.effects.salesSpeedPct}`);
});

// ---- rapor ----
// =====================================================================================================
section('İnşaatta olan bina');
// İnşaattaki bina üretmez, maaş ödemez, satmaz; seviyesi yönetim giderine girer ve diğer binaların maaşını artırır.
const ORANGE = (construction) => ({
  buildings: [
    { id: 'a', product: 124, level: 10, quality: 0, event: false },
    { id: 'b', product: 4, level: 20, quality: 0, event: false, construction },
  ],
  admin: { mode: 'savings', savingsPct: 0 },
});
const PRICES = { '124:0': 60, '4:0': 4, '135:0': 1.2, '2:0': 0.3, '1:0': 0.2, '66:0': 0.5 };
test('İnşaattaki bina üretmez, maaş ödemez, havuz oluşturmaz', () => {
  const r = plan(ORANGE(true), PRICES);
  const row = r.rows[1];
  eq(row.construction, true); eq(row.hourly, 0); eq(row.daily, 0); eq(row.wageDayNet, 0);
  ok(!r.pools.some((p) => p.product === 4), 'portakal havuzu olmamalı');
});
test('İnşaattaki binanın ürettiği girdi borsadan alınır (kendi üretimine sayılmaz)', () => {
  const buys = plan(ORANGE(true), PRICES).purchases.find((p) => p.product === 4);
  ok(buys && buys.qtyDay > 0, 'portakal borsadan alınmalı');
  const own = plan(ORANGE(false), PRICES).purchases.find((p) => p.product === 4);
  ok(!own || own.qtyDay < buys.qtyDay, 'bina bitince alım azalmalı');
});
test('İnşaattaki bina seviyesi yönetim giderine girer: diğer binanın maaşı değişir', () => {
  const aloneSetup = { buildings: [ORANGE(false).buildings[0]], admin: { mode: 'savings', savingsPct: 0 } };
  const alone = plan(aloneSetup, PRICES);
  const withBuilding = plan(ORANGE(true), PRICES);
  ok(withBuilding.admin.totalLevels === alone.admin.totalLevels + 20, 'toplam seviye 20 artmalı');
  ok(withBuilding.rows[0].wageDayNet > alone.rows[0].wageDayNet, 'diğer binanın maaşı artmalı');
});
test('İnşaattan çıkınca bina yeniden üretir ve maaş öder', () => {
  const r = plan(ORANGE(false), PRICES);
  ok(r.rows[1].hourly > 0 && r.rows[1].wageDayNet > 0);
});
test('Otomatik kalite inşaattaki binayı girdi talebi saymaz', () => {
  const setup = { buildings: [{ id: 'a', product: 124, level: 5, quality: 8, construction: true }, { id: 'b', product: 4, level: 5, quality: 0 }] };
  eq(H.autoQuality(setup, DATA).buildings[1].quality, 0);
});

// =====================================================================================================
// Fırlatma rampası (Havacılık araştırması, ASR)
// Kurallar oyunun ansiklopedisinden: kaza Q0 %50 … her kalite yarıya; süre svy 1 128 sa … her seviye yarıya; verim
// Alt yörüngesel roket 400, BFR 2.800; en yüksek seviye 10; maaş $518/saat (veride 1,5 × 345 = 517,5) × seviye.
// Beklenen değerler bu kurallarla elle hesaplandı. Cooper's Tools ASR Sim ile verim, kaza, süre, saatlik ASR ve gelir
// birebir aynı; maliyet satırı farklı (Cooper maaşı rokete göre 32 / 192 saat sayıyor, oyunda bina süre boyunca maaş öder).
const ASR = 100;
const SOR = H.SUBORBITAL_ROCKET_ID;
const BFR = H.BFR_ID;
const PAD = (o = {}) => ({ id: o.id ?? 'pad', type: 'l', product: ASR, level: o.level ?? 1, count: o.count ?? 1, rocket: o.rocket === undefined ? BFR : o.rocket,
  rocketQuality: o.q ?? 5, rocketPrice: o.price, construction: !!o.construction, robots: !!o.robots });
const ASR_MARKET = { [`${ASR}:0`]: 105 };
// Yönetim gideri: varsayılan %0 tasarruf (seviyeden gelen brüt gider); net verilirse elle
const padPlan = (list, o = {}) => H.evaluatePlan({
  buildings: list, admin: o.net != null ? { mode: 'net', netPct: o.net } : { mode: 'savings', savingsPct: 0 },
  economyPhase: o.phase ?? null, recreation: o.recreation, extraBonusPct: o.bonus ?? 0, substitution: o.substitution, keep: o.keep,
}, DATA, { ...ASR_MARKET, ...(o.market || {}) }, { now: NOW, effects: { researchSpeedPct: o.research ?? 0 } });
const perDay = (perLaunch, hours) => perLaunch * 24 / hours;

section('Fırlatma rampası · oyun kuralları');
test('Kaza olasılığı: Q0 %50, Q1 %25, Q2 %12,5, Q3 %6,25, Q4 %3,125, Q5 %1,5625 (ansiklopedi ve Cooper)', () => {
  eq([0, 1, 2, 3, 4, 5].map((q) => H.crashChance(q) * 100), [50, 25, 12.5, 6.25, 3.125, 1.5625]);
});
test('Fırlatma süresi: svy 1 128 sa, 2 64, 3 32, 4 16, 5 8, 6 4 … svy 10 15 dk; 10 üstü 10 sayılır', () => {
  eq([1, 2, 3, 4, 5, 6, 10].map(H.launchHours), [128, 64, 32, 16, 8, 4, 0.25]);
  eq(H.launchHours(25), 0.25);
  eq(H.launchHours(0), 128);
});
test('Verim: Alt yörüngesel roket 400, BFR 2.800', () => {
  eq(H.LAUNCH_YIELD[SOR], 400);
  eq(H.LAUNCH_YIELD[BFR], 2800);
});
test('Taban maaş $517,5/saat (oyunda $518): Fırlatma rampası maaş çarpanı 1,5 × 345', () => near(DATA.products[ASR].baseSalary, 517.5, 6));

section('Fırlatma rampası · tek rampa');
test('V1 · Alt yörüngesel Q5 $105.000, svy 1: verim 393,75, saatlik 3,08, maliyet $171.240/fırlatma (Cooper: verim 393,8, saatlik 3,08)', () => {
  const r = padPlan([PAD({ rocket: SOR, price: 105000 })]);
  const x = r.rows[0];
  near(x.launch.hours, 128, 9);
  near(x.launch.crash, 0.015625, 9);
  near(x.launch.perLaunch, 393.75, 9);
  near(x.launch.hourlyPerPad, 3.076171875, 9);
  near(x.launch.wagePerLaunch, 66240, 6);
  near(x.launch.launchesDay, 0.1875, 9);
  near(x.daily, 73.828125, 9);
  near(r.totals.rocketsDay, 0.1875 * 105000, 6);
  near(r.pools[0].unitCost, 434.8952380952381, 6);
  near(r.totals.profitContractDay, perDay(-129896.25, 128), 4);
  near(r.totals.profitExchangeDay, perDay(-131550, 128), 4);
});
test('V1 · gelir Cooper ile aynı: fırlatma başına kontrat 393,75 × 105 = $41.343,75, borsa × 0,96 = $39.690', () => {
  const s = padPlan([PAD({ rocket: SOR, price: 105000 })]).sales[0];
  near(s.revenueContractDay * 128 / 24, 41343.75, 6);
  near(s.revenueExchangeDay * 128 / 24, 39690, 6);
});
test('V2 · aynısı, araştırma +%120, yönetim %95: verim 866,25 (Cooper 866,3), maliyet $234.168, kâr −$143.211,75/fırlatma', () => {
  const r = padPlan([PAD({ rocket: SOR, price: 105000 })], { research: 120, net: 95 });
  near(r.rows[0].launch.perLaunch, 866.25, 9);
  near(r.rows[0].launch.hourlyPerPad, 6.767578125, 9);
  near(r.pools[0].unitCost, 270.3238095238095, 6);
  near(r.totals.profitContractDay, perDay(-143211.75, 128), 4);
});
test('V4 · BFR Q5 $795.000, svy 1: verim 2.756,25, saatlik 21,53 (Cooper aynı), birim maliyet $312,47, kâr −$571.833,75/fırlatma', () => {
  const r = padPlan([PAD({ price: 795000 })]);
  near(r.rows[0].launch.perLaunch, 2756.25, 9);
  near(r.rows[0].launch.hourlyPerPad, 21.533203125, 9);
  near(r.pools[0].unitCost, 312.4680272108844, 6);
  near(r.totals.profitContractDay, perDay(-571833.75, 128), 4);
  near(r.totals.profitExchangeDay, perDay(-583410, 128), 4);
});
test('V3 · BFR Q5, svy 10, araştırma +%120, 10 rampa: 15 dk, %1,56, 24.255/saat/rampa, günde 960 fırlatma (rampa başına 96)', () => {
  const r = padPlan([PAD({ level: 10, count: 10, price: 0 })], { research: 120 });
  const L = r.rows[0].launch;
  near(L.hours * 60, 15, 9);
  near(L.crash * 100, 1.5625, 9);
  near(L.hourlyPerPad, 24255, 6);
  near(L.launchesDay, 960, 9);
  near(L.launchesDayPerPad, 96, 9);
  near(r.rows[0].hourly, 242550, 6);
  near(L.wagePerLaunch, 1293.75, 9);
});
test('Maaş seviyeyle doğrusal, süre seviyeyle yarıya: günlük maaş 517,5 × 24 × seviye, fırlatma başı maaş 517,5 × seviye × süre', () => {
  for (const level of [1, 2, 5, 10]) {
    const x = padPlan([PAD({ level, price: 0 })], { net: 0 }).rows[0];
    near(x.wageDayNet, 517.5 * 24 * level, 6, `svy ${level} günlük`);
    near(x.launch.wagePerLaunch, 517.5 * level * 128 / 2 ** (level - 1), 6, `svy ${level} fırlatma başı`);
  }
});
test('Adet: 3 rampa svy 4 = 1 rampanın üç katı üretim, fırlatma ve maaş; yönetim giderine 12 seviye girer', () => {
  const one4 = padPlan([PAD({ level: 4, price: 0 })], { net: 0 }).rows[0];
  const r = padPlan([PAD({ level: 4, count: 3, price: 0 })], { net: 0 });
  const x = r.rows[0];
  near(x.daily, 3 * one4.daily, 9);
  near(x.launch.launchesDay, 3 * one4.launch.launchesDay, 9);
  near(x.wageDayNet, 3 * one4.wageDayNet, 9);
  eq(x.levels, 12);
  eq(r.admin.totalLevels, 12);
  eq(H.totalAdminLevels({ buildings: [PAD({ level: 4, count: 3 })] }, DATA), 12);
});
test('Seviye 10 üstü: 10 sayılır, not düşülür; yönetim giderine de 10 girer', () => {
  const r = padPlan([PAD({ level: 14, price: 0 })]);
  eq(r.rows[0].level, 10);
  ok(r.rows[0].notes.some((n) => n.includes('en çok seviye 10')), 'not yok');
  eq(r.admin.totalLevels, 10);
});
test('Ekonomi fazı, rekreasyon ve elle üretim hızı fırlatmayı değiştirmez', () => {
  const base = padPlan([PAD({ level: 3, price: 0 })]).rows[0].hourly;
  near(padPlan([PAD({ level: 3, price: 0 })], { phase: 2 }).rows[0].hourly, base, 9);
  near(padPlan([PAD({ level: 3, price: 0 })], { recreation: REC9, bonus: 10 }).rows[0].hourly, base, 9);
});
test('Robot yok sayılır (araştırma binası), inşaattaki rampa üretmez ve maaş ödemez ama seviyesi × adedi yönetim giderine girer', () => {
  const rb = padPlan([PAD({ robots: true, price: 0 })]).rows[0];
  near(rb.wageHour, 517.5, 9);
  ok(rb.notes.some((n) => n.includes('robot')), 'robot notu yok');
  const r = padPlan([PAD({ level: 5, count: 2, construction: true, price: 1 })]);
  eq(r.rows[0].hourly, 0);
  eq(r.rows[0].wageDayNet, 0);
  eq(r.totals.rocketsDay, 0);
  eq(r.admin.totalLevels, 10);
});

section('Fırlatma rampası · Alım-Satım');
test('Rampa girdisi Alışlar\'a girmez: yalnız seçilen roket, binadaki fiyatla "roket alımı" olur', () => {
  const r = padPlan([PAD({ level: 10, price: 795000 })]);
  eq(r.purchases.length, 0);
  eq(r.launchBuys.length, 1);
  eq([r.launchBuys[0].product, r.launchBuys[0].quality], [BFR, 5]);
  near(r.launchBuys[0].qtyDay, 96, 9);
  near(r.totals.rocketsDay, 96 * 795000, 4);
  eq(r.totals.purchasesDay, 0);
  near(r.totals.costDay, r.totals.rocketsDay + r.totals.wagesDayNet, 4);
  ok(!r.demands.some((d) => d.product === SOR), 'seçilmeyen roket talep edilmemeli');
});
test('Satışta yalnız ASR: borsada %4 komisyon, kontratta komisyon yok (ASR taşıması 0)', () => {
  const r = padPlan([PAD({ price: 0 })]);
  eq(r.sales.length, 1);
  eq(r.sales[0].product, ASR);
  near(r.sales[0].exchangeUnit, 100.8, 9);
  near(r.sales[0].contractUnit, 105, 9);
});
test('Roket fiyatı yoksa uyarı; maliyete 0 yazılır, üretim sürer', () => {
  const r = padPlan([PAD({ price: undefined })]);
  ok(r.warnings.some((w) => w.text.includes('roket fiyatı yok')), 'uyarı yok');
  eq(r.totals.rocketsDay, 0);
  ok(r.rows[0].daily > 0);
});
test('Roket seçilmemiş ya da fırlatılamayan roket: rampa hesaba girmez, hata gösterilir', () => {
  const r = padPlan([PAD({ rocket: null, price: 1 })]);
  eq(r.rows[0].ok, false);
  eq(r.rows[0].errors[0], 'Roket seçilmedi');
  eq(r.sales.length, 0);
  eq(r.totals.costDay, 0);
  const bad = padPlan([PAD({ rocket: 93, price: 1 })]);
  eq(bad.rows[0].ok, false);
});

section('Fırlatma rampası · karma plan');
// Roket motoru (86) svy 1: girdiler borsadan. Satış fiyatı ve girdi fiyatları sabit.
const ENGINE_MARKET = { '86:0': 3000, '43:0': 1, '79:0': 100, '18:0': 1 };
const ENGINE = { id: 'eng', type: 'D', product: 86, level: 1, quality: 0 };
test('Rampa + Roket motoru: toplam kâr iki binanın ayrı kârlarının toplamı (yönetim gideri aynı tutulunca)', () => {
  const net = (100 / 170) * 1; // iki bina, toplam 2 seviye: brüt (2 − 1) ÷ 170, tasarruf 0
  const both = padPlan([PAD({ rocket: SOR, price: 105000 }), ENGINE], { market: ENGINE_MARKET });
  near(both.admin.net * 100, net, 9);
  const padOnly = padPlan([PAD({ rocket: SOR, price: 105000 })], { net, market: ENGINE_MARKET });
  const engOnly = padPlan([ENGINE], { net, market: ENGINE_MARKET });
  near(both.totals.profitContractDay, padOnly.totals.profitContractDay + engOnly.totals.profitContractDay, 6);
  near(both.totals.profitExchangeDay, padOnly.totals.profitExchangeDay + engOnly.totals.profitExchangeDay, 6);
  near(both.totals.costDay, padOnly.totals.costDay + engOnly.totals.costDay, 6);
});
test('Rampa + Roket motoru: elle hesap. Rampa maaşı 517,5 × 24 × (1 + 1/170), roket 0,1875 × 105.000, ASR 73,83 × 105; motor girdileri borsadan', () => {
  const r = padPlan([PAD({ rocket: SOR, price: 105000 }), ENGINE], { market: ENGINE_MARKET });
  const net = 1 / 170;
  const padWage = 517.5 * 24 * (1 + net);
  const eng = r.rows[1];
  const engWage = 621 * 24 * (1 + net);
  const engInputs = eng.daily * (20 * 1 + 8 * 100 + 10 * 1);
  const revenueC = 73.828125 * 105 + eng.daily * 3000;
  near(r.totals.costDay, padWage + 0.1875 * 105000 + engWage + engInputs, 6);
  near(r.totals.profitContractDay, revenueC - (padWage + 0.1875 * 105000 + engWage + engInputs), 6);
  eq(r.purchases.map((p) => p.product).sort((a, b) => a - b), [18, 43, 79]);
});
// BFR binası ('9'), Q5 üretir; girdileri (Yörüngesel güçlendirici 92, Yıldız gemisi 93) Q4 ve üstü borsadan
const BFR_BUILDING = (level, q = 5) => ({ id: 'bfr', type: '9', product: BFR, level, quality: q });
const BFR_MARKET = { '92:4': 200000, '93:4': 300000 };
test('Rampa + roketi kendi üreten BFR binası: roket alınmaz, maliyeti zincirle ASR\'ye geçer; fazla BFR satışta kalır', () => {
  const r = padPlan([PAD({ level: 10, price: 795000 }), BFR_BUILDING(17)], { market: BFR_MARKET });
  const bfrDay = 0.2440456939515566 * 17 * 24; // 99,57: 96 fırlatmayı karşılar
  const net = 26 / 170; // toplam 27 seviye
  eq(r.launchBuys.length, 0);
  eq(r.totals.rocketsDay, 0);
  const bfrPool = r.pools.find((p) => p.product === BFR);
  const bfrUnit = (759.0000000000001 * 17 * 24 * (1 + net) + bfrDay * 500000) / bfrDay;
  near(bfrPool.unitCost, bfrUnit, 4);
  near(bfrPool.usedDay, 96, 9);
  const asrPool = r.pools.find((p) => p.product === ASR);
  near(asrPool.unitCost, (517.5 * 10 * 24 * (1 + net) + 96 * bfrUnit) / (96 * 2756.25), 6);
  eq(r.purchases.map((p) => p.product).sort((a, b) => a - b), [92, 93]);
  ok(r.sales.some((s) => s.product === BFR && Math.abs(s.surplusDay - (bfrDay - 96)) < 1e-6), 'fazla BFR satışa çıkmalı');
});
test('Rampa + roketi kısmen üreten bina: eksik kısım binadaki fiyatla alınır, üretilen kısım üretim maliyetiyle', () => {
  const r = padPlan([PAD({ level: 10, price: 795000 }), BFR_BUILDING(8)], { market: BFR_MARKET });
  const own = 0.2440456939515566 * 8 * 24;
  near(r.launchBuys[0].qtyDay, 96 - own, 6);
  near(r.totals.rocketsDay, (96 - own) * 795000, 2);
  const net = 17 / 170;
  const bfrUnit = (759.0000000000001 * 8 * 24 * (1 + net) + own * 500000) / own;
  const asrPool = r.pools.find((p) => p.product === ASR);
  near(asrPool.unitCost, (517.5 * 10 * 24 * (1 + net) + own * bfrUnit + (96 - own) * 795000) / (96 * 2756.25), 6);
});
test('Roket kalitesi tam olmalı: Q6 BFR üretimi Q5 isteyen rampaya verilmez (kaza oranı değişirdi), ikame açık olsa da', () => {
  const r = padPlan([PAD({ level: 10, price: 795000 }), BFR_BUILDING(17, 6)], { market: { '92:5': 200000, '93:5': 300000 } });
  near(r.launchBuys[0].qtyDay, 96, 9);
  ok(r.sales.some((s) => s.product === BFR && s.quality === 6), 'Q6 BFR satışa çıkmalı');
});
test('Rampa + araştırma binası (Bitki araştırma): araştırma hızı ikisine de uygulanır', () => {
  const r = padPlan([PAD({ price: 0 }), { id: 'p', type: 'p', product: 29, level: 10 }], { research: 120, market: { '29:0': 50 } });
  near(r.rows[0].teamFactor, 2.2, 9);
  near(r.rows[1].teamFactor, 2.2, 9);
  near(r.rows[0].launch.perLaunch, 2756.25 * 2.2, 9);
});
test('Hatalı rampa (roket yok) öteki binaları bozmaz, seviyesi yine yönetim giderine girer', () => {
  const r = padPlan([PAD({ rocket: null }), ENGINE], { market: ENGINE_MARKET });
  const engOnly = padPlan([ENGINE], { net: 100 / 170, market: ENGINE_MARKET });
  eq(r.admin.totalLevels, 2);
  near(r.totals.profitContractDay, engOnly.totals.profitContractDay, 6);
});
test('Otomatik kalite: BFR binası rampanın roket kalitesine (Q5) ayarlanır, bir altına değil', () => {
  const s = H.autoQuality({ buildings: [PAD({ q: 5 }), BFR_BUILDING(5, 0)] }, DATA);
  eq(s.buildings[1].quality, 5);
});

let failed = 0;
let current = null;
for (const r of results) {
  if (r.group !== current) {
    current = r.group;
    const inGroup = results.filter((x) => x.group === current);
    console.log(`\n${current} (${inGroup.filter((x) => x.ok).length}/${inGroup.length})`);
  }
  if (!r.ok) failed++;
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      → ${r.error}`}`);
}
console.log(`\n${results.length - failed}/${results.length} test geçti${failed ? `, ${failed} başarısız` : ''}.`);
process.exitCode = failed ? 1 : 0;
