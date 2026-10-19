// DentSimco — Perakende içindeki restoran binaları (arayüz parçaları)
// Hesap hesap-restoran.js'te; yönetim gideri ve satış hızı Perakende'nin ortak yönetici ekibinden gelir.
// perakende.js kaydı (setup.restoran) bu dosyadaki yardımcılarla temizler, çizer ve düzenler.

import { LOCALE } from './i18n.js';
import { parseNum } from './uretim.js';
import * as R from './hesap-restoran.js';
import { urunAdi } from './urun-adlari.js';
import { esc } from './esc.js';

const KAYNAKLAR = [['borsa', 'Borsa'], ['kontrat', 'Kontrat'], ['manuel', 'Elle']];
const TIPLER = [['eko', 'Eko'], ['luks', 'Lüks']];
const GORUNUM = [['beklenen', 'Beklenen'], ['simdi', 'Şimdi']];
const VARSAYILAN_MENU = { 117: 7, 119: 10, 142: 7, 143: 5, 124: 7, 125: 9 };

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
const cls = (x) => (x > 0.004 ? 'c-up' : x < -0.004 ? 'c-down' : '');
const inputVal = (x) => (x == null || x === '' ? '' : String(x).replace('.', ','));
const uid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ad = (id) => urunAdi(id, R.URUNLER[id]?.ad) || R.URUNLER[id]?.ad || `#${id}`;
const kopyaMenu = (m) => JSON.parse(JSON.stringify(m));
const tipOf = (t) => (t === 'luks' ? 'luks' : 'eko');
const numOr = (x, d = null) => (x === '' || x == null || !fin(Number(x)) ? d : Number(x));
const posOr = (x, d = null) => (fin(Number(x)) && Number(x) > 0 && x !== '' && x != null ? Number(x) : d);
const kv = (label, value, c = '', strong = false) => `<div class="ur-kv${strong ? ' strong' : ''}"><span>${label}</span><span class="${c}">${value}</span></div>`;
const chip = (text, kind = '') => `<span class="ur-chip ${kind}">${esc(text)}</span>`;
const seg = (act, options, value, label, extra = '') => `<div class="ur-seg" role="group" aria-label="${esc(label)}">${options.map(([v, t]) =>
  `<button type="button" data-act="${act}" data-v="${esc(v)}"${extra} aria-pressed="${String(v) === String(value)}">${esc(t)}</button>`).join('')}</div>`;
function field(label, attr, value, { unit = '', mode = 'decimal', placeholder = '' } = {}) {
  return `<label class="ur-field"><span>${esc(label)}</span><div class="ur-input">${unit === '$' ? '<i>$</i>' : ''}<input type="text" inputmode="${mode}" autocomplete="off" ${attr} value="${esc(value)}" placeholder="${esc(placeholder)}">${unit && unit !== '$' ? `<i>${esc(unit)}</i>` : ''}</div></label>`;
}

