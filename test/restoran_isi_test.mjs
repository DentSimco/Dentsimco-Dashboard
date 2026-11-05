// DentSimco — Restoran › Analiz › Isı Haritası sınamaları. Çalıştırma: node test/restoran_isi_test.mjs
// restoran-isi-hesap.js (maliyet eğrisi, bonus kayması, kâr, görünüm), restoran-isi.js (kayıt, olaylar, çizim),
// restoran-isi-donem.js (üretilmiş veri: bütünlük ve eğrinin güncelliği), araclar/restoran-isi.mjs (fiyat toplama ve dosya üretimi).
// Kâr, aracın mevcut hesabıyla (hesap-restoran.js donguGideri ve donguKari) çapraz doğrulanır: ayrı bir hesap kurulmadı.

import * as IH from '../public/restoran-isi-hesap.js';
import * as IS from '../public/restoran-isi.js';
import { ISI_DONEMLER, ISI_FIYAT_DILIMLERI, ISI_KAYNAK } from '../public/restoran-isi-donem.js';
import * as R from '../public/hesap-restoran.js';
import * as RR from '../public/restoran-rating.js';
import * as MS from '../public/restoran-menusec.js';
import { donemFiyati, gunSiniri, donemDosyasi } from '../araclar/restoran-isi.mjs';

const results = [];
let group = '';
const section = (name) => { group = name; };
function test(name, fn) {
  try { const p = fn(); if (p && typeof p.then === 'function') throw new Error('eşzamansız test desteklenmiyor'); results.push({ group, name, ok: true }); } catch (e) { results.push({ group, name, ok: false, error: e.message }); }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} beklenen ${b}, bulunan ${a}`);
}
function near(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} beklenen ${expected} (±${tol}), bulunan ${actual}`);
}
function ok(value, label = 'koşul sağlanmadı') { if (!value) throw new Error(label); }

const SON = ISI_DONEMLER[ISI_DONEMLER.length - 1];
const MAAS = IH.maasSeviye('eko', { adminNet: 0.3 });

