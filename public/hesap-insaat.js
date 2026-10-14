// DentSimco — İnşaat hesap motoru (saf hesap; ekran yok).
// Kurallar oyundan doğrulandı (6 Ekim 2026): bina ansiklopedisi ekranı, resmî inşaat rehberi ve Cooper'ın aracıyla:
//   • Her binanın bir taban maliyeti var: costUnits (oyunun bina sabitlerinde; "inşaat gereci" adedi cinsinden).
//   • Seviye n'e çıkmanın maliyeti = costUnits × çarpan(n); çarpan 1. ve 2. seviyede 1, sonra (n − 1).
//   • Bir "birim" = 4 betonarme blok + 55 tuğla + 16 kereste + 1 inşaat gereci.
//   • Süre = buildDuration × aynı çarpan. Aynı binadan birkaçı aynı anda yükselir (süre bina sayısıyla uzamaz).
//   • Hurda / seviye düşürme: düşen her seviye costUnits birim iade eder (yıkımda seviye × costUnits). Malzeme Q0 döner.
//   • Referans değeri: birim başına $3.450 (oyundaki "Referans değeri" sütunu; 2024 rehberinde 3.432'ydi).
//   • Malzemelerde kalite fark etmez; inşaat gereci kalitesizdir.

export const MALZEMELER = [
  { key: 'concrete', id: 101, ad: 'Betonarme Blok', birim: 4 },
  { key: 'bricks', id: 102, ad: 'Tuğla', birim: 55 },
  { key: 'planks', id: 108, ad: 'Kereste', birim: 16 },
  { key: 'units', id: 111, ad: 'İnşaat Gereci', birim: 1 },
];
export const REFERANS_BIRIM = 3450; // $ / birim
export const MAKS_SEVIYE = 500;
export const MAKS_SATIR = 200; // plandaki en çok satır (JSON ile içe aktarma tür × seviye satırı üretir)

// Oyunun /api/v2/constants/buildings/ yanıtından (6 Ekim 2026): harf → [costUnits, buildDuration (sn), kategori]
// Bot bu sabitleri meta/buildings belgesine yazar; ekran belgedeki alanları okur, belge eksikse bu yedek tabloyu kullanır.
export const YEDEK_BINALAR = {
  P: [2, 3600, 'production'], W: [6, 7200, 'production'], E: [15, 10800, 'production'], O: [20, 14400, 'production'],
  R: [20, 14400, 'production'], S: [15, 10800, 'production'], G: [3, 3600, 'sales'], C: [5, 3600, 'sales'],
  A: [7, 7200, 'sales'], F: [3, 7200, 'production'], 6: [4, 7200, 'production'], M: [7, 14400, 'production'],
  Y: [14, 10800, 'production'], L: [24, 18000, 'production'], T: [4, 7200, 'production'], H: [5, 10800, 'sales'],
  1: [27, 21600, 'production'], 2: [6, 10800, 'sales'], p: [30, 18000, 'research'], h: [48, 25200, 'research'],
  b: [28, 18000, 'research'], c: [28, 18000, 'research'], s: [19, 10800, 'research'], a: [40, 21600, 'research'],
  f: [21, 7200, 'research'], l: [36, 32400, 'research'], q: [24, 14400, 'research'], 3: [40, 43200, 'recreation'],
  4: [40, 43200, 'recreation'], 5: [40, 43200, 'recreation'], D: [30, 25200, 'production'], 7: [31, 21600, 'production'],
  8: [41, 21600, 'production'], 9: [33, 10800, 'production'], 0: [29, 10800, 'production'], B: [18, 7200, 'sales'],
  Q: [7, 10800, 'production'], o: [17, 18000, 'production'], x: [21, 21600, 'production'], g: [14, 7200, 'production'],
  d: [4, 14400, 'sales'], n: [40, 28800, 'other'], e: [6, 14400, 'production'], i: [8, 10800, 'production'],
  j: [11, 18000, 'production'], k: [25, 21600, 'production'], m: [30, 14400, 'production'], r: [26, 10800, 'sales'],
  t: [4, 7200, 'seasonal'], u: [5, 7200, 'seasonal'], v: [5, 7200, 'production'], y: [19, 28800, 'other'],
  z: [3, 7200, 'seasonal'], I: [2, 3600, 'seasonal'],
};