export const RESTORAN_CSS = `
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
.rs-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 740px) { .rs-form { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 520px) {
  .rs-top { grid-template-columns: minmax(0, 1fr) repeat(3, minmax(46px, auto)); gap: 6px; }
  .rs-pick { font-size: 15px; gap: 8px; }
  .rs-num b { font-size: 13.5px; } .rs-num small { font-size: 10.5px; }
  .rs-opts { padding-left: 0; }
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Kayıt: setup.restoran
// { menuMode: 'ortak' | 'ayri', menu: {id: {secili, kalite, kaynak, manuel}}, kontratPct, gorunum: 'beklenen' | 'simdi',
//   items: [{ id, ad, tip, seviye, fiyat, rating, doluluk, menu? }] }
// ---------------------------------------------------------------------------------------------------------------
export function varsayilanMenu() {
  return Object.fromEntries(Object.keys(R.URUNLER).map((id) => [id, { secili: id in VARSAYILAN_MENU, kalite: VARSAYILAN_MENU[id] ?? 0, kaynak: 'borsa', manuel: null }]));
}
export const varsayilanRestoran = () => ({ menuMode: 'ortak', menu: varsayilanMenu(), kontratPct: 0, gorunum: 'beklenen', items: [] });

function temizMenu(raw) {
  const out = varsayilanMenu();
  for (const id of Object.keys(out)) {
    const x = raw?.[id];
    if (!x || typeof x !== 'object') continue;
    out[id] = { secili: !!x.secili, kalite: Math.min(12, Math.max(0, Math.floor(Number(x.kalite) || 0))),
      kaynak: KAYNAKLAR.some(([k]) => k === x.kaynak) ? x.kaynak : 'borsa', manuel: posOr(x.manuel) };
  }
  return out;
}
export function temizleRestoran(raw) {
  const s = varsayilanRestoran();
  if (!raw || typeof raw !== 'object') return s;
  s.menuMode = raw.menuMode === 'ayri' ? 'ayri' : 'ortak';
  s.menu = temizMenu(raw.menu);
  s.kontratPct = Math.min(50, Math.max(0, Number(raw.kontratPct) || 0));
  s.gorunum = raw.gorunum === 'simdi' ? 'simdi' : 'beklenen';
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    if (!it || typeof it !== 'object') continue;
    s.items.push({ id: String(it.id || uid()), ad: String(it.ad || '').slice(0, 40), tip: tipOf(it.tip),
      seviye: Math.max(0, Math.floor(Number(it.seviye) || 0)), fiyat: posOr(it.fiyat), rating: numOr(it.rating),
      doluluk: numOr(it.doluluk) == null ? null : Math.min(100, Math.max(0, Number(it.doluluk))),
      menu: it.menu ? temizMenu(it.menu) : null });
  }
  if (s.menuMode === 'ayri') for (const it of s.items) it.menu ||= kopyaMenu(s.menu);
  return s;
}
export const ratingBonusu = R.ratingBonusu;
export const restoranSeviye = (rs) => (rs?.items || []).reduce((t, it) => t + (it.seviye || 0), 0);

// Eski bağımsız Restoran sayfasının kaydından menü ve fiyat bir kez aktarılır
export function eskiKayittanAktar(realm) {
  try {
    const raw = JSON.parse(localStorage.getItem(`dentsimco.restoran.r${realm}`) || 'null');
    if (!raw || typeof raw !== 'object') return null;
    const rs = varsayilanRestoran();
    rs.menu = temizMenu(raw.menu);
    rs.kontratPct = Math.min(50, Math.max(0, Number(raw.kontratPct) || 0));
    if (Number(raw.seviye) > 0) rs.items.push({ id: uid(), ad: '', tip: tipOf(raw.tip), seviye: Math.floor(Number(raw.seviye)), fiyat: posOr(raw.fiyat),
      rating: null, doluluk: numOr(raw.doluluk), menu: null });
    return rs;
  } catch { return null; }
}

// ---------------------------------------------------------------------------------------------------------------
// Hesap bağlantısı
// ---------------------------------------------------------------------------------------------------------------
const menuOfItem = (rs, it) => (rs.menuMode === 'ayri' && it.menu ? it.menu : rs.menu);
function birimOf(rs, m, pid, marketOf) {
  if (m.kaynak === 'manuel') return m.manuel;
  const b = marketOf(Number(pid), m.kalite);
  if (b == null) return null;
  return m.kaynak === 'kontrat' ? b * (1 - rs.kontratPct / 100) : b;
}
// c: Perakende bağlamı (adminNet, ratingBonus, buildings, averageSalary); mod: görünüm
export function degerlendirRestoran(rs, c, marketOf) {
  const bina = c.buildings?.r || {};
  const menuOf = (it) => {
    const m = menuOfItem(rs, it);
    return Object.keys(R.URUNLER).filter((id) => m[id]?.secili).map((id) => ({ id: Number(id), birim: birimOf(rs, m[id], id, marketOf), kalite: m[id].kalite }));
  };
  return R.restoranDegerlendir(rs.items, { adminNet: c.adminNet, averageSalary: c.averageSalary, salaryModifier: bina.salaryModifier,
    ratingBonus: c.ratingBonus, mod: rs.gorunum, menuOf });
}

// ---------------------------------------------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------------------------------------------
function menuHtml(rs, scope, m, g, marketOf, katAcik) {
  const ids = Object.keys(R.URUNLER).filter((id) => m[id]?.secili).map(Number);
  const say = R.kategoriSayilari(ids);
  return R.KATEGORILER.map((kat) => {
    const n = say[kat.key];
    const durum = !n ? '<span class="c-down">en az bir ürün seçin</span>' : `${n} ürün`;
    const satirlar = kat.urunler.map((id) => {
      const x = m[id];
      const k = g?.kalemler.find((y) => y.id === id);
      const b = marketOf(id, x.kalite);
      const alt = x.kaynak === 'manuel' ? 'elle' : b == null ? `Q${x.kalite} ilan yok` : x.kaynak === 'kontrat' ? `borsa ${birimFmt(b)} −%${num(rs.kontratPct, 0)}` : `borsa Q${x.kalite}`;
      const key = `data-s="${esc(scope)}" data-p="${id}"`;
      const opts = x.secili ? `<div class="rs-opts">
          <label class="rs-mini"><span>Kalite</span><select data-rm="${esc(scope)}|${id}|kalite">${Array.from({ length: 13 }, (_, q) => `<option value="${q}" ${q === x.kalite ? 'selected' : ''}>Q${q}</option>`).join('')}</select></label>
          <div class="rs-mini"><span>Maliyet</span>${seg('rm.kaynak', KAYNAKLAR, x.kaynak, `${ad(id)} maliyet kaynağı`, ` ${key}`)}</div>
          ${x.kaynak === 'manuel' ? `<label class="rs-mini"><span>Sourcing Cost $</span><input type="text" inputmode="decimal" autocomplete="off" data-rm="${esc(scope)}|${id}|satir" value="${esc(inputVal(x.manuel != null && k?.adet > 0 ? Math.round(x.manuel * k.adet * 100) / 100 : ''))}" placeholder="${esc(k?.adet > 0 ? 'oyundaki satır' : 'önce seviye girin')}"></label>` : ''}
        </div>` : '';
      return `<div class="rs-item"><div class="rs-top">
          <button type="button" class="rs-pick" data-act="rm.urun" ${key} aria-pressed="${x.secili}"><span class="rs-box"></span><span class="nm">${esc(ad(id))}</span></button>
          <div class="rs-num"><b>${x.secili ? num(k?.adet) : '—'}</b><small>adet</small></div>
          <div class="rs-num"><b>${x.secili ? birimFmt(k?.birim) : birimFmt(b)}</b><small>${x.secili ? esc(alt) : `borsa Q${x.kalite}`}</small></div>
          <div class="rs-num"><b>${x.secili ? money(k?.tutar) : '—'}</b><small>${x.secili ? esc(KAYNAKLAR.find(([v]) => v === x.kaynak)?.[1]) : ''}</small></div>
        </div>${opts}</div>`;
    }).join('');
    return `<div class="rs-cat"><b>${esc(kat.ad)}</b><span>${durum}</span></div>${satirlar}`;
  }).join('');
}

function kart(rs, it, row, marketOf, acik) {
  const m = menuOfItem(rs, it);
  const ayri = rs.menuMode === 'ayri';
  const a = (f) => `data-rf="${esc(it.id)}|${f}"`;
  const hedef = row.hedef;
  const hedefEtiket = hedef.kaynak === 'bilinmiyor' ? 'bilinmiyor' : 'tahmini';
  const chips = [chip(`Rating ${num(row.simdi.rating, 2)} → ${num(row.beklenen.rating, 2)}`), chip(`Hedef ${hedefEtiket}`, 'muted'),
    row.kalite != null ? chip(`Menü kalitesi Q${num(row.kalite, 1)}`, 'muted') : '',
    chip(`Doluluk %${num(row.simdi.doluluk, 1)} → %${num(row.beklenen.doluluk, 1)}`, 'muted'),
    chip(`Kâr ${money(row.secili.profitDay)}/gün`, row.secili.profitDay > 0 ? 'up' : 'down')];
  if (row.kapanis.guvenli) chips.push(chip('Yükseltme ve kapanış güvenli', 'up'));
  else if (row.simdi.rating > 0) chips.push(chip(`Yükseltme sonrası rating ${num(row.kapanis.sonra, 2)}`, 'down'));
  const g = row.gider;
  const uyar = [g.eksikKategori.length ? `<div class="ur-msg err">Her kategoriden en az bir ürün gerekir: ${esc(g.eksikKategori.join(', '))} eksik.</div>` : '',
    g.eksikFiyat ? '<div class="ur-msg">Fiyatı olmayan ürünler toplama girmedi; kaliteyi değiştirin ya da maliyeti elle girin.</div>' : ''].join('');
  return `<article class="ur-card" aria-label="Restoran ${esc(it.ad || '')}">
    <div class="ur-row" style="gap:12px;flex-wrap:wrap">
      <div class="grow" style="min-width:140px">${field('Ad (isteğe bağlı)', a('ad'), it.ad, { mode: 'text', placeholder: 'Restoran' })}</div>
      ${seg('rf.tip', TIPLER, it.tip, 'Restoran tipi', ` data-i="${esc(it.id)}"`)}</div>
    <div class="rs-form">
      ${field('Seviye', a('seviye'), it.seviye || '', { mode: 'numeric' })}
      ${field('Menü fiyatı', a('fiyat'), inputVal(it.fiyat), { unit: '$', placeholder: '62' })}
      ${field('Son döngü doluluğu', a('doluluk'), inputVal(it.doluluk), { unit: '%' })}
      ${field('Rating', a('rating'), inputVal(it.rating))}
    </div>
    <div class="ur-chips">${chips.join('')}</div>${uyar}
    <div class="ur-metrics">
      <div class="ur-stat"><span>Gelir/gün</span><span>${money(row.secili.revenueDay)}</span></div>
      <div class="ur-stat"><span>Malzeme/gün</span><span>${money(row.costDay)}</span></div>
      <div class="ur-stat"><span>Maaş/gün</span><span>${money(row.wagesDay)}</span></div></div>
    ${ayri ? `<button type="button" class="pk-fold" data-act="rf.menu" data-i="${esc(it.id)}" aria-expanded="${acik}"><span class="grow">Bu binanın menüsü</span>${chip(`${Object.values(m).filter((x) => x.secili).length} ürün`, 'muted')}</button>
      ${acik ? `<div>${menuHtml(rs, it.id, m, g, marketOf)}</div>` : ''}` : ''}
    <div class="ur-row"><button type="button" class="ur-btn danger grow" data-act="rf.sil" data-i="${esc(it.id)}">Restoranı sil</button></div>
  </article>`;
}

// Binalar sekmesindeki bölüm
export function restoranBinalarHtml(rs, res, marketOf, acikSet) {
  const ortak = rs.menuMode !== 'ayri';
  const ortakMenu = ortak ? `<section class="ur-card"><div class="ur-head"><h2>Menü</h2></div>
      <div class="ur-grid2">${field('Kontrat indirimi', 'data-rk="kontratPct"', inputVal(rs.kontratPct), { unit: '%' })}</div>
      ${menuHtml(rs, 'o', rs.menu, res.rows[0]?.gider, marketOf)}</section>` : `<section class="ur-card"><div class="ur-grid2">${field('Kontrat indirimi', 'data-rk="kontratPct"', inputVal(rs.kontratPct), { unit: '%' })}</div></section>`;
  return `<section class="ur-card" aria-labelledby="h-rs"><div class="ur-head"><h2 id="h-rs">Restoranlar</h2></div>
      ${seg('rk.mod', [['ortak', 'Ortak menü'], ['ayri', 'Ayrı menü']], rs.menuMode, 'Menü uygulaması')}
      <button type="button" class="ur-btn primary" data-act="rk.ekle" style="width:100%">Restoran ekle</button></section>
    ${rs.items.length ? ortakMenu : ''}
    ${rs.items.map((it, i) => kart(rs, it, res.rows[i], marketOf, acikSet.has(it.id))).join('')}`;
}

// Özet sekmesindeki restoran kartları
export function restoranOzetHtml(rs, res, k, periodName) {
  if (!rs.items.length) return '';
  const m = (v) => money(v * k);
  const rows = res.rows.map((r, i) => `<div class="ur-card" style="padding:12px"><div class="ur-row" style="gap:6px;flex-wrap:wrap"><span style="font-size:18px;font-weight:600">${esc(rs.items[i].ad || 'Restoran')}</span>${chip(r.tip === 'luks' ? 'Lüks' : 'Eko')}${chip(`Seviye ${num(r.seviye)}`, 'muted')}</div>
      ${kv('Fiyat', money(r.fiyat))}${kv('Rating', `${num(r.simdi.rating, 2)} → ${num(r.beklenen.rating, 2)}`)}${kv('Doluluk', `%${num(r.simdi.doluluk, 1)} → %${num(r.beklenen.doluluk, 1)}`)}
      <div class="ur-hr"></div>
      ${kv(`Gelir (${periodName})`, m(r.secili.revenueDay))}${kv('Malzeme', m(-r.costDay))}${kv('Maaş ve yönetim', m(-r.wagesDay))}
      ${kv(`Kâr (${periodName})`, `${r.secili.profitDay > 0.5 ? '+' : ''}${m(r.secili.profitDay)}`, cls(r.secili.profitDay), true)}
      <div class="ur-hr"></div>
      ${kv('Şimdiki kâr', m(r.simdi.profitDay), cls(r.simdi.profitDay))}${kv('Beklenen kâr', m(r.beklenen.profitDay), cls(r.beklenen.profitDay))}</div>`).join('');
  return `<section style="display:flex;flex-direction:column;gap:10px"><h2>Restoranlar</h2>
      ${seg('rk.gorunum', GORUNUM, rs.gorunum, 'Hesap görünümü')}${rows}</section>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Olaylar. rs doğrudan değiştirilir (çağıran kopya verir); işlendiyse true döner.
