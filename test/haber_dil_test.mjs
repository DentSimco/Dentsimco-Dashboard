// node test/haber_dil_test.mjs — Haberler şeridi ve grafik başlığındaki ürün adı seçili dile uyar.
// Node'da dil Türkçe sabittir; tarayıcıdaki gibi İngilizce seçimi için document ve localStorage taklit edilir
// ve modüller bundan SONRA içe aktarılır (dil, modül yüklenirken bir kez okunur).
import assert from 'node:assert/strict';

globalThis.document = { documentElement: {} };
globalThis.localStorage = { getItem: (k) => (k === 'dentsimco.dil' ? 'en' : null), setItem() {} };

const { DIL } = await import('../public/i18n.js');
assert.equal(DIL, 'en', 'sınama düzeneği İngilizce açtı');
const { haberUrunAdi } = await import('../public/haberler.js');

// Haber botu adı Türkçe yazar; İngilizcede oyundaki İngilizce ad görünür
assert.equal(haberUrunAdi(900, 'Bal kabağı'), 'Pumpkin');
assert.equal(haberUrunAdi(901, 'Cadı kostümü'), 'Witch costume');
assert.equal(haberUrunAdi(72, 'Şekerkamışı'), 'Sugarcane', 'kimliği bilinen ürün');
assert.equal(haberUrunAdi(4, 'Portakal'), 'Oranges');
// Bilinmeyen ürün adı olduğu gibi kalır; boş ad bozmaz
assert.equal(haberUrunAdi(99999, 'Bilinmeyen ürün'), 'Bilinmeyen ürün');
assert.equal(haberUrunAdi(99999, null), null);
console.log('haber_dil_test: tamam');
