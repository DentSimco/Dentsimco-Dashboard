// DentSimco — Haberler: yapay zekâ haber masasının yazdığı manşet, haberler ve köşe yazısı.
// Veri: meta/news_r{realm} (DentSimco-Bot bot/news.mjs yazar, her sabah 08:00 TR), meta/ranking_top_r{realm} (sıralama botu),
// live/r{realm} (kayan şerit için canlı fiyat). Biçimler için bot/news.mjs ve bot/ranking.mjs başına bak.
//
// Düzen (masaüstü):  [ kayan borsa şeridi                                   ]
//                    [ MANŞET (iki sütun genişliğinde, grafikli) ][ köşe     ]
//                    [ haber sütunu 1 ][ haber sütunu 2          ][ yazısı   ]
//                    [                 ][                         ][ sıralama ]
// Telefonda hepsi tek sütuna iner: şerit, manşet, haberler, köşe, sıralamalar.
// Haber metinleri Türkçe ve İngilizce gelir; seçili dile göre biri gösterilir (data-no-t: çeviri katmanı dokunmaz).

import { PATHS, readDocs, dataField, VeriHatasi, fmtPrice, fmtAgo, fmtDateTime } from './veri.js';
import { DIL, LOCALE } from './i18n.js';
import { urunAdi } from './urun-adlari.js';

const TICKER_N = 18;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Ürün adı bot belgesinde tek dilde (Türkçe) gelir; şerit ve grafik başlığı bu işlevle seçili dile çevrilir.
export const haberUrunAdi = (id, ad) => urunAdi(id, ad);
const dil = (h) => (DIL === 'en' ? h?.en : h?.tr) || h?.tr || { baslik: '', spot: '', govde: [] };

const KATEGORI_EN = { 'PİYASA': 'MARKETS', 'ÜRETİM': 'PRODUCTION', 'ŞİRKETLER': 'COMPANIES', 'EKONOMİ': 'ECONOMY', 'PERAKENDE': 'RETAIL', 'ANALİZ': 'ANALYSIS' };
const kategori = (k) => (DIL === 'en' ? KATEGORI_EN[k] || k : k);

// ---- Saf yardımcılar (sınanır) ----------------------------------------------------------------

// Kayan şerit: en çok yükselen ve en çok düşen ürünler öne alınır (biri yükselen, biri düşen sırasıyla); yetmezse
// kalan ürünler rastgele eklenir. Fiyat = canlı (ana kalite), değişim = dünkü kapanışa göre.
// fiyatlar = {id: [ad, dünküKapanış, anaKalite]} (haber belgesi), live = live belgesinin items'ı. Canlı fiyat ana kaliteden
// okunur (dünkü kapanış da o kalitenin); canlı kayıtta o kalite yoksa dünkü kapanış gösterilir, değişim boş kalır. rnd: sınama için değiştirilebilir rastgele sayı üreteci.
export function tickerItems(fiyatlar, live, n = TICKER_N, rnd = Math.random) {
  const out = [];
  for (const [id, [ad, dun, q = 0]] of Object.entries(fiyatlar || {})) {
    const canli = Number(live?.[id]?.[1]?.[q]?.[0]) || null;
    const fiyat = canli ?? (Number(dun) || null);
    if (!fiyat) continue;
    out.push({ id: Number(id), ad, q, fiyat, degisim: canli && dun > 0 ? canli / dun - 1 : null });
  }
  const up = out.filter((x) => x.degisim > 0).sort((a, b) => b.degisim - a.degisim);
  const down = out.filter((x) => x.degisim < 0).sort((a, b) => a.degisim - b.degisim);
  const rest = out.filter((x) => !(x.degisim > 0) && !(x.degisim < 0));
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const sec = [];
  for (let i = 0; sec.length < n && (i < up.length || i < down.length); i++) {
    if (i < up.length) sec.push(up[i]);
    if (sec.length < n && i < down.length) sec.push(down[i]);
  }
  return [...sec, ...rest].slice(0, n);
}