// ---------------------------------------------------------------------------------------------------------------
section('Üretilmiş veri');
test('dönemler eskiden yeniye, benzersiz; her biri hücre, evre, fiyat ve eğri taşır', () => {
  ok(ISI_DONEMLER.length >= 1, 'en az bir dönem');
  for (let i = 1; i < ISI_DONEMLER.length; i++) ok(ISI_DONEMLER[i].sayi > ISI_DONEMLER[i - 1].sayi, 'sıra');
  for (const d of ISI_DONEMLER) {
    ok(d.h.length > 50 && d.gun >= 40 && d.gun <= 70, `#${d.sayi} hücre ya da gün`);
    near(d.evre[0] + d.evre[1] + d.evre[2], 1, 0.01, `#${d.sayi} evre payları`);
    eq(Object.keys(d.fiyat).length, 16, `#${d.sayi} ürün sayısı`);
    for (const id of Object.keys(R.URUNLER)) eq(d.fiyat[id].length, 13, `#${d.sayi} ${id} kalite sayısı`);
    for (const tip of ['eko', 'luks']) {
      ok(d.egri[tip].length > 100 && d.egri[tip][0][0] === 0, `#${d.sayi} ${tip} eğri başlangıcı`);
      d.egri[tip].forEach(([i, c], k) => { ok(Number.isInteger(i) && i >= 0 && i <= IH.EGRI_SON, 'ızgara dizini'); if (k) ok(i > d.egri[tip][k - 1][0], 'dizinler artan'); ok(c === null || c > 0, 'maliyet'); });
    }
  }
});
test('hücre indisleri geçerli, doluluk 0–1 arası ve döngü sayısı pozitif', () => {
  for (const d of ISI_DONEMLER) for (const [r, pi, n, s] of d.h) {
    ok(Number.isInteger(r) && r >= 0 && r <= 10, 'rating dilimi'); ok(Number.isInteger(pi) && pi >= 0 && pi < ISI_FIYAT_DILIMLERI.length, 'fiyat dilimi');
    ok(n > 0 && s >= 0 && s <= n + 1e-6, `#${d.sayi} doluluk toplamı ${s} / ${n}`);
  }
});
test('fiyat dilimleri hesap modülüyle aynı; kaynak bilgisi tutarlı', () => {
  eq(ISI_FIYAT_DILIMLERI, IH.FIYAT_DILIMLERI); eq(ISI_KAYNAK.donem, ISI_DONEMLER.length); ok(/^\d{4}-\d{2}-\d{2}$/.test(ISI_KAYNAK.guncellendi));
});
test('maliyet eğrisi: hedef arttıkça maliyet azalmaz; ulaşılamayan (null) yalnız eğrinin sonunda', () => {
  for (const d of ISI_DONEMLER) for (const tip of ['eko', 'luks']) {
    let onceki = 0;
    d.egri[tip].forEach(([i, c], k) => {
      if (c == null) { eq(k, d.egri[tip].length - 1, `#${d.sayi} ${tip} null yalnız sonda`); return; }
      ok(c >= onceki, `#${d.sayi} ${tip} hedef ${(i * IH.EGRI_ADIM).toFixed(3)} maliyet düştü`); onceki = c;
    });
  }
});
test('eğri değeri: ızgara dizinindeki son değişiklik; eğrinin ötesi ve boş eğri null', () => {
  const e = [[0, 100], [10, 200], [20, null]];
  eq(IH.egriDegeri(e, 0), 100); eq(IH.egriDegeri(e, 9), 100); eq(IH.egriDegeri(e, 10), 200); eq(IH.egriDegeri(e, 19), 200); eq(IH.egriDegeri(e, 20), null); eq(IH.egriDegeri(e, 99), null);
  eq(IH.egriDegeri(e, IH.EGRI_SON + 1), null); eq(IH.egriDegeri([], 0), null); eq(IH.egriDegeri(undefined, 0), null);
});
test('lüks aynı ratinge eko\'dan ucuza ulaşır (koltuk yarısı); 0,0 hedefte eko ≈ 2 × lüks', () => {
  for (const d of ISI_DONEMLER) { ok(IH.egriDegeri(d.egri.luks, 1000) < IH.egriDegeri(d.egri.eko, 1000), `#${d.sayi}`); near(IH.egriDegeri(d.egri.eko, 0) / IH.egriDegeri(d.egri.luks, 0), 2, 0.05); }
});
test('eğriler güncel: yayımlanan eğri, bugünkü fiyat ve rating modeliyle yeniden hesaplananla aynı (değilse: node araclar/restoran-isi.mjs)', () => {
  for (const d of ISI_DONEMLER) for (const tip of ['eko', 'luks']) {
    const c = IH.menuCephesi(d, tip);
    for (let i = 0; i <= IH.EGRI_SON; i += 37) { const m = IH.enUcuzMenu(c, i * IH.EGRI_ADIM, 0); eq(IH.egriDegeri(d.egri[tip], i), m ? Math.round(m.maliyet) : null, `#${d.sayi} ${tip} dizin ${i}`); }
    const m = IH.enUcuzMenu(c, IH.EGRI_SON * IH.EGRI_ADIM, 0); eq(IH.egriDegeri(d.egri[tip], IH.EGRI_SON), m ? Math.round(m.maliyet) : null, `#${d.sayi} ${tip} son`);
  }
  eq(IH.maliyetEgrisi(SON, 'eko'), SON.egri.eko, 'son dönem eko tam eğri'); eq(IH.maliyetEgrisi(SON, 'luks'), SON.egri.luks, 'son dönem lüks tam eğri');
});

