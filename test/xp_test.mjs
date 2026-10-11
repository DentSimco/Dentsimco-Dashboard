// node test/xp_test.mjs — Tecrübe (XP) hesap motoru (ağ kullanmaz)
import assert from 'node:assert/strict';
import { hesapla, seviyeXp, VARSAYILAN, MAKS_SEVIYE } from '../public/hesap-xp.js';

const T0 = Date.UTC(2026, 9, 11);
assert.equal(seviyeXp(1), 10);
assert.equal(seviyeXp(23), 400000);
assert.equal(seviyeXp(24), 400000);
assert.equal(seviyeXp(60), 400000);
assert.equal(seviyeXp(61), 0, '60 üstü için veri yok');
assert.equal(seviyeXp(0), 0);

// 1 → 2, %0 ilerleme, 1 bina: 10 XP / 12 XP·sa
let r = hesapla(VARSAYILAN, T0);
assert.deepEqual(r.errors, []);
assert.equal(r.hourlyXP, 12);
assert.equal(r.totalXPNeeded, 10);
assert.ok(Math.abs(r.timeInHours - 10 / 12) < 1e-9);
assert.equal(r.targetDate.getTime(), T0 + (10 / 12) * 3600 * 1000);

// Yüzde ilerleme kalan XP'yi düşürür; aradaki seviyeler eklenir (hedefin kendisi sayılmaz): 5→8 %50
r = hesapla({ ...VARSAYILAN, currentLevel: 5, progressValue: 50, targetLevel: 8 }, T0);
assert.equal(r.totalXPNeeded, 80 * 0.5 + 130 + 210);

// Saatlik XP: 10 çalışan + 2 dinlenme + 3 bolluk yuvası günde 12 saat
r = hesapla({ ...VARSAYILAN, operatingBuildings: 10, numRecreationBuildings: 2, abundanceSlots: 3, abundanceHours: 12 }, T0);
assert.equal(r.operatingXP, 120);
assert.equal(r.recreationXP, 240);
assert.equal(r.abundanceXP, 54);
assert.equal(r.hourlyXP, 414);

// Sabit bölge: 24 → 26 = 2 × 400.000
r = hesapla({ ...VARSAYILAN, currentLevel: 24, targetLevel: 26, operatingBuildings: 100 }, T0);
assert.equal(r.totalXPNeeded, 800000);
assert.equal(r.timeInHours, 800000 / 1200);

// XP geliri 0 ise süre sonsuz, tarih yok
r = hesapla({ ...VARSAYILAN, operatingBuildings: 0 }, T0);
assert.equal(r.timeInHours, Infinity);
assert.equal(r.targetDate, null);

// Boş kutular 0 sayılır; hedef boşsa hata
r = hesapla({ ...VARSAYILAN, operatingBuildings: '' }, T0);
assert.equal(r.hourlyXP, 0);
assert.equal(hesapla({ ...VARSAYILAN, targetLevel: '' }, T0).errors[0].field, 'targetLevel');

// Hatalar
const alan = (g) => hesapla({ ...VARSAYILAN, ...g }, T0).errors.map((e) => e.field);
assert.deepEqual(alan({ currentLevel: 0 }), ['currentLevel']);
assert.deepEqual(alan({ currentLevel: 61, targetLevel: 62 }), ['currentLevel', 'targetLevel']);
assert.deepEqual(alan({ progressValue: 101 }), ['progressValue']);
assert.deepEqual(alan({ progressValue: -1 }), ['progressValue']);
assert.deepEqual(alan({ targetLevel: 1 }), ['targetLevel']);
assert.deepEqual(alan({ targetLevel: MAKS_SEVIYE + 2 }), ['targetLevel']);
assert.deepEqual(alan({ abundanceHours: 25 }), ['abundanceHours']);
assert.deepEqual(alan({ operatingBuildings: -1 }), ['operatingBuildings']);
assert.deepEqual(alan({ currentLevel: 60, targetLevel: 61 }), [], '60 → 61 hesaplanır');
console.log('xp_test: tamam');
