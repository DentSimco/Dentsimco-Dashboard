// DentSimco — Optimum Seviye sınamaları: hesap motoru (optimum-hesap.js) ve sayfa metni (optimum.js). Ağa bağlanmaz.
// Çalıştırma: node test/optimum_test.mjs
// Not: gece özetini yazan sinyal/optimum.mjs'in sınamaları sinyal/optimum_test.mjs'tedir (yayın iş akışı sinyal/ klasörünü çekmez).

import { readFileSync } from 'node:fs';
import * as H from '../public/hesap.js';
import * as O from '../public/optimum-hesap.js';
import { sayfaHtml, uyarilarHtml, kontratHtml, okuKontrat, R2_HTML } from '../public/optimum.js';
import EN from '../public/dil-en.js';
import { sozlukDerle, cevirMetin } from '../public/i18n.js';
import { BINA_ADLARI_EN } from '../public/adlar.js';
import { products, buildings, core, modifiers, NOW } from './veri-ornek.mjs';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
const eq = (actual, expected, label = '') => { if (actual !== expected) throw new Error(`${label} beklenen ${expected}, bulunan ${actual}`); };
const eqj = (actual, expected, label = '') => eq(JSON.stringify(actual), JSON.stringify(expected), label);
const near = (actual, expected, label = '', tol = 1e-9) => {
  if (!(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)))) throw new Error(`${label} beklenen ${expected}, bulunan ${actual}`);
};
const SAAT = 3_600_000;

// ---- Kâr modeli ----
const x0 = { a: 1000, b: 400, w: 100, pazar: 40 }; // g = 600 $/sa, pay %25 → pazar sınırı 10 seviye

test('Günlük kâr: seviye başına brüt kâr − maaş − yönetim giderinin şirkete eklediği', () => {
  near(O.gunlukKar(5, x0, { s: 0, pay: 0.25 }), 24 * (5 * 600 - 500 * (1 + 4 / 170)));
  eq(O.gunlukKar(0, x0, { s: 0, pay: 0.25 }), 0);
  // diğer binalar (Lo seviye, Wo $/sa taban maaş): eklenen her seviye onların yönetim giderini de artırır
  const k = 0.5 / 170;
  near(O.gunlukKar(3, x0, { s: 0.5, pay: 0.25, Lo: 100, Wo: 5000 }), 24 * (3 * 600 - ((5000 + 300) * (1 + 102 * k) - 5000 * (1 + 99 * k))));
});

test('Pazarı aşan seviye boşta kalır: üretmez, girdi ve maaş ödemez, yalnız yönetim giderine girer', () => {
  near(O.gunlukKar(12, x0, { s: 0, pay: 0.25 }), 24 * (10 * 600 - 1000 * (1 + 11 / 170)));
  if (!(O.gunlukKar(12, x0, { s: 0, pay: 0.25 }) < O.gunlukKar(10, x0, { s: 0, pay: 0.25 }))) throw new Error('fazla seviye kârı artırmamalı');
});

test('En iyi seviye, 0 … pazar sınırı + 5 aralığındaki her tam sayı seviyeyle aynı kârı bulur (3000 rastgele durum)', () => {
  let seed = 20261013;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let hata = 0;
  let ornek = '';
  for (let i = 0; i < 3000; i++) {
    const w = 50 + rnd() * 2000;
    const a = rnd() * 20000;
    const x = { a, b: rnd() * a, w, pazar: 1 + rnd() * 400 };
    const o = { s: [0, 0.3, 0.62, 0.9, 1][i % 5], pay: O.PAYLAR[i % 3], Lo: i % 2 ? Math.floor(rnd() * 600) : 0, Wo: i % 2 ? rnd() * 300000 : 0 };
    const r = O.optimum(x, o);
    let bL = 0;
    let bK = 0;
    for (let L = 0; L <= Math.ceil(o.pay * x.pazar) + 5; L++) {
      const v = O.gunlukKar(L, x, o);
      if (v > bK + 1e-9) { bK = v; bL = L; }
    }
    if (Math.abs(r.kar - bK) > 1e-6 * Math.max(1, bK) || r.L > Math.ceil(o.pay * x.pazar)) { hata++; ornek ||= `${JSON.stringify({ x, o })} → ${r.L}/${bL}`; }
  }
  eq(hata, 0, `uyuşmayan durum (ilk: ${ornek})`);
});

test('Sınır: pazar, yönetim gideri ya da zarar', () => {
  const p = O.optimum(x0, { s: 0.62, pay: 0.25 });
  eq(p.L, 10, 'pazar sınırlı seviye');
  eq(p.sinir, 'pazar');
  const y = O.optimum({ ...x0, pazar: 1e6 }, { s: 0, pay: 0.25 }); // L* = (500 + 100/170) ÷ (200/170) = 425,5
  near(y.Ly, 425.5);
  eq(y.sinir, 'yonetim');
  if (![425, 426].includes(y.L)) throw new Error(`yönetim sınırlı seviye 425 ya da 426 olmalı, bulunan ${y.L}`);
  const z = O.optimum({ a: 150, b: 100, w: 100, pazar: 100 }, { s: 0, pay: 0.25 }); // brüt kâr maaşın altında
  eq(z.L, 0);
  eq(z.kar, 0);
  eq(z.sinir, 'zarar');
  eq(O.optimum({ ...x0, pazar: 1 }, { s: 0, pay: 0.25 }).sinir, 'pazar', 'pazar bir seviyeden küçük');
});

// ---- Veri ----
// ---- Kontrat: iki satış kanalı ----
// ph = 1 → seviye başına günlük 24 adet. K = 480 adet/gün = 20 seviye; borsa payı = 0,25 × 40 = 10 seviye.
const xk = (net, K = 480) => ({ a: 1000, b: 400, w: 100, pazar: 40, ph: 1, kontrat: { K, pc: net, net, sv: K / 24 } });

