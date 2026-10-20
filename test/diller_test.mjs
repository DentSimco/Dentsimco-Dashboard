// node test/diller_test.mjs — oyunun dilleri: her dil-xx.js sözlüğü dil-en.js ile uyumlu mu, ürün ve bina adları tam mı,
// tarayıcıda o dil seçilince sayfa gerçekten o dile geçiyor mu.
// Eksik çeviri hata değildir (o metin İngilizce görünür); uyarı olarak yazılır. Bozuk yer tutucu, HTML etiketi,
// Türkçe harf ya da kendini yeniden çeviren (kararsız) metin hatadır.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import EN, { URUNLER as EN_URUN } from '../public/dil-en.js';
import { DILLER, sozlukDerle, cevirMetin, tarayiciDili, profilAdresi } from '../public/i18n.js';
import { BINA_ADLARI } from '../public/adlar.js';
import { URUN_NO, urunAdi } from '../public/urun-adlari.js';

const PUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
const eq = (a, b, label = '') => { if (a !== b) throw new Error(`${label} beklenen «${b}», bulunan «${a}»`); };
const ph = (s) => [...String(s).matchAll(/\{(\d+)(?::[^}]*)?\}/g)].map((m) => m[1]).sort().join();
const tags = (s) => [...String(s).matchAll(/<\/?[a-z]+/gi)].map((m) => m[0]).join();
const yuzde = (s) => s.replace(/%(⁠?)(\d+(?:[.,]\d+)*)/g, '$1$2%');

const KODLAR = DILLER.map(([k]) => k).filter((k) => k !== 'tr' && k !== 'en');
const DOSYALAR = readdirSync(PUB).filter((f) => /^dil-[a-z-]+\.js$/.test(f)).map((f) => f.slice(4, -3)).filter((k) => k !== 'en');
const MOD = {};
for (const k of KODLAR) MOD[k] = await import(pathToFileURL(path.join(PUB, `dil-${k}.js`)).href);
const URUN_IDLER = Object.keys(EN_URUN).map(Number);

test('Dil listesi oyunun 13 diliyle aynı; her dilin dosyası var, fazladan dosya yok', () => {
  eq(DILLER.map(([k]) => k).join(), 'tr,en,de,fr,pt,it,es,cs,zh-cn,zh-tw,pl,ru,ja');
  eq([...DOSYALAR].sort().join(), [...KODLAR].sort().join());
});

for (const k of KODLAR) {
  const XX = MOD[k].default;
  test(`${k}: anahtarlar, yer tutucular, HTML etiketleri ve baş/son boşluk dil-en.js ile uyumlu`, () => {
    const bozuk = [];
    for (const key of Object.keys(XX)) {
      if (!(key in EN)) { bozuk.push(`fazla anahtar «${key.slice(0, 40)}»`); continue; }
      const v = XX[key], e = EN[key];
      if (ph(v) !== ph(e)) bozuk.push(`yer tutucu «${key.slice(0, 40)}»`);
      if (tags(v) !== tags(e)) bozuk.push(`etiket «${key.slice(0, 40)}»`);
      if (v.match(/^\s*/)[0] !== e.match(/^\s*/)[0] || v.match(/\s*$/)[0] !== e.match(/\s*$/)[0]) bozuk.push(`boşluk «${key.slice(0, 40)}»`);
      if (/[ğıİşŞĞ]/.test(v)) bozuk.push(`Türkçe harf «${v.slice(0, 40)}»`);
    }
    if (bozuk.length) throw new Error(bozuk.slice(0, 5).join('; '));
    const eksik = Object.keys(EN).filter((key) => !(key in XX));
    if (eksik.length) console.log(`  ! ${k}: ${eksik.length} metin çevrilmemiş, İngilizce görünecek (ilk: «${eksik[0].slice(0, 50)}»)`);
  });
  test(`${k}: çeviri kararlı (çevrilmiş metin sayfa izleyicisinde yeniden çevrilmez)`, () => {
    const d = sozlukDerle({ ...EN, ...XX });
    const kararsiz = Object.values(XX).filter((v) => !/\{\d+\}/.test(v) && cevirMetin(v, d, k) !== yuzde(v));
    if (kararsiz.length) throw new Error(kararsiz.slice(0, 3).map((v) => `«${v}» → «${cevirMetin(v, d, k)}»`).join('; '));
  });
  test(`${k}: oyunun 151 ürün adı ve bütün bina adları var`, () => {
    const u = MOD[k].URUNLER || {};
    const b = MOD[k].BINALAR || {};
    const eksikU = URUN_IDLER.filter((id) => !u[id]);
    const eksikB = Object.keys(BINA_ADLARI).filter((l) => !b[l]);
    if (eksikU.length || eksikB.length) throw new Error(`ürün ${eksikU.join(',')} · bina ${eksikB.join(',')}`);
  });
}