const num = (x, d = 0) => (x != null && x !== '' && Number.isFinite(Number(x)) ? Number(x) : d);
export const seviye = (x) => Math.min(MAKS_SEVIYE, Math.max(0, Math.floor(num(x, 0))));

// meta/buildings belgesi (oyunun ham yanıtı) ile yedek tabloyu birleştirir: { harf: { costUnits, sure, kategori } }
export function binaTablosu(ham) {
  const out = {};
  for (const [harf, [cu, sure, kat]] of Object.entries(YEDEK_BINALAR)) out[harf] = { costUnits: cu, sure, kategori: kat };
  for (const [harf, b] of Object.entries(ham && typeof ham === 'object' ? ham : {})) {
    const cu = num(b?.costUnits, NaN);
    const sure = num(b?.buildDuration, NaN);
    if (!(cu > 0) || !(sure > 0)) continue;
    out[harf] = { costUnits: cu, sure, kategori: String(b?.category || out[harf]?.kategori || '') };
  }
  return out;
}

// n. seviyeye çıkmanın çarpanı (n ≥ 1)
export const seviyeCarpani = (n) => (n <= 2 ? 1 : n - 1);
// a → b arası (a < b) çarpanlar toplamı
export function carpanToplami(a, b) {
  let t = 0;
  for (let n = seviye(a) + 1; n <= seviye(b); n++) t += seviyeCarpani(n);
  return t;
}

const bosMalzeme = () => ({ concrete: 0, bricks: 0, planks: 0, units: 0 });
export function malzemeOf(birim) {
  const m = bosMalzeme();
  for (const x of MALZEMELER) m[x.key] = birim * x.birim;
  return m;
}

// Bir bina için a → b yükseltmesi (b > a)
export function yukseltme(bina, a, b) {
  const carpan = carpanToplami(a, b);
  const birim = num(bina?.costUnits) * carpan;
  return { carpan, birim, malzeme: malzemeOf(birim), sureSn: num(bina?.sure) * carpan, referans: birim * REFERANS_BIRIM };
}

// Bir bina için a → b seviye düşürme ya da yıkım (b < a): düşen seviye × costUnits birim iade
export function iade(bina, a, b) {
  const dusen = Math.max(0, seviye(a) - seviye(b));
  const birim = num(bina?.costUnits) * dusen;
  return { dusen, birim, malzeme: malzemeOf(birim), referans: birim * REFERANS_BIRIM };
}

// Oyundaki gibi seviye seviye döküm (a → b, b > a)
export function seviyeDokumu(bina, a, b) {
  const rows = [];
  for (let n = seviye(a) + 1; n <= seviye(b); n++) {
    const carpan = seviyeCarpani(n);
    const birim = num(bina?.costUnits) * carpan;
    rows.push({ seviye: n, carpan, birim, malzeme: malzemeOf(birim), sureSn: num(bina?.sure) * carpan, referans: birim * REFERANS_BIRIM });
  }
  return rows;
}

// Plan satırı: { id, letter, count, from, to }  →  'yukselt' | 'iade' | 'yok'
export function satirTuru(row) {
  const a = seviye(row?.from);
  const b = seviye(row?.to);
  return b > a ? 'yukselt' : b < a ? 'iade' : 'yok';
}

export const sureMetni = (sn) => {
  if (!Number.isFinite(sn) || sn <= 0) return '—';
  const saat = Math.round(sn / 3600);
  const gun = Math.floor(saat / 24);
  const kalan = saat % 24;
  return gun ? `${gun} gün${kalan ? ` ${kalan} saat` : ''}` : `${saat} saat`;
};

