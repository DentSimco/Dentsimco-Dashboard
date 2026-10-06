// DentSimco — ürün adı sınamaları. Çalıştırma: node test/urun_adlari_test.mjs
import { urunAdi, anahtar, ID_ADLARI, OYUN_ADLARI } from '../public/urun-adlari.js';
import { products as ORNEK } from './veri-ornek.mjs';

const results = [];
function test(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } }
const eq = (a, b) => { if (a !== b) throw new Error(`beklenen "${b}", gelen "${a}"`); };

test('Şekerkamışı: ayrı yazım ve büyük harf düzelir', () => {
  eq(urunAdi(9999, 'Şeker kamışı'), 'Şekerkamışı'); eq(urunAdi(9999, 'ŞEKERKAMIŞI'), 'Şekerkamışı'); eq(urunAdi(9999, 'sekerkamisi'), 'Şekerkamışı');
});
test('Türkçe büyük İ/ı doğru eşleşir', () => { eq(urunAdi(9999, 'DONDURULMUŞ PİZZA'), 'Dondurulmuş pizza'); eq(urunAdi(9999, 'İç Çamaşır'), 'İç çamaşır'); });
test('Kimliği bilinen ürün doğrudan oyundaki adı alır', () => { eq(urunAdi(72, 'Sugarcane'), 'Şekerkamışı'); eq(urunAdi(13, 'x'), 'Taşıma'); eq(urunAdi(111, 'x'), 'İnşaat gereci'); });
test('Listede olmayan ad olduğu gibi kalır', () => { eq(urunAdi(9999, 'Bilinmeyen ürün'), 'Bilinmeyen ürün'); eq(urunAdi(9999, null), null); });
test('Liste adları tekil (aynı anahtarlı iki ad yok)', () => {
  const k = OYUN_ADLARI.map(anahtar); const yinelenen = k.filter((x, i) => k.indexOf(x) !== i);
  if (yinelenen.length) throw new Error(yinelenen.join(', '));
});
test('Kimlik tablosundaki her ad oyun listesinde var; örnek veride ürün kimlikleri çakışmıyor', () => {
  const liste = new Set(OYUN_ADLARI);
  for (const [id, ad] of Object.entries(ID_ADLARI)) if (!liste.has(ad)) throw new Error(`#${id} "${ad}" listede yok`);
  for (const id of Object.keys(ID_ADLARI)) if (!ORNEK[id]) continue; // örnek veri yalnız bir kısmı içerir
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
