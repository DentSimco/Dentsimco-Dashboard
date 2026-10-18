// DentSimco — Restoran (arayüz)
// Hesapların hepsi hesap-restoran.js'te; burada ekranlar, borsa fiyatı yükleme ve tarayıcıda kayıt var.
// Sekmeler: Menü ve Gider (oyunun hesap makinesiyle aynı düzen), Döngüler (kayıt, fiyat önerisi, aynı döngü kıyası)
// ve Rating (gidiş, kapanış/yükseltme riski).
// Tarayıcı kaydı: dentsimco.restoran.r{realm}. Hiçbir veri sunucuya gitmez.

import { LOCALE } from './i18n.js';
import { readDocs, PATHS, dataField, fmtAgo } from './veri.js';
import { CSS, parseNum } from './uretim.js';
import * as R from './hesap-restoran.js';
import { urunAdi } from './urun-adlari.js';
import { esc } from './esc.js';

const STORE_KEY = (r) => `dentsimco.restoran.r${r}`;
const TAB_KEY = 'dentsimco.restoran.tab';
export const TABS = [['menu', 'Menü ve Gider'], ['donguler', 'Döngüler'], ['rating', 'Rating']];
const VARSAYILAN_MENU = { 117: 7, 119: 10, 142: 7, 143: 5, 124: 7, 125: 9 };
const KAYNAKLAR = [['borsa', 'Borsa'], ['kontrat', 'Kontrat'], ['manuel', 'Elle']];
const TIPLER = [['eko', 'Eko'], ['luks', 'Lüks']];
const FIYAT_TABLOSU = [60, 62, 64, 66, 68, 70, 75, 80, 90, 100];

