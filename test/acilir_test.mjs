// DentSimco — açılır menü yardımcı işlev sınamaları. Çalıştırma: node test/acilir_test.mjs
import { yerlesim, sonrakiSecenek, acilirMi } from '../public/acilir.js';

const results = [];
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } }
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} beklenen ${JSON.stringify(b)}, gelen ${JSON.stringify(a)}`); };

test('Aşağıda yer varsa liste kutunun altına açılır', () => {
  const y = yerlesim({ top: 100, bottom: 148 }, 900);
  eq(y.yukari, false); eq(y.top, 152);
  if (y.yukseklik > 320) throw new Error('liste 320 pikselden uzun');
});
test('Aşağıda yer az, yukarıda çok ise liste yukarı açılır ve ekrandan taşmaz', () => {
  const y = yerlesim({ top: 700, bottom: 748 }, 800);
  eq(y.yukari, true);
  if (y.top < 8) throw new Error('üstten taştı');
  if (y.top + y.yukseklik > 700) throw new Error('kutunun üstüne binmemeli');
});
test('İki yanda da az yer varsa en az 96 piksel yükseklik verilir', () => {
  const y = yerlesim({ top: 60, bottom: 108 }, 200);
  if (y.yukseklik < 96) throw new Error(String(y.yukseklik));
});
test('Klavye: devre dışı seçenekler atlanır, uçta durulur', () => {
  const l = [{ disabled: true }, {}, { disabled: true }, {}];
  eq(sonrakiSecenek(l, 1, 1), 3); eq(sonrakiSecenek(l, 3, 1), 3); eq(sonrakiSecenek(l, 3, -1), 1); eq(sonrakiSecenek(l, 1, -1), 1);
});
test('Hangi kutular açılır liste olur: tek seçimli select evet; çoklu, data-native ve diğer öğeler hayır', () => {
  const sel = (o = {}) => ({ tagName: 'SELECT', multiple: false, size: 0, hasAttribute: () => false, ...o });
  eq(acilirMi(sel()), true);
  eq(acilirMi(sel({ multiple: true })), false);
  eq(acilirMi(sel({ size: 4 })), false);
  eq(acilirMi(sel({ hasAttribute: (a) => a === 'data-native' })), false);
  eq(acilirMi({ tagName: 'INPUT' }), false);
  eq(acilirMi(null), false);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
