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
const CALISANLAR = [['eko', 'Ekonomi'], ['pro', 'Profesyonel']]; // çalışan kalitesi; profesyonel maaşı 5 katına çıkarır
const GORUNUM = [['beklenen', 'Beklenen'], ['simdi', 'Şimdi']];
const VARSAYILAN_MENU = { 117: 7, 119: 10, 142: 7, 143: 5, 124: 7, 125: 9 };
const HEDEFLER = [['guvenli', 'Güvenli rating'], ['kalite', 'Hedef kalite']];
const URUN_SAYILARI = [['1', '1 ürün'], ['2', '2 ürün'], ['3', '3 ürün'], ['0', 'Otomatik']]; // kategori başına; yalnız 2'nin çarpanı oyunda doğrulanmış
const HEDEF_KALITELER = Array.from({ length: 25 }, (_, i) => i / 2); // Q0–Q12, yarım basamak
const varsayilanOneri = () => ({ hedef: 'guvenli', kalite: 6, urunSayisi: 2, seviye: 0, tip: 'eko' });

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
.ro { display: flex; flex-direction: column; gap: 10px; }
.ro-ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
.ro-ctl .ur-seg { flex: 1 1 260px; }
.ro-ctl .ur-seg button { min-height: 40px; padding: 2px 6px; font-size: 14px; white-space: normal; line-height: 1.15; }
.ur .ro-ctl .rs-mini select { width: 110px; }
.ro-tab { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 14px; }
.ro-tab th, .ro-tab td { padding: 7px 4px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
.ro-tab th { color: var(--muted); font: 600 12px var(--font); }
.ro-tab th:first-child, .ro-tab td:first-child { text-align: left; white-space: normal; }
.ro-tab .cat td { color: var(--accent); font: 600 12px var(--font); letter-spacing: .06em; text-transform: uppercase; padding-top: 10px; }
.ro-tab tr.deg td { font-weight: 600; }
.ro-tab tr:not(.deg):not(.cat) td { color: var(--muted); }
`;

// ---------------------------------------------------------------------------------------------------------------
// Kayıt: setup.restoran
// { menuMode: 'ortak' | 'ayri', menu: {id: {secili, kalite, kaynak, manuel}}, kontratPct, gorunum: 'beklenen' | 'simdi',
//   oneri: { hedef: 'guvenli' | 'kalite', kalite, urunSayisi: 0 | 1 | 2 | 3, seviye, tip } (Menü önerisi sekmesi; menüden bağımsız),
//   items: [{ id, ad, tip, seviye, fiyat, rating, doluluk, menu? }] }
// ---------------------------------------------------------------------------------------------------------------
export function varsayilanMenu() {
  return Object.fromEntries(Object.keys(R.URUNLER).map((id) => [id, { secili: id in VARSAYILAN_MENU, kalite: VARSAYILAN_MENU[id] ?? 0, kaynak: 'borsa', manuel: null }]));
}
export const varsayilanRestoran = () => ({ menuMode: 'ortak', menu: varsayilanMenu(), kontratPct: 0, gorunum: 'beklenen', oneri: varsayilanOneri(), items: [] });

function temizOneri(raw) {
  const o = varsayilanOneri();
  if (!raw || typeof raw !== 'object') return o;
  if (HEDEFLER.some(([k]) => k === raw.hedef)) o.hedef = raw.hedef;
  if (URUN_SAYILARI.some(([k]) => k === String(raw.urunSayisi))) o.urunSayisi = Number(raw.urunSayisi);
  const q = Number(raw.kalite);
  if (fin(q)) o.kalite = Math.min(12, Math.max(0, Math.round(q * 2) / 2));
  o.seviye = Math.max(0, Math.floor(Number(raw.seviye) || 0));
  o.tip = tipOf(raw.tip);
  return o;
}

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
  s.oneri = temizOneri(raw.oneri);
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    if (!it || typeof it !== 'object') continue;
    s.items.push({ id: String(it.id || uid()), ad: String(it.ad || '').slice(0, 40), tip: tipOf(it.tip), profesyonel: !!it.profesyonel,
      seviye: Math.max(0, Math.floor(Number(it.seviye) || 0)), fiyat: posOr(it.fiyat), rating: numOr(it.rating),
      doluluk: numOr(it.doluluk) == null ? null : Math.min(100, Math.max(0, Number(it.doluluk))),
      menu: it.menu ? temizMenu(it.menu) : null });
  }
  if (s.menuMode === 'ayri') for (const it of s.items) it.menu ||= kopyaMenu(s.menu);
  // Menü önerisi sekmesinde seviye girilmemişse kayıtlı ilk restoranınki (eski Restoran sayfasından aktarılan) kullanılır
  if (!s.oneri.seviye && s.items[0]?.seviye) Object.assign(s.oneri, { seviye: s.items[0].seviye, tip: s.items[0].tip });
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
// Kapsam: 'o' ortak menü, yoksa restoranın kendi menüsü
const menuOfScope = (rs, s) => (s === 'o' ? rs.menu : rs.items.find((x) => x.id === s)?.menu);
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

const kaliteYaz = (q) => (fin(q) ? `Q${num(q, Math.abs(q - Math.round(q)) > 0.04 ? 1 : 0)}` : '—');

// Menü önerisi: mevcut menüden bağımsız; seviye, tip ve hedefe göre en ucuz menü. env: { marketOf, arzOf, ratingBonus }
// Fiyat anlık borsa fiyatıdır; kontrat indirimi girildiyse fiyatlara uygulanır ve (kontrattan alındığı için) borsa arzı sınır sayılmaz.
function oneriHtml(rs, env) {
  const o = rs.oneri;
  const bina = { seviye: o.seviye, tip: o.tip };
  const kontrat = rs.kontratPct > 0;
  const s = R.oneriMenu({ binalar: [bina], fiyatOf: (id, q) => { const b = env.marketOf(id, q); return b == null ? null : b * (1 - rs.kontratPct / 100); },
    arzOf: kontrat ? null : env.arzOf, hedef: o.hedef, kalite: o.kalite, bonus: env.ratingBonus, urunSayisi: o.urunSayisi });
  const girdi = `<div class="rs-form">${field('Seviye', 'data-ro="seviye"', o.seviye || '', { mode: 'numeric' })}
      ${field('Kontrat indirimi', 'data-rk="kontratPct"', inputVal(rs.kontratPct), { unit: '%' })}</div>
    ${seg('ro.tip', TIPLER, o.tip, 'Restoran tipi')}
    <div class="ro-ctl">${seg('ro.hedef', HEDEFLER, o.hedef, 'Öneri hedefi')}
      ${o.hedef === 'kalite' ? `<label class="rs-mini"><span>Ortalama en az</span><select data-ro="kalite">${HEDEF_KALITELER.map((q) =>
        `<option value="${q}" ${q === o.kalite ? 'selected' : ''}>${kaliteYaz(q)}</option>`).join('')}</select></label>` : ''}</div>
    <div class="rs-mini"><span>Kategori başına ürün sayısı</span>${seg('ro.urunsayi', URUN_SAYILARI, String(o.urunSayisi), 'Kategori başına ürün sayısı')}</div>
    <p class="ur-note">Aynı menüyü kullanan birden çok restoranınız varsa seviyelerini toplayıp girin.</p>`;
  const kabuk = (ic) => `<div class="ro">${girdi}${ic}</div>`;
  if (s.durum === 'seviye') return kabuk('<p class="ur-note">Öneri için restorana seviye girin.</p>');
  if (s.durum === 'yok') {
    const neden = s.neden === 'fiyat' ? `${s.kategori} kategorisinde fiyatı ve arzı uygun ürün yok.`
      : s.hedefKalite > R.MAX_KALITE ? 'Bu rating menü kalitesiyle ulaşılamaz: gereken ortalama Q12\'yi aşıyor.'
        : `Ortalama ${kaliteYaz(s.hedefKalite)} için borsada uygun fiyatlı ilan bulunamadı.`;
    return kabuk(`<div class="ur-msg err">${esc(neden)}</div>`);
  }
  const gun = (x) => x * R.GUN_DONGU;
  const luks = o.tip === 'luks';
  const hedefNot = o.hedef === 'guvenli'
    ? `Hedef rating ${num(R.RATING.guvenli + R.RATING_PAYI, 1)} (güvenli ${num(R.RATING.guvenli, 1)} + pay ${num(R.RATING_PAYI, 1)}) için ortalama en az ${kaliteYaz(s.hedefKalite)} gerekir. Rating formülü tahminidir; uyguladıktan sonra ratingi birkaç döngü izleyin.`
    : `Ortalama menü kalitesi en az ${kaliteYaz(s.hedefKalite)}.`;
  const luksNot = luks ? '<p class="ur-note">Lüks restoranda hedef rating, formülün sonucu × 1,25 (lüks oturma çarpanı) olarak hesaplanır; çarpan oyunda ayrıca ölçülmedi.</p>' : '';
  const stat = (label, value) => `<div class="ur-stat"><span>${label}</span><span>${value}</span></div>`;
  const ozet = `<div class="ur-metrics">${stat('Gider/gün', money(gun(s.maliyet)))}${stat('Ortalama kalite', kaliteYaz(s.ortalama))}${stat('Tahmini rating', num(s.rating, 2))}</div>
    <p class="ur-note">Rating bonusu ${num(env.ratingBonus, 2)}: Kurulum'daki satış hızından ve yönetici ekibinin iletişim puanından gelir; girilmediyse 0 sayılır.</p>`;
  const satirlar = R.KATEGORILER.map((kat) => {
    const list = s.secim.filter((x) => R.URUNLER[x.id].kat === kat.key);
    return `<tr class="cat"><td colspan="4">${esc(kat.ad)}</td></tr>${list.map((x) =>
      `<tr><td>${esc(ad(x.id))}</td><td>${kaliteYaz(x.kalite)}</td><td>${num(x.adet)}</td><td>${money(gun(x.tutar))}</td></tr>`).join('')}`;
  }).join('');
  const tablo = `<table class="ro-tab"><thead><tr><th>Ürün</th><th>Kalite</th><th>Adet</th><th>Gider/gün</th></tr></thead>
      <tbody>${satirlar}<tr class="deg"><td>Toplam</td><td></td><td></td><td>${money(gun(s.maliyet))}</td></tr></tbody></table>`;
  const isaret = s.cesit > 0 ? '+' : s.cesit < 0 ? '−' : '';
  // 3 ürünlü kategori içeren öneri çeşitlilik tahminine dayanır: aynı hedefte 2 ürünlü menüyle fark gösterilir
  let ikiNot = '';
  if (Object.values(s.sayilar).some((n) => n >= 3)) {
    const iki = R.oneriMenu({ binalar: [bina], fiyatOf: (id, q) => { const b = env.marketOf(id, q); return b == null ? null : b * (1 - rs.kontratPct / 100); },
      arzOf: kontrat ? null : env.arzOf, hedef: o.hedef, kalite: o.kalite, bonus: env.ratingBonus, urunSayisi: 2 });
    if (iki.durum === 'ok') {
      const fark = gun(iki.maliyet - s.maliyet);
      ikiNot = `<p class="ur-note">Bu öneri 3 ürünlü kategori içeriyor; kazanç çeşitlilik tahminine dayanır. Aynı hedefte 2 ürünlü menü: ${money(gun(iki.maliyet))}/gün (${fark < 0 ? '−' : '+'}${money(Math.abs(fark))}).</p>`;
    }
  }
  const cesitNot = Object.values(s.sayilar).some((n) => n !== 2)
    ? `<p class="ur-note">Ürün çeşitliliğinin rating etkisi (1 ürün −0,2 · 2 ürün 0 · 3 ürün +0,9 puan) tahminidir; oyunda ölçülmedi. Bu menüde etki: ${isaret}${num(Math.abs(s.cesit), 2)} puan.</p>` : '';
  return kabuk(`<p class="ur-note">${esc(hedefNot)}</p>${luksNot}${ozet}${tablo}
      <p class="ur-note">Fiyatlar anlık borsa fiyatıdır; borsa değişince öneri de değişir. Kontrat indirimi girilirse fiyatlara uygulanır ve borsa arzı sınır sayılmaz. Rating hesabı menü kalitesinin düz ortalamasını varsayar (oyunda henüz doğrulanmadı).</p>
      ${cesitNot}${ikiNot}`);
}

