// DentSimco — Restoran parola kapısı sınamaları. Çalıştırma: node test/kilit_test.mjs
// Gerçek parola depoda yazılı olmadığı için doğru parola sınaması yalnız DENTSIMCO_KILIT_PAROLA ortam değişkeni verilirse çalışır.
import { pbkdf2Sync } from 'node:crypto';
import { KILIT, KILIT_ANAHTAR, ozetle, kilitAcik, kilitDene, kilitKapat } from '../public/kilit.js';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
const ok = (v, label = 'koşul sağlanmadı') => { if (!v) throw new Error(label); };
const eq = (a, b, label = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${label} beklenen ${JSON.stringify(b)}, bulunan ${JSON.stringify(a)}`); };
const depo = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// Sınama için ayrı tuz ve parola: tarayıcı kodu (Web Crypto) ile Node'un PBKDF2'si aynı özeti vermeli
const DENEME = { tuz: '00112233445566778899aabbccddeeff', tur: 1000, ozet: pbkdf2Sync('deneme-parola', Buffer.from('00112233445566778899aabbccddeeff', 'hex'), 1000, 32, 'sha256').toString('hex') };

await test('Özet Node PBKDF2 ile aynı; farklı parola farklı özet', async () => {
  eq(await ozetle('deneme-parola', DENEME), DENEME.ozet);
  ok((await ozetle('baska', DENEME)) !== DENEME.ozet, 'farklı parola aynı özeti verdi');
});
await test('Yanlış ya da boş parola reddedilir ve tarayıcıya hiçbir şey yazılmaz', async () => {
  const d = depo();
  eq(await kilitDene('yanlis', d, DENEME), false);
  eq(await kilitDene('   ', d, DENEME), false);
  eq(await kilitDene(undefined, d, DENEME), false);
  eq(d.getItem(KILIT_ANAHTAR), null);
  eq(kilitAcik(d, DENEME), false);
});
await test('Doğru parola (baştaki ve sondaki boşluk yok sayılır) kapıyı açar; kapatınca yine kilitlenir', async () => {
  const d = depo();
  eq(await kilitDene(' deneme-parola ', d, DENEME), true);
  eq(kilitAcik(d, DENEME), true);
  kilitKapat(d);
  eq(kilitAcik(d, DENEME), false);
});
await test('Tarayıcıda elle yazılmış rastgele bir değer kapıyı açmaz; depo okunamazsa kilitli kalır', async () => {
  const d = depo();
  d.setItem(KILIT_ANAHTAR, '1');
  eq(kilitAcik(d, DENEME), false);
  eq(kilitAcik({ getItem() { throw new Error('gizli sekme'); } }, DENEME), false);
  eq(kilitAcik(null, DENEME), false);
});
await test('Depodaki ayar: tuz 16 bayt, özet 32 bayt (hex), en az 210.000 tur', () => {
  ok(/^[0-9a-f]{32}$/.test(KILIT.tuz) && /^[0-9a-f]{64}$/.test(KILIT.ozet), 'biçim');
  ok(KILIT.tur >= 210000, 'tur sayısı düşük');
});
if (process.env.DENTSIMCO_KILIT_PAROLA) {
  await test('Gerçek parola kapıyı açar, bir hane farklısı açmaz', async () => {
    const d = depo();
    const p = process.env.DENTSIMCO_KILIT_PAROLA;
    eq(await kilitDene(`${p}0`, d), false);
    eq(await kilitDene(p, d), true);
    eq(kilitAcik(d), true);
  });
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
