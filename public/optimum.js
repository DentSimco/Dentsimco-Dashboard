// DentSimco — Optimum Seviye (yalnız gösterim)
//
// Hesap ve sayfa durumu optimum-hesap.js'te (sayfaDurumu; yayında en güçlü ayarla gizlenir). Bu dosya veriyi yükler,
// sonucu gösterir ve tarayıcı tercihlerini tutar; formül, katsayı ya da ara değer içermez. Sayfada da yalnız sonuç
// görünür: ürün, kalite, seviye, günlük kâr ve sınır (fiyat, girdi maliyeti, saatlik üretim ya da pazar büyüklüğü değil).
// Üst sekmeler: "Üretim" (satış sınırsız: bina × ürün × kalite seçince şirketin bugünkü binalarının üstüne eklenecek seviye;
// Ekle ile Üretim kurulumuna yazılır; veri: meta/optimum_r0, son 28 günün borsa özeti, sinyal motorunun gece çalışması yazar)
// ve "Perakende" (mağaza × ürün × kalite için ideal seviye; satış ve alım sınırsız; Ekle ile Perakende kaydına yazılır).
// Seçili ürünün en kârlı kalitesi kalite seçicide yıldızla (★) gösterilir.
// Şirkete özgü her şey bu tarayıcıdaki kayıtlardan okunur: yöneticiler (Yönetim › Ekip, dentsimco.sirket.r{r}) ve
// binalar ile rekreasyon (Üretim kurulumu, dentsimco.uretim.r{r}). Yalnız R1 (realm 0); R2 geliştirme aşamasında.

import { readDocs, PATHS, dataField, loadGamePhase, fmtAgo, fmtDate, fmtDateTime, fmtPrice, MIN } from './veri.js';
import * as H from './hesap.js';
import * as O from './optimum-hesap.js';
import * as R from './hesap-perakende.js';
import * as Y from './yonetici.js';
import { binaAdi } from './adlar.js';
import { LOCALE } from './i18n.js';

const PREFS_KEY = 'dentsimco.optimum.v1';
const URETIM_KEY = (r) => `dentsimco.uretim.r${r}`;
const PERAKENDE_KEY = (r) => `dentsimco.perakende.r${r}`;
const LIST_MAX = 15;
// Üst sekmeler: Üretim (anahtar 'tum') ve Perakende ('pk')
const ANA = [['tum', 'Üretim'], ['pk', 'Perakende']];
export const DESTEKLENEN_REALM = 0;

// ---- biçimlendirme ----
const NF0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fin = (x) => x != null && Number.isFinite(x);
export const para = (x) => (fin(x) ? `${x < 0 ? '−' : ''}$${NF0.format(Math.abs(Math.round(x)))}` : '—');
const pct = (x) => `%${NF0.format(Math.round(x * 100))}`;
const isaretli = (n) => (n > 0 ? `+${NF0.format(n)}` : n < 0 ? `−${NF0.format(-n)}` : '0');

// ---- tercihler ----
// Seviye hesaplama seçimi: { harf, id, q } (bozuksa boş; geçersiz seçim sayfa durumunda en kârlıya döner)
export function okuHesap(x) {
  if (!x || typeof x !== 'object') return {};
  const o = {};
  if (typeof x.harf === 'string' && x.harf.length >= 1 && x.harf.length <= 3) o.harf = x.harf;
  if (Number.isFinite(Number(x.id)) && x.id !== null && x.id !== '') o.id = Number(x.id);
  if (Number.isFinite(Number(x.q)) && x.q !== null && x.q !== '') o.q = Math.min(12, Math.max(0, Math.floor(Number(x.q))));
  return o;
}
function readPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { p = {}; }
  return {
    ana: ANA.some(([k]) => k === p.ana) ? p.ana : 'tum',
    hesap: okuHesap(p.hesap),
    pk: okuHesap(p.pk),
    faz: [0, 1, 2].includes(p.faz) ? p.faz : 'auto',
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
    type: b.type, product: b.product != null ? Number(b.product) : null, quality: H.clampQuality(b.quality), level: Math.max(0, Math.floor(Number(b.level) || 0)),
    count: Math.max(1, Math.floor(Number(b.count) || 1)), robots: !!b.robots, construction: !!b.construction,
  }));
  return { buildings, recreation: { ...(raw.recreation || {}) }, extraBonusPct: Math.min(99, Math.max(0, Number(raw.extraBonusPct) || 0)) };
}

// Perakende kaydından yalnız gerekenler: rekreasyon, elle satış hızı ve mağazalar (harf, ürün, kalite, seviye)
export function perakendeOku(r) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(PERAKENDE_KEY(r)) || 'null'); } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return { buildings: [], recreation: {}, salesSpeedPct: 0 };
  const buildings = (Array.isArray(raw.buildings) ? raw.buildings : []).filter((b) => b && typeof b === 'object' && typeof b.letter === 'string').map((b) => ({
    letter: b.letter, product: Number(b.product), quality: R.clampQuality(b.quality), level: Math.max(0, Math.floor(Number(b.level) || 0)), construction: !!b.construction,
  }));
  const rec = {};
  for (const k of ['park', 'temple', 'lake']) rec[k] = Math.min(3, Math.max(0, Math.floor(Number(raw.recreation?.[k]) || 0)));
  return { buildings, recreation: rec, salesSpeedPct: Math.max(0, Number(raw.salesSpeedPct) || 0) };
}

