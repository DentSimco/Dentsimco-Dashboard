// DentSimco — Optimum Seviye sınamaları: hesap motoru (optimum-hesap.js) ve sayfa metni (optimum.js). Ağa bağlanmaz.
// Çalıştırma: node test/optimum_test.mjs
// Not: gece özetini yazan sinyal/optimum.mjs'in sınamaları sinyal/optimum_test.mjs'tedir (yayın iş akışı sinyal/ klasörünü çekmez).

import { readFileSync } from 'node:fs';
import * as H from '../public/hesap.js';
import * as O from '../public/optimum-hesap.js';
import * as RP from '../public/hesap-perakende.js';
import { sayfaHtml, uyarilarHtml, okuHesap, binaEkle, pkBinaEkle, perakendeOku, tumHtml, hesapHtml, pkHtml, uretimIslemNotu, pkIslemNotu, R2_HTML } from '../public/optimum.js';
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
    const o = { s: [0, 0.3, 0.62, 0.9, 1][i % 5], pay: O.PAYLAR[i % 4], Lo: i % 2 ? Math.floor(rnd() * 600) : 0, Wo: i % 2 ? rnd() * 300000 : 0 };
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

test('Satırlar: ekonomi fazı ve rekreasyon hızı değiştirir', () => {
  const oz = O.ozetOku(DOC);
  const f = O.ortFiyat(oz);
  const boom = O.satirlar({ data, oz, fiyat: f, mevsimlik: MEVSIM, faz: 2 });
  const b2 = boom.find((r) => r.id === 2 && r.q === 0);
  near(b2.ph / row(2, 0).ph, Math.pow(745 / 655, -(data.products[2].baseSalary / data.averageSalary)));
  const rek = O.satirlar({ data, oz, fiyat: f, mevsimlik: MEVSIM, kurulum: { recreation: { park: 2 } } });
  near(rek.find((r) => r.id === 2 && r.q === 0).ph / row(2, 0).ph, 1 / (1 - H.recreationBonus({ park: 2 })));
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


test('Faz seçimi ve özetin yaşı', () => {
  eq(O.fazSec('auto', { index: 2 }), 2);
  eq(O.fazSec('auto', null), 0);
  eq(O.fazSec(1, { index: 2 }), 1);
  eq(O.ozetEskiMi({ t: NOW - 37 * SAAT }, NOW), true);
  eq(O.ozetEskiMi({ t: NOW - 35 * SAAT }, NOW), false);
});

// ---- Sayfa ----
const PREFS = { ana: 'tum', faz: 'auto' };
const PREFS_TUM = PREFS;
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


test('Borsada satışı olmayan ürün ve mevsimlik ürün sayfada yok; sizin binalarınız önde', () => {
  const s = st({ company: COMPANY, kurulum: KURULUM, prefs: { ...PREFS_TUM } });
  const ids = new Set(s.tum.urunler.map((u) => u.id));
  for (const id of [3, 4, 13, 100, 135]) if (ids.has(id)) throw new Error(`ürün ${id} gösterilmemeli`);
  eq(s.tum.binalar[0].harf, 'W', 'sizin binanız önde');
});

// Kontratlı sayfa durumu: yazılanlar hem kontratlar (ham metin, prefs içinde) hem sayfaDurumu girdisi olarak verilir
const stK = (kontratlar, o = {}) => st({ kontratlar, prefs: { ...PREFS, kontrat: kontratlar }, ...o });
const bina = (s, harf) => s.binalar.find((b) => b.harf === harf);
const secenek = (s, harf, id, q) => bina(s, harf).secenekler.find((y) => y.id === id && y.q === q);






test('Özet yoksa sayfa açılır ve gece hesabını bekler; R2 geliştirme aşamasında', () => {
  const s = st({ ozet: null });
  eq(s.tum.binalar.length, 0);
  if (!sayfaHtml({ ...s, prefs: PREFS_TUM }, ad).includes('28 günlük özet henüz hesaplanmadı')) throw new Error('bekleme mesajı yok');
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
    anahtarlar(s, ['oz', 'eski', 'sirket', 'faz', 'gamePhase', 'prefs', 'simdi', 'liveT', 'tum', 'pk', 'acik'], 'durum');
    anahtarlar(s.oz, ['t', 'gun', 'bas'], 'özet');
    anahtarlar(s.sirket, ['s', 'ekipVar', 'sirketVar', 'toplamSeviye', 'kendi'], 'şirket');
    for (const v of Object.values(s.sirket.kendi)) eq(typeof v, 'number', 'kendi binalar yalnız seviye');
    if (!s.tum.binalar.length) throw new Error('örnek boş');
    for (const b of s.tum.binalar) {
      anahtarlar(b, ['harf', 'id', 'q', 'L', 'kar', 'sinir', 'secenekler'], 'bina');
      for (const y of b.secenekler) anahtarlar(y, ['id', 'q', 'L', 'kar', 'sinir'], 'seçenek');
    }
    for (const u of s.tum.urunler) anahtarlar(u, ['harf', 'id', 'q', 'L', 'kar', 'sinir'], 'ürün');
  }
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
    eqj(kullanilan, ['FAZ_ADLARI', 'mevsimlikUrunler', 'sayfaDurumu']);
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





const YAZILAN = [{ id: 2, q: 0, adet: '1000000', fiyat: '0,6' }, { id: 2, q: 3, adet: '%50', fiyat: '' }, { id: 999, q: 0, adet: '"><img src=x onerror=alert(1)>', fiyat: '' }];

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


// ---- Tüm Ürün Satışına Göre (pazar sınırı yok) ----
const stT = (o = {}) => st({ prefs: PREFS_TUM, company: COMPANY, kurulum: KURULUM, ...o });

test('Sınırsız satış: en iyi seviye, tüm tam sayı seviyeler taranarak bulunanla aynı; yalnız yönetim gideri bağlar', () => {
  const o = { s: 0.65, pay: O.SINIRSIZ };
  for (const x of rows) {
    for (const d of [{}, { Lo: 300, Wo: 120 * 24 }, { Lo: 20, Wo: 50 }]) {
      const e = O.optimum(x, { ...o, ...d });
      let bK = 0;
      let bL = 0;
      for (let L = 0; L <= 3000; L++) { const v = O.gunlukKar(L, x, { ...o, ...d }); if (v > bK + 1e-9) { bK = v; bL = L; } }
      if (e.L >= 3000) throw new Error(`tarama sınırı yetmedi ${x.id} Q${x.q}`);
      near(e.kar, bK, `kâr ${x.id} Q${x.q}`, 1e-6 * Math.max(1, bK));
      if (e.L > 0) eq(e.sinir === 'zarar', false);
      if (e.sinir === 'pazar') throw new Error('sınırsız satışta pazar sınırı yok');
      void bL;
    }
  }
});

test('Sınırsız satış: pazar payı ne olursa olsun, sınırsız sonuç pay %100 sonucundan az olmaz; küçük pazarlı ürün de büyür', () => {
  for (const x of rows) {
    const sinirli = O.optimum(x, { s: 0.65, pay: 1 });
    const sinirsiz = O.optimum(x, { s: 0.65, pay: O.SINIRSIZ });
    if (sinirsiz.kar < sinirli.kar - 1e-6) throw new Error(`sınırsız daha az ${x.id}`);
  }
});

test('Tüm Ürün sekmesi: sayfa durumu bina listesi, ürün listesi, seçici ve seçilen hesap verir (yalnız sonuç)', () => {
  const s = stT();
  anahtarlar(s.tum, ['binalar', 'urunler', 'secenek', 'secim', 'hesap'], 'tum');
  if (!s.tum.binalar.length || !s.tum.urunler.length || !s.tum.secenek.length) throw new Error('boş');
  for (const b of s.tum.binalar) {
    anahtarlar(b, ['harf', 'id', 'q', 'L', 'kar', 'sinir', 'kontrat', 'secenekler'], 'bina');
    if (b.sinir === 'pazar') throw new Error('pazar sınırı olmamalı');
  }
  anahtarlar(s.tum.hesap, ['harf', 'id', 'q', 'L', 'kar', 'sinir', 'son', 'yari', 'buyuk', 'kaliteler', 'islem', 'yalniz', 'ayni', 'toplamSonra'], 'hesap');
  for (const y of s.tum.hesap.kaliteler) anahtarlar(y, ['q', 'L', 'kar', 'son', 'gun'], 'kalite');
  anahtarlar(s.tum.hesap.islem, ['gun', 'pencere', 'sonT'], 'işlem');
  for (const e of s.tum.secenek) { anahtarlar(e, ['harf', 'urunler'], 'seçenek'); for (const u of e.urunler) anahtarlar(u, ['id', 'kaliteler', 'ana'], 'ürün'); }
  // özet yoksa boş ama çökmez
  const bos = st({ prefs: PREFS_TUM, ozet: null });
  eq(bos.tum.binalar.length, 0);
  eq(bos.tum.hesap, null);
});

test('Tüm Ürün sekmesi: seçilen bina × ürün × kalite için seviye, şirketin bugünkü binalarının üstüne eklenir (kaba kuvvetle doğrulandı)', () => {
  const sirket = O.sirketOzeti({ company: COMPANY, kurulum: KURULUM, data });
  let kontrolEdilen = 0;
  for (const [harf, id, q] of [['W', 2, 0], ['W', 2, 3], ['W', 1, 1]]) {
    const s = stT({ prefs: { ...PREFS_TUM, hesap: { harf, id, q } } });
    const hs = s.tum.hesap;
    if (!hs) continue; // örnek veride o bina yok
    if (hs.id !== id || hs.q !== q || hs.harf !== harf) continue; // örnekte o seçenek yok
    kontrolEdilen++;
    const x = rows.find((r) => r.id === id && r.q === q && r.harf === harf);
    const d = { s: sirket.s, pay: O.SINIRSIZ, Lo: sirket.toplamSeviye, Wo: sirket.tabanMaasSaat };
    let bK = 0;
    let bL = 0;
    for (let L = 0; L <= 5000; L++) { const v = O.gunlukKar(L, x, d); if (v > bK + 1e-9) { bK = v; bL = L; } }
    near(hs.kar, bK, 'ek kâr', 1e-6 * Math.max(1, bK));
    if (hs.L > 0) eq(hs.L, bL, 'ek seviye');
    eq(hs.toplamSonra, sirket.toplamSeviye + hs.L);
    if (hs.L >= 2) {
      if (!(hs.yari.kar <= hs.kar && hs.buyuk.kar <= hs.kar)) throw new Error('tepe noktası en yüksek olmalı');
      eq(hs.yari.L, Math.round(hs.L / 2));
      eq(hs.buyuk.L, Math.round(hs.L * 1.5));
    } else eq(hs.yari, null);
  }
  if (kontrolEdilen < 2) throw new Error('örnekte yeterli seçenek yok');
});

test('Tüm Ürün sekmesi: geçersiz ya da eksik seçim en kârlı bina, ürün ve kaliteye döner; ürün değişince geçersiz kalite düzelir', () => {
  const ilk = stT().tum;
  eq(ilk.secim.harf, ilk.secenek[0].harf);
  for (const hesap of [{}, { harf: 'ZZ' }, { harf: 'W', id: 99999 }, { harf: 'W', id: 2, q: 11 }]) {
    const t = stT({ prefs: { ...PREFS_TUM, hesap } }).tum;
    const h = t.secenek.find((e) => e.harf === t.secim.harf);
    const u = h.urunler.find((e) => e.id === t.secim.id);
    if (!u || !u.kaliteler.includes(t.secim.q)) throw new Error(`geçersiz seçim döndü ${JSON.stringify(hesap)}`);
  }
});

test('Tüm Ürün sekmesi: Üretim\'e eklenen ama şirket kaydına işlenmemiş seviyeler bir sonraki öneride hesaba girer (aynı öneri iki kez katlanmaz)', () => {
  const sec = { harf: 'W', id: 2, q: 0 };
  const a = stT({ prefs: { ...PREFS_TUM, hesap: sec } });
  const L = a.tum.hesap.L;
  if (!(L >= 1)) throw new Error('örnekte öneri yok');
  const b = stT({ prefs: { ...PREFS_TUM, hesap: sec }, ekler: [{ id: 2, L }] });
  eq(b.sirket.toplamSeviye, a.sirket.toplamSeviye + L);
  if (!(b.tum.hesap.L < L)) throw new Error('eklenen seviye ikinci önerideki seviyeyi azaltmalı');
  const c = stT({ prefs: { ...PREFS_TUM, hesap: sec }, ekler: [{ id: 2, L: 'x' }, { id: 99999, L: 3 }, null] });
  eq(c.sirket.toplamSeviye, a.sirket.toplamSeviye + 3, 'bozuk ek yok sayılır, bilinmeyen ürün yalnız seviye ekler');
});


test('Son işlem fiyatı: 28 günlük ortalaması olmayan kalite, son işlemi 28 günden yeniyse son işlem fiyatıyla fiyatlanır; yoksa fiyatsız kalır', () => {
  const oz = O.ozetOku(DOC);
  const live = { t: NOW, items: { 2: [NOW, { 6: [0.77, null, 0, 0, NOW - 2 * 24 * SAAT], 7: [0.88, null, 0, 0, NOW - 40 * 24 * SAAT], 5: [0.95, null, 0, 0, NOW - SAAT], 3: [1.1, null, 0, 0, NOW - SAAT] }] } };
  const f = O.sonFiyat(oz, live, NOW);
  eqj(f(2, 6), { p: 0.77, kaynak: 'son', lt: NOW - 2 * 24 * SAAT }, 'özette yok, son işlem 2 gün önce');
  eq(f(2, 7), null, 'son işlem 40 gün önce');
  eqj(f(2, 3), { p: 0.9, kaynak: 'ort' }, 'özette var: 28 günlük ortalama öncelikli');
  eqj(f(2, 5), { p: 0.95, kaynak: 'son', lt: NOW - SAAT }, 'özette seyrek (10 gün): son işlem');
  eq(f(2, 11), null);
  eq(O.sonFiyat(oz, null, NOW)(2, 6), null, 'canlı belge yoksa');
});

test('Tüm kaliteler: seçici özette olmayan kaliteleri de (son işlem fiyatıyla) içerir; listeler yalnız yeterli işlem gören kalitelerle kalır', () => {
  // Su Q1 ve Q2 özette yok (girdisi Enerji Q0 – Q3 var); Q5'in girdisi (Enerji Q4+) fiyatsız olduğundan hiç satır olmaz
  const live = { t: NOW, items: { 2: [NOW, { 1: [0.6, null, 0, 0, NOW - 2 * 24 * SAAT], 2: [0.7, null, 0, 0, NOW - 3 * 24 * SAAT], 5: [0.95, null, 0, 0, NOW - SAAT] }] } };
  const s = stT({ live, prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2, q: 2 } } });
  const u = s.tum.secenek.find((e) => e.harf === 'W').urunler.find((e) => e.id === 2);
  for (const q of [0, 1, 2, 3]) if (!u.kaliteler.includes(q)) throw new Error(`Q${q} seçicide yok: ${u.kaliteler}`);
  eq(s.tum.secim.q, 2, 'son işlemli kalite seçilebilir');
  eq(s.tum.hesap.son, true);
  eq(s.tum.hesap.kaliteler.find((k) => k.q === 2).son, true);
  eq(s.tum.hesap.kaliteler.find((k) => k.q === 1).son, true);
  eq(s.tum.hesap.kaliteler.find((k) => k.q === 0).son, false);
  eq(s.tum.hesap.kaliteler.find((k) => k.q === 3).son, false);
  // listeler eskisi gibi: özette yeterli işlemi olmayan Q1 ve Q2 listelerde yok
  const sirali = s.tum.binalar.find((b) => b.harf === 'W');
  for (const y of sirali.secenekler) if (y.id === 2 && (y.q === 1 || y.q === 2)) throw new Error('listede seyrek kalite olmamalı');
  // canlı belge yoksa seçici özetteki kalitelerle sınırlı
  const sade = stT({ live: null }).tum.secenek.find((e) => e.harf === 'W').urunler.find((e) => e.id === 2);
  if (sade.kaliteler.includes(2) || sade.kaliteler.includes(1)) throw new Error('son işlemi olmayan kalite seçicide olmamalı');
  // son işlem satırı: pazar büyüklüğü bilinmez (0), kaynağı 'son'
  const oz = O.ozetOku(DOC);
  const x = O.satirlar({ data, oz, fiyat: O.ortFiyat(oz), satisFiyat: O.sonFiyat(oz, live, NOW), tumKaliteler: true, mevsimlik: MEVSIM, faz: 0 }).find((r) => r.id === 2 && r.q === 2);
  if (!x || x.kaynak !== 'son' || x.pazar !== 0) throw new Error('son işlem satırı yok');
  // tumKaliteler kapalıyken satır oluşmaz (28 günlük sayfa değişmez)
  eq(O.satirlar({ data, oz, fiyat: O.ortFiyat(oz), mevsimlik: MEVSIM, faz: 0 }).some((r) => r.id === 2 && r.q === 2), false);
});

test('binaEkle: yeni satır, mevcut binaya ekleme (robotsuz önce), eşleşme yoksa yeni satır, bozuk kayıt ve seviye', () => {
  const raw = { v: 1, recreation: { park: 3 }, buildings: [
    { id: 'a', type: 'W', product: 2, quality: 0, level: 10, robots: true },
    { id: 'b', type: 'W', product: 2, quality: 0, level: 20, robots: false },
    { id: 'c', type: 'W', product: 2, quality: 3, level: 5, construction: true },
  ] };
  const e = { harf: 'W', id: 2, q: 0, L: 7 };
  const y = binaEkle(raw, e, 'yeni');
  eq(y.mod, 'yeni');
  eq(y.raw.buildings.length, 4);
  const yb = y.raw.buildings[3];
  eq(`${yb.type}|${yb.product}|${yb.level}|${yb.quality}|${yb.robots}|${yb.construction}|${yb.efficiency}`, 'W|2|7|0|false|false|100');
  if (!yb.id) throw new Error('yeni satırın kimliği yok');
  eq(y.raw.recreation.park, 3, 'diğer alanlar korunur');
  eq(raw.buildings.length, 3, 'girdi değişmez');
  const m = binaEkle(raw, e, 'mevcut');
  eq(m.mod, 'mevcut');
  eq(m.raw.buildings.map((b) => b.level).join(','), '10,27,5');
  // yalnız robotlu eşleşiyorsa o kullanılır; inşaattaki bina eşleşmez; hiç yoksa yeni satır olur
  eq(binaEkle({ buildings: [raw.buildings[0]] }, e, 'mevcut').raw.buildings[0].level, 17);
  const yok = binaEkle(raw, { harf: 'W', id: 2, q: 3, L: 4 }, 'mevcut');
  eq(yok.mod, 'yeni');
  eq(yok.raw.buildings.length, 4);
  eq(binaEkle(null, e, 'yeni').raw.buildings.length, 1);
  eq(binaEkle('bozuk', e, 'mevcut').mod, 'yeni');
  eq(binaEkle({ buildings: 'x' }, e, 'yeni').raw.buildings.length, 1);
  eq(binaEkle(raw, { ...e, L: 0 }, 'yeni'), null);
  eq(binaEkle(raw, { ...e, L: 0.9 }, 'yeni'), null);
  eq(binaEkle(raw, { ...e, L: 3.7 }, 'yeni').raw.buildings[3].level, 3);
});

test('Hesap seçimi kaydı temizlenir', () => {
  eqj(okuHesap(null), {});
  eqj(okuHesap({ harf: 'W', id: '2', q: 3 }), { harf: 'W', id: 2, q: 3 });
  eqj(okuHesap({ harf: '<script>', id: 'a', q: 99 }), { q: 12 });
  eqj(okuHesap({ harf: 5, id: null, q: '' }), {});
});

test('Üretim sayfası: iki üst sekme (Üretim, Perakende); borsa sekmesi, pazar payı ve kontrat yok; sınırsız hesap, bina kartı, ürün listesi var', () => {
  const tum = sayfaHtml(stT(), ad);
  const eski = sayfaHtml(st({ company: COMPANY, kurulum: KURULUM, prefs: { ana: 'borsa', faz: 'auto' } }), ad); // eski kayıtlı "borsa" tercihi Üretim'e döner
  for (const h of [tum, eski]) {
    if (!h.includes('data-ana="tum"') || !h.includes('data-ana="pk"')) throw new Error('üst sekmeler yok');
    if (h.includes('data-ana="borsa"') || h.includes('Borsa Satışına Göre') || h.includes('Tüm Ürün Satışına Göre')) throw new Error('eski sekme adları kalmamalı');
    if (h.indexOf('>Üretim<') > h.indexOf('>Perakende<')) throw new Error('Üretim solda olmalı');
    if (!h.includes('data-ana="tum" aria-selected="true"')) throw new Error('Üretim seçili olmalı');
    for (const x of ['Pazar payı', 'Kontratlarım', 'data-tab=', 'data-act="pay"', 'data-pay=', 'Güncel', '28 Günlük']) if (h.includes(x)) throw new Error(`sayfada ${x} olmamalı`);
  }
  for (const x of ['Satışın sınırsız ve fiyatın sabit olduğu varsayılır', 'Seviye hesapla', 'data-hs="harf"', 'data-hs="id"', 'data-act="ekle"', 'data-v="yeni"', 'data-v="mevcut"', 'Seçilen binada en kârlı', 'Bu binadaki ürünler', 'Ekonomi fazı']) if (!tum.includes(x)) throw new Error(`üretim sekmesinde ${x} yok`);
  // yalnız seçilen binanın kartı ve ürünleri listelenir
  const sT = stT();
  const harfSayisi = (h) => h.split('<article class="op-card"').length - 1 - (h.includes('class="op-card op-res"') ? 1 : 0);
  eq((tum.match(/<article class="op-card" data-harf=/g) || []).length, 1, 'tek bina kartı');
  if (!tum.includes(`data-harf="${sT.tum.secim.harf}"`)) throw new Error('seçilen binanın kartı yok');
  void harfSayisi;
  const tablo = tum.slice(tum.indexOf('Bu binadaki ürünler'));
  const ürünSatırı = (tablo.match(/<tr><th scope="row">/g) || []).length;
  eq(ürünSatırı, sT.tum.urunler.filter((u) => u.harf === sT.tum.secim.harf).length, 'yalnız seçilen binanın ürünleri');
  if (/kat(ı)?\b.*pazar|pazar büyüklüğü/i.test(tum)) throw new Error('pazar büyüklüğü kıyası olmamalı');
  if (tum.includes('Pazar sınırlı')) throw new Error('pazar sınırı uyarısı olmamalı');
});

test('Tüm Ürün hesap kartı: kalite seçici yalnız kaliteli üründe; "Mevcut binaya ekle" yalnız aynı bina, ürün ve kalite kuruluysa açık; öneri yoksa düğmeler kapalı', () => {
  const kurulu = { buildings: [{ type: 'W', product: 2, quality: 0, level: 20 }], recreation: {} };
  const a = hesapHtml(stT({ prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2, q: 0 } }, kurulum: kurulu }), ad);
  if (!a.includes('data-hs="q"')) throw new Error('kaliteli üründe kalite seçici olmalı');
  if (/data-v="mevcut"[^>]*disabled/.test(a)) throw new Error('mevcut binaya ekle açık olmalı');
  if (!a.includes('Zaten kurulu: 20 seviye')) throw new Error('kurulu seviye yok');
  const b = hesapHtml(stT({ prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2, q: 3 } }, kurulum: kurulu }), ad);
  if (!/data-v="mevcut"[^>]*disabled/.test(b)) throw new Error('kurulu bina yokken mevcut binaya ekle kapalı olmalı');
  if (!b.includes('Mevcut binaya ekle: Üretim&#39;de bu bina, ürün ve kalitede kurulu bina yok.')) throw new Error('açıklama yok');
  // eklendi iletisi ve hata
  const ok = stT({ prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2, q: 0 } } });
  ok.sonEkle = { mod: 'yeni', id: 2, q: 0, L: 7 };
  const okH = hesapHtml(ok, ad);
  if (!okH.includes('Yeni bina eklendi: Riser Q0 +7 seviye.') || !okH.includes('href="#uretim/binalar"')) throw new Error('eklendi iletisi yok');
  ok.sonEkle = { mod: 'mevcut', id: 2, q: 0, L: 7 };
  if (!hesapHtml(ok, ad).includes('Mevcut binaya eklendi: Riser Q0 +7 seviye.')) throw new Error('mevcut iletisi yok');
  ok.sonEkle = { hata: true };
  if (!hesapHtml(ok, ad).includes('Tarayıcı kaydı açık değil; eklenemedi.')) throw new Error('hata iletisi yok');
});