test('Kontrat: gelir iki kanaldan, net geliri yüksek olandan başlayarak doldurulur; satılamayan seviye boşta kalır', () => {
  const k = 1 / 170;
  const o = { s: 0, pay: 0.25 };
  // kontrat daha kârlı (a = 1100 > 1000): önce kontrat 20 seviye, sonra borsa 10 seviye
  near(O.gunlukKar(25, xk(1100), o), 24 * (1100 * 20 + 1000 * 5 - 400 * 25 - 25 * 100 * (1 + 24 * k)));
  near(O.gunlukKar(40, xk(1100), o), 24 * (1100 * 20 + 1000 * 10 - 400 * 30 - 30 * 100 * (1 + 39 * k)), 'toplamı (30 sv) aşan seviye boşta');
  // borsa daha kârlı (a = 1000 > 900): önce borsa 10 seviye, sonra kontrat
  near(O.gunlukKar(25, xk(900), o), 24 * (1000 * 10 + 900 * 15 - 400 * 25 - 25 * 100 * (1 + 24 * k)));
  // kontratsız aynı satır: yalnız borsa payı (10 seviye)
  near(O.gunlukKar(25, { ...xk(1100), kontrat: null }, o), 24 * (1000 * 10 - 400 * 10 - 10 * 100 * (1 + 24 * k)));
});

test('Kontratlı en iyi seviye, tüm tam sayı seviyeler taranarak bulunanla aynı (3000 rastgele durum, iki kanal sırası)', () => {
  let seed = 20261014;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let hata = 0;
  let ornek = '';
  for (let i = 0; i < 3000; i++) {
    const ph = 0.5 + rnd() * 50;
    const net = 1 + rnd() * 100;
    const a = ph * net;
    const K = 24 * ph * (0.3 + rnd() * 300);
    const kontrat = i % 4 === 0 ? null : { K, pc: 0, net: net * (0.8 + rnd() * 0.45), sv: K / (24 * ph) };
    const x = { a, b: rnd() * a, w: 50 + rnd() * 2000, ph, pazar: 1 + rnd() * 400, kontrat };
    const o = { s: [0, 0.3, 0.62, 0.9][i % 4], pay: O.PAYLAR[i % 3], Lo: i % 2 ? Math.floor(rnd() * 600) : 0, Wo: i % 2 ? rnd() * 300000 : 0 };
    const r = O.optimum(x, o);
    const P = o.pay * x.pazar + (kontrat ? kontrat.sv : 0);
    let bK = 0;
    for (let L = 0; L <= Math.ceil(P) + 5; L++) bK = Math.max(bK, O.gunlukKar(L, x, o));
    if (Math.abs(r.kar - bK) > 1e-6 * Math.max(1, bK) || r.L > Math.ceil(P)) { hata++; ornek ||= `${JSON.stringify({ x, o })} → ${r.L} / ${r.kar} (tarama ${bK})`; }
  }
  eq(hata, 0, `uyuşmayan durum (ilk: ${ornek})`);
});

test('Kontrat sınırı: toplam satış (borsa payı + kontrat) bağlıyorsa pazar sınırlı; yönetim gideri bağlıyorsa yönetim sınırlı', () => {
  const o = { s: 0, pay: 0.25 };
  const dar = O.optimum(xk(1100, 24 * 5), o); // kontrat 5 sv + borsa 10 sv = 15
  eq(dar.sinir, 'pazar');
  if (dar.L < 14 || dar.L > 15) throw new Error(`toplam satış 15 sv: ${dar.L}`);
  const genis = O.optimum(xk(1100, 24 * 5000), { ...o }); // kontrat 5000 sv: yönetim gideri bağlar
  eq(genis.sinir, 'yonetim');
  if (!(genis.L > 100 && genis.L < 5000)) throw new Error(`yönetim sınırlı seviye: ${genis.L}`);
  const yok = O.optimum({ ...xk(1100), kontrat: null }, o);
  eq(yok.L, 10);
  if (!(O.optimum(xk(1100), o).kar > yok.kar)) throw new Error('kontrat kârı artırmalı');
});

const DOC = {
  v: 1, t: NOW - 2 * SAAT, r: 0, gun: '2026-09-28', bas: '2026-09-01', n: 28, k: 28,
  u: {
    1: { 0: [0.30, 6e6, 28], 1: [0.28, 3e6, 28], 2: [0.35, 2e6, 28], 3: [0.40, 2e6, 28] }, // Enerji (Q1 en ucuz)
    2: { 0: [0.5, 2e6, 28], 3: [0.9, 1e6, 28], 4: [3.0, 1e6, 28], 5: [0.95, 1e6, 10] }, // Su: Q4 uç fiyat (> 5 × Q0), Q5 seyrek
    3: { 0: [2.0, 500, 28] }, // Elmalar: pazar bir seviyeden küçük
    4: { 0: [1.5, 1e6, 28] }, // Portakal: sınamada mevsimlik
    13: { 0: [0.25, 1e6, 28] }, // Taşıma: girdisi (Dizel) özette yok
    44: { 0: [0.1, 3e7, 28] }, // Kum
    66: { 0: [0.2, 1e6, 28] }, // Tohum (taşıma 0,1)
    100: { 0: [5e5, 10, 28] }, // Havacılık araştırması: araştırma ürünü
    124: { 0: [12, 5e5, 28] }, // Portakal suyu: 29 Eylül'de +%27 üretim olayı
    135: { 0: [1.0, 1e5, 28] }, // Şeker: girdi olarak fiyatı var, kendi girdisi (Şekerkamışı) yok
  },
};
const data = H.normalizeData({ products, buildings, core, modifiers, realm: 0 });
const MEVSIM = new Set([4]);

test('Özet okuyucu: pencerenin yarısından azında işlem gören ya da fiyatsız kalite sayılmaz', () => {
  const oz = O.ozetOku({ k: 28, u: { 2: { 0: [0.5, 1000, 28], 1: [0.6, 500, 14], 2: [0.7, 500, 13], 3: [0, 5, 28] } } });
  eq(oz.enAz, 14);
  eqj(oz.kaliteler(2), [0, 1]);
  eq(oz.kayit(2, 2), null);
  eq(O.ozetOku(null), null);
  eq(O.ozetOku({ k: 0, u: {} }), null);
});

test('Güncel fiyat: son işlemi 6 saatten yeni canlı fiyat, yoksa 28 günlük ortalama; özette olmayan kalite hiç fiyatlanmaz', () => {
  const oz = O.ozetOku(DOC);
  const live = { t: NOW, items: { 2: [NOW, { 0: [0.45, null, 0, 0, NOW - SAAT], 3: [1.2, null, 0, 0, NOW - 7 * SAAT], 5: [1, null, 0, 0, NOW] }] } };
  const f = O.canliFiyat(oz, live, NOW);
  eqj(f(2, 0), { p: 0.45, kaynak: 'canli', lt: NOW - SAAT });
  eqj(f(2, 3), { p: 0.9, kaynak: 'ort' });
  eq(f(2, 5), null);
  eqj(O.ortFiyat(oz)(2, 0), { p: 0.5, kaynak: 'ort' });
});