function kart(rs, it, row, marketOf, acik) {
  const m = menuOfItem(rs, it);
  const ayri = rs.menuMode === 'ayri';
  const a = (f) => `data-rf="${esc(it.id)}|${f}"`;
  const hedef = row.hedef;
  const hedefEtiket = 'tahmini';
  const chips = [chip(`Rating ${num(row.simdi.rating, 2)} → ${num(row.beklenen.rating, 2)}`), chip(`Hedef ${hedefEtiket}`, 'muted'),
    row.kalite != null ? chip(`Menü kalitesi Q${num(row.kalite, 1)}`, 'muted') : '',
    chip(`Doluluk %${num(row.simdi.doluluk, 1)} → %${num(row.beklenen.doluluk, 1)}`, 'muted'),
    row.eksik ? chip('Kâr hesaplanamadı', 'down') : chip(`Kâr ${money(row.secili.profitDay)}/gün`, row.secili.profitDay > 0 ? 'up' : 'down')];
  if (row.kapanis.guvenli) chips.push(chip('Yükseltme ve kapanış güvenli', 'up'));
  else if (row.simdi.rating > 0) chips.push(chip(`Yükseltme sonrası rating ${num(row.kapanis.sonra, 2)}`, 'down'));
  const g = row.gider;
  const uyar = [g.eksikKategori.length ? `<div class="ur-msg err">Her kategoriden en az bir ürün gerekir: ${esc(g.eksikKategori.join(', '))} eksik.</div>` : '',
    g.eksikFiyat ? `<div class="ur-msg err">Borsada fiyatı olmayan ürün var: ${esc(g.kalemler.filter((k) => k.birim == null).map((k) => ad(k.id)).join(', '))}. Kâr hesaplanmadı; kaliteyi değiştirin ya da maliyeti (Sourcing Cost) elle girin.</div>` : ''].join('');
  return `<article class="ur-card" aria-label="Restoran ${esc(it.ad || '')}">
    <div class="ur-row" style="gap:12px;flex-wrap:wrap">
      <div class="grow" style="min-width:140px">${field('Ad (isteğe bağlı)', a('ad'), it.ad, { mode: 'text', placeholder: 'Restoran' })}</div>
      ${seg('rf.tip', TIPLER, it.tip, 'Restoran tipi', ` data-i="${esc(it.id)}"`)}</div>
    <div class="rs-mini"><span>Çalışan kalitesi</span>${seg('rf.calisan', CALISANLAR, it.profesyonel ? 'pro' : 'eko', 'Çalışan kalitesi', ` data-i="${esc(it.id)}"`)}</div>
    ${it.profesyonel ? '<p class="ur-note">Profesyonel çalışanda maaş 5 katına çıkar. Ratinge etkisi bilinmiyor, hesaba katılmadı.</p>' : ''}
    <div class="rs-form">
      ${field('Seviye', a('seviye'), it.seviye || '', { mode: 'numeric' })}
      ${field('Menü fiyatı', a('fiyat'), inputVal(it.fiyat), { unit: '$', placeholder: '62' })}
      ${field('Son döngü doluluğu', a('doluluk'), inputVal(it.doluluk), { unit: '%' })}
      ${field('Rating', a('rating'), inputVal(it.rating))}
    </div>
    <div class="ur-chips">${chips.join('')}</div>${uyar}
    ${row.fiyat > R.DOLULUK_FIYAT_UST ? `<p class="ur-note">Menü fiyatı $${num(R.DOLULUK_FIYAT_UST)}'ın üstünde: doluluk modeli yalnız $${num(R.FIYAT_MIN)}–${num(R.DOLULUK_FIYAT_UST)} aralığında ölçüldü, bu fiyatta doluluk tahmini belirsizdir.</p>` : ''}
    <p class="ur-note">Ekonomi evresinin (boom, normal, resesyon) restoran doluluğuna etkisi modellenmedi.</p>
    <div class="ur-metrics">
      <div class="ur-stat"><span>Gelir/gün</span><span>${money(row.secili.revenueDay)}</span></div>
      <div class="ur-stat"><span>Malzeme/gün</span><span>${money(row.costDay)}</span></div>
      <div class="ur-stat"><span>Maaş/gün</span><span>${money(row.wagesDay)}</span></div></div>
    ${ayri ? `<button type="button" class="pk-fold" data-act="rf.menu" data-i="${esc(it.id)}" aria-expanded="${acik}"><span class="grow">Bu binanın menüsü</span>${chip(`${Object.values(m).filter((x) => x.secili).length} ürün`, 'muted')}</button>
      ${acik ? `<div>${menuHtml(rs, it.id, m, g, marketOf)}</div>` : ''}` : ''}
    <div class="ur-row"><button type="button" class="ur-btn danger grow" data-act="rf.sil" data-i="${esc(it.id)}">Restoranı sil</button></div>
  </article>`;
}

// Menü önerisi sekmesi: restoran binalarından ve menüden bağımsızdır. env: { marketOf, arzOf(id, q), ratingBonus }
export function menuOnerisiSekmeHtml(rs, env) {
  return `<section class="ur-card" aria-labelledby="h-ro"><div class="ur-head"><h2 id="h-ro">Menü önerisi</h2></div>
      <p class="ur-sub">Seviyenizi ve hedefinizi girin; hedefi sağlayan en ucuz ürün ve kalite dağılımı aşağıda önerilir.</p>${oneriHtml(rs, env)}</section>`;
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
  const m = (v) => (v == null ? '—' : money(v * k));
  const rows = res.rows.map((r, i) => `<div class="ur-card" style="padding:12px"><div class="ur-row" style="gap:6px;flex-wrap:wrap"><span style="font-size:18px;font-weight:600">${esc(rs.items[i].ad || 'Restoran')}</span>${chip(r.tip === 'luks' ? 'Lüks' : 'Eko')}${chip(`Seviye ${num(r.seviye)}`, 'muted')}</div>
      ${kv('Fiyat', money(r.fiyat))}${kv('Rating', `${num(r.simdi.rating, 2)} → ${num(r.beklenen.rating, 2)}`)}${kv('Doluluk', `%${num(r.simdi.doluluk, 1)} → %${num(r.beklenen.doluluk, 1)}`)}
      <div class="ur-hr"></div>
      ${kv(`Gelir (${periodName})`, m(r.secili.revenueDay))}${kv('Malzeme', m(-r.costDay))}${kv('Maaş ve yönetim', m(-r.wagesDay))}
      ${kv(`Kâr (${periodName})`, r.secili.profitDay == null ? '—' : `${r.secili.profitDay > 0.5 ? '+' : ''}${m(r.secili.profitDay)}`, cls(r.secili.profitDay), true)}
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
  const scopeMenu = () => menuOfScope(rs, btn.dataset.s);
  if (act === 'rk.ekle') {
    const it = { id: uid(), ad: '', tip: 'eko', profesyonel: false, seviye: 0, fiyat: null, rating: null, doluluk: null, menu: kopyaMenu(rs.menu) };
    rs.items.push(it);
    env.acik.add(it.id);
  } else if (act === 'rk.mod') {
    rs.menuMode = btn.dataset.v === 'ayri' ? 'ayri' : 'ortak';
    for (const it of rs.items) if (rs.menuMode === 'ayri' && !it.menu) it.menu = kopyaMenu(rs.menu);
  } else if (act === 'rk.gorunum') rs.gorunum = btn.dataset.v === 'simdi' ? 'simdi' : 'beklenen';
  else if (act === 'rf.calisan') { const it = rs.items.find((x) => x.id === btn.dataset.i); if (it) it.profesyonel = btn.dataset.v === 'pro'; }
  else if (act === 'rf.tip') { const it = rs.items.find((x) => x.id === btn.dataset.i); if (it) it.tip = tipOf(btn.dataset.v); }
  else if (act === 'rf.sil') { rs.items = rs.items.filter((x) => x.id !== btn.dataset.i); }
  else if (act === 'rf.menu') { const id = btn.dataset.i; if (env.acik.has(id)) env.acik.delete(id); else env.acik.add(id); }
  else if (act === 'rm.urun') { const m = scopeMenu(); const x = m?.[btn.dataset.p]; if (x) x.secili = !x.secili; }
  else if (act === 'rm.kaynak') {
    const m = scopeMenu(); const x = m?.[btn.dataset.p];
    if (!x) return true;
    x.kaynak = KAYNAKLAR.some(([k]) => k === btn.dataset.v) ? btn.dataset.v : 'borsa';
    if (x.kaynak === 'manuel' && x.manuel == null) x.manuel = env.marketOf(Number(btn.dataset.p), x.kalite);
  } else if (act === 'ro.hedef') rs.oneri.hedef = HEDEFLER.some(([k]) => k === btn.dataset.v) ? btn.dataset.v : 'guvenli';
  else if (act === 'ro.urunsayi') rs.oneri.urunSayisi = temizOneri({ urunSayisi: btn.dataset.v }).urunSayisi;
  else if (act === 'ro.tip') rs.oneri.tip = tipOf(btn.dataset.v);
  else return false;
  return true;
}

