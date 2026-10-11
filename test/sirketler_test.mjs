// node test/sirketler_test.mjs — Şirketler sıralama ve arama mantığı (ağ kullanmaz)
import assert from 'node:assert/strict';
import { sirala, ara, SIRALAMA } from '../public/sirketler.js';

// [id, ad, sıra, sıraFarkı, eva, değer, değerFarkı, yüzde, bina, patent, işçi, tahvil, ayrıntıVar]
const A = [1, 'Çelik A.Ş.', 1, 0, 9, 900, 5, 0.01, 50, 10, 300, 0, 1];
const B = [2, 'arı Ltd', 2, 2, 3, 800, -20, -0.02, 70, 5, 100, 9, 1];
const C = [3, 'Zeytin', 3, -1, 0, 700, 0, 0, 0, 0, 0, 0, 0]; // ayrıntısı gelmemiş
const rows = [C, A, B];
const ids = (list) => list.map((r) => r[0]);

assert.ok(!SIRALAMA.some((s) => s[0] === 'rank'), '"Sıra" ölçütü yok (şirket değeriyle aynı)');
assert.equal(SIRALAMA[0][0], 'value', 'varsayılan ölçüt şirket değeri');
assert.deepEqual(ids(sirala(rows, 'value', -1)), [1, 2, 3]);
assert.deepEqual(ids(sirala(rows, 'valueDiff', 1)), [2, 3, 1]);
assert.deepEqual(ids(sirala(rows, 'name', 1)), [2, 1, 3], 'Türkçe sıra: arı, Çelik, Zeytin');
// Ayrıntı ölçütünde ayrıntısı olmayan şirket yön ne olursa olsun sonda kalır
assert.deepEqual(ids(sirala(rows, 'buildings', -1)), [2, 1, 3]);
assert.deepEqual(ids(sirala(rows, 'buildings', 1)), [1, 2, 3]);
assert.deepEqual(ids(sirala(rows, 'eva', 1)), [2, 1, 3]);
assert.deepEqual(ids(sirala(rows, 'eva', -1)), [1, 2, 3]);
// EVA puanı 0 olan (ayrıntısı gelse bile) yön ne olursa olsun sonda
const D = [4, 'Dört', 4, 0, 0, 10, 0, 0, 1, 1, 1, 1, 1];
assert.deepEqual(ids(sirala([D, A, B], 'eva', -1)), [1, 2, 4]);
assert.deepEqual(ids(sirala([D, A, B], 'eva', 1)), [2, 1, 4], 'EVA sırası 1 en iyi: küçükten büyüğe');
assert.equal(SIRALAMA.find((s) => s[0] === 'eva')[3], 1, 'EVA varsayılanı küçükten büyüğe (1 en iyi)');
assert.equal(SIRALAMA.find((s) => s[0] === 'bonds')[1], 'Satılan bono');
assert.deepEqual(ids(sirala(rows, 'bilinmeyen', -1)), [1, 2, 3], 'bilinmeyen ölçüt şirket değerine düşer');
assert.deepEqual(ids(rows), [3, 1, 2], 'giriş listesi değişmez');
// Eşit değerde sıra numarası belirler
assert.deepEqual(ids(sirala([[9, 'x', 5, 0, 1, 10, 0, 0, 0, 0, 0, 0, 1], [8, 'y', 4, 0, 1, 10, 0, 0, 0, 0, 0, 0, 1]], 'value', -1)), [8, 9]);

assert.deepEqual(ids(ara(rows, 'ARI')), [2], 'I → ı (Türkçe kural)');
assert.deepEqual(ids(ara(rows, 'ARİ')), [], 'İ → i, arı ile eşleşmez');
assert.deepEqual(ids(ara(rows, 'arı')), [2]);
assert.deepEqual(ids(ara(rows, ' zey ')), [3]);
assert.deepEqual(ids(ara(rows, '2')), [2], 'sayı = şirket numarası');
assert.equal(ara(rows, ''), rows);
assert.ok(SIRALAMA.every(([k, t, col, dir]) => k && t && Number.isInteger(col) && (dir === 1 || dir === -1)));
console.log('sirketler_test: tamam');