test('Mevsimlik ürünler: sezonu olanlar ve mevsimlik pazarlarda satılanlar', () => {
  const raw = { 4: { id: 4, productionSeason: 'autumn' }, 5: { id: 5 }, 6: { id: 6, retailSeason: { from: 1 } }, 7: { id: 7 } };
  eqj([...O.mevsimlikUrunler(raw, { SALES: { t: [7], G: [5] } })].sort(), [4, 6, 7]);
});

const rows = O.satirlar({ data, oz: O.ozetOku(DOC), fiyat: O.ortFiyat(O.ozetOku(DOC)), mevsimlik: MEVSIM, faz: 0, kurulum: null });
const row = (id, q) => rows.find((r) => r.id === id && r.q === q);

test('Satırlar: yalnız borsada yeterli işlem gören, mevsimlik ve araştırma olmayan, girdisi fiyatlanan üretim ürünleri', () => {
  eqj(rows.map((r) => `${r.id}:${r.q}`).sort(), ['124:0', '1:0', '1:1', '1:2', '1:3', '2:0', '2:3', '44:0', '66:0'].sort());
});

test('Satırlar: girdi izin verilen en ucuz kaliteden; satış komisyon ve taşıma düşülerek', () => {
  near(row(2, 0).girdi, 0.2 * 0.28, 'Su Q0: Enerji Q1 en ucuz');
  near(row(2, 3).girdi, 0.2 * 0.35, 'Su Q3: en az Q2 Enerji');
  near(row(66, 0).net, 0.2 * (1 - H.MARKET_FEE) - 0.1 * 0.25, 'Tohum: komisyon ve taşıma');
  const su = row(2, 0);
  near(su.ph, data.products[2].perHour, 'faz 0: oyunun saatlik üretimi');
  near(su.a, su.ph * su.net);
  near(su.b, su.ph * su.girdi);
  near(su.pazar, 2e6 / 24 / su.ph, 'pazar: günlük satış ÷ 24 ÷ seviye başına üretim');
  eq(su.w, data.products[2].baseSalary);
});

test('Satırlar: ekonomi fazı, rekreasyon ve (yalnız Güncel) üretim olayı hızı değiştirir', () => {
  const oz = O.ozetOku(DOC);
  const f = O.ortFiyat(oz);
  const boom = O.satirlar({ data, oz, fiyat: f, mevsimlik: MEVSIM, faz: 2 });
  const b2 = boom.find((r) => r.id === 2 && r.q === 0);
  near(b2.ph / row(2, 0).ph, Math.pow(745 / 655, -(data.products[2].baseSalary / data.averageSalary)));
  const rek = O.satirlar({ data, oz, fiyat: f, mevsimlik: MEVSIM, kurulum: { recreation: { park: 2 } } });
  near(rek.find((r) => r.id === 2 && r.q === 0).ph / row(2, 0).ph, 1 / (1 - H.recreationBonus({ park: 2 })));
  eq(row(124, 0).olay, 0, '28 günlükte olay yok');
  const g = O.satirlar({ data, oz, fiyat: f, mevsimlik: MEVSIM, olaylar: true, simdi: NOW });
  const oj = g.find((r) => r.id === 124);
  eq(oj.olay, 27);
  near(oj.ph / row(124, 0).ph, 1.27);
});

test('Satırlar: kontrat kancası satıra kontrat net gelirini ve seviye karşılığını yazar; kontratı olan ürün pazar < 1 olsa da kalır', () => {
  const oz = O.ozetOku(DOC);
  const f = O.ortFiyat(oz);
  const kontrat = (id, q) => ({ '2:0': { K: 1e6, pc: 0.6 }, '3:0': { K: 100, pc: 2 }, '66:0': { K: 1000, pc: 0.19 } })[`${id}:${q}`] || null;
  const r = O.satirlar({ data, oz, fiyat: f, mevsimlik: MEVSIM, faz: 0, kontrat });
  const su = r.find((x) => x.id === 2 && x.q === 0);
  near(su.kontrat.net, 0.6, 'Su taşımasız: net = fiyat (komisyon yok)');
  near(su.kontrat.sv, 1e6 / 24 / su.ph, 'kontratın karşıladığı seviye');
  eq(su.kontrat.K, 1e6);
  eq(su.kontrat.pc, 0.6);
  eq(r.find((x) => x.id === 2 && x.q === 3).kontrat, null, 'başka kalite etkilenmez');
  near(r.find((x) => x.id === 66).kontrat.net, 0.19 - 0.5 * 0.1 * 0.25, 'Tohum: taşıma yarı (0,1 × 0,25 ÷ 2)');
  if (!r.find((x) => x.id === 3 && x.q === 0)) throw new Error('kontratlı ürün pazar < 1 diye atılmamalı');
  if (rows.find((x) => x.id === 3)) throw new Error('kontratsız aynı ürün pazar < 1 diye atılır');
  eq(rows.every((x) => x.kontrat === null), true, 'kontratsız satırlarda kontrat yok');
  // olaysız üretim hızı: Güncel'de olay hızı değiştirir, "mevcut üretim" yüzdesi olaysız hıza göre çevrilir
  const g = O.satirlar({ data, oz, fiyat: f, mevsimlik: MEVSIM, olaylar: true, simdi: NOW });
  const oj = g.find((x) => x.id === 124);
  near(oj.ph / oj.phTaban, 1.27);
  near(row(124, 0).phTaban, row(124, 0).ph);
});