// Kapanış serisinden SVG yolu: [çizgi, alan] (viewBox 0 0 w h). Seri boş ya da tek noktaysa null.
export function sparkPaths(seri, w = 100, h = 40, pad = 2) {
  const ys = (seri || []).map((p) => Number(p?.[1])).filter((v) => Number.isFinite(v) && v > 0);
  if (ys.length < 2) return null;
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const pts = ys.map((v, i) => [round2((i / (ys.length - 1)) * w), round2(pad + (1 - (v - min) / span) * (h - 2 * pad))]);
  const line = `M${pts.map((p) => p.join(',')).join('L')}`;
  return [line, `${line}L${w},${h}L0,${h}Z`];
}
const round2 = (x) => Math.round(x * 100) / 100;

// Haberleri iki sütuna dağıtır (sırayla soldan sağa, okuma sırası korunur)
export function splitColumns(list) {
  const a = [];
  const b = [];
  (list || []).forEach((h, i) => (i % 2 ? b : a).push(h));
  return [a, b];
}

export const compactUsd = (x) => (Number.isFinite(x)
  ? `$${new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(x)}` : '—');

// ---- Görünüm ----------------------------------------------------------------------------------

const CSS = `
.nw { --nw-acc: #6cc4ff; --nw-up: #8fd4ff; --nw-dn: #9fb0c8; --nw-band: #03070d; --nw-band-text: #e6edf7; --nw-band-line: #18263b; --nw-serif: "Source Serif 4", Georgia, "Times New Roman", serif;
  max-width: 1240px; margin: 0 auto; padding: 0 20px 48px; }
:root[data-theme="light"] .nw { --nw-acc: #0a4fa8; --nw-up: #0a4fa8; --nw-dn: #6a7b96; --nw-band: #0e1b30; --nw-band-text: #f3f6fb; --nw-band-line: #22324d; }
.nw-ticker { position: relative; margin: 0 -20px; background: var(--nw-band); color: var(--nw-band-text); border-bottom: 1px solid var(--nw-band-line); overflow: hidden; height: 40px; display: flex; align-items: stretch; }
/* CANLI rozeti sabit durur; yalnız sağındaki pencere kayar. Pencere elle kaydırılamaz (dokunmatikte de), dikey sayfa kaydırma serbest. */
.nw-view { position: relative; flex: 1 1 auto; min-width: 0; overflow: hidden; display: flex; align-items: center; touch-action: pan-y; overscroll-behavior-x: none; }
.nw-view::before, .nw-view::after { content: ""; position: absolute; top: 0; bottom: 0; width: 32px; z-index: 2; pointer-events: none; }
.nw-view::before { left: 0; background: linear-gradient(90deg, var(--nw-band), transparent); }
.nw-view::after { right: 0; background: linear-gradient(-90deg, var(--nw-band), transparent); }
.nw-live { position: relative; z-index: 3; flex: none; display: flex; align-items: center; gap: 7px; height: 100%; padding: 0 14px 0 20px; background: #e10600; color: #fff; font: 600 13px/1 var(--font-c); letter-spacing: .12em; } /* yalnız CANLI rozeti: klasik canlı yayın kırmızısı */
.nw-live i { width: 7px; height: 7px; border-radius: 50%; background: #fff; animation: nw-pulse 1.6s ease-in-out infinite; }
@keyframes nw-pulse { 50% { opacity: .25; } }
.nw-track { display: flex; width: max-content; animation: nw-scroll var(--nw-dur, 60s) linear infinite; }
.nw-view:hover .nw-track { animation-play-state: paused; }
@media (hover: none) { .nw-view:hover .nw-track { animation-play-state: running; } }
@keyframes nw-scroll { to { transform: translateX(-50%); } }
.nw-tk { display: inline-flex; align-items: baseline; gap: 7px; padding: 0 18px; border-right: 1px solid var(--nw-band-line); color: inherit; text-decoration: none; white-space: nowrap; font: 500 14px var(--font-c); font-variant-numeric: tabular-nums; }
.nw-tk b { font-weight: 600; }
.nw-tk .nw-q { font-style: normal; font-size: 11.5px; padding: 1px 4px; border: 1px solid var(--nw-band-line); border-radius: 3px; color: #9fb3cf; }
.nw-tk .u { color: #3ee08f; } .nw-tk .d { color: #ff6577; } .nw-tk .f { color: #7f8ea6; } /* şeritte yükselen yeşil, düşen kırmızı (yalnız sayılar) */
/* Sitenin genel "hareketi azalt" kuralı animasyonları sıfırlar; şerit yine yavaşça kaysın (istenen davranış). */
@media (prefers-reduced-motion: reduce) { .nw .nw-track { animation-duration: calc(var(--nw-dur, 60s) * 1.5) !important; } .nw-live i { animation: none; } }

.nw-mast { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 18px 0 10px; border-bottom: 3px double var(--line-3); }
.nw-logo { font: 600 30px/1 var(--font-c); letter-spacing: -.01em; color: var(--text); }
.nw-logo span { color: var(--nw-acc); }
.nw-logo em { font-style: normal; display: inline-block; margin-left: 8px; padding: 3px 7px 2px; border: 1.5px solid currentColor; border-radius: 3px; font-size: 14px; letter-spacing: .2em; vertical-align: 6px; color: var(--muted); }
.nw-dateline { color: var(--muted); font-size: 13px; letter-spacing: .02em; text-align: right; }
.nw-dateline b { color: var(--text); font-weight: 600; }

.nw-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 300px; gap: 0 32px; padding-top: 22px; }
.nw-lead { grid-column: 1 / 3; padding-bottom: 24px; margin-bottom: 4px; border-bottom: 1px solid var(--line-2); display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 28px; align-items: start; }
.nw-col { min-width: 0; }
.nw-col + .nw-col { border-left: 1px solid var(--line); padding-left: 32px; margin-left: -1px; }
.nw-pair { grid-column: 1 / 3; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.nw-pair .nw-col:first-child { padding-right: 32px; }
.nw-flat { display: none; }
.nw-aside { grid-column: 3; grid-row: 1 / span 2; border-left: 1px solid var(--line); padding-left: 24px; display: flex; flex-direction: column; gap: 26px; }

.nw-kicker { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font: 600 12.5px/1 var(--font-c); letter-spacing: .14em; color: var(--nw-acc); text-transform: uppercase; }
.nw a.nw-h { color: var(--text); text-decoration: none; }
.nw a.nw-h:hover h2, .nw a.nw-h:hover h3, .nw a.nw-h:focus-visible h2, .nw a.nw-h:focus-visible h3 { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; text-decoration-color: var(--nw-acc); }
.nw-lead h2 { margin: 0 0 12px; font: 600 clamp(30px, 3.3vw, 46px)/1.05 var(--font-c); letter-spacing: -.015em; text-wrap: balance; }
.nw-lead .nw-spot { font-size: 18px; line-height: 1.5; color: var(--muted); margin: 0 0 12px; }
.nw-meta { color: var(--faint); font-size: 13px; }
.nw-card { padding: 16px 0; border-top: 1px solid var(--line); }
.nw-col .nw-card:first-child { border-top: 0; padding-top: 18px; }
.nw-card h3 { margin: 0 0 6px; font: 600 21px/1.18 var(--font-c); text-wrap: balance; }
.nw-card .nw-spot { margin: 0 0 8px; color: var(--muted); font-size: 15px; line-height: 1.5; }
.nw-card.big h3 { font-size: 26px; }

.nw-chart { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px 14px 10px; }
.nw-chart-h { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 8px; }
.nw-chart-h b { font: 600 15px var(--font-c); }
.nw-chart-h > span { font: 600 20px var(--font-c); font-variant-numeric: tabular-nums; white-space: nowrap; }
.nw-chart-h .nw-per { font: 500 12px var(--font); color: var(--faint); margin-right: 4px; }
.nw-chart { margin: 0; }
.nw-chart svg { display: block; width: 100%; height: 170px; }
.nw-art .nw-chart svg { height: 230px; }
.nw-chart .ln { fill: none; stroke: var(--price); stroke-width: 1.6; vector-effect: non-scaling-stroke; }
.nw-chart .ar { fill: var(--price); opacity: .12; }
.nw-chart.dn .ln { stroke: var(--nw-dn); } .nw-chart.dn .ar { fill: var(--nw-dn); }
.nw-chart-f { display: flex; justify-content: space-between; color: var(--faint); font-size: 12px; margin-top: 6px; }
.nw-spark { margin-left: auto; width: 84px; height: 22px; }
.nw-spark .ln { fill: none; stroke: var(--price); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.nw-spark.dn .ln { stroke: var(--nw-dn); }
.nw-typo { min-height: 220px; display: flex; flex-direction: column; justify-content: flex-end; padding: 18px; border-radius: 4px; background: linear-gradient(135deg, var(--raise-2), var(--surface)); border: 1px solid var(--line); }
.nw-typo b { font: 600 46px/1 var(--font-c); color: var(--nw-acc); letter-spacing: -.02em; }
.nw-typo span { color: var(--muted); font-size: 13px; letter-spacing: .1em; margin-top: 8px; }

.nw-sec { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 4px; padding-bottom: 8px; border-bottom: 2px solid var(--text); }
.nw-sec h4 { margin: 0; font: 600 18px/1.1 var(--font-c); }
.nw-sec small { color: var(--faint); font-size: 12px; }
.nw-kose { position: relative; }
.nw-kose .nw-byline { display: flex; align-items: center; gap: 10px; margin: 14px 0 10px; color: var(--muted); font-size: 13px; }
.nw-kose .nw-byline i { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--nw-acc); color: var(--surface); font: 600 15px var(--nw-serif); font-style: italic; }
.nw-kose h3 { margin: 0 0 8px; font: italic 600 23px/1.2 var(--nw-serif); }
.nw-kose p { margin: 0 0 10px; font: 400 15.5px/1.6 var(--nw-serif); color: var(--text); }
.nw-kose p:first-of-type::first-letter { float: left; font: 600 44px/.9 var(--nw-serif); padding: 5px 4px 0 0; color: var(--nw-acc); }
.nw-kose .nw-more { font: 600 14px var(--font-c); color: var(--accent); text-decoration: none; }

.nw-rank { display: block; color: var(--text); text-decoration: none; }
.nw-rank ol { list-style: none; margin: 0; padding: 0; }
.nw-rank li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 10px 0; border-bottom: 1px solid var(--line); }
.nw-rank li b { font: 600 20px/1 var(--font-c); color: var(--nw-acc); }
.nw-rank li span { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nw-rank li em { font-style: normal; font: 600 15px var(--font-c); font-variant-numeric: tabular-nums; }
.nw-rank .nw-go { display: inline-block; margin-top: 10px; font: 600 14px var(--font-c); color: var(--accent); }
.nw-rank:hover .nw-go, .nw-rank:focus-visible .nw-go { text-decoration: underline; }
.nw-rank:hover li span { color: var(--accent); }

.nw-foot { margin-top: 30px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--faint); font-size: 12.5px; }
.nw-empty { padding: 60px 0; text-align: center; color: var(--muted); }
.nw-empty h2 { font: 600 26px var(--font-c); color: var(--text); margin: 0 0 8px; }

.nw-art { max-width: 760px; margin: 0 auto; padding-top: 24px; }
.nw-back { display: inline-block; margin-bottom: 18px; color: var(--accent); text-decoration: none; font: 600 14px var(--font-c); letter-spacing: .04em; }
.nw-art h1 { margin: 0 0 14px; font: 600 clamp(32px, 5vw, 50px)/1.05 var(--font-c); letter-spacing: -.015em; text-wrap: balance; }
.nw-art .nw-spot { font-size: 20px; line-height: 1.5; color: var(--muted); margin: 0 0 14px; }
.nw-art .nw-meta { padding: 10px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); margin-bottom: 22px; }
.nw-art .nw-chart { margin: 0 0 26px; }
.nw-body p { font: 400 19px/1.7 var(--nw-serif); margin: 0 0 18px; }
.nw-art.kose h1 { font: italic 600 clamp(30px, 4.5vw, 44px)/1.15 var(--nw-serif); }
.nw-more-list { margin-top: 34px; }
.nw-more-list a { display: block; padding: 12px 0; border-top: 1px solid var(--line); color: var(--text); text-decoration: none; font: 600 18px/1.25 var(--font-c); }
.nw-more-list a:hover { color: var(--accent); }

@media (max-width: 1020px) {
  .nw-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .nw-aside { grid-column: 1 / 3; grid-row: auto; border-left: 0; padding-left: 0; border-top: 3px double var(--line-3); padding-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 26px 32px; }
}
@media (max-width: 720px) {
  .nw { padding: 0 16px 40px; }
  .nw-ticker { margin: 0 -16px; }
  .nw-live { padding-left: 16px; }
  .nw-grid, .nw-lead { grid-template-columns: minmax(0, 1fr); }
  .nw-pair { display: none; }
  .nw-flat { display: block; grid-column: 1; }
  .nw-flat .nw-card:first-child { border-top: 0; }
  .nw-lead, .nw-pair, .nw-aside { grid-column: 1; }
  .nw-lead { gap: 16px; }
  .nw-pair .nw-col:first-child { padding-right: 0; }
  .nw-col + .nw-col { border-left: 0; padding-left: 0; margin-left: 0; border-top: 1px solid var(--line); }
  .nw-col + .nw-col .nw-card:first-child { padding-top: 16px; }
  .nw-logo { font-size: 25px; }
  .nw-dateline { text-align: left; }
  .nw-body p { font-size: 18px; }
}
`;