test('Tüm Ürün sayfası İngilizcede tamamen çevrilir (şirketli ve şirketsiz, her seçim, ekleme iletileri, özet yok)', () => {
  const htmls = [];
  for (const c of [{}, { company: COMPANY, kurulum: KURULUM }]) {
    const sonLive = { t: NOW, items: { 2: [NOW, { 1: [0.6, null, 0, 0, NOW - 2 * 24 * SAAT], 2: [0.7, null, 0, 0, NOW - 3 * 24 * SAAT] }] } };
    for (const v of [{ ozet: DOC }, { ozet: DOC, live: sonLive }, { ozet: { ...DOC, t: NOW - 50 * SAAT } }, { ozet: null }]) {
      const ilk = stT({ ...c, ...v });
      htmls.push(sayfaHtml(ilk, ad));
      for (const e of ilk.tum.secenek.slice(0, 3)) {
        for (const u of e.urunler.slice(0, 2)) {
          for (const q of u.kaliteler.slice(0, 3)) {
            const s2 = stT({ ...c, ...v, prefs: { ...PREFS_TUM, hesap: { harf: e.harf, id: u.id, q } } });
            for (const sonEkle of [null, { mod: 'yeni', id: u.id, q, L: 12 }, { mod: 'mevcut', id: u.id, q, L: 3 }, { hata: true }]) {
              s2.sonEkle = sonEkle;
              s2.acik = new Set(['tumq', ...s2.tum.binalar.map((b) => `t:${b.harf}`)]);
              htmls.push(sayfaHtml(s2, ad));
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


// ---- Perakende: mağaza × ürün × kalite için ideal seviye (satış ve alım sınırsız) ----
const PREFS_PK = { ana: 'pk', faz: 0 };
const PK_HARFLER = RP.retailLetters().filter((h) => !['r', 'B'].includes(h) && RP.buildingProducts(h, 0).length);
const PK_SAT = {};
const PK_LIVE = { t: NOW, items: {} };
for (const h of PK_HARFLER) for (const id of RP.buildingProducts(h, 0)) {
  PK_SAT[id] = 1.0;
  PK_LIVE.items[id] = [NOW, { 0: [RP.getModel(0, id, 0).c, null, 0, 0, NOW - SAAT], 1: [RP.getModel(0, id, 0).c * 1.1, null, 0, 0, NOW - SAAT] }];
}
const pkVeri = (o = {}) => ({ kurulum: { recreation: {}, salesSpeedPct: 0, buildings: [] }, saturation: PK_SAT, qualityWeight: 0.3, ...o });
const stP = (o = {}) => st({ prefs: PREFS_PK, company: COMPANY, kurulum: KURULUM, live: PK_LIVE, pk: pkVeri(), ...o });

test('Perakende: ideal seviye, tüm tam sayı seviyeler taranarak bulunanla aynı (satış sınırsız; yönetim giderini ek seviye belirler)', () => {
  const s = stP();
  const sirket = O.sirketOzeti({ company: COMPANY, kurulum: KURULUM, data });
  const d = { s: sirket.s, pay: O.SINIRSIZ, Lo: sirket.toplamSeviye, Wo: sirket.tabanMaasSaat };
  let kontrol = 0;
  for (const harf of PK_HARFLER.slice(0, 6)) {
    for (const id of RP.buildingProducts(harf, 0).slice(0, 3)) {
      const t = stP({ prefs: { ...PREFS_PK, pk: { harf, id, q: 0 } } }).pk;
      if (!t.hesap || t.hesap.harf !== harf || t.hesap.id !== id) continue;
      const r = RP.calcProduct({ economy: 0, productId: id, quality: 0, saturation: 1.0, cAct: RP.getModel(0, id, 0).c, bonusPct: t.bonus, qualityWeight: 0.3, wage: 0 });
      const w = RP.storeWage({ modelW: r.model.W, salaryModifier: data.buildings?.[harf]?.salaryModifier, averageSalary: data.averageSalary, adminNet: 0 });
      const x = { a: Math.max(0, r.marginHourPerLevel), b: 0, w, g: r.marginHourPerLevel, pazar: 0 };
      let bK = 0;
      let bL = 0;
      for (let L = 0; L <= 20000; L++) { const v = O.gunlukKar(L, x, d); if (v > bK + 1e-9) { bK = v; bL = L; } }
      near(t.hesap.kar, bK, `kâr ${harf}/${id}`, 1e-6 * Math.max(1, bK));
      if (t.hesap.L > 0) eq(t.hesap.L, bL, `seviye ${harf}/${id}`);
      eq(t.hesap.fiyat, r.price);
      kontrol++;
    }
  }
  if (kontrol < 5) throw new Error('örnekte yeterli ürün yok');
  void s;
});

test('Perakende: sayfa durumu yalnız sonuç verir; seçici, liste, ürünler ve satış bonusu', () => {
  const s = stP();
  anahtarlar(s.pk, ['liste', 'urunler', 'secenek', 'secim', 'hesap', 'bonus', 'veriYok'], 'pk');
  if (!s.pk.liste.length || !s.pk.secenek.length || !s.pk.urunler.length) throw new Error('boş');
  eq(s.pk.veriYok, false);
  for (const e of s.pk.liste) anahtarlar(e, ['harf', 'id', 'q', 'L', 'kar', 'sinir', 'fiyat'], 'liste');
  for (const e of s.pk.urunler) anahtarlar(e, ['harf', 'id', 'q', 'L', 'kar', 'sinir', 'fiyat'], 'ürün');
  anahtarlar(s.pk.hesap, ['harf', 'id', 'q', 'L', 'kar', 'sinir', 'fiyat', 'maliyet', 'sonT', 'maliyetKaynak', 'yalniz', 'yari', 'buyuk', 'kaliteler', 'ayni', 'toplamSonra'], 'hesap');
  for (const y of s.pk.hesap.kaliteler) anahtarlar(y, ['q', 'L', 'kar'], 'kalite');
  for (const e of s.pk.secenek) { anahtarlar(e, ['harf', 'urunler'], 'seçenek'); for (const u of e.urunler) anahtarlar(u, ['id', 'kaliteler', 'ana'], 'ürün seçeneği'); }
  // en kârlı mağaza başta; restoran ve satış ofisi yok
  for (let i = 1; i < s.pk.liste.length; i++) if (s.pk.liste[i].kar > s.pk.liste[i - 1].kar + 1e-9) throw new Error('liste kâra göre sıralı olmalı');
  for (const e of s.pk.liste) if (['r', 'B'].includes(e.harf)) throw new Error('restoran ve satış ofisi olmamalı');
  // satış bonusu: elle girilen + rekreasyon + yönetim ekibi (CMO)
  const b0 = stP().pk.bonus;
  const b1 = stP({ pk: pkVeri({ kurulum: { recreation: { park: 2 }, salesSpeedPct: 5, buildings: [] } }) }).pk.bonus;
  near(b1 - b0, 5 + H.recreationBonus({ park: 2 }) * 100, 'bonus farkı', 1e-9);
  // doygunluk ya da fiyat yoksa veri yok
  eq(stP({ pk: pkVeri({ saturation: {} }) }).pk.veriYok, true);
  eq(stP({ live: null }).pk.liste.length > 0, true, 'canlı fiyat yoksa Q0 modeldeki maliyetle hesaplanır');
  eq(st({ prefs: PREFS_PK }).pk.veriYok, false, 'pk verilmediyse varsayılan boş durum'.length > 0 ? false : true);
});

test('Perakende: geçersiz seçim en kârlıya döner; yüksek kalite yalnız borsada fiyatı varsa seçilir', () => {
  const ilk = stP().pk;
  eq(ilk.secim.harf, ilk.secenek[0].harf);
  for (const pk of [{}, { harf: 'ZZ' }, { harf: ilk.secim.harf, id: 99999 }, { harf: ilk.secim.harf, id: ilk.secim.id, q: 11 }]) {
    const t = stP({ prefs: { ...PREFS_PK, pk } }).pk;
    const h = t.secenek.find((e) => e.harf === t.secim.harf);
    const u = h.urunler.find((e) => e.id === t.secim.id);
    if (!u || !u.kaliteler.includes(t.secim.q)) throw new Error(`geçersiz seçim ${JSON.stringify(pk)}`);
  }
});

test('Perakende: kurulu mağaza seviyesi ve eklenen (kayda işlenmemiş) seviye bir sonraki öneriyi etkiler', () => {
  const harf = PK_HARFLER[0];
  const id = RP.buildingProducts(harf, 0)[0];
  const sec = { harf, id, q: 0 };
  const a = stP({ prefs: { ...PREFS_PK, pk: sec } }).pk;
  const L = a.hesap.L;
  if (!(L >= 1)) throw new Error('örnekte öneri yok');
  eq(a.hesap.ayni, 0);
  const kurulu = stP({ prefs: { ...PREFS_PK, pk: sec }, pk: pkVeri({ kurulum: { recreation: {}, salesSpeedPct: 0, buildings: [{ letter: harf, product: id, quality: 0, level: 17 }, { letter: harf, product: id, quality: 0, level: 5, construction: true }] } }) }).pk;
  eq(kurulu.hesap.ayni, 17, 'inşaattaki mağaza sayılmaz');
  const b = stP({ prefs: { ...PREFS_PK, pk: sec }, ekler: [{ id, L, pk: true, harf }] });
  eq(b.sirket.toplamSeviye, stP().sirket.toplamSeviye + L);
  if (!(b.pk.hesap.L < L)) throw new Error('eklenen seviye ikinci önerideki seviyeyi azaltmalı');
  // perakende eki mağaza maaşıyla (bina maaş çarpanı × ortalama maaş) şirketin taban maaşına girer
  const m0 = O.sirketOzeti({ company: COMPANY, kurulum: KURULUM, data }).tabanMaasSaat;
  const m1 = O.sirketOzeti({ company: COMPANY, kurulum: KURULUM, data, ek: { seviye: 10, maas: 10 * 100 } }).tabanMaasSaat;
  near(m1 - m0, 1000, 'ek maaş');
});

test('pkBinaEkle: yeni mağaza satırı, mevcut mağazaya ekleme, eşleşme yoksa yeni satır, bozuk kayıt ve seviye', () => {
  const raw = { economyPhase: 1, recreation: { park: 2 }, buildings: [
    { id: 'a', letter: 'G', product: 3, quality: 2, level: 10 },
    { id: 'c', letter: 'G', product: 3, quality: 2, level: 5, construction: true },
  ] };
  const e = { harf: 'G', id: 3, q: 2, L: 7 };
  const y = pkBinaEkle(raw, e, 'yeni');
  eq(y.mod, 'yeni');
  eq(y.raw.buildings.length, 3);
  const yb = y.raw.buildings[2];
  eq(`${yb.letter}|${yb.product}|${yb.quality}|${yb.level}|${yb.cost}|${yb.price}|${yb.construction}`, 'G|3|2|7|null|null|false');
  eq(y.raw.economyPhase, 1, 'diğer alanlar korunur');
  eq(raw.buildings.length, 2, 'girdi değişmez');
  const m = pkBinaEkle(raw, e, 'mevcut');
  eq(m.mod, 'mevcut');
  eq(m.raw.buildings.map((b) => b.level).join(','), '17,5', 'inşaattaki mağaza eşleşmez');
  eq(pkBinaEkle(raw, { ...e, q: 3 }, 'mevcut').mod, 'yeni');
  eq(pkBinaEkle(null, e, 'yeni').raw.buildings.length, 1);
  eq(pkBinaEkle({ buildings: 'x' }, e, 'mevcut').mod, 'yeni');
  eq(pkBinaEkle(raw, { ...e, L: 0.9 }, 'yeni'), null);
  eq(pkBinaEkle(raw, { ...e, L: 3.7 }, 'yeni').raw.buildings[2].level, 3);
});

test('Perakende kaydı okuma: yalnız gerekli alanlar, bozuk kayıt atılır', () => {
  const eskiLS = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => JSON.stringify({ recreation: { park: 9, temple: 1 }, salesSpeedPct: '4', buildings: [{ letter: 'G', product: '3', quality: 99, level: 5.9 }, { letter: 7, product: 1 }, null, 'x'] }) };
  try {
    const k = perakendeOku(0);
    eqj(k.recreation, { park: 3, temple: 1, lake: 0 });
    eq(k.salesSpeedPct, 4);
    eqj(k.buildings, [{ letter: 'G', product: 3, quality: 12, level: 5, construction: false }]);
    globalThis.localStorage = { getItem: () => '{bozuk' };
    eqj(perakendeOku(0), { buildings: [], recreation: {}, salesSpeedPct: 0 });
  } finally { if (eskiLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = eskiLS; }
});

test('Hesap kartı: kurulu seviye ve şirket seviyesi etiketleri bir kez görünür (üretim ve perakende)', () => {
  const kurulu = { buildings: [{ type: 'W', product: 2, quality: 0, level: 20 }], recreation: {} };
  const a = hesapHtml(stT({ prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2, q: 0 } }, kurulum: kurulu }), ad);
  eq(a.split('Zaten kurulu: 20 seviye').length - 1, 1, 'üretim: kurulu etiketi');
  eq((a.match(/Şirketiniz: [\d.]+ → [\d.]+ seviye/g) || []).length, 1, 'üretim: şirket etiketi');
  const p = stP();
  const h = sayfaHtml(p, ad);
  eq((h.match(/Şirketiniz: [\d.]+ → [\d.]+ seviye/g) || []).length, 1, 'perakende: şirket etiketi');
});

test('Perakende sayfası: iki üst sekme; mağaza seçici, sınırsız uyarısı, Ekle düğmeleri; pazar payı ve kontrat yok', () => {
  const h = sayfaHtml(stP(), ad);
  for (const t of ['data-ana="tum"', 'data-ana="pk"']) if (!h.includes(t)) throw new Error(`üst sekme yok ${t}`);
  if (h.includes('data-ana="borsa"')) throw new Error('borsa sekmesi olmamalı');
  if (!h.includes('data-ana="pk" aria-selected="true"')) throw new Error('Perakende seçili olmalı');
  for (const t of ['Seviye hesapla', 'data-pk="harf"', 'data-pk="id"', 'data-act="pkEkle"', 'data-v="yeni"', 'data-v="mevcut"', 'Yeni mağaza olarak ekle', 'Mevcut mağazaya ekle', 'Bu mağazadaki ürünler', 'Satışın ve alımın sınırsız', 'Satış fiyatı', 'Birim maliyet', 'Ekonomi fazı', 'Toplam satış bonusu']) if (!h.includes(t)) throw new Error(`perakende sekmesinde ${t} yok`);
  for (const t of ['Pazar payı', 'Kontratlarım', 'data-tab=', 'data-hs=', 'data-act="ekle"']) if (h.includes(t)) throw new Error(`perakende sekmesinde ${t} olmamalı`);
  // yalnız seçilen mağazanın ürünleri
  const s = stP();
  const tablo = h.slice(h.indexOf('Bu mağazadaki ürünler'));
  eq((tablo.match(/<tr><th scope="row">/g) || []).length, s.pk.urunler.filter((u) => u.harf === s.pk.secim.harf).length, 'yalnız seçilen mağaza');
  // veri yoksa
  const bos = sayfaHtml(stP({ pk: pkVeri({ saturation: {} }) }), ad);
  if (!bos.includes('Perakende verisi (doygunluk ve fiyat) okunamadı.')) throw new Error('veri yok iletisi yok');
  // eklendi iletileri
  const o = stP();
  for (const [son, metin] of [[{ mod: 'yeni', id: 2, q: 0, L: 7 }, 'Yeni mağaza eklendi: Riser Q0 +7 seviye.'], [{ mod: 'mevcut', id: 2, q: 0, L: 7 }, 'Mevcut mağazaya eklendi: Riser Q0 +7 seviye.'], [{ hata: true }, 'Tarayıcı kaydı açık değil; eklenemedi.']]) {
    o.sonEklePk = son;
    if (!pkHtml(o, ad).includes(metin)) throw new Error(`iletisi yok: ${metin}`);
  }
  o.sonEklePk = { mod: 'yeni', id: 2, q: 0, L: 7 };
  if (!pkHtml(o, ad).includes('href="#perakende/binalar"')) throw new Error('Perakende bağlantısı yok');
});

test('Perakende sayfası İngilizcede tamamen çevrilir (şirketli ve şirketsiz, her seçim, ekleme iletileri, veri yok)', () => {
  const htmls = [];
  for (const c of [{}, { company: COMPANY, kurulum: KURULUM }]) {
    for (const pk of [pkVeri(), pkVeri({ saturation: {} }), pkVeri({ kurulum: { recreation: { park: 1 }, salesSpeedPct: 3, buildings: [{ letter: PK_HARFLER[0], product: RP.buildingProducts(PK_HARFLER[0], 0)[0], quality: 0, level: 9 }] } })]) {
      const ilk = stP({ ...c, pk });
      htmls.push(sayfaHtml(ilk, ad));
      for (const e of ilk.pk.secenek.slice(0, 3)) {
        for (const u of e.urunler.slice(0, 2)) {
          for (const q of u.kaliteler.slice(0, 2)) {
            const s2 = stP({ ...c, pk, prefs: { ...PREFS_PK, pk: { harf: e.harf, id: u.id, q } } });
            for (const sonEklePk of [null, { mod: 'yeni', id: u.id, q, L: 12 }, { mod: 'mevcut', id: u.id, q, L: 3 }, { hata: true }]) {
              s2.sonEklePk = sonEklePk;
              s2.acik = new Set(['pkq']);
              htmls.push(sayfaHtml(s2, ad));
            }
          }
        }
      }
    }
  }
  const kalan = new Set();
  for (const h of htmls) {
    for (const p of parcalar(h)) {
      const t2 = en(p);
      const harfli = /[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(p.replace(/Riser|Q\d+/g, ''));
      if (TR.test(t2) || (t2 === p && harfli && !ADLAR.has(p) && EN[p] !== p)) kalan.add(p);
    }
  }
  if (kalan.size) throw new Error(`çevrilmeyen: ${[...kalan].slice(0, 5).join(' | ')}`);
});

test('Sayfa yöntemi ya da ara değeri yazmaz (yalnız "DentSimco formülü")', () => {
  const live = { t: NOW, items: { 2: [NOW, { 0: [0.6, null, 0, 0, NOW - SAAT] }] } };
  const yasak = ['adet/saat', 'adet/gün', 'VWAP', 'komisyon', 'yarım taşıma', 'Kâr yalnız', 'maaşlarına', 'maaşını', '6 saat', 'en ucuz kalite', 'pazar payı', 'Pazar payı', 'Kontrat'];
  for (const ana of ['tum', 'pk']) {
    for (const c of [{}, { company: COMPANY, kurulum: KURULUM }]) {
      const s = ana === 'pk' ? stP({ ...c, live }) : st({ ...c, live, prefs: PREFS_TUM });
      s.acik = new Set(['tumq', 'pkq', ...(s.tum.binalar || []).map((b) => `t:${b.harf}`)]);
      const html = sayfaHtml(s, ad);
      for (const y of yasak) if (html.includes(y)) throw new Error(`sayfada "${y}" geçiyor`);
    }
  }
  if (!sayfaHtml(st({ prefs: PREFS_TUM }), ad).includes('DentSimco formülüyle hesaplanır')) throw new Error('dipnot yok');
});

test('En kârlı kalite yıldızla (★) önerilir: Üretim ve Perakende, ürün seçilince kalite seçicide ve karşılaştırma tablosunda; varsayılan seçim de odur', () => {
  const yildizli = (h) => [...h.matchAll(/<option value="(\d+)"[^>]*>Q\d+( ★)?<\/option>/g)].filter((m) => m[2]).map((m) => Number(m[1]));
  const kontrol = (s, t, ad_, ad2) => {
    const hs = t.hesap;
    const h = t.secenek.find((e) => e.harf === t.secim.harf);
    const u = h.urunler.find((e) => e.id === t.secim.id);
    const guvenilir = hs.kaliteler.filter((k) => !k.son);
    const enIyi = (guvenilir.length ? guvenilir : hs.kaliteler).reduce((a, b) => (b.kar > a.kar + 1e-9 ? b : a));
    eq(u.ana, enIyi.q, `${ad2}: ana kalite en kârlı kalite olmalı`);
    const html = sayfaHtml(s, ad_);
    eqj(yildizli(html), [u.ana], `${ad2}: seçicide tek yıldız, en kârlı kalitede`);
    if (hs.kaliteler.length > 1) eq((html.match(/<th scope="row">Q\d+ ★/g) || []).length, 1, `${ad2}: karşılaştırma tablosunda tek yıldız`);
    return u;
  };
  // Üretim: varsayılan seçim ve elle seçilen ürün (kalitesi seçilmemiş)
  for (const hesap of [{}, { harf: 'W', id: 2 }, { harf: 'W', id: 2, q: 0 }]) {
    const s = stT({ prefs: { ...PREFS_TUM, hesap } });
    const u = kontrol(s, s.tum, ad, 'üretim');
    if (hesap.q == null) eq(s.tum.secim.q, u.ana, 'kalite seçilmediyse en kârlısı seçilir');
  }
  // Perakende
  for (const pk of [{}, { harf: PK_HARFLER[0], id: RP.buildingProducts(PK_HARFLER[0], 0)[0] }]) {
    const s = stP({ prefs: { ...PREFS_PK, pk } });
    const u = kontrol(s, s.pk, { ...ad, kaliteli: () => true }, 'perakende'); // örnek veride perakende ürünleri yok: kalite seçici açık sayılır
    eq(s.pk.secim.q, u.ana, 'perakende: kalite seçilmediyse en kârlısı seçilir');
  }
  // kalitesiz üründe kalite seçici de yıldız da yok
  const kalitesiz = stT({ prefs: { ...PREFS_TUM, hesap: { harf: 'P', id: 66 } } });
  if (!sayfaHtml(kalitesiz, { ...ad, kaliteli: () => false }).includes('data-hs="id"')) throw new Error('örnek yok');
  if (yildizli(sayfaHtml(kalitesiz, { ...ad, kaliteli: () => false })).length) throw new Error('kalitesiz üründe yıldız olmamalı');
});

test('★ önerisi: yalnız son işlemden fiyatlanan (seyrek) kalite, güvenilir fiyatlı kalite varken önerilmez', () => {
  const live = { t: NOW, items: { 2: [NOW, { 2: [2.2, null, 0, 0, NOW - SAAT] }] } }; // Su Q2: özette yok, son işlem çok yüksek fiyatlı
  const s = stT({ live, prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2 } } });
  const u = s.tum.secenek.find((e) => e.harf === 'W').urunler.find((e) => e.id === 2);
  if (!u.kaliteler.includes(2)) throw new Error('Q2 seçilebilir olmalı');
  const k2 = s.tum.hesap.kaliteler.find((k) => k.q === 2);
  eq(k2.son, true);
  if (!(k2.kar > Math.max(...s.tum.hesap.kaliteler.filter((k) => !k.son).map((k) => k.kar)))) throw new Error('örnekte Q2 en kârlı olmalı');
  if (u.ana === 2 || s.tum.secim.q === 2) throw new Error('seyrek kalite önerilmemeli');
  // elle seçilebilir
  eq(stT({ live, prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2, q: 2 } } }).tum.secim.q, 2);
});

test('İşlem sıklığı ve güvenilirlik notu: 28 günde ≥ 21 gün güvenilir, 14 – 20 orta, daha azı seyrek (uyarı), hiç yoksa son işlemden; son işlem zamanı yazılır', () => {
  const stx = { simdi: NOW };
  const not = (gun, sonT = null) => uretimIslemNotu({ islem: { gun, pencere: 28, sonT } }, stx);
  if (!not(28).includes('28 günün 28 gününde işlem gördü: fiyat güvenilir.') || not(28).includes('op-warn')) throw new Error('güvenilir');
  if (!not(21).includes('fiyat güvenilir.')) throw new Error('21 gün güvenilir');
  if (!not(20).includes('orta güvenilirlikte') || not(20).includes('op-warn')) throw new Error('20 gün orta');
  if (!not(14).includes('orta güvenilirlikte')) throw new Error('14 gün orta');
  const az = not(8, NOW - 2 * 24 * SAAT);
  if (!az.includes('yalnız 8 gününde') || !az.includes('seyrek işlem, fiyat güvenilir değil') || !az.includes('op-warn') || !az.includes('Son işlem 2 gün önce.')) throw new Error(`seyrek: ${az}`);
  const yok = not(0, NOW - 3 * SAAT);
  if (!yok.includes('işlem yok; fiyat son işlemden: güvenilir değil.') || !yok.includes('op-warn') || !yok.includes('Son işlem 3 sa önce.')) throw new Error('hiç işlem yok');
  eq(uretimIslemNotu({ islem: { gun: 5, pencere: 0, sonT: null } }, stx), '');
  // sayfada: seçilen kalitenin notu ve karşılaştırma tablosunda işlem günü
  const s = stT({ prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2, q: 0 } } });
  const h = sayfaHtml({ ...s, acik: new Set(['tumq']) }, ad);
  if (!h.includes('Borsada son 28 günün 28 gününde işlem gördü: fiyat güvenilir.')) throw new Error('sayfada işlem notu yok');
  if (!h.includes('<th scope="col">İşlem günü</th>') || !h.includes('<td>28/28</td>')) throw new Error('işlem günü sütunu yok');
  eqj([s.tum.hesap.islem.gun, s.tum.hesap.islem.pencere, s.tum.hesap.islem.sonT], [28, 28, null]);
  // son işlemden fiyatlanan kalite: günü ve son işlem zamanı
  const live = { t: NOW, items: { 2: [NOW, { 2: [0.7, null, 0, 0, NOW - 3 * 24 * SAAT] }] } };
  const s2 = stT({ live, prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2, q: 2 } } });
  eqj([s2.tum.hesap.islem.gun, s2.tum.hesap.islem.sonT], [0, NOW - 3 * 24 * SAAT]);
});