test('Kontrat satırı okuma: adet sayı ya da yüzde, fiyat dolar ya da indirim yüzdesi; boş fiyat %3', () => {
  const c = (g, ctx) => O.kontratCoz(g, { uretim: 0, ref: 50, ...ctx });
  for (const [adet, beklenen] of [['250000', 250000], ['250.000', 250000], ['250,000', 250000], ['250k', 250000], ['1,5m', 1500000], [' 42 ', 42]]) eq(c({ adet }).K, beklenen, `adet "${adet}"`);
  near(c({ adet: '%50' }, { uretim: 500000 }).K, 250000);
  eq(c({ adet: '%50' }, { uretim: 500000 }).yuzde, 50);
  eq(c({ adet: '%50' }).hata, 'uretimYok', 'Üretim kurulumunda ürün yoksa yüzde çevrilemez');
  eq(c({ adet: '%150' }, { uretim: 1000 }).hata, 'adet');
  for (const adet of ['', 'abc', '0', '-5', '%0', '1e99']) eq(c({ adet }).ok, false, `adet "${adet}"`);
  near(c({ adet: '10', fiyat: '48' }).pc, 48);
  near(c({ adet: '10', fiyat: '$48,5' }).pc, 48.5);
  near(c({ adet: '10', fiyat: '%4' }).pc, 48, 'borsa 50, %4 indirim → 48');
  near(c({ adet: '10', fiyat: '%-2' }).pc, 51, 'eksi indirim: borsadan pahalı');
  near(c({ adet: '10' }).pc, 48.5, 'fiyat boş: %3 indirim');
  near(c({ adet: '10', fiyat: '  ' }).pc, 48.5);
  for (const fiyat of ['abc', '0', '%120', '%-60', '-3']) eq(c({ adet: '10', fiyat }).hata, 'fiyat', `fiyat "${fiyat}"`);
});

// ---- Şirket ----
const EKIP = [{ name: 'A', position: 'o', salary: 200000, skills: { coo: 70, cfo: 10, cmo: 10, cto: 10 }, active: true }];
const COMPANY = { executives: EKIP, finance: { bankLevel: 0 }, admin: { totalLevels: 326, wagesDay: 2_600_000 } };
const KURULUM = {
  buildings: [
    { type: 'W', product: 2, level: 20 },
    { type: 'W', product: 2, level: 20 },
    { type: 'W', product: 2, level: 10, robots: true },
    { type: 'P', product: 66, level: 5, count: 1, construction: true },
  ],
  recreation: {},
};

test('Şirket özeti: yönetici tasarrufu, taban maaş ve Üretim kurulumundaki kendi binalar', () => {
  const s = O.sirketOzeti({ company: COMPANY, kurulum: KURULUM, data });
  near(s.s, H.teamEffects(EKIP, { bankLevel: 0 }).adminSavingsPct / 100);
  if (!(s.s > 0)) throw new Error('COO tasarrufu sıfır olmamalı');
  eq(s.ekipVar, true);
  eq(s.sirketVar, true);
  eq(s.toplamSeviye, 326);
  near(s.tabanMaasSaat, 2_600_000 / (1 + H.grossOverhead(326) * (1 - s.s)) / 24, 'girilen maaş yönetim gideri dahil');
  eq(s.kendi.W.seviye, 50);
  near(s.kendi.W.maas, 345 * 40 + 345 * 10 * H.ROBOT_WAGE_FACTOR);
  eq(s.kendi.W.bina, 3);
  eq(s.kendi.P.seviye, 5, 'inşaattaki binanın seviyesi sayılır');
  eq(s.kendi.P.maas, 0, 'inşaattaki bina maaş ödemez');
  const d = O.digerleri(s, 'W');
  eq(d.Lo, 276);
  near(d.Wo, s.tabanMaasSaat - s.kendi.W.maas);
  eqj(O.digerleri(O.sirketOzeti({ company: null, kurulum: null, data }), 'W'), { Lo: 0, Wo: 0 });
  const bos = O.sirketOzeti({ company: null, kurulum: null, data });
  eq(bos.s, 0);
  eq(bos.ekipVar, false);
  eq(bos.sirketVar, false);
});

test('Büyük şirkette öneri düşer: diğer binaların maaşı yönetim gideriyle birlikte büyür', () => {
  const x = { ...x0, pazar: 1e6 };
  const tek = O.optimum(x, { s: 0.5, pay: 0.25 });
  const buyuk = O.optimum(x, { s: 0.5, pay: 0.25, Lo: 300, Wo: 100000 });
  if (!(buyuk.L < tek.L)) throw new Error(`tek bina ${tek.L}, büyük şirket ${buyuk.L}`);
});

// ---- Öneriler ----
const R = (id, harf, a, pazar = 1000) => ({ id, q: 0, harf, a, b: 0, w: 100, g: a, pazar });

test('Bina önerileri: her bina türünde en kârlı ürün, kâra göre sıralı', () => {
  const b = O.binaOnerileri([R(1, 'W', 1000), R(2, 'W', 1200), R(3, 'E', 5000)], { s: 0, pay: 0.25 });
  eqj(b.map((x) => [x.harf, x.en.x.id]), [['E', 3], ['W', 2]]);
  eqj(b[1].secenekler.map((y) => y.x.id), [2, 1]);
  const u = O.urunOnerileri([R(1, 'W', 1000), R(2, 'W', 1200)], { s: 0, pay: 0.25 });
  eqj(u.map((x) => x.id), [2, 1]);
});

test('Güncel: 28 günlük öneriye göre aynı, değiştir (belirgin fark) ya da yakın (küçük fark)', () => {
  const o = (L) => ({ s: 0, pay: 1, seviye: () => ({ L, kaynak: 'oneri' }), oneri: () => ({ id: 1, q: 0 }) });
  const ayni = O.guncelOneriler([R(1, 'W', 1000)], o(10))[0];
  eq(ayni.durum, 'ayni');
  const yakin = O.guncelOneriler([R(1, 'W', 1000), R(2, 'W', 1010)], o(10))[0]; // fark 24 × 10 × 10 = $2.400 < %5
  eq(yakin.en.x.id, 2);
  near(yakin.fark, 2400, 'fark', 1e-6);
  eq(yakin.durum, 'yakin');
  const degistir = O.guncelOneriler([R(1, 'W', 1000), R(3, 'W', 1100)], o(10))[0]; // fark $24.000 > %5
  eq(degistir.durum, 'degistir');
  const kucuk = O.guncelOneriler([R(1, 'W', 10), R(2, 'W', 13)], o(10))[0]; // fark $720 < $1.000
  eq(kucuk.durum, 'yakin', 'küçük binada $1.000 alt sınırı');
  const bir = O.guncelOneriler([R(1, 'W', 1000)], o(0))[0];
  eq(bir.hesapL, 1, 'önerilmeyen bina bir seviye için gösterilir');
  eq(O.guncelOneriler([R(1, 'W', 1000, 20)], { ...o(10), pay: 0.25 })[0].pazarAsimi, true, 'seviye pazar payından büyük');
  eq(O.guncelOneriler([R(1, 'W', 1000, 38)], { ...o(10), pay: 0.25 })[0].pazarAsimi, false, 'yukarı yuvarlanmış pazar sınırı (9,5 → 10) uyarı vermez');
});