const FONT_ID = 'nw-serif-font';
function loadSerif() {
  if (document.getElementById(FONT_ID)) return;
  const l = document.createElement('link');
  l.id = FONT_ID;
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,600&display=swap';
  document.head.append(l);
}

// Grafik serisi: günlük kapanışlar + (varsa) bugünkü canlı fiyat. Haber metnindeki "bugün" ile grafik aynı yönü gösterir.
export function chartSeries(g, today = new Date().toISOString().slice(0, 10)) {
  const seri = [...(g?.seri || [])];
  if (Number(g?.canli) > 0 && seri.length && seri.at(-1)[0] < today) seri.push([today, Number(g.canli)]);
  return seri;
}

function chartBox(g, { big = false } = {}) {
  const seri = chartSeries(g);
  const paths = g && sparkPaths(seri, 300, big ? 120 : 110);
  if (!paths) return '';
  const first = seri[0][1];
  const last = seri.at(-1)[1];
  const days = Math.round((Date.parse(`${seri.at(-1)[0]}T00:00:00Z`) - Date.parse(`${seri[0][0]}T00:00:00Z`)) / 864e5);
  const hasLive = seri.length > (g.seri || []).length;
  const ch = first > 0 ? last / first - 1 : 0;
  const fmtD = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const pctTxt = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(ch);
  return `<figure class="nw-chart ${ch < 0 ? 'dn' : ''}">
    <div class="nw-chart-h"><b><span data-no-t>${esc(haberUrunAdi(g.id, g.ad))}</span> · Q${esc(g.q)} fiyatı</b><span style="color:var(--nw-${ch < 0 ? 'dn' : 'up'})"><small class="nw-per">${days} gün</small> ${pctTxt}</span></div>
    <svg viewBox="0 0 300 ${big ? 120 : 110}" preserveAspectRatio="none" aria-hidden="true"><path class="ar" d="${paths[1]}"/><path class="ln" d="${paths[0]}"/></svg>
    <figcaption class="nw-chart-f"><span>${fmtD(seri[0][0])}</span><span>${hasLive ? `Günlük kapanış + bugün · ${fmtPrice(last)}` : `Günlük kapanış · ${fmtPrice(last)}`}</span><span>${hasLive ? 'Bugün' : fmtD(seri.at(-1)[0])}</span></figcaption>
  </figure>`;
}

