// DentSimco — Optimum Seviye (arayüz)
//
// Hesapların hepsi optimum-hesap.js'te; burada yalnız veri yükleme, ekran ve tarayıcı tercihleri var.
// İki sekme:
//   • 28 Günlük: her üretim binası için önerilen seviye, ürün ve kalite. Veri: meta/optimum_r0 (son 28 günün borsa
//     özeti, sinyal motorunun gece çalışması yazar). Seviye kararları içindir; gece yenilenir.
//   • Güncel: seviye sabitken (sizin seviyeniz, yoksa 28 günlük öneri) canlı borsa fiyatıyla şu an en kârlı ürün ve kalite.
//     Borsa ekranı gibi kendiliğinden yenilenir.
// Şirkete özgü her şey bu tarayıcıdaki kayıtlardan okunur: yöneticiler (Yönetim › Ekip, dentsimco.sirket.r{r}) ve
// binalar ile rekreasyon (Üretim kurulumu, dentsimco.uretim.r{r}). Yalnız R1 (realm 0); R2 geliştirme aşamasında.

import { readDocs, PATHS, dataField, loadGamePhase, fmtAgo, fmtDate, fmtDateTime, fmtPrice, MIN } from './veri.js';
import * as H from './hesap.js';
import * as O from './optimum-hesap.js';
import * as Y from './yonetici.js';
import { binaAdi } from './adlar.js';
import { LOCALE } from './i18n.js';

const PREFS_KEY = 'dentsimco.optimum.v1';
const URETIM_KEY = (r) => `dentsimco.uretim.r${r}`;
const LIST_MAX = 15;
const SEKMELER = [['ay', '28 Günlük'], ['guncel', 'Güncel']];
export const DESTEKLENEN_REALM = 0;

// ---- biçimlendirme ----
const NF0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fin = (x) => x != null && Number.isFinite(x);
export const para = (x) => (fin(x) ? `${x < 0 ? '−' : ''}$${NF0.format(Math.abs(Math.round(x)))}` : '—');
const adet = (x) => (!fin(x) ? '—' : Math.abs(x) >= 100 ? NF0.format(x) : NF1.format(x));
const pct = (x) => `%${NF0.format(Math.round(x * 100))}`;
const isaretli = (n) => (n > 0 ? `+${NF0.format(n)}` : n < 0 ? `−${NF0.format(-n)}` : '0');

// ---- tercihler ----
function readPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { p = {}; }
  return {
    tab: SEKMELER.some(([k]) => k === p.tab) ? p.tab : 'ay',
    faz: [0, 1, 2].includes(p.faz) ? p.faz : 'auto',
    pay: O.PAYLAR.includes(p.pay) ? p.pay : O.VARSAYILAN_PAY,
  };
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* gizli sekme */ }
}

// Üretim kurulumundan yalnız gerekenler: binalar (tür, ürün, seviye) ve rekreasyon / elle hız bonusu
export function kurulumOku(r) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(URETIM_KEY(r)) || 'null'); } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return { buildings: [], recreation: {}, extraBonusPct: 0 };
  const buildings = (Array.isArray(raw.buildings) ? raw.buildings : []).filter((b) => b && typeof b === 'object').map((b) => ({
    type: b.type, product: b.product != null ? Number(b.product) : null, level: Math.max(0, Math.floor(Number(b.level) || 0)),
    count: Math.max(1, Math.floor(Number(b.count) || 1)), robots: !!b.robots, construction: !!b.construction,
  }));
  return { buildings, recreation: { ...(raw.recreation || {}) }, extraBonusPct: Math.min(99, Math.max(0, Number(raw.extraBonusPct) || 0)) };
}

// ---- veri ----
async function veriYukle(r, options) {
  const P = {
    products: PATHS.meta(`products_r${r}`), buildings: PATHS.meta('buildings'), core: PATHS.meta('core'),
    modifiers: PATHS.meta(`modifiers_r${r}`), ozet: PATHS.meta(`optimum_r${r}`), live: PATHS.live(r),
  };
  const docs = await readDocs(Object.values(P), options);
  const get = (k) => dataField(docs.get(P[k]));
  const raw = get('products');
  if (!raw || !Object.keys(raw).length) throw new Error('Ürün verisi okunamadı.');
  const core = get('core') || {};
  const data = H.normalizeData({ products: raw, buildings: get('buildings') || {}, core, modifiers: get('modifiers') || {}, realm: r });
  return { data, mevsimlik: O.mevsimlikUrunler(raw, core), ozet: get('ozet'), live: get('live') };
}

