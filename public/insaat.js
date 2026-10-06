// DentSimco — İnşaat simülatörü (Yönetim › Simülasyon › İnşaat).
// Bina yükseltme, yeni bina, hurda ve seviye düşürme için gereken malzeme, maliyet ve süre. Yalnız hesap: sinyal ya da öneri yok.
// Hesap kuralları hesap-insaat.js'te; burada ekran, fiyat okuma ve tarayıcıda kayıt var.
// Tarayıcı kaydı: dentsimco.insaat.r{realm} (her realm ayrı plan tutar).

import { readDocs, PATHS, dataField, loadProduct, summarizeDay, utcDay, addDays, fmtDateTime, fmtAgo } from './veri.js';
import * as Y from './yonetici.js';
import * as I from './hesap-insaat.js';
import { binaAdi } from './adlar.js';
import { parseNum } from './uretim.js';

const KEY = (r) => `dentsimco.insaat.r${r}`;
const NF = [0, 1, 2].map((d) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fin = (x) => x != null && Number.isFinite(x);
const num = (x, d = 0) => (fin(x) ? NF[d].format(x) : '—');
const money = (x, d = 0, sign = false) => {
  if (!fin(x)) return '—';
  const s = `$${NF[d].format(Math.abs(x))}`;
  return x < 0 ? `−${s}` : sign && x > 0 ? `+${s}` : s;
};
const price = (x) => (!fin(x) ? '—' : money(x, Math.abs(x) < 1000 ? 2 : 0));
const pct = (x) => (!fin(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}%${NF[1].format(Math.abs(x) * 100)}`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const chip = (text, kind = '') => `<span class="ur-chip ${kind}">${esc(text)}</span>`;
const kv = (label, value, c = '', strong = false) => `<div class="ur-kv${strong ? ' strong' : ''}"><span>${label}</span><span class="${c}">${value}</span></div>`;

const ICON = {
  plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  minus: '<path d="M5 12h14"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

export const INSAAT_CSS = `
.in-view { display: flex; flex-direction: column; gap: 12px; }
.in-row { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 12px; background: var(--raise); border: 1px solid var(--line-2); }
.in-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.in-step { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.in-step > span { font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.in-ctl { display: flex; align-items: stretch; border: 1px solid var(--line-2); border-radius: 10px; overflow: hidden; background: var(--surface); }
.in-ctl button { flex: 0 0 38px; min-height: 44px; display: grid; place-items: center; color: var(--accent); }
.in-ctl button svg { width: 16px; height: 16px; }
.in-ctl input { flex: 1 1 0; min-width: 0; width: 100%; text-align: center; border: 0; background: transparent; font-weight: 600; font-variant-numeric: tabular-nums; }
.in-line { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; font-size: 14px; color: var(--muted); }
.in-line b { color: var(--text); font-variant-numeric: tabular-nums; }
.in-mat { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; background: var(--raise); border: 1px solid var(--line-2); }
.in-mat h3 { margin: 0; font: 600 16px var(--font-c); display: flex; justify-content: space-between; gap: 8px; }
.in-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.in-grid > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.in-grid > div > span:first-child { font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.in-grid > div > span:last-child { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.in-lv { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.in-lv th, .in-lv td { padding: 6px 4px; text-align: right; border-bottom: 1px solid var(--line); }
.in-lv th:first-child, .in-lv td:first-child { text-align: left; }
.in-lv th { color: var(--muted); font-weight: 600; }
.in-wrap { overflow-x: auto; }
@media (max-width: 560px) {
  .in-steps { grid-template-columns: 1fr; }
  .in-step { flex-direction: row; align-items: center; justify-content: space-between; gap: 10px; }
  .in-step > span { flex: 1 1 auto; }
  .in-ctl { flex: 0 0 176px; }
}
.in-date { width: 100%; min-height: 44px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--surface); padding: 0 10px; color: var(--text); }
`;

async function loadTable() {
  const path = PATHS.meta('buildings');
  const docs = await readDocs([path]);
  return I.binaTablosu(dataField(docs.get(path)));
}
async function loadLive(r, options) {
  const docs = await readDocs([PATHS.live(r)], options);
  return dataField(docs.get(PATHS.live(r))) || null;
}
// Bir malzemenin son günlerdeki VWAP'ı: bugün, yoksa dün, yoksa son 6 günün en yenisi
async function loadVwap(r, id) {
  const today = utcDay(Date.now());
  const days = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(today, -n));
  const { byDay, daily } = await loadProduct(r, id, { days: days.slice(0, 2), years: [...new Set(days.map((d) => Number(d.slice(0, 4))))] });
  const rows = new Map(daily);
  for (const day of days) {
    const pts = byDay.get(day);
    const d = pts?.length ? summarizeDay(pts)[0] : rows.get(day)?.[0];
    if (d && d[5] > 0 && d[6] != null) return { price: d[6] / d[5], day };
  }
  return null;
}

export function mountInsaat(host, { realm = 0 } = {}) {
  let r = realm;
  let plan = load(r);
  let table = I.binaTablosu(null);
  let live = null;
  let vwap = {}; // id → { price, day } | null
  let destroyed = false;
  let token = 0;
  let toastTimer = null;
  const open = new Set(); // seviye dökümü açık satırlar

  const style = document.createElement('style');
  style.dataset.module = 'insaat';
  style.textContent = INSAAT_CSS;
  document.head.append(style);
  host.innerHTML = '<div class="in-view" data-in></div><div data-in-toast></div>';
  const view = host.querySelector('[data-in]');
  const toastHost = host.querySelector('[data-in-toast]');

  function load(realmNo) {
    try { return I.planTemizle(JSON.parse(localStorage.getItem(KEY(realmNo)) || 'null')); } catch { return I.planTemizle(null); }
  }
  function save() {
    try { localStorage.setItem(KEY(r), JSON.stringify(plan)); return true; } catch { return false; }
  }
  function toast(text) {
    toastHost.innerHTML = `<div class="ur-toast" role="status">${esc(text)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastHost.innerHTML = ''; }, 3200);
  }
  function commit(next, { silent = false } = {}) {
    plan = I.planTemizle(next);
    if (!save()) toast('Tarayıcı kaydı açık değil; plan sayfa kapanınca kaybolur.');
    if (!silent) render();
  }
  const clone = () => JSON.parse(JSON.stringify(plan));

  // ---- veri ----
  async function loadAll(refresh = false) {
    const my = ++token;
    try {
      const [t, l] = await Promise.all([loadTable().catch(() => I.binaTablosu(null)), loadLive(r, refresh ? { refresh: true } : undefined).catch(() => null)]);
      if (destroyed || my !== token) return;
      table = t; live = l;
    } catch { /* yedek tablo ve fiyatsız devam */ }
    softRender();
    for (const m of I.MALZEMELER) {
      loadVwap(r, m.id).then((v) => { if (destroyed || my !== token) return; vwap[m.id] = v; softRender(); }).catch(() => { vwap[m.id] = null; });
    }
  }
  // Veri sonradan gelince yazmakta olunan kutu varsa çizimi kutudan çıkana kadar bekletir
  let pendingRender = false;
  function softRender() {
    const a = document.activeElement;
    if (a && host.contains(a) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName)) pendingRender = true;
    else render();
  }
  const onFocusOut = () => { if (pendingRender) setTimeout(() => { pendingRender = false; render(); }, 0); };
  function lastOf(id) {
    const qs = live?.items?.[id]?.[1];
    if (!qs) return null;
    const q0 = qs[0];
    if (q0?.[0] != null) return { price: q0[0], t: q0[4] ?? null };
    for (const q of Object.keys(qs)) if (qs[q]?.[0] != null) return { price: qs[q][0], t: qs[q][4] ?? null };
    return null;
  }
  // Seçili kaynaktan, yoksa öbüründen; elle girilen her zaman önce gelir
  function priceOf(m) {
    const manual = plan.manual[m.key];
    if (manual != null) return { price: manual, source: 'Elle girildi' };
    const last = lastOf(m.id);
    const v = vwap[m.id];
    const first = plan.priceMode === 'vwap' ? ['VWAP', v?.price] : ['Son işlem', last?.price];
    const second = plan.priceMode === 'vwap' ? ['Son işlem', last?.price] : ['VWAP', v?.price];
    if (first[1] != null) return { price: first[1], source: first[0], when: first[0] === 'Son işlem' ? last?.t : null };
    if (second[1] != null) return { price: second[1], source: `${second[0]} (yedek)`, when: second[0] === 'Son işlem' ? last?.t : null };
    return { price: null, source: 'Fiyat yok' };
  }
  const prices = () => Object.fromEntries(I.MALZEMELER.map((m) => [m.key, priceOf(m).price]));
  const cash = () => { try { return Y.loadCompanyRecord(r).company.finance.cash || 0; } catch { return 0; } };
  const sortedBuildings = () => Object.keys(table).sort((a, b) => binaAdi(a).localeCompare(binaAdi(b), 'tr'));

  // ---- ekran ----
  const stepper = (rowId, f, value, label) => `<div class="in-step"><span>${label}</span><div class="in-ctl">
      <button type="button" data-act="step" data-row="${esc(rowId)}" data-f="${f}" data-d="-1" aria-label="${label} azalt">${icon('minus')}</button>
      <input type="text" inputmode="numeric" autocomplete="off" data-row="${esc(rowId)}" data-f="${f}" value="${esc(value)}" aria-label="${label}">
      <button type="button" data-act="step" data-row="${esc(rowId)}" data-f="${f}" data-d="1" aria-label="${label} artır">${icon('plus')}</button></div></div>`;

  function rowCard(row, calc) {
    const bina = table[row.letter];
    const opts = `<option value="" ${row.letter ? '' : 'selected'} disabled>Bina seçin</option>${sortedBuildings().map((l) => `<option value="${esc(l)}" ${l === row.letter ? 'selected' : ''}>${esc(binaAdi(l))}</option>`).join('')}`;
    let sonuc;
    if (!row.letter) sonuc = '<span class="in-line">Önce bina türünü seçin.</span>';
    else if (calc.hata) sonuc = `<span class="in-line">${esc(calc.hata)}.</span>`;
    else if (calc.tur === 'yok') sonuc = '<span class="in-line">Mevcut ve hedef seviye aynı: yapılacak bir şey yok.</span>';
    else if (calc.tur === 'yukselt') {
      sonuc = `<div class="in-line"><span>Bina başına <b>${num(calc.birimBina)}</b> inşaat gereci</span><span>Süre <b>${I.sureMetni(calc.sureSn)}</b></span><span>Referans <b>${money(calc.referans)}</b></span></div>`;
    } else {
      sonuc = `<div class="in-line"><span>${calc.b === 0 ? 'Yıkım' : 'Seviye düşürme'}: bina başına <b>${num(calc.birimBina)}</b> inşaat gereci iade</span><span>İade değeri <b>${money(calc.referans)}</b></span></div>`;
    }
    let dokum = '';
    if (open.has(row.id) && bina && calc.tur === 'yukselt') {
      const lv = I.seviyeDokumu(bina, calc.a, calc.b);
      dokum = `<div class="in-wrap"><table class="in-lv"><thead><tr><th>Seviye</th><th>Betonarme</th><th>Tuğla</th><th>Kereste</th><th>Gereç</th><th>Süre</th></tr></thead><tbody>${lv.map((x) =>
        `<tr><td>${x.seviye}</td><td>${num(x.malzeme.concrete)}</td><td>${num(x.malzeme.bricks)}</td><td>${num(x.malzeme.planks)}</td><td>${num(x.malzeme.units)}</td><td>${I.sureMetni(x.sureSn)}</td></tr>`).join('')}</tbody></table></div>
        <p class="ur-note">Bina başına, seviye seviye. Seviye 1 ve 2'nin maliyeti aynıdır, sonrası (seviye − 1) katıdır.</p>`;
    }
    const canDetail = bina && calc.tur === 'yukselt' && !calc.hata;
    return `<div class="in-row">
      <label class="ur-field"><span>Bina türü</span><select data-row="${esc(row.id)}" data-f="letter">${opts}</select></label>
      <div class="in-steps">${stepper(row.id, 'count', row.count, 'Bina sayısı')}${stepper(row.id, 'from', row.from, 'Mevcut seviye')}${stepper(row.id, 'to', row.to, 'Hedef seviye')}</div>
      ${sonuc}${dokum}
      <div class="ur-row">${canDetail ? `<button type="button" class="ur-btn grow" data-act="dokum" data-row="${esc(row.id)}">${open.has(row.id) ? 'Dökümü gizle' : 'Seviye dökümü'}</button>` : ''}
        <button type="button" class="ur-btn danger" data-act="del" data-row="${esc(row.id)}" aria-label="Satırı kaldır">${icon('trash')}Kaldır</button></div></div>`;
  }

  function matCard(m, calc) {
    const pr = priceOf(m);
    const gerekli = calc.gerekli[m.key];
    const geri = calc.geriGelen[m.key];
    const manualShown = plan.manual[m.key] != null ? NF[2].format(plan.manual[m.key]) : '';
    const when = pr.when ? ` · ${esc(fmtAgo(pr.when))}` : '';
    return `<div class="in-mat"><h3><span>${esc(m.ad)}</span><span class="${calc.maliyet[m.key] == null && calc.alinacak[m.key] > 0 ? 'c-down' : ''}">${calc.maliyet[m.key] != null ? money(calc.maliyet[m.key]) : calc.alinacak[m.key] > 0 ? 'Fiyat yok' : '$0'}</span></h3>
      <div class="in-grid"><div><span>Gerekli</span><span>${num(gerekli)}</span></div><div><span>Hurdadan gelen</span><span>${geri ? `${num(geri)}${plan.useScrap ? '' : ' (sayılmıyor)'}` : '—'}</span></div>
        <div><span>Alınacak</span><span>${num(calc.alinacak[m.key])}</span></div>
        <div><span>Depo stoğu</span><div class="ur-input"><input type="text" inputmode="numeric" autocomplete="off" data-stock="${m.key}" value="${plan.stock[m.key] ? esc(plan.stock[m.key]) : ''}" placeholder="0" aria-label="${esc(m.ad)} depo stoğu"></div></div></div>
      <div class="in-grid"><div><span>Birim fiyat</span><div class="ur-input"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-manual="${m.key}" value="${esc(manualShown)}" placeholder="${pr.price != null ? esc(NF[pr.price < 1000 ? 2 : 0].format(pr.price)) : ''}" aria-label="${esc(m.ad)} birim fiyatı"></div></div>
        <div><span>Kaynak</span><span style="font-size:14px">${esc(pr.source)}${when}</span></div></div>
      </div>`;
  }

  function summaryText(calc, p) {
    const L = [`DentSimco inşaat planı · Realm ${r + 1}`, ''];
    for (const x of calc.rows) {
      if (x.hata || x.tur === 'yok') continue;
      const ad = binaAdi(x.letter);
      L.push(x.tur === 'yukselt' ? `${ad} ×${x.adet}: seviye ${x.a} → ${x.b} (${I.sureMetni(x.sureSn)})` : `${ad} ×${x.adet}: seviye ${x.a} → ${x.b} ${x.b === 0 ? '(yıkım)' : '(düşürme)'}`);
    }
    L.push('');
    for (const m of I.MALZEMELER) L.push(`${m.ad}: gerekli ${num(calc.gerekli[m.key])}${calc.geriGelen[m.key] ? `, hurda −${num(calc.dusulen[m.key])}` : ''}${calc.stok[m.key] ? `, stok −${num(calc.stok[m.key])}` : ''} → alınacak ${num(calc.alinacak[m.key])}${p[m.key] ? ` × ${price(p[m.key])}` : ''}`);
    L.push('', `Tahmini maliyet: ${money(calc.toplam)}${calc.eksikFiyat ? ' (fiyatı olmayan malzemeler dahil değil)' : ''}`);
    if (calc.enUzunSn > 0) L.push(`Süre: ${I.sureMetni(calc.enUzunSn)}${calc.bitis ? ` (bitiş ${fmtDateTime(calc.bitis)})` : ''}`);
    return L.join('\n');
  }

  function render() {
    if (destroyed) return;
    const p = prices();
    const startMs = plan.start ?? Date.now();
    const nakit = cash();
    const calc = I.planiHesapla(plan, table, p, { baslangic: startMs, nakit: nakit > 0 ? nakit : null });
    const rows = plan.rows.map((row, i) => rowCard(row, calc.rows[i])).join('');
    const hurdaVar = calc.rows.some((x) => x.tur === 'iade' && !x.hata);
    const startLocal = new Date(startMs - new Date(startMs).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const planCard = `<section class="ur-card" aria-labelledby="h-in-plan"><h2 id="h-in-plan">İnşaat planı</h2>
      <p class="ur-sub">Yeni bina için mevcut seviyeyi 0 yapın. Hedef mevcuttan küçükse hurda ya da seviye düşürme sayılır. Aynı satırdaki binalar birlikte yükselir.</p>
      ${rows || '<p class="ur-note">Henüz satır yok. Aşağıdan bina ekleyin.</p>'}
      <div class="ur-row"><button type="button" class="ur-btn tint grow" data-act="add">${icon('plus')}Bina ekle</button>${plan.rows.length ? `<button type="button" class="ur-btn" data-act="clear">${icon('trash')}Temizle</button>` : ''}</div></section>`;

    const basketCard = `<section class="ur-card" aria-labelledby="h-in-sepet"><h2 id="h-in-sepet">Malzeme sepeti</h2>
      <p class="ur-sub">Alınacak = gerekli − depo stoğu${hurdaVar ? ' − hurdadan gelen' : ''}. Kalite fark etmez, Q0 yeterlidir.</p>
      <div class="ur-field"><span>Fiyat kaynağı</span><div class="ur-seg" role="group" aria-label="Fiyat kaynağı">${[['last', 'Son işlem'], ['vwap', 'VWAP']].map(([v, t]) =>
        `<button type="button" data-act="mode" data-v="${v}" aria-pressed="${plan.priceMode === v}">${t}</button>`).join('')}</div>
        <p class="ur-note">Fiyat kutusuna yazarsanız o malzeme için sizin fiyatınız kullanılır.</p></div>
      ${hurdaVar ? `<label class="ur-line" style="cursor:pointer"><span class="grow">Hurdadan gelen malzemeyi sepetten düş</span><input type="checkbox" data-act="scrap" ${plan.useScrap ? 'checked' : ''} style="width:22px;height:22px"></label>` : ''}
      ${I.MALZEMELER.map((m) => matCard(m, calc)).join('')}
      <div class="ur-row"><button type="button" class="ur-btn grow" data-act="prices">${icon('refresh')}Fiyatları yenile</button></div></section>`;

    const refDiff = calc.referansaFark;
    const sumCard = `<section class="ur-card" aria-labelledby="h-in-ozet"><h2 id="h-in-ozet">Özet</h2>
      <div class="ur-box">${kv('Tahmini satın alma maliyeti', money(calc.toplam), 'c-price', true)}
        ${calc.eksikFiyat ? '<p class="ur-note" style="color:var(--down)">Fiyatı olmayan malzemeler maliyete katılmadı. Fiyat kutusuna elle girin.</p>' : ''}
        ${kv('Referans değeri (gerekli malzeme)', money(calc.referans))}
        ${kv('Referansa göre fark', refDiff == null ? '—' : pct(refDiff), refDiff == null ? '' : refDiff > 0 ? 'c-down' : refDiff < 0 ? 'c-up' : '')}
        <p class="ur-note">Referans, oyundaki sabit değerdir (gereç birimi başına $3.450). Piyasa ondan pahalıysa fark artıdır.</p>
        ${hurdaVar ? `<div class="ur-hr"></div>${kv('Hurdadan gelen malzemenin referans değeri', money(calc.iadeReferans), 'c-up')}` : ''}</div>
      <div class="ur-box"><span class="ur-note" style="font-weight:600">Takvim</span>
        <label class="ur-field"><span>Başlangıç</span><input type="datetime-local" class="in-date" data-start value="${esc(startLocal)}"></label>
        ${kv('Toplam süre', I.sureMetni(calc.enUzunSn), '', true)}
        ${kv('Bitiş', calc.bitis ? fmtDateTime(calc.bitis) : '—')}
        <p class="ur-note">Satırlar aynı anda başlarsa en uzun satır bitince hepsi biter. ${plan.start == null ? 'Başlangıç şu an.' : '<a href="#" data-act="now" style="color:var(--accent)">Şimdiye ayarla</a>'}</p></div>
      <div class="ur-box"><span class="ur-note" style="font-weight:600">Nakit</span>
        ${nakit > 0 ? `${kv('Nakit (Muhasebe)', money(nakit))}${kv(calc.nakitFarki >= 0 ? 'Maliyetten sonra kalan' : 'Eksik', money(Math.abs(calc.nakitFarki)), calc.nakitFarki >= 0 ? 'c-up' : 'c-down', true)}`
    : '<p class="ur-note">Nakitle karşılaştırmak için Simülasyon › Muhasebe\'ye nakdinizi girin.</p>'}</div>
      <div class="ur-row"><button type="button" class="ur-btn primary grow" data-act="copy">${icon('copy')}Özeti kopyala</button></div></section>`;

    const scroll = window.scrollY;
    view.innerHTML = planCard + basketCard + sumCard;
    window.scrollTo(0, scroll);
    host.__calc = { calc, p }; // kopyalama için
  }

  // ---- olaylar ----
  const findRow = (id) => plan.rows.find((x) => x.id === id);
  function setRowField(id, f, value) {
    const next = clone();
    const row = next.rows.find((x) => x.id === id);
    if (!row) return;
    if (f === 'letter') row.letter = String(value);
    else if (f === 'count') row.count = Math.max(1, Math.floor(parseNum(String(value)) ?? 1));
    else row[f] = I.seviye(parseNum(String(value)) ?? 0);
    commit(next);
  }
  function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el || !host.contains(el)) return;
    const act = el.dataset.act;
    if (act === 'step') {
      const row = findRow(el.dataset.row);
      if (!row) return;
      const f = el.dataset.f;
      const d = Number(el.dataset.d);
      const min = f === 'count' ? 1 : 0;
      setRowField(row.id, f, Math.max(min, Math.min(f === 'count' ? 9999 : I.MAKS_SEVIYE, row[f] + d)));
    } else if (act === 'add') {
      const next = clone();
      next.rows.push({ id: uid(), letter: '', count: 1, from: 0, to: 1 });
      commit(next);
    } else if (act === 'del') {
      const next = clone();
      next.rows = next.rows.filter((x) => x.id !== el.dataset.row);
      open.delete(el.dataset.row);
      commit(next);
    } else if (act === 'clear') {
      commit({ ...clone(), rows: [], stock: {}, manual: {} });
      open.clear();
    } else if (act === 'dokum') {
      const id = el.dataset.row;
      if (open.has(id)) open.delete(id); else open.add(id);
      render();
    } else if (act === 'mode') {
      commit({ ...clone(), priceMode: el.dataset.v });
    } else if (act === 'prices') {
      vwap = {};
      loadAll(true);
      toast('Fiyatlar yenileniyor.');
    } else if (act === 'now') {
      ev.preventDefault();
      commit({ ...clone(), start: null });
    } else if (act === 'copy') {
      const text = summaryText(host.__calc.calc, host.__calc.p);
      const done = () => toast('Özet kopyalandı.');
      const fallback = () => {
        const t = document.createElement('textarea');
        t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.append(t); t.select();
        try { document.execCommand('copy'); done(); } catch { toast('Kopyalanamadı.'); }
        t.remove();
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
  }
  function onChange(ev) {
    const t = ev.target;
    if (t.dataset.row && t.dataset.f) return setRowField(t.dataset.row, t.dataset.f, t.value);
    if (t.dataset.stock) {
      const next = clone();
      next.stock[t.dataset.stock] = Math.max(0, Math.floor(parseNum(t.value) ?? 0));
      return commit(next);
    }
    if (t.dataset.manual) {
      const next = clone();
      const m = I.MALZEMELER.find((x) => x.key === t.dataset.manual);
      const v = t.value.trim() === '' ? null : parseNum(t.value, { ref: priceOf(m).price });
      next.manual[t.dataset.manual] = v != null && v > 0 ? v : null;
      return commit(next);
    }
    if (t.dataset.start !== undefined) {
      const ms = Date.parse(t.value);
      return commit({ ...clone(), start: Number.isFinite(ms) ? ms : null });
    }
    if (t.dataset.act === 'scrap') commit({ ...clone(), useScrap: !!t.checked });
  }
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('focusout', onFocusOut);
  render();
  loadAll();

  return {
    setRealm(next) {
      if (next === r) return;
      r = next;
      plan = load(r);
      live = null; vwap = {}; open.clear();
      loadAll();
    },
    destroy() {
      destroyed = true;
      clearTimeout(toastTimer);
      host.removeEventListener('click', onClick);
      host.removeEventListener('change', onChange);
      host.removeEventListener('focusout', onFocusOut);
      style.remove();
      host.replaceChildren();
    },
  };
}
