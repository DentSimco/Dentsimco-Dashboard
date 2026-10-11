// DentSimco — Sinyaller (yalnız gösterim)
// Hesap ÖZEL depoda (sinyal/motor.mjs) her gece yapılır ve meta/sinyal_r{realm} belgesine yazılır.
// Bu dosya o belgeyi okur ve kodları Türkçe metne çevirir; formül, katsayı ya da ara değer içermez.
//
// Belge (kısaltılmış alanlar):
//   t: son hesap zamanı (gün içi çalışmalar da günceller), tn: gece hesabının zamanı, gun: son tam veri günü, makro: {m7, rejim, cmt, cmtGun}, evre: {ad, bas, bit, yeni}
//   olaylar: [[ürün, hız %, başlangıç, bitiş, durum]], sezon: {id: [tip, başlangıç, bitiş, faz]}
//   kalite: {id: [en iyi kalite, marj %, Q0 marjı %]}, karne: {onsel, canli: {kova: [n, yükselen payı, ort.]}}
//   urun: {id: {q: {e, u, s:[eylem, güç], a:[eylem, güç], t, m, r:[gerekçe], o:[[olay]], z, k}}}
//     e: 14 günlük beklenti, yarım yüzde adımı (e ÷ 200 = oran)
//     p: hesap fiyatı (beklentinin hesaplandığı fiyat). Hedef fiyat = p × (1 + e ÷ 200)
//     l: 1 = gece bayrağı likit | g: 1 = gün içi, canlı son işlem fiyatıyla hesaplandı | b: bekleyen eylem yönü (titreşim önleme)
//     h: [hedef fiyat, yön] gece hesabının hedefi | v: [olay kodu, zaman] gün içi olay (hd+, hd-, ky, ka); olayda sinyal hemen yenilenir
//   karne.gunici: gün içi (canlı fiyatlı) sinyallerin karnesi, canli ile aynı biçim

import { readDocs, dataField, loadBasics, PATHS, fmtDate, fmtDateTime, fmtAgo, fmtPct, fmtPrice, HOUR } from './veri.js';
import { loadPerakendeSinyal, karMi, zararMi } from './perakende-sinyal.js';
import { binaAdi } from './adlar.js';
import { LOCALE } from './i18n.js';

const PREFS_KEY = 'dentsimco.sinyal.v1';
const BORSA_KEY = 'dentsimco.borsa.v1';
const LIST_MAX = 15;

// İşaret ile yüzde arasına sözcük birleştirici (U+2060): satır sonunda "−" ile "%6" ayrılmasın
const pctInt = (x) => (x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}\u2060%${Math.abs(Math.round(x))}`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---- Veri ----

export async function loadSignals(r, options) {
  const path = PATHS.meta(`sinyal_r${r}`);
  const docs = await readDocs([path], options);
  return dataField(docs.get(path)) || null;
}

function readPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { p = {}; }
  const tab = p.tab === 'sezon' || p.tab === 'olay' ? 'takvim' : typeof p.tab === 'string' ? p.tab : 'satici'; // Mevsim ve Olaylar Takvim altına taşındı
  return { tab, q: Number.isInteger(p.q) || p.q === 'tum' ? p.q : 0, tuccar: p.tuccar === true };
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* gizli sekme */ }
}

export const tuccarAcik = () => readPrefs().tuccar;

// ---- Metinler ----

const GUC = ['normal', 'zayıf', 'orta', 'güçlü'];

const EYLEM = {
  satici: {
    TUT: { ad: 'TUT', yon: 'up', metin: 'Satışı ertele: 14 gün içinde fiyatın yükselmesi bekleniyor.' },
    SAT: { ad: 'SAT', yon: '', metin: 'Normal: ürettikçe satmaya devam et.' },
    HSAT: { ad: 'SAT', yon: 'down', metin: 'Bekletme: 14 gün içinde fiyatın düşmesi bekleniyor.' }, // normal SAT'tan çubuk ve renkle ayrılır
  },
  alici: {
    BEKLE: { ad: 'BEKLE', yon: 'down', metin: 'Girdi alımını ertele: fiyatın düşmesi bekleniyor.' },
    AL: { ad: 'AL', yon: '', metin: 'Normal: ihtiyacın kadar al.' },
    STOKLA: { ad: 'AL', yon: 'up', metin: 'İhtiyacını şimdiden al: fiyatın yükselmesi bekleniyor.' }, // normal AL'dan çubuk ve renkle ayrılır
  },
};
const EYLEM_HAFIF = { AL1: 'Alımı biraz öne çekebilirsin.', SAT_SEZON: 'Sezonda alıcı çok: şimdi sat.' };

const DERECE = ['', 'biraz', 'belirgin biçimde', 'çok'];
function gerekce(code) {
  let m = /^p([+-])(\d)$/.exec(code);
  if (m) return `Fiyat, yakın dönem ortalamasının ${DERECE[m[2]]} ${m[1] === '+' ? 'üstünde' : 'altında'}`;
  m = /^c([+-])(\d)$/.exec(code);
  if (m) return m[1] === '+' ? `Maliyet, yakın dönem ortalamasının ${DERECE[m[2]]} üstünde: fiyat genelde maliyete yetişir` : `Maliyet, yakın dönem ortalamasının ${DERECE[m[2]]} altında: fiyat genelde maliyete iner`;
  return {
    'mk+': 'Piyasa geneli yükselişte',
    'mk-': 'Piyasa geneli düşüşte',
    'sp+': 'Sert günlük yükseliş: geçmişte çoğunlukla geri döndü',
    'sp-': 'Sert günlük düşüş: geçmişte çoğunlukla toparlandı',
    'kr+': 'Yüksek hacimle 20 günlük zirve aşıldı: geçmişte vakaların ~%70\'i geri döndü',
    'kr-': 'Yüksek hacimle 20 günlük dip kırıldı: geçmişte vakaların ~%70\'i toparlandı',
    mc: 'Fiyat girdi + maaş maliyetinin altında',
    'hd+': 'Yükseliş hedefine ulaştı: sinyal yeni fiyatla yenilendi',
    'hd-': 'Düşüş hedefine ulaştı: sinyal yeni fiyatla yenilendi',
    ky: 'Son 20 günün en yüksek fiyatının üstüne çıktı: sinyal yeni fiyatla yenilendi',
    ka: 'Son 20 günün en düşük fiyatının altına indi: sinyal yeni fiyatla yenilendi',
    sz: 'Mevsim takvimine göre',
    bz: 'Ürün bozulabiliyor: uzun süre tutma',
  }[code] || null;
}

const SEZON_TIP = {
  talep: 'Sezonda fiyat primi var',
  hacim: 'Sezonda satış hacmi artıyor, fiyat primi yok',
  arz: 'Sezonda bolluk var, fiyat düşüyor',
};
function sezonMetni(s) {
  if (!s) return '';
  const [tip, bas, bit, faz] = s;
  const b = fmtDate(Date.parse(`${bas}T12:00:00Z`));
  const e = fmtDate(Date.parse(`${bit}T12:00:00Z`));
  const kalan = Math.round((Date.parse(`${bas}T00:00:00Z`) - Date.now()) / (24 * HOUR));
  const ne = {
    once: `Sezona ${Math.max(1, kalan)} gün var (${b} – ${e})`,
    sezon: `Sezondayız (${e} tarihine kadar)`,
    sonra: `Sezon ${e} tarihinde bitti`,
    dis: `Sezon dışı, sıradaki sezon ${b} – ${e}`,
  }[faz] || '';
  return `${ne}. ${SEZON_TIP[tip] || ''}.`;
}

const kovaOf = (e) => (e <= -0.04 ? 'b1' : e <= -0.02 ? 'b2' : e < 0.02 ? 'b3' : e < 0.04 ? 'b4' : 'b5');
const KOVA_AD = { b1: '−%4 ve altı', b2: '−%4 ile −%2', b3: '−%2 ile +%2', b4: '+%2 ile +%4', b5: '+%4 ve üstü' };

function gecmisCumle(doc, e) {
  const k = kovaOf(e);
  const c = doc?.karne?.canli?.[k];
  const useLive = c && c[0] >= 30;
  const [n, up, ort] = useLive ? c : doc?.karne?.onsel?.[k] || [];
  if (!n) return '';
  const kaynak = useLive ? `Bu motorun son sinyallerinde (${n} kayıt)` : 'Geçmiş sınamada';
  if (k === 'b3') return `${kaynak} bu aralıkta fiyat 14 günde vakaların %${Math.round(up * 100)}'inde yükseldi, yani yön belirsizdi.`;
  const dusus = e < 0;
  const pay = Math.round((dusus ? 1 - up : up) * 100);
  return `${kaynak} bu aralıktaki beklentilerin %${pay}'inde fiyat 14 günde ${dusus ? 'düştü' : 'yükseldi'} (ortalama gerçekleşen değişim ${fmtPct(ort)}).`;
}