async function canliYukle(r) {
  const path = PATHS.live(r);
  const docs = await readDocs([path], { refresh: (p) => p === path });
  return dataField(docs.get(path)) || null;
}

// ---- hesap (saf): yüklenen veri + tercihler + tarayıcı kayıtları → ekran durumu ----
export function durumHesapla({ data, mevsimlik, ozet, live, company, kurulum, gamePhase, prefs, simdi = Date.now() }) {
  const oz = O.ozetOku(ozet);
  const sirket = O.sirketOzeti({ company, kurulum, data });
  const faz = O.fazSec(prefs.faz, gamePhase);
  const st = { oz, sirket, faz, gamePhase, prefs, simdi, liveT: live?.t ?? null, binalar: [], urunler: [], guncel: [] };
  if (!oz || !data) return st;
  const ortak = { data, oz, mevsimlik, faz, kurulum };
  const opt = { s: sirket.s, pay: prefs.pay, sirket };
  const satir28 = O.satirlar({ ...ortak, fiyat: O.ortFiyat(oz) });
  // Sizin binalarınız önde, sonra günlük kâra göre (sort kararlı: kâr sırası korunur)
  const sizde = (h) => (sirket.kendi[h]?.seviye > 0 ? 1 : 0);
  st.binalar = O.binaOnerileri(satir28, opt).sort((a, b) => sizde(b.harf) - sizde(a.harf));
  st.urunler = O.urunOnerileri(satir28, opt);
  const oneri = new Map(st.binalar.map((b) => [b.harf, b.en]));
  const satirG = O.satirlar({ ...ortak, fiyat: O.canliFiyat(oz, live, simdi), olaylar: true, simdi });
  st.guncel = O.guncelOneriler(satirG, {
    ...opt,
    seviye: (h) => (sirket.kendi[h]?.seviye > 0 ? { L: sirket.kendi[h].seviye, kaynak: 'sizin' } : { L: oneri.get(h)?.L || 0, kaynak: 'oneri' }),
    oneri: (h) => (oneri.get(h) ? { id: oneri.get(h).x.id, q: oneri.get(h).x.q } : null),
  }).sort((a, b) => sizde(b.harf) - sizde(a.harf));
  return st;
}

// ---- ekran parçaları (saf: yalnız metin üretir, sınamada İngilizce çeviri de denetlenir) ----
const SINIR = {
  pazar: ['Pazar sınırlı', 'warn'],
  yonetim: ['Yönetim gideri sınırlı', ''],
  zarar: ['Kâr etmiyor', 'down'],
};
const chip = (text, kind = '') => `<span class="op-chip ${kind}">${esc(text)}</span>`;
const qChip = (ad, x) => (ad.kaliteli(x.id) ? chip(`Q${x.q}`, 'q') : '');

function pazarUyarisi(e, pay) {
  return `<p class="op-warn" role="note">${esc(`Pazar sınırlı: öneriyi borsadaki günlük satış belirliyor (${adet(e.x.adet)} adet/gün, pazar payı ${pct(pay)}). Satış hacmi aydan aya ±%${O.HACIM_OYNAKLIK_PCT} değişebildiği için bu öneri güvenilir değil; seviye artırmadan önce Güncel sekmesine ve hacme bakın.`)}</p>`;
}

export function uyarilarHtml(st) {
  const out = [];
  const s = st.sirket;
  if (!s?.ekipVar) {
    out.push(`<section class="op-alert" role="alert">
      <h2>Yönetim bilgilerinizi girin</h2>
      <p>${esc('Optimum seviye, yöneticilerinizin yönetim gideri tasarrufuna çok bağlıdır: aynı binada tasarruf %0 iken ve %62 iken öneriler 2–3 kat farklı çıkar. Yöneticilerinizi girmediğiniz için bu sayfa %0 tasarrufla hesaplıyor.')}</p>
      <a class="op-btn" href="#yonetim/ekip">Yönetim › Ekip'e git</a>
    </section>`);
  }
  if (!s?.sirketVar) {
    out.push(`<section class="op-alert soft" role="note">
      <h2>Binalarınızı girin</h2>
      <p>${esc('Binalarınız girilmedi: öneriler tek binalı bir şirket için hesaplandı. Her ek seviye şirketin bütün maaşlarına yönetim gideri eklediği için büyük bir şirkette öneriler çok daha düşük çıkar. Binalarınızı Üretim sekmesine girin.')}</p>
      <a class="op-btn" href="#uretim/binalar">Üretim Binalara Git</a>
    </section>`);
  }
  return out.join('');
}