function spark(g) {
  const seri = chartSeries(g);
  const paths = g && sparkPaths(seri, 84, 22);
  if (!paths) return '';
  const dn = seri.at(-1)[1] < seri[0][1];
  return `<svg class="nw-spark ${dn ? 'dn' : ''}" viewBox="0 0 84 22" preserveAspectRatio="none" aria-hidden="true"><path class="ln" d="${paths[0]}"/></svg>`;
}

const kicker = (h, extra = '') => `<div class="nw-kicker"><span data-no-t>${esc(kategori(h.kategori))}</span>${extra}</div>`;

function card(h, big) {
  const t = dil(h);
  return `<article class="nw-card ${big ? 'big' : ''}"><a class="nw-h" href="#haberler/${esc(h.id)}">${kicker(h, big ? spark(h.grafik) : '')}<h3 data-no-t>${esc(t.baslik)}</h3></a>
    ${t.spot ? `<p class="nw-spot" data-no-t>${esc(t.spot)}</p>` : ''}<div class="nw-meta">${esc(fmtAgo(h.t))}</div></article>`;
}

function rankBox({ title, href, rows, value, note }) {
  const list = (rows || []).slice(0, 3);
  return `<a class="nw-rank" href="${href}">
    <div class="nw-sec"><h4>${title}</h4><small>${note}</small></div>
    ${list.length ? `<ol>${list.map((r, i) => `<li><b>${i + 1}</b><span data-no-t>${esc(r[1])}</span><em>${value(r)}</em></li>`).join('')}</ol>`
    : '<p class="nw-meta" style="padding:10px 0">Sıralama henüz toplanmadı.</p>'}
    <span class="nw-go">Tüm sıralamayı gör →</span></a>`;
}