test('Faz seçimi ve özetin yaşı', () => {
  eq(O.fazSec('auto', { index: 2 }), 2);
  eq(O.fazSec('auto', null), 0);
  eq(O.fazSec(1, { index: 2 }), 1);
  eq(O.ozetEskiMi({ t: NOW - 37 * SAAT }, NOW), true);
  eq(O.ozetEskiMi({ t: NOW - 35 * SAAT }, NOW), false);
});

// ---- Sayfa ----
const PREFS = { tab: 'ay', faz: 'auto', pay: 0.25 };
const st = (o = {}) => {
  const s = O.sayfaDurumu({ data, mevsimlik: MEVSIM, ozet: DOC, live: null, company: null, kurulum: null, gamePhase: { index: 0, expired: false }, prefs: PREFS, simdi: NOW, ...o });
  s.acik = new Set();
  return s;
};
const ad = { urun: () => 'Riser', bina: (h) => BINA_ADLARI_EN[h] || `Building ${h}`, kaliteli: (id) => H.hasQuality(data.products[id]) };

test('Yönetici girilmemişse sayfa Yönetim › Ekip uyarısı verir; şirket girilmemişse binalar uyarısı', () => {
  const h = uyarilarHtml(st());
  if (!h.includes('role="alert"') || !h.includes('href="#yonetim/ekip"') || !h.includes('Yönetim bilgilerinizi girin')) throw new Error('yönetim uyarısı yok');
  if (!h.includes('href="#uretim/binalar"')) throw new Error('binalar uyarısı yok');
  eq(uyarilarHtml(st({ company: COMPANY, kurulum: KURULUM })), '', 'ekip ve şirket girilince uyarı yok');
  const yalnizEkip = uyarilarHtml(st({ company: { executives: EKIP } }));
  if (yalnizEkip.includes('#yonetim/ekip') || !yalnizEkip.includes('#uretim/binalar')) throw new Error('yalnız ekip girilince yalnız binalar uyarısı kalmalı');
});

test('Pazar sınırlı her önerinin kartında güvenilirlik uyarısı var', () => {
  const s = st();
  const n = s.binalar.filter((b) => b.sinir === 'pazar' && b.L > 0).length;
  if (!n) throw new Error('örnekte pazar sınırlı bina yok');
  eq(sayfaHtml(s, ad).split('Pazar sınırlı: bu öneriyi borsadaki satış hacmi belirliyor').length - 1, n);
});

test('Borsada satışı olmayan ürün ve mevsimlik ürün sayfada yok; sizin binalarınız önde', () => {
  const s = st({ company: COMPANY, kurulum: KURULUM });
  const ids = new Set(s.urunler.map((u) => u.id));
  for (const id of [3, 4, 13, 100, 135]) if (ids.has(id)) throw new Error(`ürün ${id} gösterilmemeli`);
  eq(s.binalar[0].harf, 'W');
  eq(s.guncel[0].harf, 'W');
  eq(s.guncel[0].kaynak, 'sizin');
  eq(s.guncel[0].L, 50);
});

// Kontratlı sayfa durumu: yazılanlar hem kontratlar (ham metin, prefs içinde) hem sayfaDurumu girdisi olarak verilir
const stK = (kontratlar, o = {}) => st({ kontratlar, prefs: { ...PREFS, kontrat: kontratlar }, ...o });
const bina = (s, harf) => s.binalar.find((b) => b.harf === harf);
const secenek = (s, harf, id, q) => bina(s, harf).secenekler.find((y) => y.id === id && y.q === q);

test('Kontrat: yazılan adet ve fiyat sonuca girer (seviye ve kâr artar, kart bilgisi ve satır durumu)', () => {
  const bos = secenek(st(), 'W', 2, 0);
  const s = stK([{ id: 2, q: 0, adet: '1000000', fiyat: '0,6' }]);
  const y = secenek(s, 'W', 2, 0);
  if (!(y.L > bos.L && y.kar > bos.kar)) throw new Error(`kontrat seviyeyi ve kârı artırmalı: ${bos.L} → ${y.L}`);
  eq(bos.kontrat, null);
  eq(y.kontrat.adet, 1e6);
  eq(y.kontrat.fiyat, 0.6);
  near(y.kontrat.fark, 0.2, 'kontrat fiyatı borsa fiyatından %20 yüksek (0,6 ÷ 0,5)');
  near(y.kontrat.kontratSv + y.kontrat.borsaSv, Math.min(y.L, y.kontrat.kontratSv + y.kontrat.borsaSv), 'karşılanan seviye, seviyeyi aşmaz');
  eq(secenek(s, 'W', 2, 3).kontrat, null, 'başka kalite kontrattan etkilenmez');
  eqj(s.kontratlar.map((k) => [k.i, k.id, k.q, k.durum]), [[0, 2, 0, 'ok']]);
  eq(s.kontratlar[0].adet, 1e6);
  near(s.kontratlar[0].fark, 0.2);
});

test('Kontrat: aynı ürün × kalite için birden çok satır adetçe toplanır, fiyat adetle ağırlıklı ortalama olur', () => {
  const s = stK([{ id: 2, q: 0, adet: '600000', fiyat: '0,6' }, { id: 2, q: 0, adet: '400000', fiyat: '0,5' }]);
  const k = secenek(s, 'W', 2, 0).kontrat;
  eq(k.adet, 1e6);
  near(k.fiyat, 0.56);
  eqj(s.kontratlar.map((x) => x.durum), ['ok', 'ok']);
  const tek = stK([{ id: 2, q: 0, adet: '1000000', fiyat: '0,56' }]);
  near(secenek(tek, 'W', 2, 0).kar, secenek(s, 'W', 2, 0).kar, 'iki satır = tek satır (toplam adet, ortalama fiyat)');
});