// ---- biçimlendirme ----
const NF = [0, 1, 2].map((d) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }));
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const num = (x, d = 0) => (fin(x) ? NF[d].format(x) : '—');
const money = (x, d = 0) => {
  if (!fin(x)) return '—';
  const s = `$${NF[d].format(Math.abs(x))}`;
  return Math.round(x * 10 ** d) < 0 ? `−${s}` : s;
};
const birimFmt = (x) => (!fin(x) ? '—' : money(x, Math.abs(x) < 100 ? 2 : 0));
const pct = (x, d = 1) => (fin(x) ? `%${NF[d].format(x)}` : '—');
const isaretli = (x, d = 2) => (fin(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${NF[d].format(Math.abs(x))}` : '—');
const inputVal = (x) => (x == null || x === '' ? '' : String(x).replace('.', ','));
const cls = (x) => (x > 0.004 ? 'c-up' : x < -0.004 ? 'c-down' : '');
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ad = (id) => urunAdi(id, R.URUNLER[id]?.ad) || R.URUNLER[id]?.ad || `#${id}`;
const bugun = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const okuSayi = (v) => parseNum(v);
const kv = (label, value, c = '', strong = false) => `<div class="ur-kv${strong ? ' strong' : ''}"><span>${label}</span><span class="${c}">${value}</span></div>`;
const chip = (text, kind = '') => `<span class="ur-chip ${kind}">${esc(text)}</span>`;
const seg = (act, options, value, label, extra = '') => `<div class="ur-seg" role="group" aria-label="${esc(label)}">${options.map(([v, t]) =>
  `<button type="button" data-act="${act}" data-v="${esc(v)}"${extra} aria-pressed="${String(v) === String(value)}">${esc(t)}</button>`).join('')}</div>`;
function field(label, attr, value, { unit = '', mode = 'decimal', placeholder = '', type = 'text' } = {}) {
  return `<label class="ur-field"><span>${esc(label)}</span><div class="ur-input">${unit === '$' ? '<i>$</i>' : ''}<input type="${type}" inputmode="${mode}" autocomplete="off" ${attr} value="${esc(value)}" placeholder="${esc(placeholder)}">${unit && unit !== '$' ? `<i>${esc(unit)}</i>` : ''}</div></label>`;
}

const EXTRA_CSS = `
.rs-cat { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 12px 0 4px; border-bottom: 1px solid var(--line-2); }
.rs-cat b { color: var(--accent); font: 600 13px var(--font); letter-spacing: .06em; text-transform: uppercase; }
.rs-cat span { color: var(--muted); font-size: 12.5px; }
.rs-item { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.rs-top { display: grid; grid-template-columns: minmax(0, 1fr) repeat(3, minmax(58px, auto)); gap: 10px; align-items: center; }
.rs-pick { display: flex; align-items: center; gap: 10px; min-height: 44px; background: transparent; border: 0; color: var(--text); font: 600 16px var(--font); text-align: left; padding: 0; min-width: 0; }
.rs-pick .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rs-pick .rs-box { width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--line-3); flex: none; box-sizing: border-box; }
.rs-pick[aria-pressed="true"] .rs-box { background: var(--accent); border-color: var(--accent); box-shadow: inset 0 0 0 3px var(--surface); }
.rs-pick[aria-pressed="false"] { color: var(--muted); }
.rs-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rs-num b { display: block; font-size: 15px; } .rs-num small { color: var(--muted); font-size: 11.5px; }
.rs-opts { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; padding-left: 32px; }
.rs-mini { display: flex; flex-direction: column; gap: 4px; } .rs-mini > span { color: var(--muted); font-size: 12px; font-weight: 600; }
.ur .rs-mini select, .ur .rs-mini input[type="text"] { height: 40px; font-size: 15px; width: 96px; }
.rs-opts .ur-seg button { min-height: 40px; padding: 0 10px; font-size: 14px; }
.rs-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.rs-t { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
.rs-t th { color: var(--muted); font-weight: 600; font-size: 12.5px; text-align: right; padding: 6px; border-bottom: 1px solid var(--line-2); white-space: nowrap; }
.rs-t td { text-align: right; padding: 7px 6px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.rs-t th:first-child, .rs-t td:first-child { text-align: left; }
.rs-t tr.cur td { background: var(--sel); }
.rs-t td.low { color: var(--down); font-weight: 600; }
.rs-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 740px) { .rs-form { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.rs-rest { display: grid; grid-template-columns: minmax(0, 1.3fr) auto minmax(70px, 0.5fr) auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); }
.rs-rest .ur-seg button { min-height: 44px; padding: 0 10px; }
.rs-sum { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.rs-sum:last-child { border-bottom: 0; }
.rs-sum .ur-head h3 { margin: 0; font: 600 17px var(--font-c); }
.rs-bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--down-bg); }
.rs-bar > span { background: var(--up); }
@media (max-width: 520px) {
  .rs-top { grid-template-columns: minmax(0, 1fr) repeat(3, minmax(46px, auto)); gap: 6px; }
  .rs-pick { font-size: 15px; gap: 8px; }
  .rs-num b { font-size: 13.5px; } .rs-num small { font-size: 10.5px; }
  .rs-t { font-size: 13px; } .rs-t th, .rs-t td { padding: 6px 4px; }
  .rs-opts { padding-left: 0; }
  .rs-rest { grid-template-columns: minmax(0, 1fr) auto; }
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Kayıt
// ---------------------------------------------------------------------------------------------------------------
const tipOf = (t) => (t === 'luks' ? 'luks' : 'eko');
const posOr = (x, d = null) => (fin(Number(x)) && Number(x) > 0 ? Number(x) : d);
const numOr = (x, d = null) => (x === '' || x == null || !fin(Number(x)) ? d : Number(x));

export function defaultSetup() {
  return {
    v: 1, tip: 'eko', seviye: 20, fiyat: 62, doluluk: R.DOLULUK.ust, toplamSeviye: null, kontratPct: 8,
    maas: { saatlik: null, seviye: null, tip: 'eko' },
    menu: Object.fromEntries(Object.keys(R.URUNLER).map((id) => [id, { secili: id in VARSAYILAN_MENU, kalite: VARSAYILAN_MENU[id] ?? 0, kaynak: 'borsa', manuel: null }])),
    restoranlar: [], kayitlar: [],
    rating: { mevcut: 6, hedef: R.RATING.hedef, hedef2: 3, dongu: 12 },
  };
}
export function sanitizeSetup(raw) {
  const s = defaultSetup();
  if (!raw || typeof raw !== 'object') return s;
  s.tip = tipOf(raw.tip);
  s.seviye = Math.max(1, Math.floor(posOr(raw.seviye, s.seviye)));
  s.fiyat = Math.min(R.FIYAT_MAX, Math.max(R.FIYAT_MIN, posOr(raw.fiyat, s.fiyat)));
  s.doluluk = Math.min(100, Math.max(1, posOr(raw.doluluk, s.doluluk)));
  s.toplamSeviye = posOr(raw.toplamSeviye) == null ? null : Math.floor(posOr(raw.toplamSeviye));
  s.kontratPct = Math.min(50, Math.max(0, numOr(raw.kontratPct, s.kontratPct)));
  const m = raw.maas || {};
  s.maas = { saatlik: posOr(m.saatlik), seviye: posOr(m.seviye) == null ? null : Math.floor(posOr(m.seviye)), tip: tipOf(m.tip) };
  for (const id of Object.keys(R.URUNLER)) {
    const x = raw.menu?.[id];
    if (!x || typeof x !== 'object') continue;
    s.menu[id] = {
      secili: !!x.secili,
      kalite: Math.min(12, Math.max(0, Math.floor(numOr(x.kalite, 0)))),
      kaynak: KAYNAKLAR.some(([k]) => k === x.kaynak) ? x.kaynak : 'borsa',
      manuel: posOr(x.manuel),
    };
  }
  s.restoranlar = (Array.isArray(raw.restoranlar) ? raw.restoranlar : []).filter((x) => x && typeof x === 'object')
    .map((x) => ({ id: String(x.id || uid('r')), ad: String(x.ad || '').slice(0, 40), tip: tipOf(x.tip), seviye: posOr(x.seviye) == null ? null : Math.floor(posOr(x.seviye)) }));
  const ids = new Set(s.restoranlar.map((x) => x.id));
  s.kayitlar = (Array.isArray(raw.kayitlar) ? raw.kayitlar : []).filter((x) => x && typeof x === 'object' && ids.has(String(x.restoran)))
    .map((x) => ({
      id: String(x.id || uid('k')), restoran: String(x.restoran),
      tarih: /^\d{4}-\d{2}-\d{2}$/.test(x.tarih || '') ? x.tarih : '', saat: /^\d{1,2}[:.]\d{2}$/.test(x.saat || '') ? String(x.saat).replace('.', ':') : '',
      fiyat: posOr(x.fiyat), doluluk: numOr(x.doluluk), ratingOnce: numOr(x.ratingOnce), ratingSonra: numOr(x.ratingSonra),
      gelir: numOr(x.gelir), kar: numOr(x.kar),
    })).filter((x) => x.fiyat != null && x.doluluk != null);
  const rt = raw.rating || {};
  s.rating = { mevcut: numOr(rt.mevcut, 6), hedef: numOr(rt.hedef, R.RATING.hedef), hedef2: numOr(rt.hedef2, 3), dongu: Math.min(40, Math.max(2, Math.floor(numOr(rt.dongu, 12)))) };
  return s;
}
function loadSetup(r) {
  try { return sanitizeSetup(JSON.parse(localStorage.getItem(STORE_KEY(r)) || 'null')); } catch { return defaultSetup(); }
}

function parseLive(doc) {
  const out = {};
  for (const [id, e] of Object.entries(doc?.items || {})) {
    const byQ = Array.isArray(e) ? e[1] : e;
    if (!byQ || typeof byQ !== 'object') continue;
    const m = {};
    for (const [q, v] of Object.entries(byQ)) { const p = Number(Array.isArray(v) ? v[0] : v?.p); if (p > 0) m[q] = p; }
    out[id] = m;
  }
  return out;
}
async function loadLive(r) {
  const docs = await readDocs([PATHS.live(r)]);
  const live = dataField(docs.get(PATHS.live(r)));
  if (!live) throw new Error('Borsa verisi okunamadı.');
  return { market: parseLive(live), t: Number(live.t) || null };
}


// ---------------------------------------------------------------------------------------------------------------
// Ekran
// ---------------------------------------------------------------------------------------------------------------
export function mountRestoran(root, { realm = 0 } = {}) {
  let r = realm;
  let setup = loadSetup(r);
  let data = null;
  let loadError = null;
  let loadToken = 0;
  let destroyed = false;
  let toastTimer = null;
  let tab = 'menu';
  try { tab = localStorage.getItem(TAB_KEY) || 'menu'; } catch { /* gizli sekme */ }
  const fromHash = location.hash.split('/')[1];
  if (TABS.some(([k]) => k === fromHash)) tab = fromHash;
  if (!TABS.some(([k]) => k === tab)) tab = 'menu';
  const bosForm = () => ({ restoran: setup.restoranlar[0]?.id || '', tarih: bugun(), saat: '', fiyat: '', doluluk: '', ratingOnce: '', ratingSonra: '', gelir: '', kar: '' });
  let form = bosForm();
  let yap = { metin: '', kayitlar: [], tarih: '', saat: '', restoran: '' };

  const style = document.createElement('style');
  style.dataset.module = 'restoran';
  style.textContent = CSS + EXTRA_CSS;
  document.head.append(style);
  root.innerHTML = '<div class="ur"></div><div data-toast></div>';
  const view = root.querySelector('.ur');
  const toastHost = root.querySelector('[data-toast]');

  function save() { try { localStorage.setItem(STORE_KEY(r), JSON.stringify(setup)); } catch { /* gizli sekme */ } }
  function toast(text) {
    toastHost.innerHTML = `<div class="ur-toast" role="status">${esc(text)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastHost.innerHTML = ''; }, 3600);
  }

  async function load() {
    const my = ++loadToken;
    loadError = null;
    try {
      const d = await loadLive(r);
      if (destroyed || my !== loadToken) return;
      data = d;
    } catch (e) {
      if (destroyed || my !== loadToken) return;
      loadError = e?.message || String(e);
    }
    render();
  }

  // ---- hesap ----
  const seciliIds = () => Object.keys(R.URUNLER).map(Number).filter((id) => setup.menu[id]?.secili);
  const borsaFiyati = (id) => data?.market?.[id]?.[setup.menu[id]?.kalite] ?? null;
  function birim(id) {
    const m = setup.menu[id];
    if (m.kaynak === 'manuel') return m.manuel;
    const b = borsaFiyati(id);
    if (b == null) return null;
    return m.kaynak === 'kontrat' ? b * (1 - setup.kontratPct / 100) : b;
  }
  const saatlik = () => R.seviyeBasiSaatlikMaas(setup.maas.saatlik, setup.maas.seviye, setup.maas.tip);
  const gider = (tip = setup.tip, seviye = setup.seviye) => R.donguGideri({
    menu: seciliIds().map((id) => ({ id, birim: birim(id) })), seviye, tip, saatlikMaas: saatlik(), fiyat: setup.fiyat,
  });
  const restoran = (id) => setup.restoranlar.find((x) => x.id === id);
  const kayitlariOf = (id) => setup.kayitlar.filter((k) => k.restoran === id);

  // ---- çizim ----
  function render() {
    if (destroyed) return;
    const tabs = `<nav class="ur-tabs" aria-label="Restoran bölümleri">${TABS.map(([k, t]) =>
      `<a href="#restoran/${k}" ${k === tab ? 'aria-current="page"' : ''}>${esc(t)}</a>`).join('')}</nav>`;
    const head = `<div class="ur-head"><h1>Restoran</h1>${chip('Test sürümü', 'muted')}</div>`;
    const body = tab === 'menu' ? menuTab() : tab === 'donguler' ? dongulerTab() : ratingTab();
    view.innerHTML = tabs + head + body;
  }

  // ---- Menü ve Gider ----
  function menuTab() {
    const g = gider();
    const ids = seciliIds();
    const say = R.kategoriSayilari(ids);
    const canli = data?.t ? `Borsa: ${fmtAgo(data.t)}` : loadError ? 'Borsa verisi okunamadı' : 'Borsa yükleniyor…';
    const ws = saatlik();

    const restoranKart = `<section class="ur-card"><h2>Restoran</h2>
      ${seg('tip', TIPLER, setup.tip, 'Restoran tipi')}
      <div class="ur-grid2">
        ${field('Seviye', 'data-f="seviye"', setup.seviye, { mode: 'numeric' })}
        ${field('Menü fiyatı', 'data-f="fiyat"', inputVal(setup.fiyat), { unit: '$' })}
        ${field('Beklenen doluluk', 'data-f="doluluk"', inputVal(setup.doluluk), { unit: '%' })}
        ${field('Bu tipteki toplam seviye (isteğe bağlı)', 'data-f="toplamSeviye"', setup.toplamSeviye ?? '', { mode: 'numeric' })}
      </div></section>`;

    const maasKart = `<section class="ur-card"><h2>Maaş</h2>
      <div class="ur-grid2">
        ${field('Bina ekranındaki saatlik maaş', 'data-f="maasSaatlik"', setup.maas.saatlik ?? '', { mode: 'numeric', unit: '$', placeholder: 'ör. 16.305' })}
        ${field('O binanın seviyesi', 'data-f="maasSeviye"', setup.maas.seviye ?? '', { mode: 'numeric', placeholder: 'ör. 17' })}
      </div>
      ${seg('maasTip', TIPLER, setup.maas.tip, 'Maaşı girilen binanın tipi')}
      ${ws == null ? ''
        : `${kv('Eko restoran, seviye başı saatlik', money(ws))}${kv(`Bu restoranın döngü maaşı (${setup.tip === 'luks' ? 'lüks' : 'eko'}, seviye ${setup.seviye})`, money(g.maas))}`}</section>`;

    const kalemSatir = (id) => {
      const m = setup.menu[id];
      const k = g.kalemler.find((x) => x.id === id);
      const b = borsaFiyati(id);
      const kaynak = KAYNAKLAR.find(([v]) => v === m.kaynak)?.[1];
      const alt = m.kaynak === 'manuel' ? 'elle' : b == null ? `Q${m.kalite} ilan yok` : m.kaynak === 'kontrat' ? `borsa ${birimFmt(b)} −%${num(setup.kontratPct, 0)}` : `borsa Q${m.kalite}`;
      const opts = m.secili ? `<div class="rs-opts">
          <label class="rs-mini"><span>Kalite</span><select data-kalite="${id}">${Array.from({ length: 13 }, (_, q) => `<option value="${q}" ${q === m.kalite ? 'selected' : ''}>Q${q}</option>`).join('')}</select></label>
          <div class="rs-mini"><span>Maliyet</span>${seg('kaynak', KAYNAKLAR, m.kaynak, `${ad(id)} maliyet kaynağı`, ` data-id="${id}"`)}</div>
          ${m.kaynak === 'manuel' ? `<label class="rs-mini"><span>Birim $</span><input type="text" inputmode="decimal" autocomplete="off" data-manuel="${id}" value="${esc(inputVal(m.manuel == null ? null : Math.round(m.manuel * 1e4) / 1e4))}" placeholder="${esc(b != null ? inputVal(b) : '')}"></label>
          <label class="rs-mini"><span>ya da Sourcing Cost $</span><input type="text" inputmode="decimal" autocomplete="off" data-satir="${id}" value="" placeholder="${esc(k?.tutar != null ? num(k.tutar) : 'oyundaki satır')}"></label>` : ''}
        </div>` : '';
      return `<div class="rs-item">
        <div class="rs-top">
          <button type="button" class="rs-pick" data-act="urun" data-id="${id}" aria-pressed="${m.secili}"><span class="rs-box"></span><span class="nm">${esc(ad(id))}</span></button>
          <div class="rs-num"><b>${m.secili ? num(k?.adet) : '—'}</b><small>adet</small></div>
          <div class="rs-num birim"><b>${m.secili ? birimFmt(k?.birim) : birimFmt(b)}</b><small>${m.secili ? esc(alt) : `borsa Q${m.kalite}`}</small></div>
          <div class="rs-num"><b>${m.secili ? money(k?.tutar) : '—'}</b><small>${m.secili ? esc(kaynak) : ''}</small></div>
        </div>${opts}</div>`;
    };
    const menuKart = `<section class="ur-card"><div class="ur-head"><h2>Menü</h2>${chip(canli, 'muted')}</div>
      <div class="ur-grid2">${field('Kontrat indirimi', 'data-f="kontratPct"', inputVal(setup.kontratPct), { unit: '%' })}</div>
      ${R.KATEGORILER.map((kat) => {
        const n = say[kat.key];
        const c = R.kategoriCarpani(n);
        const durum = !n ? '<span class="c-down">en az bir ürün seçin</span>' : `${n} ürün`;
        return `<div class="rs-cat"><b>${esc(kat.ad)}</b><span>${durum}</span></div>${kat.urunler.map(kalemSatir).join('')}`;
      }).join('')}</section>`;

    const uyarilar = [
      g.eksikKategori.length ? `<div class="ur-msg err">Oyun her kategoriden en az bir ürün ister: ${esc(g.eksikKategori.join(', '))} eksik.</div>` : '',
      g.eksikMaas ? '<div class="ur-msg">Maaş girilmedi: gider yalnız malzeme, kâr olduğundan yüksek görünür. Maaş kartını doldurun.</div>' : '',
      g.eksikFiyat ? `<div class="ur-msg">Fiyatı olmayan ürünler toplama girmedi: ${esc(g.kalemler.filter((k) => k.birim == null).map((k) => ad(k.id)).join(', '))}. Kaliteyi değiştirin ya da maliyeti elle girin.</div>` : '',
    ].join('');
    const gun = setup.toplamSeviye && g.seviyeBasi ? setup.toplamSeviye : null;
    const kar = R.donguKari(g, setup.fiyat, setup.doluluk);
    const sonucKart = `<section class="ur-card"><div class="ur-head"><h2>Döngü gideri</h2>${chip(`${setup.tip === 'luks' ? 'Lüks' : 'Eko'} · seviye ${setup.seviye} · ${num(g.koltuk)} koltuk`, 'muted')}</div>
      ${uyarilar}
      <div class="ur-tri head"><span>Ürün</span><span>Adet</span><span>Sourcing</span></div>
      ${R.KATEGORILER.map((kat) => g.kalemler.filter((k) => R.URUNLER[k.id].kat === kat.key).map((k) => `<div class="ur-tri"><span>${esc(ad(k.id))}</span><span>${num(k.adet)}</span><span>${money(k.tutar)}</span></div>`).join('')).join('')}
      <div class="ur-tri line strong"><span>Malzeme</span><span></span><span>${money(g.malzeme)}</span></div>
      <div class="ur-tri"><span>Maaş</span><span></span><span>${g.maas == null ? '—' : money(g.maas)}</span></div>
      <div class="ur-tri line strong"><span>Toplam</span><span></span><span>${money(g.toplam)}</span></div>
      <div class="ur-hr"></div>
      ${kv(`%100 dolulukta kâr ($${num(setup.fiyat)})`, money(g.kar100), cls(g.kar100))}
      ${kv('Başabaş doluluk', g.basabas == null ? '—' : pct(g.basabas * 100, 1), g.basabas > 1 ? 'c-down' : '')}
      ${kv('%0 dolulukta', money(-g.toplam), 'c-down')}
      <div class="rs-bar" aria-hidden="true"><span style="width:${fin(g.basabas) ? Math.max(0, Math.min(100, 100 - g.basabas * 100)).toFixed(1) : 0}%;margin-left:${fin(g.basabas) ? Math.max(0, Math.min(100, g.basabas * 100)).toFixed(1) : 100}%"></span></div>
      <div class="ur-hr"></div>
      ${kv(`Beklenen dolulukla (%${num(setup.doluluk, 1)}) döngü kârı`, money(kar), cls(kar), true)}
      ${kv('Günlük (2 döngü)', money(kar * 2), cls(kar))}
      ${g.seviyeBasi ? kv('Seviye başı döngü: gider / kâr', `${money(g.seviyeBasi.toplam)} / <span class="${cls(kar)}">${money(kar / g.seviye)}</span>`) : ''}
      ${gun ? kv(`Şirket toplamı, günlük (${num(gun)} seviye)`, money((kar / g.seviye) * gun * 2), cls(kar), true) : ''}
    </section>`;

    const fiyatlar = [...new Set([...FIYAT_TABLOSU, Math.round(setup.fiyat)])].sort((a, b) => a - b);
    const fiyatKart = `<section class="ur-card"><h2>Fiyat senaryoları</h2>
      <div class="rs-scroll"><table class="rs-t"><thead><tr><th>Fiyat</th><th>Başabaş</th><th>Kâr / döngü (%${num(setup.doluluk, 1)})</th><th>Seviye başı</th><th>Kâr / döngü (%90)</th></tr></thead><tbody>
      ${fiyatlar.map((p) => {
        const gg = { ...g, toplam: g.toplam };
        const k1 = R.donguKari(gg, p, setup.doluluk);
        const k2 = R.donguKari(gg, p, 90);
        return `<tr class="${p === Math.round(setup.fiyat) ? 'cur' : ''}"><td>$${num(p)}</td><td>${g.koltuk ? pct((g.toplam / (p * g.koltuk)) * 100, 1) : '—'}</td><td class="${cls(k1)}">${money(k1)}</td><td>${g.seviye ? money(k1 / g.seviye) : '—'}</td><td class="${cls(k2)}">${money(k2)}</td></tr>`;
      }).join('')}</tbody></table></div></section>`;

    // Eko ↔ lüks: aynı menü, aynı maaş, aynı seviye
    const ge = gider('eko', setup.seviye);
    const gl = gider('luks', setup.seviye);
    const ke = R.donguKari(ge, setup.fiyat, setup.doluluk);
    const kl = R.donguKari(gl, setup.fiyat, setup.doluluk);
    const esit = R.gerekliFiyat(gl, setup.doluluk, ke);
    const tipKart = `<section class="ur-card"><h2>Eko mu, lüks mü?</h2>
      <div class="ur-tri head"><span></span><span>Eko</span><span>Lüks</span></div>
      <div class="ur-tri"><span>Koltuk</span><span>${num(ge.koltuk)}</span><span>${num(gl.koltuk)}</span></div>
      <div class="ur-tri"><span>Döngü gideri</span><span>${money(ge.toplam)}</span><span>${money(gl.toplam)}</span></div>
      <div class="ur-tri strong"><span>Döngü kârı</span><span class="${cls(ke)}">${money(ke)}</span><span class="${cls(kl)}">${money(kl)}</span></div>
      ${kv('Lüksün ekoyla aynı kârı vermesi için fiyat', esit == null ? '—' : money(esit, 2), '', true)}</section>`;


    return restoranKart + maasKart + menuKart + sonucKart + fiyatKart + tipKart;
  }

  // ---- Döngüler ----
  function dongulerTab() {
    const rs = setup.restoranlar;
    const restKart = `<section class="ur-card"><div class="ur-head"><h2>Restoranlar</h2><button type="button" class="ur-btn tint" data-act="rEkle">+ Restoran</button></div>
      ${rs.length ? rs.map((x) => `<div class="rs-rest">
        <input type="text" autocomplete="off" data-rf="ad" data-id="${esc(x.id)}" value="${esc(x.ad)}" placeholder="Ad (ör. 19B)" aria-label="Restoran adı">
        ${seg('rTip', TIPLER, x.tip, 'Tip', ` data-id="${esc(x.id)}"`)}
        <input type="text" inputmode="numeric" autocomplete="off" data-rf="seviye" data-id="${esc(x.id)}" value="${esc(x.seviye ?? '')}" placeholder="Seviye" aria-label="Seviye">
        <button type="button" class="ur-btn danger" data-act="rSil" data-id="${esc(x.id)}" aria-label="Sil">Sil</button></div>`).join('')
        : ''}
    </section>`;
    if (!rs.length) return restKart;

    const opt = (sel) => rs.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.ad || 'adsız')} · ${x.tip === 'luks' ? 'lüks' : 'eko'} ${x.seviye ?? '?'}</option>`).join('');
    const formKart = `<section class="ur-card"><h2>Döngü ekle</h2>
      <label class="ur-field"><span>Restoran</span><select data-yf="restoran">${opt(form.restoran)}</select></label>
      <div class="rs-form">
        ${field('Tarih', 'data-yf="tarih"', form.tarih, { type: 'date', mode: 'text' })}
        ${field('Bitiş saati', 'data-yf="saat"', form.saat, { mode: 'text', placeholder: '07:27' })}
        ${field('Menü fiyatı', 'data-yf="fiyat"', form.fiyat, { unit: '$' })}
        ${field('Doluluk', 'data-yf="doluluk"', form.doluluk, { unit: '%' })}
        ${field('Rating (önce)', 'data-yf="ratingOnce"', form.ratingOnce, { placeholder: '6,46' })}
        ${field('Rating (sonra)', 'data-yf="ratingSonra"', form.ratingSonra, { placeholder: '6,29' })}
        ${field('Gelir', 'data-yf="gelir"', form.gelir, { unit: '$', placeholder: '796.455' })}
        ${field('Kâr (zarar eksi)', 'data-yf="kar"', form.kar, { unit: '$', placeholder: '−123.539' })}
      </div>
      <button type="button" class="ur-btn primary" data-act="kEkle">Kaydet</button>
      <details class="rs-paste" ${yap.metin ? 'open' : ''}><summary class="ur-btn" style="justify-content:flex-start">Oyundan yapıştır (çoklu)</summary>
        <textarea data-yap aria-label="Yapıştırılan metin" placeholder="6.87 (-0.36) 6.51 … 100% Occupancy $64 Menu price Revenue: $1,216,000 Profit: $196,938">${esc(yap.metin)}</textarea>
        <button type="button" class="ur-btn" data-act="coz">Oku</button>
        ${yapOnizleme(opt)}
      </details>
    </section>`;

    const ozetKart = `<section class="ur-card"><h2>Durum ve fiyat önerisi</h2>
      ${rs.map((x) => ozetBlok(x)).join('')}</section>`;

    const tum = setup.kayitlar;
    const ak = R.ayniDonguKiyasi(tum);
    const ayniKart = `<section class="ur-card"><h2>Aynı döngü kıyası</h2>
      ${ak.satirlar.length ? `<div class="rs-scroll"><table class="rs-t"><thead><tr><th>Fiyat</th><th>Kayıt</th><th>Ort. doluluk</th><th>Döngü ortalamasına göre</th></tr></thead><tbody>
        ${ak.satirlar.map((s) => `<tr><td>$${num(s.fiyat)}</td><td>${num(s.n)}</td><td>${pct(s.doluluk)}</td><td class="${cls(s.sapma)}">${isaretli(s.sapma, 1)} puan</td></tr>`).join('')}
        </tbody></table></div>`
        : '<div class="ur-msg">Henüz uygun döngü yok. Restoranlarınızı ikiye bölüp aynı döngüde farklı fiyat deneyin.</div>'}
    </section>`;

    const d = R.dilimKiyasi(tum);
    const dilimKart = `<section class="ur-card"><h2>Sabah ve akşam biten döngüler</h2>
      <div class="ur-tri head"><span></span><span>Sabah biten</span><span>Akşam biten</span></div>
      <div class="ur-tri"><span>Kayıt</span><span>${num(d.sabah.n)}</span><span>${num(d.aksam.n)}</span></div>
      <div class="ur-tri"><span>Ortalama doluluk</span><span>${pct(d.sabah.ort)}</span><span>${pct(d.aksam.ort)}</span></div>
      <div class="ur-tri"><span>%100 olan</span><span>${num(d.sabah.tam)}</span><span>${num(d.aksam.tam)}</span></div></section>`;

    const sirali = [...tum].sort((a, b) => `${b.tarih} ${b.saat.padStart(5, '0')}`.localeCompare(`${a.tarih} ${a.saat.padStart(5, '0')}`));
    const kayitKart = `<section class="ur-card"><h2>Kayıtlar (${num(tum.length)})</h2>
      ${sirali.length ? `<div class="rs-scroll"><table class="rs-t"><thead><tr><th>Restoran</th><th>Bitiş</th><th>Fiyat</th><th>Doluluk</th><th>Rating</th><th>Δ</th><th>Gider/seviye</th><th>Kâr</th><th></th></tr></thead><tbody>
        ${sirali.map((k) => {
          const rr = restoran(k.restoran) || {};
          const a = R.kayitAnalizi(k, rr);
          const uyari = a.seviyeUyusmaz ? ` <span class="c-down" title="Gelire göre seviye ${R.seviyeTahmini({ ...k, tip: rr.tip })}">⚠</span>` : '';
          return `<tr><td>${esc(rr.ad || '?')}${uyari}</td><td>${esc(k.tarih.slice(5))} ${esc(k.saat)}</td><td>$${num(k.fiyat)}</td><td class="${k.doluluk < 90 ? 'low' : ''}">${pct(k.doluluk, 2)}</td>
            <td>${num(k.ratingSonra ?? k.ratingOnce, 2)}</td><td class="${cls(a.delta)}">${isaretli(a.delta)}</td><td>${money(a.giderSeviye)}</td><td class="${cls(k.kar)}">${money(k.kar)}</td>
            <td><button type="button" class="ur-btn danger" style="min-height:32px;min-width:32px;padding:0 8px" data-act="kSil" data-id="${esc(k.id)}" aria-label="Kaydı sil">×</button></td></tr>`;
        }).join('')}</tbody></table></div>
        <p class="ur-note ok">⚠ seviye gelirle tutmuyor</p>` : '<p class="ur-sub ok">Henüz kayıt yok.</p>'}
    </section>`;

    return restKart + formKart + ozetKart + ayniKart + dilimKart + kayitKart;
  }

  function yapOnizleme(opt) {
    if (!yap.kayitlar.length) return yap.metin && yap.okundu ? '<div class="ur-msg">Metinde döngü satırı bulunamadı.</div>' : '';
    const zaman = yapZamanlari();
    return `<div class="ur-box" style="margin-top:8px;gap:8px">
      <b>${num(yap.kayitlar.length)} döngü okundu</b>
      <label class="ur-field"><span>Restoran</span><select data-yapf="restoran">${opt(yap.restoran)}</select></label>
      <div class="ur-grid2">${field('En yeni döngünün tarihi', 'data-yapf="tarih"', yap.tarih, { type: 'date', mode: 'text' })}${field('En yeni döngünün bitiş saati', 'data-yapf="saat"', yap.saat, { mode: 'text', placeholder: '19:27' })}</div>
      <div class="rs-scroll"><table class="rs-t"><thead><tr><th>Bitiş</th><th>Fiyat</th><th>Doluluk</th><th>Rating</th><th>Gelir</th><th>Kâr</th></tr></thead><tbody>
      ${yap.kayitlar.map((k, i) => `<tr><td>${esc(zaman[i] ? `${zaman[i].tarih.slice(5)} ${zaman[i].saat}` : '?')}</td><td>${k.fiyat == null ? '—' : `$${num(k.fiyat)}`}</td><td>${pct(k.doluluk, 2)}</td><td>${num(k.ratingOnce, 2)} → ${num(k.ratingSonra, 2)}</td><td>${money(k.gelir)}</td><td class="${cls(k.kar)}">${money(k.kar)}</td></tr>`).join('')}
      </tbody></table></div>
      <button type="button" class="ur-btn primary" data-act="yapEkle">${num(yap.kayitlar.length)} döngüyü ekle</button></div>`;
  }
  function yapZamanlari() {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(yap.saat || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(yap.tarih || '') || !m) return yap.kayitlar.map(() => null);
    const [y, mo, d] = yap.tarih.split('-').map(Number);
    const t0 = new Date(y, mo - 1, d, Number(m[1]), Number(m[2])).getTime();
    return yap.kayitlar.map((_, i) => {
      const t = new Date(t0 - i * 12 * 3600_000);
      return { tarih: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`, saat: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` };
    });
  }

  function ozetBlok(x) {
    const ks = kayitlariOf(x.id);
    const o = R.restoranOzeti(ks);
    const yon = { zam: ['up', `Zam: +$${o.oneri.adim}`], sabit: ['', 'Fiyatı koru'], indir: ['down', `İndir: −$${o.oneri.adim}`], bekle: ['muted', 'Bekle'], rating: ['down', 'Rating kur'] }[o.oneri.yon];
    const guvenli = o.rating != null ? (R.yukseltmeGuvenli(o.rating)
      ? chip(`Yükseltme güvenli (sonra ${num(R.kapanisSonrasi(o.rating), 2)})`, 'up') : chip(`Yükseltme riskli: sonra ${num(R.kapanisSonrasi(o.rating), 2)} < 4,5`, 'down')) : '';
    return `<div class="rs-sum">
      <div class="ur-head"><h3>${esc(x.ad || 'adsız')} <span class="c-muted" style="font-size:14px">${x.tip === 'luks' ? 'lüks' : 'eko'} · seviye ${x.seviye ?? '?'}</span></h3>${o.n ? chip(yon[1], yon[0]) : ''}</div>
      ${o.n ? `<div class="ur-grid4">
        <div class="ur-stat"><span>Son ${o.n} döngü</span><span>${pct(o.ortDoluluk)}</span></div>
        <div class="ur-stat"><span>%100 olan</span><span>${num(o.tamDolu)} / ${num(o.n)}</span></div>
        <div class="ur-stat"><span>Rating</span><span>${num(o.rating, 2)}</span></div>
        <div class="ur-stat"><span>Döngü başı Δ</span><span class="${cls(o.ortDelta)}">${isaretli(o.ortDelta)}</span></div></div>
        <div class="ur-chips">${o.hedef ? chip(`Hedef rating ≈ ${num(o.hedef.hedef, 2)} ± ${num(o.hedef.belirsizlik, 1)} (${o.hedef.n} döngü)`, 'muted') : ''}${guvenli}</div>`
        : '<p class="ur-note ok">Kayıt yok.</p>'}
    </div>`;
  }

  // ---- Rating ----
  function ratingTab() {
    const rt = setup.rating;
    const g = gider();
    const L = Math.max(1, g.seviye);
    const koltukSeviye = R.KOLTUK[g.tip];
    const giderSeviye = g.toplam / L;
    const n = rt.dongu;
    const yollar = [
      ['Aynen', R.ratingYolu(rt.mevcut, rt.hedef, n)],
      ['Kapat/yükselt', R.ratingYolu(rt.mevcut, rt.hedef, n, { kapanis: true })],
      ['2. hedef', R.ratingYolu(rt.mevcut, rt.hedef2, n)],
      ['Yeni (0)', R.ratingYolu(0, rt.hedef, n)],
    ];
    const karToplam = (yol) => yol.slice(0, n).reduce((s, rr) => s + setup.fiyat * koltukSeviye * (R.beklenenDoluluk(rr) / 100) - giderSeviye, 0);
    const opt = setup.restoranlar.filter((x) => kayitlariOf(x.id).length).map((x) => `<option value="${esc(x.id)}">${esc(x.ad || 'adsız')}</option>`).join('');
    const esikDongu = (r0, T, kap = false) => R.esigeDongu(kap ? R.kapanisSonrasi(r0) : r0, T);
    const ozet = [
      ['Olduğu gibi', rt.mevcut, rt.hedef, false], ['Kapat / yükselt', rt.mevcut, rt.hedef, true], ['Farklı menü', rt.mevcut, rt.hedef2, false], ['Yeni restoran', 0, rt.hedef, false],
    ].map(([t, r0, T, kap]) => {
      const bas = kap ? R.kapanisSonrasi(r0) : r0;
      const d = esikDongu(r0, T, kap);
      const yon = bas >= R.RATING.esik ? (d == null ? 'eşiğin üstünde kalır' : `${d}. döngüde 4,5 altına iner`) : (d == null ? 'eşiğe hiç çıkmaz' : `${d}. döngüde 4,5'i geçer`);
      return chip(`${t}: ${yon}`, bas >= R.RATING.esik ? (d == null ? 'up' : 'down') : (d == null ? 'down' : ''));
    }).join('');
    return `<section class="ur-card"><h2>Rating gidişi</h2>
      ${opt ? `<label class="ur-field"><span>Kayıtlarımdan al</span><select data-rtrest><option value="">Seçin…</option>${opt}</select></label>` : ''}
      <div class="rs-form">
        ${field('Mevcut rating', 'data-rt="mevcut"', inputVal(rt.mevcut))}
        ${field('Hedef rating (bu menüyle)', 'data-rt="hedef"', inputVal(rt.hedef), {})}
        ${field('2. hedef (farklı menü)', 'data-rt="hedef2"', inputVal(rt.hedef2), {})}
        ${field('Döngü sayısı', 'data-rt="dongu"', rt.dongu, { mode: 'numeric' })}
      </div>
      <div class="ur-chips">${ozet}</div></section>
    <section class="ur-card"><h2>Döngü döngü</h2>
      <div class="rs-scroll"><table class="rs-t"><thead><tr><th>#</th>${yollar.map(([t]) => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>
      ${Array.from({ length: n + 1 }, (_, i) => `<tr><td>${i}</td>${yollar.map(([, y]) => `<td class="${y[i] < R.RATING.esik ? 'low' : ''}">${num(y[i], 2)}</td>`).join('')}</tr>`).join('')}
      <tr class="cur"><td>Kâr/sv.</td>${yollar.map(([, y]) => { const k = karToplam(y); return `<td class="${cls(k)}">${money(k)}</td>`; }).join('')}</tr>
      </tbody></table></div></section>
    <section class="ur-card"><h2>Yükseltme kontrolü</h2>
      ${kv('Şimdiki rating', num(rt.mevcut, 2))}
      ${kv('Kapanış / yükseltme sonrası', num(R.kapanisSonrasi(rt.mevcut), 2), R.yukseltmeGuvenli(rt.mevcut) ? 'c-up' : 'c-down', true)}</section>`;
  }

  // ---- olaylar ----
  function setTab(next) {
    tab = next;
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* gizli sekme */ }
  }
  function onClick(ev) {
    const t = ev.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    const act = t.dataset.act;
    const id = t.dataset.id;
    if (act === 'tip') { setup.tip = tipOf(t.dataset.v); }
    else if (act === 'maasTip') { setup.maas.tip = tipOf(t.dataset.v); }
    else if (act === 'urun') { setup.menu[id].secili = !setup.menu[id].secili; }
    else if (act === 'kaynak') { setup.menu[id].kaynak = t.dataset.v; if (t.dataset.v === 'manuel' && setup.menu[id].manuel == null) setup.menu[id].manuel = borsaFiyati(Number(id)); }
    else if (act === 'rEkle') { setup.restoranlar.push({ id: uid('r'), ad: '', tip: 'eko', seviye: null }); }
    else if (act === 'rSil') {
      const x = restoran(id);
      const n = kayitlariOf(id).length;
      if (n && !confirm(`${x?.ad || 'Restoran'} ve ${n} döngü kaydı silinsin mi?`)) return;
      setup.restoranlar = setup.restoranlar.filter((y) => y.id !== id);
      setup.kayitlar = setup.kayitlar.filter((k) => k.restoran !== id);
      if (form.restoran === id) form.restoran = setup.restoranlar[0]?.id || '';
    } else if (act === 'rTip') { const x = restoran(id); if (x) x.tip = tipOf(t.dataset.v); }
    else if (act === 'kEkle') { if (!kayitEkle()) return; }
    else if (act === 'kSil') { setup.kayitlar = setup.kayitlar.filter((k) => k.id !== id); }
    else if (act === 'coz') {
      yap.kayitlar = R.satirlariCoz(yap.metin);
      yap.okundu = true;
      yap.restoran = yap.restoran || form.restoran || setup.restoranlar[0]?.id || '';
      const ilk = yap.kayitlar[0];
      if (ilk?.onceSaat != null) {
        const t0 = new Date(Date.now() - ilk.onceSaat * 3600_000);
        yap.tarih = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-${String(t0.getDate()).padStart(2, '0')}`;
        yap.saat = `${String(t0.getHours()).padStart(2, '0')}:${String(t0.getMinutes()).padStart(2, '0')}`;
      } else if (!yap.tarih) { yap.tarih = bugun(); }
      render(); return;
    } else if (act === 'yapEkle') {
      const z = yapZamanlari();
      if (!restoran(yap.restoran)) { toast('Restoran seçin.'); return; }
      if (z.some((x) => !x)) { toast('En yeni döngünün tarihini ve bitiş saatini girin.'); return; }
      let n = 0;
      yap.kayitlar.forEach((k, i) => {
        if (k.fiyat == null || k.doluluk == null) return;
        setup.kayitlar.push({ id: uid('k'), restoran: yap.restoran, tarih: z[i].tarih, saat: z[i].saat, fiyat: k.fiyat, doluluk: k.doluluk, ratingOnce: k.ratingOnce, ratingSonra: k.ratingSonra, gelir: k.gelir, kar: k.kar });
        n += 1;
      });
      yap = { metin: '', kayitlar: [], tarih: '', saat: '', restoran: yap.restoran };
      toast(`${n} döngü eklendi.`);
    } else return;
    save();
    render();
  }
  function kayitEkle() {
    const k = {
      id: uid('k'), restoran: form.restoran, tarih: form.tarih, saat: String(form.saat || '').replace('.', ':'),
      fiyat: okuSayi(form.fiyat), doluluk: okuSayi(form.doluluk), ratingOnce: okuSayi(form.ratingOnce), ratingSonra: okuSayi(form.ratingSonra),
      gelir: okuSayi(form.gelir), kar: okuSayi(form.kar),
    };
    if (!restoran(k.restoran)) { toast('Restoran seçin.'); return false; }
    if (!(k.fiyat > 0) || k.doluluk == null) { toast('Fiyat ve doluluk gerekli.'); return false; }
    if (k.saat && !/^\d{1,2}:\d{2}$/.test(k.saat)) { toast('Bitiş saati 07:27 biçiminde olmalı.'); return false; }
    setup.kayitlar.push(k);
    const rr = restoran(k.restoran);
    const a = R.kayitAnalizi(k, rr);
    form = { ...bosForm(), restoran: k.restoran, tarih: k.tarih, saat: '' };
    toast(a.seviyeUyusmaz ? `Kaydedildi. Uyarı: gelire göre seviye ${R.seviyeTahmini({ ...k, tip: rr.tip })}.` : 'Kaydedildi.');
    return true;
  }
  function onChange(ev) {
    const el = ev.target;
    const ds = el.dataset;
    if (ds.f) {
      const v = okuSayi(el.value);
      if (ds.f === 'seviye') setup.seviye = Math.max(1, Math.floor(v || 1));
      else if (ds.f === 'fiyat') setup.fiyat = Math.min(R.FIYAT_MAX, Math.max(R.FIYAT_MIN, v || R.FIYAT_MIN));
      else if (ds.f === 'doluluk') setup.doluluk = Math.min(100, Math.max(1, v || R.DOLULUK.ust));
      else if (ds.f === 'toplamSeviye') setup.toplamSeviye = v > 0 ? Math.floor(v) : null;
      else if (ds.f === 'kontratPct') setup.kontratPct = Math.min(50, Math.max(0, v || 0));
      else if (ds.f === 'maasSaatlik') setup.maas.saatlik = v > 0 ? v : null;
      else if (ds.f === 'maasSeviye') setup.maas.seviye = v > 0 ? Math.floor(v) : null;
    } else if (ds.kalite) { setup.menu[ds.kalite].kalite = Math.min(12, Math.max(0, Number(el.value) || 0)); }
    else if (ds.manuel) { const v = okuSayi(el.value); setup.menu[ds.manuel].manuel = v > 0 ? v : null; }
    else if (ds.satir) {
      const v = okuSayi(el.value);
      const adet = R.ihtiyac(seciliIds(), setup.seviye, setup.tip)[ds.satir];
      if (!(v > 0) || !adet) return;
      setup.menu[ds.satir].manuel = v / adet;
      toast(`Birim maliyet: ${birimFmt(v / adet)} (${num(v)} ÷ ${num(adet)} adet). Seviye ve menü oyundakiyle aynı olmalı.`);
    }
    else if (ds.rf) {
      const x = restoran(ds.id);
      if (!x) return;
      if (ds.rf === 'ad') x.ad = el.value.trim().slice(0, 40);
      else { const v = okuSayi(el.value); x.seviye = v > 0 ? Math.floor(v) : null; }
    } else if (ds.yf) { form[ds.yf] = el.value; if (ds.yf !== 'restoran') return; }
    else if (ds.yapf) { yap[ds.yapf] = el.value; render(); return; }
    else if (ds.rt) {
      const v = okuSayi(el.value);
      if (v == null) return;
      setup.rating[ds.rt] = ds.rt === 'dongu' ? Math.min(40, Math.max(2, Math.floor(v))) : Math.min(10, Math.max(0, v));
    } else if (el.matches('[data-rtrest]')) {
      const ks = kayitlariOf(el.value);
      const o = R.restoranOzeti(ks);
      if (o.rating != null) setup.rating.mevcut = o.rating;
      if (o.hedef) setup.rating.hedef = Math.round(o.hedef.hedef * 100) / 100;
    } else return;
    save();
    render();
  }
  function onInput(ev) {
    const el = ev.target;
    if (el.matches('[data-yap]')) yap.metin = el.value;
    else if (el.dataset.yf) form[el.dataset.yf] = el.value;
  }
  function onHash() {
    const [key, sub] = location.hash.slice(1).split('/');
    if (key !== 'restoran') return;
    const next = TABS.some(([k]) => k === sub) ? sub : tab;
    if (next === tab) return;
    setTab(next);
    render();
    window.scrollTo(0, 0);
  }

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  window.addEventListener('hashchange', onHash);
  render();
  load();

  return {
    setRealm(next) {
      if (next === r) return;
      r = next;
      setup = loadSetup(r);
      form = bosForm();
      yap = { metin: '', kayitlar: [], tarih: '', saat: '', restoran: '' };
      data = null;
      render();
      load();
    },
    destroy() {
      destroyed = true;
      clearTimeout(toastTimer);
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      root.removeEventListener('input', onInput);
      window.removeEventListener('hashchange', onHash);
      style.remove();
      root.innerHTML = '';
    },
  };
}
