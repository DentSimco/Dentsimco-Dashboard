// node test/gruplar_test.mjs — Grup toplamı ve sıralaması (ağ kullanmaz)
import assert from 'node:assert/strict';
import { grupDegerleri, grupSirala, grupRealmde, grupGecmisi } from '../public/gruplar.js';
import { sirketlerRota } from '../public/sirketler.js';

// [id, ad, sıra, sıraFarkı, eva, değer, değerFarkı, ...]
const row = (id, deger, fark) => [id, `S${id}`, id, 0, 0, deger, fark, 0, 0, 0, 0, 0, 1];
const rows = [row(1, 100, 10), row(2, 300, -30), row(3, 50, 0), row(4, 1000, 100)];
const G = [
  { id: 'a', ad: 'Alfa', idler: [1, 2, 99] },
  { id: 'b', ad: 'Beta', idler: [3, 3, 4], realm: 0 },
  { id: 'c', ad: 'Gama', idler: [1], realm: 1 },
  { id: 'd', ad: 'Boş', idler: [] },
];

const r0 = grupDegerleri(rows, G, 0);
assert.deepEqual(r0.map((g) => g.id), ['a', 'b', 'd'], 'realm süzgeci');
assert.equal(r0[0].toplam, 400, 'toplam = üye değerleri');
assert.deepEqual(r0[0].eksik, [99], 'sırada olmayan numara eksik');
assert.equal(r0[0].uyeSayisi, 3);
assert.equal(r0[0].bulunan, 2);
assert.equal(r0[0].fark, -20);
assert.ok(Math.abs(r0[0].yuzde - (-20 / 420)) < 1e-12, 'yüzde = Σfark / (Σdeğer − Σfark)');
assert.equal(r0[1].toplam, 1050, 'tekrarlanan numara bir kez sayılır');
assert.equal(r0[2].toplam, 0);
assert.equal(r0[2].yuzde, 0);
assert.deepEqual(grupDegerleri(rows, G, 1).map((g) => g.id), ['a', 'c', 'd']);
assert.deepEqual(grupRealmde(G, 1).map((g) => g.id), ['a', 'c', 'd']);

assert.deepEqual(grupSirala(r0).map((g) => g.id), ['b', 'a', 'd'], 'toplam azalan');
assert.deepEqual(grupSirala(r0, 1).map((g) => g.id), ['d', 'a', 'b']);
const esit = grupSirala([{ ad: 'Z', toplam: 5 }, { ad: 'A', toplam: 5 }]);
assert.deepEqual(esit.map((g) => g.ad), ['A', 'Z'], 'eşitlikte ada göre');
assert.equal(r0.length, G.length - 1);
assert.equal(G[0].idler.length, 3, 'girdi değişmez');

// adresler
assert.deepEqual(sirketlerRota('#sirketler/gruplar'), { tab: 'gruplar', key: null, ids: [], galt: 'uyeler', grup: null });
assert.equal(sirketlerRota('#sirketler/gruplar/siralama').galt, 'siralama');
assert.equal(sirketlerRota('#sirketler/gruplar/uyeler/a%20b').grup, 'a b');
assert.equal(sirketlerRota('#sirketler/gruplar/uyeler/%E0%A4%A').grup, null, 'bozuk kodlama çökmez');
assert.equal(sirketlerRota('#sirketler/siralama').tab, 'siralama');
assert.equal(sirketlerRota('#sirketler/value').key, 'value', 'haber bağlantıları çalışır');
assert.equal(sirketlerRota('#sirketler/kiyas/1,2').ids.length, 2);
assert.equal(sirketlerRota('#sirketler/liste').tab, 'liste');
// grup geçmişi: gün = [gün, sıra, eva, değer]
const gun = (d, v) => [d, 0, 0, v];
const gec = new Map([
  [1, [gun(20260101, 10), gun(20260102, 20), gun(20260103, 30)]],
  [2, [gun(20260102, 1), gun(20260103, 2)]],
  [3, []],
]);
const gg = grupGecmisi([1, 2, 3], gec);
assert.deepEqual(gg.noktalar, [[20260102, 21], [20260103, 32]], 'yalnız tüm üyelerde bulunan günler toplanır');
assert.equal(gg.uye, 2);
assert.equal(gg.gecmissiz, 1, 'geçmişi olmayan üye toplama girmez');
assert.deepEqual(grupGecmisi([3], gec).noktalar, []);
assert.deepEqual(grupGecmisi([], gec), { noktalar: [], uye: 0, gecmissiz: 0 });
console.log('gruplar_test: tamam');