// ---- veri ----
async function veriYukle(r, options) {
  const P = {
    products: PATHS.meta(`products_r${r}`), buildings: PATHS.meta('buildings'), core: PATHS.meta('core'),
    modifiers: PATHS.meta(`modifiers_r${r}`), ozet: PATHS.meta(`optimum_r${r}`), live: PATHS.live(r), retail: PATHS.meta(`retail_r${r}`),
  };
  const docs = await readDocs(Object.values(P), options);
  const get = (k) => dataField(docs.get(P[k]));
  const raw = get('products');
  if (!raw || !Object.keys(raw).length) throw new Error('Ürün verisi okunamadı.');
  const core = get('core') || {};
  const data = H.normalizeData({ products: raw, buildings: get('buildings') || {}, core, modifiers: get('modifiers') || {}, realm: r });
  // Perakende doygunluğu: ürün verisindeki değer, botun yazdığı meta/retail üstüne yazar (Perakende sayfasıyla aynı)
  const doygunluk = {};
  for (const [id, p] of Object.entries(raw)) {
    const v = p?.marketSaturation;
    if (v != null && v !== '' && Number.isFinite(Number(v))) doygunluk[id] = Number(v);
  }
  const ri = get('retail');
  Object.assign(doygunluk, R.parseSaturation(Array.isArray(ri) ? ri : ri?.items ?? ri));
  const qw = Number(core.RETAIL_MODELING_QUALITY_WEIGHT);
  return { data, mevsimlik: O.mevsimlikUrunler(raw, core), ozet: get('ozet'), live: get('live'), pk: { saturation: doygunluk, qualityWeight: Number.isFinite(qw) && core.RETAIL_MODELING_QUALITY_WEIGHT != null ? qw : undefined } };
}

async function canliYukle(r) {
  const path = PATHS.live(r);
  const docs = await readDocs([path], { refresh: (p) => p === path });
  return dataField(docs.get(path)) || null;
}

// ---- ekran parçaları (saf: yalnız metin üretir, sınamada İngilizce çeviri de denetlenir) ----
const SINIR = {
  yonetim: ['Yönetim gideri sınırlı', ''],
  zarar: ['Kâr etmiyor', 'down'],
};
const chip = (text, kind = '') => `<span class="op-chip ${kind}">${esc(text)}</span>`;
const qChip = (ad, x) => (ad.kaliteli(x.id) ? chip(`Q${x.q}`, 'q') : '');

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
      <p>${esc('Binalarınız girilmedi: öneriler tek binalı bir şirket için hesaplandı. Şirketiniz büyüdükçe öneriler çok daha düşük çıkar. Binalarınızı Üretim sekmesine girin.')}</p>
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

// Hazır pay düğmeleri ve elle yazılan oran kutusu (hazır olmayan bir oran seçiliyse kutuda görünür, düğmeler basılı olmaz)
function fazAlani(st) {
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
  return `<div class="op-field"><span>Ekonomi fazı (üretim hızı)</span>${seg('faz', fazlar, secili)}${fazNot ? `<p class="op-note">${esc(fazNot)}</p>` : ''}</div>`;
}

function binaKarti(b, st, ad, onek = '') {
  const kendi = st.sirket?.kendi?.[b.harf] || 0;
  const [sinirAd, sinirTur] = SINIR[b.sinir] || ['', ''];
  const fark = kendi > 0 ? b.L - kendi : null;
  const sizde = kendi > 0 ? `<span class="op-mine">${esc(`Sizde: ${NF0.format(kendi)} seviye`)}${fark ? ` ${chip(isaretli(fark), fark > 0 ? 'up' : 'down')}` : ''}</span>` : '';
  const urun = b.L > 0 || b.sinir !== 'zarar'
    ? `<div class="op-prod"><span class="op-name">${esc(ad.urun(b.id))}</span>${qChip(ad, b)}<span class="op-kar ${b.kar > 0 ? 'up' : ''}">${para(b.kar)}</span><span class="op-unit">/ gün</span></div>`
    : '';
  const not = b.sinir === 'zarar' ? `<p class="op-note">${esc('Bu binada 28 günlük verilerle kâr eden ürün yok.')}</p>` : '';
  const alt = b.secenekler.map((y) => `<tr><th scope="row">${esc(ad.urun(y.id))} ${qChip(ad, y)}</th><td>${NF0.format(y.L)}</td><td class="${y.kar > 0 ? 'up' : ''}">${para(y.kar)}</td><td>${esc(SINIR[y.sinir]?.[0] || '')}</td></tr>`).join('');
  return `<article class="op-card" data-harf="${esc(b.harf)}">
    <div class="op-top"><h3>${esc(ad.bina(b.harf))}</h3><span class="op-level"><b>${NF0.format(b.L)}</b><small>seviye</small></span></div>
    ${urun}
    <div class="op-chips">${sinirAd ? chip(sinirAd, sinirTur) : ''}${sizde}</div>
    ${not}
    <details data-ac="${esc(onek + b.harf)}"${st.acik?.has(onek + b.harf) ? ' open' : ''}><summary>Diğer seçenekler</summary>
      <div class="table-wrap"><table class="op-table"><thead><tr><th scope="col">Ürün</th><th scope="col">Seviye</th><th scope="col">Günlük kâr</th><th scope="col">Sınır</th></tr></thead><tbody>${alt}</tbody></table></div>
    </details>
  </article>`;
}

