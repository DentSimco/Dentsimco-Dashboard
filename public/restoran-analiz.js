// DentSimco — Restoran › Analiz: Rating, Maliyet, Menü Seç
//
// Hesap saf fonksiyonlardadır (Node'da sınanır); çizim HTML metni döndürür, olaylar perakende.js'te bağlanır.
//   Rating: kaliteye göre rating eğrisi (restoran-rating.js kalitePuani; model her üründe aynıdır, bu yüzden ürün seçimi yoktur).
//     Yalnız rating gösterir; yorum, açıklama, fiyat ve maliyet yoktur.
//   Maliyet: seviye 1 restoranda döngü maliyeti. Menü Seç: restoran-menusec.js.

import * as R from './hesap-restoran.js';
import * as T from './restoran-tavsiye.js';
import { kalitePuani } from './restoran-rating.js';
import { esc } from './esc.js';
import { urunAdi } from './urun-adlari.js';
import { num, money, seg } from './perakende-restoran.js';

export const SEKMELER = [['rating', 'Rating'], ['maliyet', 'Maliyet'], ['menusec', 'Menü Seç']];
const TIPLER = [['eko', 'Eko'], ['luks', 'Lüks (yemek ×0,5)']];
const ad = (id) => urunAdi(id, R.URUNLER[id]?.ad) || R.URUNLER[id]?.ad || `#${id}`;

export const ANALIZ_CSS = `
.an-box { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 6px; }
.an-line { stroke: var(--accent); fill: none; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.an-pt { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
.pk-svg text.an-lbl { fill: var(--text); font-weight: 700; }
.ur-subtabs2 { margin-top: 6px; }
.ur-subtabs2 a { background: var(--surface); min-height: 38px; }
.ur-subtabs2 a[aria-current="page"] { background: var(--tint-bg); color: var(--accent); border-color: var(--accent); }
.an-opt { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.an-opt .ur-seg { max-width: 100%; overflow-x: auto; }
`;

/** Maliyet sekmesi: seviye 1 restoranın döngü maliyeti. ayar: { carpan, tip } (Tavsiye ayarlarıyla ortak). */
export function maliyetHtml(ayar, marketOf) {
  const tablolar = T.maliyetTablosu(marketOf, { carpan: ayar.carpan, tip: ayar.tip });
  const bas = `<tr><th class="nm" scope="col">Ürün</th>${T.KALITELER.map((q) => `<th scope="col">Q${q}</th>`).join('')}</tr>`;
  const kartlar = tablolar.map((t) => `<section class="ur-card" aria-label="${esc(t.ad)}"><div class="ur-head"><h2>${esc(t.ad)}</h2></div>
    <div class="rt-wrap" tabindex="0" role="region" aria-label="${esc(t.ad)} maliyetleri"><table class="rt-m"><thead>${bas}</thead><tbody>${t.urunler.map((u) =>
      `<tr><th class="nm" scope="row">${esc(ad(u.id))}<small>${num(u.adet)} <span>adet</span></small></th>${u.hucre.map((h) => (h.tutar == null
        ? '<td class="yok">—</td>'
        : `<td class="${h.enUcuz ? 'low' : ''}">${esc(money(h.tutar))}</td>`)).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('');
  return `<section class="ur-card" aria-labelledby="h-an-mal"><div class="ur-head"><h2 id="h-an-mal">Maliyetler</h2></div>
      <p class="ur-sub">Seviye 1 restoranın 12 saatlik döngüde her üründen ve her kalitede yemek maliyeti. Adet = yukarı yuvarla(oran × çarpan × seviye).</p>
      <div class="an-opt"><span class="ur-note">Kategorideki ürün sayısı (tüketim çarpanı)</span>${seg('rt.carpan', T.CARPANLAR, ayar.carpan, 'Kategorideki ürün sayısı')}</div>
      <div class="an-opt"><span class="ur-note">Oturma</span>${seg('rt.tip', TIPLER, ayar.tip, 'Oturma')}</div>
      <div class="rt-legend"><span><i class="rt-sw"></i>Kategoride aynı kalitenin en düşük maliyetli ürünü</span><span>— borsada ilan yok</span></div></section>${kartlar}`;
}

// ---- Rating sekmesi: kaliteye göre rating eğrisi ----
function ratingGrafigi() {
  const W = 400, H = 230, L = 36, Rr = 14, Tp = 22, B = 28, hi = 7;
  const X = (q) => L + ((W - L - Rr) * q) / 12, Yv = (v) => Tp + (H - Tp - B) * (1 - v / hi);
  let s = '';
  for (let v = 0; v <= hi; v++) s += `<line x1="${L}" x2="${W - Rr}" y1="${Yv(v)}" y2="${Yv(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Yv(v) + 4}" text-anchor="end">${v}</text>`;
  for (let q = 0; q <= 12; q++) s += `<text x="${X(q)}" y="${H - 8}" text-anchor="middle">Q${q}</text>`;
  s += `<polyline class="an-line" points="${[...Array(13).keys()].map((q) => `${X(q)},${Yv(kalitePuani(q))}`).join(' ')}"/>`;
  for (let q = 0; q <= 12; q++) {
    const v = kalitePuani(q);
    s += `<circle class="an-pt" cx="${X(q)}" cy="${Yv(v)}" r="4"><title>Q${q}: ${esc(num(v, 2))}</title></circle><text class="an-lbl" x="${X(q)}" y="${Yv(v) - 10}" text-anchor="middle">${esc(num(v, 1))}</text>`;
  }
  return `<svg class="pk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kaliteye göre rating">${s}</svg>`;
}

/** Rating sekmesi: kaliteye göre rating eğrisi (ürün seçimi yok). */
export function ratingHtml() {
  return `<section class="ur-card" aria-labelledby="h-an-rt"><div class="ur-head"><h2 id="h-an-rt">Rating</h2></div>
      <div class="an-box">${ratingGrafigi()}</div></section>`;
}