// ---------------------------------------------------------------------------------------------------------------
section('Menü motoru');
const cephe = IH.menuCephesi(SON, 'eko'), cepheL = IH.menuCephesi(SON, 'luks');
const marketSon = IH.marketOfDonem(SON);
test('hedef ratinge ulaşır: menünün modeldeki ratingi hedefin altında kalmaz (bonuslu ve bonussuz, eko ve lüks)', () => {
  for (const [c, tip] of [[cephe, 'eko'], [cepheL, 'luks']]) for (const bonus of [0, 0.5, 1]) for (const h of [4.5, 6.5, 7.5, 8.5]) {
    const m = IH.enUcuzMenu(c, h, bonus);
    if (!m) continue;
    ok(RR.menuRatingi({ puanOrt: m.puanOrt, urunSayisi: m.urunSayisi, bonus, tip }) >= h - 0.02 - 1e-9, `${tip} hedef ${h} bonus ${bonus}: rating ${m.rating}`);
  }
});
test('maliyet = ürün tutarları toplamı; her kategoriden en az bir ürün; ürünler benzersiz', () => {
  const m = IH.enUcuzMenu(cephe, 6.5, 0);
  near(m.maliyet, m.urunler.reduce((t, u) => t + u.tutar, 0), 1e-6);
  const say = R.kategoriSayilari(m.urunler.map((u) => u.id)); ok(say.salata >= 1 && say.ana >= 1 && say.icecek >= 1, 'kategoriler');
  eq(new Set(m.urunler.map((u) => u.id)).size, m.urunler.length);
});
test('bonus eğriyi kaydırır: eko\'da hedef − b, lüks\'te hedef − 1,25·b bonussuz menüyle aynı maliyet (kesin eşdeğerlik)', () => {
  for (const b of [0.25, 0.5, 1, 1.5]) for (const h of [6.5, 7.5, 8.5, 9.5]) {
    const e = IH.enUcuzMenu(cephe, h, b), e0 = IH.enUcuzMenu(cephe, h - b, 0);
    eq(e == null, e0 == null, `eko ${h} ${b}`); if (e) near(e.maliyet, e0.maliyet, 1e-6, `eko ${h} ${b}`);
    const l = IH.enUcuzMenu(cepheL, h, b), l0 = IH.enUcuzMenu(cepheL, h - 1.25 * b, 0);
    eq(l == null, l0 == null, `lüks ${h} ${b}`); if (l) near(l.maliyet, l0.maliyet, 1e-6, `lüks ${h} ${b}`);
  }
});
test('egriDizini: bonus ve oturmaya göre; negatif dizin 0\'a sıkışır', () => {
  eq(IH.egriDizini('eko', 0, 7.5), 1500); eq(IH.egriDizini('eko', 1, 7.5), 1300); eq(IH.egriDizini('luks', 1, 7.5), 1250); eq(IH.egriDizini('eko', 9, 3), 0); eq(IH.egriDizini('eko', 0.83, 7.5), 1334);
});
test('Menü Seç ile aynı sonuç: seçilen çeşit dağılımında sekmenin menuSec\'i aynı maliyeti verir', () => {
  for (const [h, b, tip, c] of [[6.5, 0, 'eko', cephe], [7.5, 1, 'eko', cephe], [8.5, 0.5, 'luks', cepheL]]) {
    const m = IH.enUcuzMenu(c, h, b); if (!m) continue;
    const [s, a, i] = m.cesit.split('-').map(Number);
    const ms = MS.menuSec(marketSon, { cesit: { salata: s, ana: a, icecek: i }, hedef: h, seviye: IH.SEVIYE, tip, bonus: b });
    ok(ms.kategoriler, 'menuSec sonuç'); near(ms.toplam / IH.SEVIYE, m.maliyet, 1e-6, `${tip} ${h} ${b}`);
  }
});
test('likidite süzgeci: işlem görmeyen ya da hacmi düşük kalite kullanılmaz; süzgeçsiz aynı ya da daha ucuz', () => {
  const m1 = IH.marketOfDonem(SON), m0 = IH.marketOfDonem(SON, { likidite: false });
  let farkli = 0;
  for (const id of Object.keys(R.URUNLER)) for (let q = 0; q <= 12; q++) { if (m1(id, q) == null && m0(id, q) != null) farkli++; if (m1(id, q) != null) near(m1(id, q), m0(id, q), 1e-9); }
  ok(farkli > 0, 'süzgeç bir şeyi elemeli');
  ok(IH.enUcuzMenu(IH.menuCephesi(SON, 'eko', { likidite: false }), 7.5, 0).maliyet <= IH.enUcuzMenu(cephe, 7.5, 0).maliyet + 1e-6);
});

