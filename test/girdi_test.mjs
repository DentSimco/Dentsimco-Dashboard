// DentSimco — sayı kutusu binlik nokta sınamaları. Çalıştırma: node test/girdi_test.mjs
import { gruplaYaz } from '../public/girdi.js';
import { parseNum } from '../public/uretim.js';

const results = [];
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } }
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} beklenen ${JSON.stringify(b)}, gelen ${JSON.stringify(a)}`); };

test('Yazarken: 20000000 → 20.000.000', () => eq(gruplaYaz('20000000').metin, '20.000.000'));
test('Küçük sayı gruplanmaz', () => { eq(gruplaYaz('999').metin, '999'); eq(gruplaYaz('1000').metin, '1.000'); });
test('Boş kutu boş kalır', () => eq(gruplaYaz('').metin, ''));
test('Biçimli sayıdan bir sıfır silinince (20.000.00) doğru gruplanır: 2.000.000', () => {
  const r = gruplaYaz('20.000.00', 9);
  eq(r.metin, '2.000.000'); eq(r.imlec, 9);
});
test('Ortadan rakam silince imleç yerinde kalır', () => {
  // "20.000.000" → imleç "20.0|00.000" iken bir rakam silindi: "20.0|0.000"
  const r = gruplaYaz('20.0.000', 4);
  eq(r.metin, '200.000'); eq(r.imlec, 3, 'imleç'); // 3 rakamın hemen sağı
});
test('Ortaya rakam eklenince imleç eklenenin sağında kalır', () => {
  const r = gruplaYaz('1.2534.000', 6); // "1.253|4.000"
  eq(r.metin, '12.534.000'); eq(r.imlec, 6);
});
test('Harf ve boşluk atılır, yapıştırılan "4,490,000" okunur', () => eq(gruplaYaz('4,490,000 $').metin, '4.490.000'));
test('Baştaki sıfırlar atılır', () => eq(gruplaYaz('007').metin, '7'));
test('Eksi işareti korunur', () => { eq(gruplaYaz('-1500').metin, '-1.500'); eq(gruplaYaz('-').metin, '-'); });
test('15 haneden uzun sayı kesilir', () => eq(gruplaYaz('1'.repeat(20)).metin.replace(/\./g, '').length, 15));
test('Gruplanmış metin parseNum ile aynı sayıya okunur', () => {
  for (const n of [5, 999, 1000, 2323, 20000, 225000, 20000000, 123456789]) eq(parseNum(gruplaYaz(String(n)).metin), n, String(n));
});
test('Gruplama kendi çıktısında kararlı (ikinci geçiş değiştirmez)', () => {
  const a = gruplaYaz('123456789').metin; eq(gruplaYaz(a).metin, a);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
