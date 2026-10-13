// DentSimco — Optimum Seviye hesap motoru
//
// Arayüzsüz, saf fonksiyonlar: tarayıcıda ve Node'da aynen çalışır; DOM, ağ ya da Firestore bilgisi içermez.
// Formüller yalnız bu dosyadadır ve yayın kopyasında en güçlü ayarla gizlenir (araclar/gizle.mjs, FORMUL).
// Ekran dosyası (optimum.js) yalnız sayfaDurumu() sonucunu görür: ürün, kalite, seviye, kâr ve sınır; formül,
// katsayı ya da ara değer (fiyat, girdi maliyeti, saatlik üretim, pazar büyüklüğü) ekrana gitmez.
// Soru: bir üretim binası kaç seviye olsun ve ne üretsin? Yanıt iki sınırın küçüğüdür:
//   • Yönetim gideri sınırı: ek seviyenin kârı, kendi maaşına ve şirketin TÜM maaşlarına eklediği yönetim giderine eşitlenir.
//   • Pazar sınırı: borsadaki günlük satışın en çok "pazar payı" kadarı satılır (daha fazlası fiyatı bozar).
// Veri: meta/optimum_r0 (son 28 günün borsa özeti; gece sinyal/optimum.mjs yazar) ve Güncel için canlı borsa (live/r0).
// Formüller hesap.js ile aynı: yönetim gideri = (toplam seviye − 1) ÷ 170, net = brüt × (1 − yönetici tasarrufu),
// maaş = taban maaş × seviye × (1 + net), borsa komisyonu %4, taşıma = taşıma birimi × taşıma fiyatı, faz ve rekreasyon hızı.
//
// Kâr modeli (bir bina türü, seviye L; şirketin geri kalanı sabit):
//   a = seviye başına saatlik satış geliri: üretim × (fiyat × 0,96 − taşıma),  b = saatlik girdi maliyeti,  w = taban maaş
//   P = pazar payı × pazar (seviye cinsinden). Çalışan seviye A = min(L, P); pazarı aşan seviye boşta kalır: üretmez,
//   girdi ve maaş ödemez ama seviyesi yönetim giderine girer (hesap.js: inşaattaki bina gibi).
//   C(L) = (Wo + A·w) · (1 + (Lo + L − 1) · k),   k = (1 − tasarruf) ÷ 170
//          Lo, Wo: şirketin diğer binalarının toplam seviyesi ve saatlik taban maaşı (yoksa 0: tek binalı şirket)
//   Günlük kâr(L) = 24 · [A · (a − b) − (C(L) − C(0))]
//   Sınırsız en iyi seviye L* = (a − b − w − k · (w · (Lo − 1) + Wo)) ÷ (2 · w · k);  öneri = L* ile P'nin küçüğü (tam sayı)
// Pazar (seviye) = günlük satış ÷ 24 ÷ seviye başına saatlik üretim: o kalitenin bütün pazarını tek başına beslemek kaç seviye eder.
//
// Kontrat (isteğe bağlı; kullanıcı yazar): bir ürün × kalite için günlük adet K ve fiyat pc. Kullanıcının bildiği gerçek bir sayıdır
// (piyasada ölçülemez), seviyeyle büyümez. İki satış kanalı birim net gelire göre büyükten küçüğe doldurulur:
//   kontrat K adede kadar (net = pc − yarım taşıma; komisyon yok), borsa pazar payı kadar; üstü boşta kalır.
//   Gelir parçalı doğrusal ve içbükeydir, kâr hâlâ tek tepelidir: aday seviyeler kanal sınırları ve her kanalın kendi L*'ıdır.
//   Adet "%50" yazılırsa Üretim kurulumundaki mevcut üretimin yarısına çevrilir ve sabit sayı olarak kullanılır.
//   Fiyat dolar ("48") ya da borsa fiyatından indirim ("%4") yazılır; boşsa %3 indirim varsayılır. Aynı ürün × kalite için
//   birden çok satır adetçe toplanır, fiyat adetle ağırlıklı ortalamadır.

import * as H from './hesap.js';
import { parseNum, parsePrice } from './sayi.js';

