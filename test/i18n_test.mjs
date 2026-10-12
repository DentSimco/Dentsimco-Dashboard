// DentSimco — çeviri katmanı sınamaları (sözlük kuralları, örnek cümleler, sinyal kartının tamamı).
// Çalıştırma: node test/i18n_test.mjs

import EN from '../public/dil-en.js';
import { sozlukDerle, cevirMetin, DIL, LOCALE, DILLER } from '../public/i18n.js';
import { signalCard } from '../public/sinyal.js';
import { BINA_ADLARI, BINA_ADLARI_EN, binaAdi } from '../public/adlar.js';
import { UPDATES } from '../public/hakkinda.js';
import { MALZEMELER } from '../public/hesap-insaat.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
const eq = (a, b, label = '') => { if (a !== b) throw new Error(`${label} beklenen «${b}», bulunan «${a}»`); };
const d = sozlukDerle(EN);
const en = (s) => cevirMetin(s, d, 'en');
const TR = /[çğıöşüÇĞİÖŞÜ]/;

test('Sınamada (tarayıcı yok) kaynak dil Türkçe: mevcut testlerin çıktısı değişmez', () => {
  eq(DIL, 'tr');
  eq(LOCALE, 'tr-TR');
  eq(DILLER[0][0], 'tr');
});

test('Tam eşleşme; baştaki ve sondaki boşluk korunur; bilinmeyen metin aynen kalır', () => {
  eq(en('Ürün seç'), 'Choose a product');
  eq(en('  14 gün beklentisi '), '  14-day expectation ');
  eq(en('Riser'), 'Riser');
  eq(en('$15.94'), '$15.94');
});

test('Kalıp: değişen parça da çevrilir, seçenekli parça yalnız seçeneklerden biri olur', () => {
  eq(en('Son nokta: 7 Eki 12:30'), 'Last point: 7 Eki 12:30');
  eq(en('Fiyat, yakın dönem ortalamasının belirgin biçimde üstünde'), 'Price is clearly above the recent average');
  eq(en('Fiyat, hesap fiyatının %12 yukarıda. Sinyal yeniden hesaplanıyor.'), 'The price is 12% above the calculation price. The signal is being recalculated.');
  eq(en('Fiyat, hesap fiyatının %7 aşağıda. Sinyal eski olabilir; gece yeniden hesaplanır.'), 'The price is 7% below the calculation price. The signal may be outdated; it is recalculated tonight.');
  eq(en('Son işlem 9 h ago. Fiyat eski olabilir; sinyal gün sonu verisine dayanıyor.'), 'Last trade 9 h ago. The price may be stale; the signal is based on end-of-day data.');
  eq(en('Sezona 5 gün var (Oct 6 – Nov 9). Sezonda fiyat primi var.'), '5 days until the season (Oct 6 – Nov 9). Prices carry a premium in season.');
});

test('Yüzde işareti İngilizcede sayıdan sonra gelir', () => {
  eq(en('(belirsizlik ±%5)'), '(uncertainty ±5%)');
  eq(en('+\u2060%12'), '+\u206012%');
  eq(cevirMetin('(belirsizlik ±%5)', null, 'tr'), '(belirsizlik ±%5)', 'Türkçe değişmez');
});

test('Çeviri kararlı: İngilizce sonuç yeniden çevrilince değişmez (sayfa izleyicisi döngüye girmez)', () => {
  for (const v of Object.values(EN)) {
    if (/\{\d+\}/.test(v)) continue;
    eq(en(v), v.replace(/%(\d)/g, '$1%'), `«${v}»`);
  }
});

test('Her kalıpta Türkçe ve İngilizce taraf aynı yer tutucuları taşır', () => {
  for (const [k, v] of Object.entries(EN)) {
    const a = [...k.matchAll(/\{(\d+)(?::[^}]*)?\}/g)].map((m) => m[1]).sort().join();
    const b = [...v.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join();
    eq(b, a, `«${k}»`);
  }
});