function olayMetni(o, products) {
  const [k, s, until, rel, durum] = o;
  const ad = esc(products?.[k]?.name || `Ürün ${k}`);
  const hiz = `${s > 0 ? '+' : '−'}%${Math.abs(s)}`;
  const tarih = fmtDate(Date.parse(until));
  const zaman = durum === 'bitti' ? `${tarih} tarihinde bitti, etkisi tersine dönüyor` : durum === 'yakinda' ? 'yakında başlıyor' : `${tarih} tarihine kadar`;
  if (rel === 'kendi') return `Bu üründe üretim hızı ${hiz} olayı (${zaman}): ${s > 0 ? 'arz artıyor, fiyata aşağı baskı' : 'arz azalıyor, fiyata yukarı baskı'}.`;
  if (rel === 'girdi') return `Bu ürünü kullanan ${ad} için hız ${hiz} (${zaman}): ${s > 0 ? 'talep artıyor, yukarı baskı' : 'talep azalıyor, aşağı baskı'}.`;
  return `Girdisi ${ad} için hız ${hiz} (${zaman}): ${s > 0 ? 'maliyet düşüyor, aşağı baskı' : 'maliyet artıyor, yukarı baskı'}.`;
}

// Mevsimsel üründe eylem 14 günlük beklentiden değil takvimden gelir; metin de takvime göre yazılır
function sezonEylemi(rol, kod, tip, faz) {
  if (rol === 'satici') {
    if (kod === 'TUT') return tip === 'arz' ? (faz === 'sonra' ? 'Sezon sonrası fiyat toparlanıyor: satışı ertele.' : 'Sezonda fiyat dipte: elindekini sezon dışında sat.') : 'Sezon yaklaşıyor: satışı sezona sakla.';
    if (kod === 'SAT') return faz === 'sezon' ? 'Sezonda alıcı çok: şimdi sat.' : null;
    if (kod === 'HSAT') return faz === 'once' ? 'Sezonda bolluk gelir, fiyat düşer: elindekini şimdi sat.' : 'Sezon bitti, fiyat düşüyor: elindekini sat.';
  } else {
    if (kod === 'STOKLA') return tip === 'arz' ? (faz === 'sonra' ? 'Fiyat hâlâ düşük: ihtiyacını şimdi al.' : 'Sezonda ucuz: ihtiyacını şimdi al.') : 'Sezon öncesi al: sezonda fiyat primi var.';
    if (kod === 'BEKLE') return faz === 'once' ? 'Sezon gelince fiyat düşer: alımı ertele.' : 'Sezon sonrası fiyat düşüyor: alımı ertele.';
    if (kod === 'AL') return 'Normal: ihtiyacın kadar al.';
  }
  return null;
}

function eylemBilgi(rol, sig, sezon) {
  const [kod, guc] = sig || [];
  const base = EYLEM[rol]?.[kod];
  if (!base) return { ad: '—', yon: '', metin: '', guc: 0 };
  let metin = base.metin;
  if (rol === 'alici' && kod === 'AL' && guc === 1) metin = EYLEM_HAFIF.AL1;
  if (rol === 'satici' && kod === 'SAT' && guc > 0) metin = EYLEM_HAFIF.SAT_SEZON;
  if (sezon) metin = sezonEylemi(rol, kod, sezon[0], sezon[3]) || metin;
  return { ...base, metin, guc: guc || 0 };
}