function viewFront(st) {
  const { news, top, live, realm } = st;
  const ticker = tickerItems(news.fiyatlar, live?.items);
  const pctF = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  const tk = ticker.map((x) => {
    const cls = x.degisim == null || Math.abs(x.degisim) < 0.0005 ? 'f' : x.degisim > 0 ? 'u' : 'd';
    const arrow = cls === 'u' ? '▲' : cls === 'd' ? '▼' : '■';
    return `<a class="nw-tk" href="#borsa" tabindex="-1"><span data-no-t>${esc(haberUrunAdi(x.id, x.ad))}</span><i class="nw-q">Q${esc(x.q)}</i><b class="${cls === 'f' ? '' : cls}">${fmtPrice(x.fiyat)}</b><span class="${cls}">${arrow} ${x.degisim == null ? '' : pctF.format(x.degisim)}</span></a>`;
  }).join('');
  const lead = news.manset;
  const lt = dil(lead);
  const [c1, c2] = splitColumns(news.haberler);
  const kose = news.kose;
  const kt = kose && dil(kose);
  const today = new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `
    ${ticker.length ? `<div class="nw-ticker" role="marquee" aria-label="Borsa şeridi"><span class="nw-live"><i></i>CANLI</span><div class="nw-view"><div class="nw-track" style="--nw-dur:${Math.max(40, ticker.length * 4.5)}s">${tk}${tk.replace(/class="nw-tk"/g, 'class="nw-tk" aria-hidden="true"')}</div></div></div>` : ''}
    <header class="nw-mast">
      <div class="nw-logo">Dent<span>Simco</span><em>NEWS</em></div>
      <div class="nw-dateline"><b>${esc(today)}</b> · R${realm + 1}<br>Son baskı ${esc(fmtDateTime(news.t))}</div>
    </header>
    <div class="nw-grid">
      <section class="nw-lead" aria-label="Manşet">
        <div><a class="nw-h" href="#haberler/${esc(lead.id)}">${kicker(lead)}<h2 data-no-t>${esc(lt.baslik)}</h2></a>
          ${lt.spot ? `<p class="nw-spot" data-no-t>${esc(lt.spot)}</p>` : ''}<div class="nw-meta">${esc(fmtAgo(lead.t))}</div></div>
        <div>${lead.grafik ? chartBox(lead.grafik) : `<div class="nw-typo"><b data-no-t>${esc(kategori(lead.kategori))}</b><span>DENTSIMCO NEWS</span></div>`}</div>
      </section>
      <div class="nw-pair">
        <div class="nw-col">${c1.map((h, i) => card(h, i === 0)).join('')}</div>
        <div class="nw-col">${c2.map((h, i) => card(h, i === 0)).join('')}</div>
      </div>
      <div class="nw-flat">${(news.haberler || []).map((h, i) => card(h, i < 2)).join('')}</div>
      <aside class="nw-aside">
        ${kose ? `<section class="nw-kose" aria-label="Köşe yazısı">
          <div class="nw-sec"><h4>Köşe Yazısı</h4><small>Yorum</small></div>
          <div class="nw-byline"><i>M</i><span><b style="color:var(--text)">Masa</b> · ${esc(fmtAgo(kose.t))}</span></div>
          <a class="nw-h" href="#haberler/${esc(kose.id)}"><h3 data-no-t>${esc(kt.baslik)}</h3></a>
          ${kt.govde.slice(0, 2).map((p) => `<p data-no-t>${esc(p)}</p>`).join('')}
          <a class="nw-more" href="#haberler/${esc(kose.id)}">Devamını oku →</a>
        </section>` : ''}
        ${rankBox({ title: 'En değerli şirketler', note: 'Şirket değeri', href: '#sirketler/value', rows: top?.deger, value: (r) => compactUsd(r[5]) })}
        ${rankBox({ title: 'En iyi EVA', note: 'Günlük değer artışı', href: '#sirketler/eva', rows: top?.eva, value: (r) => `${r[6] > 0 ? '+' : r[6] < 0 ? '−' : ''}${compactUsd(Math.abs(r[6]))}` })}
      </aside>
    </div>
    <p class="nw-foot">Haberler DentSimco verileriyle hazırlanır ve her sabah 08:00'de (TR) yenilenir. Yatırım tavsiyesi değildir; rakamları Piyasa ve Şirketler bölümlerinden doğrulayabilirsin.</p>`;
}

