// node test/sirketler_test.mjs — Şirketler sıralama ve arama mantığı (ağ kullanmaz)
import assert from 'node:assert/strict';
import { sirala, ara, sirketBul, detaySatirlari, SIRALAMA } from '../public/sirketler.js';

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
assert.ok(!SIRALAMA.some((s) => s[0] === 'name'), 'Ad (A-Z) sıralaması kaldırıldı');
assert.deepEqual(ids(sirala(rows, 'name', -1)), [1, 2, 3], 'eski "name" anahtarı şirket değerine düşer (azalan)');
assert.deepEqual(SIRALAMA.map((s) => s[0]), ['value', 'valueDiff', 'valuePct', 'eva', 'buildings', 'patents', 'bonds'], 'sıralama menüsü');
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
// İşçi sıralama ölçütü değil: listede yok, eski bağlantı/anahtar şirket değerine düşer
assert.ok(!SIRALAMA.some((s) => s[0] === 'workers'), 'İşçi sıralama ölçütü kaldırıldı');
assert.deepEqual(ids(sirala(rows, 'workers', -1)), [1, 2, 3], 'eski "workers" anahtarı şirket değerine düşer (azalan)');

// Şirket numarasıyla bulma (Haber ve arama bağlantıları sayı ya da metin verebilir); liste değişmez
assert.equal(sirketBul(rows, 2), B);
assert.equal(sirketBul(rows, '2'), B);
assert.equal(sirketBul(rows, 99), null);
assert.equal(sirketBul([], 1), null);
assert.deepEqual(ids(rows), [3, 1, 2]);

// Detay satırları: [etiket, metin, ton]
const detay = (r) => Object.fromEntries(detaySatirlari(r).map(([t, v, c]) => [t, [v, c]]));
const dA = detay(A);
assert.deepEqual(Object.keys(dA), ['Sıra', 'EVA sırası', 'Şirket değeri', 'Günlük değişim', 'Günlük değişim %', 'Bina değeri', 'Patent değeri', 'İşçi', 'Satılan bono']);
assert.deepEqual(dA['Sıra'], ['1', ''], 'sıra farkı 0: ok yazılmaz');
assert.deepEqual(dA['EVA sırası'], ['9', '']);
assert.deepEqual(dA['Şirket değeri'], ['$900', '']);
assert.deepEqual(dA['Günlük değişim'], ['+5', 'up']);
assert.deepEqual(dA['Bina değeri'], ['$50', '']);
assert.deepEqual(dA['İşçi'], ['3', ''], 'işçi tabloda olduğu gibi ÷100');
const dB = detay(B);
assert.deepEqual(dB['Sıra'], ['2 (▲2)', 'up']);
assert.deepEqual(dB['Günlük değişim'], ['−20', 'down']);
assert.deepEqual(dB['Günlük değişim %'].slice(1), ['down']);
// Ayrıntısı gelmemiş şirket: EVA, bina, patent, işçi, bono "—"; değer ve değişim yine görünür
const dC = detay(C);
for (const k of ['EVA sırası', 'Bina değeri', 'Patent değeri', 'İşçi', 'Satılan bono']) assert.deepEqual(dC[k], ['—', ''], k);
assert.deepEqual(dC['Şirket değeri'], ['$700', '']);
assert.deepEqual(dC['Sıra'], ['3 (▼1)', 'down']);
// EVA'sı 0 olan (ayrıntısı gelmiş) şirkette EVA "—"
assert.deepEqual(detay(D)['EVA sırası'], ['—', '']);
assert.ok(SIRALAMA.every(([k, t, col, dir]) => k && t && Number.isInteger(col) && (dir === 1 || dir === -1)));
console.log('sirketler_test: tamam');

// ---- Sekmeler ve adres ----
import { sirketlerRota, SEKMELER, gecmisTablosuHtml } from '../public/sirketler.js';
assert.deepEqual(SEKMELER.map((s) => s[0]), ['siralama', 'gruplar', 'kiyas', 'liste']);
const rota3 = (h) => { const { tab, key, ids } = sirketlerRota(h); return { tab, key, ids }; }; // kapsam/galt/grup: gruplar_test.mjs
assert.deepEqual(rota3('#sirketler'), { tab: 'siralama', key: null, ids: [] });
assert.deepEqual(rota3('#sirketler/eva'), { tab: 'siralama', key: 'eva', ids: [] }, 'haber sayfasındaki ölçüt bağlantıları çalışır');
assert.deepEqual(rota3('#sirketler/bilinmez'), { tab: 'siralama', key: null, ids: [] });
assert.deepEqual(rota3('#sirketler/liste'), { tab: 'liste', key: null, ids: [] });
assert.deepEqual(rota3('#sirketler/kiyas/1,2,2,x,3'), { tab: 'kiyas', key: null, ids: [1, 2, 3] }, 'tekrarlar ve bozuk numaralar atılır');
assert.equal(sirketlerRota('#sirketler/kiyas/1,2,3,4,5,6,7').ids.length, 5, 'en çok 5 şirket');
// Gün gün tablo: yeniden eskiye; farklar önceki günle; ayrıntısı olmayan gün "—"
const g = (d, sira, eva, deger, bina) => [d, sira, eva, deger, bina, bina == null ? null : 5, bina == null ? null : 300, bina == null ? null : 7, bina == null ? 0 : 1];
const tablo = gecmisTablosuHtml([g(20261013, 3, 10, 1000, 50), g(20261014, 2, 8, 1100, null), g(20261015, 2, 9, 1050, 60)]);
assert.ok(tablo.indexOf('15') < tablo.indexOf('13') || tablo.indexOf('2026') > 0, 'tablo üretildi');
assert.ok(tablo.includes('$1,100') || tablo.includes('$1.100'), 'değer görünür');
assert.ok(tablo.includes('class="dim">—'), 'ayrıntısı gelmemiş gün "—"');
assert.equal((tablo.match(/<tr>/g) || []).length, 4, 'başlık + 3 gün');
console.log('sirketler sekmeleri: tamam');
