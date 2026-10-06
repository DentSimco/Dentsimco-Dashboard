// DentSimco — bina adı sınamaları: oyundaki hiçbir bina ekranda harfle ("Mağaza I") görünmemeli.
// Çalıştırma: node test/adlar_test.mjs

import { BINA_ADLARI, binaAdi } from '../public/adlar.js';
import { SALES } from '../public/perakende-veri.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}

// Oyunun constants/buildings yanıtındaki tüm bina harfleri (6 Ekim 2026)
const OYUN_HARFLERI = 'PWEORSGCAF6MYLTH12phbcsafl q345D789 0BQoxgdneijkmrtuvyzI'.replace(/ /g, '').split('');

test('Oyundaki her bina harfinin bir Türkçe adı var', () => {
  const eksik = OYUN_HARFLERI.filter((l) => !BINA_ADLARI[l]);
  if (eksik.length) throw new Error(`adı olmayan harfler: ${eksik.join(', ')}`);
});

test('Perakende listesindeki her binanın adı var (Mağaza I, t, u, z kalmadı)', () => {
  const eksik = Object.keys(SALES).filter((l) => !BINA_ADLARI[l]);
  if (eksik.length) throw new Error(`adı olmayan perakende harfleri: ${eksik.join(', ')}`);
});

test('Adı olmayan harf boş kalmaz, ön ek ile görünür', () => {
  if (binaAdi('?') !== 'Bina ?') throw new Error(binaAdi('?'));
  if (binaAdi('?', 'Mağaza') !== 'Mağaza ?') throw new Error(binaAdi('?', 'Mağaza'));
});

test('Hiçbir ad boş ya da yinelenen değil', () => {
  const adlar = Object.values(BINA_ADLARI);
  if (adlar.some((a) => !a.trim())) throw new Error('boş ad var');
  const yinelenen = adlar.filter((a, i) => adlar.indexOf(a) !== i);
  if (yinelenen.length) throw new Error(`yinelenen adlar: ${yinelenen.join(', ')}`);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