// Sinyal kartının her hâlindeki bütün yazılar (metin ve title/aria-label) İngilizceye çevrilmeli
const products = { 5: { id: 5, name: 'Riser', building: 'Y' } };
const doc = (e) => ({
  t: Date.now() - 30 * 60_000, tn: Date.now() - 30 * 60_000, gun: '2026-10-06', makro: { m7: 1.2 },
  karne: { onsel: { b1: [300, 0.3, -0.03], b2: [400, 0.4, -0.01], b3: [900, 0.5, 0], b4: [380, 0.62, 0.012], b5: [290, 0.71, 0.03] }, canli: {} },
  urun: { 5: { 0: { u: 5, ...e } } },
});
const parcalar = (html) => {
  const out = [];
  for (const m of html.matchAll(/\b(?:title|aria-label)="([^"]*)"/g)) out.push(m[1]);
  for (const s of html.replace(/<[^>]*>/g, '\n').split('\n')) if (s.trim()) out.push(s.replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
  return out;
};
const now = Date.now();
const durumlar = [
  ['satış ertele', { e: 19, s: ['TUT', 2], a: ['STOKLA', 1], p: 900, l: 1, r: ['p-2', 'mk+', 'sp-', 'kr-'], k: 2.5, m: 8 }, [900, 0, 0, 0, now - 600_000]],
  ['hemen sat, fiyat oynadı', { e: -12, s: ['HSAT', 3], a: ['BEKLE', 2], p: 100, l: 1, g: 1, r: ['p+3', 'c+1', 'mc'], m: -12 }, [112, 0, 0, 0, now - 600_000]],
  ['normal, bayat', { e: 1, s: ['SAT', 0], a: ['AL', 1], p: 50, l: 1, r: ['c-2', 'bz'], m: 2 }, [50, 0, 0, 0, now - 9 * 3_600_000]],
  ['ince piyasa, %7 düştü', { e: 6, s: ['TUT', 1], a: ['AL', 0], p: 50, l: 0, r: ['p-1'] }, [46.5, 0, 0, 0, now - 600_000]],
  ['resell', { e: 9, s: ['TUT', 1], a: ['STOKLA', 2], p: 2000, l: 1, t: 1, r: ['mk-'] }, null],
];
for (const [ad, e, canli] of durumlar) {
  test(`Sinyal kartı İngilizcede tamamen çevrilir: ${ad}`, () => {
    const html = signalCard(doc(e), { id: 5, q: 0, products, realm: 0, live: canli || undefined, now });
    const kalan = parcalar(html).map(en).filter((s) => TR.test(s));
    if (kalan.length) throw new Error(`çevrilmeyen: ${kalan.slice(0, 4).join(' | ')}`);
  });
}

test('Bina adları: her harfin İngilizcesi var; Türkçe modda Türkçe ad döner', () => {
  eq(Object.keys(BINA_ADLARI_EN).sort().join(), Object.keys(BINA_ADLARI).sort().join());
  eq(binaAdi('P'), 'Tarla');
  eq(BINA_ADLARI_EN.P, 'Farm');
  eq(BINA_ADLARI_EN.h, 'Physics laboratory');
  eq(binaAdi('?', 'Mağaza'), 'Mağaza ?');
});

// ---- Adım B: Kâr Hesaplayıcı kalıpları ----
test('Liste hâlindeki metin parça parça çevrilir', () => {
  eq(en('Yönetim 64 · Muhasebe 10 · İletişim 18 · Bilim 9'), 'Management 64 · Accounting 10 · Communication 18 · Science 9');
  eq(en('Girdi alımları %89, Bina maaşları %2'), 'Input purchases 89%, Building wages 2%');
});
test('Yapısal kalıp hiçbir şey çevirmiyorsa sıradaki kalıba geçilir', () => {
  eq(en('• Vergi (muhasebe ücreti) kâra dahil değil; nakde bağlıdır. Günlük vergi ve muhasebecinin değeri bu sayfadaki Yönetim ve vergi kartında.'),
    '• Tax (accounting fee) is not part of profit; it depends on cash. The daily tax and the value of the accountant are on the Management and tax card on this page.');
  eq(en('• Ekonomi fazı: Durgunluk (otomatik). Etkin olay: Orange juice +%27.'), '• Economic phase: Recession (automatic). Active event: Orange juice +27%.');
  eq(en('Ekonomi fazı: Büyüme.'), 'Economic phase: Boom.');
});
test('Seçenek listeleri ve önekler', () => {
  eq(en('Q5 · fiyat yok'), 'Q5 · no price');
  eq(en('Apples — talep verisi yok'), 'Apples — no demand data');
  eq(en('· maaş tasarrufu'), '· wage savings');
  eq(en('Ekip Yönetim sekmesinde girilir; bu plandaki binalar için hesaplanır. Henüz yönetici yok.'),
    'The team is entered on the Management tab; this is calculated for the buildings in this plan. No executives yet.');
});


// ---- Adım C: Hakkımızda ve İnşaat ----
test('Hakkımızda: her güncelleme tarihi ve maddesinin İngilizcesi var (yeni madde eklenince sözlüğe de yazılmalı)', () => {
  const eksik = [];
  for (const u of UPDATES) for (const s of [u.date, ...u.items]) if (en(s) === s || TR.test(en(s))) eksik.push(s.slice(0, 60));
  if (eksik.length) throw new Error(`sözlükte yok: ${eksik.join(' | ')}`);
});
test('İnşaat: malzeme adları ve iç içe kalıplar', () => {
  eq(MALZEMELER.map((m) => en(m.ad)).join(', '), 'Reinforced concrete, Bricks, Planks, Construction units');
  eq(en('Betonarme Blok depo stoğu'), 'Reinforced concrete warehouse stock');
  eq(en('Tuğla birim fiyatı'), 'Bricks unit price');
  eq(en('1.200 (sayılmıyor)'), '1.200 (not counted)');
  eq(en('VWAP (yedek)'), 'VWAP (fallback)');
  eq(en('Son işlem (yedek)'), 'Last trade (fallback)');
  eq(en('Alınacak = gerekli − depo stoğu − hurdadan gelen. Kalite fark etmez, Q0 yeterlidir.'), 'To buy = required − warehouse stock − from scrap. Quality does not matter; Q0 is enough.');
});

test('Ürün seçici seçeneği: ürün adı ve talep düzeyi birlikte çevrilir', () => {
  eq(en('Elma suyu — Düşük talep'), 'Elma suyu — Low demand');
  eq(en('Elma suyu — Çok düşük talep'), 'Elma suyu — Very low demand');
  eq(en('Elma suyu — talep verisi yok'), 'Elma suyu — no demand data');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