export function sirketSatiri(st) {
  const s = st.sirket;
  const parcalar = [];
  if (s?.ekipVar) parcalar.push(`Yönetim gideri tasarrufu ${pct(s.s)} (Yönetim › Ekip).`);
  if (s?.sirketVar) parcalar.push(`Şirketiniz: ${NF0.format(s.toplamSeviye)} bina seviyesi; her öneri diğer binalarınız sabitken hesaplanır.`);
  return parcalar.length ? `<p class="op-line">${parcalar.map((p) => `<span>${esc(p)}</span>`).join(' ')}</p>` : '';
}

export function ayarlarHtml(st) {
  const fazlar = [['auto', 'Otomatik'], ...O.FAZ_ADLARI.map((ad, i) => [String(i), ad])];
  const secili = String(st.prefs.faz);
  const g = st.gamePhase;
  let fazNot;
  if (st.prefs.faz === 'auto') {
    fazNot = g ? `Oyundaki evre: ${O.FAZ_ADLARI[g.index]}${g.expired ? ' (süresi dolmuş görünüyor; yeni evre henüz yayınlanmamış olabilir)' : ''}.` : `Oyun evresi okunamadı; ${O.FAZ_ADLARI[0]} varsayıldı.`;
  } else {
    fazNot = g && g.index !== st.prefs.faz ? `Oyundaki evre: ${O.FAZ_ADLARI[g.index]}. Seçiminiz farklı.` : '';
  }
  const seg = (act, list, cur) => `<div class="op-seg op-seg-${act}" role="group">${list.map(([v, t]) => `<button type="button" data-act="${act}" data-v="${esc(v)}" aria-pressed="${v === cur}">${esc(t)}</button>`).join('')}</div>`;
  return `<section class="op-set" aria-label="Ayarlar">
    <div class="op-field"><span>Ekonomi fazı (üretim hızı)</span>${seg('faz', fazlar, secili)}${fazNot ? `<p class="op-note">${esc(fazNot)}</p>` : ''}</div>
    <div class="op-field"><span>Pazar payı</span>${seg('pay', O.PAYLAR.map((p) => [String(p), pct(p)]), String(st.prefs.pay))}
      <p class="op-note">Borsadaki günlük satışın en çok bu kadarını satabileceğiniz varsayılır; daha fazlası fiyatı düşürür. Emin değilseniz %10 daha temkinli.</p></div>
  </section>`;
}

function binaKarti(b, st, ad) {
  const e = b.en;
  const x = e.x;
  const kendi = st.sirket?.kendi?.[b.harf]?.seviye || 0;
  const [sinirAd, sinirTur] = SINIR[e.sinir] || ['', ''];
  const fark = kendi > 0 ? e.L - kendi : null;
  const sizde = kendi > 0 ? `<span class="op-mine">${esc(`Sizde: ${NF0.format(kendi)} seviye`)}${fark ? ` ${chip(isaretli(fark), fark > 0 ? 'up' : 'down')}` : ''}</span>` : '';
  const urun = e.L > 0 || e.sinir !== 'zarar'
    ? `<div class="op-prod"><span class="op-name">${esc(ad.urun(x.id))}</span>${qChip(ad, x)}<span class="op-kar ${e.kar > 0 ? 'up' : ''}">${para(e.kar)}</span><span class="op-unit">/ gün</span></div>`
    : '';
  let not = '';
  if (e.sinir === 'pazar' && e.L > 0) not = pazarUyarisi(e, st.prefs.pay);
  else if (e.sinir === 'zarar') not = `<p class="op-note">${esc('Bu binada hiçbir ürün, bir seviyenin maaşını ve eklediği yönetim giderini karşılamıyor.')}</p>`;
  const alt = b.secenekler.slice(0, 6).map((y) => `<tr><th scope="row">${esc(ad.urun(y.x.id))} ${qChip(ad, y.x)}</th><td>${NF0.format(y.L)}</td><td class="${y.kar > 0 ? 'up' : ''}">${para(y.kar)}</td><td>${esc(SINIR[y.sinir]?.[0] || '')}</td></tr>`).join('');
  const ayrinti = `<p class="op-note">${esc(`Fiyat ${fmtPrice(x.fiyat)} · girdi ${fmtPrice(x.girdi)} · seviye başına ${adet(x.ph)} adet/saat · pazar ${adet(x.pazar)} seviye`)}</p>`;
  return `<article class="op-card" data-harf="${esc(b.harf)}">
    <div class="op-top"><h3>${esc(ad.bina(b.harf))}</h3><span class="op-level"><b>${NF0.format(e.L)}</b><small>seviye</small></span></div>
    ${urun}
    <div class="op-chips">${sinirAd ? chip(sinirAd, sinirTur) : ''}${sizde}</div>
    ${not}
    <details data-ac="${esc(b.harf)}"${st.acik?.has(b.harf) ? ' open' : ''}><summary>Diğer seçenekler</summary>${ayrinti}
      <div class="table-wrap"><table class="op-table"><thead><tr><th scope="col">Ürün</th><th scope="col">Seviye</th><th scope="col">Günlük kâr</th><th scope="col">Sınır</th></tr></thead><tbody>${alt}</tbody></table></div>
    </details>
  </article>`;
}