function urunlerBlogu(liste, st, ad, baslik = 'Tüm ürünler', sade = false) {
  const hepsi = st.urunlerAcik ? liste : liste.slice(0, LIST_MAX);
  // sade: tek bina için; bina ve sınır sütunları hep aynı olduğundan gösterilmez (telefonda yana taşmaz)
  const satir = (u) => `<tr><th scope="row">${esc(ad.urun(u.id))} ${qChip(ad, u)}</th>${sade ? '' : `<td class="op-b">${esc(ad.bina(u.harf))}</td>`}<td>${NF0.format(u.L)}</td><td class="${u.kar > 0 ? 'up' : ''}">${para(u.kar)}</td>${sade ? '' : `<td>${esc(SINIR[u.sinir]?.[0] || '')}</td>`}</tr>`;
  const daha = liste.length > hepsi.length ? `<button type="button" class="op-more" data-act="urunler">${esc(`Tümünü göster (${liste.length})`)}</button>` : '';
  return `<section class="op-block"><h2>${esc(baslik)}</h2><p class="op-note">Her ürünün en kârlı kalitesi ve o ürün için önerilen seviye.</p>
      <div class="table-wrap"><table class="op-table"><thead><tr><th scope="col">Ürün</th>${sade ? '' : '<th scope="col">Bina</th>'}<th scope="col">Seviye</th><th scope="col">Günlük kâr</th>${sade ? '' : '<th scope="col">Sınır</th>'}</tr></thead><tbody>${hepsi.map(satir).join('')}</tbody></table></div>${daha}</section>`;
}

export function basHtml(st) {
  const pk = st.prefs?.ana === 'pk';
  const oz = pk ? null : st.oz; // 28 günlük özet yalnız Üretim sekmesini ilgilendirir
  const zaman = pk ? '' : oz ? `${fmtDate(Date.parse(`${oz.bas}T12:00:00Z`))} – ${fmtDate(Date.parse(`${oz.gun}T12:00:00Z`))} verisiyle · ${fmtAgo(oz.t, st.simdi)}` : 'Özet yok';
  const eski = Boolean(oz && st.eski);
  return `<div class="op-head"><div><h1>Optimum Seviye</h1>${zaman ? `<p class="op-when${eski ? ' stale' : ''}">${esc(zaman)}</p>` : ''}</div>
    <button type="button" class="icon-btn" data-act="yenile" aria-label="Yenile" title="Yenile"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M16.2 10a6.2 6.2 0 1 1-1.9-4.5M16.4 3.4v3.4H13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
    ${eski ? `<p class="op-warn" role="alert">${esc(`28 günlük özet güncel değil: son hesap ${fmtDateTime(oz.t)}. Öneriler bu tarihin verisiyle.`)}</p>` : ''}`;
}

export const R2_HTML = `<section class="op"><div class="op-head"><div><h1>Optimum Seviye</h1></div></div>
  <section class="op-alert soft" role="note"><h2>R2 için geliştirme aşamasında</h2><p>Optimum Seviye şimdilik yalnız R1 için hesaplanıyor. R2 için yeterli geçmiş veri birikince eklenecek.</p></section></section>`;

export function anaSekmelerHtml(st) {
  const cur = st.prefs.ana === 'pk' ? 'pk' : 'tum';
  return `<div class="op-tabs op-main" role="tablist" aria-label="Optimum Seviye hesabı">${ANA.map(([k, t]) =>
    `<button type="button" role="tab" data-ana="${k}" aria-selected="${k === cur}" tabindex="${k === cur ? 0 : -1}">${esc(t)}</button>`).join('')}</div>`;
}

// ---- Tüm Ürün Satışına Göre: pazar sınırı yok; bina × ürün × kalite seçince şirketin bugünkü binalarının üstüne eklenecek seviye ----
const kaliteAdi = (ad, id, q) => `${ad.urun(id)}${ad.kaliteli(id) ? ` Q${q}` : ''}`;

// Ek seviye kâr getirmiyorsa: neden ve (başka binası olmayan bir şirket için) en kârlı seviye
function yalnizNotu(hs) {
  const y = hs.yalniz;
  const metin = y && y.L > 0
    ? ['Şirketinizin bugünkü yönetim gideriyle ek seviye kâr getirmiyor.', `Başka binanız olmasaydı en kârlı seviye ${NF0.format(y.L)} olurdu (${para(y.kar)} / gün).`]
    : ['Bu kalitede hiçbir seviye kâr getirmiyor.'];
  return `<p class="op-note">${metin.map((m) => `<span>${esc(m)}</span>`).join(' ')}</p>`;
}