// Tüm planı hesaplar.
//  plan:    { rows: [...], stock: {concrete, bricks, planks, units}, useScrap: bool }
//  tablo:   binaTablosu() sonucu
//  fiyat:   { concrete, bricks, planks, units } (birim fiyat; yoksa null)
//  secenek: { baslangic (ms) | null, nakit (sayı) | null }
export function planiHesapla(plan, tablo, fiyat = {}, { baslangic = null, nakit = null } = {}) {
  const rows = (plan?.rows || []).map((row) => {
    const bina = tablo?.[row.letter];
    const adet = Math.max(0, Math.floor(num(row.count, 0)));
    const a = seviye(row.from);
    const b = seviye(row.to);
    const tur = satirTuru(row);
    const hata = !bina ? 'Bina verisi yok' : adet < 1 ? 'Bina sayısı 1 olmalı' : null;
    if (hata || tur === 'yok') return { id: row.id, letter: row.letter, adet, a, b, tur, hata, birimBina: 0, birim: 0, malzeme: bosMalzeme(), sureSn: 0, referans: 0 };
    const x = tur === 'yukselt' ? yukseltme(bina, a, b) : iade(bina, a, b);
    const kat = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v * adet]));
    return {
      id: row.id, letter: row.letter, adet, a, b, tur, hata: null,
      birimBina: x.birim, birim: x.birim * adet, malzeme: kat(x.malzeme), bina: x.malzeme,
      sureSn: tur === 'yukselt' ? x.sureSn : 0, referans: x.referans * adet,
    };
  });

  const topla = (tur) => rows.filter((x) => x.tur === tur && !x.hata).reduce((t, x) => {
    for (const m of MALZEMELER) t[m.key] += x.malzeme[m.key];
    return t;
  }, bosMalzeme());
  const gerekli = topla('yukselt');
  const geriGelen = topla('iade');
  const stok = Object.fromEntries(MALZEMELER.map((m) => [m.key, Math.max(0, num(plan?.stock?.[m.key], 0))]));
  const dusulen = plan?.useScrap === false ? bosMalzeme() : geriGelen;

  const alinacak = {};
  const maliyet = {};
  let toplam = 0;
  let eksikFiyat = false;
  let piyasaDegeri = 0; // stoksuz, iadesiz: bu plan satın alınsaydı
  for (const m of MALZEMELER) {
    alinacak[m.key] = Math.max(0, gerekli[m.key] - stok[m.key] - dusulen[m.key]);
    const p = fiyat?.[m.key];
    if (alinacak[m.key] > 0 && !(p > 0)) eksikFiyat = true;
    maliyet[m.key] = p > 0 ? alinacak[m.key] * p : null;
    if (maliyet[m.key] != null) toplam += maliyet[m.key];
    if (gerekli[m.key] > 0 && p > 0) piyasaDegeri += gerekli[m.key] * p;
  }
  const gerekliBirim = gerekli.units; // 1 birim = 1 inşaat gereci
  const referans = gerekliBirim * REFERANS_BIRIM;
  const iadeBirim = geriGelen.units;
  const iadeReferans = iadeBirim * REFERANS_BIRIM;

  const enUzunSn = rows.reduce((t, x) => Math.max(t, x.sureSn), 0);
  const bitis = baslangic != null && enUzunSn > 0 ? baslangic + enUzunSn * 1000 : null;
  const fark = nakit != null && Number.isFinite(nakit) ? nakit - toplam : null;

  return {
    rows, gerekli, geriGelen, dusulen, stok, alinacak, maliyet, toplam, eksikFiyat,
    referans, iadeReferans, piyasaDegeri,
    // oyundaki "maliyet enflasyonu": piyasa değeri referanstan ne kadar sapıyor (negatif = ucuza inşa)
    referansaFark: referans > 0 && piyasaDegeri > 0 && !eksikFiyat ? piyasaDegeri / referans - 1 : null,
    enUzunSn, bitis, nakitFarki: fark,
  };
}