test('Kontrat: adete yüzde yazılırsa Üretim kurulumundaki mevcut üretimin yüzdesi sabit adede çevrilir', () => {
  const kur = { buildings: [{ type: 'W', product: 2, level: 100 }, { type: 'W', product: 2, level: 40, construction: true }], recreation: {} };
  const s = stK([{ id: 2, q: 0, adet: '%50', fiyat: '' }], { kurulum: kur });
  const beklenen = 0.5 * 100 * data.products[2].perHour * 24; // inşaattaki bina üretmez
  near(s.kontratlar[0].adet, beklenen);
  eq(s.kontratlar[0].yuzde, 50);
  const yarim = stK([{ id: 2, q: 0, adet: '%50', fiyat: '' }], { kurulum: { ...kur, buildings: [{ type: 'W', product: 2, level: 200 }] } });
  near(yarim.kontratlar[0].adet, 2 * beklenen, 'üretim iki katına çıkınca çevrilen adet de iki katı');
  // çevrilen adet sabittir: önerilen seviye değişse de kontrat adedi aynı kalır
  near(secenek(s, 'W', 2, 0).kontrat.adet, beklenen);
});

test('Kontrat: okunamayan satır hata durumu verir ve sonucu değiştirmez', () => {
  const bos = JSON.stringify(st().binalar);
  const durum = (g) => stK([{ id: 2, q: 0, ...g }]).kontratlar[0].durum;
  eq(durum({ adet: '%50' }), 'uretimYok');
  eq(durum({ adet: 'abc' }), 'adet');
  eq(durum({ adet: '1000', fiyat: '%120' }), 'fiyat');
  eq(stK([{ id: 2, q: 12, adet: '1000', fiyat: '' }]).kontratlar[0].durum, 'veri', 'olmayan kalite');
  eq(stK([{ id: 999, q: 0, adet: '1000', fiyat: '' }]).kontratlar[0].durum, 'veri', 'olmayan ürün');
  eq(JSON.stringify(stK([{ id: 2, q: 0, adet: 'abc' }, { id: 2, q: 0, adet: '1000', fiyat: 'x' }, { id: 999, q: 0, adet: '1' }]).binalar), bos, 'hatalı satırlar hesaba girmez');
});

test('Kontrat: Güncel sekmesi de kontratı kullanır; ürün seçeneklerinde yalnız sayfadaki ürün ve kaliteler var', () => {
  const live = { t: NOW, items: {} };
  const s = stK([{ id: 2, q: 0, adet: '5000000', fiyat: '2' }], { live });
  const g = s.guncel.find((x) => x.harf === 'W');
  eqj([g.id, g.q], [2, 0]);
  eq(g.kontrat.adet, 5e6);
  eq(typeof g.pazarAsimi, 'boolean');
  eq(s.guncel.every((x) => x.harf === 'W' || x.kontrat === null), true);
  const u = Object.fromEntries(s.urunSecenek.map((x) => [x.id, x]));
  eqj(u[2].kaliteler, [0, 3]);
  eq(u[2].ana, 0, 'ana: en çok işlem gören kalite');
  for (const id of [4, 13, 100]) if (u[id]) throw new Error(`ürün ${id} seçilemez olmalı`);
  eq(u[3], undefined, 'pazar < 1 olan ürün kontratsızken listede yok');
});

test('Özet yoksa sayfa açılır ve gece hesabını bekler; R2 geliştirme aşamasında', () => {
  const s = st({ ozet: null });
  eq(s.binalar.length, 0);
  if (!sayfaHtml(s, ad).includes('28 günlük özet henüz hesaplanmadı')) throw new Error('bekleme mesajı yok');
  if (!R2_HTML.includes('geliştirme aşamasında')) throw new Error('R2 mesajı yok');
});

// ---- Formüller gizli: hesap yalnız güçlü gizlenen dosyada, ekran yalnız sonucu görür ----
const anahtarlar = (o, izin, ad) => {
  const fazla = Object.keys(o).filter((k) => !izin.includes(k));
  if (fazla.length) throw new Error(`${ad}: ekrana ara değer gidiyor (${fazla.join(', ')})`);
};
test('Ekran yalnız sonucu görür: sayfa durumunda fiyat, girdi, saatlik üretim, pazar büyüklüğü ya da katsayı yok', () => {
  const live = { t: NOW, items: { 2: [NOW, { 0: [0.6, null, 0, 0, NOW - SAAT] }] } };
  for (const c of [{}, { company: COMPANY, kurulum: KURULUM }]) {
    const s = st({ ...c, live });
    anahtarlar(s, ['oz', 'eski', 'sirket', 'faz', 'gamePhase', 'prefs', 'simdi', 'liveT', 'binalar', 'urunler', 'guncel', 'kontratlar', 'urunSecenek', 'acik'], 'durum');
    anahtarlar(s.oz, ['t', 'gun', 'bas'], 'özet');
    anahtarlar(s.sirket, ['s', 'ekipVar', 'sirketVar', 'toplamSeviye', 'kendi'], 'şirket');
    for (const v of Object.values(s.sirket.kendi)) eq(typeof v, 'number', 'kendi binalar yalnız seviye');
    if (!s.binalar.length || !s.guncel.length) throw new Error('örnek boş');
    for (const b of s.binalar) {
      anahtarlar(b, ['harf', 'id', 'q', 'L', 'kar', 'sinir', 'kontrat', 'secenekler'], 'bina');
      for (const y of b.secenekler) anahtarlar(y, ['id', 'q', 'L', 'kar', 'sinir', 'kontrat'], 'seçenek');
    }
    for (const u of s.urunler) anahtarlar(u, ['harf', 'id', 'q', 'L', 'kar', 'sinir', 'kontrat'], 'ürün');
    for (const g of s.guncel) {
      anahtarlar(g, ['harf', 'L', 'hesapL', 'kaynak', 'id', 'q', 'kar', 'canli', 'girdiOrt', 'olay', 'kontrat', 'onerilen', 'fark', 'durum', 'pazarAsimi'], 'güncel');
      if (g.onerilen) anahtarlar(g.onerilen, ['id', 'q', 'kar'], 'güncel öneri');
    }
    for (const u of s.urunSecenek) anahtarlar(u, ['id', 'kaliteler', 'ana'], 'ürün seçeneği');
  }
  // Kontratlı durumda da yalnız kullanıcının yazdığı değerler ve sonuçlar var (borsa hacmi, seviye başına üretim vb. yok)
  const k = stK([{ id: 2, q: 0, adet: '1000000', fiyat: '0,6' }, { id: 2, q: 3, adet: '%50', fiyat: '' }, { id: 5, q: 0, adet: '1' }], { live });
  let kontratli = 0;
  const kontratKontrol = (x) => { if (x) { kontratli++; anahtarlar(x, ['adet', 'fiyat', 'fark', 'kontratSv', 'borsaSv'], 'kontrat'); } };
  for (const b of k.binalar) { kontratKontrol(b.kontrat); for (const y of b.secenekler) kontratKontrol(y.kontrat); }
  for (const u of k.urunler) kontratKontrol(u.kontrat);
  for (const g of k.guncel) kontratKontrol(g.kontrat);
  if (!kontratli) throw new Error('kontratlı sonuç yok');
  for (const x of k.kontratlar) anahtarlar(x, ['i', 'id', 'q', 'durum', 'adet', 'fiyat', 'yuzde', 'fark'], 'kontrat satırı');
});

