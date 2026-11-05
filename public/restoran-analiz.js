// DentSimco — Restoran › Analiz: Harita, Grafik, Maliyet
//
// Hesap saf fonksiyonlardadır (Node'da sınanır); çizim HTML metni döndürür, olaylar perakende.js'te bağlanır.
//   Bu sekmeler RATING ve MALİYET gösterir, kâr göstermez: rating artışını dolara çevirmek doluluğa bağlıdır (doluluk %100'e dayanınca
//   ratingin kâra katkısı ≈ 0) ve doluluk tahminimiz oyuncu verisiyle tutmadı. Kâr ayrı bir hesap olacak.
//   Referans maliyet = 7200 ÷ oran: ürünün sabit taban fiyatı (borsanın Q0 fiyatına yakın).
//   Kalite adımı Q−1 → Q: ürünün kalite puanı artışı f(Q) − f(Q−1) (restoran-rating.js kalitePuani, içbükey; menü puanı ürünlerin ortalaması,
//   yani 6 ürünlü menüde menü ratingi bunun altıda biri kadar artar). Maliyet = fiyat artışı × ürünün seviye başı döngülük adedi (oran, 2-2-2 menü,
//   kategori çarpanı 1) ÷ menü rating artışı: "menüde +0,01 rating'in döngü başına seviye başı maliyeti".
//   Harita: ürün × kalite, her hücre bu maliyet (tek birim; ilk ilanlı kalitede "ilk", bir alt kalitesi ilansızsa "?"); renk, bu maliyetin
//   tüm adımlar arasındaki yüzdelik dilimi (ucuz yeşil, pahalı kırmızı).
//   Grafik: bir ürünün kaliteye göre borsa fiyatı, seçili adımın tek cümlelik özeti ve fiyat geçmişi. Maliyet: seviye 1 restoranda döngü maliyeti.

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
export const MENU_URUN = 6; // maliyet hesabı 2-2-2 menüye göre: bir ürünün kalite puanı menü ratinginin altıda birini oynar
export const RATING_BIRIM = 0.01; // maliyet "menüde +0,01 rating" başına
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
/** Q−1 → Q adımında ürünün kalite puanı artışı (rating puanı); q 1–12 dışında null. */
export const puanArtisi = (q) => (q >= 1 && q <= 12 ? kalitePuani(q) - kalitePuani(q - 1) : null);
/**
 * Q−1 → Q adımı: { onceki, simdi, art ($/birim), a (önceki fiyata göre artış), puan (ürün kalite puanı artışı), menu (menü rating artışı),
 * maliyet ($/döngü/seviye, menüde +0,01 rating için; fiyat düşüyorsa ≤ 0), ucuz (a ≤ %3) }. Önceki ya da bu kalitede ilan yoksa null.
 */