export const PAYLAR = [0.1, 0.25, 0.4];
export const VARSAYILAN_PAY = 0.25;
const GUN_PAYI = 0.5; // kalite, pencerenin en az yarısında işlem görmeli (seyrek işlemin fiyatı yanıltır)
const UC_FIYAT_KAT = 5; // kalitenin fiyatı Q0'ın bu katını aşıyorsa (birkaç uç işlem) satır kullanılmaz
const TAZE_SA = 6; // Güncel: son işlemi bundan eski fiyat yerine 28 günlük ortalama kullanılır
const ESKI_SA = 36; // 28 günlük özet bundan eskiyse sayfa uyarır
// 2025-10 – 2026-10 geçmişi: 28 günlük ortalama satış hacmi aydan aya medyanda ±%32 değişti (pazar sınırlı uyarısında)
export const HACIM_OYNAKLIK_PCT = 32;
// Güncel: başka ürün en az bu kadar daha kârlıysa "ürünü değiştir" denir (günlük $ ve 28 günlük önerinin kârına oran)
const DEGISIM_ESIGI_USD = 1000;
const DEGISIM_ESIGI_PAY = 0.05;
export const FAZ_ADLARI = ['Resesyon', 'Normal', 'Boom'];
const MEVSIM_BINALARI = ['t', 'u', 'z', 'I']; // mevsimlik pazarlar: burada satılan ürünler mevsimliktir
const KONTRAT_INDIRIM = 3; // kontrat fiyatı boş bırakılırsa borsa fiyatının bu kadar yüzde altı (oyuncular çoğunlukla böyle yapıyor)
const KONTRAT_INDIRIM_ARALIK = [-50, 90]; // yazılan indirim yüzdesi bu aralıkta olmalı (eksi: borsadan pahalı)
const KONTRAT_EN_COK_ADET = 1e10;
export const KONTRAT_EN_COK = 30; // kayıtlı kontrat satırı sayısı
const SAAT_MS = 3_600_000;

const num = (x, d = 0) => (x !== null && x !== '' && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);

// ---------------------------------------------------------------------------------------------------------------
// Veri
// ---------------------------------------------------------------------------------------------------------------

/** meta/optimum_r0 belgesi → okuyucu. Pencerenin yarısından azında işlem gören kalite "yok" sayılır. */
export function ozetOku(doc) {
  if (!doc || !doc.u || !(doc.k > 0)) return null;
  const enAz = Math.ceil(doc.k * GUN_PAYI);
  const kayit = (id, q) => {
    const x = doc.u[id]?.[q];
    return Array.isArray(x) && x[0] > 0 && x[1] > 0 && x[2] >= enAz ? x : null;
  };
  const kaliteler = (id) => Object.keys(doc.u[id] || {}).map(Number).filter((q) => kayit(id, q)).sort((a, b) => a - b);
  return { t: num(doc.t, null), gun: doc.gun, bas: doc.bas, k: doc.k, n: doc.n, enAz, kayit, kaliteler };
}

/** 28 günlük ortalama fiyat (VWAP). Dönüş: (ürün, kalite) → { p, kaynak: 'ort' } | null */
export const ortFiyat = (oz) => (id, q) => {
  const x = oz.kayit(id, q);
  return x ? { p: x[0], kaynak: 'ort' } : null;
};

/**
 * Güncel fiyat: canlı son işlem fiyatı (son işlem ≤ 6 saat önceyse), yoksa 28 günlük ortalama.
 * live: live/r{r} belgesi { t, items: { ürün: [zaman, { kalite: [fiyat, arz, satış, tutar, sonİşlemZamanı] }] } }
 */
export const canliFiyat = (oz, live, simdi = Date.now()) => (id, q) => {
  const x = oz.kayit(id, q);
  if (!x) return null;
  const v = live?.items?.[id]?.[1]?.[q];
  const p = Number(v?.[0]);
  const lt = Number(v?.[4]);
  if (p > 0 && lt > 0 && simdi - lt <= TAZE_SA * SAAT_MS) return { p, kaynak: 'canli', lt };
  return { p: x[0], kaynak: 'ort' };
};

/** Mevsimlik ürünler: oyun verisinde sezonu olanlar ve mevsimlik pazarlarda satılanlar (Noel ağacı, Cadı kostümü …) */
export function mevsimlikUrunler(rawProducts, core) {
  const out = new Set();
  for (const [k, p] of Object.entries(rawProducts || {})) {
    if (p && (p.productionSeason || p.retailSeason)) out.add(Number(p.id ?? k));
  }
  for (const b of MEVSIM_BINALARI) for (const id of core?.SALES?.[b] || []) out.add(Number(id));
  return out;
}

/** Sayfada gösterilen ürün: üretim binasında üretilir, borsada işlem görür, araştırma ya da mevsimlik değildir */
function uygunMu(data, p, mevsimlik = new Set()) {
  return Boolean(p) && !p.research && p.tradable !== false && p.perHour > 0 && Boolean(p.building)
    && p.building !== H.LAUNCH_PAD && H.buildingCategory(data, p.building) === 'production' && !mevsimlik.has(p.id);
}

