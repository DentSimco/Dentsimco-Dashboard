// DentSimco — sayı okuma sınamaları (parseNum: Üretim, Perakende ve Yönetim'deki tüm yazı kutuları bunu kullanır).
// Çalıştırma: node test/uretim_test.mjs

import { parseNum } from '../public/uretim.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
const eq = (actual, expected, label = '') => { if (actual !== expected) throw new Error(`${label} beklenen ${expected}, bulunan ${actual}`); };

test('Türkçe ve İngilizce biçimler', () => {
  eq(parseNum('1.921.272'), 1921272);
  eq(parseNum('0,3582'), 0.3582);
  eq(parseNum('72.65'), 72.65);
  eq(parseNum('4,490,000'), 4490000);
  eq(parseNum('1.234,56'), 1234.56);
  eq(parseNum('1,234.56'), 1234.56);
  eq(parseNum('%62'), 62);
  eq(parseNum('$1,234.56'), 1234.56);
  eq(parseNum('12 345'), 12345);
});

test('Tek virgül ve tam 3 hane, referans yokken binlik ayracıdır (maaş, nakit, bono): 225,000 → 225000', () => {
  eq(parseNum('225,000'), 225000);
  eq(parseNum('400,000'), 400000);
  eq(parseNum('12,500'), 12500);
});

test('Tek nokta ve tam 3 hane, referans yokken binlik ayracıdır: 2.345 → 2345, 225.000 → 225000', () => {
  eq(parseNum('2.345'), 2345);
  eq(parseNum('225.000'), 225000);
});

test('Referans (borsa fiyatı) varsa yakın olan okunur: 1,250 ve 1.250, fiyat 1,2 civarındayken → 1,25', () => {
  eq(parseNum('1,250', { ref: 1.2 }), 1.25);
  eq(parseNum('1.250', { ref: 1.2 }), 1.25);
  eq(parseNum('1,250', { ref: 1300 }), 1250);
  eq(parseNum('2.345', { ref: 2400 }), 2345);
});

test('Sıfırla başlayan ondalıklar her zaman ondalıktır: 0,125 ve 0.123', () => {
  eq(parseNum('0,125'), 0.125);
  eq(parseNum('0.123'), 0.123);
  eq(parseNum('0,125', { ref: 125 }), 0.125);
});

test('İki ondalıklı ya da kısa değerler değişmez: 12,5  1,25  3,5', () => {
  eq(parseNum('12,5'), 12.5);
  eq(parseNum('1,25'), 1.25);
  eq(parseNum('3,5'), 3.5);
});

test('Ekrandaki eksi işareti (−) ve normal eksi okunur', () => {
  eq(parseNum('−5'), -5);
  eq(parseNum('-5'), -5);
  eq(parseNum('−1.234'), -1234);
  eq(parseNum('−$12,5'), -12.5);
});

test('Boş ya da anlamsız metin null döner', () => {
  eq(parseNum(''), null);
  eq(parseNum('   '), null);
  eq(parseNum('abc'), null);
  eq(parseNum(null), null);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