export function restoranDegis(rs, t, env) {
  if (t.dataset.ro === 'kalite') { rs.oneri.kalite = temizOneri({ ...rs.oneri, kalite: t.value }).kalite; return true; }
  if (t.dataset.ro === 'seviye') { rs.oneri.seviye = Math.max(0, Math.floor(parseNum(t.value) ?? 0)); return true; }
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
    const m = menuOfScope(rs, scope);
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

const METRIKLER = [['adet', 'Adet'], ['tutar', 'Tutar']];
const ARALIKLAR = [[7, '7 gün'], [14, '14 gün'], [28, '28 gün']];
const gunKisa = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const gunAdi = (d) => new Intl.DateTimeFormat(LOCALE, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const degisim = (x, y) => (fin(x) && fin(y) && y > 0 ? ((x - y) / y) * 100 : null);
const pctDeg = (x) => (fin(x) ? `${x > 0.05 ? '+' : x < -0.05 ? '−' : ''}%${NF[1].format(Math.abs(x))}` : '—');
const degCls = (x) => (!fin(x) ? 'mu' : x > 0.05 ? 'up' : x < -0.05 ? 'dn' : 'mu');
const kisa = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const tutarKisa = (x) => (fin(x) ? `$${kisa.format(x)}` : '—');

export const TUKETIM_CSS = `
.tk-seg { display: flex; gap: 10px; flex-wrap: wrap; }
.tk-seg .ur-seg { flex: 1 1 200px; }
.tk-top { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
.tk-read { min-height: 22px; font: 600 15px var(--font-c); color: var(--accent); font-variant-numeric: tabular-nums; }
.tk-bars { display: flex; align-items: flex-end; gap: 3px; height: 72px; border-bottom: 1px solid var(--line-2); touch-action: pan-y; cursor: crosshair; user-select: none; -webkit-user-select: none; }
.tk-bars span { flex: 1 1 0; border-radius: 3px 3px 0 0; background: var(--accent); opacity: .45; min-height: 2px; }
.tk-bars span.sel { opacity: 1; }
.tk-bars span.hot { opacity: 1; background: var(--price, var(--accent)); }
.tk-axis { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; }
.tk-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--line-2); border-radius: 12px; background: var(--surface); }
.tk-m { border-collapse: separate; border-spacing: 0; font-variant-numeric: tabular-nums; font-size: 13px; width: 100%; }
.tk-m th, .tk-m td { height: 38px; padding: 0 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
.tk-m thead th { position: sticky; top: 0; background: var(--surface); color: var(--muted); font: 600 12px var(--font); }
.tk-m .nm { position: sticky; left: 0; z-index: 2; background: var(--surface); text-align: left; min-width: 118px; max-width: 150px; overflow: hidden; text-overflow: ellipsis;
  border-right: 1px solid var(--line-2); font: 600 14px var(--font-c); }
.tk-m thead .nm { z-index: 3; }
.tk-m .nm button { all: unset; cursor: pointer; display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
.tk-m tr.selrow td { background: var(--sel); }
/* Yapışkan ürün adı hücresi saydam olmamalı: kayan fiyatlar altından görünür. Seçili satır rengi opak zemin üstüne bindirilir. */
.tk-m tr.selrow th.nm { background: var(--surface) linear-gradient(var(--sel), var(--sel)); }
.tk-m tr.selrow .nm button { color: var(--accent); }
.tk-m th.selday, .tk-m td.selday { box-shadow: inset 2px 0 0 var(--accent), inset -2px 0 0 var(--accent); }
.tk-m thead th button { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: flex-end; width: 100%; color: inherit; line-height: 1.15; }
.tk-m thead th.selday button { color: var(--accent); }
.tk-m thead th small { font: 500 10.5px var(--font); }
.tk-m .cat td { height: 30px; text-align: left; background: var(--raise); color: var(--accent); font: 600 12px var(--font-c); letter-spacing: .08em; text-transform: uppercase; }
.tk-m .cat td span { display: inline-block; position: sticky; left: 8px; } /* kategori başlığı yatay kaydırmada solda sabit kalır */
.tk-m tfoot td, .tk-m tfoot th { font-weight: 600; border-bottom: 0; }
.tk-m .up { color: var(--up); } .tk-m .dn { color: var(--down); } .tk-m .mu { color: var(--muted); }
.tk-m .sum { color: var(--muted); }
@media (max-width: 600px) { .tk-m .opt { display: none; } .tk-m .nm { min-width: 104px; } }
`;

// raw: tuketimVerisi sonucu; o: { nameOf, metrik, aralik, urun, gun, fiyatYedek(id) }
export function tuketimHtml(raw, { nameOf, metrik = 'adet', aralik = 28, urun = null, gun = null, fiyatYedek } = {}) {
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
  const hucre = (id, day) => {
    const e = p[id][day];
    if (!e) return null;
    const f = fiyatOf(id, day);
    return { a: e[0], tutar: f.v ? e[0] * f.v : null, yedek: f.yedek };
  };
  const sec = urun && ids.includes(String(urun)) ? String(urun) : (ids.includes('124') ? '124' : order[0]);
  const gunSec = gun && days.includes(gun) ? gun : last;
  const gorunen = days.slice(-aralik).reverse(); // en yeni solda
  const val = (h) => (h == null ? null : metrik === 'tutar' ? h.tutar : h.a);
  const fmt = (x) => (!fin(x) ? '—' : metrik === 'tutar' ? tutarKisa(x) : num(x));

  // seçili gün özeti
  const gi = days.indexOf(gunSec);
  const onceki = gi > 0 ? days[gi - 1] : null;
  let artan = 0, azalan = 0, toplamTutar = 0, adetli = 0;
  for (const id of ids) {
    const h = hucre(id, gunSec), o = onceki ? hucre(id, onceki) : null;
    if (!h) continue;
    adetli += 1;
    toplamTutar += h.tutar || 0;
    const d = degisim(h.a, o?.a);
    if (d != null && d > 0.05) artan += 1; else if (d != null && d < -0.05) azalan += 1;
  }
  const gunKutu = `<div class="ur-box" style="gap:8px"><div class="ur-row" style="justify-content:space-between"><span style="font:600 17px var(--font-c)">${gunKisa(gunSec)} ${esc(gunAdi(gunSec))}</span><span class="ur-note">Seçili gün</span></div>
      <div class="ur-metrics" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <div class="ur-stat"><span>Ürün</span><span>${num(adetli)}</span></div>
        <div class="ur-stat"><span>Artan</span><span class="${artan ? 'c-up' : ''}">${num(artan)}</span></div>
        <div class="ur-stat"><span>Azalan</span><span class="${azalan ? 'c-down' : ''}">${num(azalan)}</span></div>
        <div class="ur-stat"><span>Tutar</span><span>${tutarKisa(toplamTutar)}</span></div></div></div>`;

  // seçili ürün özeti: tüm günler (en çok 28); değerler seçili gösterime göre (adet ya da dolar tutarı)
  const g28 = days.slice(-28);
  const vd = (day) => { const h = hucre(sec, day); return h == null ? null : val(h); };
  const tam = (x) => (!fin(x) ? '—' : metrik === 'tutar' ? `$${NF[0].format(x)}` : `${num(x)} adet`);
  const v = g28.map(vd).filter(fin);
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const son7 = days.slice(-7).map(vd).filter(fin);
  const bars = g28.map((day) => {
    const x = vd(day);
    return `<span ${day === gunSec ? 'class="sel"' : ''} data-day="${day}" data-txt="${esc(`${gunKisa(day)} ${gunAdi(day)} · ${tam(x)}`)}" style="height:${fin(x) ? Math.round(10 + ((x - lo) / span) * 54) : 2}px"></span>`;
  }).join('');
  const okuma = `${gunKisa(gunSec)} ${gunAdi(gunSec)} · ${tam(vd(gunSec))}`;
  const urunKutu = `<div class="ur-box" style="gap:8px"><div class="ur-row" style="justify-content:space-between"><span style="font:600 17px var(--font-c)">${esc(name(sec))}</span><span class="ur-note">${gunKisa(g28[0])} – ${gunKisa(last)}</span></div>
      <div class="ur-metrics"><div class="ur-stat"><span>Son gün</span><span>${fmt(vd(last))}</span></div>
        <div class="ur-stat"><span>7 gün ort.</span><span>${fmt(avg(son7))}</span></div>
        <div class="ur-stat"><span>En yüksek</span><span>${fmt(hi)}</span></div></div>
      <div class="tk-read" data-read aria-live="polite">${esc(okuma)}</div>
      <div class="tk-bars" data-chart role="img" aria-label="${esc(`${name(sec)}: ${fmt(lo)} – ${fmt(hi)}`)}">${bars}</div>
      <div class="tk-axis"><span>${gunKisa(g28[0])}</span><span>${gunKisa(last)}</span></div></div>`;

  // matris
  let yedekVar = false;
  const basl = gorunen.map((day) => `<th scope="col" class="${day === gunSec ? 'selday' : ''}"><button type="button" data-act="rt.gun" data-v="${day}" aria-pressed="${day === gunSec}">${gunKisa(day)}<small>${esc(gunAdi(day))}</small></button></th>`).join('');
  const satirlar = R.KATEGORILER.map((k) => [k.ad, k.key]).concat([['Diğer', null]]).map(([adi, key]) => {
    const sub = order.filter((id) => (key ? katOf(id) === key : !katOf(id)));
    if (!sub.length) return '';
    const kolon = gorunen.length + 2;
    return `<tr class="cat"><td colspan="${kolon}"><span>${esc(adi)}</span></td></tr>${sub.map((id) => {
      const hs = gorunen.map((day) => hucre(id, day));
      const vals = hs.map(val).filter(fin);
      const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
      const sonH = hucre(id, gunSec), onH = onceki ? hucre(id, onceki) : null;
      const dg = degisim(sonH?.a, onH?.a);
      const yd = hs.some((h) => h?.yedek) && metrik === 'tutar';
      if (yd) yedekVar = true;
      return `<tr class="${id === sec ? 'selrow' : ''}"><th scope="row" class="nm"><button type="button" data-act="rt.urun" data-v="${esc(id)}" aria-pressed="${id === sec}">${esc(name(id))}${yd ? '*' : ''}</button></th>
        <td class="opt ${degCls(dg)}">${pctDeg(dg)}</td><td class="opt sum">${fmt(avg(hs.map(val).filter(fin)))}</td>
        ${hs.map((h, i) => { const x = val(h); const t = fin(x) ? Math.round(((x - mn) / sp) * 28) : 0; return `<td class="${gorunen[i] === gunSec ? 'selday' : ''}" style="background:color-mix(in srgb, var(--accent) ${t}%, transparent)">${fmt(x)}</td>`; }).join('')}</tr>`;
    }).join('')}`;
  }).join('');
  const altToplam = gorunen.map((day) => { let t = 0; for (const id of ids) t += hucre(id, day)?.tutar || 0; return `<td class="${day === gunSec ? 'selday' : ''}">${tutarKisa(t)}</td>`; }).join('');

  const kontrol = `<div class="tk-seg">${seg('rt.metrik', METRIKLER, metrik, 'Gösterim')}${seg('rt.aralik', ARALIKLAR, aralik, 'Aralık')}</div>`;
  return `<section class="ur-card" aria-labelledby="h-tk"><div class="ur-head"><h2 id="h-tk">Restoran tüketimi</h2>${chip(`Son veri ${gunKisa(last)}`, 'muted')}</div>
      ${kontrol}
      <div class="tk-top">${gunKutu}${urunKutu}</div>
      <div class="tk-wrap" tabindex="0" role="region" aria-label="Tüketim tablosu"><table class="tk-m">
        <thead><tr><th class="nm" scope="col">Ürün</th><th scope="col" class="opt">Δ dün</th><th scope="col" class="opt">Ort.</th>${basl}</tr></thead>
        <tbody>${satirlar}</tbody>
        <tfoot><tr><th class="nm" scope="row">Tutar</th><td class="opt"></td><td class="opt"></td>${altToplam}</tr></tfoot></table></div>
      <p class="ur-note">Ürün adına dokununca üstte o ürünün grafiği, gün başlığına dokununca o günün özeti açılır. Koyu zemin, ürünün kendi aralığındaki yüksek günleri gösterir. Δ dün: seçili günün bir önceki güne göre değişimi.${yedekVar ? ' * Kayıtta fiyatı olmayan ürünlerde borsa ortalama fiyatı kullanıldı.' : ''}</p></section>`;
}