export function ayHtml(st, ad) {
  if (!st.oz) return `<p class="op-empty">${esc('28 günlük özet henüz hesaplanmadı. Gece hesabı her gece 04:20\'de (TR) çalışır; ilk çalışmadan sonra burada görünür.')}</p>`;
  if (!st.binalar.length) return `<p class="op-empty">${esc('Bu ayarlarla gösterilecek bina yok.')}</p>`;
  const kartlar = st.binalar.map((b) => binaKarti(b, st, ad)).join('');
  const hepsi = st.urunlerAcik ? st.urunler : st.urunler.slice(0, LIST_MAX);
  const satir = (u) => {
    const e = u.en;
    return `<tr><th scope="row">${esc(ad.urun(u.id))} ${qChip(ad, e.x)}</th><td class="op-b">${esc(ad.bina(u.harf))}</td><td>${NF0.format(e.L)}</td><td class="${e.kar > 0 ? 'up' : ''}">${para(e.kar)}</td><td>${esc(SINIR[e.sinir]?.[0] || '')}</td></tr>`;
  };
  const daha = st.urunler.length > hepsi.length ? `<button type="button" class="op-more" data-act="urunler">${esc(`Tümünü göster (${st.urunler.length})`)}</button>` : '';
  return `<p class="op-lead">Her bina için 28 günlük fiyat ve satışla en kârlı ürün, kalite ve seviye. Seviye kararları için bu sekmeyi kullanın; ne üreteceğinizi Güncel sekmesi söyler.</p>
    <div class="op-grid">${kartlar}</div>
    <section class="op-block"><h2>Tüm ürünler</h2><p class="op-note">Her ürünün en kârlı kalitesi ve o ürün için önerilen seviye.</p>
      <div class="table-wrap"><table class="op-table"><thead><tr><th scope="col">Ürün</th><th scope="col">Bina</th><th scope="col">Seviye</th><th scope="col">Günlük kâr</th><th scope="col">Sınır</th></tr></thead><tbody>${hepsi.map(satir).join('')}</tbody></table></div>${daha}</section>
    <p class="op-foot">Hesap: 28 günlük ortalama işlem fiyatı (VWAP) ve günlük satış; girdiler borsadan alınır (izin verilen en ucuz kalite); maaş, yönetim gideri, %4 komisyon ve taşıma düşülür. İnşaat maliyeti, kalite üretebilme (araştırma, patent) ve kendi ürettiğiniz girdiler hesaba katılmaz. Mevsimlik ürünler ve borsada satışı olmayan ürünler gösterilmez.</p>`;
}