export function adim(marketOf, id, q) {
  const o = marketOf?.(id, q - 1), s = marketOf?.(id, q), pa = puanArtisi(q);
  if (!(o > 0) || !(s > 0) || pa == null || !R.URUNLER[id]) return null;
  const menu = pa / MENU_URUN, art = s - o;
  return { onceki: o, simdi: s, art, a: art / o, puan: pa, menu, maliyet: (art * R.URUNLER[id].oran) / (menu / RATING_BIRIM), ucuz: art / o <= KURAL_ADIM + 1e-12 };
}
/** Tüm ürün ve adımların maliyetleri (ilanı olanlar), küçükten büyüğe. */
export function maliyetSirasi(marketOf) {
  const out = [];
  for (const id of urunIdleri) for (let q = 1; q <= 12; q++) { const s = adim(marketOf, id, q); if (s) out.push(s.maliyet); }
  return out.sort((x, y) => x - y);
}
/** Bir maliyetin sıradaki yüzdelik dilimi: 0 (en ucuz) – 1 (en pahalı); eşit değerlerde ortası. */
export function yuzdelik(sira, c) {
  if (!sira?.length || !fin(c)) return null;
  let lo = 0, hi = sira.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sira[m] < c) lo = m + 1; else hi = m; }
  let h2 = lo; while (h2 < sira.length && sira[h2] <= c) h2++;
  return (lo + h2) / 2 / sira.length;
}
/** Yüzdelik dilimin renk kademesi: g4 (en ucuz %10) … g1, n (orta %40–60), r1 … r4 (en pahalı %10); veri yoksa yok. */
export function ton(p) {
  if (!fin(p)) return 'yok';
  if (p < 0.1) return 'g4'; if (p < 0.2) return 'g3'; if (p < 0.3) return 'g2'; if (p < 0.4) return 'g1';
  if (p < 0.6) return 'n';
  if (p < 0.7) return 'r1'; if (p < 0.8) return 'r2'; if (p < 0.9) return 'r3';
  return 'r4';
}
export const yuzde = (d) => { const r = Math.round(Math.abs(d) * 100); return r === 0 ? '%0' : `${d > 0 ? '+' : '−'}%${r}`; };
const pc = (x) => num(Math.abs(x) * 100, Math.abs(x) < 0.095 ? 1 : 0);
const maliyetFmt = (c) => (fin(c) ? (c <= 0 ? '$0' : money(c, c < 10 ? 2 : 0)) : '—');
/** İlanı olan en düşük kalite; hiç ilan yoksa null. */
export function enDusukKalite(marketOf, id) {
  for (let q = 0; q <= 12; q++) if (marketOf?.(id, q) > 0) return q;
  return null;
}
/** Bir kalitenin yorumu (Türkçe cümle). */
export function yorum(marketOf, id, q) {
  if (!(marketOf?.(id, q) > 0)) return 'Borsada ilan yok';
  if (q === enDusukKalite(marketOf, id)) return 'İlan bulunan en düşük kalite';
  const s = adim(marketOf, id, q);
  if (!s) return 'Bir alt kalitede ilan yok';
  const p = yuzdelik(maliyetSirasi(marketOf), s.maliyet);
  const a = pc(s.a), k = pc(p);
  if (s.art <= 0) return 'Bir alt kaliteden daha ucuz ya da aynı fiyat: rating bedava';
  return `Adım %${a}; tüm adımların %${k} kadarı bundan daha ucuz${s.ucuz ? ' (adım ≤ %3)' : ''}`;
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
.an-t.ilk .an-b { color: var(--muted); font-weight: 500; font-size: 12px; }
.an-h3 { margin: 4px 0 0; font: 600 13px var(--font); color: var(--muted); }
.an-b:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.an-leg { display: flex; flex-wrap: wrap; gap: 6px 12px; color: var(--muted); font-size: 12.5px; align-items: center; }
.an-bar { display: inline-flex; align-items: center; gap: 6px; } .an-bar > span { display: inline-flex; }
.an-sw { display: inline-block; width: 14px; height: 14px; border-radius: 3px; margin-right: 4px; vertical-align: -3px; border: 1px solid var(--line-2); }
.an-bar .an-sw { width: 16px; margin: 0; border-radius: 0; border-left-width: 0; } .an-bar .an-sw:first-child { border-radius: 3px 0 0 3px; border-left-width: 1px; } .an-bar .an-sw:last-child { border-radius: 0 3px 3px 0; }
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
.an-box .pk-svg { max-width: 560px; margin: 0 auto; } .an-box .pk-svg text { font-size: 12.5px; }
.an-verdict { border-left: 4px solid var(--accent); background: var(--raise); border-radius: 8px; padding: 10px 12px; font-size: 14.5px; }
.an-verdict.up { border-color: var(--up); } .an-verdict.down { border-color: var(--down); }
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
  const sira = maliyetSirasi(marketOf);
  return KAT.map((k) => `<tr class="grp"><th colspan="14" scope="colgroup">${esc(k.ad)}</th></tr>${k.urunler.map((id) => `<tr><th class="nm" scope="row">${esc(ad(id))}</th>${[...Array(13).keys()].map((q) => {
    const fiyat = marketOf?.(id, q);
    if (!(fiyat > 0)) return '<td class="an-t t-yok">—</td>';
    const s = adim(marketOf, id, q);
    const sel = id === an.urun && q === an.q ? ' sel' : '';
    const ilk = q === enDusukKalite(marketOf, id);
    const metin = s ? maliyetFmt(s.maliyet) : ilk ? 'ilk' : '?';
    const baslik = s ? `${fiyatFmt(s.onceki)} → ${fiyatFmt(s.simdi)} · ${yuzde(s.a)} · rating +${num(s.menu, 2)}` : `${fiyatFmt(fiyat)} · ${ilk ? 'ilan bulunan en düşük kalite' : 'bir alt kalitede ilan yok'}`;
    return `<td class="an-t ${ton3(s ? ton(yuzdelik(sira, s.maliyet)) : 'n')}${s ? '' : ' ilk'}${sel}"><button type="button" class="an-b" data-act="an.git" data-u="${id}" data-q="${q}" data-k="harita" title="${esc(baslik)}" aria-label="${esc(`${ad(id)} Q${q}: grafiği aç`)}">${esc(metin)}</button></td>`;
  }).join('')}</tr>`).join('')}`).join('');
}

