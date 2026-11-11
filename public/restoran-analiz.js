// DentSimco — Restoran › Analiz: Rating, Maliyet, Menü Seç
//
// Hesap saf fonksiyonlardadır (Node'da sınanır); çizim HTML metni döndürür, olaylar perakende.js'te bağlanır.
//   Rating: kaliteye göre rating eğrisi (restoran-rating.js kalitePuani; eksi puanlar sayısız çizilir; model her üründe aynıdır, bu yüzden ürün seçimi yoktur).
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
.an-box { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 6px; }
.an-line { stroke: var(--accent); fill: none; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.an-pt { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
.pk-svg text.an-lbl { fill: var(--text); font-weight: 700; }
.an-dash { stroke-dasharray: 5 5; }
.an-neg { fill: var(--surface); stroke: var(--accent); }
.an-band { fill: var(--tint-bg); }
.pk-svg text.an-bandlbl { fill: var(--muted); font-size: 11px; }
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

// ---- Rating sekmesi: kaliteye göre rating eğrisi ----
function ratingGrafigi() {
  // Eksi kalite puanları (Q0, Q1) sayı olmadan, 0'ın altındaki "eksi" bandında gösterilir: rating 0'da sınırlı olduğu için değerleri ölçülemez.
  const W = 400, H = 250, L = 36, Rr = 14, Tp = 22, B = 28, hi = 5, lo = -1.4;
  const X = (q) => L + ((W - L - Rr) * q) / 12, Yv = (v) => Tp + (H - Tp - B) * (1 - (v - lo) / (hi - lo));
  const qs = [...Array(13).keys()], eksi = (q) => kalitePuani(q) < 0, yEksi = Yv(-0.7);
  let s = `<rect class="an-band" x="${L}" y="${Yv(0)}" width="${W - L - Rr}" height="${Yv(lo) - Yv(0)}"/><text class="an-bandlbl" x="${W - Rr - 4}" y="${Yv(lo) - 5}" text-anchor="end">eksi</text>`;
  for (let v = 0; v <= hi; v++) s += `<line x1="${L}" x2="${W - Rr}" y1="${Yv(v)}" y2="${Yv(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Yv(v) + 4}" text-anchor="end">${v}</text>`;
  for (const q of qs) s += `<text x="${X(q)}" y="${H - 8}" text-anchor="middle">Q${q}</text>`;
  const yOf = (q) => (eksi(q) ? yEksi : Yv(kalitePuani(q)));
  const ilkPozitif = qs.find((q) => !eksi(q));
  s += `<polyline class="an-line an-dash" points="${qs.filter((q) => q <= ilkPozitif).map((q) => `${X(q)},${yOf(q)}`).join(' ')}"/>`;
  s += `<polyline class="an-line" points="${qs.filter((q) => q >= ilkPozitif).map((q) => `${X(q)},${yOf(q)}`).join(' ')}"/>`;
  for (const q of qs) {
    const v = kalitePuani(q), y = yOf(q);
    s += eksi(q)
      ? `<circle class="an-pt an-neg" cx="${X(q)}" cy="${y}" r="4"><title>Q${q}: eksi</title></circle><text class="an-lbl" x="${X(q)}" y="${y - 10}" text-anchor="middle">↓</text>`
      : `<circle class="an-pt" cx="${X(q)}" cy="${y}" r="4"><title>Q${q}: ${esc(num(v, 2))}</title></circle><text class="an-lbl" x="${X(q)}" y="${y - 10}" text-anchor="middle">${esc(num(v, 1))}</text>`;
  }
  return `<svg class="pk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kaliteye göre rating">${s}</svg>`;
}

/** Rating sekmesi: kaliteye göre rating eğrisi (ürün seçimi yok). */
export function ratingHtml() {
  return `<section class="ur-card" aria-labelledby="h-an-rt"><div class="ur-head"><h2 id="h-an-rt">Rating</h2></div>
      <div class="an-box">${ratingGrafigi()}</div></section>`;
}