// ---------------------------------------------------------------------------------------------------------------
// Ürün × kalite satırları: seviye başına saatlik gelir, girdi maliyeti, maaş ve pazar büyüklüğü
// ---------------------------------------------------------------------------------------------------------------

/**
 * @param o.data      hesap.js normalizeData çıktısı
 * @param o.oz        ozetOku çıktısı (pazar büyüklüğü her zaman 28 günlük satıştan)
 * @param o.fiyat     ortFiyat(oz) ya da canliFiyat(oz, live, simdi)
 * @param o.faz       0 Resesyon, 1 Normal, 2 Boom (üretim hızı)
 * @param o.kurulum   Üretim kurulumundan { recreation, extraBonusPct } (rekreasyon ve elle hız bonusu)
 * @param o.olaylar   true: etkin üretim hızı olayları uygulanır (yalnız Güncel)
 * @param o.kontrat   (ürün, kalite, { phTaban, ref }) → { K, pc } | null: kullanıcının kontratı (adet/gün, fiyat)
 */
export function satirlar({ data, oz, fiyat, mevsimlik, faz = 0, kurulum, olaylar = false, simdi = Date.now(), kontrat }) {
  const out = [];
  if (!data || !oz) return out;
  const tp = fiyat(H.TRANSPORT_ID, 0)?.p ?? 0;
  const mev = mevsimlik || new Set();
  const ayar = { economyPhase: faz, recreation: kurulum?.recreation || {}, extraBonusPct: num(kurulum?.extraBonusPct, 0) };
  for (const p of Object.values(data.products)) {
    if (!uygunMu(data, p, mev)) continue;
    const bonus = H.speedBonus(ayar, H.buildingCategory(data, p.building));
    if (bonus >= 1) continue;
    const olay = olaylar ? H.activeEventPct(data, p.id, simdi) : 0;
    const ph = (p.perHour * H.phaseSpeedFactor(data, ayar, p) * (1 + olay / 100)) / (1 - bonus);
    if (!(ph > 0)) continue;
    const phTaban = olay ? (p.perHour * H.phaseSpeedFactor(data, ayar, p)) / (1 - bonus) : ph; // olaysız: "mevcut üretim" yüzdesi buna göre çevrilir
    const q0 = fiyat(p.id, 0)?.p ?? null;
    for (const q of H.hasQuality(p) ? oz.kaliteler(p.id) : [0]) {
      const k = oz.kayit(p.id, q);
      const f = k && fiyat(p.id, q);
      if (!f) continue;
      if (q > 0 && q0 != null && f.p > UC_FIYAT_KAT * q0) continue;
      let girdi = 0;
      let girdiOrt = false;
      let eksik = false;
      for (const [iid, miktar] of p.inputs) {
        const ip = data.products[iid];
        const nitelik = H.hasQuality(ip);
        let en = null;
        for (let iq = nitelik ? H.minInputQuality(q) : 0; iq <= (nitelik ? H.MAX_QUALITY : 0); iq++) {
          const x = fiyat(iid, iq);
          if (x && (!en || x.p < en.p)) en = x;
        }
        if (!en) { eksik = true; break; }
        girdi += miktar * en.p;
        if (en.kaynak !== 'canli') girdiOrt = true;
      }
      if (eksik) continue;
      const net = H.saleUnitNet(f.p, p.transport, tp, 'exchange');
      const pazar = k[1] / 24 / ph;
      const kt = kontrat?.(p.id, q, { phTaban, ref: f.p }) || null;
      if (pazar < 1 && !kt) continue; // bütün pazar bir seviyeyi bile beslemiyor (kontratı olan ürün kalır)
      out.push({
        id: p.id, q, harf: p.building, fiyat: f.p, kaynak: f.kaynak, girdi, girdiOrt, net, ph, phTaban,
        a: ph * net, b: ph * girdi, g: ph * (net - girdi), w: p.baseSalary, adet: k[1], gun: k[2], pazar, olay,
        // sv: kontratın kaç seviyenin üretimini karşıladığı
        kontrat: kt ? { K: kt.K, pc: kt.pc, net: H.saleUnitNet(kt.pc, p.transport, tp, 'contract'), sv: kt.K / (H.HOURS_PER_DAY * ph) } : null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Kontrat: kullanıcının yazdığı adet ve fiyat
// ---------------------------------------------------------------------------------------------------------------

/**
 * Bir kontrat satırını sayıya çevirir. g: { adet, fiyat } (kutuya yazılan metinler)
 *   adet:  "250000" (adet/gün) ya da "%50" (Üretim kurulumundaki mevcut üretimin yüzdesi; sabit adede çevrilir)
 *   fiyat: "48" (dolar) ya da "%4" (borsa fiyatından indirim; eksi: borsadan pahalı); boşsa %3 indirim
 * ctx: { uretim: bu ürünün Üretim kurulumundaki günlük üretimi (adet/gün), ref: borsa fiyatı }
 * Dönüş: { ok: true, K, pc, yuzde } | { ok: false, hata: 'adet' | 'uretimYok' | 'fiyat' }
 */
export function kontratCoz(g, { uretim = 0, ref = 0 } = {}) {
  const adetMetin = String(g?.adet ?? '').trim();
  const yuzdeAdet = adetMetin.includes('%');
  const v = yuzdeAdet ? parseNum(adetMetin) : parsePrice(adetMetin);
  if (!(v > 0)) return { ok: false, hata: 'adet' };
  let K;
  if (yuzdeAdet) {
    if (v > 100) return { ok: false, hata: 'adet' };
    if (!(uretim > 0)) return { ok: false, hata: 'uretimYok' };
    K = (uretim * v) / 100;
  } else {
    K = v;
  }
  if (!(K > 0) || K > KONTRAT_EN_COK_ADET) return { ok: false, hata: 'adet' };
  const fiyatMetin = String(g?.fiyat ?? '').trim();
  let pc;
  if (!fiyatMetin) {
    pc = ref * (1 - KONTRAT_INDIRIM / 100);
  } else if (fiyatMetin.includes('%')) {
    const d = parseNum(fiyatMetin);
    if (d == null || d < KONTRAT_INDIRIM_ARALIK[0] || d > KONTRAT_INDIRIM_ARALIK[1]) return { ok: false, hata: 'fiyat' };
    pc = ref * (1 - d / 100);
  } else {
    pc = parsePrice(fiyatMetin, { ref });
  }
  if (!(pc > 0) || pc > 1e9) return { ok: false, hata: 'fiyat' };
  return { ok: true, K, pc, yuzde: yuzdeAdet ? v : null };
}

// Aynı ürün × kalite için çözülmüş satırlar tek kontrata birleşir: adet toplanır, fiyat adetle ağırlıklı ortalama olur
const kontratBirlestir = (liste) => {
  const K = liste.reduce((t, r) => t + r.K, 0);
  return { K, pc: liste.reduce((t, r) => t + r.K * r.pc, 0) / K };
};

// Üretim kurulumundaki binaların bu ürünü günde kaç adet ürettiği (inşaattaki bina üretmez)
function uretimGunluk(kurulum, data, id, phTaban) {
  let sv = 0;
  for (const b of kurulum?.buildings || []) if (Number(b?.product) === id && !b.construction) sv += H.buildingLevels(b, data);
  return sv * phTaban * H.HOURS_PER_DAY;
}

// ---------------------------------------------------------------------------------------------------------------
// Şirket: yönetici tasarrufu ve diğer binalar
// ---------------------------------------------------------------------------------------------------------------

/**
 * company: Yönetim sekmesinin şirket kaydı (yonetici.js), kurulum: Üretim kurulumu (dentsimco.uretim.r{r}).
 * Dönüş: s (tasarruf, 0–1), ekipVar, sirketVar (toplam seviye biliniyor mu), toplamSeviye, tabanMaasSaat,
 *        kendi: {harf: {seviye, maas (saatlik taban), bina}} Üretim kurulumundaki binalar
 */
export function sirketOzeti({ company, kurulum, data } = {}) {
  const ex = Array.isArray(company?.executives) ? company.executives : [];
  const team = H.teamEffects(ex, { bankLevel: company?.finance?.bankLevel });
  const s = Math.min(100, Math.max(0, num(team.adminSavingsPct, 0))) / 100;
  const ekipVar = ex.some((e) => e && e.active !== false);
  const L = Math.max(0, Math.floor(num(company?.admin?.totalLevels, 0)));
  const gunluk = Math.max(0, num(company?.admin?.wagesDay, 0));
  // girilen günlük maaş yönetim gideri dahildir: taban = maaş ÷ (1 + brüt × (1 − tasarruf)) (yonetici.js companyBases ile aynı)
  const W = L > 0 && gunluk > 0 ? gunluk / (1 + H.grossOverhead(L) * (1 - s)) / H.HOURS_PER_DAY : 0;
  const kendi = {};
  for (const b of kurulum?.buildings || []) {
    const p = data?.products?.[b?.product];
    const harf = b?.type || p?.building;
    if (!harf) continue;
    const sv = H.buildingLevels(b, data);
    const robot = b.robots && (!data || H.buildingCategory(data, harf) !== 'research'); // hesap.js buildingRate ile aynı
    const maas = b.construction ? 0 : num(p?.baseSalary, 0) * sv * (robot ? H.ROBOT_WAGE_FACTOR : 1);
    const x = (kendi[harf] ||= { seviye: 0, maas: 0, bina: 0 });
    x.seviye += sv;
    x.maas += maas;
    x.bina += 1;
  }
  return { s, ekipVar, sirketVar: L > 0, toplamSeviye: L, tabanMaasSaat: W, kendi };
}

/** Bir bina türü için şirketin geri kalanı: toplamdan bu türün kendi seviyesi ve maaşı çıkarılır */
export function digerleri(sirket, harf) {
  if (!sirket?.sirketVar) return { Lo: 0, Wo: 0 };
  const k = sirket.kendi?.[harf] || { seviye: 0, maas: 0 };
  return { Lo: Math.max(0, sirket.toplamSeviye - k.seviye), Wo: Math.max(0, sirket.tabanMaasSaat - k.maas) };
}

// ---------------------------------------------------------------------------------------------------------------
// Seviye ve kâr
// ---------------------------------------------------------------------------------------------------------------

const kOf = (s) => Math.max(0, 1 - num(s, 0)) / H.ADMIN_LEVELS_PER_UNIT;

/**
 * Satış kanalları, birim net gelirden (seviye başına saatlik a) büyükten küçüğe, seviye cinsinden aralıklarla:
 * borsa [0, pay × pazar] ve varsa kontrat [sv]. Eşitlikte kontrat önce. Her kanal: { kont, a, sv, lo, hi }.
 */
function kanallar(x, pay) {
  const liste = [{ kont: false, a: x.a, sv: pay * x.pazar }];
  if (x.kontrat) liste.push({ kont: true, a: x.ph * x.kontrat.net, sv: x.kontrat.sv });
  liste.sort((p, q) => q.a - p.a || (q.kont ? 1 : 0) - (p.kont ? 1 : 0));
  let kum = 0;
  return liste.map((c) => {
    const lo = kum;
    kum += c.sv;
    return { ...c, lo, hi: kum };
  });
}
const satilabilirSv = (x, pay) => (x.kontrat ? pay * x.pazar + x.kontrat.sv : pay * x.pazar);

/** Seviye L'de günlük kâr ($). x: satirlar() satırı; o: { s, pay, Lo, Wo }. Satılamayan seviye boşta kalır. */
export function gunlukKar(L, x, { s = 0, pay = VARSAYILAN_PAY, Lo = 0, Wo = 0 } = {}) {
  const k = kOf(s);
  const ch = kanallar(x, pay);
  const A = Math.min(L, ch[ch.length - 1].hi);
  let gelir = 0;
  for (const c of ch) gelir += c.a * Math.max(0, Math.min(A, c.hi) - c.lo);
  const C = (l, calisan) => (Wo + calisan * x.w) * (1 + Math.max(Lo + l - 1, 0) * k);
  return H.HOURS_PER_DAY * (gelir - x.b * A - (C(L, A) - C(0, 0)));
}

/**
 * En kârlı tam sayı seviye. Dönüş: { L, kar, sinir, Ly, P }
 *   sinir: 'pazar' (pazar payı bağlıyor) | 'yonetim' (yönetim gideri bağlıyor) | 'zarar' (bir seviye bile kâr etmiyor)
 */
export function optimum(x, o = {}) {
  const { s = 0, pay = VARSAYILAN_PAY, Lo = 0, Wo = 0 } = o;
  const k = kOf(s);
  const ch = kanallar(x, pay);
  const P = ch[ch.length - 1].hi; // satılabilen toplam (seviye): borsa payı + kontrat
  // Birim geliri a olan kanalda sınırsız en iyi seviye
  const yonetimSv = (a) => {
    const g = a - x.b;
    if (k > 0 && x.w > 0) return (g - x.w - k * (x.w * (Lo - 1) + Wo)) / (2 * x.w * k);
    return g > x.w ? Infinity : 0; // tasarruf %100 ya da maaşsız bina: yalnız satış sınırlar
  };
  const Ly = yonetimSv(ch[ch.length - 1].a);
  // 1: diğer binaların seviyesi yokken (Lo = 0) ilk seviye yönetim gideri eklemez; kâr 0 ile 1 arasında sıçrar, L* bunu görmez
  const ham = [0, 1, P];
  for (const c of ch) ham.push(c.lo, c.hi, Math.max(c.lo, Math.min(c.hi, yonetimSv(c.a))));
  const adaylar = new Set(ham.flatMap((v) => [Math.floor(v), Math.ceil(v)]).filter((v) => Number.isFinite(v) && v >= 0));
  let L = 0;
  let kar = 0;
  for (const c of adaylar) {
    const v = gunlukKar(c, x, { s, pay, Lo, Wo });
    if (v > kar + 1e-9) { kar = v; L = c; }
  }
  const sinir = L === 0 ? (P < 1 ? 'pazar' : 'zarar') : Ly > P ? 'pazar' : 'yonetim';
  return { L, kar, sinir, Ly, P };
}

const grupla = (rows, anahtar) => {
  const m = new Map();
  for (const r of rows) {
    const k = anahtar(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};
const sirala = (a, b) => b.kar - a.kar || b.L - a.L || b.x.g / b.x.w - a.x.g / a.x.w;

/**
 * 28 günlük öneri: her bina türü için en kârlı ürün × kalite ve seviye.
 * o: { s, pay, sirket } (sirket: sirketOzeti çıktısı; yoksa tek binalı şirket)
 * Dönüş: [{ harf, en: {L, kar, sinir, x}, secenekler: [...] }] günlük kâra göre sıralı
 */
export function binaOnerileri(rows, o = {}) {
  const out = [];
  for (const [harf, list] of grupla(rows, (x) => x.harf)) {
    const d = digerleri(o.sirket, harf);
    const sec = list.map((x) => ({ ...optimum(x, { ...o, ...d }), x })).sort(sirala);
    out.push({ harf, en: sec[0], secenekler: sec });
  }
  return out.sort((a, b) => sirala(a.en, b.en));
}

/** Tüm ürünler: her ürünün en kârlı kalitesi ve seviyesi (kendi bina türündeki diğer binalar dahil) */
export function urunOnerileri(rows, o = {}) {
  const out = [];
  for (const [id, list] of grupla(rows, (x) => x.id)) {
    const d = digerleri(o.sirket, list[0].harf);
    const sec = list.map((x) => ({ ...optimum(x, { ...o, ...d }), x })).sort(sirala);
    out.push({ id, harf: list[0].harf, en: sec[0], secenekler: sec });
  }
  return out.sort((a, b) => sirala(a.en, b.en));
}

/**
 * Güncel: seviye sabitken (sizin seviyeniz, yoksa 28 günlük öneri) canlı fiyatla en kârlı ürün ve kalite.
 * Seviye önermez; seviyeyi haftalık değiştirmek geçmiş sınamada kazandırmadı, ürün seçimini değiştirmek kazandırdı.
 * o: { s, pay, sirket, seviye: (harf) => { L, kaynak: 'sizin' | 'oneri' }, oneri: (harf) => { id, q } | null }
 * Dönüş: [{ harf, L, kaynak, en: {x, kar}, onerilen: {x, kar} | null, fark, pazarAsimi }]
 */
export function guncelOneriler(rows, o = {}) {
  const out = [];
  for (const [harf, list] of grupla(rows, (x) => x.harf)) {
    const ref = o.seviye?.(harf) || { L: 0, kaynak: 'oneri' };
    const L = Math.max(0, Math.floor(num(ref.L, 0)));
    const hesapL = L > 0 ? L : 1; // önerilmeyen bina: bir seviye için en iyisi gösterilir
    const d = digerleri(o.sirket, harf);
    const sec = list.map((x) => ({ x, kar: gunlukKar(hesapL, x, { ...o, ...d }) })).sort((a, b) => b.kar - a.kar);
    const en = sec[0];
    const hedef = o.oneri?.(harf);
    const onerilen = hedef ? sec.find((y) => y.x.id === hedef.id && y.x.q === hedef.q) || null : null;
    const fark = onerilen ? en.kar - onerilen.kar : null;
    const ayni = !onerilen || (onerilen.x.id === en.x.id && onerilen.x.q === en.x.q);
    out.push({
      harf, L, hesapL, kaynak: ref.kaynak, en, onerilen, fark,
      // 'ayni': 28 günlük öneri hâlâ en iyisi | 'degistir': başka ürün belirgin daha kârlı | 'yakin': fark küçük
      durum: ayni ? 'ayni' : fark >= Math.max(DEGISIM_ESIGI_USD, DEGISIM_ESIGI_PAY * Math.abs(onerilen.kar)) ? 'degistir' : 'yakin',
      // 28 günlük öneri pazar sınırını yukarı yuvarlar (son seviye kısmen boşta); uyarı ancak bundan fazlasında çıkar
      pazarAsimi: hesapL > Math.ceil(satilabilirSv(en.x, o.pay ?? VARSAYILAN_PAY)),
    });
  }
  return out.sort((a, b) => b.en.kar - a.en.kar);
}

/** Fazı seç: kullanıcının seçimi ('auto' | 0 | 1 | 2) ve oyunun güncel evresi (loadGamePhase) → 0–2 */
export function fazSec(secim, oyun) {
  if (secim === 0 || secim === 1 || secim === 2) return secim;
  return oyun && [0, 1, 2].includes(oyun.index) ? oyun.index : 0;
}

/** 28 günlük özet ne kadar eski (saat) ve uyarı gerekir mi */
const ozetYasi = (oz, simdi = Date.now()) => (oz?.t ? (simdi - oz.t) / SAAT_MS : null);
export const ozetEskiMi = (oz, simdi = Date.now()) => {
  const y = ozetYasi(oz, simdi);
  return y != null && y > ESKI_SA;
};

// ---------------------------------------------------------------------------------------------------------------
// Sayfa durumu: ekran yalnız sonucu görür
// ---------------------------------------------------------------------------------------------------------------

const KARSILASTIRMA = 6; // "Diğer seçenekler" tablosundaki satır

// Seviye L'de satışın kaç seviyesi kontrattan, kaçı borsadan karşılanıyor
function dagitim(x, pay, L) {
  const ch = kanallar(x, pay);
  const A = Math.min(L, ch[ch.length - 1].hi);
  let kontratSv = 0;
  let borsaSv = 0;
  for (const c of ch) {
    const v = Math.max(0, Math.min(A, c.hi) - c.lo);
    if (c.kont) kontratSv += v; else borsaSv += v;
  }
  return { kontratSv, borsaSv };
}
const kontratBilgi = (x, L, pay) => {
  if (!x.kontrat) return null;
  const d = dagitim(x, pay, L);
  return { adet: x.kontrat.K, fiyat: x.kontrat.pc, fark: x.kontrat.pc / x.fiyat - 1, kontratSv: d.kontratSv, borsaSv: d.borsaSv };
};
const sonuc = (e, pay) => ({ id: e.x.id, q: e.x.q, L: e.L, kar: e.kar, sinir: e.sinir, kontrat: kontratBilgi(e.x, e.L, pay) });

/**
 * Yüklenen veri + tercihler + tarayıcı kayıtları → ekranın göstereceği sonuç.
 * Dönüş yalnız gösterilecek alanları taşır (ürün, kalite, seviye, kâr, sınır, durum); ara değer yoktur.
 *   binalar: [{ harf, id, q, L, kar, sinir, kontrat, secenekler: [{ id, q, L, kar, sinir, kontrat }] }]  sizin binalarınız önde
 *   urunler: [{ harf, id, q, L, kar, sinir, kontrat }]
 *   guncel:  [{ harf, L, hesapL, kaynak, id, q, kar, canli, girdiOrt, olay, kontrat, onerilen: { id, q, kar } | null, fark, durum, pazarAsimi }]
 *   kontrat: { adet, fiyat, fark (kontrat fiyatı ÷ borsa fiyatı − 1), kontratSv, borsaSv } | null  (yalnız kullanıcının yazdığı kontrat)
 *   kontratlar: [{ i, id, q, durum: 'ok' | 'adet' | 'uretimYok' | 'fiyat' | 'veri', adet, fiyat, yuzde, fark }]  yazılan her satırın durumu
 *   urunSecenek: [{ id, kaliteler: [q], ana }]  kontrat eklerken seçilebilen ürün ve kaliteler (ana: en çok işlem gören)
 * kontratlar (girdi): [{ id, q, adet: 'metin', fiyat: 'metin' }] kullanıcının yazdıkları (en çok KONTRAT_EN_COK)
 */
export function sayfaDurumu({ data, mevsimlik, ozet, live, company, kurulum, gamePhase, prefs, kontratlar, simdi = Date.now() }) {
  const oz = ozetOku(ozet);
  const sirket = sirketOzeti({ company, kurulum, data });
  const faz = fazSec(prefs.faz, gamePhase);
  const kendi = Object.fromEntries(Object.entries(sirket.kendi).map(([h, x]) => [h, x.seviye]));
  const st = {
    oz: oz ? { t: oz.t, gun: oz.gun, bas: oz.bas } : null, eski: ozetEskiMi(oz, simdi),
    sirket: { s: sirket.s, ekipVar: sirket.ekipVar, sirketVar: sirket.sirketVar, toplamSeviye: sirket.toplamSeviye, kendi },
    faz, gamePhase, prefs, simdi, liveT: live?.t ?? null, binalar: [], urunler: [], guncel: [], kontratlar: [], urunSecenek: [],
  };
  if (!oz || !data) return st;
  const ortak = { data, oz, mevsimlik, faz, kurulum };
  const opt = { s: sirket.s, pay: prefs.pay, sirket };
  const sizde = (h) => (kendi[h] > 0 ? 1 : 0);
  const giris = (Array.isArray(kontratlar) ? kontratlar : []).slice(0, KONTRAT_EN_COK)
    .map((g) => ({ id: Number(g?.id), q: Number(g?.q) || 0, adet: g?.adet, fiyat: g?.fiyat }));
  const kontratFn = (id, q, { phTaban, ref }) => {
    const r = giris.filter((g) => g.id === id && g.q === q)
      .map((g) => kontratCoz(g, { uretim: uretimGunluk(kurulum, data, id, phTaban), ref })).filter((x) => x.ok);
    return r.length ? kontratBirlestir(r) : null;
  };
  const satir28 = satirlar({ ...ortak, fiyat: ortFiyat(oz), kontrat: kontratFn });
  const binalar = binaOnerileri(satir28, opt).sort((a, b) => sizde(b.harf) - sizde(a.harf)); // sort kararlı: kâr sırası korunur
  const oneri = new Map(binalar.map((b) => [b.harf, b.en]));
  st.binalar = binalar.map((b) => ({ harf: b.harf, ...sonuc(b.en, opt.pay), secenekler: b.secenekler.slice(0, KARSILASTIRMA).map((e) => sonuc(e, opt.pay)) }));
  st.urunler = urunOnerileri(satir28, opt).map((u) => ({ harf: u.harf, ...sonuc(u.en, opt.pay) }));
  // Yazılan her kontrat satırının durumu (hatalar satır yanında gösterilir)
  st.kontratlar = giris.map((g, i) => {
    const satir = satir28.find((r) => r.id === g.id && r.q === g.q);
    if (!satir) return { i, id: g.id, q: g.q, durum: 'veri' };
    const r = kontratCoz(g, { uretim: uretimGunluk(kurulum, data, g.id, satir.phTaban), ref: satir.fiyat });
    if (!r.ok) return { i, id: g.id, q: g.q, durum: r.hata };
    return { i, id: g.id, q: g.q, durum: 'ok', adet: r.K, fiyat: r.pc, yuzde: r.yuzde, fark: r.pc / satir.fiyat - 1 };
  });
  const secenek = new Map();
  for (const r of satir28) {
    const e = secenek.get(r.id) || { id: r.id, kaliteler: [], ana: r.q, anaAdet: -1 };
    e.kaliteler.push(r.q);
    if (r.adet > e.anaAdet) { e.anaAdet = r.adet; e.ana = r.q; }
    secenek.set(r.id, e);
  }
  st.urunSecenek = [...secenek.values()].map((e) => ({ id: e.id, kaliteler: e.kaliteler.sort((a, b) => a - b), ana: e.ana }));
  const satirG = satirlar({ ...ortak, fiyat: canliFiyat(oz, live, simdi), olaylar: true, simdi, kontrat: kontratFn });
  st.guncel = guncelOneriler(satirG, {
    ...opt,
    seviye: (h) => (kendi[h] > 0 ? { L: kendi[h], kaynak: 'sizin' } : { L: oneri.get(h)?.L || 0, kaynak: 'oneri' }),
    oneri: (h) => (oneri.get(h) ? { id: oneri.get(h).x.id, q: oneri.get(h).x.q } : null),
  }).sort((a, b) => sizde(b.harf) - sizde(a.harf)).map((g) => ({
    harf: g.harf, L: g.L, hesapL: g.hesapL, kaynak: g.kaynak,
    id: g.en.x.id, q: g.en.x.q, kar: g.en.kar, canli: g.en.x.kaynak === 'canli', girdiOrt: g.en.x.girdiOrt, olay: g.en.x.olay,
    kontrat: kontratBilgi(g.en.x, g.hesapL, opt.pay),
    onerilen: g.onerilen ? { id: g.onerilen.x.id, q: g.onerilen.x.q, kar: g.onerilen.kar } : null,
    fark: g.fark, durum: g.durum, pazarAsimi: g.pazarAsimi,
  }));
  return st;
}
