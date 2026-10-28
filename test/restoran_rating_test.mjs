import assert from 'node:assert/strict';
import { RATING_SABIT, urunRho, menuPuani, cesit, personel, luks, cmo, satisHizi, hedefTahmini, adimTahmini, hedefAdimdan, hedefOrtalama } from '../public/restoran-rating.js';
import { DENEY } from '../public/restoran-deney.js';

const yakin = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} ≠ ${b}`);

// Bonus: ekran "+0,42 +0,680" → 0,02 × %21 + 0,01 × 68 = 1,10
yakin(satisHizi(21) + cmo(68), 1.10, 1e-9, 'bonus');
// Referans maliyet = 7200 ÷ oran; ρ uçları
yakin(urunRho(131), Math.log(7200 / 3.505 / 25) / Math.log(2054 / 25), 1e-12, 'rho');
// Bilinmeyen terimler
assert.equal(personel(true), null); assert.equal(personel(false), 0);
assert.equal(luks('luks'), null); assert.equal(luks('eko'), 1);
assert.equal(menuPuani([]), null);
// Eski 9 restoran menüsü: M ≈ 5,4 (hedef ≈ 6,5, bonus 1,10)
const eski = [117, 119, 142, 143, 124, 125].map((id, i) => ({ id, kalite: [6, 10, 7, 5, 7, 7][i] }));
yakin(menuPuani(eski), 5.4, 0.5, 'eski 9 restoran M');
assert.equal(cesit(eski), 0);
const t = hedefTahmini({ menu: eski, etkinIletisim: 68, tabanHizPct: 21 });
assert.deepEqual(t.bilinmeyen, []);
yakin(t.deger, 6.5, 0.5, 'eski 9 restoran hedef');
assert.deepEqual(hedefTahmini({ menu: eski, profesyonel: true, tip: 'luks' }).bilinmeyen, ['P', 'L']);
// Dinamik
yakin(adimTahmini(0, 8.7, 0.147), 1.28, 0.01, 'IV ilk adım');
yakin(hedefAdimdan(0, 1.26, 0.147), 8.57, 0.01, 'IV hedef adımdan');
const iv = DENEY.filter((r) => r.restoran === 'Sky Eco IV' && !r.kapanis);
const h = hedefOrtalama(iv, 0.147);
assert.equal(h.adim, 4); assert.equal(h.guvenilir, false);
// Deney verisi: kapanış satırları ×0,875 ile tutarlı (önceki satırın yenisinden)
for (const r of DENEY) assert.ok(r.yeni >= 0 && r.yeni <= 10 && r.eski >= 0);
const kap = (rest, i) => { const s = DENEY.filter((r) => r.restoran === rest); yakin(s[i].eski, s[i - 1].yeni * RATING_SABIT.kapanis, 0.2, `${rest} kapanış`); };
kap('Sky Eco IV', 4); kap('Lüks 1', 1); kap('Eko 2', 1);
console.log(`restoran_rating: ${DENEY.length} deney satırı, testler geçti`);