/** Harita sekmesi. */
export function haritaHtml(an, marketOf) {
  const bas = `<tr><th class="nm" scope="col">Ürün</th>${[...Array(13).keys()].map((q) => `<th scope="col">Q${q}</th>`).join('')}</tr>`;
  const bar = ['t-g4', 't-g3', 't-g2', 't-g1', 't-n', 't-r1', 't-r2', 't-r3', 't-r4'].map((t) => `<i class="an-sw ${t}"></i>`).join('');
  const leg = `<span class="an-bar">ucuz <span aria-hidden="true">${bar}</span> pahalı</span>`
    + '<span><b>ilk</b> ilan bulunan en düşük kalite</span><span><b>?</b> bir alt kalitede ilan yok</span><span>— ilan yok</span>';
  return `<section class="ur-card" aria-labelledby="h-an-map"><div class="ur-head"><h2 id="h-an-map">Rating başına maliyet haritası</h2></div>
      <p class="ur-sub">Her hücre: bir alt kaliteden bu kaliteye çıkıp menüde +0,01 rating kazanmanın döngü başına maliyeti (seviye 1, 2-2-2 menü). Yeşil ucuz, kırmızı pahalı.</p>
      <div class="an-leg">${leg}</div>
      <div class="rt-wrap" tabindex="0" role="region" aria-label="Rating başına maliyet haritası"><table class="rt-m"><thead>${bas}</thead><tbody>${haritaSatirlari(an, marketOf)}</tbody></table></div>
      <p class="ur-note">Hücreye dokunun → ürünün grafiği açılır. Kâr göstermez: rating'in kâra etkisi doluluğa bağlıdır.</p></section>`;
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
function grafikIskelet(an, deger, etiket, ariaLabel, formatla) {
  const W = 420, H = 190, L = 44, Rr = 12, Tp = 12, B = 26;
  const ys = [...Array(13).keys()].map(deger).filter(fin);
  const hi = (ys.length ? Math.max(...ys) : 1) * 1.1 || 1;
  const X = (q) => L + ((W - L - Rr) * q) / 12, Yv = (v) => Tp + (H - Tp - B) * (1 - v / hi);
  let s = '';
  for (let i = 0; i <= 3; i++) { const v = (hi * i) / 3; s += `<line x1="${L}" x2="${W - Rr}" y1="${Yv(v)}" y2="${Yv(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Yv(v) + 4}" text-anchor="end">${formatla(v)}</text>`; }
  for (let q = 0; q <= 12; q++) s += `<text x="${X(q)}" y="${H - 8}" text-anchor="middle"${q === an.q ? ' style="fill:var(--accent);font-weight:700"' : ''}>Q${q}</text>`;
  let seg2 = [];
  const flush = () => { if (seg2.length > 1) s += `<polyline class="an-line" points="${seg2.join(' ')}"/>`; seg2 = []; };
  for (let q = 0; q <= 12; q++) { const v = deger(q); if (!fin(v)) { flush(); continue; } seg2.push(`${X(q)},${Yv(v)}`); }
  flush();
  for (let q = 0; q <= 12; q++) { const v = deger(q); if (fin(v)) s += `<circle class="an-pt" cx="${X(q)}" cy="${Yv(v)}" r="${q === an.q ? 6 : 4}" data-act="an.q" data-q="${q}"><title>Q${q}: ${esc(etiket(v))}</title></circle>`; }
  return `<svg class="pk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${s}</svg>`;
}
const fiyatGrafigi = (an, marketOf) => grafikIskelet(an, (q) => { const v = marketOf?.(an.urun, q); return v > 0 ? v : null; }, fiyatFmt, 'Kalite başına borsa fiyatı', (v) => (v >= 100 || v === 0 ? num(v) : num(v, 1)));

function gecmisGrafigi(an, marketOf, h) {
  const id = an.urun, q = an.q;
  const seri = gecmisSeri(h, q, an.aralik);
  if (!seri.length) return { svg: '', istat: '', bos: true };
  const bugun = marketOf?.(id, q);
  const n = seri.length + (fin(bugun) ? 1 : 0);
  const W = 420, H = 190, L = 44, Rr = 12, Tp = 12, B = 24;
  const tum = seri.flatMap((x) => [x.low, x.high]).concat(fin(bugun) ? [bugun] : []);
  const hi = Math.max(...tum) * 1.06, lo = Math.min(...tum) * 0.94;
  const X = (i) => L + (n === 1 ? (W - L - Rr) / 2 : ((W - L - Rr) * i) / (n - 1)), Yv = (v) => Tp + (H - Tp - B) * (1 - (v - lo) / (hi - lo));
  let g = '';
  for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) * i) / 3; g += `<line x1="${L}" x2="${W - Rr}" y1="${Yv(v)}" y2="${Yv(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Yv(v) + 4}" text-anchor="end">${v >= 100 ? num(v) : num(v, 2)}</text>`; }
  const gm = (day) => `${Number(day.slice(8, 10))}.${day.slice(5, 7)}`;
  g += `<text x="${L}" y="${H - 8}">${gm(seri[0].day)}</text><text x="${W - Rr}" y="${H - 8}" text-anchor="end">${fin(bugun) ? 'bugün' : gm(seri[seri.length - 1].day)}</text>`;
  g += `<polygon points="${seri.map((x, i) => `${X(i)},${Yv(x.high)}`).join(' ')} ${[...seri].reverse().map((x, j) => `${X(seri.length - 1 - j)},${Yv(x.low)}`).join(' ')}" style="fill:color-mix(in srgb, var(--accent) 16%, transparent)"/>`;
  g += `<polyline class="an-line" points="${seri.map((x, i) => `${X(i)},${Yv(x.close)}`).join(' ')}"/>`;
  if (fin(bugun)) {
    const i = seri.length;
    g += `<line x1="${X(i - 1)}" y1="${Yv(seri[i - 1].close)}" x2="${X(i)}" y2="${Yv(bugun)}" stroke="var(--accent)" stroke-dasharray="3 3"/><rect x="${X(i) - 5}" y="${Yv(bugun) - 5}" width="10" height="10" transform="rotate(45 ${X(i)} ${Yv(bugun)})" style="fill:var(--surface);stroke:var(--accent);stroke-width:2.5"/>`;
  }
  const cl = seri.map((x) => x.close), mn = Math.min(...cl), mx = Math.max(...cl), av = cl.reduce((a, b) => a + b, 0) / cl.length;
  const chip = (t, k = '') => `<span class="ur-chip ${k}">${t}</span>`;
  const istat = chip(`en düşük ${esc(fiyatFmt(mn))}`, 'muted') + chip(`ortalama ${esc(fiyatFmt(av))}`, 'muted') + chip(`en yüksek ${esc(fiyatFmt(mx))}`, 'muted');
  return { svg: `<svg class="pk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fiyat geçmişi">${g}</svg>`, istat, bos: false };
}

