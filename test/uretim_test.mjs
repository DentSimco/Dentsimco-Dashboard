// DentSimco — sayı okuma sınamaları (parseNum: Üretim, Perakende ve Yönetim'deki tüm yazı kutuları bunu kullanır).
// Çalıştırma: node test/uretim_test.mjs

import { parseNum, KISAYOL, TABS as URETIM_TABS, kisayolHtml, kisayolKucuk, kisayolSatiri, bilimKazanci } from '../public/uretim.js';
import { TABS as PERAKENDE_TABS } from '../public/perakende.js';
import { yonetimRota } from '../public/yonetim.js';
import * as Y from '../public/yonetici.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
const eq = (actual, expected, label = '') => { if (actual !== expected) throw new Error(`${label} beklenen ${expected}, bulunan ${actual}`); };
const eqj = (actual, expected, label = '') => eq(JSON.stringify(actual), JSON.stringify(expected), label); // diziler için

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


// ---- Kısayol butonları: adresler gerçek sekmelere gider, Özete git hangi bölümdeyse onun özetine ----
test('Her kısayol var olan bir sekmeye gider (Üretim, Perakende, Yönetim)', () => {
  const sekmeler = { uretim: URETIM_TABS.map(([k]) => k), perakende: PERAKENDE_TABS.map(([k]) => k) };
  for (const [anahtar, [href]] of Object.entries(KISAYOL)) {
    const [modul, sekme] = href.slice(1).split('/');
    if (modul === 'yonetim') { eq(yonetimRota([modul, sekme]).tab, 'simulasyon', anahtar); continue; }
    if (!sekmeler[modul]?.includes(sekme)) throw new Error(`${anahtar}: ${href} gerçek bir sekme değil`);
  }
});
test('"Özete git" etiketi iki bölümde aynı ama adresleri ayrı: Üretim → #uretim/ozet, Perakende → #perakende/ozet', () => {
  eq(KISAYOL.uretimOzet[1], 'Özete git');
  eq(KISAYOL.perakendeOzet[1], 'Özete git');
  eq(KISAYOL.uretimOzet[0], '#uretim/ozet');
  eq(KISAYOL.perakendeOzet[0], '#perakende/ozet');
});
test('Üretim Binalar altı: solda Özete git, sağda Alım-Satım\'a git', () => {
  const h = kisayolSatiri('uretimOzet', 'uretimAlimSatim');
  const adresler = [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  eqj(adresler, ['#uretim/ozet', '#uretim/alimsatim']);
  eq(h.indexOf('Özete git') < h.indexOf("Alım-Satım'a git"), true, 'sıra');
});
test('Perakende Binalar altı: PPHPL Max ve Özete git', () => {
  const adresler = [...kisayolSatiri('perakendePphpl', 'perakendeOzet').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  eqj(adresler, ['#perakende/pphpl', '#perakende/ozet']);
});
test('Ekip altı üç buton; Kurulum sonrası küçük buton', () => {
  const adresler = [...kisayolSatiri('uretimKurulum', 'perakendeKurulum', 'simulasyon').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  eqj(adresler, ['#uretim/kurulum', '#perakende/kurulum', '#yonetim/simulasyon']);
  eq(/href="#uretim\/binalar"[^>]*>Üretim Binalara Git</.test(kisayolKucuk('uretimBinalar')), true);
  eq(/href="#perakende\/binalar"[^>]*>Perakende Binalara Git</.test(kisayolKucuk('perakendeBinalar')), true);
  eq(/<a class="ur-btn grow"/.test(kisayolHtml('uretimOzet')), true);
});

// ---- Bilimin kazandırdığı (Üretim Özet): Ekip sekmesindeki Bilim satırıyla aynı değer ----
const arastirma = (daily, teamFactor, extra = {}) => ({ ok: true, construction: false, category: 'research', product: 7, quality: 0, daily, teamFactor, ...extra });
test('Bilimin değeri = ekipli ve ekipsiz üretim farkı × fiyat; Ekip sekmesindeki değerle aynı', () => {
  // 10.000 adet/gün ekipsiz üretim, bilim 60 → +%120 → teamFactor 2,2; fiyat $100
  const row = arastirma(22000, 2.2);
  const B = bilimKazanci([row], () => 100);
  eq(Math.round(B.day), 1200000);
  eq(B.count, 1);
  const sim = Y.executiveSimulation({
    executives: [{ position: 't', salary: 0, active: true, skills: { coo: 0, cfo: 0, cmo: 0, cto: 60 } }],
    parts: { uretim: { levels: 10, academy: 0, wagesDay: 1000, researchDay: 10000 * 100 } },
  });
  eq(Math.round(sim.sectors.cto), Math.round(B.day), 'Ekip sekmesi');
});
test('Bilimin değeri: araştırma binası yoksa satır yok; inşaatta ya da çarpansız bina sayılmaz; fiyat yoksa işaretlenir', () => {
  eq(bilimKazanci([], () => 100).count, 0);
  eq(bilimKazanci([{ ok: true, category: 'production', daily: 100, teamFactor: 1 }], () => 100).count, 0);
  eq(bilimKazanci([arastirma(22000, 2.2, { construction: true })], () => 100).count, 0);
  const fiyatsiz = bilimKazanci([arastirma(22000, 2.2)], () => null);
  eq(fiyatsiz.count, 1);
  eq(fiyatsiz.noPrice, true);
  eq(fiyatsiz.day, 0);
  eq(Math.round(bilimKazanci([arastirma(10000, 1)], () => 100).day), 0, 'ekip yoksa kazanç 0');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