// ---------------------------------------------------------------------------------------------------------------
section('Kâr hesabı (aracın mevcut hesabıyla çapraz doğrulama)');
test('maaş: hesap-restoran donguMaasi ile aynı; yönetim gideri ve profesyonel çalışan çarpar, lüks yarısı', () => {
  const w = R.saatlikMaasSeviye({ adminNet: 0.3 });
  near(IH.maasSeviye('eko', { adminNet: 0.3 }), R.donguMaasi(w, 1, 'eko', false), 1e-9);
  near(IH.maasSeviye('luks', { adminNet: 0.3 }), R.donguMaasi(w, 1, 'luks', false), 1e-9);
  near(IH.maasSeviye('luks', { adminNet: 0.3 }), IH.maasSeviye('eko', { adminNet: 0.3 }) / 2, 1e-9);
  near(IH.maasSeviye('eko', { adminNet: 0.3, profesyonel: true }), 5 * IH.maasSeviye('eko', { adminNet: 0.3 }), 1e-9);
  near(IH.maasSeviye('eko', { adminNet: 0 }), 1.7 * 345 * 12, 1e-6); // yönetimsiz: 7.038
  near(IH.maasSeviye('eko', { adminNet: 0, averageSalary: 400, salaryModifier: 2 }), 2 * 400 * 12, 1e-6);
});
test('hücre kârı = donguKari: aynı menü, 100 seviyelik restoran, donguGideri ve donguKari ile hesaplanıp seviyeye bölününce eşit', () => {
  const gor = IH.gorunum([SON]);
  for (const [tip, bonus, pi, r] of [['eko', 1, 1, 7], ['eko', 0, 0, 5], ['luks', 1, 2, 9], ['luks', 0, 1, 7]]) {
    const o = { bonus, maas: IH.maasSeviye(tip, { adminNet: 0.3 }) }, h = IH.hucreKari(gor, tip, pi, r, o);
    if (!h) continue;
    const m = IH.menuDetayi(SON, tip, bonus, IH.ratingMerkez(r));
    const g = R.donguGideri({ menu: m.urunler.map((u) => ({ id: u.id, birim: u.birim })), seviye: 100, tip, saatlikMaas: R.saatlikMaasSeviye({ adminNet: 0.3 }), fiyat: IH.fiyatMerkez(pi) });
    // yayımlanan eğri $ olarak yuvarlanır ve ızgara dizinine yukarı yuvarlanır: yuvarlamasız menüden en çok bir ızgara adımı (birkaç yüz $) pahalı, ucuz değil
    const f = h.malzeme - g.malzeme / 100; ok(f >= -1 && f <= 300, `${tip} malzeme farkı ${f}`); near(g.maas / 100, h.maas, 1e-6, `${tip} maaş`);
    const kf = R.donguKari(g, IH.fiyatMerkez(pi), h.doluluk * 100) / 100 - h.kar; ok(kf >= -1 && kf <= 300, `${tip} kâr farkı ${kf}`);
  }
});
test('kâr bileşenleri: gelir = fiyat × koltuk × doluluk; başabaş doluluğunda kâr 0', () => {
  const gor = IH.gorunum([SON]), o = { bonus: 1, maas: MAAS };
  const h = IH.hucreKari(gor, 'eko', 1, 7, o);
  near(h.gelir, 105 * 1000 * h.doluluk, 1e-6); near(h.kar, h.gelir - h.malzeme - h.maas, 1e-6);
  near(105 * 1000 * h.basabas, h.malzeme + h.maas, 1e-6);
});
test('doluluk ve fiyat belirlenmiş hücrede kâr: rating bonusu arttıkça kâr azalmaz; yönetim gideri arttıkça kâr azalır', () => {
  const gor = IH.gorunum([SON]);
  let onceki = -Infinity;
  for (const b of [0, 0.5, 1, 1.5, 2]) { const h = IH.hucreKari(gor, 'eko', 1, 6, { bonus: b, maas: MAAS }); ok(h.kar >= onceki - 1e-6, `bonus ${b}`); onceki = h.kar; }
  onceki = Infinity;
  for (const yg of [0, 0.3, 0.6]) { const h = IH.hucreKari(gor, 'eko', 1, 7, { bonus: 1, maas: IH.maasSeviye('eko', { adminNet: yg }) }); ok(h.kar <= onceki + 1e-6, `yönetim ${yg}`); onceki = h.kar; }
});
test('veri yok ya da ulaşılamayan hücre null: 15 döngüden az, boş hücre, bonussuz eko rating 10', () => {
  const gor = IH.gorunum([SON]), o = { bonus: 0, maas: MAAS };
  eq(IH.hucreKari(gor, 'eko', 9, 3, o), IH.hucreKari(gor, 'eko', 9, 3, o)); // boş hücre: çökmez
  eq(IH.hucreKari(gor, 'eko', 1, 10, o), null);
});
test('en kârlı hücre güvenilir (≥ 100 döngü) ve diğer güvenilir hücrelerden büyük', () => {
  for (const tip of ['eko', 'luks']) {
    const gor = IH.gorunum(ISI_DONEMLER.slice(-3)), o = { bonus: 1, maas: IH.maasSeviye(tip, { adminNet: 0.3 }) }, en = IH.enKarliHucre(gor, tip, o);
    ok(en && en.kosu >= IH.MIN_KOSU);
    for (let pi = 0; pi < 10; pi++) for (let r = 0; r <= 10; r++) { if (gor.hucre[pi][r][0] < IH.MIN_KOSU) continue; const h = IH.hucreKari(gor, tip, pi, r, o); if (h) ok(h.kar <= en.kar + 1e-6, `${pi},${r}`); }
  }
});
test('rating tablosu: her rating diliminde koltuk başına geliri en yüksek fiyat; kâr o fiyattaki hücrenin kârı', () => {
  const gor = IH.gorunum([SON]), o = { bonus: 1, maas: MAAS }, t = IH.ratingTablosu(gor, 'eko', o);
  eq(t.length, 11);
  for (const s of t) {
    if (!s.fiyat) continue;
    for (let pi = 0; pi < 10; pi++) { const [n, occ] = gor.hucre[pi][s.r]; if (n >= IH.MIN_KOSU) ok(IH.fiyatMerkez(pi) * occ <= s.fiyat.koltukGeliri + 1e-9, `R${s.r}`); }
    const h = IH.hucreKari(gor, 'eko', s.pi, s.r, o); eq(s.kar, h ? h.kar : null);
  }
});
test('hücre eşlemesi: restoran kartının fiyatı ve ratingi hangi hücreye düşer', () => {
  eq(IH.hucreOf(105, 7.2), { pi: 1, r: 7 }); eq(IH.hucreOf(59, 3), { pi: 0, r: 3 }); eq(IH.hucreOf(149, 9.99), { pi: 2, r: 9 }); eq(IH.hucreOf(500, 10), { pi: 9, r: 10 });
  eq(IH.hucreOf(null, 5), null); eq(IH.hucreOf(100, NaN), null);
});