// k: { t (sonuç), sel (seçici öznitelik), act (Ekle düğmesi), acKey, notu, binaEtiket, yeniEtiket, mevcutEtiket, mevcutNot, ekChips(hs), son (son ekleme), sonMetin(son) }
function hesapKarti(st, ad, k) {
  const t = k.t;
  if (!t?.hesap || !t.secim) return '';
  const hs = t.hesap;
  const secim = t.secim;
  const h = t.secenek.find((e) => e.harf === secim.harf);
  const u = h.urunler.find((e) => e.id === secim.id);
  const kaliteli = ad.kaliteli(secim.id);
  const opt = (v, text, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(text)}</option>`;
  const chips = k.ekChips(hs);
  const egri = hs.yari && hs.buyuk ? `<p class="op-note">${esc('Kâr en çok önerilen seviyededir; ondan sonra düşer.')}</p><div class="table-wrap"><table class="op-table op-egri"><thead><tr><th scope="col">Kâr eğrisi</th><th scope="col">Seviye</th><th scope="col">Günlük kâr</th></tr></thead><tbody>
      <tr><th scope="row">Yarısı</th><td>${NF0.format(hs.yari.L)}</td><td>${para(hs.yari.kar)}</td></tr>
      <tr class="on"><th scope="row">Önerilen</th><td>${NF0.format(hs.L)}</td><td class="up">${para(hs.kar)}</td></tr>
      <tr><th scope="row">1,5 katı</th><td>${NF0.format(hs.buyuk.L)}</td><td>${para(hs.buyuk.kar)}</td></tr></tbody></table></div>` : '';
  const kalite = hs.kaliteler.length > 1 ? `<details data-ac="${k.acKey}"${st.acik?.has(k.acKey) ? ' open' : ''}><summary>Kaliteleri karşılaştır</summary>
      <div class="table-wrap"><table class="op-table"><thead><tr><th scope="col">Kalite</th><th scope="col">Seviye</th><th scope="col">Günlük kâr</th>${k.islemSutunu ? '<th scope="col">İşlem günü</th>' : ''}</tr></thead><tbody>${hs.kaliteler.map((x) =>
        `<tr${x.q === secim.q ? ' class="on"' : ''}><th scope="row">Q${x.q}${x.q === u.ana ? ' ★' : ''}${x.son ? ` ${chip('Son işlem', 'muted')}` : ''}</th><td>${NF0.format(x.L)}</td><td class="${x.kar > 0 ? 'up' : ''}">${para(x.kar)}</td>${k.islemSutunu ? `<td>${NF0.format(x.gun || 0)}/${NF0.format(hs.islem?.pencere || 0)}</td>` : ''}</tr>`).join('')}</tbody></table></div></details>` : '';
  const var_ = hs.L >= 1;
  const mevcutVar = hs.ayni > 0;
  const son = k.son;
  const sonMetin = son?.hata ? `<p class="op-warn" role="alert">${esc('Tarayıcı kaydı açık değil; eklenemedi.')}</p>` : son ? k.sonMetin(son) : '';
  return `<section class="op-block op-calc" aria-label="Seviye hesapla"><h2>Seviye hesapla</h2>
    <p class="op-note">${esc(k.notu)}</p>
    <div class="op-fields">
      <label class="op-f"><span>${esc(k.binaEtiket)}</span><select class="op-in" data-${k.sel}="harf">${t.secenek.map((e) => opt(e.harf, ad.bina(e.harf), e.harf === secim.harf)).join('')}</select></label>
      <label class="op-f"><span>Ürün</span><select class="op-in" data-${k.sel}="id">${h.urunler.map((e) => opt(e.id, ad.urun(e.id), e.id === secim.id)).join('')}</select></label>
      ${kaliteli ? `<label class="op-f"><span>Kalite</span><select class="op-in" data-${k.sel}="q">${u.kaliteler.map((k) => opt(k, `Q${k}${k === u.ana ? ' ★' : ''}`, k === secim.q)).join('')}</select></label>` : ''}
    </div>
    <div class="op-card op-res">
      <div class="op-top"><h3>${esc(kaliteAdi(ad, secim.id, secim.q))}</h3><span class="op-level"><b>${NF0.format(hs.L)}</b><small>seviye ekleyin</small></span></div>
      <div class="op-prod"><span class="op-name">${esc('Ek günlük kâr')}</span><span class="op-kar ${hs.kar > 0 ? 'up' : ''}">${para(hs.kar)}</span><span class="op-unit">/ gün</span></div>
      <div class="op-chips">${chips.join('')}</div>
      ${var_ ? egri : yalnizNotu(hs)}
      ${k.islemNotu ? k.islemNotu(hs) : ''}
      ${kalite}
      <div class="op-ekle">
        <button type="button" class="op-btn primary" data-act="${k.act}" data-v="yeni"${var_ ? '' : ' disabled'}>${esc(`${k.yeniEtiket} (+${NF0.format(hs.L)})`)}</button>
        <button type="button" class="op-btn" data-act="${k.act}" data-v="mevcut"${var_ && mevcutVar ? '' : ' disabled'}>${esc(`${k.mevcutEtiket} (+${NF0.format(hs.L)})`)}</button>
      </div>
      ${var_ && !mevcutVar ? `<p class="op-note">${esc(k.mevcutNot)}</p>` : ''}
      ${sonMetin}
    </div></section>`;
}

// Borsa işlem sıklığı ve fiyatın güvenilirliği (28 günlük özetteki işlem günü sayısı)
export function uretimIslemNotu(hs, st) {
  const { gun: g, pencere: w, sonT } = hs.islem || {};
  if (!(w > 0)) return '';
  const ago = sonT ? ` <span>${esc(`Son işlem ${fmtAgo(sonT, st.simdi)}.`)}</span>` : '';
  let metin;
  let uyari = false;
  if (g >= Math.ceil(w * 0.75)) metin = `Borsada son ${w} günün ${g} gününde işlem gördü: fiyat güvenilir.`;
  else if (g >= Math.ceil(w * 0.5)) metin = `Borsada son ${w} günün ${g} gününde işlem gördü: fiyat orta güvenilirlikte.`;
  else if (g > 0) { metin = `Borsada son ${w} günün yalnız ${g} gününde işlem gördü: seyrek işlem, fiyat güvenilir değil.`; uyari = true; }
  else { metin = `Borsada son ${w} günde bu kalitede işlem yok; fiyat son işlemden: güvenilir değil.`; uyari = true; }
  return `<p class="${uyari ? 'op-warn' : 'op-note'}" role="note">${esc(metin)}${ago}</p>`;
}

export function hesapHtml(st, ad) {
  return hesapKarti(st, ad, {
    t: st.tum, sel: 'hs', act: 'ekle', acKey: 'tumq', son: st.sonEkle, binaEtiket: 'Bina', islemSutunu: true,
    islemNotu: (hs) => uretimIslemNotu(hs, st),
    notu: "Bina, ürün ve kalite seçin. Öneri, şirketinizin bugünkü binalarının üstüne eklenecek en kârlı seviyedir; yönetim ekibiniz ve Üretim'deki binalarınız hesaba katılır.",
    yeniEtiket: 'Yeni bina olarak ekle', mevcutEtiket: 'Mevcut binaya ekle', mevcutNot: "Mevcut binaya ekle: Üretim'de bu bina, ürün ve kalitede kurulu bina yok.",
    ekChips: (hs) => {
      const c = [];
      if (hs.son) c.push(chip('Fiyat son işlemden (borsada seyrek işlem görüyor)', 'warn'));
      if (hs.ayni > 0) c.push(chip(`Zaten kurulu: ${NF0.format(hs.ayni)} seviye`, 'muted'));
      if (st.sirket?.sirketVar && hs.L > 0) c.push(chip(`Şirketiniz: ${NF0.format(st.sirket.toplamSeviye)} → ${NF0.format(hs.toplamSonra)} seviye`, 'muted'));
      return c;
    },
    sonMetin: (son) => `<p class="op-ok" role="status">${esc(`${son.mod === 'mevcut' ? 'Mevcut binaya eklendi' : 'Yeni bina eklendi'}: ${kaliteAdi(ad, son.id, son.q)} +${NF0.format(son.L)} seviye.`)} <a href="#uretim/binalar">${esc("Üretim › Binalar'da gör")}</a></p>`,
  });
}

// ---- Perakende: mağaza × ürün × kalite için ideal seviye (satış ve alım sınırsız) ----
// Maliyet = borsanın güncel fiyatı; son işlem eskiyse (24 saatten fazla) fiyat güncel olmayabilir
export function pkIslemNotu(hs, st) {
  if (!hs.sonT) return '';
  const eski = st.simdi - hs.sonT > 24 * 3_600_000;
  const metin = eski
    ? `Borsada son işlem ${fmtAgo(hs.sonT, st.simdi)}: maliyet fiyatı güncel olmayabilir.`
    : `Maliyet, borsanın güncel fiyatıdır; son işlem ${fmtAgo(hs.sonT, st.simdi)}.`;
  return `<p class="${eski ? 'op-warn' : 'op-note'}" role="note">${esc(metin)}</p>`;
}

export function pkKartiHtml(st, ad) {
  const t = st.pk;
  if (!t?.hesap || !t.secim) return '';
  return hesapKarti(st, ad, {
    t, sel: 'pk', act: 'pkEkle', acKey: 'pkq', son: st.sonEklePk, binaEtiket: 'Mağaza',
    islemNotu: (hs) => pkIslemNotu(hs, st),
    notu: "Mağaza, ürün ve kalite seçin. Öneri, şirketinizin bugünkü binalarının üstüne eklenecek en kârlı seviyedir; yönetim ekibiniz, Üretim'deki ve Perakende'deki binalarınız hesaba katılır.",
    yeniEtiket: 'Yeni mağaza olarak ekle', mevcutEtiket: 'Mevcut mağazaya ekle', mevcutNot: "Mevcut mağazaya ekle: Perakende'de bu mağaza, ürün ve kalitede kurulu mağaza yok.",
    ekChips: (hs) => {
      const c = [chip(`Satış fiyatı ${fmtPrice(hs.fiyat)}`, 'muted'), chip(`Birim maliyet ${fmtPrice(hs.maliyet)}`, 'muted')];
      if (hs.ayni > 0) c.push(chip(`Zaten kurulu: ${NF0.format(hs.ayni)} seviye`, 'muted'));
      if (st.sirket?.sirketVar && hs.L > 0) c.push(chip(`Şirketiniz: ${NF0.format(st.sirket.toplamSeviye)} → ${NF0.format(hs.toplamSonra)} seviye`, 'muted'));
      return c;
    },
    sonMetin: (son) => `<p class="op-ok" role="status">${esc(`${son.mod === 'mevcut' ? 'Mevcut mağazaya eklendi' : 'Yeni mağaza eklendi'}: ${kaliteAdi(ad, son.id, son.q)} +${NF0.format(son.L)} seviye.`)} <a href="#perakende/binalar">${esc("Perakende › Binalar'da gör")}</a></p>`,
  });
}

export function pkHtml(st, ad) {
  const t = st.pk;
  if (t.veriYok || !t.hesap) return `<p class="op-empty">${esc('Perakende verisi (doygunluk ve fiyat) okunamadı.')}</p>`;
  return `<section class="op-set op-set-tek" aria-label="Ayarlar">${fazAlani(st)}</section>
    <p class="op-warn" role="note">${esc('Satışın ve alımın sınırsız olduğu varsayılır: mağazanın seviye başına satışı seviyeyle azalmaz ve istediğiniz kadar ürün borsadan güncel fiyatla alınır. Bu sekme üst sınırı gösterir.')}</p>
    <p class="op-line">${esc(`Toplam satış bonusu %${NF1.format(t.bonus)} (Perakende kurulumu ve yönetim ekibiniz).`)}</p>
    ${pkKartiHtml(st, ad)}
    ${urunlerBlogu(t.urunler.filter((u) => u.harf === t.secim.harf), st, ad, 'Bu mağazadaki ürünler', true)}
    <p class="op-foot">${esc('Öneriler DentSimco formülüyle hesaplanır. Fiyat, en kârlı satış fiyatıdır; maliyet borsanın güncel fiyatıdır. Restoran ve Satış ofisi gösterilmez.')}</p>`;
}

export function tumHtml(st, ad) {
  if (!st.oz) return `<p class="op-empty">${esc('28 günlük özet henüz hesaplanmadı. Gece hesabı her gece 04:20\'de (TR) çalışır; ilk çalışmadan sonra burada görünür.')}</p>`;
  const t = st.tum;
  if (!t.binalar.length) return `<p class="op-empty">${esc('Bu ayarlarla gösterilecek bina yok.')}</p>`;
  return `<section class="op-set op-set-tek" aria-label="Ayarlar">${fazAlani(st)}</section>
    <p class="op-warn" role="note">${esc('Satışın sınırsız ve fiyatın sabit olduğu varsayılır; büyük seviyelerde gerçekte fiyat düşer. Bu sekme üst sınırı gösterir.')}</p>
    ${hesapHtml(st, ad)}
    <section class="op-block"><h2>Seçilen binada en kârlı</h2><p class="op-note">${esc('Seçtiğiniz bina için 28 günlük fiyatlarla, satış sınırı olmadan en kârlı ürün, kalite ve seviye. Tavanı yalnızca maaş ve yönetim gideri belirler.')}</p>
      <div class="op-grid op-grid-tek">${t.binalar.filter((b) => b.harf === t.secim?.harf).map((b) => binaKarti(b, st, ad, 't:')).join('')}</div></section>
    ${urunlerBlogu(t.urunler.filter((u) => u.harf === t.secim?.harf), st, ad, 'Bu binadaki ürünler', true)}
    <p class="op-foot">${esc('Öneriler DentSimco formülüyle hesaplanır. İnşaat maliyeti, kalite üretebilme (araştırma, patent) ve kendi ürettiğiniz girdiler hesaba katılmaz. Mevsimlik ürünler ve borsada satışı olmayan ürünler gösterilmez.')}</p>`;
}

/** Sayfanın tamamı (saf). ad: { urun(id), bina(harf), kaliteli(id) } */
export function sayfaHtml(st, ad) {
  const ic = st.prefs.ana === 'pk' ? pkHtml(st, ad) : tumHtml(st, ad);
  return `<section class="op">${basHtml(st)}${uyarilarHtml(st)}${sirketSatiri(st)}${anaSekmelerHtml(st)}${ic}</section>`;
}

/**
 * Seçilen mağazayı Perakende kaydına ekler (saf). mod 'yeni': yeni mağaza satırı; 'mevcut': aynı harf, ürün ve kalitedeki
 * mağazanın seviyesine ekler (yoksa yeni satır). Dönüş: { raw, mod } | null (seviye 1'den küçükse)
 */
export function pkBinaEkle(raw, { harf, id, q, L }, mod) {
  const seviye = Math.floor(Number(L));
  if (!(seviye >= 1) || !harf) return null;
  const kayit = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  const liste = Array.isArray(kayit.buildings) ? [...kayit.buildings] : [];
  let yapilan = 'yeni';
  if (mod === 'mevcut') {
    const i = liste.findIndex((b) => b && typeof b === 'object' && b.letter === harf && Number(b.product) === id && R.clampQuality(b.quality) === q && !b.construction);
    if (i >= 0) {
      liste[i] = { ...liste[i], level: Math.max(0, Math.floor(Number(liste[i].level) || 0)) + seviye };
      yapilan = 'mevcut';
    }
  }
  if (yapilan === 'yeni') {
    liste.push({ id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, letter: harf, product: id, quality: q, level: seviye, cost: null, price: null, construction: false });
  }
  kayit.buildings = liste;
  return { raw: kayit, mod: yapilan };
}

/**
 * Seçilen binayı Üretim kurulum kaydına ekler (saf; kayıt ayrıştırılmış nesne). mod 'yeni': yeni bina satırı;
 * 'mevcut': aynı bina türü, ürün ve kalitede kurulu binanın seviyesine ekler (yoksa yeni satır olur).
 * Dönüş: { raw, mod } (mod: gerçekte yapılan) | null (seviye 1'den küçükse)
 */
export function binaEkle(raw, { harf, id, q, L }, mod) {
  const seviye = Math.floor(Number(L));
  if (!(seviye >= 1) || !harf) return null;
  const kayit = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : { v: 1 };
  const liste = Array.isArray(kayit.buildings) ? [...kayit.buildings] : [];
  let yapilan = 'yeni';
  if (mod === 'mevcut') {
    const uygun = (b) => b && typeof b === 'object' && b.type === harf && Number(b.product) === id && H.clampQuality(b.quality) === q && !b.construction;
    let i = liste.findIndex((b) => uygun(b) && !b.robots);
    if (i < 0) i = liste.findIndex(uygun);
    if (i >= 0) {
      liste[i] = { ...liste[i], level: Math.max(1, Math.floor(Number(liste[i].level) || 1)) + seviye };
      yapilan = 'mevcut';
    }
  }
  if (yapilan === 'yeni') {
    liste.push({ id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type: harf, product: id, level: seviye, quality: q, robots: false, efficiency: 100, construction: false });
  }
  kayit.buildings = liste;
  return { raw: kayit, mod: yapilan };
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
.op-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.op-f { display: grid; gap: 4px; min-width: 0; }
.op-f > span { color: var(--muted); font-size: 12.5px; font-weight: 600; }
.op-in { width: 100%; min-width: 0; box-sizing: border-box; height: 46px; padding: 0 12px; border-radius: 10px; background: var(--bg); color: var(--text); border: 1px solid var(--line-2); font: 600 16px var(--font); }
select.op-in { appearance: none; padding-right: 36px; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%);
  background-position: calc(100% - 20px) 20px, calc(100% - 14px) 20px; background-size: 6px 6px; background-repeat: no-repeat; }
.op-in:focus-visible, .op-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.op-main button { height: auto; min-height: 46px; padding: 6px 8px; white-space: normal; line-height: 1.15; }
.op-set-tek { grid-template-columns: minmax(0, 1fr); }
.op-grid-tek { grid-template-columns: minmax(0, 1fr); }
@media (min-width: 760px) { .op-grid-tek { grid-template-columns: minmax(0, 1fr); max-width: 520px; } }
.op-calc .op-fields { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 520px) { .op-calc .op-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } .op-calc .op-fields .op-f:first-child { grid-column: 1 / -1; } }
.op-res { background: var(--bg); }
.op-egri th:first-child { color: var(--faint); font-weight: 500; font-size: 12.5px; }
.op-egri tbody th { color: var(--muted); font-weight: 600; font-size: 14px; }
.op-table tr.on th, .op-table tr.on td { font-weight: 700; }
.op-ekle { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.op-ekle .op-btn { justify-self: stretch; justify-content: center; min-height: 46px; text-align: center; }
.op-btn:disabled { opacity: 0.45; cursor: default; }
@media (max-width: 520px) { .op-ekle { grid-template-columns: minmax(0, 1fr); } }
.op-ok { margin: 0; padding: 8px 10px; border: 1px solid var(--up-line); border-radius: 10px; background: var(--up-bg); color: var(--up); font-size: 13.5px; line-height: 1.45; }
.op-ok a { color: var(--accent); font-weight: 600; margin-left: 4px; }
.op-btn.primary { justify-self: stretch; justify-content: center; min-height: 46px; background: var(--accent); color: var(--on-accent); border-color: var(--accent); cursor: pointer; }
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
  const acik = new Set(); // "Diğer seçenekler" ve "Kaliteleri karşılaştır" açık olanlar
  let urunlerAcik = false;
  let ekler = []; // Üretim'e bu sayfadan eklenen, şirket kaydına henüz işlenmemiş binalar (Üretim açılınca işlenir): [{ id, L }]
  let sonEkle = null; // son ekleme: { mod, id, q, L }
  let sonEklePk = null; // Perakende sekmesinde son ekleme
  let son = null; // en son çizilen sayfa durumu (Ekle düğmesi buradan okur)

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
    const st = O.sayfaDurumu({
      ...yuklenen, company: Y.loadCompanyRecord(r).company, kurulum: kurulumOku(r), gamePhase, prefs, ekler, simdi: Date.now(),
      pk: { kurulum: perakendeOku(r), ...yuklenen.pk },
    });
    st.acik = acik;
    st.urunlerAcik = urunlerAcik;
    st.sonEkle = sonEkle;
    st.sonEklePk = sonEklePk;
    son = st;
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

  // Kutuya yazılırken ekran yeniden çizilmez (yazılan ve odak kaybolurdu); yazma bitince (change) çizilir
  const yaziyor = () => root.contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName);

  // Canlı fiyat: borsa ekranı gibi dakikada bir bakılır; belge 7 dakikadan eskiyse (bot 5 dakikada bir yazar) yenilenir
  async function tick() {
    if (destroyed || r !== DESTEKLENEN_REALM || document.visibilityState !== 'visible' || !yuklenen) return;
    const now = Date.now();
    if (now - (yuklenen.live?.t || 0) < 7 * MIN || now - lastAuto < 3 * MIN) {
      return;
    }
    lastAuto = now;
    try {
      const rr = r;
      const live = await canliYukle(rr);
      if (destroyed || rr !== r || !yuklenen) return;
      yuklenen = { ...yuklenen, live };
      if (!yaziyor()) render(); // canlı fiyatlar değişti: sonuçlar yenilenir
    } catch { /* bir sonraki dakikada yeniden denenir */ }
  }
  const clock = setInterval(tick, MIN);
  const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
  document.addEventListener('visibilitychange', onVisible);

  function onClick(e) {
    const ana = e.target.closest('[data-ana]');
    if (ana) { prefs.ana = ana.dataset.ana; savePrefs(prefs); render(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'faz') { prefs.faz = b.dataset.v === 'auto' ? 'auto' : Number(b.dataset.v); savePrefs(prefs); render(); }
    else if (act === 'urunler') { urunlerAcik = true; render(); }
    else if (act === 'yenile') yukle({ taze: true });
    else if (act === 'ekle') uretimeEkle(b.dataset.v);
    else if (act === 'pkEkle') perakendeyeEkle(b.dataset.v);
  }
  // Seçilen bina × ürün × kalite ve önerilen seviyeyi Üretim kurulumuna yazar (yeni bina ya da mevcut binanın seviyesine ekler)
  function uretimeEkle(mod) {
    const hs = son?.tum?.hesap;
    if (!hs || hs.L < 1 || destroyed) return;
    try {
      const anahtar = URETIM_KEY(r);
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(anahtar) || 'null'); } catch { raw = null; }
      const sonuc = binaEkle(raw, { harf: hs.harf, id: hs.id, q: hs.q, L: hs.L }, mod);
      if (!sonuc) return;
      localStorage.setItem(anahtar, JSON.stringify(sonuc.raw));
      ekler = [...ekler, { id: hs.id, L: hs.L }];
      sonEkle = { mod: sonuc.mod, id: hs.id, q: hs.q, L: hs.L };
    } catch {
      sonEkle = { hata: true };
    }
    render();
  }
  // Perakende: seçilen mağaza × ürün × kalite ve önerilen seviyeyi Perakende kaydına yazar
  function perakendeyeEkle(mod) {
    const hs = son?.pk?.hesap;
    if (!hs || hs.L < 1 || destroyed) return;
    try {
      const anahtar = PERAKENDE_KEY(r);
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(anahtar) || 'null'); } catch { raw = null; }
      const sonuc = pkBinaEkle(raw, { harf: hs.harf, id: hs.id, q: hs.q, L: hs.L }, mod);
      if (!sonuc) return;
      localStorage.setItem(anahtar, JSON.stringify(sonuc.raw));
      ekler = [...ekler, { id: hs.id, L: hs.L, pk: true, harf: hs.harf }];
      sonEklePk = { mod: sonuc.mod, id: hs.id, q: hs.q, L: hs.L };
    } catch {
      sonEklePk = { hata: true };
    }
    render();
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset?.pk) {
      const h = { ...prefs.pk };
      if (t.dataset.pk === 'harf') { h.harf = t.value; delete h.id; delete h.q; }
      else if (t.dataset.pk === 'id') { h.id = Number(t.value); delete h.q; }
      else if (t.dataset.pk === 'q') h.q = Number(t.value);
      if (son?.pk?.secim) { h.harf ??= son.pk.secim.harf; if (t.dataset.pk === 'q') h.id ??= son.pk.secim.id; }
      prefs.pk = okuHesap(h);
      sonEklePk = null;
      savePrefs(prefs);
      render();
    } else if (t.dataset?.hs) {
      const h = { ...prefs.hesap };
      if (t.dataset.hs === 'harf') { h.harf = t.value; delete h.id; delete h.q; }
      else if (t.dataset.hs === 'id') { h.id = Number(t.value); delete h.q; }
      else if (t.dataset.hs === 'q') h.q = Number(t.value);
      if (son?.tum?.secim) { h.harf ??= son.tum.secim.harf; if (t.dataset.hs === 'q') h.id ??= son.tum.secim.id; }
      prefs.hesap = okuHesap(h);
      sonEkle = null;
      savePrefs(prefs);
      render();
    }
  }
  function onToggle(e) {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.dataset.ac) return;
    if (d.open) acik.add(d.dataset.ac); else acik.delete(d.dataset.ac);
  }
  function onKey(e) {
    const tabs = e.target.closest?.('.op-tabs');
    if (!tabs || !root.contains(tabs) || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const i = ANA.findIndex(([k]) => k === prefs.ana);
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + ANA.length) % ANA.length;
    prefs.ana = ANA[j][0];
    savePrefs(prefs);
    render();
    root.querySelector(`[data-ana="${prefs.ana}"]`)?.focus();
  }
  // Yönetim ya da Üretim başka bir sekmede değişirse (aynı tarayıcı) ekran yeni kayıtla çizilir
  const onStorage = (e) => {
    if (e.key && e.key.startsWith('dentsimco.sirket.')) ekler = []; // Üretim şirket kaydını güncelledi: eklenenler artık kayıtta
    if (e.key && (e.key.startsWith('dentsimco.sirket.') || e.key.startsWith('dentsimco.uretim.') || e.key.startsWith('dentsimco.perakende.')) && !yaziyor()) render();
  };

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
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
      root.removeEventListener('change', onChange);
      root.removeEventListener('toggle', onToggle, true);
      root.removeEventListener('keydown', onKey);
      style.remove();
      root.replaceChildren();
    },
  };
}