test('Formül dosyası yayında en güçlü ayarla gizlenir; ekran dosyası yalnız sonucu ister; katsayılar dışa açılmaz', () => {
  const gizle = readFileSync(new URL('../araclar/gizle.mjs', import.meta.url), 'utf8');
  const formul = /const FORMUL = new Set\(\[([^\]]*)\]\)/.exec(gizle)?.[1] || '';
  if (!formul.includes("'optimum-hesap.js'")) throw new Error('optimum-hesap.js FORMUL listesinde değil');
  for (const k of ['GUN_PAYI', 'UC_FIYAT_KAT', 'TAZE_SA', 'ESKI_SA', 'DEGISIM_ESIGI_USD', 'DEGISIM_ESIGI_PAY', 'kOf', 'uygunMu', 'ozetYasi']) {
    if (k in O) throw new Error(`${k} dışa açık`);
  }
  // Ekran dosyası hesap motorundan yalnız sonucu ve gösterim sabitlerini ister. Kaynak metne bakar: site.yml testleri
  // gizlenmiş kopyayla da çalıştırır, orada adlar karıştığı için bu bölüm yalnız okunur kodda (ilk test turunda) denetlenir.
  const ekran = readFileSync(new URL('../public/optimum.js', import.meta.url), 'utf8');
  if (ekran.includes("import * as O from './optimum-hesap.js';")) {
    const kullanilan = [...new Set([...ekran.matchAll(/\bO\.([A-Za-z_]+)/g)].map((m) => m[1]))].sort();
    eqj(kullanilan, ['FAZ_ADLARI', 'HACIM_OYNAKLIK_PCT', 'KONTRAT_EN_COK', 'PAYLAR', 'VARSAYILAN_PAY', 'mevsimlikUrunler', 'sayfaDurumu']);
  }
});