// env: { marketOf(id, q), acik: Set }
// ---------------------------------------------------------------------------------------------------------------
export function restoranTikla(rs, btn, env) {
  const act = btn.dataset.act || '';
  const scopeMenu = () => (btn.dataset.s === 'o' ? rs.menu : rs.items.find((x) => x.id === btn.dataset.s)?.menu);
  if (act === 'rk.ekle') {
    const it = { id: uid(), ad: '', tip: 'eko', seviye: 0, fiyat: null, rating: null, doluluk: null, menu: kopyaMenu(rs.menu) };
    rs.items.push(it);
    env.acik.add(it.id);
  } else if (act === 'rk.mod') {
    rs.menuMode = btn.dataset.v === 'ayri' ? 'ayri' : 'ortak';
    for (const it of rs.items) if (rs.menuMode === 'ayri' && !it.menu) it.menu = kopyaMenu(rs.menu);
  } else if (act === 'rk.gorunum') rs.gorunum = btn.dataset.v === 'simdi' ? 'simdi' : 'beklenen';
  else if (act === 'rf.tip') { const it = rs.items.find((x) => x.id === btn.dataset.i); if (it) it.tip = tipOf(btn.dataset.v); }
  else if (act === 'rf.sil') { rs.items = rs.items.filter((x) => x.id !== btn.dataset.i); }
  else if (act === 'rf.menu') { const id = btn.dataset.i; if (env.acik.has(id)) env.acik.delete(id); else env.acik.add(id); }
  else if (act === 'rm.urun') { const m = scopeMenu(); const x = m?.[btn.dataset.p]; if (x) x.secili = !x.secili; }
  else if (act === 'rm.kaynak') {
    const m = scopeMenu(); const x = m?.[btn.dataset.p];
    if (!x) return true;
    x.kaynak = KAYNAKLAR.some(([k]) => k === btn.dataset.v) ? btn.dataset.v : 'borsa';
    if (x.kaynak === 'manuel' && x.manuel == null) x.manuel = env.marketOf(Number(btn.dataset.p), x.kalite);
  } else return false;
  return true;
}