function guncelKarti(g, st, ad) {
  const x = g.en.x;
  const kaynakAd = g.kaynak === 'sizin' ? 'Sizin seviyeniz' : g.L > 0 ? '28 günlük öneri' : '1 seviye için';
  const chips = [chip(kaynakAd, 'muted')];
  if (x.kaynak !== 'canli') chips.push(chip('28 günlük ortalama fiyat (yakın zamanda işlem yok)', 'warn'));
  else if (x.girdiOrt) chips.push(chip('Girdi fiyatı 28 günlük ortalama (yakın zamanda işlem yok)', 'warn'));
  if (x.olay) chips.push(chip(`Üretim olayı ${x.olay > 0 ? '+' : '−'}%${NF0.format(Math.abs(x.olay))}`, x.olay > 0 ? 'up' : 'down'));
  // Ürünü değiştirmek ancak fark belirginse önerilir (O.DEGISIM_ESIGI_*); küçük farkta iki ürün de olur
  let kiyas = '';
  const onerilenAd = g.onerilen ? `${ad.urun(g.onerilen.x.id)}${ad.kaliteli(g.onerilen.x.id) ? ` Q${g.onerilen.x.q}` : ''}` : '';
  if (g.durum === 'degistir') {
    kiyas = `<p class="op-switch">${esc(`28 günlük önerideki ${onerilenAd} şu an ${para(g.onerilen.kar)} / gün; bu ürün günde ${para(g.fark)} daha kârlı.`)}</p>`;
  } else if (g.durum === 'yakin') {
    kiyas = `<p class="op-note">${esc(`28 günlük önerideki ${onerilenAd} şu an ${para(g.onerilen.kar)} / gün; fark küçük, ikisi de olur.`)}</p>`;
  } else if (g.onerilen) {
    kiyas = `<p class="op-note">${esc('28 günlük öneriyle aynı ürün.')}</p>`;
  }
  const asim = g.pazarAsimi ? `<p class="op-warn" role="note">${esc('Bu seviye, ürünün pazar payından büyük: fazla üretim fiyatı düşürmeden satılamayabilir. Kâr yalnız pazar payı kadar satışla hesaplandı.')}</p>` : '';
  return `<article class="op-card">
    <div class="op-top"><h3>${esc(ad.bina(g.harf))}</h3><span class="op-level"><b>${NF0.format(g.hesapL)}</b><small>seviye</small></span></div>
    <div class="op-prod"><span class="op-name">${esc(ad.urun(x.id))}</span>${qChip(ad, x)}<span class="op-kar ${g.en.kar > 0 ? 'up' : 'down'}">${para(g.en.kar)}</span><span class="op-unit">/ gün</span></div>
    <div class="op-chips">${chips.join('')}</div>
    ${kiyas}${asim}
  </article>`;
}

export function guncelHtml(st, ad) {
  if (!st.oz) return `<p class="op-empty">${esc('28 günlük özet henüz hesaplanmadı. Gece hesabı her gece 04:20\'de (TR) çalışır; ilk çalışmadan sonra burada görünür.')}</p>`;
  if (!st.guncel.length) return `<p class="op-empty">${esc('Bu ayarlarla gösterilecek bina yok.')}</p>`;
  const canli = st.liveT ? `Canlı fiyatlar ${fmtAgo(st.liveT, st.simdi)} · ${O.FAZ_ADLARI[st.faz]} fazı` : 'Canlı fiyat yok: 28 günlük ortalama kullanılıyor.';
  return `<p class="op-lead">Seviyeniz sabitken canlı borsa fiyatıyla şu an en kârlı ürün ve kalite. Bu sekme seviye önermez: seviyeyi sık değiştirmek geçmiş sınamada kazandırmadı, ürünü değiştirmek kazandırdı.</p>
    <p class="op-line">${esc(canli)}</p>
    <div class="op-grid">${st.guncel.map((g) => guncelKarti(g, st, ad)).join('')}</div>
    <p class="op-foot">Pazar büyüklüğü 28 günlük satıştan, fiyatlar canlı borsadan. Son işlemi 6 saatten eski fiyatların yerine 28 günlük ortalama kullanılır. Etkin üretim hızı olayları üretime eklenir.</p>`;
}

export function basHtml(st) {
  const oz = st.oz;
  const zaman = oz ? `${fmtDate(Date.parse(`${oz.bas}T12:00:00Z`))} – ${fmtDate(Date.parse(`${oz.gun}T12:00:00Z`))} verisiyle · ${fmtAgo(oz.t, st.simdi)}` : 'Özet yok';
  const eski = oz && O.ozetEskiMi(oz, st.simdi);
  return `<div class="op-head"><div><h1>Optimum Seviye</h1><p class="op-when${eski ? ' stale' : ''}">${esc(zaman)}</p></div>
    <button type="button" class="icon-btn" data-act="yenile" aria-label="Yenile" title="Yenile"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M16.2 10a6.2 6.2 0 1 1-1.9-4.5M16.4 3.4v3.4H13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
    ${eski ? `<p class="op-warn" role="alert">${esc(`28 günlük özet güncel değil: son hesap ${fmtDateTime(oz.t)}. Öneriler bu tarihin verisiyle.`)}</p>` : ''}`;
}