const gucBar = (g) => `<span class="sg-meter" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= g ? 'on' : ''}"></i>`).join('')}</span>`;

function veriZamani(doc) {
  if (!doc) return '';
  const gun = fmtDate(Date.parse(`${doc.gun}T12:00:00Z`));
  return `${gun} verisiyle hesaplandı · ${fmtAgo(doc.t)}`;
}

const eskiMi = (doc) => doc && Date.now() - (doc.tn ?? doc.t) > 36 * HOUR; // gün içi çalışmalar gece hesabının durduğunu gizlemesin

// ---- Hedef fiyat ve tazelik rozeti ----

export const TAZE_SA = 6; // likit üründe son işlem bundan eskiyse fiyat "eski" sayılır
export const ESKI_ESIK = 0.05; // canlı fiyat hesap fiyatından bu kadar oynadıysa sinyal "eski"
export const GUNCEL_ESIK = 0.10; // likit ve taze üründe bu kadar oynadıysa "Güncelleniyor"
const YENI_HESAP_SA = 2; // "Güncelleniyor" yalnız son hesap bu kadar yeniyse söylenir (gün içi çalışma duruyorsa söylenmez)

// Hedef fiyat = hesap fiyatı × (1 + beklenti). Hesap fiyatı olmayan eski belgelerde null.
export function hedefFiyat(e) {
  return e && e.e != null && e.p > 0 ? e.p * (1 + e.e / 200) : null;
}

// Canlı kayıt: [fiyat, arz, satış, tutar, sonİşlemZamanı] (live/r{r}). Dönüş: null (rozet yok) ya da
//   { tip: 'bayat', lt }                      likit üründe son işlem >6 sa önce
//   { tip: 'degisti', fark }                  canlı fiyat hesap fiyatından ≥%5 oynadı
//   { tip: 'guncelleniyor', fark }            likit ve taze üründe ≥%10 oynadı, gün içi hesap yakında yenileyecek
// Likit olmayan üründe son işlemin eski olması normaldir (ince piyasa): yalnız taze fiyat oynadıysa rozet çıkar.
export function tazelik(e, canli, simdi = Date.now(), docT = null) {
  if (!e || e.e == null || !(e.p > 0)) return null;
  const fiyat = Number(canli?.[0]);
  const lt = Number(canli?.[4]);
  if (!(fiyat > 0) || !(lt > 0)) return null;
  const g = e.g === 1;
  if (simdi - lt > TAZE_SA * HOUR) return e.l === 1 ? { tip: 'bayat', lt, g } : null;
  const fark = fiyat / e.p - 1;
  const yeniden = e.l === 1 && (docT == null || simdi - docT <= YENI_HESAP_SA * HOUR);
  if (Math.abs(fark) >= GUNCEL_ESIK && yeniden) return { tip: 'guncelleniyor', fark, g };
  if (Math.abs(fark) >= ESKI_ESIK) return { tip: 'degisti', fark, yeniden, g };
  return null;
}

function rozetHtml(tz, simdi) {
  if (!tz) return '';
  const yuzde = tz.fark == null ? 0 : Math.round(Math.abs(tz.fark) * 100);
  const yon = tz.fark > 0 ? 'yukarıda' : 'aşağıda';
  let metin;
  if (tz.tip === 'bayat') metin = `Son işlem ${fmtAgo(tz.lt, simdi)}. Fiyat eski olabilir; sinyal ${tz.g ? 'son hesaptaki fiyata' : 'gün sonu verisine'} dayanıyor.`;
  else if (tz.tip === 'guncelleniyor') metin = `Fiyat, hesap fiyatının %${yuzde} ${yon}. Sinyal yeniden hesaplanıyor.`;
  else metin = `Fiyat, hesap fiyatının %${yuzde} ${yon}. Sinyal eski olabilir; ${tz.yeniden ? 'birkaç saat içinde' : 'gece'} yeniden hesaplanır.`;
  return `<p class="sg-rozet" data-tip="${tz.tip}" role="status">${esc(metin)}</p>`;
}

// Gün içi olay etiketi: "Yeni sinyal · Hedefe ulaştı · 14:20"
const OLAY_AD = { 'hd+': 'Yükseliş hedefine ulaştı', 'hd-': 'Düşüş hedefine ulaştı', ky: 'Yukarı kırılım: 20 günün zirvesi aşıldı', ka: 'Yeni dip: 20 günün en düşüğü kırıldı' };
function olayHtml(e) {
  const v = e?.v;
  if (!v || !OLAY_AD[v[0]]) return '';
  const yon = v[0] === 'hd+' || v[0] === 'ky' ? 'up' : 'down';
  return `<p class="sg-olay" data-yon="${yon}"><b>Yeni sinyal</b> · <span>${esc(OLAY_AD[v[0]])}</span> · <span>${esc(fmtAgo(v[1]))}</span></p>`;
}

// ---- Borsa ekranındaki kart ----

// doc: undefined = yükleniyor, null = belge yok
export function signalCard(doc, { id, q, products, realm = 0, noQuality = false, live, now = Date.now() } = {}) {
  const head = (extra = '') => `<div class="sg-head"><h2 class="sg-title">Sinyal${noQuality ? '' : ` <span class="qtag">Q${esc(q)}</span>`}</h2>${extra}</div>`;
  if (doc === undefined) return `<section class="sg" aria-busy="true">${head()}<p class="sg-empty">Sinyal yükleniyor.</p></section>`;
  if (!doc) {
    return `<section class="sg">${head()}<p class="sg-empty">Sinyaller henüz hesaplanmadı. Motor her gece 04:20'de (TR) çalışır; ilk çalışmadan sonra burada görünür.</p></section>`;
  }
  const when = `<span class="sg-when${eskiMi(doc) ? ' stale' : ''}">${esc(veriZamani(doc))}</span>`;
  const e = doc.urun?.[id]?.[q];
  if (!e) {
    const baska = noQuality ? [] : Object.keys(doc.urun?.[id] || {}).map((x) => `Q${x}`);
    const not = baska.length ? ` Bu ürün için sinyal olan kaliteler: ${esc(baska.join(', '))}.` : '';
    const neden = realm === 1 && doc.makro?.m7 == null ? ' R2 için geçmiş veri birikiyor; sinyaller yaklaşık 60 gün sonra dolar.' : '';
    return `<section class="sg">${head(when)}<p class="sg-empty">Bu kalite için yeterli işlem geçmişi yok (son 60 günde en az 40 işlem günü gerekir).${not}${neden}</p></section>`;
  }
  const tz = tazelik(e, live, now, doc.t);
  const sez = e.z ? doc.sezon?.[id] : null;
  const sat = eylemBilgi('satici', e.s, sez);
  const al = eylemBilgi('alici', e.a, sez);
  const kal = doc.kalite?.[id];
  const tuc = tuccarAcik();

  const rol = (kim, b) => `<div class="sg-role" data-yon="${b.yon}" data-guc="${b.guc || 0}">
      <span class="sg-who">${kim}</span>
      <span class="sg-verdict"><b class="sg-act">${esc(b.ad)}</b>${b.guc ? `${gucBar(b.guc)}<span class="sg-pow">${GUC[b.guc]}</span>` : ''}</span>
      <p class="sg-text">${esc(b.metin)}</p>
    </div>`;

  let uretim = '';
  if (e.m != null || kal) {
    const durum = e.m == null ? '' : e.m >= 3 ? 'Bu fiyatta tipik üretici kâr ediyor.' : e.m <= -10 ? 'Bu fiyatta ortalama üretici zarar ediyor; fiyatı maliyeti düşük üreticiler belirliyor.' : 'Marj ince: yalnız maliyeti düşük üretici kâr eder.';
    let kalMetin = '';
    if (kal && kal[0] !== Number(q)) {
      const q0 = kal[2] != null ? `, Q0'da ${pctInt(kal[2])}` : '';
      kalMetin = kal[1] > 0
        ? ` Son 90 günde genelde en kârlı kalite Q${kal[0]} (${pctInt(kal[1])}${q0}).`
        : ` Son 90 günde hiçbir kalite genelde artıda değildi; en iyisi Q${kal[0]} (${pctInt(kal[1])}${q0}).`;
    }
    uretim = `<div class="sg-role" data-yon="${e.m >= 3 ? 'up' : e.m <= -10 ? 'down' : ''}">
      <span class="sg-who">Tipik üreticinin marjı</span>
      <span class="sg-verdict"><b class="sg-act">${pctInt(e.m)}</b><span class="sg-pow">tipik maliyetle net marj</span></span>
      <p class="sg-text">${esc(durum + kalMetin)}</p>
    </div>`;
  }
  const tuccar = tuc ? `<div class="sg-role" data-yon="${e.t ? 'up' : ''}">
      <span class="sg-who">Resell (al, 14 gün sonra sat)</span>
      <span class="sg-verdict"><b class="sg-act">${e.t ? 'AL' : 'İŞLEM YOK'}</b></span>
      <p class="sg-text">${e.t ? 'Beklenti komisyon ve taşımayı karşılıyor. Geçmişte zayıf bir sinyaldi, küçük miktarla dene.' : 'Beklenen hareket %4 komisyonu ve taşımayı karşılamıyor.'}</p>
    </div>` : '';

  let beklenti = '';
  if (e.e != null) {
    const oran = e.e / 200;
    const hedef = hedefFiyat(e);
    const hedefHtml = hedef != null ? `<span class="sg-hedef">Hedef: <b>${esc(fmtPrice(hedef))}</b></span>` : '';
    const taban = e.p > 0 ? `<span class="sg-base">Hesap fiyatı ${esc(fmtPrice(e.p))} (${e.g ? 'son işlem fiyatı' : 'son tam günün VWAP\'ı'})</span>` : '';
    beklenti = `<p class="sg-exp"><span>14 gün beklentisi <b class="${oran > 0 ? 'up' : oran < 0 ? 'down' : ''}">${fmtPct(oran)}</b>${hedefHtml} <span class="sg-band">(belirsizlik ±%${esc(e.u)})</span></span>${taban}<span class="sg-hist">${esc(gecmisCumle(doc, oran))}</span></p>`;
  } else if (e.z) {
    beklenti = `<p class="sg-exp"><span>${esc(sezonMetni(doc.sezon?.[id]))}</span></p>`;
  }

  // Her madde güvenli HTML olarak üretilir: düz metinler burada kaçışlanır, olay metni ürün adını kendisi kaçışlar
  const nedenler = (e.r || []).map(gerekce).filter(Boolean).map(esc);
  for (const o of e.o || []) nedenler.push(olayMetni(o, products));
  if (e.k != null) nedenler.push(esc(`Satıştaki arz yaklaşık ${Number(e.k).toLocaleString(LOCALE)} günlük satışa denk`));
  const liste = nedenler.length ? `<ul class="sg-why">${nedenler.map((x) => `<li>${x}</li>`).join('')}</ul>` : '';

  const r2Not = realm === 1 && doc.makro?.m7 == null ? ' <span>R2 için geçmiş veri az: piyasa geneli hesaba katılmıyor, sinyaller sınırlı.</span>' : '';
  return `<section class="sg"${tz ? ` data-eski="${tz.tip}"` : ''}>${head(when)}${olayHtml(e)}${rozetHtml(tz, now)}
    <div class="sg-roles"><p class="sg-sec">Fiyat yönü · 14 gün</p>${rol('Elinde mal varsa', sat)}${rol('Girdi alacaksan', al)}${tuccar}${uretim ? `<p class="sg-sec">Üretim marjı · bugün</p>${uretim}` : ''}</div>
    ${beklenti}${liste}
    <p class="sg-foot">Sinyaller olasılık gösterir, kesinlik değil.${uretim ? ' Marj, tipik maliyetle ve komisyon ile taşıma düşülerek hesaplanır. Kendi marjın için Kâr Hesaplayıcı\'yı kullan.' : ''}${r2Not} <a href="#sinyal">Tüm sinyaller</a></p>
  </section>`;
}

