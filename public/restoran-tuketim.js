// DentSimco — Restoran tüketimi (arayüz parçaları)
// Botun topladığı günlük restoran satışını (meta/restaurant_r{realm} ve meta/retail_r{realm}) tablo ve grafik olarak çizer.
// Hesap yok: yalnız biçimlendirme. perakende.js Tüketimler sekmesi buradaki tuketimVerisi / tuketimHtml'i kullanır.

import { LOCALE } from './i18n.js';
import { urunAdi } from './urun-adlari.js';
import { esc } from './esc.js';

// Restoranda satılan ürünler ve oyundaki menü kategorileri (salata barı, ana yemek, içecek)
export const KATEGORILER = [
  { key: 'salata', ad: 'Salata barı', urunler: [117, 121, 134, 122, 119, 123] },
  { key: 'ana', ad: 'Ana yemek', urunler: [129, 130, 131, 142, 143, 149] },
  { key: 'icecek', ad: 'İçecek', urunler: [132, 124, 125, 126] },
];
export const URUNLER = {
  117: { ad: 'Süt', kat: 'salata' }, 121: { ad: 'Ekmek', kat: 'salata' }, 134: { ad: 'Tereyağı', kat: 'salata' },
  122: { ad: 'Peynir', kat: 'salata' }, 119: { ad: 'Kahve tozu', kat: 'salata' }, 123: { ad: 'Elmalı turta', kat: 'salata' },
  129: { ad: 'Hamburger', kat: 'ana' }, 130: { ad: 'Lazanya', kat: 'ana' }, 131: { ad: 'Köfte', kat: 'ana' },
  142: { ad: 'Salata', kat: 'ana' }, 143: { ad: 'Samosa', kat: 'ana' }, 149: { ad: 'Bal kabağı çorbası', kat: 'ana' },
  132: { ad: 'Kokteyl', kat: 'icecek' }, 124: { ad: 'Portakal suyu', kat: 'icecek' }, 125: { ad: 'Elma suyu', kat: 'icecek' },
  126: { ad: 'Zencefilli bira', kat: 'icecek' },
};

// ---- biçimlendirme ----
const NF = [0, 1, 2].map((d) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }));
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const num = (x, d = 0) => (fin(x) ? NF[d].format(x) : '—');
const ad = (id) => urunAdi(id, URUNLER[id]?.ad) || URUNLER[id]?.ad || `#${id}`;
export const chip = (text, kind = '') => `<span class="ur-chip ${kind}">${esc(text)}</span>`;
export const seg = (act, options, value, label, extra = '') => `<div class="ur-seg" role="group" aria-label="${esc(label)}">${options.map(([v, t]) =>
  `<button type="button" data-act="${act}" data-v="${esc(v)}"${extra} aria-pressed="${String(v) === String(value)}">${esc(t)}</button>`).join('')}</div>`;

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
  const katOf = (id) => URUNLER[id]?.kat;
  const order = [...KATEGORILER.flatMap((k) => k.urunler.map(String)), ...ids.filter((id) => !katOf(id))].filter((id, i, arr) => ids.includes(id) && arr.indexOf(id) === i);
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
  const satirlar = KATEGORILER.map((k) => [k.ad, k.key]).concat([['Diğer', null]]).map(([adi, key]) => {
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