function viewArticle(st, id) {
  const { news } = st;
  const all = [news.manset, ...(news.haberler || [])].filter(Boolean);
  const isKose = news.kose?.id === id;
  const h = isKose ? news.kose : all.find((x) => x.id === id);
  if (!h) return `<div class="nw-art"><a class="nw-back" href="#haberler">← Haberler</a><div class="nw-empty"><h2>Haber bulunamadı</h2><p>Bu haber yeni baskıda yer almıyor olabilir.</p></div></div>`;
  const t = dil(h);
  const more = all.filter((x) => x.id !== id).slice(0, 5);
  return `<article class="nw-art ${isKose ? 'kose' : ''}">
    <a class="nw-back" href="#haberler">← Haberler</a>
    ${isKose ? '<div class="nw-kicker"><span>KÖŞE YAZISI</span></div>' : kicker(h)}
    <h1 data-no-t>${esc(t.baslik)}</h1>
    ${t.spot ? `<p class="nw-spot" data-no-t>${esc(t.spot)}</p>` : ''}
    <div class="nw-meta">${isKose ? '<b style="color:var(--text)">Masa</b> · ' : ''}${esc(fmtDateTime(h.t))}</div>
    ${h.grafik ? chartBox(h.grafik, { big: true }) : ''}
    <div class="nw-body">${t.govde.map((p) => `<p data-no-t>${esc(p)}</p>`).join('')}</div>
    ${more.length ? `<nav class="nw-more-list" aria-label="Diğer haberler"><div class="nw-sec"><h4>Diğer haberler</h4></div>${more.map((x) => `<a href="#haberler/${esc(x.id)}" data-no-t>${esc(dil(x).baslik)}</a>`).join('')}</nav>` : ''}
  </article>`;
}