// ---- Sinyaller sayfası ----

const SEKMELER = [
  ['satici', 'Satış'],
  ['alici', 'Alım'],
  ['uretim', 'Üretim'],
  ['perakende', 'Perakende'],
  ['takvim', 'Takvim'],
  ['karne', 'Karne'],
];

const SAYFA = `
<section class="sy">
  <div class="sy-head">
    <div>
      <h1 class="sy-title">Sinyaller</h1>
      <p class="sy-when" data-el="when">Yükleniyor</p>
    </div>
    <button type="button" class="icon-btn" data-el="reload" aria-label="Sinyalleri yenile" title="Yenile"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M16.2 10a6.2 6.2 0 1 1-1.9-4.5M16.4 3.4v3.4H13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </div>
  <div class="alert" data-el="alert" role="alert" hidden><span data-el="alertText"></span></div>
  <div class="sy-wind" data-el="wind"></div>
  <div class="sy-tabs" role="tablist" aria-label="Sinyal türü" data-el="tabs"></div>
  <div class="sy-quals" data-el="quals" role="radiogroup" aria-label="Kalite"></div>
  <div class="sy-body" data-el="body"></div>
  <label class="sy-opt"><input type="checkbox" data-el="tuccar"> Resell sinyallerini göster (al-sat; geçmişte zayıftı)</label>
  <p class="sy-note">Hesap özel sunucuda her gece ve gün içinde saatte bir yapılır; fiyat hedefe ulaşır ya da 20 günlük zirveyi veya dibi kırarsa sinyal o saatte yenilenir. Bu sayfa yalnız sonuçları gösterir. Beklentiler 14 günlüktür ve olasılık bildirir. Hedef fiyat, hesap fiyatının beklenti kadar değişmiş hâlidir.
    Komisyon, bugün de sonra da satsan ödendiği için Satış ve Alım sinyallerinde hesaba katılmaz; yalnız Resell sinyalinde düşülür.</p>
</section>`;

