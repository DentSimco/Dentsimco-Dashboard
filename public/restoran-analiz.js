// DentSimco — Restoran › Analiz: Rating, Maliyet, Menü Seç
//
// Hesap saf fonksiyonlardadır (Node'da sınanır); çizim HTML metni döndürür, olaylar perakende.js'te bağlanır.
//   Rating: kaliteye göre kalite puanı tablosu (restoran-rating.js kalitePuani; eksi puanlar sayısız, 'eksi' yazılır; model her üründe aynıdır, bu yüzden ürün seçimi yoktur).
//     Yalnız rating gösterir; yorum, açıklama, fiyat ve maliyet yoktur.
//   Maliyet: seviye 1 restoranda döngü maliyeti. Menü Seç: restoran-menusec.js.

import * as R from './hesap-restoran.js';
import * as T from './restoran-tavsiye.js';
import { kalitePuani } from './restoran-rating.js';
import { esc } from './esc.js';
import { urunAdi } from './urun-adlari.js';
import { num, money, seg } from './perakende-restoran.js';

export const SEKMELER = [['rating', 'Rating'], ['maliyet', 'Maliyet'], ['menusec', 'Menü Seç'], ['isi', 'Isı Haritası']];
const TIPLER = [['eko', 'Eko'], ['luks', 'Lüks (yemek ×0,5)']];
const ad = (id) => urunAdi(id, R.URUNLER[id]?.ad) || R.URUNLER[id]?.ad || `#${id}`;

export const ANALIZ_CSS = `
.an-rt { max-width: 320px; }
.an-rt td.an-eksi { color: var(--muted); font-style: italic; }
.ur-subtabs2 { margin-top: 6px; }
.ur-subtabs2 a { background: var(--surface); min-height: 38px; }
.ur-subtabs2 a[aria-current="page"] { background: var(--tint-bg); color: var(--accent); border-color: var(--accent); }
@media (max-width: 420px) { .ur-subtabs2 a { font-size: 14px; padding: 0 2px; } }
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

// ---- Rating sekmesi: kaliteye göre kalite puanı tablosu ----
// Eksi kalite puanları (Q0, Q1) sayı olmadan "eksi" yazılır: rating 0'da sınırlı olduğu için değerleri ölçülemez.
function ratingTablosu() {
  const satir = [...Array(13).keys()].map((q) => {
    const v = kalitePuani(q);
    return `<tr><th class="nm" scope="row">Q${q}</th>${v < 0 ? '<td class="an-eksi">eksi</td>' : `<td>${esc(num(v, 2))}</td>`}</tr>`;
  }).join('');
  return `<div class="rt-wrap" tabindex="0" role="region" aria-label="Kaliteye göre rating"><table class="rt-m an-rt"><thead><tr><th class="nm" scope="col">Kalite</th><th scope="col">Kalite puanı</th></tr></thead><tbody>${satir}</tbody></table></div>`;
}

/** Rating sekmesi: kaliteye göre kalite puanı tablosu (ürün seçimi yok). */
export function ratingHtml() {
  return `<section class="ur-card" aria-labelledby="h-an-rt"><div class="ur-head"><h2 id="h-an-rt">Rating</h2></div>
      ${ratingTablosu()}</section>`;
}