async function load(realm) {
  const P = { news: PATHS.meta(`news_r${realm}`), top: PATHS.meta(`ranking_top_r${realm}`), live: PATHS.live(realm) };
  const docs = await readDocs(Object.values(P));
  return { news: dataField(docs.get(P.news)), top: dataField(docs.get(P.top)), live: dataField(docs.get(P.live)) };
}

export function mountHaberler(root, { realm: startRealm = 0 } = {}) {
  let realm = startRealm;
  let alive = true;
  let token = 0;
  let st = null;
  loadSerif();
  const style = document.createElement('style');
  style.dataset.module = 'haberler';
  style.textContent = CSS;
  document.head.append(style);
  root.innerHTML = '<div class="nw"></div>';
  const box = root.querySelector('.nw');
  const sub = () => location.hash.slice(1).split('/')[1] || '';

  function render() {
    if (!st) return;
    if (!st.news?.manset) {
      box.innerHTML = '<div class="nw-empty"><h2>İlk baskı hazırlanıyor</h2><p>Haber masası her sabah 08:00\'de (TR) yazar. İlk çalışmadan sonra haberler burada görünür.</p></div>';
      return;
    }
    const id = sub();
    box.innerHTML = id ? viewArticle(st, id) : viewFront(st);
  }

  async function reload() {
    const my = ++token;
    st = null;
    box.innerHTML = '<div class="nw-empty"><p>Haberler yükleniyor…</p></div>';
    try {
      const got = await load(realm);
      if (!alive || my !== token) return;
      st = { ...got, realm };
      render();
    } catch (e) {
      if (!alive || my !== token) return;
      box.innerHTML = `<div class="nw-empty"><h2>Haberler açılamadı</h2><p>${esc(e instanceof VeriHatasi ? e.message : 'Biraz sonra tekrar dene.')}</p></div>`;
    }
  }

  function onHash() {
    if (location.hash.slice(1).split('/')[0] !== 'haberler') return;
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', onHash);
  reload();

  return {
    setRealm(next) { if (next === realm) return; realm = next; if (sub()) { try { history.replaceState(null, '', '#haberler'); } catch { /* yok */ } } reload(); },
    destroy() { alive = false; window.removeEventListener('hashchange', onHash); style.remove(); root.replaceChildren(); },
  };
}