export function sekmelerHtml(st) {
  return `<div class="op-tabs" role="tablist" aria-label="Optimum Seviye görünümü">${SEKMELER.map(([k, t]) =>
    `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === st.prefs.tab}" tabindex="${k === st.prefs.tab ? 0 : -1}">${esc(t)}</button>`).join('')}</div>`;
}

export const R2_HTML = `<section class="op"><div class="op-head"><div><h1>Optimum Seviye</h1></div></div>
  <section class="op-alert soft" role="note"><h2>R2 için geliştirme aşamasında</h2><p>Optimum Seviye şimdilik yalnız R1 için hesaplanıyor. R2 için yeterli geçmiş veri birikince eklenecek.</p></section></section>`;

/** Sayfanın tamamı (saf). ad: { urun(id), bina(harf), kaliteli(id) } */
export function sayfaHtml(st, ad) {
  const govde = st.prefs.tab === 'guncel' ? guncelHtml(st, ad) : ayHtml(st, ad);
  return `<section class="op">${basHtml(st)}${uyarilarHtml(st)}${sirketSatiri(st)}${ayarlarHtml(st)}${sekmelerHtml(st)}<div class="op-body" role="tabpanel">${govde}</div></section>`;
}

// ---- stiller (sitenin renk değişkenleriyle) ----
export const CSS = `
.op { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; max-width: 1240px; }
.op-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.op h1 { margin: 0; font-size: 26px; font-weight: 600; line-height: 1.2; }
.op-when { margin: 3px 0 0; font-size: 14px; color: var(--muted); }
.op-when.stale { color: var(--late); }
.op-alert { display: grid; gap: 8px; padding: 14px 16px; border: 1px solid var(--down-line); border-radius: 16px; background: var(--down-bg); color: var(--down-text); }
.op-alert.soft { border-color: var(--late-line); background: var(--late-bg); color: var(--text); }
.op-alert h2 { margin: 0; font: 600 19px/1.2 var(--font-c); }
.op-alert.soft h2 { color: var(--late); }
.op-alert p { margin: 0; font-size: 14.5px; line-height: 1.45; max-width: 80ch; }
.op-btn { justify-self: start; display: inline-flex; align-items: center; min-height: 40px; padding: 0 14px; border-radius: 10px; background: var(--raise); color: var(--accent);
  border: 1px solid var(--line-2); font-weight: 600; text-decoration: none; }
.op-line { margin: 0; font-size: 14px; color: var(--muted); max-width: 90ch; }
.op-set { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
@media (min-width: 900px) { .op-set { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.op-field { display: grid; gap: 6px; align-content: start; }
.op-field > span { color: var(--muted); font-size: 13px; font-weight: 600; }
.op-seg { display: flex; gap: 4px; flex-wrap: wrap; }
.op-seg button { flex: 1 1 0; min-width: 64px; min-height: 40px; padding: 0 10px; border-radius: 10px; background: var(--raise); color: var(--muted); border: 1px solid var(--line-2);
  font: 600 15px var(--font-c); white-space: nowrap; }
.op-seg button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
@media (max-width: 520px) { .op-seg-faz { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.op-note { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); max-width: 80ch; }
.op-tabs { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 11px; background: var(--bg); }
.op-tabs button { flex: 1 1 0; height: 40px; padding: 0 12px; border-radius: 8px; color: var(--muted); font: 600 16px/1 var(--font-c); white-space: nowrap; }
.op-tabs button[aria-selected="true"] { background: var(--raise-2); color: var(--accent); }
.op-body { display: grid; gap: 14px; }
.op-lead { margin: 0; font-size: 14.5px; line-height: 1.45; max-width: 90ch; }
.op-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@media (min-width: 760px) { .op-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1180px) { .op-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.op-card { display: grid; gap: 8px; align-content: start; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); min-width: 0; }
.op-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.op-top h3 { margin: 0; font: 600 18px/1.25 var(--font-c); }
.op-level { text-align: right; flex: none; }
.op-level b { display: block; font: 600 28px/1 var(--font-c); color: var(--price); }
.op-level small { color: var(--muted); font-size: 12.5px; font-weight: 600; }
.op-prod { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.op-name { font-weight: 600; }
.op-kar { margin-left: auto; font: 600 18px var(--font-c); font-variant-numeric: tabular-nums; }
.op-unit { color: var(--muted); font-size: 13px; }
.op-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.op-chips:empty { display: none; }
.op-chip { display: inline-flex; align-items: center; min-height: 24px; padding: 2px 9px; border-radius: 12px; font-size: 12.5px; font-weight: 600; line-height: 1.3;
  background: var(--tint-bg); color: var(--accent); border: 1px solid var(--tint-line); }
.op-chip.q { min-height: 20px; padding: 0 7px; border-radius: 7px; background: transparent; border-color: var(--line-2); }
.op-chip.muted { background: var(--raise); color: var(--muted); border-color: var(--line-2); }
.op-chip.warn { background: var(--late-bg); color: var(--late); border-color: var(--late-line); }
.op-chip.up { background: var(--up-bg); color: var(--up); border-color: var(--up-line); }
.op-chip.down { background: var(--down-bg); color: var(--down); border-color: var(--down-line); }
.op-mine { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.op-warn { margin: 0; padding: 8px 10px; border: 1px solid var(--late-line); border-radius: 10px; background: var(--late-bg); color: var(--late); font-size: 13.5px; line-height: 1.45; }
.op-switch { margin: 0; padding: 8px 10px; border: 1px solid var(--tint-line); border-radius: 10px; background: var(--tint-bg); font-size: 13.5px; line-height: 1.45; }
.op-card details { border-top: 1px solid var(--row-line); padding-top: 6px; }
.op-card summary { cursor: pointer; color: var(--accent); font-size: 14px; font-weight: 600; min-height: 32px; display: flex; align-items: center; }
.op-card details > * + * { margin-top: 6px; }
.op-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.op-table th, .op-table td { padding: 6px 6px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--row-line); font-variant-numeric: tabular-nums; }
.op-table th:first-child { text-align: left; font-weight: 600; }
.op-table thead th { color: var(--faint); font-size: 12.5px; font-weight: 500; }
.op-table td.op-b { text-align: left; color: var(--muted); }
.op-table .up { color: var(--up); }
.op-block { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.op-block h2 { margin: 0; font-size: 18px; font-weight: 600; }
.op-more { justify-self: start; height: 34px; padding: 0 12px; border: 1px solid var(--line-2); border-radius: 9px; color: var(--accent); font-weight: 600; }
.op-empty { margin: 6px 2px; color: var(--muted); }
.op-foot { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--faint); max-width: 90ch; }
.op .up { color: var(--up); } .op .down { color: var(--down); }
`;