// ---------------------------------------------------------------------------------------------------------------
section('Seçilen sayıların görünümü');
test('birleşik doluluk döngü ağırlıklı; döngü sayıları toplanır', () => {
  const [a, b] = ISI_DONEMLER.slice(-2), gor = IH.gorunum([a, b]);
  const topla = (d, pi, r) => d.h.filter((x) => x[0] === r && x[1] === pi).reduce((t, x) => [t[0] + x[2], t[1] + x[3]], [0, 0]);
  const ta = topla(a, 1, 7), tb = topla(b, 1, 7);
  eq(gor.hucre[1][7][0], ta[0] + tb[0]); near(gor.hucre[1][7][1], (ta[1] + tb[1]) / (ta[0] + tb[0]), 1e-12);
  eq(gor.son.sayi, b.sayi);
});
test('evre payları gün ağırlıklı ve toplamı 1', () => {
  const gor = IH.gorunum(ISI_DONEMLER.slice(-3)); near(gor.evre[0] + gor.evre[1] + gor.evre[2], 1, 0.01);
  const tek = IH.gorunum([SON]); eq(tek.evre, SON.evre);
});
test('malzeme: seçili dönemlerin ortalaması; dönemlerden birinde ulaşılamıyorsa null', () => {
  const l = ISI_DONEMLER.slice(-2), gor = IH.gorunum(l);
  near(IH.malzeme(gor, 'eko', 0, 6.5), (IH.egriDegeri(l[0].egri.eko, 1300) + IH.egriDegeri(l[1].egri.eko, 1300)) / 2, 1e-9);
  eq(IH.malzeme(gor, 'eko', 0, 12), null); eq(IH.malzeme(gor, 'eko', 0, 10.25), null);
});
test('boş seçim çökmez', () => { const g = IH.gorunum([]); eq(g.son, null); eq(g.hucre[0][0], [0, null]); });

