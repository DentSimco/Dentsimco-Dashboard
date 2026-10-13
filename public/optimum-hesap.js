// DentSimco — Optimum Seviye hesap motoru
//
// Arayüzsüz, saf fonksiyonlar: tarayıcıda ve Node'da aynen çalışır; DOM, ağ ya da Firestore bilgisi içermez.
// Formüller yalnız bu dosyadadır ve yayın kopyasında en güçlü ayarla gizlenir (araclar/gizle.mjs, FORMUL).
// Not: gizleme aracı isteğe bağlı fonksiyon çağrısının ?. kısmını düşürüyor (f?.(x) → f(x)); bu dosyada f ? f(x) : null yazılır.
// Ekran dosyası (optimum.js) yalnız sayfaDurumu() sonucunu görür: ürün, kalite, seviye, kâr ve sınır; formül,
// katsayı ya da ara değer (fiyat, girdi maliyeti, saatlik üretim, pazar büyüklüğü) ekrana gitmez.
// Soru: bir üretim binası kaç seviye olsun ve ne üretsin? Yanıt iki sınırın küçüğüdür:
//   • Yönetim gideri sınırı: ek seviyenin kârı, kendi maaşına ve şirketin TÜM maaşlarına eklediği yönetim giderine eşitlenir.
//   • Pazar sınırı: borsadaki günlük satışın en çok "pazar payı" kadarı satılır (daha fazlası fiyatı bozar).
// Veri: meta/optimum_r0 (son 28 günün borsa özeti; gece sinyal/optimum.mjs yazar) ve canlı borsa (live/r0).
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
import * as H from './hesap.js';
import * as R from './hesap-perakende.js';

export const PAYLAR = [0.1, 0.25, 0.5, 1]; // hazır seçenekler; kullanıcı 1 – 100 arası kendi oranını da yazabilir
export const VARSAYILAN_PAY = 0.25;
export const SINIRSIZ = Infinity; // "Tüm Ürün Satışına Göre": pazar sınırı yok, her seviyenin üretimi borsa fiyatından satılır
const SEVIYE_TAVAN = 100000; // sınırsız satışta, yönetim gideri hiç bağlamıyorsa (tasarruf %100) en çok bu seviye aranır
const GUN_PAYI = 0.5; // kalite, pencerenin en az yarısında işlem görmeli (seyrek işlemin fiyatı yanıltır)
const UC_FIYAT_KAT = 5; // kalitenin fiyatı Q0'ın bu katını aşıyorsa (birkaç uç işlem) satır kullanılmaz
const SON_ISLEM_GUN = 28; // son işlem fiyatı en çok bu kadar gün eskiyse kullanılır
const ESKI_SA = 36; // 28 günlük özet bundan eskiyse sayfa uyarır
export const FAZ_ADLARI = ['Resesyon', 'Normal', 'Boom'];
const MEVSIM_BINALARI = ['t', 'u', 'z', 'I']; // mevsimlik pazarlar: burada satılan ürünler mevsimliktir
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
  // Borsada kaç gün işlem gördüğü (pencere içinde): özette yeterli kaydı olmayan kalite için de bilinir
  const islemGunu = (id, q) => { const x = doc.u[id]?.[q]; return Array.isArray(x) && x[2] > 0 ? Math.min(Math.floor(x[2]), doc.k) : 0; };
  return { t: num(doc.t, null), gun: doc.gun, bas: doc.bas, k: doc.k, n: doc.n, enAz, kayit, kaliteler, islemGunu };
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
/**
 * Satış fiyatı: 28 günlük ortalama, yoksa son işlem fiyatı (canlı belgedeki son işlem, en çok 28 gün önce).
 * Borsada seyrek işlem gören kaliteler (örn. kahve Q10) için; "Tüm Ürün Satışına Göre" seçicisinde kullanılır.
 * Dönüş: { p, kaynak: 'ort' | 'son' } | null
 */
