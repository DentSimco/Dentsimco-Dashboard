// DentSimco — Restoran › Analiz: Harita, Grafik, Maliyet, Menü Seç
//
// Hesap saf fonksiyonlardadır (Node'da sınanır); çizim HTML metni döndürür, olaylar perakende.js'te bağlanır.
//   Harita ve Grafik YALNIZ RATING gösterir; yorum, açıklama, fiyat ve maliyet yoktur.
//   Harita: ürün × kalite, hücre = ürünün o kalitedeki kalite (rating) puanı (restoran-rating.js kalitePuani); borsada ilan yoksa "—".
//     Renk koyulaştıkça rating yüksek. Hücreye dokunmak ürünün Grafik'ini açar.
//   Grafik: bir ürünün kaliteye göre rating eğrisi; ilanı olmayan kaliteler çizilmez.
//   Maliyet: seviye 1 restoranda döngü maliyeti. Menü Seç: restoran-menusec.js.

import * as R from './hesap-restoran.js';
import * as T from './restoran-tavsiye.js';
import { kalitePuani } from './restoran-rating.js';
import { esc } from './esc.js';
import { urunAdi } from './urun-adlari.js';
import { num, money, seg } from './perakende-restoran.js';

const KAT = R.KATEGORILER;
export const SEKMELER = [['harita', 'Harita'], ['grafik', 'Grafik'], ['maliyet', 'Maliyet'], ['menusec', 'Menü Seç']];
const TIPLER = [['eko', 'Eko'], ['luks', 'Lüks (yemek ×0,5)']];

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const ad = (id) => urunAdi(id, R.URUNLER[id]?.ad) || R.URUNLER[id]?.ad || `#${id}`;
export const urunIdleri = KAT.flatMap((k) => k.urunler);
const tamSayi = (x, a, b, d) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };

// ---------------------------------------------------------------------------------------------------------------
// Kayıt (tarayıcıda saklanan seçimler)
// ---------------------------------------------------------------------------------------------------------------
export const varsayilanAnaliz = () => ({ urun: 142, q: 6 });
export function temizleAnaliz(raw) {
  const s = varsayilanAnaliz();
  if (!raw || typeof raw !== 'object') return s;
  s.urun = urunIdleri.includes(Number(raw.urun)) ? Number(raw.urun) : s.urun;
  s.q = tamSayi(raw.q, 0, 12, s.q);
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Hesap
// ---------------------------------------------------------------------------------------------------------------
/** Ürünün q kalitesindeki rating puanı; borsada ilan yoksa null. */
export const ratingOf = (marketOf, id, q) => (R.URUNLER[id] && marketOf?.(id, q) > 0 ? kalitePuani(q) : null);
/** Rating renk kademesi: h1 (düşük) … h5 (yüksek); veri yoksa yok. */
export function ton(v) {
  if (!fin(v)) return 'yok';
  return v < 2 ? 'h1' : v < 3.5 ? 'h2' : v < 4.8 ? 'h3' : v < 5.6 ? 'h4' : 'h5';
}

// ---------------------------------------------------------------------------------------------------------------
// Olaylar. an (seçimler) ve ui ({ kaynak }) doğrudan değiştirilir. Dönüş: false | 'ciz' | 'git' (Grafik sekmesine geç).
// ---------------------------------------------------------------------------------------------------------------
export function analizTikla(an, ui, btn) {
  const act = btn.dataset.act || '';
  if (act === 'an.git') {
    const id = Number(btn.dataset.u), q = Number(btn.dataset.q);
    if (!urunIdleri.includes(id) || !(q >= 0 && q <= 12)) return false;
    an.urun = id; an.q = q; ui.kaynak = btn.dataset.k === 'maliyet' ? 'maliyet' : 'harita';
    return 'git';
  }
  return false;
}
export function analizDegis(an, el) {
  if (el.dataset?.an !== 'urun') return false;
  const id = Number(el.value);
  if (!urunIdleri.includes(id)) return false;
  an.urun = id;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------------------------------------------
export const ANALIZ_CSS = `
.an-t { padding: 0 !important; }
.an-b { display: block; width: 100%; min-width: 52px; height: 38px; padding: 0 8px; border: 0; background: transparent; color: inherit; font: 600 13px var(--font); font-variant-numeric: tabular-nums; cursor: pointer; text-align: right; }
.an-t.h1 { background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
.an-t.h2 { background: color-mix(in srgb, var(--accent) 16%, var(--surface)); }
.an-t.h3 { background: color-mix(in srgb, var(--accent) 30%, var(--surface)); }
.an-t.h4 { background: color-mix(in srgb, var(--accent) 48%, var(--surface)); }
.an-t.h5 { background: color-mix(in srgb, var(--accent) 70%, var(--surface)); color: var(--on-accent); font-weight: 700; }
.an-t.sel { box-shadow: inset 0 0 0 2px var(--accent); }
.an-b:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.an-back { align-self: flex-start; min-height: 40px; padding: 0 4px; border: 0; background: none; color: var(--accent); font: 600 14px var(--font); cursor: pointer; }
.an-h3 { margin: 4px 0 0; font: 600 13px var(--font); color: var(--muted); }
.an-box { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 6px; }
.an-line { stroke: var(--accent); fill: none; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.an-pt { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
.pk-svg text.an-lbl { fill: var(--text); font-weight: 700; }
.pk-svg text.an-sel { fill: var(--accent); font-weight: 700; }
.ur-subtabs2 { margin-top: 6px; }
.ur-subtabs2 a { background: var(--surface); min-height: 38px; }
.ur-subtabs2 a[aria-current="page"] { background: var(--tint-bg); color: var(--accent); border-color: var(--accent); }
.an-opt { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.an-opt .ur-seg { max-width: 100%; overflow-x: auto; }
`;

function haritaSatirlari(an, marketOf) {
  return KAT.map((k) => `<tr class="grp"><th colspan="14" scope="colgroup">${esc(k.ad)}</th></tr>${k.urunler.map((id) => `<tr><th class="nm" scope="row">${esc(ad(id))}</th>${[...Array(13).keys()].map((q) => {
    const r = ratingOf(marketOf, id, q);
    if (r == null) return '<td class="yok">—</td>';
    const sel = id === an.urun && q === an.q ? ' sel' : '';
    return `<td class="an-t ${ton(r)}${sel}"><button type="button" class="an-b" data-act="an.git" data-u="${id}" data-q="${q}" data-k="harita" aria-label="${esc(`${ad(id)} Q${q}: rating ${num(r, 2)}`)}">${esc(num(r, 2))}</button></td>`;
  }).join('')}</tr>`).join('')}`).join('');
}

/** Harita sekmesi: yalnız rating. */
export function haritaHtml(an, marketOf) {
  const bas = `<tr><th class="nm" scope="col">Ürün</th>${[...Array(13).keys()].map((q) => `<th scope="col">Q${q}</th>`).join('')}</tr>`;
  return `<section class="ur-card" aria-labelledby="h-an-map"><div class="ur-head"><h2 id="h-an-map">Rating haritası</h2></div>
      <div class="rt-wrap" tabindex="0" role="region" aria-label="Rating haritası"><table class="rt-m"><thead>${bas}</thead><tbody>${haritaSatirlari(an, marketOf)}</tbody></table></div></section>`;
}

/** Maliyet sekmesi: seviye 1 restoranın döngü maliyeti; hücreye dokunmak Grafik'e götürür. ayar: { carpan, tip } (Tavsiye ayarlarıyla ortak). */
export function maliyetHtml(ayar, marketOf) {
  const tablolar = T.maliyetTablosu(marketOf, { carpan: ayar.carpan, tip: ayar.tip });
  const bas = `<tr><th class="nm" scope="col">Ürün</th>${T.KALITELER.map((q) => `<th scope="col">Q${q}</th>`).join('')}</tr>`;
  const kartlar = tablolar.map((t) => `<section class="ur-card" aria-label="${esc(t.ad)}"><div class="ur-head"><h2>${esc(t.ad)}</h2></div>
    <div class="rt-wrap" tabindex="0" role="region" aria-label="${esc(t.ad)} maliyetleri"><table class="rt-m"><thead>${bas}</thead><tbody>${t.urunler.map((u) =>
      `<tr><th class="nm" scope="row">${esc(ad(u.id))}<small>${num(u.adet)} <span>adet</span></small></th>${u.hucre.map((h) => (h.tutar == null
        ? '<td class="yok">—</td>'
        : `<td class="an-t${h.enUcuz ? ' low' : ''}"><button type="button" class="an-b" data-act="an.git" data-u="${u.id}" data-q="${h.kalite}" data-k="maliyet" aria-label="${esc(`${ad(u.id)} Q${h.kalite}: grafiği aç`)}">${esc(money(h.tutar))}</button></td>`)).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('');
  return `<section class="ur-card" aria-labelledby="h-an-mal"><div class="ur-head"><h2 id="h-an-mal">Maliyetler</h2></div>
      <p class="ur-sub">Seviye 1 restoranın 12 saatlik döngüde her üründen ve her kalitede yemek maliyeti. Adet = yukarı yuvarla(oran × çarpan × seviye).</p>
      <div class="an-opt"><span class="ur-note">Kategorideki ürün sayısı (tüketim çarpanı)</span>${seg('rt.carpan', T.CARPANLAR, ayar.carpan, 'Kategorideki ürün sayısı')}</div>
      <div class="an-opt"><span class="ur-note">Oturma</span>${seg('rt.tip', TIPLER, ayar.tip, 'Oturma')}</div>
      <div class="rt-legend"><span><i class="rt-sw"></i>Kategoride aynı kalitenin en düşük maliyetli ürünü</span><span>— borsada ilan yok</span></div>
      <p class="ur-note">Hücreye dokunun → ürünün grafiği açılır.</p></section>${kartlar}`;
}

// ---- Grafik sekmesi: yalnız rating ----
function ratingGrafigi(an, marketOf) {
  const W = 400, H = 230, L = 36, Rr = 14, Tp = 22, B = 28, hi = 7;
  const X = (q) => L + ((W - L - Rr) * q) / 12, Yv = (v) => Tp + (H - Tp - B) * (1 - v / hi);
  const deger = (q) => ratingOf(marketOf, an.urun, q);
  let s = '';
  for (let v = 0; v <= hi; v++) s += `<line x1="${L}" x2="${W - Rr}" y1="${Yv(v)}" y2="${Yv(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Yv(v) + 4}" text-anchor="end">${v}</text>`;
  for (let q = 0; q <= 12; q++) s += `<text x="${X(q)}" y="${H - 8}" text-anchor="middle"${q === an.q ? ' class="an-sel"' : ''}>Q${q}</text>`;
  let pts = [];
  const flush = () => { if (pts.length > 1) s += `<polyline class="an-line" points="${pts.join(' ')}"/>`; pts = []; };
  for (let q = 0; q <= 12; q++) { const v = deger(q); if (v == null) { flush(); continue; } pts.push(`${X(q)},${Yv(v)}`); }
  flush();
  for (let q = 0; q <= 12; q++) {
    const v = deger(q);
    if (v != null) s += `<circle class="an-pt" cx="${X(q)}" cy="${Yv(v)}" r="${q === an.q ? 6 : 4}"><title>Q${q}: ${esc(num(v, 2))}</title></circle><text class="an-lbl" x="${X(q)}" y="${Yv(v) - 10}" text-anchor="middle">${esc(num(v, 1))}</text>`;
  }
  return `<svg class="pk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kaliteye göre rating">${s}</svg>`;
}

/** Grafik sekmesi: ürün seçici ve kaliteye göre rating. ui: { kaynak }. */
export function grafikHtml(an, marketOf, ui = {}) {
  const secenekler = KAT.map((k) => `<optgroup label="${esc(k.ad)}">${k.urunler.map((u) => `<option value="${u}" ${u === an.urun ? 'selected' : ''}>${esc(ad(u))}</option>`).join('')}</optgroup>`).join('');
  return `<section class="ur-card" aria-label="Grafik">
      <button type="button" class="an-back" data-act="an.geri">${ui.kaynak === 'maliyet' ? "← Maliyet'e dön" : "← Harita'ya dön"}</button>
      <label class="ur-field"><span>Ürün</span><select data-an="urun" aria-label="Ürün">${secenekler}</select></label>
      <h3 class="an-h3">Rating</h3><div class="an-box">${ratingGrafigi(an, marketOf)}</div></section>`;
}