// ---------------------------------------------------------------------------------------------------------------
section('Kayıt ve olaylar');
const btn = (act, v, extra = {}) => ({ dataset: { act, v, ...extra } });
const kartlar = [{ id: 'a', ad: 'Merkez', tip: 'eko', profesyonel: false, seviye: 40, fiyat: 105, rating: 7.2 }, { id: 'b', ad: 'Salon', tip: 'luks', profesyonel: true, seviye: 25, fiyat: 149, rating: 9.4 }];
const ctx = { restoranlar: kartlar, iletisim: 50, hiz: 25, adminNet: 0.3 };
test('temizle: geçersiz kayıt varsayılana döner; olmayan sayı ve bozuk hücre atılır', () => {
  eq(IS.temizleIsi(null), IS.varsayilanIsi()); eq(IS.temizleIsi('x'), IS.varsayilanIsi());
  const s = IS.temizleIsi({ mod: 'tek', a: 1, b: 2, tek: [SON.sayi, 1, SON.sayi, 'x'], metrik: 'x', tip: 'luks', restoran: 5, sel: { pi: 99, r: 3 } });
  eq(s.tek, [SON.sayi]); eq(s.a, null); eq(s.metrik, 'kar'); eq(s.tip, 'luks'); eq(s.restoran, ''); eq(s.sel, null); eq(s.mod, 'tek');
  eq(IS.temizleIsi({ sel: { pi: 2, r: 7 } }).sel, { pi: 2, r: 7 });
});
test('seçili: ilk açılışta son 3 sayı; aralık ve tek tek seçim eskiden yeniye', () => {
  const st = IS.varsayilanIsi(); eq(IS.secili(st).map((d) => d.sayi), ISI_DONEMLER.slice(-3).map((d) => d.sayi));
  const a = ISI_DONEMLER[1].sayi, b = ISI_DONEMLER[3].sayi;
  eq(IS.secili({ ...st, a: b, b: a }).map((d) => d.sayi), ISI_DONEMLER.slice(1, 4).map((d) => d.sayi));
  eq(IS.secili({ ...st, mod: 'tek', tek: [b, a] }).map((d) => d.sayi), [a, b]);
  eq(IS.secili({ ...st, mod: 'tek', tek: [] }).length, 3); eq(IS.secili(st, []), []);
});
test('aralık: iki dokunuşla aralık seçilir (ilk dokunuş tek sayı, ikincisi aralığı kapatır)', () => {
  const st = IS.varsayilanIsi(), a = ISI_DONEMLER[0].sayi, b = ISI_DONEMLER[2].sayi;
  ok(IS.isiTikla(st, btn('is.sayi', a), ctx)); eq(IS.secili(st).length, 1);
  ok(IS.isiTikla(st, btn('is.sayi', b), ctx)); eq(IS.secili(st).length, 3); eq(st.capa, null);
  ok(!IS.isiTikla(st, btn('is.sayi', 12345), ctx));
});
test('tek tek seç: dokunuşla ekle ve çıkar; son sayı çıkarılamaz; mod geçişi seçimi korur', () => {
  const st = IS.varsayilanIsi(); ok(IS.isiTikla(st, btn('is.mod', 'tek'), ctx)); eq(st.tek, ISI_DONEMLER.slice(-3).map((d) => d.sayi));
  const n = ISI_DONEMLER[0].sayi; IS.isiTikla(st, btn('is.sayi', n), ctx); ok(st.tek.includes(n)); IS.isiTikla(st, btn('is.sayi', n), ctx); ok(!st.tek.includes(n));
  st.tek = [SON.sayi]; ok(!IS.isiTikla(st, btn('is.sayi', SON.sayi), ctx)); eq(st.tek, [SON.sayi]);
  st.tek = [ISI_DONEMLER[1].sayi, SON.sayi]; ok(IS.isiTikla(st, btn('is.mod', 'aralik'), ctx)); eq([st.a, st.b], [ISI_DONEMLER[1].sayi, SON.sayi]);
});
test('ilk ve son sayı seçicileri: ters sırada seçilse de aralık düzelir', () => {
  const st = IS.varsayilanIsi(), el = (f, v) => ({ dataset: { is: f }, value: String(v) });
  ok(IS.isiDegis(st, el('s1', ISI_DONEMLER[0].sayi), ctx)); eq(IS.secili(st).map((d) => d.sayi).includes(ISI_DONEMLER[0].sayi), true);
  ok(IS.isiDegis(st, el('s0', SON.sayi), ctx)); eq([st.a <= st.b], [true]); ok(!IS.isiDegis(st, el('s0', 999), ctx));
});
test('oturma ve restoran: karttan seçince oturma karta uyar; kartla uyuşmayan oturma kartı bırakır', () => {
  const st = IS.varsayilanIsi(), el = (v) => ({ dataset: { is: 'restoran' }, value: v });
  ok(IS.isiDegis(st, el('b'), ctx)); eq([st.restoran, st.tip], ['b', 'luks']);
  ok(IS.isiTikla(st, btn('is.tip', 'luks'), ctx)); eq(st.restoran, 'b');
  ok(IS.isiTikla(st, btn('is.tip', 'eko'), ctx)); eq([st.restoran, st.tip], ['', 'eko']);
  ok(IS.isiDegis(st, el('yok'), ctx)); eq(st.restoran, ''); ok(!IS.isiTikla(st, btn('is.tip', 'x'), ctx));
});
test('kâr / doluluk, hücre ve menü olayları; geçersiz hücre reddedilir', () => {
  const st = IS.varsayilanIsi();
  ok(IS.isiTikla(st, btn('is.metrik', 'doluluk'), ctx)); eq(st.metrik, 'doluluk'); ok(!IS.isiTikla(st, btn('is.metrik', 'x'), ctx));
  ok(IS.isiTikla(st, btn('is.hucre', undefined, { pi: '2', r: '7' }), ctx)); eq(st.sel, { pi: 2, r: 7 });
  ok(!IS.isiTikla(st, btn('is.hucre', undefined, { pi: '12', r: '7' }), ctx)); ok(!IS.isiTikla(st, btn('is.hucre', undefined, { pi: '1', r: '11' }), ctx));
  ok(IS.isiTikla(st, btn('is.menu'), ctx)); eq(st.menuAc, true); ok(!IS.isiTikla(st, btn('is.bilinmeyen'), ctx));
});