// Plan kaydı (tarayıcı): temizleme
export function planTemizle(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const rows = (Array.isArray(p.rows) ? p.rows : []).filter((x) => x && typeof x === 'object').slice(0, MAKS_SATIR).map((x, i) => ({
    id: String(x.id || `s${i}`), letter: String(x.letter ?? ''), count: Math.min(9999, Math.max(1, Math.floor(num(x.count, 1)))),
    from: seviye(x.from), to: seviye(x.to),
  }));
  const stock = Object.fromEntries(MALZEMELER.map((m) => [m.key, Math.max(0, Math.floor(num(p.stock?.[m.key], 0)))]));
  const manual = Object.fromEntries(MALZEMELER.map((m) => [m.key, p.manual?.[m.key] != null && p.manual[m.key] !== '' && num(p.manual[m.key], 0) > 0 ? num(p.manual[m.key]) : null]));
  return {
    v: 1, rows, stock, manual,
    useScrap: p.useScrap !== false,
    priceMode: ['last', 'vwap'].includes(p.priceMode) ? p.priceMode : 'last',
    start: Number.isFinite(Number(p.start)) && p.start != null ? Number(p.start) : null,
  };
}

// ---- "JSON ekle": oyunun /api/v2/companies/me/buildings/ yanıtı --------------------------------------------------
// Yanıt bir bina listesidir (ya da { buildings: [...] }); her binada harf (kind) ve seviye (level) vardır. Aynı tür ve
// aynı seviyedeki binalar tek satırda toplanır. Hedef seviye mevcut seviyeye eşit konur: kullanıcı hedefi kendisi girer.
// Sonuç: { parsed: [{ letter, count, from, to }], bulunan, tur, taninmayan: [harf] } ya da { error, link? }.
export function binalariOku(text, tablo = binaTablosu(null)) {
  const t = String(text ?? '').trim();
  if (!t) return { error: 'Kutu boş. Adresi açın, açılan sayfadaki metnin tamamını kopyalayıp yapıştırın.' };
  if (/^(?:https?:\/\/)?(?:www\.)?simcompanies\.com\/api\/v\d+\/companies\/(?:me|\d+)\/buildings\/?(?:\?\S*)?$/i.test(t)) {
    return { error: 'Bu adresin kendisi, sayfanın içeriği değil. Adresi açın (oyuna girişli olmalısınız), açılan sayfadaki metnin tamamını seçip kopyalayın ve buraya yapıştırın.',
      link: 'https://www.simcompanies.com/api/v2/companies/me/buildings/' };
  }
  if (/^<(!doctype|html|head|body)/i.test(t)) return { error: 'Yapıştırdığınız şey bir web sayfası, veri değil. Oyuna girişliyken adresi açın ve sayfadaki metni kopyalayın.' };
  let obj;
  try { obj = JSON.parse(t); } catch { return { error: 'Metin okunamadı. Sayfadaki metnin tamamını kopyaladığınızdan emin olun.' }; }
  if (obj && !Array.isArray(obj) && !obj.buildings && (typeof obj.detail === 'string' || typeof obj.message === 'string')) {
    return { error: 'Oyun veri yerine hata döndürdü. Oyuna girişli olduğunuzdan ve saatinizin doğru olduğundan emin olun.' };
  }
  const list = Array.isArray(obj) ? obj : Array.isArray(obj?.buildings) ? obj.buildings : null;
  if (!list) return { error: 'Metin okunamadı. Sayfadaki metnin tamamını kopyaladığınızdan emin olun.' };
  const gruplar = new Map();
  const taninmayan = new Set();
  let bulunan = 0;
  for (const b of list) {
    if (!b || typeof b !== 'object') continue;
    const harf = String(b.kind ?? b.buildingKind ?? '');
    if (!harf) continue;
    if (!tablo?.[harf]) { taninmayan.add(harf); continue; }
    const lv = seviye(b.level ?? b.currentLevel ?? 0);
    const key = `${harf}|${lv}`;
    const g = gruplar.get(key);
    if (g) g.count++; else gruplar.set(key, { letter: harf, count: 1, from: lv, to: lv });
    bulunan++;
  }
  if (!bulunan) return { error: 'Listede tanınan bina bulunamadı.', taninmayan: [...taninmayan] };
  const parsed = [...gruplar.values()].sort((x, y) => (x.letter < y.letter ? -1 : x.letter > y.letter ? 1 : x.from - y.from));
  return { parsed, bulunan, tur: new Set(parsed.map((x) => x.letter)).size, taninmayan: [...taninmayan] };
}