export const sonFiyat = (oz, live, simdi = Date.now()) => (id, q) => {
  const x = oz.kayit(id, q);
  if (x) return { p: x[0], kaynak: 'ort' };
  const v = live?.items?.[id]?.[1]?.[q];
  const p = Number(v?.[0]);
  const lt = Number(v?.[4]);
  return p > 0 && lt > 0 && simdi - lt <= SON_ISLEM_GUN * 24 * SAAT_MS ? { p, kaynak: 'son', lt } : null;
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
 * @param o.fiyat     ortFiyat(oz) ya da sonFiyat(oz, live, simdi)
 * @param o.faz       0 Resesyon, 1 Normal, 2 Boom (üretim hızı)
 * @param o.kurulum   Üretim kurulumundan { recreation, extraBonusPct } (rekreasyon ve elle hız bonusu)
 * @param o.satisFiyat ürünün KENDİ satış fiyatı (varsayılan fiyat); girdiler her zaman fiyat ile fiyatlanır
 * @param o.tumKaliteler true: özette olmayan kaliteler de (satisFiyat bir fiyat verirse) satır olur; pazar büyüklüğü bilinmez,
 *                       bir seviyeyi beslemese de satır kalır (yalnız pazar sınırsız hesapta kullanılır)
 */
export function satirlar({ data, oz, fiyat, mevsimlik, faz = 0, kurulum, satisFiyat, tumKaliteler = false }) {
  const out = [];
  if (!data || !oz) return out;
  const tp = fiyat(H.TRANSPORT_ID, 0)?.p ?? 0;
  const mev = mevsimlik || new Set();
  const ayar = { economyPhase: faz, recreation: kurulum?.recreation || {}, extraBonusPct: num(kurulum?.extraBonusPct, 0) };
  for (const p of Object.values(data.products)) {
    if (!uygunMu(data, p, mev)) continue;
    const bonus = H.speedBonus(ayar, H.buildingCategory(data, p.building));
    if (bonus >= 1) continue;
    const ph = (p.perHour * H.phaseSpeedFactor(data, ayar, p)) / (1 - bonus);
    if (!(ph > 0)) continue;
    const sat = satisFiyat || fiyat;
    const q0 = sat(p.id, 0)?.p ?? null;
    const kaliteler = H.hasQuality(p) ? (tumKaliteler ? Array.from({ length: H.MAX_QUALITY + 1 }, (_, i) => i) : oz.kaliteler(p.id)) : [0];
    for (const q of kaliteler) {
      const k = oz.kayit(p.id, q);
      const f = tumKaliteler ? sat(p.id, q) : k && sat(p.id, q);
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
      const pazar = k ? k[1] / 24 / ph : 0;
      if (pazar < 1 && !tumKaliteler) continue; // bütün pazar bir seviyeyi bile beslemiyor
      out.push({
        id: p.id, q, harf: p.building, fiyat: f.p, kaynak: f.kaynak, lt: f.lt, gun: oz.islemGunu(p.id, q), girdi, girdiOrt, net, ph,
        a: ph * net, b: ph * girdi, g: ph * (net - girdi), w: p.baseSalary, adet: k ? k[1] : 0, gun: k ? k[2] : 0, pazar,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Şirket: yönetici tasarrufu ve diğer binalar
// ---------------------------------------------------------------------------------------------------------------

/**
 * company: Yönetim sekmesinin şirket kaydı (yonetici.js), kurulum: Üretim kurulumu (dentsimco.uretim.r{r}).
 * Dönüş: s (tasarruf, 0–1), ekipVar, sirketVar (toplam seviye biliniyor mu), toplamSeviye, tabanMaasSaat,
 *        kendi: {harf: {seviye, maas (saatlik taban), bina}} Üretim kurulumundaki binalar
 */
export function sirketOzeti({ company, kurulum, data, ek } = {}) {
  const ex = Array.isArray(company?.executives) ? company.executives : [];
  const team = H.teamEffects(ex, { bankLevel: company?.finance?.bankLevel });
  const s = Math.min(100, Math.max(0, num(team.adminSavingsPct, 0))) / 100;
  const ekipVar = ex.some((e) => e && e.active !== false);
  const L0 = Math.max(0, Math.floor(num(company?.admin?.totalLevels, 0)));
  const L = L0 + Math.max(0, Math.floor(num(ek?.seviye, 0))); // ek: Üretim'e yeni eklenen, şirket kaydına henüz işlenmemiş seviyeler
  const gunluk = Math.max(0, num(company?.admin?.wagesDay, 0));
  // girilen günlük maaş yönetim gideri dahildir: taban = maaş ÷ (1 + brüt × (1 − tasarruf)) (yonetici.js companyBases ile aynı)
  const W = (L0 > 0 && gunluk > 0 ? gunluk / (1 + H.grossOverhead(L0) * (1 - s)) / H.HOURS_PER_DAY : 0) + Math.max(0, num(ek?.maas, 0));
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
 * Satış kanalı: borsa [0, pay × pazar] seviye aralığı (sınırsızda en çok SEVIYE_TAVAN); birim net gelir seviye başına saatlik a.
 * Her kanal: { a, sv, lo, hi }. (Tek kanal; hesap kanal listesi üzerinden yazıldığı için liste döner.)
 */
function kanallar(x, pay) {
  return [{ a: x.a, sv: pay === SINIRSIZ ? SEVIYE_TAVAN : pay * x.pazar, lo: 0, hi: pay === SINIRSIZ ? SEVIYE_TAVAN : pay * x.pazar }];
}

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
  const P = ch[ch.length - 1].hi; // satılabilen toplam (seviye): borsa payı
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

const sonuc = (e) => ({ id: e.x.id, q: e.x.q, L: e.L, kar: e.kar, sinir: e.sinir });

/**
 * Perakende: mağaza (bina) × ürün × kalite için ideal seviye; satış ve alım sınırsız (mağazanın seviye başına saatlik satışı
 * seviyeyle azalmaz, istenen kadar ürün borsadan alınır). Fiyat en kârlı fiyattır; maliyet borsanın güncel fiyatı.
 * Seviye, şirketin bugünkü binalarının üstüne eklenir: ek seviyenin kârı, maaşına ve şirketin bütün maaşlarına eklediği
 * yönetim giderine eşitlenince durur (üretimdeki hesapla aynı).
 * pk: { kurulum: Perakende kaydı { recreation, salesSpeedPct, buildings }, saturation: { ürün: doygunluk }, qualityWeight }
 *   liste:   [{ harf, id, q, L, kar, sinir, fiyat }]  her mağazanın en kârlı ürünü (kâra göre)
 *   urunler: [{ harf, id, q, L, kar, sinir, fiyat }]  her mağaza × ürün için en kârlı kalite
 *   secenek: [{ harf, urunler: [{ id, kaliteler: [q], ana }] }]
 *   secim:   { harf, id, q }
 *   hesap:   { harf, id, q, L, kar, sinir, fiyat, maliyet, sonT, yalniz, yari, buyuk, kaliteler: [{ q, L, kar }], ayni, toplamSonra }
 *     sonT: borsada son işlemin zamanı (maliyet fiyatı buradan); yalniz: ek seviye 0 ise başka binası olmayan şirket için en kârlı seviye
 *   bonus:   toplam satış hızı bonusu (yüzde: rekreasyon + elle + yönetim ekibi)
 */
const PK_DISLANAN = new Set(['r', 'B']); // Restoran ayrı planlanır; Satış ofisi ölçülmez (Perakende sayfasıyla aynı)
function pkDurumu({ data, live, company, sirket, faz, pk, secim }) {
  const out = { liste: [], urunler: [], secenek: [], secim: null, hesap: null, bonus: 0, veriYok: false };
  const doygun = pk?.saturation || {};
  if (!Object.keys(doygun).length) { out.veriYok = true; return out; }
  const kur = pk?.kurulum || {};
  const ekip = H.teamEffects(Array.isArray(company?.executives) ? company.executives : [], { bankLevel: company?.finance?.bankLevel });
  const bonusPct = R.retailBonusPct({
    otherSpeedPct: num(kur.salesSpeedPct, 0) + H.recreationBonus(kur.recreation || {}) * 100,
    teamSalesSpeedPct: Math.max(0, num(ekip.salesSpeedPct, 0)),
  });
  out.bonus = bonusPct;
  const piyasa = (id, q) => { const p = Number(live?.items?.[id]?.[1]?.[q]?.[0]); return p > 0 ? p : null; };
  const sonIslem = (id, q) => { const t = Number(live?.items?.[id]?.[1]?.[q]?.[4]); return t > 0 ? t : null; }; // borsada son işlemin zamanı
  const diger = { s: sirket.s, pay: SINIRSIZ, Lo: sirket.sirketVar ? sirket.toplamSeviye : 0, Wo: sirket.sirketVar ? sirket.tabanMaasSaat : 0 };
  const satirlar = [];
  for (const harf of R.retailLetters()) {
    if (PK_DISLANAN.has(harf)) continue;
    for (const id of R.buildingProducts(harf, faz)) {
      const kaliteli = H.hasQuality(data.products?.[id]);
      for (let q = 0; q <= (kaliteli ? R.MAX_QUALITY : 0); q++) {
        const maliyet = piyasa(id, q);
        if (maliyet == null && q > 0) continue; // borsada fiyatı olmayan kalite hesaplanamaz
        const r = R.calcProduct({ economy: faz, productId: id, quality: q, saturation: doygun[id], cAct: maliyet, bonusPct, qualityWeight: pk?.qualityWeight, wage: 0 });
        if (!r.ok) continue;
        const w = R.storeWage({ modelW: r.model.W, salaryModifier: data.buildings?.[harf]?.salaryModifier, averageSalary: data.averageSalary, adminNet: 0 });
        const a = r.sellable ? Math.max(0, r.marginHourPerLevel) : 0;
        const x = { id, q, harf, a, b: 0, w, g: a, pazar: 0, ph: 1 };
        const e = optimum(x, diger);
        satirlar.push({ harf, id, q, x, L: e.L, kar: e.kar, sinir: e.sinir === 'pazar' ? 'yonetim' : e.sinir, fiyat: r.price, maliyet: r.cAct, sonT: sonIslem(id, q) });
      }
    }
  }
  if (!satirlar.length) { out.veriYok = true; return out; }
  const sirala = (a, b) => b.kar - a.kar || b.L - a.L;
  const sade = (e) => ({ harf: e.harf, id: e.id, q: e.q, L: e.L, kar: e.kar, sinir: e.sinir, fiyat: e.fiyat });
  const harfler = new Map();
  for (const e of satirlar) { if (!harfler.has(e.harf)) harfler.set(e.harf, []); harfler.get(e.harf).push(e); }
  const sirali = [...harfler.entries()].map(([harf, l]) => [harf, l.sort(sirala)]).sort((a, b) => sirala(a[1][0], b[1][0]));
  out.liste = sirali.map(([, l]) => sade(l[0]));
  for (const [, l] of sirali) {
    const enIyi = new Map();
    for (const e of l) if (!enIyi.has(e.id)) enIyi.set(e.id, e);
    for (const e of enIyi.values()) out.urunler.push(sade(e));
  }
  out.secenek = sirali.map(([harf, l]) => {
    const m = new Map();
    for (const e of l) {
      const u = m.get(e.id) || { id: e.id, kaliteler: [], ana: e.q };
      u.kaliteler.push(e.q);
      m.set(e.id, u);
    }
    return { harf, urunler: [...m.values()].map((u) => ({ ...u, kaliteler: u.kaliteler.sort((a, c) => a - c) })) };
  });
  const h = out.secenek.find((e) => e.harf === secim?.harf) || out.secenek[0];
  const u = h.urunler.find((e) => e.id === Number(secim?.id)) || h.urunler[0];
  const q = u.kaliteler.includes(Number(secim?.q)) ? Number(secim.q) : u.ana;
  out.secim = { harf: h.harf, id: u.id, q };
  const grup = satirlar.filter((e) => e.harf === h.harf && e.id === u.id);
  const sec = grup.find((e) => e.q === q);
  const kar = (L) => gunlukKar(L, sec.x, diger);
  let ayni = 0;
  for (const b of Array.isArray(kur.buildings) ? kur.buildings : []) {
    if (b?.letter === h.harf && Number(b.product) === u.id && !b.construction && R.clampQuality(b.quality) === q) ayni += Math.max(0, Math.floor(num(b.level, 0)));
  }
  out.hesap = {
    harf: h.harf, id: u.id, q, L: sec.L, kar: sec.kar, sinir: sec.sinir, fiyat: sec.fiyat, maliyet: sec.maliyet, sonT: sec.sonT,
    // ek seviye kâr getirmiyorsa: şirketin diğer binaları olmasaydı en kârlı seviye (bilgi için)
    yalniz: sec.L === 0 ? (({ L, kar: k }) => ({ L, kar: k }))(optimum(sec.x, { s: sirket.s, pay: SINIRSIZ })) : null,
    yari: sec.L >= 2 ? { L: Math.round(sec.L / 2), kar: kar(Math.round(sec.L / 2)) } : null,
    buyuk: sec.L >= 2 ? { L: Math.round(sec.L * 1.5), kar: kar(Math.round(sec.L * 1.5)) } : null,
    kaliteler: grup.map((e) => ({ q: e.q, L: e.L, kar: e.kar })).sort((a, b) => a.q - b.q),
    ayni, toplamSonra: sirket.toplamSeviye + sec.L,
  };
  return out;
}

// Üretim'e yeni eklenen ama şirket kaydına henüz işlenmemiş binalar: [{ id (ürün), L }] → toplam seviye ve taban maaş (saatlik)
function ekToplami(data, ekler) {
  let seviye = 0;
  let maas = 0;
  for (const e of Array.isArray(ekler) ? ekler : []) {
    const L = Math.max(0, Math.floor(num(e?.L, 0)));
    seviye += L;
    // perakende (pk): mağazanın seviye başı taban maaşı = bina maaş çarpanı × ortalama maaş; üretim: ürünün taban maaşı
    maas += L * (e?.pk ? num(data?.buildings?.[e?.harf]?.salaryModifier, 0) * num(data?.averageSalary, 345) : num(data?.products?.[e?.id]?.baseSalary, 0));
  }
  return { seviye, maas };
}

/**
 * "Tüm Ürün Satışına Göre": pazar sınırı yok. Her bina türü için en kârlı ürün × kalite ve seviye (28 günlük sekmeyle aynı
 * liste, satış sınırsız) ve seçilen bina × ürün × kalite için, şirketin bugünkü binalarının ÜSTÜNE eklenecek en kârlı seviye.
 *   secenek: [{ harf, urunler: [{ id, kaliteler: [q], ana }] }]  seçici için (kâr sırasıyla)
 *   secim:   { harf, id, q }  seçilen (seçilmemiş ya da geçersizse en kârlı bina, ürün ve kalite)
 *   hesap:   { harf, id, q, L, kar, sinir, son, yari, buyuk, kaliteler: [{ q, L, kar, son, gun }], islem: { gun, pencere, sonT }, yalniz, ayni, toplamSonra }
 *     son: fiyat 28 günlük ortalamadan değil son işlemden (borsada seyrek işlem gören kalite)
 *     yari / buyuk: önerilen seviyenin yarısında ve bir buçuk katında günlük kâr ({ L, kar }); L < 2 ise null
 *     ayni: Üretim'de aynı bina türü, ürün ve kalitede zaten kurulu seviye
 */
function tumDurumu({ ortak, oz, sirket, kurulum, data, secim, live, simdi }) {
  const satirT = satirlar({ ...ortak, fiyat: ortFiyat(oz) });
  // Seçici ve hesap için: borsada seyrek işlem gören kaliteler de (son işlem fiyatıyla) ve pazarı bir seviyeden küçük olanlar dahil.
  // Listeler (en kârlı ürün) yalnız yeterli işlem gören kalitelerle kalır: tek bir işlemin fiyatı öneriyi belirlemesin.
  // Girdiler de aynı fiyatla (yüksek kalite için girdinin yüksek kalitesi de seyrek işlem görebilir).
  const sonF = sonFiyat(oz, live, simdi);
  const satirH = satirlar({ ...ortak, fiyat: sonF, satisFiyat: sonF, tumKaliteler: true, simdi });
  const opt = { s: sirket.s, pay: SINIRSIZ, sirket };
  const kendi = (h) => (sirket.kendi?.[h]?.seviye > 0 ? 1 : 0);
  const sonucT = (e) => { const r = sonuc(e); return { ...r, sinir: r.sinir === 'pazar' ? 'yonetim' : r.sinir }; };
  const binalar = binaOnerileri(satirT, opt).sort((a, b) => kendi(b.harf) - kendi(a.harf));
  const out = {
    binalar: binalar.map((b) => ({ harf: b.harf, ...sonucT(b.en), secenekler: b.secenekler.slice(0, KARSILASTIRMA).map(sonucT) })),
    urunler: urunOnerileri(satirT, opt).map((u) => ({ harf: u.harf, ...sonucT(u.en) })),
    secenek: [], secim: null, hesap: null,
  };
  const enIyi = new Map(binalar.map((b) => [b.harf, b.en.x]));
  const tumu = new Map(binaOnerileri(satirH, opt).map((b) => [b.harf, b.secenekler]));
  out.secenek = binalar.map((b) => b.harf).concat([...tumu.keys()].filter((h) => !enIyi.has(h))).map((harf) => {
    // ana: önerilen (★) kalite = en kârlı kalite; yalnız son işlemden fiyatlanan (seyrek) kaliteler, güvenilir fiyatlı kalite varken önerilmez
    const m = new Map();
    for (const e of tumu.get(harf) || []) {
      const u = m.get(e.x.id) || { id: e.x.id, kaliteler: [], ana: null, ilk: e.x.q };
      u.kaliteler.push(e.x.q);
      if (u.ana == null && e.x.kaynak !== 'son') u.ana = e.x.q;
      m.set(e.x.id, u);
    }
    for (const u of m.values()) if (u.ana == null) u.ana = u.ilk;
    return { harf, urunler: [...m.values()].map(({ ilk, ...u }) => ({ ...u, kaliteler: u.kaliteler.sort((a, c) => a - c) })) };
  }).filter((e) => e.urunler.length);
  if (!out.secenek.length) return out;
  const h = out.secenek.find((e) => e.harf === secim?.harf) || out.secenek[0];
  const oneri = enIyi.get(h.harf); // listedeki en kârlı ürün: ürün seçilmediyse o gösterilir
  const u = h.urunler.find((e) => e.id === Number(secim?.id)) || h.urunler.find((e) => e.id === oneri?.id) || h.urunler[0];
  const q = u.kaliteler.includes(Number(secim?.q)) ? Number(secim.q) : u.ana; // kalite seçilmediyse önerilen (★) kalite
  out.secim = { harf: h.harf, id: u.id, q };
  const diger = { s: sirket.s, pay: SINIRSIZ, Lo: sirket.sirketVar ? sirket.toplamSeviye : 0, Wo: sirket.sirketVar ? sirket.tabanMaasSaat : 0 };
  const hesapla = (x) => {
    const e = optimum(x, diger);
    return { q: x.q, L: e.L, kar: e.kar, sinir: e.sinir === 'pazar' ? 'yonetim' : e.sinir, son: x.kaynak === 'son', gun: x.gun, x };
  };
  const satirlarU = satirH.filter((r) => r.harf === h.harf && r.id === u.id);
  const sec = hesapla(satirlarU.find((r) => r.q === q));
  const kar = (L) => gunlukKar(L, sec.x, diger);
  let ayni = 0;
  for (const b of kurulum?.buildings || []) {
    if (b?.type === h.harf && Number(b.product) === u.id && !b.construction && H.clampQuality(b.quality) === q) ayni += H.buildingLevels(b, data);
  }
  out.hesap = {
    harf: h.harf, id: u.id, q, L: sec.L, kar: sec.kar, sinir: sec.sinir, son: sec.son,
    yari: sec.L >= 2 ? { L: Math.round(sec.L / 2), kar: kar(Math.round(sec.L / 2)) } : null,
    buyuk: sec.L >= 2 ? { L: Math.round(sec.L * 1.5), kar: kar(Math.round(sec.L * 1.5)) } : null,
    kaliteler: satirlarU.map(hesapla).map(({ q: qq, L, kar: k, son, gun }) => ({ q: qq, L, kar: k, son, gun })).sort((a, b) => a.q - b.q),
    // borsa işlem sıklığı: son işlem günü sayısı / pencere; son işlemden fiyatlananda son işlemin zamanı
    islem: { gun: sec.gun, pencere: oz.k, sonT: sec.x.kaynak === 'son' ? sec.x.lt : null },
    // ek seviye kâr getirmiyorsa: şirketin diğer binaları olmasaydı en kârlı seviye (bilgi için)
    yalniz: sec.L === 0 ? (({ L, kar: k }) => ({ L, kar: k }))(optimum(sec.x, { s: sirket.s, pay: SINIRSIZ })) : null,
    ayni, toplamSonra: sirket.toplamSeviye + sec.L,
  };
  return out;
}

/**
 * Yüklenen veri + tercihler + tarayıcı kayıtları → ekranın göstereceği sonuç.
 * Dönüş yalnız gösterilecek alanları taşır (ürün, kalite, seviye, kâr, sınır); ara değer yoktur.
 *   tum: Üretim sekmesi (tumDurumu), pk: Perakende sekmesi (pkDurumu)
 * ekler: Üretim ya da Perakende'ye bu sayfadan eklenen, şirket kaydına henüz işlenmemiş binalar [{ id, L, pk?, harf? }]
 * pk: Perakende girdileri { kurulum, saturation, qualityWeight }
 */
export function sayfaDurumu({ data, mevsimlik, ozet, live, company, kurulum, gamePhase, prefs, ekler, pk, simdi = Date.now() }) {
  const oz = ozetOku(ozet);
  const sirket = sirketOzeti({ company, kurulum, data, ek: ekToplami(data, ekler) });
  const faz = fazSec(prefs.faz, gamePhase);
  const kendi = Object.fromEntries(Object.entries(sirket.kendi).map(([h, x]) => [h, x.seviye]));
  const st = {
    oz: oz ? { t: oz.t, gun: oz.gun, bas: oz.bas } : null, eski: ozetEskiMi(oz, simdi),
    sirket: { s: sirket.s, ekipVar: sirket.ekipVar, sirketVar: sirket.sirketVar, toplamSeviye: sirket.toplamSeviye, kendi },
    faz, gamePhase, prefs, simdi, liveT: live?.t ?? null,
    tum: { binalar: [], urunler: [], secenek: [], secim: null, hesap: null },
    pk: { liste: [], secenek: [], secim: null, hesap: null, bonus: 0, veriYok: false },
  };
  // Perakende bölümü özet olmadan da çalışır (canlı fiyat ve doygunluk yeter)
  if (data && pk) st.pk = pkDurumu({ data, live, company, sirket, faz, pk, secim: prefs?.pk });
  if (!oz || !data) return st;
  st.tum = tumDurumu({ ortak: { data, oz, mevsimlik, faz, kurulum }, oz, sirket, kurulum, data, secim: prefs?.hesap, live, simdi });
  return st;
}
