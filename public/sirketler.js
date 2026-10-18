// DentSimco — Şirketler: Sıralama | Kıyas | Liste. Sıralama: Simcotools şirket sıralamasının tamamı (bot günde bir kez yazar).
// Şirkete dokununca ayrıntı penceresinde son 30 günün grafiği ve gün gün tablosu açılır (sirket-gecmis.js; bot günde bir ekler).
// Kıyas: en çok 5 şirketin geçmişi aynı grafikte. Liste: bu tarayıcıda tutulan izleme listeleri (sirket-liste.js).
// Veri: meta/ranking_r{realm} (index) + meta/ranking_r{realm}_c{NN} (parçalar). Biçim için bot/ranking.mjs başına bak.
//   satır = [id, ad, sıra, sıraFarkı, evaSırası (1 en iyi, 0 yok), değer, değerFarkı, değerYüzde, bina, patent, işçi, bono, ayrıntıVar]
// "Sıra" ayrı bir ölçüt değildir: Simcotools sırası şirket değerine göredir (Şirket değeri ölçütüyle aynı).
// Ad ve işçi ölçüt değildir; işçi tabloda da yok, yalnız ayrıntı panelinde görünür.

import { PATHS, readDocs, dataField, VeriHatasi } from './veri.js';
import { LOCALE } from './i18n.js';
import * as G from './sirket-gecmis.js';
import * as Li from './sirket-liste.js';
import * as Gr from './gruplar.js';
import { esc } from './esc.js';

const PAGE = 50;

// Sıralama ölçütleri: [anahtar, başlık, satırdaki sütun, varsayılan yön, ayrıntı gerekir mi]
export const SIRALAMA = [
  ['value', 'Şirket değeri', 5, -1, false],
  ['valueDiff', 'Değer değişimi', 6, -1, false],
  ['valuePct', 'Değer değişimi %', 7, -1, false],
  ['eva', 'EVA sırası', 4, 1, true],
  ['buildings', 'Bina değeri', 8, -1, true],
  ['patents', 'Patent değeri', 9, -1, true],
  ['bonds', 'Satılan bono', 11, -1, true],
];

// EVA sırasında 1 en iyidir (en çok değer katan); 0 = Simcotools'ta EVA yok (ayrıntısı gelmemiş sayılır).
export const ayrintiVar = (row, key) => row[12] === 1 && (key !== 'eva' || row[4] > 0);

// rows'u değiştirmez. dir: 1 artan, -1 azalan. Ayrıntısı henüz gelmemiş şirketler ayrıntı ölçütlerinde hep sonda kalır.
export function sirala(rows, key, dir = 1) {
  const spec = SIRALAMA.find((s) => s[0] === key) || SIRALAMA[0];
  const col = spec[2];
  const needsDetail = spec[4];
  return [...rows].sort((a, b) => {
    if (needsDetail) {
      const ma = ayrintiVar(a, spec[0]);
      const mb = ayrintiVar(b, spec[0]);
      if (ma !== mb) return ma ? -1 : 1;
    }
    return ((a[col] - b[col]) * dir) || (a[2] - b[2]);
  });
}

// Ad içinde arar (büyük/küçük harf ve Türkçe harfler fark etmez); sayı yazılırsa şirket numarası da eşleşir.
export function ara(rows, query) {
  const q = String(query ?? '').trim().toLocaleLowerCase('tr');
  if (!q) return rows;
  return rows.filter((r) => r[1].toLocaleLowerCase('tr').includes(q) || (/^\d+$/.test(q) && String(r[0]) === q));
}

const NUM = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const usd = (x) => `$${NUM.format(x)}`;
const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + (x === 0 ? '0' : NUM.format(Math.abs(x)));
const tone = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');

// Numarayla şirketi bulur (liste değişmez); yoksa null.
export const sirketBul = (rows, id) => rows.find((r) => String(r[0]) === String(id)) || null;

// Detay panelindeki satırlar: [etiket, metin, ton]. Ayrıntısı henüz gelmemiş şirkette (r[12] = 0) o satırlar "—" olur.
export function detaySatirlari(r) {
  const d = r[12] === 1;
  const dim = (v) => (d ? v : '—');
  return [
    ['Sıra', `${NUM.format(r[2])}${r[3] ? ` (${r[3] > 0 ? '▲' : '▼'}${NUM.format(Math.abs(r[3]))})` : ''}`, tone(r[3])],
    ['EVA sırası', r[4] > 0 ? dim(NUM.format(r[4])) : '—', ''],
    ['Şirket değeri', usd(r[5]), ''],
    ['Günlük değişim', signed(r[6]), tone(r[6])],
    ['Günlük değişim %', r[7] ? PCT.format(r[7]) : '0%', tone(r[7])],
    ['Bina değeri', dim(usd(r[8])), ''],
    ['Patent değeri', dim(usd(r[9])), ''],
    ['İşçi', dim(NUM.format(r[10] / 100)), ''],
    ['Satılan bono', dim(usd(r[11])), ''],
  ];
}