export function restoranDegis(rs, t, env) {
  const rk = t.dataset.rk;
  if (rk === 'kontratPct') { rs.kontratPct = Math.min(50, Math.max(0, parseNum(t.value) ?? 0)); return true; }
  const rf = t.dataset.rf;
  if (rf) {
    const [id, f] = rf.split('|');
    const it = rs.items.find((x) => x.id === id);
    if (!it) return false;
    const n = parseNum(t.value);
    if (f === 'ad') it.ad = t.value.trim().slice(0, 40);
    else if (f === 'seviye') it.seviye = Math.max(0, Math.floor(n ?? 0));
    else if (f === 'fiyat') it.fiyat = n != null && n > 0 ? n : null;
    else if (f === 'doluluk') it.doluluk = n == null ? null : Math.min(100, Math.max(0, n));
    else if (f === 'rating') it[f] = n == null ? null : Math.max(0, n);
    else return false;
    return true;
  }
  const rm = t.dataset.rm;
  if (rm) {
    const [scope, pid, f] = rm.split('|');
    const m = scope === 'o' ? rs.menu : rs.items.find((x) => x.id === scope)?.menu;
    const x = m?.[pid];
    if (!x) return false;
    if (f === 'kalite') x.kalite = Math.min(12, Math.max(0, Math.floor(Number(t.value) || 0)));
    else if (f === 'satir') {
      // Oyundaki "Sourcing Cost" satırı: toplam tutar ÷ adet = birim maliyet
      const tutar = posOr(parseNum(t.value));
      const it = scope === 'o' ? rs.items[0] : rs.items.find((y) => y.id === scope);
      const ids = Object.keys(m).filter((i) => m[i].secili).map(Number);
      const adet = it ? R.ihtiyac(ids, it.seviye, it.tip)[pid] : null;
      if (tutar != null && adet > 0) { x.kaynak = 'manuel'; x.manuel = tutar / adet; }
    } else return false;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Tüketimler: botun topladığı günlük restoran satışı (tüm oyuncular). raw = { v, t, p: { ürünId: { 'AAAA-AA-GG': [adet, ortFiyat, talep, ...] } } }
// ---------------------------------------------------------------------------------------------------------------
// Tüketim verisi: meta/retail_r{realm} içindeki ürün satırları (son ~28 gün) esas alınır; botun biriktirdiği restoran kaydında
// daha eski günler varsa onlar eklenir. Dönen biçim tuketimHtml'in istediği { p: { ürünId: { gün: [adet, fiyat, talep] } } }.
export function tuketimVerisi(retailList, kayit) {
  const p = {};
  for (const [id, days] of Object.entries(kayit?.p || {})) p[id] = { ...days };
  for (const it of Array.isArray(retailList) ? retailList : []) {
    const id = Number(it?.dbLetter);
    const rows = Array.isArray(it?.retailData) ? it.retailData : [];
    if (!Number.isFinite(id) || !rows.some((r) => Number(r?.amountSoldRestaurant) > 0)) continue;
    p[id] = p[id] || {};
    for (const r of rows) {
      const adet = Number(r?.amountSoldRestaurant);
      if (/^\d{4}-\d{2}-\d{2}$/.test(r?.date) && Number.isFinite(adet)) p[id][r.date] = [adet, Number(r.averagePrice) || 0, Number(r.demand) || 0];
    }
  }
  return Object.keys(p).length ? { p } : null;
}

const MODLAR = [['urun', 'Ürün'], ['gun', 'Gün']];
const gunKisa = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const gunAdi = (d) => new Intl.DateTimeFormat(LOCALE, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const degisim = (x, y) => (fin(x) && fin(y) && y > 0 ? ((x - y) / y) * 100 : null);
const pctDeg = (x) => (fin(x) ? `${x > 0.05 ? '+' : x < -0.05 ? '−' : ''}%${NF[1].format(Math.abs(x))}` : '—');
const degCls = (x) => (!fin(x) ? 'mu' : x > 0.05 ? 'up' : x < -0.05 ? 'dn' : 'mu');
const kisa = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const tutarKisa = (x) => (fin(x) ? `$${kisa.format(x)}` : '—');
const fiyatFmt = (x) => (fin(x) ? `$${NF[x >= 100 ? 0 : 2].format(x)}` : '—');

export const TUKETIM_CSS = `
.tk-modes, .tk-days { display: flex; gap: 6px; }
.tk-days { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
.tk-day { flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 56px; height: 52px; padding: 0 10px; border-radius: 12px;
  border: 1px solid var(--line-2); background: var(--raise); color: var(--text); font: 600 15px var(--font-c); }
.tk-day small { color: var(--muted); font: 500 11px var(--font); }
.tk-day[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.tk-day[aria-pressed="true"] small { color: var(--on-accent); }
.tk-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tk-chip { display: inline-flex; align-items: center; height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--line-2); background: var(--raise);
  color: var(--text); font: 600 14px var(--font); white-space: nowrap; }
.tk-chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.tk-cat { color: var(--accent); font: 600 12px var(--font-c); letter-spacing: .08em; text-transform: uppercase; margin: 8px 0 6px; }
.tk-bars { display: flex; align-items: flex-end; gap: 4px; height: 64px; border-bottom: 1px solid var(--line-2); }
.tk-bars span { flex: 1 1 0; border-radius: 4px 4px 0 0; background: var(--s-vol, #3d6a94); opacity: .7; min-height: 2px; }
.tk-bars span.last { background: var(--accent); opacity: 1; }
.tk-axis { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; }
.tk-t { display: flex; flex-direction: column; font-variant-numeric: tabular-nums; }
.tk-t .row { display: grid; gap: 4px; align-items: center; padding: 0 2px; min-height: 38px; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.tk-t .head { min-height: 28px; color: var(--muted); font-weight: 600; font-size: 11.5px; }
.tk-t .row > :not(:first-child) { text-align: right; }
.tk-t .row .nm { font: 600 14px var(--font-c); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.tk-t.g1 .row { grid-template-columns: 44px minmax(0, 1.5fr) 62px 74px 56px; }
.tk-t.g2 .row { grid-template-columns: minmax(0, 1fr) 72px 54px 50px 54px; font-size: 13px; }
.tk-t .row.hl { background: var(--sel); border-radius: 6px; }
.tk-t .up, .ur .tk-up { color: var(--up); } .tk-t .dn { color: var(--down); } .tk-t .mu { color: var(--muted); }
.tk-cathead { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; padding: 6px 2px 4px; border-bottom: 1px solid var(--line-2); }
.tk-cathead b { color: var(--accent); font: 600 12px var(--font-c); letter-spacing: .08em; text-transform: uppercase; }
.tk-cathead span { color: var(--muted); font-size: 12px; }
`;

// raw: tuketimVerisi sonucu; o: { nameOf, mod, urun, gun, fiyatYedek(id) }
export function tuketimHtml(raw, { nameOf, mod = 'urun', urun = null, gun = null, fiyatYedek } = {}) {
  const p = raw?.p;
  const ids = p ? Object.keys(p).filter((id) => p[id] && Object.keys(p[id]).length) : [];
  if (!ids.length) return `<div class="ur-card ur-empty"><h2>Tüketim verisi henüz yok</h2><p class="ur-sub">Restoranlarda satılan ürünlerin günlük tüketimi her gün bir kez toplanır; ilk kayıt geldiğinde burada görünür.</p></div>`;
  const days = [...new Set(ids.flatMap((id) => Object.keys(p[id])))].sort();
  const last = days[days.length - 1];
  const name = (id) => (nameOf ? nameOf(Number(id)) : null) || ad(id);
  const katOf = (id) => R.URUNLER[id]?.kat;
  const order = [...R.KATEGORILER.flatMap((k) => k.urunler.map(String)), ...ids.filter((id) => !katOf(id))].filter((id, i, arr) => ids.includes(id) && arr.indexOf(id) === i);
  // fiyat: kayıtta varsa o; yoksa borsa ortalaması (yıldızlı)
  const yedek = {};
  const fiyatOf = (id, day) => {
    const e = p[id][day];
    if (e && e[1] > 0) return { v: e[1], yedek: false };
    if (!(id in yedek)) yedek[id] = fiyatYedek ? fiyatYedek(Number(id)) : null;
    return fin(yedek[id]) && yedek[id] > 0 ? { v: yedek[id], yedek: true } : { v: null, yedek: false };
  };
  let yedekKullanildi = false;
  const star = (f) => { if (f.yedek) yedekKullanildi = true; return f.yedek ? '*' : ''; };
  const sec = urun && ids.includes(String(urun)) ? String(urun) : (ids.includes('124') ? '124' : order[0]);
  const gunSec = gun && days.includes(gun) ? gun : last;

  const modes = `<div class="tk-modes">${seg('rt.mod', MODLAR, mod, 'Görünüm')}</div>`;
  const head = `<div class="ur-head"><h2 id="h-tk">Restoran tüketimi</h2>${chip(`Son veri ${gunKisa(last)}`, 'muted')}</div>`;
  let body = '';

  if (mod === 'gun') {
    const idx = days.indexOf(gunSec);
    const onceki = idx > 0 ? days[idx - 1] : null;
    const pencere = days.slice(Math.max(0, idx - 7), idx);
    const satir = (id) => {
      const e = p[id][gunSec];
      const a = e ? e[0] : null;
      const dun = onceki && p[id][onceki] ? p[id][onceki][0] : null;
      const ort = pencere.length >= 3 ? avg(pencere.map((d) => p[id][d]?.[0]).filter(fin)) : null;
      const f = fiyatOf(id, gunSec);
      return { id, a, f, d1: degisim(a, dun), d7: degisim(a, ort), tutar: a != null && f.v ? a * f.v : null };
    };
    const rows = ids.map(satir).filter((r) => r.a != null);
    const artan = rows.filter((r) => r.d1 != null && r.d1 > 0.05).length;
    const azalan = rows.filter((r) => r.d1 != null && r.d1 < -0.05).length;
    const toplam = rows.reduce((s, r) => s + (r.tutar || 0), 0);
    const secici = `<div class="tk-days" role="group" aria-label="Gün">${[...days].reverse().map((d) =>
      `<button type="button" class="tk-day" data-act="rt.gun" data-v="${d}" aria-pressed="${d === gunSec}">${gunKisa(d)}<small>${esc(gunAdi(d))}</small></button>`).join('')}</div>`;
    const stats = `<div class="ur-metrics" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <div class="ur-stat"><span>Ürün</span><span>${num(rows.length)}</span></div>
        <div class="ur-stat"><span>Artan</span><span class="${artan ? 'c-up' : ''}">${num(artan)}</span></div>
        <div class="ur-stat"><span>Azalan</span><span class="${azalan ? 'c-down' : ''}">${num(azalan)}</span></div>
        <div class="ur-stat"><span>Tutar</span><span>${tutarKisa(toplam)}</span></div></div>`;
    const bolum = R.KATEGORILER.map((k) => [k.ad, k.key]).concat([['Diğer', null]]).map(([adi, key]) => {
      const sub = order.filter((id) => (key ? katOf(id) === key : !katOf(id))).map((id) => rows.find((r) => r.id === id)).filter(Boolean);
      if (!sub.length) return '';
      return `<div class="tk-cathead"><b>${esc(adi)}</b><span>${num(sub.length)} ürün</span></div>${sub.map((r) =>
        `<div class="row"><span class="nm">${esc(name(r.id))}</span><span>${num(r.a)}</span><span class="${r.f.v == null ? 'mu' : ''}">${fiyatFmt(r.f.v)}${star(r.f)}</span><span class="${degCls(r.d1)}">${pctDeg(r.d1)}</span><span class="${degCls(r.d7)}">${pctDeg(r.d7)}</span></div>`).join('')}`;
    }).join('');
    body = `${secici}${stats}<div class="tk-t g2" style="margin-top:4px"><div class="row head"><span>Ürün</span><span>Tüketim</span><span>Fiyat</span><span>Δ dün</span><span>Δ 7g</span></div>${bolum}</div>`;
  } else {
    const d = p[sec];
    const dizi = days.map((day) => d[day]?.[0] ?? null);
    const son = d[last]?.[0];
    const son7 = days.slice(-7).map((day) => d[day]?.[0]).filter(fin);
    const en = Math.max(...dizi.filter(fin));
    const g14 = days.slice(-14);
    const v14 = g14.map((day) => d[day]?.[0]).filter(fin);
    const lo = Math.min(...v14), hi = Math.max(...v14), span = hi - lo || 1;
    const bars = g14.map((day, i) => {
      const v = d[day]?.[0];
      const h = fin(v) ? Math.round(10 + ((v - lo) / span) * 54) : 2;
      return `<span style="height:${h}px" ${i === g14.length - 1 ? 'class="last"' : ''}></span>`;
    }).join('');
    const chips = R.KATEGORILER.map((k) => [k.ad, k.key]).concat([['Diğer', null]]).map(([adi, key]) => {
      const sub = order.filter((id) => (key ? katOf(id) === key : !katOf(id)));
      return sub.length ? `<div class="tk-cat">${esc(adi)}</div><div class="tk-chips">${sub.map((id) =>
        `<button type="button" class="tk-chip" data-act="rt.urun" data-v="${esc(id)}" aria-pressed="${id === sec}">${esc(name(id))}</button>`).join('')}</div>` : '';
    }).join('');
    const tablo = [...days].reverse().map((day, i) => {
      const e = d[day];
      if (!e) return '';
      const idx = days.indexOf(day);
      const dun = idx > 0 ? d[days[idx - 1]]?.[0] : null;
      const f = fiyatOf(sec, day);
      const dg = degisim(e[0], dun);
      return `<div class="row${i === 0 ? ' hl' : ''}"><span>${gunKisa(day)}</span><span>${num(e[0])}</span><span>${fiyatFmt(f.v)}${star(f)}</span><span>${tutarKisa(f.v ? e[0] * f.v : null)}</span><span class="${degCls(dg)}">${pctDeg(dg)}</span></div>`;
    }).join('');
    body = `${chips}
      <div class="ur-metrics">
        <div class="ur-stat"><span>Son gün</span><span>${num(son)}</span></div>
        <div class="ur-stat"><span>7 gün ort.</span><span>${num(avg(son7))}</span></div>
        <div class="ur-stat"><span>En yüksek</span><span>${num(en)}</span></div></div>
      <div class="ur-box" style="gap:8px"><div class="ur-row" style="justify-content:space-between"><span style="font:600 17px var(--font-c)">${esc(name(sec))}</span><span class="ur-note">${esc(`${gunKisa(g14[0])} – ${gunKisa(last)}`)}</span></div>
        <div class="tk-bars" role="img" aria-label="${esc(`${name(sec)}: ${num(lo)} – ${num(hi)}`)}">${bars}</div>
        <div class="tk-axis"><span>${gunKisa(g14[0])}</span><span>${gunKisa(last)}</span></div></div>
      <div class="tk-t g1"><div class="row head"><span>Gün</span><span>Tüketim</span><span>Fiyat</span><span>Tutar</span><span>Δ</span></div>${tablo}</div>`;
  }
  const dipnot = yedekKullanildi ? '<p class="ur-note">* Kayıtta fiyatı olmayan ürünlerde borsa ortalama fiyatı kullanıldı.</p>' : '';
  return `<section class="ur-card" aria-labelledby="h-tk">${head}${modes}${body}${dipnot}
      <p class="ur-note">Δ: ${mod === 'gun' ? 'bir önceki güne ve önceki 7 günün ortalamasına göre' : 'bir önceki güne göre'}.</p></section>`;
}