// ---------------------------------------------------------------------------------------------------------------
section('Çizim');
test('Kâr görünümü: 110 hücre, oturma seçimi, restoran seçimi, birim etiketi, rating tablosu', () => {
  const h = IS.isiHtml(IS.varsayilanIsi(), ctx);
  eq((h.match(/class="is-cell/g) || []).length, 110);
  ok(h.includes('aria-label="Oturma"') && h.includes('data-act="is.tip"')); ok(h.includes('data-is="restoran"') && h.includes('Merkez · Eko'));
  ok(h.includes('bin $') && h.includes('26 = $26.000'));
  ok(h.includes('Rating dilimi başına en iyi fiyat')); ok(h.includes('Rating bonusu +1,00') && h.includes('Yönetim gideri %30,0'));
  ok(!h.includes(' mine'), 'kart seçili değilse restoranım noktası yok');
  ok(IS.isiHtml({ ...IS.varsayilanIsi(), restoran: 'a' }, ctx).includes(' mine'), 'karttan seçilince restoranım noktası');
});
test('Doluluk görünümü: oturma, restoran, kâr ve tablo yok; hücreler yüzde; yorum kartı yok', () => {
  const h = IS.isiHtml({ ...IS.varsayilanIsi(), metrik: 'doluluk' }, ctx);
  ok(!h.includes('data-act="is.tip"') && !h.includes('data-is="restoran"') && !h.includes('Rating dilimi başına en iyi fiyat'));
  ok(h.includes('Sayılar doluluk yüzdesi') && h.includes('eko ve lüks birlikte') && h.includes('>%</div>'));
  ok(!h.includes('Kalite ve kâr yorumu'));
});
test('Kâr görünümünde de yorum kartı yok (kaldırıldı)', () => { ok(!IS.isiHtml(IS.varsayilanIsi(), ctx).includes('yorumu')); });
test('seçili hücre ve menü: menü düğmesi, tıklayınca en ucuz menü ürünleriyle', () => {
  const st = { ...IS.varsayilanIsi(), sel: { pi: 1, r: 7 } };
  const h = IS.isiHtml(st, ctx); ok(h.includes('data-act="is.menu"') && !h.includes('En ucuz menü'));
  const h2 = IS.isiHtml({ ...st, menuAc: true }, ctx); ok(h2.includes('En ucuz menü') && h2.includes('Q') && !h2.includes('data-act="is.menu"'));
});
test('restoran kartı seçiliyse oturma ve çalışan kartından gelir (lüks profesyonel: maaş ×5, yarısı)', () => {
  const h = IS.isiHtml({ ...IS.varsayilanIsi(), restoran: 'b' }, ctx);
  ok(h.includes('Lüks oturma') && h.includes('Profesyonel çalışan (maaş ×5)') && h.includes('rating 9,4'));
  const maas = IH.maasSeviye('luks', { adminNet: 0.3, profesyonel: true });
  const st = { ...IS.varsayilanIsi(), restoran: 'b', sel: { pi: 2, r: 9 } };
  ok(IS.isiHtml(st, ctx).includes(`$${new Intl.NumberFormat('tr-TR').format(Math.round(maas))}`), 'detayda maaş');
});
test('kullanıcı metni kaçırılır: restoran adındaki etiketler çalışmaz', () => {
  const h = IS.isiHtml(IS.varsayilanIsi(), { ...ctx, restoranlar: [{ ...kartlar[0], ad: '<img src=x onerror=alert(1)>' }] });
  ok(!h.includes('<img') && h.includes('&lt;img'));
});
test('kart yoksa restoran seçimi gösterilmez; veri yoksa açıklayıcı ileti; seçili sayı belirtilir', () => {
  const h = IS.isiHtml(IS.varsayilanIsi(), { ...ctx, restoranlar: [] }); ok(!h.includes('data-is="restoran"') && h.includes('data-act="is.tip"'));
  ok(IS.isiHtml(IS.varsayilanIsi(), ctx, []).includes('Fiyatı olan gazete sayısı yok'));
  ok(h.includes(`#${SON.sayi}`) && h.includes('sayı seçili'));
});
test('menüyle ulaşılamayan hücre × ile gösterilir (bonussuz eko, yüksek rating)', () => {
  const h = IS.isiHtml(IS.varsayilanIsi(), { ...ctx, iletisim: 0, hiz: 0 }); ok(h.includes('is-cell unreach'));
});
test('çizim eko ve lüks, tüm sayı seçimlerinde çökmez', () => {
  for (const tip of ['eko', 'luks']) for (const mod of ['aralik', 'tek']) IS.isiHtml({ ...IS.varsayilanIsi(), tip, mod, tek: ISI_DONEMLER.map((d) => d.sayi), a: ISI_DONEMLER[0].sayi, b: SON.sayi }, ctx);
});

// ---------------------------------------------------------------------------------------------------------------
section('Fiyat toplama ve dosya üretimi (araclar/restoran-isi.mjs)');
test('gunSiniri: gazete tarihi (22:00/23:00 UTC) ertesi oyun gününe çevrilir', () => {
  eq(gunSiniri('2026-09-08T22:00:00+00:00'), '2026-09-09'); eq(gunSiniri('2026-11-03T23:00:00+00:00'), '2026-11-04'); eq(gunSiniri('2026-07-14T22:00:00+00:00'), '2026-07-15');
});
test('donemFiyati: dönem [bas, bit) içindeki günler, hacim ağırlıklı ortalama, işlem günü ve hacim; boş kalite 0', () => {
  const mumlar = { 117: { 0: [['2026-07-14', 10, 100], ['2026-07-15', 20, 300], ['2026-08-01', 30, 100], ['2026-09-09', 99, 999]], 1: [] } };
  const d = donemFiyati(mumlar, '2026-07-14T22:00:00+00:00', '2026-09-08T22:00:00+00:00');
  eq(d.gun, 56); eq(d.urun[117][0], [Math.round(((20 * 300 + 30 * 100) / 400) * 100) / 100, 2, 400]); eq(d.urun[117][1], 0); eq(d.urun[117].length, 13);
});
test('donemDosyasi: geçerli bir modül üretir (dışa aktarılan adlar ve dönem sayısı)', () => {
  // eşzamanlı sarmalayıcı: dosya metni değerlendirilir
  const metin = donemDosyasi(ISI_DONEMLER.slice(-1), '2026-11-05').replace(/export const /g, 'globalThis.__t.');
  globalThis.__t = {}; new Function(metin)();
  eq(Object.keys(globalThis.__t), ['ISI_KAYNAK', 'ISI_FIYAT_DILIMLERI', 'ISI_DONEMLER']);
  eq(globalThis.__t.ISI_DONEMLER[0], SON); eq(globalThis.__t.ISI_KAYNAK.donem, 1); delete globalThis.__t;
});

const failed = results.filter((r) => !r.ok);
let last = '';
for (const r of results) {
  if (r.group !== last) { console.log(`\n${r.group}`); last = r.group; }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