export function mountSinyal(root, { realm = 0 } = {}) {
  root.innerHTML = SAYFA;
  const el = {};
  root.querySelectorAll('[data-el]').forEach((n) => { el[n.dataset.el] = n; });
  const prefs = readPrefs();
  let r = realm;
  let doc = null;
  let products = {};
  let live = null; // live/r{r}: borsadaki son işlem fiyatı ve zamanı (tazelik rozeti için)
  let token = 0;
  let destroyed = false;
  const open = new Set(); // "Tümünü göster" açılan listeler

  const nameOf = (id) => products?.[id]?.name || `Ürün ${id}`;
  el.tuccar.checked = prefs.tuccar;

  async function refresh(fresh = false) {
    const my = ++token;
    el.reload.classList.add('spin');
    try {
      const [d, b] = await Promise.all([
        loadSignals(r, fresh ? { refresh: (p) => p.startsWith('meta/sinyal_') } : undefined),
        loadBasics(r, fresh ? { refresh: (p) => p.startsWith('live/') } : undefined).catch(() => null),
      ]);
      if (my !== token || destroyed) return;
      doc = d;
      products = b?.products || {};
      live = b?.live || null;
      el.alert.hidden = true;
      render();
    } catch (e) {
      if (my !== token || destroyed) return;
      el.alertText.textContent = e?.message || String(e);
      el.alert.hidden = false;
    } finally {
      if (my === token && !destroyed) el.reload.classList.remove('spin');
    }
  }

  function tabs() {
    const list = prefs.tuccar ? [...SEKMELER.slice(0, 4), ['tuccar', 'Resell'], ...SEKMELER.slice(4)] : SEKMELER;
    if (!list.some(([k]) => k === prefs.tab)) prefs.tab = 'satici';
    el.tabs.innerHTML = list.map(([k, ad]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === prefs.tab}" tabindex="${k === prefs.tab ? 0 : -1}">${ad}</button>`).join('');
    const showQ = ['satici', 'alici', 'uretim', 'perakende', 'tuccar'].includes(prefs.tab);
    el.quals.hidden = !showQ;
    if (showQ) {
      const opts = [...Array.from({ length: 13 }, (_, q) => [q, `Q${q}`]), ['tum', 'Tümü']];
      el.quals.innerHTML = opts.map(([v, ad]) => `<button type="button" role="radio" data-q="${v}" aria-checked="${v === prefs.q}">${ad}</button>`).join('');
    }
  }

  function wind() {
    if (!doc) { el.wind.innerHTML = ''; return; }
    const m = doc.makro || {};
    let ana;
    const r2 = r === 1 && m.m7 == null
      ? '<p class="sy-r2" role="note">R2 için geçmiş veri az: sinyal sayısı sınırlı ve piyasa geneli hesaba katılmıyor. Veri biriktikçe (yaklaşık 60 gün) tamamlanır.</p>' : '';
    if (m.m7 == null) ana = '<p class="sy-big">Piyasa yönü için henüz yeterli veri yok</p>';
    else {
      const yon = m.rejim < 0 ? 'Piyasa düşüşte' : m.rejim > 0 ? 'Piyasa yükselişte' : 'Piyasa yatay';
      ana = `<p class="sy-big" data-yon="${m.rejim < 0 ? 'down' : m.rejim > 0 ? 'up' : ''}">${yon}: son 7 günde ${fmtPct(m.m7 / 100)}</p>`;
    }
    const satir = [];
    if (m.rejim < 0) satir.push('Geçmişte haftada %1\'den çok düşen piyasa, sonraki hafta ortalama %2,1 daha düştü.');
    if (m.rejim > 0) satir.push('Geçmişte haftada %1\'den çok yükselen piyasa, sonraki hafta ortalama %0,9 daha yükseldi.');
    if (m.cmt != null && Math.abs(m.cmt) >= 1) satir.push(`Son cumartesi (evre güncellemesinden sonraki ilk gün) piyasa ${fmtPct(m.cmt / 100)} hareket etti.`);
    const ev = doc.evre;
    if (ev?.ad) {
      const ad = { recession: 'Resesyon', normal: 'Normal', boom: 'Boom' }[ev.ad] || ev.ad;
      satir.push(`Ekonomi evresi: ${ad}${ev.yeni ? ' (bu hafta değişti)' : ''}.`);
    }
    el.wind.innerHTML = `${ana}${satir.map((s) => `<p class="sy-line">${esc(s)}</p>`).join('')}${r2}`;
  }

  function entries(filter) {
    const out = [];
    for (const [idText, qs] of Object.entries(doc?.urun || {})) {
      for (const [qText, e] of Object.entries(qs)) {
        if (prefs.q !== 'tum' && Number(qText) !== prefs.q) continue;
        if (filter(e)) out.push({ id: Number(idText), q: Number(qText), e });
      }
    }
    return out;
  }

  const canliOf = (id, q) => live?.items?.[id]?.[1]?.[q];
  const tazelikOf = (x) => (x.e ? tazelik(x.e, canliOf(x.id, x.q), Date.now(), doc?.t) : null);

  function row(x, act, yon, guc, value, why) {
    return `<button type="button" class="sy-row"${tazelikOf(x) ? ' data-eski="1"' : ''} data-id="${x.id}" data-q="${x.q}">
      <span class="sy-name">${esc(nameOf(x.id))} <span class="pid">#${x.id}</span>${prefs.q === 'tum' ? ` <span class="qtag">Q${x.q}</span>` : ''}</span>
      <span class="sy-act" data-yon="${yon}">${esc(act)}${guc ? ` ${gucBar(guc)}` : ''}</span>
      <span class="sy-val">${value}</span>
      <span class="sy-why">${esc(why || '')}</span>
    </button>`;
  }

  function block(key, title, hint, items, toRow) {
    const all = items.length;
    const shown = open.has(key) ? items : items.slice(0, LIST_MAX);
    const more = all > shown.length ? `<button type="button" class="sy-more" data-more="${key}">Tümünü göster (${all})</button>` : '';
    return `<section class="sy-block"><h2 class="sy-h2">${esc(title)} <span class="sy-count">${all}</span></h2><p class="sy-hint">${esc(hint)}</p>
      ${all ? `<div class="sy-list">${shown.map(toRow).join('')}</div>${more}` : '<p class="sy-empty">Şu an bu grupta sinyal yok.</p>'}</section>`;
  }

  // Geniş ekranda iki blok yan yana (yeşil solda, kırmızı sağda); dar ekranda alt alta (stil: .sy-pair)
  const pair = (left, right) => `<div class="sy-pair">${left}${right}</div>`;

  const ilkNeden = (e) => (e.r || []).map(gerekce).find(Boolean) || '';
  const eTxt = (x) => {
    const e = x.e;
    if (e.e == null) return '<span class="sy-dim">mevsim</span>';
    const hedef = hedefFiyat(e);
    const tz = tazelikOf(x);
    const alt = [];
    if (hedef != null) alt.push(`Hedef ${esc(fmtPrice(hedef))}`);
    if (tz) alt.push(`<span class="sy-rz">${tz.tip === 'guncelleniyor' ? 'güncelleniyor' : 'eski'}</span>`);
    return `<b class="${e.e > 0 ? 'up' : e.e < 0 ? 'down' : ''}">${fmtPct(e.e / 200)}</b>${alt.length ? `<span class="sy-sub">${alt.join(' · ')}</span>` : ''}`;
  };
  const byE = (dir) => (a, b) => (b.e.s?.[1] ?? 0) - (a.e.s?.[1] ?? 0) || dir * ((b.e.e ?? 0) - (a.e.e ?? 0));

  // Takvim: Mevsim takvimi ve Üretim hızı olayları tek sekmede
  function takvimSezon() {
      const sira = { sezon: 0, once: 1, sonra: 2, dis: 3 };
      const list = Object.entries(doc.sezon || {}).map(([id, s]) => ({ id: Number(id), q: 0, s }))
        .sort((a, b) => sira[a.s[3]] - sira[b.s[3]] || (a.s[1] < b.s[1] ? -1 : 1));
      return block('sezon', 'Mevsim takvimi', 'Yıllık işlem değerinin yarısı 60 günden kısa sürede toplanan ürünler. Her biri için yalnız bir yıllık döngü görüldü.', list, (x) => {
        const e = doc.urun?.[x.id]?.[0];
        const sat = eylemBilgi('satici', e?.s, x.s);
        return row(x, e ? sat.ad : '—', sat.yon, e?.s?.[1] || 0, `<span class="sy-dim">${esc({ once: 'yaklaşıyor', sezon: 'sezonda', sonra: 'bitti', dis: 'dışında' }[x.s[3]] || '')}</span>`, sezonMetni(x.s));
      });
  }
  function takvimOlay() {
      const sira = { aktif: 0, yakinda: 1, bitti: 2 };
      const list = (doc.olaylar || []).map((o) => ({ id: o[0], q: 0, o })).sort((a, b) => sira[a.o[4]] - sira[b.o[4]] || (a.o[3] < b.o[3] ? -1 : 1));
      return block('olay', 'Üretim hızı olayları', 'Hız artışı arzı artırır (fiyata aşağı baskı), düşüşü azaltır. Olay girdilere ve kullanan ürünlere de yayılır.', list, (x) => {
        const [, s, since, until, durum] = x.o;
        const yon = s > 0 ? 'down' : 'up';
        const ne = durum === 'aktif' ? `${fmtDate(Date.parse(until))} tarihine kadar` : durum === 'yakinda' ? `${fmtDate(Date.parse(since))} tarihinde başlıyor` : `${fmtDate(Date.parse(until))} tarihinde bitti`;
        return row(x, `${s > 0 ? '+' : '−'}%${Math.abs(s)}`, yon, 0, `<span class="sy-dim">${esc({ aktif: 'sürüyor', yakinda: 'yakında', bitti: 'bitti' }[durum])}</span>`, ne);
      });
  }

  // Perakende sinyali: borsadan al, perakende binasında en kârlı fiyatla sat. Veri sekme açılınca bir kez yüklenir.
  let pk = null;      // null: yüklenmedi | 'yukleniyor' | { list, ... } | { hata }
  let pkRealm = null;
  let pkToken = 0;
  async function pkYukle(fresh = false) {
    const my = ++pkToken;
    const rr = r;
    pk = 'yukleniyor';
    try {
      const d = await loadPerakendeSinyal(rr, fresh ? { refresh: (p) => p.startsWith('live/') || p.startsWith('meta/') } : undefined);
      if (my !== pkToken || destroyed) return;
      pk = d;
    } catch (e) {
      if (my !== pkToken || destroyed) return;
      pk = { hata: e?.message || String(e) };
    }
    pkRealm = rr;
    if (prefs.tab === 'perakende') body();
  }
  function perakendeHtml() {
    if (pkRealm !== r || !pk || pk === 'yukleniyor') {
      if (pk !== 'yukleniyor') pkYukle();
      return '<p class="sy-empty">Perakende hesaplanıyor.</p>';
    }
    if (pk.hata) return `<p class="sy-empty">Perakende sinyali hesaplanamadı: ${esc(pk.hata)}</p>`;
    const secili = pk.list.filter((x) => prefs.q === 'tum' || x.q === prefs.q);
    const kar = secili.filter(karMi).sort((a, b) => b.pphpl - a.pphpl);
    const zarar = secili.filter(zararMi).sort((a, b) => a.pphpl - b.pphpl);
    const fp = (x) => fmtPrice(x);
    const prow = (x) => row(x, karMi(x) ? 'KÂR' : 'ZARAR', karMi(x) ? 'up' : 'down', 0,
      x.marj == null ? '<span class="sy-dim">satılmaz</span>' : `<b class="${x.marj >= 0 ? 'up' : 'down'}">${pctInt(x.marj)}</b>`,
      `${binaAdi(x.letter, 'Mağaza')} · en kârlı fiyat ${fp(x.price)} · borsa maliyeti ${fp(x.cost)}`);
    const evre = { 0: 'Durgunluk', 1: 'Normal', 2: 'Büyüme' }[pk.economy];
    return block('pkkar', 'Kâr: borsadan al, perakendede sat', `Borsadaki fiyat mal maliyeti, satış fiyatı en kârlı fiyat sayılır; bina maaşı düşülmüş net marj +%3 ve üstü. Evre: ${evre}.`, kar, prow)
      + block('pkzarar', 'Zarar: bu maliyetle satmaya değmez', 'Borsa fiyatı o kadar yüksek ki en kârlı fiyatta bile maaşı çıkarmıyor ya da ürün satılamıyor.', zarar, prow);
  }

  function body() {
    if (!doc && prefs.tab !== 'perakende') {
      el.body.innerHTML = '<p class="sy-empty">Sinyaller henüz hesaplanmadı. Motor her gece 04:20\'de (TR) çalışır; elle çalıştırmak için GitHub\'da Actions › DentSimco Sinyal › Run workflow.</p>';
      return;
    }
    const t = prefs.tab;
    let html = '';
    if (t === 'satici') {
      const tut = entries((e) => e.s?.[0] === 'TUT' && e.s[1] > 0).sort(byE(1));
      const hs = entries((e) => e.s?.[0] === 'HSAT').sort(byE(-1));
      html = pair(
        block('tut', 'Satışı ertele (TUT)', 'Elindeki malı bekletmek daha iyi görünüyor.', tut, (x) => row(x, 'TUT', 'up', x.e.s[1], eTxt(x), ilkNeden(x.e))),
        block('hsat', 'Sat', 'Bekletirsen fiyatın düşmesi bekleniyor.', hs, (x) => row(x, 'SAT', 'down', x.e.s[1], eTxt(x), ilkNeden(x.e))),
      );
    } else if (t === 'alici') {
      const bek = entries((e) => e.a?.[0] === 'BEKLE').sort((a, b) => b.e.a[1] - a.e.a[1] || (a.e.e ?? 0) - (b.e.e ?? 0));
      const sto = entries((e) => e.a?.[0] === 'STOKLA').sort((a, b) => b.e.a[1] - a.e.a[1] || (b.e.e ?? 0) - (a.e.e ?? 0));
      html = pair(
        block('stokla', 'Al', 'Fiyatın yükselmesi bekleniyor; ihtiyacını öne çek.', sto, (x) => row(x, 'AL', 'up', x.e.a[1], eTxt(x), ilkNeden(x.e))),
        block('bekle', 'Alımı ertele (BEKLE)', 'Geçmiş sınamada en isabetli sinyal grubu buydu.', bek, (x) => row(x, 'BEKLE', 'down', x.e.a[1], eTxt(x), ilkNeden(x.e))),
      );
    } else if (t === 'uretim') {
      const kar = entries((e) => e.m != null && e.m >= 3).sort((a, b) => b.e.m - a.e.m);
      const zarar = entries((e) => e.m != null && e.m <= -10).sort((a, b) => a.e.m - b.e.m);
      const kal = Object.entries(doc.kalite || {}).map(([id, k]) => ({ id: Number(id), q: k[0], k }))
        .filter((x) => x.k[0] !== 0 && x.k[2] != null && x.k[1] - x.k[2] >= 5).sort((a, b) => (b.k[1] - b.k[2]) - (a.k[1] - a.k[2]));
      const mrow = (x) => row(x, x.e.m >= 3 ? 'KÂR' : 'ZARAR', x.e.m >= 3 ? 'up' : 'down', 0, `<b class="${x.e.m >= 0 ? 'up' : 'down'}">${pctInt(x.e.m)}</b>`, 'Tipik üretici maliyetiyle net marj');
      html = pair(
        block('kar', 'Kâr: tipik üretici +%3 ve üstü', 'Yönetim gideri dahil tipik maliyetle, komisyon ve taşıma sonrası. Kendi maliyetin farklıdır.', kar, mrow),
        block('zarar', 'Zarar: tipik üretici −%10 ve altı', 'Fiyatı maliyeti düşük üreticiler belirliyor. Yönetim giderin yüksekse bu ürünleri üretmek yerine almak daha ucuz olabilir.', zarar, mrow),
      )
        + block('kalite', 'Kalite önerisi', 'Son 90 günde Q0\'a göre belirgin daha kârlı kalite (girdiler en az bir alt kaliteden).', kal,
          (x) => row({ id: x.id, q: x.k[0] }, `Q${x.k[0]}`, x.k[1] > 0 ? 'up' : '', 0, `<b class="${x.k[1] > 0 ? 'up' : 'down'}">${pctInt(x.k[1])}</b>`, `Q0'da ${pctInt(x.k[2])}`));
    } else if (t === 'tuccar') {
      const tc = entries((e) => e.t === 1).sort((a, b) => (b.e.e ?? 0) - (a.e.e ?? 0));
      html = block('tuccar', 'Al, 14 gün sonra sat', 'Yalnız $1.000 üstü ürünlerde ve beklenti komisyon + taşımayı aştığında. Geçmişte zayıf bir sinyaldi.', tc, (x) => row(x, 'AL', 'up', 0, eTxt(x), ilkNeden(x.e)));
    } else if (t === 'perakende') {
      html = perakendeHtml();
    } else if (t === 'takvim') {
      html = takvimSezon() + takvimOlay();
    } else if (t === 'karne') {
      const k = doc.karne || {};
      const satirlar = Object.keys(KOVA_AD).map((b) => {
        const o = k.onsel?.[b];
        const c = k.canli?.[b];
        const dusus = b === 'b1' || b === 'b2';
        const fmt = (x) => (x && x[0]
          ? `<b class="${dusus ? 'down' : b === 'b3' ? '' : 'up'}">%${Math.round((dusus ? 1 - x[1] : x[1]) * 100)} ${dusus ? 'düştü' : 'yükseldi'}</b><span class="sy-sub">ortalama ${fmtPct(x[2])}, ${x[0].toLocaleString(LOCALE)} kayıt</span>`
          : '—');
        const birik = (x) => (x && x[0] >= 30 ? fmt(x) : `<span class="sy-dim">birikiyor${x ? ` (${x[0]} kayıt)` : ''}</span>`);
        return `<tr><th scope="row">${KOVA_AD[b]}</th><td>${fmt(o)}</td><td>${birik(c)}</td><td>${birik(k.gunici?.[b])}</td></tr>`;
      }).join('');
      html = `<section class="sy-block"><h2 class="sy-h2">Karne</h2>
        <p class="sy-hint">14 günlük beklentiye göre gruplar: sonra fiyat gerçekte ne yaptı. Geçmiş sınama, bir yıllık verinin bir yarısıyla öğrenip diğer yarısında denenerek yapıldı. Canlı sütun bu motorun gece sinyallerinden, Gün içi sütunu gün içinde canlı fiyatla yenilenen sinyallerden birikir (her saatin sinyali ayrı sayılır). İlk sonuçlar sinyalden 14 gün sonra gelir.</p>
        <div class="table-wrap"><table class="qt sy-karne"><thead><tr><th scope="col">Beklenti</th><th scope="col">Geçmiş sınama</th><th scope="col">Canlı (gece)</th><th scope="col">Gün içi</th></tr></thead><tbody>${satirlar}</tbody></table></div></section>`;
    }
    el.body.innerHTML = html;
  }

  function render() {
    el.when.textContent = doc ? veriZamani(doc) : 'Sinyal belgesi yok';
    el.when.classList.toggle('stale', Boolean(eskiMi(doc)));
    if (eskiMi(doc)) {
      el.alertText.textContent = `Sinyaller güncel değil: son hesap ${fmtDateTime(doc.t)}. GitHub'da DentSimco Sinyal iş akışının çalıştığını kontrol et.`;
      el.alert.hidden = false;
    }
    wind();
    tabs();
    body();
  }

  function goBorsa(id, q) {
    try {
      const p = JSON.parse(localStorage.getItem(BORSA_KEY)) || {};
      p.picks = { ...(p.picks || {}), [r]: { id, q } };
      const recent = (p.recent?.[r] || []).filter((x) => x !== id);
      p.recent = { ...(p.recent || {}), [r]: [id, ...recent].slice(0, 6) };
      localStorage.setItem(BORSA_KEY, JSON.stringify(p));
    } catch { /* gizli sekme: borsa son seçimle açılır */ }
    location.hash = '#borsa';
  }

  function onClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) { prefs.tab = tab.dataset.tab; savePrefs(prefs); tabs(); body(); return; }
    const qb = e.target.closest('[data-q]');
    if (qb && el.quals.contains(qb)) { prefs.q = qb.dataset.q === 'tum' ? 'tum' : Number(qb.dataset.q); savePrefs(prefs); tabs(); body(); return; }
    const more = e.target.closest('[data-more]');
    if (more) { open.add(more.dataset.more); body(); return; }
    const rowBtn = e.target.closest('.sy-row');
    if (rowBtn) goBorsa(Number(rowBtn.dataset.id), Number(rowBtn.dataset.q));
  }

  function onKey(e) {
    if (!el.tabs.contains(e.target) || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const items = [...el.tabs.querySelectorAll('[role=tab]')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items[j].click();
    el.tabs.querySelector(`[data-tab="${items[j].dataset.tab}"]`)?.focus();
  }

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  el.reload.addEventListener('click', () => refresh(true));
  el.tuccar.addEventListener('change', () => { prefs.tuccar = el.tuccar.checked; savePrefs(prefs); tabs(); body(); });
  document.title = 'Sinyaller | DentSimco';
  refresh();

  return {
    setRealm(next) {
      if (next === r) return;
      r = next;
      doc = null;
      live = null;
      pk = null;
      pkRealm = null;
      pkToken++;
      el.when.textContent = 'Yükleniyor';
      refresh();
    },
    destroy() {
      destroyed = true;
      token++;
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      root.replaceChildren();
    },
  };
}