// Adres: #sirketler (Sıralama) | #sirketler/{ölçüt} (Sıralama, o ölçütle; haber sayfası bağlantıları) | #sirketler/kiyas[/id,id,...] | #sirketler/liste
//   Gruplar: #sirketler/gruplar[/uyeler[/grupId] | /siralama]; Şirketler (şirket sıralaması): #sirketler/siralama
export function sirketlerRota(hash) {
  const p = String(hash ?? '').replace(/^#/, '').split('/');
  const r = { tab: 'siralama', key: null, ids: [], galt: 'uyeler', grup: null };
  if (p[0] !== 'sirketler') return r;
  if (p[1] === 'kiyas') return { ...r, tab: 'kiyas', ids: [...new Set(String(p[2] ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, Li.KIYAS_MAX) };
  if (p[1] === 'liste') return { ...r, tab: 'liste' };
  if (p[1] === 'gruplar') {
    let grup = null;
    try { grup = p[3] ? decodeURIComponent(p[3]) : null; } catch { grup = null; }
    return { ...r, tab: 'gruplar', galt: p[2] === 'siralama' ? 'siralama' : 'uyeler', grup };
  }
  const spec = SIRALAMA.find((s) => s[0] === p[1]);
  return { ...r, key: spec ? spec[0] : null };
}
export const SEKMELER = [['siralama', 'Şirketler'], ['gruplar', 'Gruplar'], ['kiyas', 'Kıyas'], ['liste', 'Liste']];

const CSS = G.GRAFIK_CSS + `
.sk-body { display: flex; flex-direction: column; gap: 12px; }
.sk-body > * { min-width: 0; }
.sk-gtab { width: 100%; }
.sk-gtab td, .sk-gtab th { padding: 9px 8px; font-size: 14px; }
.sk-gtab td.l:nth-child(2) { white-space: normal; min-width: 110px; }
.sk-gtab td:nth-child(3) { white-space: nowrap; text-align: right; }
.sk-sub { display: flex; flex-wrap: wrap; gap: 6px; }
.sk-sub a { display: inline-flex; align-items: center; min-height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line-2); color: var(--muted); font: 600 14px var(--font-c); text-decoration: none; }
.sk-sub a[aria-current="page"] { color: var(--accent); border-color: var(--accent); background: var(--raise); }
.sk-card { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.sk-card h2 { margin: 0; font: 600 17px var(--font-c); }
.sk-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.sk-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 10px; border: 1px solid var(--line-2); border-radius: 999px; background: var(--raise); color: var(--text); font: 600 14px var(--font); }
.sk-chip button { all: unset; cursor: pointer; padding: 4px; color: var(--muted); }
.sk-chip i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.sk-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.sk-seg button, .sk-act { min-height: 40px; padding: 0 12px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--raise); color: var(--muted); font: 600 14px var(--font); cursor: pointer; }
.sk-seg button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.sk-act.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.sk-act.danger { color: var(--down-text, var(--down)); }
a.sk-act { display: inline-flex; align-items: center; text-decoration: none; }
a.sk-act[aria-current="page"] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.sk-act:disabled { opacity: .45; cursor: default; }
.sk-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.sk-row select, .sk-row input[type=text], .sk-row input[type=search] { height: 40px; padding: 0 10px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--surface); color: var(--text); min-width: 0; }
.sk-row input { flex: 1 1 160px; }
.sk-find { position: relative; flex: 1 1 220px; }
.sk-find input { width: 100%; box-sizing: border-box; }
.sk-hits { margin-top: 4px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--surface); overflow: hidden; }
.sk-hits:empty { display: none; }
.sk-hits button { display: flex; width: 100%; justify-content: space-between; gap: 10px; min-height: 40px; align-items: center; padding: 0 12px; border: 0; border-bottom: 1px solid var(--row-line); background: transparent; color: var(--text); text-align: left; font: 500 15px var(--font); cursor: pointer; }
.sk-hits button:last-child { border-bottom: 0; }
.sk-hits button small { color: var(--muted); }
.sk-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 14px; color: var(--text); }
.sk-legend i { width: 18px; height: 3px; border-radius: 2px; display: inline-block; margin-right: 7px; vertical-align: middle; }
.sk-gt th, .sk-gt td { padding: 7px 9px; font-size: 14px; }
.sk-gt td.d { font-size: 13px; }
.sk-ok { color: var(--up); font-size: 14px; }
.sk-panel.wide { max-width: 820px; }
.sk-det { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 0 12px; }
.sk-det summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; font: 600 15px var(--font-c); }
.sk-det[open] summary { border-bottom: 1px solid var(--row-line); margin-bottom: 10px; }
.sk-det .sk-wrap { margin-bottom: 8px; }
.sk-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 8px; }
`;

const CSS_ESKI = `
.sk { max-width: 1100px; margin: 0 auto; padding: 8px 14px 40px; display: flex; flex-direction: column; gap: 12px; }
.sk h1 { font: 600 22px/1.2 var(--font-c); margin: 0; }
.sk-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.sk-bar label { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 14px; }
.sk-bar select, .sk-bar input[type=search], .sk-dir { height: 40px; padding: 0 10px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--surface); color: var(--text); }
.sk-bar input[type=search] { flex: 1 1 180px; min-width: 0; }
.sk-dir { font-weight: 600; min-width: 40px; }
.sk-note { color: var(--muted); font-size: 14px; }
.sk-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.sk table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.sk th, .sk td { padding: 9px 10px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--row-line); }
.sk th { position: sticky; top: 0; background: var(--raise); color: var(--muted); font: 600 13px var(--font-c); letter-spacing: .03em; user-select: none; }
.sk th[data-k] { cursor: pointer; }
.sk th[aria-sort] { color: var(--accent); }
.sk th:first-child, .sk td:first-child, .sk th.l, .sk td.l { text-align: left; }
.sk tbody tr:hover { background: var(--hover); }
.sk .up { color: var(--up); }
.sk .down { color: var(--down); }
.sk .dim { color: var(--faint); }
.sk tbody tr[data-id] { cursor: pointer; }
.sk tbody tr[data-id]:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.sk-id { display: block; color: var(--faint); font-size: 12px; font-weight: 500; letter-spacing: .02em; }
.sk-sheet { position: fixed; inset: 0; z-index: 50; background: var(--overlay); display: flex; align-items: flex-end; justify-content: center; }
.sk-panel { background: var(--surface); border: 1px solid var(--line-2); border-bottom: 0; border-radius: 20px 20px 0 0; width: 100%; max-width: 560px; max-height: calc(100dvh - 24px);
  overflow: auto; overscroll-behavior: contain; padding: 16px 16px calc(20px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; }
@media (min-width: 740px) { .sk-sheet { align-items: center; } .sk-panel { border-radius: 20px; border-bottom: 1px solid var(--line-2); } }
.sk-panel-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 10px; }
.sk-head-main { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; min-width: 0; }
.sk-head-act { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sk-head-act select { height: 40px; padding: 0 10px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--surface); color: var(--text); min-width: 0; max-width: 220px; }
.sk-head-act a.sk-act { display: inline-flex; align-items: center; text-decoration: none; }
.sk-panel-head h2 { flex: 0 1 auto; min-width: 0; margin: 0; font: 600 20px/1.25 var(--font-c); overflow-wrap: anywhere; }
.sk-btn { min-height: 44px; min-width: 44px; padding: 0 14px; border: 1px solid var(--line-2); border-radius: 12px; background: var(--raise); color: var(--text); font: 600 15px var(--font); }
.sk-idrow { display: flex; align-items: center; gap: 10px; justify-content: space-between; background: var(--raise); border: 1px solid var(--line-2); border-radius: 12px; padding: 8px 8px 8px 12px; }
.sk-idrow span { color: var(--muted); font-size: 14px; }
.sk-idrow b { font: 600 20px var(--font-c); font-variant-numeric: tabular-nums; }
.sk-kv { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; border-bottom: 1px solid var(--row-line); }
.sk-kv:last-child { border-bottom: 0; }
.sk-kv > span:first-child { color: var(--muted); font-size: 15px; }
.sk-kv > span:last-child { font-weight: 600; font-size: 16px; font-variant-numeric: tabular-nums; text-align: right; }
.sk-pager { display: flex; gap: 8px; align-items: center; justify-content: center; }
.sk-pager button { height: 40px; padding: 0 14px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--surface); font-weight: 600; }
.sk-pager button:disabled { opacity: .4; }
.sk-panel .sk-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.sk-panel table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.sk-panel th, .sk-panel td { padding: 7px 9px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--row-line); font-size: 14px; }
.sk-panel th { background: var(--raise); color: var(--muted); font: 600 13px var(--font-c); position: sticky; top: 0; }
.sk-panel th.l, .sk-panel td.l { text-align: left; }
.sk-panel .up { color: var(--up); }
.sk-panel .down { color: var(--down); }
.sk-panel .dim { color: var(--faint); }
.sk-panel td.d { font-size: 13px; }
.sk-panel a { color: var(--accent); }
`;
const CSS_TUMU = CSS + CSS_ESKI;

async function yukle(realm) {
  const idx = dataField((await readDocs([PATHS.meta(`ranking_r${realm}`)])).get(PATHS.meta(`ranking_r${realm}`)));
  if (!idx?.chunks) return null;
  const paths = Array.from({ length: idx.chunks }, (_, i) => PATHS.meta(`ranking_r${realm}_c${String(i).padStart(2, '0')}`));
  const docs = await readDocs(paths);
  const rows = [];
  for (const p of paths) {
    const part = dataField(docs.get(p));
    if (!Array.isArray(part)) throw new VeriHatasi('Şirket listesi eksik geldi. Biraz sonra tekrar dene.');
    for (const r of part) rows.push(r);
  }
  return { rows, date: idx.date, t: idx.t };
}

const sayiMetni = (x) => NUM.format(x);
const farkMetni = (x) => (x == null ? '' : signed(x));

// Satır (Sıralama ve Liste tabloları aynı biçimi kullanır)
function satirHtml(r, ekstra = '', onek = '') {
  const d = r[12] === 1;
  const dim = (v) => (d ? v : '<span class="dim">—</span>');
  return `<tr data-id="${esc(r[0])}" tabindex="0" role="button" aria-label="${esc(r[1])}, ID ${esc(r[0])}">${onek}<td>${NUM.format(r[2])} <span class="${tone(r[3])}">${r[3] ? (r[3] > 0 ? '▲' : '▼') + Math.abs(r[3]) : ''}</span></td>
    <td class="l">${esc(r[1])}<span class="sk-id">ID ${esc(r[0])}</span></td><td>${usd(r[5])}</td>
    <td class="${tone(r[6])}">${signed(r[6])}</td><td class="${tone(r[7])}">${r[7] ? PCT.format(r[7]) : '0%'}</td>
    <td>${r[4] > 0 ? dim(NUM.format(r[4])) : '<span class="dim">—</span>'}</td><td>${dim(usd(r[8]))}</td><td>${dim(usd(r[9]))}</td><td>${dim(usd(r[11]))}</td>${ekstra}</tr>`;
}
const TABLO_BASLIK = [['Sıra', null, 'l'], ['Şirket', null, 'l'], ['Şirket değeri', 'value'], ['Değişim', 'valueDiff'], ['%', 'valuePct'],
  ['EVA sırası', 'eva'], ['Bina değeri', 'buildings'], ['Patent değeri', 'patents'], ['Bono', 'bonds']];

// Ayrıntı penceresindeki gün gün tablo (yeniden eskiye, Simcotools gibi)
export function gecmisTablosuHtml(days) {
  const f = G.gunFarklari(days).reverse();
  const hucre = (v, fm) => (v == null ? '<span class="dim">—</span>' : fm(v));
  const fark = (x, goster = (v) => signed(v)) => (x == null ? '<td class="d"></td>' : `<td class="d ${tone(x)}">${goster(x)}</td>`);
  return `<div class="sk-wrap"><table class="sk-gt"><thead><tr><th class="l">Tarih</th><th>Sıra</th><th>Fark</th><th>EVA sırası</th><th>Fark</th><th>Şirket değeri</th><th>Fark</th><th>%</th>
    <th>Bina değeri</th><th>Patent değeri</th><th>İşçi</th><th>Satılan bono</th></tr></thead><tbody>${f.map((x) => `<tr><td class="l">${esc(G.gunMetni(x.gun, { day: 'numeric', month: 'short', year: 'numeric' }))}</td>
    <td>${hucre(x.sira, sayiMetni)}</td>${fark(x.siraFark)}<td>${hucre(x.eva, sayiMetni)}</td>${fark(x.evaFark)}<td>${usd(x.deger)}</td>${fark(x.degerFark)}
    <td class="d ${tone(x.degerYuzde)}">${x.degerYuzde == null ? '' : x.degerYuzde ? PCT.format(x.degerYuzde) : '0%'}</td><td>${hucre(x.bina, usd)}</td><td>${hucre(x.patent, usd)}</td><td>${hucre(x.isci, sayiMetni)}</td><td>${hucre(x.bono, usd)}</td></tr>`).join('')}</tbody></table></div>`;
}

const grafikAdi = (m, ad) => `${ad} · ${m.ad} · son ${G.GUN_SAYISI} gün`;
const metrikSecici = (act, secili) => `<div class="sk-seg" role="group" aria-label="Ölçüt">${G.METRIKLER.map((m) => `<button type="button" data-${act}="${m.key}" aria-pressed="${m.key === secili}">${m.ad}</button>`).join('')}</div>`;
const metrikBul = (key) => G.METRIKLER.find((m) => m.key === key) || G.METRIKLER[0];
const GECMIS_YOK = ''; // geçmişi olmayan şirkette grafik bölümü boş kalır (uyarı gösterilmez)

export function mountSirketler(root, { realm: startRealm = 0 } = {}) {
  let realm = startRealm;
  let alive = true;
  let token = 0;
  let data = null;
  const state = { key: 'value', dir: -1, q: '', page: 1, listeId: null };
  let tab = 'siralama';
  let galt = 'uyeler'; // Gruplar altında: 'uyeler' | 'siralama'
  let grupId = null; // Üyeler'de seçili grup
  let grupGecmis = null; // Gruplar › Sıralama grafiği: Map(şirketNo → gün listesi)
  let grupMod = 'deger'; // 'deger' | 'yuzde'
  let grupToken = 0;
  let kiyas = { ids: [], metrik: 'value', mod: 'deger', gecmis: null, yukleniyor: false };
  let kiyasToken = 0;
  let listeler = Li.oku(realm);
  let formu = null; // Liste sekmesi: { tur: 'yeni' | 'ad' } | { tur: 'sil' } | null
  let view = []; // süzülmüş + sıralanmış liste
  let sheet = null; // açık detay paneli: { id, metrik, gecmis }

  const style = document.createElement('style');
  style.dataset.module = 'sirketler';
  style.textContent = CSS_TUMU;
  document.head.append(style);
  // Şirketler bölümleri: Piyasa ve Kâr Hesaplayıcı gibi sayfanın üstündeki genel alt şerit (modül dışında, root'tan önce)
  const subnav = document.createElement('nav');
  subnav.className = 'subnav on';
  subnav.id = 'subnav-sirketler';
  subnav.setAttribute('aria-label', 'Şirketler bölümleri');
  subnav.innerHTML = SEKMELER.map(([k, t]) => `<a href="#sirketler/${k}" data-sub="${k}">${t}</a>`).join('');
  root.before(subnav);
  const subnavBoya = () => { for (const a of subnav.querySelectorAll('a')) { if (a.dataset.sub === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); } };
  root.innerHTML = '<div class="sk"></div>';
  const box = root.querySelector('.sk');
  const kaydet = (next) => { listeler = next; Li.yaz(realm, listeler); };

  // ---- adres ----
  function rotayiOku() {
    const x = sirketlerRota(location.hash);
    tab = x.tab; galt = x.galt;
    if (x.tab === 'gruplar' && x.grup) grupId = x.grup;
    if (x.key) { state.key = x.key; state.dir = SIRALAMA.find((s) => s[0] === x.key)[3]; state.page = 1; }
    if (x.tab === 'kiyas' && x.ids.length) { kiyas = { ...kiyas, ids: x.ids, gecmis: null }; }
  }
  rotayiOku();
  subnavBoya();
  function onHash() {
    if (location.hash.slice(1).split('/')[0] !== 'sirketler') return;
    closeSheet();
    rotayiOku();
    subnavBoya();
    if (data) ciz();
  }
  window.addEventListener('hashchange', onHash);

  // ---- iskelet ----
  function ciz() {
    if (!data) return;
    subnavBoya();
    box.innerHTML = `<h1>Şirketler</h1><div class="sk-body"></div>`;
    if (tab === 'kiyas') kiyasCiz();
    else if (tab === 'liste') listeCiz();
    else if (tab === 'gruplar') gruplarCiz();
    else { siralamaIskelet(); paint(); }
  }
  const govde = () => box.querySelector('.sk-body');

  // ---- Sıralama ----
  function siralamaIskelet() {
    const liste = state.listeId ? listeler.listeler.find((l) => l.id === state.listeId) : null;
    govde().innerHTML = `
      <div class="sk-bar">
        <label>Sırala <select id="sk-key" aria-label="Sıralama ölçütü">${SIRALAMA.map(([k, t]) => `<option value="${k}" ${k === state.key ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <button type="button" class="sk-dir" id="sk-dir" aria-label="Sıralama yönü"></button>
        <input type="search" id="sk-q" placeholder="Şirket ara" aria-label="Şirket ara" value="${esc(state.q)}" autocomplete="off">
      </div>
      ${liste ? `<div class="sk-chips"><span class="sk-chip">Liste: ${esc(liste.ad)} <button type="button" data-liste-temizle aria-label="Liste süzgecini kaldır">✕</button></span></div>` : ''}
      <p class="sk-note" id="sk-note"></p>
      <div class="sk-wrap"><table><thead></thead><tbody></tbody></table></div>
      <div class="sk-pager"></div>`;
    box.querySelector('#sk-key').addEventListener('change', (e) => {
      state.key = e.target.value;
      state.dir = SIRALAMA.find((s) => s[0] === state.key)[3];
      state.page = 1;
      paint();
    });
    box.querySelector('#sk-dir').addEventListener('click', () => { state.dir = -state.dir; state.page = 1; paint(); });
    box.querySelector('#sk-q').addEventListener('input', (e) => { state.q = e.target.value; state.page = 1; paint(); });
  }

  function paint() {
    if (!data || tab !== 'siralama') return;
    const liste = state.listeId ? listeler.listeler.find((l) => l.id === state.listeId) : null;
    const kaynak = liste ? data.rows.filter((r) => liste.idler.includes(r[0])) : data.rows;
    view = sirala(ara(kaynak, state.q), state.key, state.dir);
    const pages = Math.max(1, Math.ceil(view.length / PAGE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const from = (state.page - 1) * PAGE;
    box.querySelector('thead').innerHTML = `<tr>${TABLO_BASLIK.map(([t, k, c]) => `<th${k ? ` data-k="${k}"` : ''} class="${c || ''}" ${k && k === state.key ? `aria-sort="${state.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${t}</th>`).join('')}</tr>`;
    box.querySelector('tbody').innerHTML = view.slice(from, from + PAGE).map((r) => satirHtml(r)).join('') || '<tr><td colspan="9" class="l dim">Eşleşen şirket yok.</td></tr>';
    box.querySelector('#sk-dir').textContent = state.dir > 0 ? '↑' : '↓';
    box.querySelector('#sk-note').textContent = `${NUM.format(view.length)} şirket · Veri: Simcotools · ${data.date ? new Date(data.date).toLocaleDateString(LOCALE, { timeZone: 'UTC' }) : ''}. Ayrıntıları (EVA, bina, patent, bono) henüz gelmemiş şirketlerde "—" görünür. Ayrıntı ve son 30 günün grafiği için şirkete dokunun.`;
    box.querySelector('.sk-pager').innerHTML = `<button type="button" data-p="-1" ${state.page <= 1 ? 'disabled' : ''}>‹ Önceki</button><span>${state.page} / ${pages}</span><button type="button" data-p="1" ${state.page >= pages ? 'disabled' : ''}>Sonraki ›</button>`;
  }

  // ---- Gruplar (public/gruplar.js; grup değeri = üyelerin şirket değerleri toplamı) ----
  function gruplarCiz() {
    const liste = Gr.grupDegerleri(data.rows, Gr.GRUPLAR, realm);
    const alt = (href, t, on) => `<a href="${href}" ${on ? 'aria-current="page"' : ''}>${t}</a>`;
    const sec = grupId && liste.some((g) => g.id === grupId) ? grupId : liste[0]?.id;
    const hrefU = (id) => `#sirketler/gruplar/uyeler/${encodeURIComponent(id)}`;
    let body;
    if (!liste.length) body = '<p class="sk-note">Bu realm için henüz grup tanımlanmadı.</p>';
    else if (galt === 'siralama') {
      const sirali = Gr.grupSirala(liste);
      body = `<div class="sk-wrap"><table class="sk-gtab"><thead><tr><th class="l">Sıra</th><th class="l">Grup</th><th>Toplam değer · değişim</th></tr></thead><tbody>${sirali.map((g, i) => `<tr><td class="l">${NUM.format(i + 1)}</td>
        <td class="l"><i class="sk-dot" style="background:${grupRenk(liste, g)}"></i><a href="${hrefU(g.id)}">${esc(g.ad)}</a><span class="sk-id">${NUM.format(g.bulunan)}${g.eksik.length ? ` / ${NUM.format(g.uyeSayisi)}` : ''} üye</span></td>
        <td>${usd(g.toplam)}<span class="sk-id ${tone(g.fark)}">${signed(g.fark)} · ${g.yuzde ? PCT.format(g.yuzde) : '0%'}</span></td></tr>`).join('')}</tbody></table></div>
        <section class="sk-card" data-grup-grafik aria-live="polite"></section>
        <p class="sk-note">Grup değeri, üyelerinin şirket değerlerinin toplamıdır. Gruplar resmi değildir. Grup adına dokunun: üyeleri görün. Üye eksiği varsa grup liderleri Feedback üzerinden iletişime geçebilir.</p>`;
    } else {
      const g = liste.find((x) => x.id === sec);
      const uyeler = sirala(g.uyeler, 'value', -1);
      body = `<div class="sk-row"><select data-grup-sec aria-label="Grup seç">${liste.map((x) => `<option value="${esc(x.id)}" ${x.id === sec ? 'selected' : ''}>${esc(x.ad)}</option>`).join('')}</select></div>
        <p class="sk-note">${esc(g.ad)} · ${NUM.format(g.bulunan)} üye · Toplam değer ${usd(g.toplam)} (${signed(g.fark)})${g.eksik.length ? ` · Sıralamada bulunamayan şirket numarası: ${g.eksik.map((x) => esc(x)).join(', ')}` : ''}</p>
        <p class="sk-note">#: grup içindeki sıra · Sıra: şirket sıralamasındaki yer.</p>
        <div class="sk-wrap"><table><thead><tr><th class="l" title="Grup içindeki sıra">#</th>${TABLO_BASLIK.map(([t, , c]) => `<th class="${c || ''}"${t === 'Sıra' ? ' title="Şirket sıralamasındaki yer"' : ''}>${t}</th>`).join('')}</tr></thead><tbody>${uyeler.map((r, i) => satirHtml(r, '', `<td class="l">${NUM.format(i + 1)}</td>`)).join('') || '<tr><td colspan="10" class="l dim">Üye yok.</td></tr>'}</tbody></table></div>`;
    }
    govde().innerHTML = `<nav class="sk-sub" aria-label="Grup bölümleri">${alt(sec ? hrefU(sec) : '#sirketler/gruplar/uyeler', 'Üyeler', galt === 'uyeler')}${alt('#sirketler/gruplar/siralama', 'Sıralama', galt === 'siralama')}</nav>${body}`;
    if (liste.length && galt === 'siralama') grupGrafik(liste);
  }

  // Grup rengi tanım sırasına bağlıdır (sıralama değişince renk değişmez); tablo ve grafik aynı rengi kullanır
  const grupRenk = (liste, g) => G.RENKLER[liste.findIndex((x) => x.id === g.id) % G.RENKLER.length];

  // Grupların toplam değeri, son 30 günün şirket geçmişlerinin gün gün toplamıdır (üyelerin geçmişi gerekir; ağır olduğundan arka planda yüklenir).
  async function grupGrafik(liste) {
    const kutu = box.querySelector('[data-grup-grafik]');
    if (!kutu) return;
    if (!grupGecmis) {
      const my = ++grupToken;
      kutu.innerHTML = '<p class="sk-note">Grafik için geçmiş yükleniyor…</p>';
      try {
        const g = await G.gecmisYukle(realm, liste.flatMap((x) => x.uyeler.map((r) => r[0])));
        if (!alive || my !== grupToken) return;
        grupGecmis = g;
      } catch {
        if (!alive || my !== grupToken) return;
        kutu.innerHTML = '<p class="sk-note">Grafik için geçmiş açılamadı. Biraz sonra tekrar deneyin.</p>';
        return;
      }
    }
    const m = metrikBul('value');
    const yuzde = grupMod === 'yuzde';
    const seriler = Gr.grupSirala(liste).map((g) => {
      const h = Gr.grupGecmisi(g.uyeler.map((r) => r[0]), grupGecmis);
      return { ad: g.ad, renk: grupRenk(liste, g), gecmissiz: h.gecmissiz, noktalar: yuzde ? G.yuzdeNoktalari(h.noktalar) : h.noktalar };
    });
    const grafik = seriler.every((s) => s.noktalar.length < 2) ? GECMIS_YOK : G.cizgiGrafik(seriler, {
      bicim: yuzde ? (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : (v) => G.eksenMetni(m, v), oku: yuzde ? (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : (v) => G.degerMetni(m, v), ad: `Grup toplam değeri · son ${G.GUN_SAYISI} gün`,
    });
    const eksik = seriler.filter((s) => s.gecmissiz > 0);
    kutu.innerHTML = `<h2>Toplam değer · son 30 gün</h2>
      <div class="sk-seg" role="group" aria-label="Gösterim"><button type="button" data-grup-mod="deger" aria-pressed="${!yuzde}">Değer</button><button type="button" data-grup-mod="yuzde" aria-pressed="${yuzde}">İlk güne göre %</button></div>
      ${grafik}
      <div class="sk-legend">${seriler.map((s) => `<span><i style="background:${s.renk}"></i>${esc(s.ad)}</span>`).join('')}</div>
      <p class="sk-note">Toplam, üyelerin o günkü şirket değerlerinin toplamıdır; geçmişi eksik günler gösterilmez.</p>${eksik.length ? `<p class="sk-note">${`Geçmişi henüz olmayan şirketler toplama girmez: ${eksik.map((s) => `${esc(s.ad)} (${s.gecmissiz})`).join(', ')}`}</p>` : ''}`;
    kutu.querySelectorAll('.sg-kutu').forEach(G.grafikBagla);
  }

  // ---- Ortak: şirket arama kutusu ----
  const aramaKutusu = (yer) => `<div class="sk-find"><input type="search" data-sq="${yer}" placeholder="Şirket adı ya da numarası ara" aria-label="Şirket ara" autocomplete="off"><div class="sk-hits" data-sr="${yer}"></div></div>`;
  function sonuclariCiz(kutu) {
    const q = kutu.value.trim();
    const hedef = kutu.parentElement.querySelector('[data-sr]');
    if (q.length < 2 && !/^\d+$/.test(q)) { hedef.innerHTML = ''; return; }
    hedef.innerHTML = ara(data.rows, q).slice(0, 8).map((r) => `<button type="button" data-pick="${r[0]}">${esc(r[1])}<small>${usd(r[5])} · ID ${r[0]}</small></button>`).join('') || '<button type="button" disabled>Eşleşen şirket yok</button>';
  }
  const adOf = (id) => sirketBul(data.rows, id)?.[1] || `#${id}`;

  // ---- Kıyas ----
  function kiyasAdres() { try { history.replaceState(null, '', `#sirketler/kiyas${kiyas.ids.length ? `/${kiyas.ids.join(',')}` : ''}`); } catch { /* önemsiz */ } }
  function kiyasDegis(ids) {
    kiyas = { ...kiyas, ids: [...new Set(ids)].slice(0, Li.KIYAS_MAX), gecmis: null };
    kiyasAdres();
    kiyasCiz();
  }
  function kiyasCiz() {
    const aktif = Li.aktifListe(listeler);
    govde().innerHTML = `
      <section class="sk-card" aria-labelledby="sk-kh"><h2 id="sk-kh">Şirketleri kıyasla</h2>
        <p class="sk-note">En çok ${Li.KIYAS_MAX} şirket seçin; son ${G.GUN_SAYISI} günün geçmişi aynı grafikte görünür.</p>
        <div class="sk-chips" data-kiyas-chips>${kiyas.ids.map((id, i) => `<span class="sk-chip"><i style="background:${G.RENKLER[i % G.RENKLER.length]}"></i>${esc(adOf(id))} <button type="button" data-kiyas-cikar="${id}" aria-label="${esc(adOf(id))} çıkar">✕</button></span>`).join('') || '<span class="sk-note">Henüz şirket seçilmedi.</span>'}</div>
        <div class="sk-row">${kiyas.ids.length < Li.KIYAS_MAX ? aramaKutusu('kiyas') : ''}
          ${aktif && aktif.idler.length ? `<button type="button" class="sk-act" data-kiyas-liste>Listeden al: ${esc(aktif.ad)}</button>` : ''}</div>
      </section>
      <section class="sk-card" data-kiyas-sonuc aria-live="polite"></section>`;
    kiyasSonuc();
  }
  async function kiyasSonuc() {
    const kutu = box.querySelector('[data-kiyas-sonuc]');
    if (!kutu) return;
    if (!kiyas.ids.length) { kutu.innerHTML = '<p class="sk-note">Kıyaslamak için yukarıdan şirket ekleyin ya da Liste sekmesinden bir listeyi kıyaslayın.</p>'; return; }
    if (!kiyas.gecmis) {
      const my = ++kiyasToken;
      kutu.innerHTML = '<p class="sk-note">Geçmiş yükleniyor…</p>';
      try {
        const g = await G.gecmisYukle(realm, kiyas.ids);
        if (!alive || my !== kiyasToken) return;
        kiyas.gecmis = g;
      } catch {
        if (!alive || my !== kiyasToken) return;
        kutu.innerHTML = '<p class="sk-note">Geçmiş açılamadı. Biraz sonra tekrar deneyin.</p>';
        return;
      }
    }
    const m = metrikBul(kiyas.metrik);
    const yuzde = kiyas.mod === 'yuzde';
    const seriler = kiyas.ids.map((id, i) => {
      const n = G.seriNoktalari(kiyas.gecmis.get(id) || [], m);
      return { ad: adOf(id), renk: G.RENKLER[i % G.RENKLER.length], noktalar: yuzde ? G.yuzdeNoktalari(n) : n };
    });
    const bos = seriler.every((s) => s.noktalar.every(([, v]) => v == null));
    const grafik = bos ? GECMIS_YOK : G.cizgiGrafik(seriler, {
      bicim: yuzde ? (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : (v) => G.eksenMetni(m, v), oku: yuzde ? (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : (v) => G.degerMetni(m, v), ters: m.tur === 'sira' && !yuzde, ad: grafikAdi(m, 'Kıyas'),
    });
    const satir = (id, i) => {
      const r = sirketBul(data.rows, id);
      const n = G.seriNoktalari(kiyas.gecmis.get(id) || [], m).filter(([, v]) => v != null);
      const ilk = n[0]?.[1]; const son = n.at(-1)?.[1];
      const degisim = ilk && son != null && n.length > 1 ? (son - ilk) / Math.abs(ilk) : null;
      return `<tr data-id="${id}" tabindex="0" role="button"><td class="l"><i class="sk-dot" style="background:${G.RENKLER[i % G.RENKLER.length]}"></i>${esc(adOf(id))}<span class="sk-id">ID ${id}</span></td>
        <td>${r ? sayiMetni(r[2]) : '—'}</td><td>${r ? usd(r[5]) : '—'}</td><td>${G.degerMetni(m, son)}</td><td class="${m.tur === 'sira' ? tone(-(degisim ?? 0)) : tone(degisim)}">${degisim == null ? '—' : degisim ? PCT.format(degisim) : '0%'}</td></tr>`;
    };
    kutu.innerHTML = `${metrikSecici('kiyas-metrik', kiyas.metrik)}
      <div class="sk-seg" role="group" aria-label="Gösterim"><button type="button" data-kiyas-mod="deger" aria-pressed="${!yuzde}">Değer</button><button type="button" data-kiyas-mod="yuzde" aria-pressed="${yuzde}">İlk güne göre %</button></div>
      ${grafik}
      <div class="sk-legend">${seriler.map((s) => `<span><i style="background:${s.renk}"></i>${esc(s.ad)}</span>`).join('')}</div>
      <div class="sk-wrap"><table><thead><tr><th class="l">Şirket</th><th>Sıra</th><th>Şirket değeri</th><th>${esc(m.ad)}</th><th>${G.GUN_SAYISI} gün değişimi</th></tr></thead><tbody>${kiyas.ids.map(satir).join('')}</tbody></table></div>
      <p class="sk-note">${esc(`Geçmiş en çok ${G.GUN_SAYISI} gündür; bot her gün ekler.`)} Şirketin ayrıntısı için satıra dokunun.</p>`;
    kutu.querySelectorAll('.sg-kutu').forEach(G.grafikBagla);
  }

  // ---- Liste ----
  function listeCiz() {
    const aktif = Li.aktifListe(listeler);
    const secenekler = listeler.listeler.map((l) => `<option value="${esc(l.id)}" ${l.id === listeler.aktif ? 'selected' : ''}>${esc(l.ad)} (${l.idler.length})</option>`).join('');
    const form = formu?.tur === 'yeni' || formu?.tur === 'ad'
      ? `<div class="sk-row"><input type="text" data-liste-ad maxlength="${Li.AD_MAX}" placeholder="Liste adı" aria-label="Liste adı" value="${formu.tur === 'ad' ? esc(aktif?.ad) : ''}"><button type="button" class="sk-act primary" data-liste-kaydet>${formu.tur === 'ad' ? 'Kaydet' : 'Oluştur'}</button><button type="button" class="sk-act" data-liste-iptal>Vazgeç</button></div>`
      : formu?.tur === 'sil'
        ? `<div class="sk-row"><span class="sk-note">${esc(`"${aktif?.ad}" listesi silinecek. Emin misiniz?`)}</span><button type="button" class="sk-act danger" data-liste-sil-onay>Evet, sil</button><button type="button" class="sk-act" data-liste-iptal>Vazgeç</button></div>` : '';
    const satirlar = aktif ? aktif.idler.map((id) => { const r = sirketBul(data.rows, id); return r ? satirHtml(r, `<td><button type="button" class="sk-act" data-liste-cikar="${id}" aria-label="${esc(r[1])} listeden çıkar">✕</button></td>`)
      : `<tr><td colspan="9" class="l dim">#${id} (sıralamada yok)</td><td><button type="button" class="sk-act" data-liste-cikar="${id}" aria-label="Listeden çıkar">✕</button></td></tr>`; }).join('') : '';
    govde().innerHTML = `
      <section class="sk-card" aria-labelledby="sk-lh"><h2 id="sk-lh">İzleme listeleri</h2>
        <p class="sk-note">Listeler bu tarayıcıda saklanır (R${realm + 1} için ayrı); başka cihazda görünmez.</p>
        <div class="sk-row">${listeler.listeler.length ? `<select data-liste-sec aria-label="Liste seç">${secenekler}</select>` : ''}
          <button type="button" class="sk-act" data-liste-yeni ${listeler.listeler.length >= Li.LISTE_MAX ? 'disabled' : ''}>Yeni liste</button>
          ${aktif ? '<button type="button" class="sk-act" data-liste-adlandir>Adı değiştir</button><button type="button" class="sk-act danger" data-liste-sil>Sil</button>' : ''}</div>
        ${form}
        ${!listeler.listeler.length && !form ? '<p class="sk-note">Henüz liste yok. "Yeni liste" ile başlayın.</p>' : ''}
      </section>
      ${aktif ? `<section class="sk-card"><h2>${esc(aktif.ad)}</h2>
        <div class="sk-row"><button type="button" class="sk-act primary" data-liste-sirala ${aktif.idler.length ? '' : 'disabled'}>Sıralamada gör</button>
          <button type="button" class="sk-act primary" data-liste-kiyasla ${aktif.idler.length ? '' : 'disabled'}>Kıyasla</button></div>
        ${aktif.idler.length < Li.SIRKET_MAX ? `<div class="sk-row">${aramaKutusu('liste')}</div>` : `<p class="sk-note">Bir listede en çok ${Li.SIRKET_MAX} şirket olur.</p>`}
        ${aktif.idler.length ? `<div class="sk-wrap"><table><thead><tr>${TABLO_BASLIK.map(([t, , c]) => `<th class="${c || ''}">${t}</th>`).join('')}<th></th></tr></thead><tbody>${satirlar}</tbody></table></div>
          <p class="sk-note">Ayrıntı ve son ${G.GUN_SAYISI} günün grafiği için şirkete dokunun.</p>` : '<p class="sk-note">Listede şirket yok. Yukarıdan arayıp ekleyin ya da Şirketler › Sıralama\'da bir şirketin ayrıntısından listeye ekleyin.</p>'}</section>` : ''}`;
  }

  // ---- Şirket detayı ----
  const sheetHost = document.createElement('div');
  root.append(sheetHost);
  function closeSheet() {
    if (!sheet) return;
    const id = sheet.id;
    sheet = null;
    sheetHost.innerHTML = '';
    document.body.style.overflow = '';
    const row = box.querySelector(`tr[data-id="${id}"]`);
    if (row) row.focus({ preventScroll: true });
  }
  function gecmisCiz() {
    const kutu = sheetHost.querySelector('[data-gecmis]');
    const tablo = sheetHost.querySelector('[data-gt-body]');
    if (!kutu || !sheet) return;
    if (!sheet.gecmis) { kutu.innerHTML = '<p class="sk-note">Geçmiş yükleniyor…</p>'; return; }
    if (!sheet.gecmis.length) { kutu.innerHTML = GECMIS_YOK; return; }
    const m = metrikBul(sheet.metrik);
    const ad = adOf(sheet.id);
    kutu.innerHTML = `${metrikSecici('gm', sheet.metrik)}
      ${G.cizgiGrafik([{ ad: m.ad, renk: 'var(--accent)', noktalar: G.seriNoktalari(sheet.gecmis, m) }], { bicim: (v) => G.eksenMetni(m, v), oku: (v) => G.degerMetni(m, v), ters: m.tur === 'sira', doldur: true, ad: grafikAdi(m, ad) })}`;
    kutu.querySelectorAll('.sg-kutu').forEach(G.grafikBagla);
    if (tablo && !tablo.dataset.dolu) { tablo.innerHTML = gecmisTablosuHtml(sheet.gecmis); tablo.dataset.dolu = '1'; }
  }
  // Şirket adının yanındaki eylemler: liste seçimi, Listeye ekle, Kıyasla (sığmazsa altına sarılır)
  function pencereEylemleri(id) {
    const liste = listeler.listeler.length
      ? `<select data-sheet-liste aria-label="Liste seç">${listeler.listeler.map((l) => `<option value="${esc(l.id)}" ${l.id === listeler.aktif ? 'selected' : ''}>${esc(l.ad)}${Li.listedeMi(l, id) ? ' ✓' : ''}</option>`).join('')}</select>
        <button type="button" class="sk-act" data-sheet-ekle>Listeye ekle</button>`
      : '<a class="sk-act" href="#sirketler/liste" data-sheet-liste-yok>Liste oluştur</a>';
    return `<div class="sk-head-act">${liste}<button type="button" class="sk-act" data-sheet-kiyas>Kıyasla</button><span class="sk-ok" data-sheet-ok role="status"></span></div>`;
  }
  function openSheet(id) {
    const r = data && sirketBul(data.rows, id);
    if (!r) return;
    sheet = { id: r[0], metrik: 'value', gecmis: null };
    const lines = detaySatirlari(r).map(([t, v, c]) => `<div class="sk-kv"><span>${t}</span><span class="${c}">${v}</span></div>`).join('');
    sheetHost.innerHTML = `<div class="sk-sheet" data-sheet-bg><div class="sk-panel wide" role="dialog" aria-modal="true" aria-labelledby="sk-title">
      <div class="sk-panel-head"><div class="sk-head-main"><h2 id="sk-title">${esc(r[1])}</h2>${pencereEylemleri(r[0])}</div><button type="button" class="sk-btn" data-close aria-label="Kapat">✕</button></div>
      <div class="sk-idrow"><span>Şirket numarası (ID)</span><b>${r[0]}</b><button type="button" class="sk-btn" data-copy>Kopyala</button></div>
      <div data-gecmis></div>
      <div>${lines}</div>
      ${r[12] === 1 ? '' : '<p class="sk-note">Bu şirketin ayrıntıları (EVA, bina, patent, işçi, bono) henüz gelmedi; sonraki günlük güncellemede tamamlanabilir.</p>'}
      <details class="sk-det"><summary>Gün gün tablo</summary><div data-gt-body></div>
        <p class="sk-note">Son ${G.GUN_SAYISI} gün; bot günde bir kez ekler. Ayrıntısı o gün gelmemiş şirketlerde "—" görünür.</p></details>
      <p class="sk-note">Veri: Simcotools${data.date ? ` · ${new Date(data.date).toLocaleDateString(LOCALE, { timeZone: 'UTC' })}` : ''}</p></div></div>`;
    document.body.style.overflow = 'hidden';
    sheetHost.querySelector('[data-close]').focus();
    gecmisCiz();
    const my = r[0];
    G.gecmisYukle(realm, [my]).then((g) => { if (alive && sheet?.id === my) { sheet.gecmis = g.get(my) || []; gecmisCiz(); } })
      .catch(() => { if (alive && sheet?.id === my) { sheet.gecmis = []; gecmisCiz(); } });
  }
  sheetHost.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target.matches('[data-sheet-bg]')) return closeSheet();
    const gm = e.target.closest('[data-gm]');
    if (gm && sheet) { sheet.metrik = gm.dataset.gm; return gecmisCiz(); }
    if (e.target.closest('[data-sheet-ekle]') && sheet) {
      const sel = sheetHost.querySelector('[data-sheet-liste]');
      kaydet(Li.ekle(Li.sec(listeler, sel.value), sel.value, sheet.id));
      const ok = sheetHost.querySelector('[data-sheet-ok]');
      if (ok) ok.textContent = 'Eklendi.';
      return;
    }
    if (e.target.closest('[data-sheet-kiyas]') && sheet) {
      const id = sheet.id;
      closeSheet();
      kiyas = { ...kiyas, ids: [...new Set([...kiyas.ids, id])].slice(-Li.KIYAS_MAX), gecmis: null };
      tab = 'kiyas';
      try { history.replaceState(null, '', `#sirketler/kiyas/${kiyas.ids.join(',')}`); } catch { /* önemsiz */ }
      return ciz();
    }
    const copy = e.target.closest('[data-copy]');
    if (copy && sheet) {
      const done = (text) => { copy.textContent = text; setTimeout(() => { if (copy.isConnected) copy.textContent = 'Kopyala'; }, 1600); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(String(sheet.id)).then(() => done('Kopyalandı'), () => done('Kopyalanamadı'));
      else done('Kopyalanamadı');
    }
  });
  const onKey = (e) => {
    if (e.key === 'Escape' && sheet) { e.preventDefault(); closeSheet(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && !sheet) {
      const tr = e.target.closest?.('tr[data-id]');
      if (tr && box.contains(tr)) { e.preventDefault(); openSheet(tr.dataset.id); }
    }
  };
  document.addEventListener('keydown', onKey);

  // ---- Olaylar ----
  box.addEventListener('input', (e) => {
    const kutu = e.target.closest('[data-sq]');
    if (kutu && data) sonuclariCiz(kutu);
  });
  box.addEventListener('change', (e) => {
    const gs = e.target.closest('[data-grup-sec]');
    if (gs) { location.hash = `#sirketler/gruplar/uyeler/${encodeURIComponent(gs.value)}`; return; }
    const sec = e.target.closest('[data-liste-sec]');
    if (sec) { kaydet(Li.sec(listeler, sec.value)); formu = null; listeCiz(); }
  });
  box.addEventListener('click', (e) => {
    const t = e.target;
    const pick = t.closest('[data-pick]');
    if (pick) {
      const id = Number(pick.dataset.pick);
      if (tab === 'kiyas') return kiyasDegis([...kiyas.ids, id]);
      if (tab === 'liste') { const a = Li.aktifListe(listeler); if (a) { kaydet(Li.ekle(listeler, a.id, id)); listeCiz(); } }
      return;
    }
    const kc = t.closest('[data-kiyas-cikar]');
    if (kc) return kiyasDegis(kiyas.ids.filter((x) => x !== Number(kc.dataset.kiyasCikar)));
    if (t.closest('[data-kiyas-liste]')) { const a = Li.aktifListe(listeler); if (a) kiyasDegis([...kiyas.ids, ...a.idler]); return; }
    const gm = t.closest('[data-grup-mod]');
    if (gm) { grupMod = gm.dataset.grupMod; return gruplarCiz(); }
    const km = t.closest('[data-kiyas-metrik]');
    if (km) { kiyas.metrik = km.dataset.kiyasMetrik; return kiyasSonuc(); }
    const kmod = t.closest('[data-kiyas-mod]');
    if (kmod) { kiyas.mod = kmod.dataset.kiyasMod; return kiyasSonuc(); }
    if (t.closest('[data-liste-temizle]')) { state.listeId = null; state.page = 1; return ciz(); }
    if (t.closest('[data-liste-yeni]')) { formu = { tur: 'yeni' }; return listeCiz(); }
    if (t.closest('[data-liste-adlandir]')) { formu = { tur: 'ad' }; return listeCiz(); }
    if (t.closest('[data-liste-sil]')) { formu = { tur: 'sil' }; return listeCiz(); }
    if (t.closest('[data-liste-iptal]')) { formu = null; return listeCiz(); }
    if (t.closest('[data-liste-sil-onay]')) { const a = Li.aktifListe(listeler); if (a) kaydet(Li.sil(listeler, a.id)); formu = null; return listeCiz(); }
    if (t.closest('[data-liste-kaydet]')) {
      const ad = box.querySelector('[data-liste-ad]')?.value || '';
      if (!ad.trim()) return;
      const a = Li.aktifListe(listeler);
      kaydet(formu?.tur === 'ad' && a ? Li.adlandir(listeler, a.id, ad) : Li.olustur(listeler, ad));
      formu = null;
      return listeCiz();
    }
    const lc = t.closest('[data-liste-cikar]');
    if (lc) { const a = Li.aktifListe(listeler); if (a) { kaydet(Li.cikar(listeler, a.id, lc.dataset.listeCikar)); listeCiz(); } return; }
    if (t.closest('[data-liste-sirala]')) { state.listeId = listeler.aktif; state.page = 1; location.hash = '#sirketler/siralama'; return; }
    if (t.closest('[data-liste-kiyasla]')) { const a = Li.aktifListe(listeler); if (a) { kiyas = { ...kiyas, ids: a.idler.slice(0, Li.KIYAS_MAX), gecmis: null }; location.hash = `#sirketler/kiyas/${kiyas.ids.join(',')}`; } return; }
    const tr = t.closest('tbody tr[data-id]');
    if (tr && !t.closest('button')) return openSheet(tr.dataset.id);
    const th = t.closest('th[data-k]');
    if (th) {
      const k = th.dataset.k;
      if (state.key === k) state.dir = -state.dir;
      else { state.key = k; state.dir = SIRALAMA.find((s) => s[0] === k)[3]; }
      state.page = 1;
      const sel = box.querySelector('#sk-key');
      if (sel) sel.value = k;
      paint();
      return;
    }
    const b = t.closest('.sk-pager button[data-p]');
    if (b && !b.disabled) { state.page += Number(b.dataset.p); paint(); window.scrollTo(0, 0); }
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches?.('[data-liste-ad]')) { e.preventDefault(); box.querySelector('[data-liste-kaydet]')?.click(); }
  });

  async function load() {
    const my = ++token;
    data = null;
    box.innerHTML = '<h1>Şirketler</h1><p class="sk-note">Şirket listesi yükleniyor…</p>';
    try {
      const got = await yukle(realm);
      if (!alive || my !== token) return;
      if (!got) { box.innerHTML = '<h1>Şirketler</h1><p class="sk-note">Şirket sıralaması henüz toplanmadı. Bot her gün öğleye doğru (TR) çalışır; ilk çalışmadan sonra burada görünür.</p>'; return; }
      data = got;
      ciz();
    } catch (e) {
      if (!alive || my !== token) return;
      box.innerHTML = `<h1>Şirketler</h1><p class="sk-note">${esc(e instanceof VeriHatasi ? e.message : 'Şirket listesi açılamadı. Biraz sonra tekrar dene.')}</p>`;
    }
  }

  load();
  return {
    setRealm(next) {
      if (next === realm) return;
      closeSheet();
      realm = next;
      state.page = 1; state.listeId = null; grupId = null; grupGecmis = null;
      listeler = Li.oku(realm);
      kiyas = { ...kiyas, ids: [], gecmis: null };
      formu = null;
      load();
    },
    destroy() { alive = false; window.removeEventListener('hashchange', onHash); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; style.remove(); subnav.remove(); root.replaceChildren(); },
  };
}