/**
 * Grafik sekmesi. hist: { state: 'loading' | 'ok' | 'err', h } (h = { rows, today }); ui: { kaynak, qAcik }.
 */
export function grafikHtml(an, marketOf, hist, ui = {}) {
  const id = an.urun, q = an.q, p = marketOf;
  const fiyat = p?.(id, q), st = adim(p, id, q), q0 = enDusukKalite(p, id);
  const sira = maliyetSirasi(p), yz = st ? yuzdelik(sira, st.maliyet) : null;
  let ozet;
  if (!(fiyat > 0)) ozet = '<div class="an-verdict">Bu kalitede borsada ilan yok.</div>';
  else if (!st) ozet = `<div class="an-verdict"><b>${q === q0 ? 'İlan bulunan en düşük kalite' : 'Bir alt kalitede ilan yok'}</b> <span>(${esc(fiyatFmt(fiyat))}).</span></div>`;
  else if (st.art <= 0) ozet = `<div class="an-verdict up"><b>Q${q - 1} → Q${q}: rating bedava</b> <span>(Q${q} bir alt kaliteden ucuz ya da aynı fiyat).</span></div>`;
  else ozet = `<div class="an-verdict ${yz < 0.4 ? 'up' : yz >= 0.6 ? 'down' : ''}"><b>Q${q - 1} → Q${q}: +0,01 rating ≈ ${esc(maliyetFmt(st.maliyet))} / döngü</b> <span>Fiyat ${esc(yuzde(st.a))} (+${esc(fiyatFmt(st.art))}), menü ratingi +${esc(num(st.menu, 2))}. Tüm adımların %${esc(pc(yz))} kadarı bundan ucuz.</span></div>`;
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
      <button type="button" class="an-qt" data-act="an.qac" aria-expanded="${!!ui.qAcik}" aria-controls="an-qs"><b>Kalite: Q${q}${fiyat > 0 ? ` · ${esc(fiyatFmt(fiyat))}` : ''}</b><span>${ui.qAcik ? 'kapat ▴' : 'değiştir ▾'}</span></button>${qler}
      ${ozet}
      <h3 class="an-h3">Kalitelere göre borsa fiyatı</h3><div class="an-box">${fiyatGrafigi(an, p)}</div>
      <p class="ur-note">Noktaya dokunun → o kalite seçilir.</p>
    </section>
    <section class="ur-card" aria-labelledby="h-an-gc"><div class="ur-head"><h2 id="h-an-gc">${esc(ad(id))} Q${q} · fiyat geçmişi</h2></div>
      ${seg('an.aralik', ARALIKLAR.map((n) => [n, `${n} gün`]), an.aralik, 'Dönem')}${gecmis}</section>`;
}
