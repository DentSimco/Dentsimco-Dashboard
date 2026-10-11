// DentSimco — Şirketler: Simcotools şirket sıralamasının tamamı (bot günde bir kez yazar), menüden sıralanır.
// Veri: meta/ranking_r{realm} (index) + meta/ranking_r{realm}_c{NN} (parçalar). Biçim için bot/ranking.mjs başına bak.
//   satır = [id, ad, sıra, sıraFarkı, evaSırası (1 en iyi, 0 yok), değer, değerFarkı, değerYüzde, bina, patent, işçi, bono, ayrıntıVar]
// "Sıra" ayrı bir ölçüt değildir: Simcotools sırası şirket değerine göredir (Şirket değeri ölçütüyle aynı).

import { PATHS, readDocs, dataField, VeriHatasi } from './veri.js';
import { LOCALE } from './i18n.js';

const PAGE = 50;

// Sıralama ölçütleri: [anahtar, başlık, satırdaki sütun, varsayılan yön, ayrıntı gerekir mi]
export const SIRALAMA = [
  ['value', 'Şirket değeri', 5, -1, false],
  ['valueDiff', 'Değer değişimi', 6, -1, false],
  ['valuePct', 'Değer değişimi %', 7, -1, false],
  ['eva', 'EVA sırası', 4, 1, true],
  ['buildings', 'Bina değeri', 8, -1, true],
  ['patents', 'Patent değeri', 9, -1, true],
  ['workers', 'İşçi', 10, -1, true],
  ['bonds', 'Satılan bono', 11, -1, true],
  ['name', 'Ad (A-Z)', 1, 1, false],
];

// EVA sırasında 1 en iyidir (en çok değer katan); 0 = Simcotools'ta EVA yok (ayrıntısı gelmemiş sayılır).
export const ayrintiVar = (row, key) => row[12] === 1 && (key !== 'eva' || row[4] > 0);

// rows'u değiştirmez. dir: 1 artan, -1 azalan. Ayrıntısı henüz gelmemiş şirketler ayrıntı ölçütlerinde hep sonda kalır.
export function sirala(rows, key, dir = 1) {
  const spec = SIRALAMA.find((s) => s[0] === key) || SIRALAMA[0];
  const col = spec[2];
  const needsDetail = spec[4];
  const collator = col === 1 ? new Intl.Collator('tr', { sensitivity: 'base', numeric: true }) : null;
  return [...rows].sort((a, b) => {
    if (needsDetail) {
      const ma = ayrintiVar(a, spec[0]);
      const mb = ayrintiVar(b, spec[0]);
      if (ma !== mb) return ma ? -1 : 1;
    }
    const d = collator ? collator.compare(a[col], b[col]) : a[col] - b[col];
    return (d * dir) || (a[2] - b[2]);
  });
}