test('Güçlü gizlenen formül dosyalarında isteğe bağlı fonksiyon çağrısı (f?.(x)) yok: gizleme aracı ?. kısmını düşürüyor', () => {
  const gizle = readFileSync(new URL('../araclar/gizle.mjs', import.meta.url), 'utf8');
  const dosyalar = [...(/const FORMUL = new Set\(\[([^\]]*)\]\)/.exec(gizle)?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (!dosyalar.includes('optimum-hesap.js')) throw new Error('FORMUL listesi okunamadı');
  for (const f of dosyalar) {
    const kaynak = readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    if (kaynak.includes('_0x')) continue; // gizlenmiş kopya (site.yml ikinci tur): yalnız okunur kodda denetlenir
    const kotu = kaynak.split('\n').map((s, i) => [i + 1, s]).filter(([, s]) => /\?\.\(/.test(s.replace(/\/\/.*$/, '')));
    if (kotu.length) throw new Error(`${f}: ?.( kullanımı (satır ${kotu.map(([i]) => i).join(', ')}); f ? f(x) : null yazın`);
  }
});

test('Sayfa yöntemi ya da ara değeri yazmaz (yalnız "DentSimco formülü")', () => {
  const live = { t: NOW, items: { 2: [NOW, { 0: [0.6, null, 0, 0, NOW - SAAT] }] } };
  const yasak = ['adet/saat', 'seviye başına', 'VWAP', 'komisyon', 'yarım taşıma', 'Kâr yalnız', 'maaşlarına', 'maaşını', '6 saat', 'en ucuz kalite'];
  // "adet/gün" yalnız kullanıcının kendi yazdığı kontratta (etiket ve satır özeti) görünebilir; borsa hacmi hiçbir yerde yazılmaz
  const kontratsiz = (html) => html.replace(/<p class="op-sonuc">[\s\S]*?<\/p>/g, '').replace(/<span class="op-chip muted">Kontrat: [^<]*<\/span>/g, '');
  for (const tab of ['ay', 'guncel']) {
    for (const c of [{}, { company: COMPANY, kurulum: KURULUM }]) {
      for (const yazilan of [[], [{ id: 2, q: 0, adet: '1000000', fiyat: '0,6' }, { id: 2, q: 3, adet: '%50', fiyat: '' }]]) {
        const s = stK(yazilan, { ...c, live, prefs: { ...PREFS, tab, kontrat: yazilan } });
        s.acik = new Set([...s.binalar.map((b) => b.harf), 'kon']);
        const html = sayfaHtml(s, ad);
        for (const y of yasak) if (html.includes(y)) throw new Error(`sayfada "${y}" geçiyor`);
        if (kontratsiz(html).includes('adet/gün')) throw new Error('kontrat dışında "adet/gün" geçiyor (borsa hacmi yazılmamalı)');
      }
    }
  }
  if (!sayfaHtml(st(), ad).includes('DentSimco formülüyle hesaplanır')) throw new Error('dipnot yok');
});

test('Kayıtlı kontrat satırları temizlenir: bozuk kayıt atılır, kalite ve metin sınırlanır, en çok 30 satır', () => {
  eqj(okuKontrat(null), []);
  const l = okuKontrat([null, 5, { id: 'x' }, { id: '124', q: 99, adet: 250000, fiyat: '%4' }, { id: 2, q: -3, adet: 'a'.repeat(100) }]);
  eq(l.length, 2);
  eqj(l[0], { id: 124, q: 12, adet: '250000', fiyat: '%4' });
  eq(l[1].q, 0);
  eq(l[1].adet.length, 24);
  eq(okuKontrat(Array.from({ length: 50 }, (_, i) => ({ id: i }))).length, O.KONTRAT_EN_COK);
});

const YAZILAN = [{ id: 2, q: 0, adet: '1000000', fiyat: '0,6' }, { id: 2, q: 3, adet: '%50', fiyat: '' }, { id: 999, q: 0, adet: '"><img src=x onerror=alert(1)>', fiyat: '' }];
test('Kontratlarım: yazılanlar kutularda, hata satırda, ekleme formunda yalnız sayfadaki ürünler; yazılar kaçışlı', () => {
  const s = stK(YAZILAN);
  s.taslak = { id: '2', q: '3', adet: '12', fiyat: '' };
  s.taslakHata = 'adet';
  s.acik = new Set(['kon']);
  const h = kontratHtml(s, ad);
  if (!/<details class="op-kon" data-ac="kon" open>/.test(h)) throw new Error('bölüm açık olmalı');
  if (!h.includes('data-kf="adet" data-i="0" value="1000000"') || !h.includes('data-kf="fiyat" data-i="0" value="0,6"')) throw new Error('yazılanlar kutularda değil');
  eq(h.split('class="op-kon-row err"').length - 1, 2, 'iki satır hatalı (Üretim yok, veri yok)');
  eq(h.split('data-act="kontratSil"').length - 1, 3, 'her satırda sil düğmesi');
  if (h.includes('<img')) throw new Error('yazılan metin kaçışsız basıldı');
  eq(h.split('<option').length - 1, 1 + s.urunSecenek.length + s.urunSecenek.find((u) => u.id === 2).kaliteler.length, 'ürün + kalite seçenekleri');
  if (!/<option value="2" selected>/.test(h) || !/<option value="3" selected>/.test(h)) throw new Error('taslakta seçili ürün ve kalite işaretli değil');
  if (!/data-kd="adet" value="12"/.test(h)) throw new Error('taslak adet yok');
  if (!/class="op-warn" role="alert"/.test(h)) throw new Error('form uyarısı yok');
  // ürün seçilmediyse kalite kutusu yok, kapalıyken details açık değil
  const k = kontratHtml({ ...stK([]), taslak: { id: '', q: '', adet: '', fiyat: '' }, acik: new Set() }, ad);
  if (k.includes('data-kd="q"') || /<details[^>]* open/.test(k)) throw new Error('boş formda kalite kutusu ya da açık bölüm var');
});

// Sayfanın her hâlindeki bütün yazılar (metin, title, aria-label) İngilizceye çevrilmeli
const d = sozlukDerle(EN);
const en = (s) => cevirMetin(s, d, 'en');
const TR = /[çğıöşüÇĞİÖŞÜ]/;
const ADLAR = new Set(['Riser', ...Object.values(BINA_ADLARI_EN)]);
const parcalar = (html) => {
  const out = [];
  for (const m of html.matchAll(/\b(?:title|aria-label)="([^"]*)"/g)) out.push(m[1]);
  for (const s of html.replace(/<[^>]*>/g, '\n').split('\n')) if (s.trim()) out.push(s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim());
  return out;
};
test('Sayfa İngilizcede tamamen çevrilir (iki sekme, uyarılar, eski özet, canlı fiyat, kontratlar ve hataları, R2)', () => {
  const live = { t: NOW - 3 * 60_000, items: { 2: [NOW, { 0: [0.6, null, 0, 0, NOW - SAAT] }], 66: [NOW, { 0: [0.3, null, 0, 0, NOW - SAAT] }] } };
  const htmls = [R2_HTML];
  const taslaklar = [[{ id: '', q: '', adet: '', fiyat: '' }, ''], [{ id: '2', q: '3', adet: '12', fiyat: '' }, 'adet'], [{ id: '', q: '', adet: '', fiyat: '' }, 'urun'], [{ id: '2', q: '', adet: '', fiyat: '' }, 'dolu']];
  const yazilanlar = [[], YAZILAN, [{ id: 2, q: 0, adet: '1000000', fiyat: '%4' }, { id: 66, q: 0, adet: '1000', fiyat: '0,19' }, { id: 2, q: 3, adet: '%50', fiyat: '' }, { id: 2, q: 0, adet: '250000', fiyat: '5' }]];
  for (const c of [{}, { company: COMPANY, kurulum: KURULUM }]) {
    for (const gamePhase of [null, { index: 0, expired: true }, { index: 1, expired: false }]) {
      for (const faz of ['auto', 2]) {
        for (const tab of ['ay', 'guncel']) {
          for (const v of [{ ozet: DOC, live }, { ozet: DOC, live: null }, { ozet: { ...DOC, t: NOW - 50 * SAAT } }, { ozet: null }]) {
            for (const [i, yazilan] of yazilanlar.entries()) {
              const s = stK(yazilan, { ...c, ...v, gamePhase, prefs: { tab, faz, pay: 0.1, kontrat: yazilan } });
              s.acik = new Set([...s.binalar.map((b) => b.harf), 'kon']);
              [s.taslak, s.taslakHata] = taslaklar[i % taslaklar.length];
              htmls.push(sayfaHtml(s, ad));
            }
          }
        }
      }
    }
  }
  const kalan = new Set();
  for (const h of htmls) {
    for (const p of parcalar(h)) {
      const t = en(p);
      const harfli = /[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(p.replace(/Riser|Q\d+/g, ''));
      if (TR.test(t) || (t === p && harfli && !ADLAR.has(p) && EN[p] !== p)) kalan.add(p);
    }
  }
  if (kalan.size) throw new Error(`çevrilmeyen: ${[...kalan].slice(0, 5).join(' | ')}`);
});

test('Menü: Optimum Seviye, Piyasa ile Kâr Hesaplayıcı arasında; modül tanımlı', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const sira = [...html.matchAll(/data-nav="([^"]+)"/g)].map((m) => m[1]);
  eqj(sira.slice(sira.indexOf('piyasa'), sira.indexOf('piyasa') + 3), ['piyasa', 'optimum', 'kar']);
  if (!/optimum: \(\) => import\('\.\/optimum\.js'\)/.test(html)) throw new Error('MODULES içinde optimum yok');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