test('Perakende maliyet notu: son işlem 24 saatten yeniyse bilgi, eskiyse uyarı; zaman yoksa not yok', () => {
  const stx = { simdi: NOW };
  const yeni = pkIslemNotu({ sonT: NOW - 3 * SAAT }, stx);
  if (!yeni.includes('Maliyet, borsanın güncel fiyatıdır; son işlem 3 sa önce.') || yeni.includes('op-warn')) throw new Error(`yeni: ${yeni}`);
  const eski = pkIslemNotu({ sonT: NOW - 30 * SAAT }, stx);
  if (!eski.includes('Borsada son işlem 1 gün önce: maliyet fiyatı güncel olmayabilir.') || !eski.includes('op-warn')) throw new Error(`eski: ${eski}`);
  eq(pkIslemNotu({ sonT: null }, stx), '');
  const s = stP();
  if (!sayfaHtml(s, ad).includes('Maliyet, borsanın güncel fiyatıdır; son işlem 1 sa önce.')) throw new Error('sayfada maliyet notu yok');
});

test('Ek seviye 0 ise neden ve (başka binası olmayan şirket için) en kârlı seviye yazılır; hiçbir seviye kâr getirmiyorsa o söylenir', () => {
  // büyük şirket: ek seviye kâr getirmez ama yalnız başına kârlı
  const buyuk = { ...COMPANY, admin: { totalLevels: 3000, wagesDay: 90_000_000 } };
  const s = stT({ company: buyuk, prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2, q: 0 } } });
  eq(s.tum.hesap.L, 0);
  if (!(s.tum.hesap.yalniz.L > 0)) throw new Error('yalnız başına seviye bulunmalı');
  const h = sayfaHtml(s, ad);
  if (!h.includes('Şirketinizin bugünkü yönetim gideriyle ek seviye kâr getirmiyor.') || !h.includes(`Başka binanız olmasaydı en kârlı seviye ${s.tum.hesap.yalniz.L}`)) throw new Error('yalnız başına bilgisi yok');
  // L > 0 iken yalniz null
  eq(stT({ prefs: { ...PREFS_TUM, hesap: { harf: 'W', id: 2, q: 0 } } }).tum.hesap.yalniz, null);
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