// Ad içinde arar (büyük/küçük harf ve Türkçe harfler fark etmez); sayı yazılırsa şirket numarası da eşleşir.
export function ara(rows, query) {
  const q = String(query ?? '').trim().toLocaleLowerCase('tr');
  if (!q) return rows;
  return rows.filter((r) => r[1].toLocaleLowerCase('tr').includes(q) || (/^\d+$/.test(q) && String(r[0]) === q));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NUM = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const usd = (x) => `$${NUM.format(x)}`;
const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + (x === 0 ? '0' : NUM.format(Math.abs(x)));
const tone = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');

const CSS = `
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
.sk-pager { display: flex; gap: 8px; align-items: center; justify-content: center; }
.sk-pager button { height: 40px; padding: 0 14px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--surface); font-weight: 600; }
.sk-pager button:disabled { opacity: .4; }
`;

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

export function mountSirketler(root, { realm: startRealm = 0 } = {}) {
  let realm = startRealm;
  let alive = true;
  let token = 0;
  let data = null;
  const state = { key: 'value', dir: -1, q: '', page: 1 };
  // #sirketler/value, #sirketler/eva gibi bağlantılar o ölçütle açılır (haber sayfasındaki sıralama kutuları)
  function keyFromHash() {
    const k = location.hash.slice(1).split('/')[1];
    const spec = SIRALAMA.find((s) => s[0] === k);
    if (!spec) return false;
    state.key = spec[0];
    state.dir = spec[3];
    state.page = 1;
    return true;
  }
  keyFromHash();
  function onHash() {
    if (location.hash.slice(1).split('/')[0] !== 'sirketler' || !keyFromHash() || !data) return;
    const sel = box.querySelector('#sk-key');
    if (sel) sel.value = state.key;
    paint();
  }
  window.addEventListener('hashchange', onHash);
  let view = []; // süzülmüş + sıralanmış liste

  const style = document.createElement('style');
  style.dataset.module = 'sirketler';
  style.textContent = CSS;
  document.head.append(style);
  root.innerHTML = '<div class="sk"></div>';
  const box = root.querySelector('.sk');

  function frame() {
    box.innerHTML = `
      <h1>Şirketler</h1>
      <div class="sk-bar">
        <label>Sırala <select id="sk-key" aria-label="Sıralama ölçütü">${SIRALAMA.map(([k, t]) => `<option value="${k}" ${k === state.key ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <button type="button" class="sk-dir" id="sk-dir" aria-label="Sıralama yönü"></button>
        <input type="search" id="sk-q" placeholder="Şirket ara" aria-label="Şirket ara" value="${esc(state.q)}" autocomplete="off">
      </div>
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
    if (!data) return;
    view = sirala(ara(data.rows, state.q), state.key, state.dir);
    const pages = Math.max(1, Math.ceil(view.length / PAGE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const from = (state.page - 1) * PAGE;
    const cols = [['Sıra', null, 'l'], ['Şirket', 'name', 'l'], ['Şirket değeri', 'value'], ['Değişim', 'valueDiff'], ['%', 'valuePct'],
      ['EVA sırası', 'eva'], ['Bina değeri', 'buildings'], ['Patent değeri', 'patents'], ['İşçi', 'workers'], ['Bono', 'bonds']];
    box.querySelector('thead').innerHTML = `<tr>${cols.map(([t, k, c]) => `<th${k ? ` data-k="${k}"` : ''} class="${c || ''}" ${k && k === state.key ? `aria-sort="${state.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${t}</th>`).join('')}</tr>`;
    box.querySelector('tbody').innerHTML = view.slice(from, from + PAGE).map((r) => {
      const d = r[12] === 1;
      const dim = (v) => (d ? v : '<span class="dim">—</span>');
      return `<tr><td>${NUM.format(r[2])} <span class="${tone(r[3])}">${r[3] ? (r[3] > 0 ? '▲' : '▼') + Math.abs(r[3]) : ''}</span></td>
        <td class="l">${esc(r[1])}</td><td>${usd(r[5])}</td>
        <td class="${tone(r[6])}">${signed(r[6])}</td><td class="${tone(r[7])}">${r[7] ? PCT.format(r[7]) : '0%'}</td>
        <td>${r[4] > 0 ? dim(NUM.format(r[4])) : '<span class="dim">—</span>'}</td><td>${dim(usd(r[8]))}</td><td>${dim(usd(r[9]))}</td><td>${dim(NUM.format(r[10] / 100))}</td><td>${dim(usd(r[11]))}</td></tr>`;
    }).join('') || '<tr><td colspan="10" class="l dim">Eşleşen şirket yok.</td></tr>';
    box.querySelector('#sk-dir').textContent = state.dir > 0 ? '↑' : '↓';
    box.querySelector('#sk-note').textContent = `${NUM.format(view.length)} şirket · Veri: Simcotools · ${data.date ? new Date(data.date).toLocaleDateString(LOCALE, { timeZone: 'UTC' }) : ''}. Ayrıntıları (EVA, bina, patent, işçi, bono) henüz gelmemiş şirketlerde "—" görünür.`;
    box.querySelector('.sk-pager').innerHTML = `<button type="button" data-p="-1" ${state.page <= 1 ? 'disabled' : ''}>‹ Önceki</button><span>${state.page} / ${pages}</span><button type="button" data-p="1" ${state.page >= pages ? 'disabled' : ''}>Sonraki ›</button>`;
  }

  box.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-k]');
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
    const b = e.target.closest('.sk-pager button[data-p]');
    if (b && !b.disabled) { state.page += Number(b.dataset.p); paint(); window.scrollTo(0, 0); }
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
      frame();
      paint();
    } catch (e) {
      if (!alive || my !== token) return;
      box.innerHTML = `<h1>Şirketler</h1><p class="sk-note">${esc(e instanceof VeriHatasi ? e.message : 'Şirket listesi açılamadı. Biraz sonra tekrar dene.')}</p>`;
    }
  }

  load();
  return {
    setRealm(next) { if (next === realm) return; realm = next; state.page = 1; load(); },
    destroy() { alive = false; window.removeEventListener('hashchange', onHash); style.remove(); root.replaceChildren(); },
  };
}