test('Türkçe ürün adı → ürün no tablosu 151 ürünün hepsini bir kez içerir', () => {
  const nolar = Object.values(URUN_NO);
  eq(new Set(nolar).size, nolar.length, 'tekil');
  eq([...nolar].sort((a, b) => a - b).join(), [...URUN_IDLER].sort((a, b) => a - b).join());
});

test('Ürün adı seçili dilin tablosundan; ürün numarası tanınmazsa Türkçe adından bulunur', () => {
  const de = MOD.de.URUNLER;
  eq(urunAdi(72, 'Şekerkamışı', de), de[72]);
  eq(urunAdi(900, 'Bal kabağı', de), de[URUN_NO['Bal kabağı']], 'sahte numara, Türkçe ad');
  eq(urunAdi(9999, 'Şeker kamışı', de), de[72], 'yazım farkı');
  eq(urunAdi(9999, 'Bilinmeyen ürün', de), 'Bilinmeyen ürün');
  eq(urunAdi(72, 'Şekerkamışı'), 'Şekerkamışı', 'Türkçe (sınamada kaynak dil)');
});

test('Tarayıcı dili sitedeki dile eşlenir; desteklenmeyen dilde İngilizce', () => {
  eq(tarayiciDili('de-AT'), 'de');
  eq(tarayiciDili('pt-BR'), 'pt');
  eq(tarayiciDili('zh-CN'), 'zh-cn');
  eq(tarayiciDili('zh-Hant-HK'), 'zh-tw');
  eq(tarayiciDili('zh-TW'), 'zh-tw');
  eq(tarayiciDili('tr-TR'), 'tr');
  eq(tarayiciDili('ko-KR'), 'en');
  eq(tarayiciDili(''), 'en');
});

test('Şirket profili: oyunun dil öneki (/de/, /zh-cn/ …); İngilizcede önek yok', () => {
  eq(profilAdresi('de'), 'https://www.simcompanies.com/de/company/0/Dentium-Citrosuco/');
  eq(profilAdresi('zh-cn'), 'https://www.simcompanies.com/zh-cn/company/0/Dentium-Citrosuco/');
  eq(profilAdresi('en'), 'https://www.simcompanies.com/company/0/Dentium-Citrosuco/');
});

// Tarayıcıdaki gibi: dil seçimi kayıtlıyken modüller ayrı bir süreçte yüklenir (dil, modül yüklenirken bir kez okunur)
function tarayicida(dil, kod) {
  const giris = `globalThis.document = { documentElement: {} };
globalThis.localStorage = { getItem: (k) => (k === 'dentsimco.dil' ? ${JSON.stringify(dil)} : null), setItem() {} };
const P = ${JSON.stringify(pathToFileURL(PUB).href)};
const I = await import(P + '/i18n.js');
const U = await import(P + '/urun-adlari.js');
const A = await import(P + '/adlar.js');
const out = await (async () => { ${kod} })();
console.log(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', giris], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${dil}: ${(r.stderr || '').trim().split('\n').slice(-3).join(' ')}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

for (const k of ['de', 'zh-tw', 'ja']) {
  test(`Tarayıcıda ${k}: arayüz, ürün ve bina adları o dilde`, () => {
    const o = tarayicida(k, "return { dil: I.DIL, yerel: I.LOCALE, borsa: I.t('Borsa'), urun: U.urunAdi(72, 'Şekerkamışı'), bina: A.binaAdi('E'), dakika: I.t('5 dk önce') };");
    const M = MOD[k];
    eq(o.dil, k);
    eq(o.yerel, { de: 'de-DE', 'zh-tw': 'zh-TW', ja: 'ja-JP' }[k]);
    eq(o.borsa, M.default.Borsa);
    eq(o.urun, M.URUNLER[72]);
    eq(o.bina, M.BINALAR.E);
    eq(o.dakika, M.default['{0} dk önce'].replace('{0}', '5'));
  });
}

test('Tarayıcıda es: oyun adı "Masa" (Hamur) Türkçe "Masa" anahtarıyla çevrilmez; anahtarın kendisi t() ile çevrilir', () => {
  const o = tarayicida('es', "return { urun: I.sayfaMetni('Masa'), masa: I.t('Masa') };");
  eq(o.urun, 'Masa');
  eq(o.masa, MOD.es.default.Masa);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
