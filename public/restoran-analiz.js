// DentSimco — Restoran › Analiz: Harita, Grafik, Maliyet
//
// Hesap saf fonksiyonlardadır (Node'da sınanır); çizim HTML metni döndürür, olaylar perakende.js'te bağlanır.
//   Referans maliyet = 7200 ÷ oran: ürünün sabit taban fiyatı (borsanın Q0 fiyatına yakın).
//   Kalite adımı Q−1 → Q: o adımda ödenebilecek en fazla birim fiyat artışı = referans × K × (f(Q) − f(Q−1)). f: ürünün kalite puanı
//   (restoran-rating.js kalitePuani, içbükey); K = 15.000 ÷ (7.200 × 6): +1 rating'in eko seviye 1'de en iyi fiyatla döngü geliri
//   $15.000, ürünün döngülük referans harcaması 7.200 × kategori çarpanı, bir ürün 2-2-2 menü puanının altıda biri [ölçüm; katsayı
//   arayüzde gösterilmez]. Gerçek fiyat artışı bundan küçükse (fark ≤ 0) yükseltmek kârlıdır. Yüksek kalitede bu pay yaklaşık %2–3'tür,
//   deneyimli oyuncuların "adım başına en fazla %2–3" kuralıyla uyumlu. Doluluk %100'e dayanınca rating'in değeri düşer; bu hesapta yok.
//   Harita: ürün × kalite, her hücre Q−1 → Q fiyat artışı; renk = artış − ödenebilir pay (yüzde puan). ★ = en düşük ilanlı kaliteden
//   başlayıp pay aşılana kadar yükselen zincirin son kalitesi. Grafik: bir ürünün kaliteye göre fiyatı, eşik ve 30 günlük geçmiş.
//   Maliyet: seviye 1 restoranda her ürünün her kalitedeki döngü maliyeti.

import * as R from './hesap-restoran.js';
import * as T from './restoran-tavsiye.js';
import { kalitePuani } from './restoran-rating.js';
import { addDays } from './veri.js';
import { esc } from './esc.js';
import { urunAdi } from './urun-adlari.js';
import { num, money, seg } from './perakende-restoran.js';

const KAT = R.KATEGORILER;
export const SEKMELER = [['harita', 'Harita'], ['grafik', 'Grafik'], ['maliyet', 'Maliyet']];
export const REFERANS_BUTCE = 7200;
export const RATING_DEGERI = 15000; // eko seviye 1'de +1 rating'in döngü geliri, en iyi fiyatla [ölçüm: doluluk tablosu]
export const STANDART_CESIT = 6; // eşik 2-2-2 menüye göre: bir ürün menü puanının altıda biri
export const DEGER_KATSAYISI = RATING_DEGERI / (REFERANS_BUTCE * STANDART_CESIT);
export const KADEMELER = [0.01, 0.03, 0.08, 0.2]; // artış − pay farkı sınırları, yüzde puan olarak (0,01 = 1 puan)
export const KURAL_ADIM = 0.03; // deneyimli oyuncuların kuralı: adım başına en fazla %3 fiyat artışı
export const ARALIKLAR = [7, 14, 30];
const TIPLER = [['eko', 'Eko'], ['luks', 'Lüks (yemek ×0,5)']];

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const ad = (id) => urunAdi(id, R.URUNLER[id]?.ad) || R.URUNLER[id]?.ad || `#${id}`;
const fiyatFmt = (x) => (fin(x) ? money(x, x < 100 ? 2 : 0) : '—');
export const urunIdleri = KAT.flatMap((k) => k.urunler);
const tamSayi = (x, a, b, d) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };

// ---------------------------------------------------------------------------------------------------------------
// Kayıt (tarayıcıda saklanan seçimler)
// ---------------------------------------------------------------------------------------------------------------
export const varsayilanAnaliz = () => ({ urun: 142, q: 6, aralik: 30 });
export function temizleAnaliz(raw) {
  const s = varsayilanAnaliz();
  if (!raw || typeof raw !== 'object') return s;
  s.urun = urunIdleri.includes(Number(raw.urun)) ? Number(raw.urun) : s.urun;
  s.q = tamSayi(raw.q, 0, 12, s.q);
  s.aralik = ARALIKLAR.includes(Number(raw.aralik)) ? Number(raw.aralik) : s.aralik;
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Hesap
// ---------------------------------------------------------------------------------------------------------------
export const referans = (id) => (R.URUNLER[id] ? REFERANS_BUTCE / R.URUNLER[id].oran : null);
/** Q−1 → Q adımında ödenebilecek en fazla birim fiyat artışı ($); q 1–12 dışında null. */
export const odenebilir = (id, q) => (R.URUNLER[id] && q >= 1 && q <= 12 ? referans(id) * DEGER_KATSAYISI * (kalitePuani(q) - kalitePuani(q - 1)) : null);
/**
 * Q−1 → Q adımı: { onceki, simdi, art ($), a (önceki fiyata göre artış), pay (ödenebilir artış, önceki fiyata göre), fark (a − pay), ucuz (a ≤ %3) }.
 * Önceki ya da bu kalitede ilan yoksa null.
 */
export function adim(marketOf, id, q) {
  const o = marketOf?.(id, q - 1), s = marketOf?.(id, q), od = odenebilir(id, q);
  if (!(o > 0) || !(s > 0) || od == null) return null;
  const a = (s - o) / o, pay = od / o;
  return { onceki: o, simdi: s, art: s - o, a, pay, fark: a - pay, ucuz: a <= KURAL_ADIM + 1e-12 };
}
/** Farkın (artış − pay) renk kademesi: n (±1 puan içi), g1–g4 (payın altı, koyulaşır), r1–r4 (üstü), yok (veri yok). */
export function ton(d) {
  if (!fin(d)) return 'yok';
  const a = Math.abs(d);
  if (a < KADEMELER[0]) return 'n';
  return (d < 0 ? 'g' : 'r') + (a < KADEMELER[1] ? 1 : a < KADEMELER[2] ? 2 : a < KADEMELER[3] ? 3 : 4);
}
export const yuzde = (d) => { const r = Math.round(Math.abs(d) * 100); return r === 0 ? '%0' : `${d > 0 ? '+' : '−'}%${r}`; };
export const puan = (d) => { const r = Math.round(Math.abs(d) * 100); return r === 0 ? '0' : `${d > 0 ? '+' : '−'}${r}`; };
const pc = (x) => num(Math.abs(x) * 100, Math.abs(x) < 0.095 ? 1 : 0);
/** İlanı olan en düşük kalite; hiç ilan yoksa null. */
export function enDusukKalite(marketOf, id) {
  for (let q = 0; q <= 12; q++) if (marketOf?.(id, q) > 0) return q;
  return null;
}
/**
 * Yükseltmeye değen en yüksek kalite (★): en düşük ilanlı kaliteden başlar, her adımda fiyat artışı ödenebilir payı aşmadığı sürece yükselir,
 * ilk aşılan ya da ilansız adımda durur. İlan yoksa null.
 */
export function yukseltmeKalitesi(marketOf, id) {
  let q = enDusukKalite(marketOf, id);
  if (q == null) return null;
  while (q < 12) {
    const s = adim(marketOf, id, q + 1);
    if (!s || s.fark > 1e-12) break;
    q++;
  }
  return q;
}
/** Eşik çizgisi: en düşük ilanlı kalitenin fiyatından başlayıp her adımda ödenebilir payı ekler; q bu kaliteden küçük ya da ilan yoksa null. */
export function tavan(marketOf, id, q) {
  const q0 = enDusukKalite(marketOf, id);
  if (q0 == null || q < q0 || !R.URUNLER[id]) return null;
  return marketOf(id, q0) + referans(id) * DEGER_KATSAYISI * (kalitePuani(q) - kalitePuani(q0));
}
/** Bir kalitenin yorumu (Türkçe cümle). */
export function yorum(marketOf, id, q) {
  if (!(marketOf?.(id, q) > 0)) return 'Borsada ilan yok';
  if (q === enDusukKalite(marketOf, id)) return 'İlan bulunan en düşük kalite';
  const s = adim(marketOf, id, q);
  if (!s) return 'Bir alt kalitede ilan yok';
  const a = pc(s.a), pay = pc(s.pay);
  if (s.fark > 1e-12) return `Adım %${a}, ödenebilir pay %${pay}: yükseltmeyin`;
  return s.ucuz ? `Adım %${a} (pay %${pay}): ucuz, yükseltin` : `Adım %${a}, ödenebilir pay %${pay}: yükseltmeye değer`;
}
/** Geçmiş satırlarından (gün → {q: [açılış, yüksek, düşük, kapanış, …]}) bir kalitenin son n günü: [{ day, low, close, high }]. */
export function gecmisSeri(h, q, n) {
  if (!h?.rows || !h.today) return [];
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(h.today, -i);
    const e = h.rows.get(day)?.[q];
    if (Array.isArray(e) && fin(Number(e[3])) && Number(e[3]) > 0) out.push({ day, low: Number(e[2]) || Number(e[3]), close: Number(e[3]), high: Number(e[1]) || Number(e[3]) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Olaylar. an (seçimler) ve ui ({ kaynak, qAcik }) doğrudan değiştirilir. Dönüş: false | 'ciz' | 'git' (Grafik sekmesine geç).
// ---------------------------------------------------------------------------------------------------------------
export function analizTikla(an, ui, btn) {
  const act = btn.dataset.act || '';
  if (act === 'an.git') {
    const id = Number(btn.dataset.u), q = Number(btn.dataset.q);
    if (!urunIdleri.includes(id) || !(q >= 0 && q <= 12)) return false;
    an.urun = id; an.q = q; ui.kaynak = btn.dataset.k === 'maliyet' ? 'maliyet' : 'harita'; ui.qAcik = false;
    return 'git';
  }
  if (act === 'an.qac') { ui.qAcik = !ui.qAcik; return 'ciz'; }
  if (act === 'an.q') { const q = Number(btn.dataset.q); if (!(q >= 0 && q <= 12)) return false; an.q = q; ui.qAcik = false; return 'ciz'; }
  if (act === 'an.aralik') { const v = Number(btn.dataset.v); if (!ARALIKLAR.includes(v)) return false; an.aralik = v; return 'ciz'; }
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
.an-b { display: block; width: 100%; min-width: 56px; height: 38px; padding: 0 6px; border: 0; background: transparent; color: inherit; font: 600 13px var(--font); font-variant-numeric: tabular-nums; cursor: pointer; text-align: right; }
.an-t.t-n { background: var(--raise); color: var(--muted); }
.an-t.t-g1 { background: color-mix(in srgb, var(--up) 12%, var(--surface)); color: var(--up); }
.an-t.t-g2 { background: color-mix(in srgb, var(--up) 26%, var(--surface)); color: var(--text); }
.an-t.t-g3 { background: color-mix(in srgb, var(--up) 46%, var(--surface)); color: var(--text); font-weight: 700; }
.an-t.t-g4 { background: color-mix(in srgb, var(--up) 78%, var(--surface)); color: var(--on-accent); font-weight: 700; }
.an-t.t-r1 { background: color-mix(in srgb, var(--down) 12%, var(--surface)); color: var(--down); }
.an-t.t-r2 { background: color-mix(in srgb, var(--down) 26%, var(--surface)); color: var(--text); }
.an-t.t-r3 { background: color-mix(in srgb, var(--down) 46%, var(--surface)); color: var(--text); font-weight: 700; }
.an-t.t-r4 { background: color-mix(in srgb, var(--down) 78%, var(--surface)); color: var(--on-accent); font-weight: 700; }
.an-t.t-yok { color: var(--faint); text-align: right; padding: 0 9px !important; }
.an-t.sel { box-shadow: inset 0 0 0 2px var(--accent); }
.an-t.best .an-b { font-weight: 800; }
.an-t.ucuz .an-b::after { content: '•'; margin-left: 3px; }
.an-dot { font-style: normal; color: var(--muted); }
.an-star { font-style: normal; margin-right: 2px; color: var(--late); }
.an-t.t-g3 .an-star, .an-t.t-g4 .an-star, .an-t.t-r3 .an-star, .an-t.t-r4 .an-star { color: inherit; }
.an-b:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.an-leg { display: flex; flex-wrap: wrap; gap: 6px 12px; color: var(--muted); font-size: 12.5px; align-items: center; }
.an-sw { display: inline-block; width: 14px; height: 14px; border-radius: 3px; margin-right: 4px; vertical-align: -3px; border: 1px solid var(--line-2); }
.an-sw.t-n { background: var(--raise); }
.an-sw.t-g1 { background: color-mix(in srgb, var(--up) 12%, var(--surface)); } .an-sw.t-g2 { background: color-mix(in srgb, var(--up) 26%, var(--surface)); }
.an-sw.t-g3 { background: color-mix(in srgb, var(--up) 46%, var(--surface)); } .an-sw.t-g4 { background: color-mix(in srgb, var(--up) 78%, var(--surface)); }
.an-sw.t-r1 { background: color-mix(in srgb, var(--down) 12%, var(--surface)); } .an-sw.t-r2 { background: color-mix(in srgb, var(--down) 26%, var(--surface)); }
.an-sw.t-r3 { background: color-mix(in srgb, var(--down) 46%, var(--surface)); } .an-sw.t-r4 { background: color-mix(in srgb, var(--down) 78%, var(--surface)); }
.an-back { align-self: flex-start; min-height: 40px; padding: 0 4px; border: 0; background: none; color: var(--accent); font: 600 14px var(--font); cursor: pointer; }
.an-qt { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--raise); color: var(--text); font: 600 15px var(--font); cursor: pointer; }
.an-qt span { color: var(--muted); font-weight: 500; font-size: 13px; }
.an-qs { display: flex; flex-wrap: wrap; gap: 6px; }
.an-qs button { min-height: 40px; padding: 0 12px; border-radius: 20px; border: 1px solid var(--line-2); background: var(--raise); color: var(--text); font: 600 13px var(--font); font-variant-numeric: tabular-nums; cursor: pointer; }
.an-qs button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.an-qs button.yok { opacity: .45; }
.an-box { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 6px; }
.an-verdict { border-left: 4px solid var(--accent); background: var(--raise); border-radius: 8px; padding: 10px 12px; font-size: 14.5px; }
.an-verdict.up { border-color: var(--up); } .an-verdict.down { border-color: var(--down); }
.an-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.an-tiles div { background: var(--raise); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.an-tiles small { color: var(--muted); font-size: 12px; } .an-tiles b { font: 700 17px var(--font); font-variant-numeric: tabular-nums; }
.an-tiles .wide { grid-column: 1 / -1; } .an-tiles .wide b { font-size: 14.5px; }
.an-line { stroke: var(--accent); fill: none; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.an-esik { stroke: var(--late); fill: none; stroke-width: 2; stroke-dasharray: 6 4; }
.an-pt { fill: var(--accent); stroke: var(--surface); stroke-width: 2; cursor: pointer; }
.ur-subtabs2 { margin-top: 6px; }
.ur-subtabs2 a { background: var(--surface); min-height: 38px; }
.ur-subtabs2 a[aria-current="page"] { background: var(--tint-bg); color: var(--accent); border-color: var(--accent); }
.an-opt { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.an-opt .ur-seg { max-width: 100%; overflow-x: auto; }
`;

const ton3 = (t) => `t-${t}`;

function haritaSatirlari(an, marketOf) {
  return KAT.map((k) => `<tr class="grp"><th colspan="14" scope="colgroup">${esc(k.ad)}</th></tr>${k.urunler.map((id) => { const yildiz = yukseltmeKalitesi(marketOf, id); return `<tr><th class="nm" scope="row">${esc(ad(id))}</th>${[...Array(13).keys()].map((q) => {
    const fiyat = marketOf?.(id, q);
    if (!(fiyat > 0)) return '<td class="an-t t-yok">—</td>';
    const s = adim(marketOf, id, q);
    const sel = id === an.urun && q === an.q ? ' sel' : '';
    const y = q === yildiz;
    const metin = s ? yuzde(s.a) : fiyatFmt(fiyat);
    const baslik = s ? `${fiyatFmt(s.onceki)} → ${fiyatFmt(s.simdi)} · pay ${fiyatFmt(odenebilir(id, q))}` : fiyatFmt(fiyat);
    return `<td class="an-t ${ton3(s ? ton(s.fark) : 'n')}${sel}${y ? ' best' : ''}${s?.ucuz ? ' ucuz' : ''}"><button type="button" class="an-b" data-act="an.git" data-u="${id}" data-q="${q}" data-k="harita" title="${esc(baslik)}" aria-label="${esc(`${ad(id)} Q${q}: grafiği aç`)}">${y ? '<i class="an-star" aria-hidden="true">★</i>' : ''}${esc(metin)}</button></td>`;
  }).join('')}</tr>`; }).join('')}`).join('');
}

/** Harita sekmesi. */
export function haritaHtml(an, marketOf) {
  const bas = `<tr><th class="nm" scope="col">Ürün</th>${[...Array(13).keys()].map((q) => `<th scope="col">Q${q}</th>`).join('')}</tr>`;
  const sw = (t, text) => `<span><i class="an-sw ${t}"></i>${text}</span>`;
  const leg = sw('t-g4', '−20 puan ve altı') + sw('t-g3', '−8…20') + sw('t-g2', '−3…8') + sw('t-g1', '−1…3') + sw('t-n', '±1')
    + sw('t-r1', '+1…3') + sw('t-r2', '+3…8') + sw('t-r3', '+8…20') + sw('t-r4', '+20 ve üstü') + '<span>— ilan yok</span>'
    + '<span><i class="an-star">★</i> yükseltmeye değen en yüksek kalite</span><span><i class="an-dot">•</i> adım ≤ %3</span>';
  return `<section class="ur-card" aria-labelledby="h-an-ref"><div class="ur-head"><h2 id="h-an-ref">Referans maliyet</h2></div>
      <p class="ur-sub">Ürünün sabit taban fiyatı (Q0 civarı). Her kalite adımı için bundan ödenebilecek en fazla fiyat artışı hesaplanır; borsadaki artış bunun altındaysa o kaliteye yükselmek kârlıdır.</p></section>
    <section class="ur-card" aria-labelledby="h-an-map"><div class="ur-head"><h2 id="h-an-map">Kalite adımı haritası</h2></div>
      <p class="ur-sub">Hücre = bir alt kaliteden bu kaliteye fiyat artışı. Renk = artış − ödenebilir pay (yüzde puan): yeşil payın altı (yükseltin), kırmızı üstü. İlk ilanlı kalitede fiyatın kendisi görünür. ★ en düşük kaliteden başlayıp pay aşılana kadar yükselen zincirin sonu.</p>
      <div class="an-leg">${leg}</div>
      <div class="rt-wrap" tabindex="0" role="region" aria-label="Kalite adımı haritası"><table class="rt-m"><thead>${bas}</thead><tbody>${haritaSatirlari(an, marketOf)}</tbody></table></div>
      <p class="ur-note">Hücreye dokunun → ürünün grafiği açılır.</p></section>`;
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

// ---- Grafik sekmesi ----
function fiyatGrafigi(an, marketOf) {
  const id = an.urun;
  const W = 640, H = 280, L = 54, Rr = 14, Tp = 14, B = 30;
  const fiyat = (q) => marketOf?.(id, q);
  const ys = [];
  const tv = (q) => tavan(marketOf, id, q);
  for (let q = 0; q <= 12; q++) { if (fin(tv(q))) ys.push(tv(q)); if (fin(fiyat(q))) ys.push(fiyat(q)); }
  if (!ys.length) ys.push(1);
  const hi = Math.max(...ys) * 1.08;
  const X = (q) => L + ((W - L - Rr) * q) / 12, Yv = (v) => Tp + (H - Tp - B) * (1 - v / hi);
  let s = '';
  for (let i = 0; i <= 4; i++) { const v = (hi * i) / 4; s += `<line x1="${L}" x2="${W - Rr}" y1="${Yv(v)}" y2="${Yv(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Yv(v) + 4}" text-anchor="end">${v >= 100 ? num(v) : num(v, 1)}</text>`; }
  for (let q = 0; q <= 12; q++) s += `<text x="${X(q)}" y="${H - 10}" text-anchor="middle"${q === an.q ? ' style="fill:var(--accent);font-weight:700"' : ''}>Q${q}</text>`;
  for (let q = 0; q < 12; q++) {
    const a = fiyat(q), b = fiyat(q + 1);
    if (!fin(a) || !fin(b)) continue;
    if (!fin(tv(q)) || !fin(tv(q + 1))) continue;
    const iyi = (a + b) / 2 <= (tv(q) + tv(q + 1)) / 2;
    s += `<polygon points="${X(q)},${Yv(a)} ${X(q + 1)},${Yv(b)} ${X(q + 1)},${Yv(tv(q + 1))} ${X(q)},${Yv(tv(q))}" style="fill:color-mix(in srgb, var(--${iyi ? 'up' : 'down'}) 24%, transparent)"/>`;
  }
  const tq = [...Array(13).keys()].filter((q) => fin(tv(q)));
  if (tq.length > 1) s += `<polyline class="an-esik" points="${tq.map((q) => `${X(q)},${Yv(tv(q))}`).join(' ')}"/>`;
  let seg2 = [];
  const flush = () => { if (seg2.length > 1) s += `<polyline class="an-line" points="${seg2.join(' ')}"/>`; seg2 = []; };
  for (let q = 0; q <= 12; q++) { if (!fin(fiyat(q))) { flush(); continue; } seg2.push(`${X(q)},${Yv(fiyat(q))}`); }
  flush();
  const eniyi = yukseltmeKalitesi(marketOf, id);
  if (eniyi != null) s += `<circle cx="${X(eniyi)}" cy="${Yv(fiyat(eniyi))}" r="10" style="fill:none;stroke:var(--late);stroke-width:2.5"/>`;
  for (let q = 0; q <= 12; q++) if (fin(fiyat(q))) s += `<circle class="an-pt" cx="${X(q)}" cy="${Yv(fiyat(q))}" r="${q === an.q ? 6 : 4}" data-act="an.q" data-q="${q}"><title>Q${q}: ${esc(fiyatFmt(fiyat(q)))}</title></circle>`;
  return `<svg class="pk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kalite başına borsa fiyatı ve referans eşiği">${s}</svg>`;
}

function gecmisGrafigi(an, marketOf, h) {
  const id = an.urun, q = an.q, e = tavan(marketOf, id, q);
  const seri = gecmisSeri(h, q, an.aralik);
  if (!seri.length) return { svg: '', istat: '', bos: true };
  const bugun = marketOf?.(id, q);
  const n = seri.length + (fin(bugun) ? 1 : 0);
  const W = 640, H = 230, L = 54, Rr = 14, Tp = 14, B = 28;
  const tum = seri.flatMap((x) => [x.low, x.high]).concat(fin(e) ? [e] : [], fin(bugun) ? [bugun] : []);
  const hi = Math.max(...tum) * 1.06, lo = Math.min(...tum) * 0.94;
  const X = (i) => L + (n === 1 ? (W - L - Rr) / 2 : ((W - L - Rr) * i) / (n - 1)), Yv = (v) => Tp + (H - Tp - B) * (1 - (v - lo) / (hi - lo));
  let g = '';
  for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) * i) / 3; g += `<line x1="${L}" x2="${W - Rr}" y1="${Yv(v)}" y2="${Yv(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Yv(v) + 4}" text-anchor="end">${v >= 100 ? num(v) : num(v, 2)}</text>`; }
  const gm = (day) => `${Number(day.slice(8, 10))}.${day.slice(5, 7)}`;
  g += `<text x="${L}" y="${H - 8}">${gm(seri[0].day)}</text><text x="${W - Rr}" y="${H - 8}" text-anchor="end">${fin(bugun) ? 'bugün' : gm(seri[seri.length - 1].day)}</text>`;
  if (fin(e)) g += `<rect x="${L}" y="${Yv(e)}" width="${W - L - Rr}" height="${Math.max(0, H - B - Yv(e))}" style="fill:color-mix(in srgb, var(--up) 14%, transparent)"/>`;
  g += `<polygon points="${seri.map((x, i) => `${X(i)},${Yv(x.high)}`).join(' ')} ${[...seri].reverse().map((x, j) => `${X(seri.length - 1 - j)},${Yv(x.low)}`).join(' ')}" style="fill:color-mix(in srgb, var(--accent) 16%, transparent)"/>`;
  if (fin(e)) g += `<line class="an-esik" x1="${L}" x2="${W - Rr}" y1="${Yv(e)}" y2="${Yv(e)}"/><text x="${W - Rr}" y="${Yv(e) - 5}" text-anchor="end" style="fill:var(--late);font-weight:700">eşik ${esc(fiyatFmt(e))}</text>`;
  g += `<polyline class="an-line" points="${seri.map((x, i) => `${X(i)},${Yv(x.close)}`).join(' ')}"/>`;
  seri.forEach((x, i) => { if (fin(e) && x.close <= e) g += `<circle cx="${X(i)}" cy="${Yv(x.close)}" r="3.5" style="fill:var(--up)"/>`; });
  if (fin(bugun)) {
    const i = seri.length;
    g += `<line x1="${X(i - 1)}" y1="${Yv(seri[i - 1].close)}" x2="${X(i)}" y2="${Yv(bugun)}" stroke="var(--accent)" stroke-dasharray="3 3"/><rect x="${X(i) - 5}" y="${Yv(bugun) - 5}" width="10" height="10" transform="rotate(45 ${X(i)} ${Yv(bugun)})" style="fill:var(--surface);stroke:var(--accent);stroke-width:2.5"/>`;
  }
  const cl = seri.map((x) => x.close), mn = Math.min(...cl), mx = Math.max(...cl), av = cl.reduce((a, b) => a + b, 0) / cl.length;
  const alt = fin(e) ? cl.filter((v) => v <= e).length : 0, bd = fin(bugun) && fin(e) ? bugun / e - 1 : null;
  const chip = (t, k = '') => `<span class="ur-chip ${k}">${t}</span>`;
  const istat = chip(`en düşük ${esc(fiyatFmt(mn))}`, 'muted') + chip(`ortalama ${esc(fiyatFmt(av))}`, 'muted') + chip(`en yüksek ${esc(fiyatFmt(mx))}`, 'muted')
    + (fin(e) ? chip(`${seri.length} günün ${alt} günü eşik altında`, alt ? 'up' : 'muted') : '')
    + (bd != null ? chip(bd <= 0 ? `bugün eşiğin %${pc(bd)} altında` : `bugün eşiğin %${pc(bd)} üstünde`, bd <= 0 ? 'up' : 'down') : '');
  return { svg: `<svg class="pk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fiyat geçmişi">${g}</svg>`, istat, bos: false };
}

/**
 * Grafik sekmesi. hist: { state: 'loading' | 'ok' | 'err', h } (h = { rows, today }); ui: { kaynak, qAcik }.
 */
export function grafikHtml(an, marketOf, hist, ui = {}) {
  const id = an.urun, q = an.q, p = marketOf;
  const fiyat = p?.(id, q), st = adim(p, id, q), q0 = enDusukKalite(p, id), best = yukseltmeKalitesi(p, id);
  let karar;
  if (best == null) karar = '<div class="an-verdict">Bu ürün için borsada fiyat yok.</div>';
  else if (best === q0) karar = `<div class="an-verdict down"><b>Yükseltmeye değen kalite yok:</b> <span>Q${best} (${esc(fiyatFmt(p(id, best)))}) en düşük ilanlı kalite; bir üst adım ödenebilir payı aşıyor ya da ilansız.</span></div>`;
  else karar = `<div class="an-verdict up"><b>Yükseltmeye değen en yüksek kalite: Q${best}</b> <span>(${esc(fiyatFmt(p(id, best)))} · eşik ${esc(fiyatFmt(tavan(p, id, best)))}).</span></div>`;
  const qler = ui.qAcik ? `<div class="an-qs" id="an-qs">${[...Array(13).keys()].map((k) => { const sk = adim(p, id, k), yok = !(p?.(id, k) > 0); return `<button type="button" data-act="an.q" data-q="${k}" aria-pressed="${k === q}" class="${yok ? 'yok' : ''}">Q${k}${sk ? ` · ${esc(yuzde(sk.a))}` : ''}</button>`; }).join('')}</div>` : '';
  const secenekler = KAT.map((k) => `<optgroup label="${esc(k.ad)}">${k.urunler.map((u) => `<option value="${u}" ${u === id ? 'selected' : ''}>${esc(ad(u))}</option>`).join('')}</optgroup>`).join('');
  let gecmis;
  if (!hist || hist.state === 'loading') gecmis = '<p class="ur-note" aria-busy="true">Geçmiş yükleniyor…</p>';
  else if (hist.state === 'err') gecmis = '<p class="ur-note">Geçmiş okunamadı.</p>';
  else {
    const g = gecmisGrafigi(an, p, hist.h);
    gecmis = g.bos ? `<p class="ur-note">Q${q} için bu dönemde kayıt yok.</p>`
      : `<div class="an-box">${g.svg}</div><div class="ur-chips">${g.istat}</div><p class="ur-note">Çizgi günlük kapanış (son işlem fiyatı), gölge günün düşük–yüksek aralığı; son nokta bugünkü borsa fiyatı.</p>`;
  }
  return `<section class="ur-card" aria-labelledby="h-an-gr">
      <button type="button" class="an-back" data-act="an.geri">${ui.kaynak === 'maliyet' ? "← Maliyet'e dön" : "← Harita'ya dön"}</button>
      <div class="ur-head"><h2 id="h-an-gr">Ürün analizi</h2></div>
      <label class="ur-field"><span>Ürün</span><select data-an="urun" aria-label="Ürün">${secenekler}</select></label>
      <p class="ur-note">Referans ${esc(fiyatFmt(referans(id)))} · borsa Q0 ${esc(fiyatFmt(p?.(id, 0)))}</p>
      <button type="button" class="an-qt" data-act="an.qac" aria-expanded="${!!ui.qAcik}" aria-controls="an-qs"><b>Kalite: Q${q}</b><span>${ui.qAcik ? 'kapat ▴' : 'değiştir ▾'}</span></button>${qler}
      <div class="an-box">${fiyatGrafigi(an, p)}</div>
      <div class="an-leg"><span><b style="color:var(--accent)">●—</b> borsa fiyatı</span><span><b style="color:var(--late)">- - -</b> eşik</span><span><i class="an-sw t-g2"></i>eşiğin altı</span><span><i class="an-sw t-r2"></i>eşiğin üstü</span><span><b style="color:var(--late)">◯</b> yükseltmeye değen en yüksek kalite</span></div>
      ${karar}
      <div class="an-tiles"><div><small>Q${q} borsa</small><b>${esc(fiyatFmt(fiyat))}</b></div><div><small>Fiyat artışı</small><b>${st ? esc(yuzde(st.a)) : '—'}</b></div><div><small>Ödenebilir pay</small><b>${st ? `%${esc(pc(st.pay))}` : '—'}</b></div><div><small>Fark (puan)</small><b>${st ? esc(puan(st.fark)) : '—'}</b></div>${st ? `<div><small>Bir alt kaliteye göre</small><b>${st.art >= 0 ? '+' : '−'}${esc(fiyatFmt(Math.abs(st.art)))}</b></div>` : ''}<div class="wide"><small>Yorum</small><b>${esc(yorum(p, id, q))}</b></div></div></section>
    <section class="ur-card" aria-labelledby="h-an-gc"><div class="ur-head"><h2 id="h-an-gc">${esc(ad(id))} Q${q} · fiyat geçmişi</h2></div>
      ${seg('an.aralik', ARALIKLAR.map((n) => [n, `${n} gün`]), an.aralik, 'Dönem')}${gecmis}</section>`;
}