// ---------------------------------------------------------------------------------------------------------------
// Modül
// ---------------------------------------------------------------------------------------------------------------
export function mountOptimum(root, { realm = 0 } = {}) {
  let r = realm;
  const prefs = readPrefs();
  let yuklenen = null; // { data, mevsimlik, ozet, live }
  let gamePhase = null;
  let hata = null;
  let token = 0;
  let destroyed = false;
  let lastAuto = 0;
  const acik = new Set(); // "Diğer seçenekler" açık olan binalar
  let urunlerAcik = false;

  const style = document.createElement('style');
  style.dataset.module = 'optimum';
  style.textContent = CSS;
  document.head.append(style);

  const ad = {
    urun: (id) => yuklenen?.data?.products?.[id]?.name || `#${id}`,
    bina: (h) => binaAdi(h),
    kaliteli: (id) => H.hasQuality(yuklenen?.data?.products?.[id]),
  };

  function render() {
    if (destroyed) return;
    if (r !== DESTEKLENEN_REALM) { root.innerHTML = R2_HTML; return; }
    if (hata) {
      root.innerHTML = `<section class="op"><div class="op-head"><div><h1>Optimum Seviye</h1></div></div><div class="alert" role="alert"><span>${esc(`Veriler okunamadı: ${hata}`)}</span><button type="button" class="btn" data-act="yenile">Tekrar dene</button></div></section>`;
      return;
    }
    if (!yuklenen) { root.innerHTML = '<section class="op" aria-busy="true"><div class="op-head"><div><h1>Optimum Seviye</h1><p class="op-when">Yükleniyor</p></div></div></section>'; return; }
    const st = durumHesapla({
      ...yuklenen, company: Y.loadCompanyRecord(r).company, kurulum: kurulumOku(r), gamePhase, prefs, simdi: Date.now(),
    });
    st.acik = acik;
    st.urunlerAcik = urunlerAcik;
    const scroll = window.scrollY;
    root.innerHTML = sayfaHtml(st, ad);
    window.scrollTo(0, scroll);
  }

  async function yukle({ taze = false } = {}) {
    const my = ++token;
    hata = null;
    root.querySelector('[data-act="yenile"]')?.classList.add('spin');
    try {
      const opts = taze ? { refresh: (p) => p.startsWith('live/') || p.startsWith('meta/optimum_') } : undefined;
      const [v, gp] = await Promise.all([veriYukle(r, opts), loadGamePhase(r)]);
      if (destroyed || my !== token) return;
      yuklenen = v;
      gamePhase = gp;
    } catch (e) {
      if (destroyed || my !== token) return;
      hata = e?.message || String(e);
    }
    render();
  }

  // Canlı fiyat: borsa ekranı gibi dakikada bir bakılır; belge 7 dakikadan eskiyse (bot 5 dakikada bir yazar) yenilenir
  async function tick() {
    if (destroyed || r !== DESTEKLENEN_REALM || document.visibilityState !== 'visible' || !yuklenen) return;
    const now = Date.now();
    if (now - (yuklenen.live?.t || 0) < 7 * MIN || now - lastAuto < 3 * MIN) {
      if (prefs.tab === 'guncel') render(); // "x dk önce" yazısı güncel kalsın
      return;
    }
    lastAuto = now;
    try {
      const rr = r;
      const live = await canliYukle(rr);
      if (destroyed || rr !== r || !yuklenen) return;
      yuklenen = { ...yuklenen, live };
      if (prefs.tab === 'guncel') render();
    } catch { /* bir sonraki dakikada yeniden denenir */ }
  }
  const clock = setInterval(tick, MIN);
  const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
  document.addEventListener('visibilitychange', onVisible);

  function onClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) { prefs.tab = tab.dataset.tab; savePrefs(prefs); render(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'faz') { prefs.faz = b.dataset.v === 'auto' ? 'auto' : Number(b.dataset.v); savePrefs(prefs); render(); }
    else if (act === 'pay') { prefs.pay = Number(b.dataset.v); savePrefs(prefs); render(); }
    else if (act === 'urunler') { urunlerAcik = true; render(); }
    else if (act === 'yenile') yukle({ taze: true });
  }
  function onToggle(e) {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.dataset.ac) return;
    if (d.open) acik.add(d.dataset.ac); else acik.delete(d.dataset.ac);
  }
  function onKey(e) {
    const tabs = root.querySelector('.op-tabs');
    if (!tabs || !tabs.contains(e.target) || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const i = SEKMELER.findIndex(([k]) => k === prefs.tab);
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + SEKMELER.length) % SEKMELER.length;
    prefs.tab = SEKMELER[j][0];
    savePrefs(prefs);
    render();
    root.querySelector(`[data-tab="${prefs.tab}"]`)?.focus();
  }
  // Yönetim ya da Üretim başka bir sekmede değişirse (aynı tarayıcı) ekran yeni kayıtla çizilir
  const onStorage = (e) => { if (e.key && (e.key.startsWith('dentsimco.sirket.') || e.key.startsWith('dentsimco.uretim.'))) render(); };

  root.addEventListener('click', onClick);
  root.addEventListener('toggle', onToggle, true);
  root.addEventListener('keydown', onKey);
  window.addEventListener('storage', onStorage);
  document.title = 'Optimum Seviye | DentSimco';
  render();
  if (r === DESTEKLENEN_REALM) yukle();

  return {
    setRealm(next) {
      if (next === r) return;
      r = next;
      yuklenen = null;
      hata = null;
      token++;
      render();
      if (r === DESTEKLENEN_REALM) yukle();
    },
    destroy() {
      destroyed = true;
      token++;
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
      root.removeEventListener('click', onClick);
      root.removeEventListener('toggle', onToggle, true);
      root.removeEventListener('keydown', onKey);
      style.remove();
      root.replaceChildren();
    },
  };
}
