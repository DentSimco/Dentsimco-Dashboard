// DentSimco — Yönetim (yöneticiler ve simülasyonlar, arayüz)
// Hesapların hepsi yonetici.js ve hesap.js'te; burada ekranlar, fiyat okuma ve tarayıcıda kayıt var.
// Yönetim: Ekip | Simülasyon. Simülasyon: Araştırma · İnşaat · Muhasebe (alfabetik).
// Yönetim gideri ve perakende marjı elle girilmez: Üretim ve Perakende kendi payını şirket kaydına yazar.
// Şirket kaydı (dentsimco.sirket.r{realm}) Üretim ve Perakende tarafından da okunur; yöneticiler yalnız burada girilir.

import { LOCALE } from './i18n.js';
import { readDocs, PATHS, dataField, loadProduct, summarizeDay, utcDay, addDays } from './veri.js';
import * as H from './hesap.js';
import * as Y from './yonetici.js';
import { CSS, parseNum, kisayolSatiri } from './uretim.js';
import { mountInsaat } from './insaat.js';

const TAB_KEY = 'dentsimco.yonetim.tab';
const SIM_KEY = 'dentsimco.yonetim.sim';
const TABS = [['ekip', 'Ekip'], ['simulasyon', 'Simülasyon']];
const SIM_TABS = [['arastirma', 'Araştırma'], ['insaat', 'İnşaat'], ['muhasebe', 'Muhasebe']]; // Türkçe alfabe sırası
// Eski adresler: #yonetim/muhasebe, /arastirma Simülasyon altına taşındı; /satis ve /sirket kaldırıldı
export function yonetimRota(parcalar, kayitli = {}) {
  const [, a, b] = parcalar;
  const simOk = (k) => SIM_TABS.some(([x]) => x === k);
  const sim = simOk(kayitli.sim) ? kayitli.sim : 'arastirma';
  if (a === 'ekip') return { tab: 'ekip', sim, yonlendir: false };
  if (a === 'simulasyon') return { tab: 'simulasyon', sim: simOk(b) ? b : sim, yonlendir: !simOk(b) };
  if (simOk(a)) return { tab: 'simulasyon', sim: a, yonlendir: true };
  if (a === 'satis' || a === 'sirket') return { tab: 'ekip', sim, yonlendir: true };
  return { tab: kayitli.tab === 'simulasyon' ? 'simulasyon' : 'ekip', sim, yonlendir: false };
}
const rotaAdresi = (x) => (x.tab === 'ekip' ? '#yonetim/ekip' : `#yonetim/simulasyon/${x.sim}`);
const POSITIONS = [['o', 'COO'], ['f', 'CFO'], ['m', 'CMO'], ['t', 'CTO'], ['v', 'COO stajyeri'], ['x', 'CFO stajyeri'],
  ['y', 'CMO stajyeri'], ['z', 'CTO stajyeri'], ['1', 'Personel']];
const positionName = (p) => (/^\d+$/.test(String(p)) ? 'Personel' : POSITIONS.find(([k]) => k === p)?.[1] || String(p || '?'));
const SKILL_LABELS = [['coo', 'Yönetim'], ['cfo', 'Muhasebe'], ['cmo', 'İletişim'], ['cto', 'Bilim']];
const SECTOR_LABELS = [['coo', 'Yönetim', 'maaş tasarrufu'], ['cfo', 'Muhasebe', 'ödenmeyen vergi'], ['cmo', 'İletişim', 'perakende satış'], ['cto', 'Bilim', 'araştırma binalarının hız artışı']];
// Her katkının hangi veriden geldiği ve eksikse nereye gidileceği
const SECTOR_VERI = {
  coo: ['Binalarınızı Üretim ya da Perakende bölümüne girince hesaplanır.', '#uretim', 'Üretim\'e git'],
  cfo: ['Nakdinizi Simülasyon › Muhasebe\'ye girince hesaplanır.', '#yonetim/simulasyon/muhasebe', 'Muhasebe\'ye git'],
  cmo: ['Mağazalarınızı Perakende bölümüne girince hesaplanır.', '#perakende', 'Perakende\'ye git'],
  cto: ['Üretim bölümüne araştırma binası (ör. Mutfak) ekleyince hesaplanır.', '#uretim', 'Üretim\'e git'],
};

const NF = [0, 1, 2, 3, 4].map((d) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }));
const fin = (x) => x != null && Number.isFinite(x);
const num = (x, d = 0) => (fin(x) ? NF[d].format(x) : '—');
const dec = (x) => (!fin(x) ? '—' : Math.abs(x) >= 100 ? NF[0].format(x) : NF[x % 1 ? 2 : 0].format(x));
const money = (x, d = 0, sign = false) => {
  if (!fin(x)) return '—';
  const s = `$${NF[d].format(Math.abs(x))}`;
  return x < 0 ? `−${s}` : sign && x > 0 ? `+${s}` : s;
};
const price = (x) => (!fin(x) ? '—' : money(x, Math.abs(x) < 1000 ? 2 : 0));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = (x) => (x > 0 ? 'c-up' : x < 0 ? 'c-down' : '');
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const ICON = {
  plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const kv = (label, value, c = '', strong = false) => `<div class="ur-kv${strong ? ' strong' : ''}"><span>${label}</span><span class="${c}">${value}</span></div>`;
const seg = (act, options, value, label) => `<div class="ur-seg" role="group" aria-label="${esc(label)}">${options.map(([v, t]) =>
  `<button type="button" data-act="${act}" data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(t)}</button>`).join('')}</div>`;
const chip = (text, kind = '') => `<span class="ur-chip ${kind}">${esc(text)}</span>`;
function field(label, name, value, { unit = '', hint = '', mode = 'decimal', attr = 'data-f', placeholder = '' } = {}) {
  return `<label class="ur-field"><span>${esc(label)}</span><div class="ur-input">${unit === '$' ? '<i>$</i>' : ''}<input type="text" inputmode="${mode}" autocomplete="off" ${attr}="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}">${unit && unit !== '$' ? `<i>${esc(unit)}</i>` : ''}</div>${hint ? `<p class="ur-note">${hint}</p>` : ''}</label>`;
}
const inVal = (x) => (fin(x) && x !== 0 ? dec(x) : '');

const EXTRA_CSS = `
.yo-up { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 12px; background: var(--raise); border: 1px solid var(--line-2); }
.yo-q { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.yo-res { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.yo-res > div.wide { grid-column: 1 / -1; }
.yo-res > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.yo-res > div > span:first-child { font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.yo-res > div > span:last-child { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.yo-sub { display: flex; gap: 6px; }
.yo-subtab { flex: 1 1 0; display: flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line-2); color: var(--muted); font: 600 15px var(--font-c); text-decoration: none; white-space: nowrap; }
.yo-subtab[aria-current="page"] { color: var(--accent); border-color: var(--accent); background: var(--raise); }
`;

// Ekip puanı: ham takım puanı ve oyundaki etkili beceri (60'a kadar aynı, 60–80 arası her puan yarım, 80 üstü çeyrek; tam sayıya iner).
// Örnek: 66 → 63, 64 → 62, 80,50 → 70, 44,75 → 44. Etkiler (yönetim gideri, vergi, hız) etkili beceriden hesaplanır.
// "Yöneticileri yapıştır" kutusundaki metni okur. Sonuç: { parsed } ya da { error, link? }.
// Sık yanlış: kutuya sayfanın içeriği yerine adresin kendisi yapıştırılır; o zaman adresi açan bağlantı önerilir.
export function apiOku(text) {
  const t = String(text ?? '').trim();
  if (!t) return { error: 'Kutu boş. Adresi açın, açılan sayfadaki metnin tamamını kopyalayıp yapıştırın.' };
  const adres = /^(?:https?:\/\/)?(?:www\.)?simcompanies\.com\/api\/v\d+\/companies\/(\d+)\/executives\/?(?:\?\S*)?$/i.exec(t);
  if (adres) {
    return { error: 'Bu adresin kendisi, sayfanın içeriği değil. Adresi açın (oyuna girişli olmalısınız), açılan sayfadaki metnin tamamını seçip kopyalayın ve buraya yapıştırın.',
      link: `https://www.simcompanies.com/api/v3/companies/${adres[1]}/executives/` };
  }
  if (/^<(!doctype|html|head|body)/i.test(t)) return { error: 'Yapıştırdığınız şey bir web sayfası, veri değil. Oyuna girişliyken adresi açın ve sayfadaki metni kopyalayın.' };
  let obj;
  try { obj = JSON.parse(t); } catch { return { error: 'Metin okunamadı. Sayfadaki metnin tamamını kopyaladığınızdan emin olun.' }; }
  if (obj && !Array.isArray(obj) && !obj.executives && typeof obj.detail === 'string') {
    return { error: 'Oyun veri yerine hata döndürdü. Oyuna girişli olduğunuzdan ve şirket numarasının sizin şirketinize ait olduğundan emin olun.' };
  }
  try {
    const parsed = H.parseExecutives(obj);
    return parsed.length ? { parsed } : { error: 'Listede yönetici bulunamadı.' };
  } catch { return { error: 'Metin okunamadı. Sayfadaki metnin tamamını kopyaladığınızdan emin olun.' }; }
}

export function puanMetni(skor) {
  const etkili = H.effectiveSkill(skor);
  return { ham: num(skor, skor % 1 ? 2 : 0), etkili, farkli: Math.abs(etkili - skor) > 1e-9 };
}
const puanHtml = (skor) => {
  const p = puanMetni(skor);
  return `${p.ham}${p.farkli ? `<span class="ur-eff" title="Oyundaki etkili beceri">→ ${p.etkili}</span>` : ''}`;
};

// "Ekibinizin etkisi" (oyundaki tablo) sayıları. totalLevels: yönetim giderine giren toplam bina seviyesi (Üretim + Perakende + akademi);
// 0 ise yönetim gideri hesaplanamaz (brut ve kazanc null). team: H.teamEffects çıktısı (yalnız aktif yöneticiler).
export function etkiDegerleri(team, totalLevels, salariesDay) {
  const bilgiVar = totalLevels > 0;
  const brut = bilgiVar ? H.grossOverhead(totalLevels) * 100 : null;
  return {
    brut, kazanc: bilgiVar ? brut * Math.min(100, team.adminSavingsPct) / 100 : null,
    vergiTaban: H.TAX_BASE_THRESHOLD, vergiArtis: team.thresholdLift,
    satisHizi: team.salesSpeedPct, restoran: team.restaurantRating,
    patentTaban: H.PATENT_BASE_PCT, patent: team.patentPct,
    arastirma: team.researchSpeedPct, maas: salariesDay,
  };
}

const loadCompany = (r) => Y.loadCompanyRecord(r);
const saveCompany = (r, c) => Y.saveCompanyRecord(r, c);

async function loadProducts(r) {
  const path = PATHS.meta(`products_r${r}`);
  const docs = await readDocs([path]);
  const products = dataField(docs.get(path));
  if (!products || !Object.keys(products).length) throw new Error('Ürün listesi okunamadı.');
  return H.normalizeData({ products, realm: r }).products;
}
async function loadLive(r, options) {
  const docs = await readDocs([PATHS.live(r)], options);
  return dataField(docs.get(PATHS.live(r))) || null;
}

export function mountYonetim(root, { realm = 0 } = {}) {
  let r = realm;
  let { company } = loadCompany(r);
  let products = null;
  let productError = null;
  let live = null;
  let vwap = {}; // araştırma id → { price, source: 'vwap' | 'vwap-dün' } (bugünün ya da dünün ortalama satış fiyatı)
  let vwapLoading = new Set();
  let destroyed = false;
  let loadToken = 0;
  const saved = {};
  try { saved.tab = localStorage.getItem(TAB_KEY); saved.sim = localStorage.getItem(SIM_KEY); } catch { /* yok */ }
  const first = yonetimRota(location.hash.slice(1).split('/'), saved);
  let tab = first.tab;
  let sim = first.sim;
  let insaat = null; // İnşaat simülatörü (kendi modülü)
  try { history.replaceState(null, '', rotaAdresi(first)); } catch { /* yok */ }
  let draft = null; // yönetici formu: { index, e }
  let api = null; // { text, parsed, error }
  let toastTimer = null;

  const style = document.createElement('style');
  style.dataset.module = 'yonetim';
  style.textContent = CSS + EXTRA_CSS;
  document.head.append(style);
  root.innerHTML = '<div class="ur"><div data-nav style="display:contents"></div><div data-body style="display:contents"></div></div><div data-toast></div>';
  const view = root.querySelector('.ur');
  const navHost = root.querySelector('[data-nav]');
  const bodyHost = root.querySelector('[data-body]');
  const toastHost = root.querySelector('[data-toast]');

  // Kutuya yazıp hemen bir düğmeye dokununca "change" dokunmanın ortasında gelir; o anda çizim yapılırsa dokunma kaybolur.
  let pointerActive = false;
  let pendingRender = false;
  let settleTimer = null;
  const flush = () => { clearTimeout(settleTimer); pointerActive = false; if (pendingRender) render(); };
  const onPointerDown = () => { pointerActive = true; clearTimeout(settleTimer); };
  const onPointerUp = () => { clearTimeout(settleTimer); settleTimer = setTimeout(flush, 450); };
  const onAnyClick = () => setTimeout(flush, 0);
  const softRender = () => { if (pointerActive) pendingRender = true; else render(); };

  function toast(text) {
    toastHost.innerHTML = `<div class="ur-toast" role="status">${esc(text)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastHost.innerHTML = ''; }, 3200);
  }
  // silent: yazarken yalnız kaydeder; ekranı yeniden çizmez (klavye ve imleç kaybolmasın). Sonuçlar kutudan çıkınca yenilenir.
  function commit(next, { soft = false, silent = false } = {}) {
    company = Y.sanitizeCompany(next);
    if (!saveCompany(r, company)) toast('Tarayıcı kaydı açık değil; değişiklikler sayfa kapanınca kaybolur.');
    if (silent) return;
    ensureVwap();
    if (soft) softRender(); else render();
  }

  // ---- veri ----
  async function load() {
    const my = ++loadToken;
    products = null; productError = null; live = null; vwap = {}; vwapLoading = new Set();
    render();
    const [p, l] = await Promise.all([loadProducts(r).catch((e) => { productError = e?.message || String(e); return null; }), loadLive(r).catch(() => null)]);
    if (destroyed || my !== loadToken) return;
    products = p; live = l;
    render();
    ensureVwap();
  }
  const researchList = () => Object.values(products || {}).filter((p) => p.research).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const qualityList = () => Object.values(products || {}).filter((p) => H.hasQuality(p)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const nameOf = (id) => products?.[id]?.name || (id != null ? `#${id}` : '');
  const livePrice = (id) => live?.items?.[id]?.[1]?.[0]?.[0] ?? null;
  // Borsa fiyatı: bugünün VWAP'ı, yoksa dünün, yoksa son işlem fiyatı
  const marketOf = (id) => {
    if (id == null) return null;
    if (vwap[id]?.price != null) return vwap[id];
    const p = livePrice(id);
    return p != null ? { price: p, source: 'son işlem' } : null;
  };
  async function ensureVwap() {
    const ids = new Set([company.research.researchId, ...company.research.upgrades.map((u) => u.researchId)].filter((x) => x != null));
    const my = loadToken;
    for (const id of ids) {
      if (vwap[id] || vwapLoading.has(id)) continue;
      vwapLoading.add(id);
      const today = utcDay(Date.now());
      const yesterday = addDays(today, -1);
      loadProduct(r, id, { days: [today, yesterday] }).then(({ byDay }) => {
        if (destroyed || my !== loadToken) return;
        const pick = (day) => { const d = summarizeDay(byDay.get(day) || [])[0]; return d?.[5] > 0 ? d[6] / d[5] : null; };
        const t = pick(today);
        const y = t == null ? pick(yesterday) : null;
        vwap[id] = t != null ? { price: t, source: 'VWAP bugün' } : y != null ? { price: y, source: 'VWAP dün' } : { price: null };
        softRender();
      }).catch(() => { vwap[id] = { price: null }; }).finally(() => vwapLoading.delete(id));
    }
  }
  async function refreshPrices() {
    vwap = {};
    try { live = await loadLive(r, { refresh: true }); } catch { /* eski fiyatla devam */ }
    ensureVwap();
    render();
    toast('Fiyatlar yenilendi.');
  }

  // Elle girilmemiş fiyatları borsadan doldurup simülasyonu çalıştırır
  function resolved() {
    const c = company;
    const resPrice = c.research.price ?? marketOf(c.research.researchId)?.price ?? null;
    const upgrades = c.research.upgrades.map((u) => ({ ...u, price: u.price ?? marketOf(u.researchId)?.price ?? null }));
    return { ...c, research: { ...c.research, price: resPrice, upgrades } };
  }
  const simulate = () => Y.executiveSimulation(resolved());

  // ---- ekran ----
  function render() {
    if (destroyed) return;
    pendingRender = false;
    const tabsHtml = `<nav class="ur-tabs" aria-label="Yönetim bölümleri">${TABS.map(([k, t]) =>
      `<a href="#yonetim/${k === 'ekip' ? 'ekip' : `simulasyon/${sim}`}" ${k === tab ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;
    const subHtml = tab === 'simulasyon' ? `<nav class="yo-sub" aria-label="Simülasyon bölümleri">${SIM_TABS.map(([k, t]) =>
      `<a href="#yonetim/simulasyon/${k}" class="yo-subtab" ${k === sim ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>` : '';
    navHost.innerHTML = tabsHtml + subHtml;
    if (tab === 'simulasyon' && sim === 'insaat') {
      if (!insaat) { bodyHost.innerHTML = ''; insaat = mountInsaat(bodyHost, { realm: r }); }
      return;
    }
    if (insaat) { insaat.destroy(); insaat = null; }
    let body;
    try {
      const s = simulate();
      body = tab === 'ekip' ? viewEkip(s) : sim === 'muhasebe' ? viewMuhasebe(s) : viewArastirma(s);
    } catch (e) {
      console.error(e);
      body = `<div class="ur-msg err" role="alert">Bu ekran gösterilemedi: ${esc(e?.message || e)}</div>`;
    }
    const scroll = window.scrollY;
    bodyHost.innerHTML = body;
    window.scrollTo(0, scroll);
  }

  // ---- MUHASEBE/VERGİ ----
  function viewMuhasebe(s) {
    const c = company;
    return `<section class="ur-card" aria-labelledby="h-fin"><h2 id="h-fin">Nakit ve bono</h2>
        <p class="ur-sub">Vergi (muhasebe ücreti) ve muhasebecinin (CFO) sağladığı kazanç, nakit ve bonoya göre hesaplanır.</p>
        ${field('Nakit', 'finance.cash', inVal(c.finance.cash), { unit: '$', mode: 'numeric', hint: 'Oyunun sağ üstündeki yeşil tutar; tipik gün sonu nakdiniz.' })}
        <div class="ur-grid2">${field('Alınan bono', 'finance.bondsBought', inVal(c.finance.bondsBought), { unit: '$', mode: 'numeric' })}${field('İhraç edilen bono', 'finance.bondsIssued', inVal(c.finance.bondsIssued), { unit: '$', mode: 'numeric' })}</div>
        <div class="ur-box">${kv('Banka seviyesi', `${num(c.finance.bankLevel)} <span class="c-muted">(Üretim › Kurulum)</span>`)}
          ${kv('Vergilenen varlık', money(s.tax.assets))}${kv('Vergilendirme başlangıcı', money(s.tax.threshold))}
          ${kv('Günlük vergi', money(s.tax.day), 'c-price')}${kv('Yöneticisiz olsaydı', money(s.tax.withoutDay))}${kv('Muhasebenin günlük katkısı', money(s.sectors.cfo), 'c-up', true)}
          <p class="ur-note">Vergi kademelidir: eşiğin üstündeki tutara %0,5; eşiğin 3M, 6M ve 9M üstünde %0,5 daha, 12M üstünde %1 daha.</p></div></section>`;
  }

  // ---- YÖNETİCİLER ----
  function formCard() {
    const d = draft.e;
    const editing = draft.index != null;
    return `<section class="ur-card" aria-labelledby="h-form"><h2 id="h-form">${editing ? 'Yönetici düzenle' : 'Yönetici ekle'}</h2>
      <div class="ur-field"><span>Pozisyon</span><div class="ur-pos" role="group" aria-label="Pozisyon">${POSITIONS.map(([k, t]) => `<button type="button" data-act="dPos" data-v="${k}" aria-pressed="${k === '1' ? /^\d+$/.test(d.position) : d.position === k}">${t}</button>`).join('')}</div></div>
      <label class="ur-field"><span>İsim (isteğe bağlı)</span><input type="text" data-d="name" value="${esc(d.name)}" autocomplete="off"></label>
      <div class="ur-field"><span>Beceriler</span><div class="ur-grid2">${SKILL_LABELS.map(([k, t]) => `<label class="ur-field"><span style="font-size:13px">${t}</span><input type="text" inputmode="numeric" data-d="skill.${k}" value="${esc(inVal(d.skills[k]))}"></label>`).join('')}</div></div>
      ${field('Günlük maaş', 'salary', inVal(d.salary), { unit: '$', mode: 'numeric', attr: 'data-d' })}
      <div class="ur-field"><span>Durum</span>${seg('dActive', [['1', 'Aktif'], ['0', 'Eğitimde']], d.active ? '1' : '0', 'Durum')}<p class="ur-note">Eğitimde, yerleşmekte ya da grevde olan yönetici etki etmez, maaşı yine ödenir.</p></div>
      <div class="ur-row">${editing ? `<button type="button" class="ur-btn danger" data-act="execDel" aria-label="Yöneticiyi sil">${icon('trash')}</button>` : ''}
        <button type="button" class="ur-btn grow" data-act="formClose">Vazgeç</button><button type="button" class="ur-btn primary grow" data-act="execSave">${editing ? 'Kaydet' : 'Ekle'}</button></div></section>`;
  }
  function apiCard() {
    const p = api.parsed;
    return `<section class="ur-card" aria-labelledby="h-api"><h2 id="h-api">Yöneticileri yapıştır</h2>
      <p class="ur-sub">Oyuna girişliyken <b>simcompanies.com/api/v3/companies/ŞİRKET_NO/executives/</b> adresini açın, açılan sayfadaki metnin tamamını kopyalayıp buraya yapıştırın (adresi değil).</p>
      <textarea data-api spellcheck="false" autocapitalize="off" aria-label="API çıktısı">${esc(api.text || '')}</textarea>
      ${api.error ? `<div class="ur-msg err" role="alert">${esc(api.error)}</div>` : ''}
      ${api.link ? `<a class="ur-btn tint" href="${esc(api.link)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Adresi yeni sekmede aç</a>` : ''}
      ${p ? `<div class="ur-box">${kv('Bulunan yönetici', num(p.length))}${kv('Becerisi olan', num(p.filter((e) => e.skillsKnown).length))}${kv('Eğitimde ya da grevde', num(p.filter((e) => !e.active).length))}
        <p class="ur-note">Mevcut ${num(company.executives.length)} yöneticinin yerine geçer.</p></div>` : ''}
      <div class="ur-row"><button type="button" class="ur-btn grow" data-act="apiClose">Vazgeç</button>
        ${p ? '<button type="button" class="ur-btn primary grow" data-act="apiApply">Listeyi değiştir</button>' : '<button type="button" class="ur-btn primary grow" data-act="apiRead">Oku</button>'}</div></section>`;
  }
  // Ekibin günlük katkısı: eksik veri varsa sıfır yerine nereden girileceği yazılır
  function sectorCard(s) {
    const c = company;
    const has = { coo: c.admin.totalLevels > 0, cfo: c.finance.cash > 0, cmo: c.retail.marginDay > 0, cto: (c.parts?.uretim?.researchDay || 0) > 0 };
    const rows = SECTOR_LABELS.map(([k, name, what]) => (has[k]
      ? `<div class="ur-kv"><span>${name} <span class="c-muted">· ${what}</span></span><span class="c-up">${money(s.sectors[k], 0, true)}/gün</span></div>`
      : `<div class="ur-kv" style="align-items:flex-start"><span>${name}</span><span class="c-muted" style="text-align:right;font-size:13px;max-width:70%">${SECTOR_VERI[k][0]} <a href="${SECTOR_VERI[k][1]}" style="color:var(--accent)">${SECTOR_VERI[k][2]}</a></span></div>`)).join('');
    return `<section class="ur-card" aria-labelledby="h-kat"><h2 id="h-kat">Ekibin günlük katkısı</h2>
      <p class="ur-sub">Her yöneticinin alanı kendi verisinden hesaplanır. Yönetim gideri ve perakende marjı Üretim ve Perakende bölümlerinden otomatik gelir.</p>
      <div class="ur-box">${rows}</div></section>`;
  }
  // Ekibinizin etkisi: oyundaki tablonun karşılığı (sol: taban, sağ: ekibin eklediği)
  function etkiKarti(s) {
    const c = company;
    const E = etkiDegerleri(s.team, c.admin.totalLevels, s.salariesDay);
    const satir = (ad, taban, etki) => `<div class="ur-kv"><span>${ad}</span><span>${taban ? `<span class="c-muted">${taban}</span> ` : ''}<b class="c-up">${etki}</b></span></div>`;
    const yonetim = E.brut != null
      ? satir('Yönetim giderleri', `${NF[2].format(E.brut)}%`, `−${NF[2].format(E.kazanc)}%`)
      : `<div class="ur-kv" style="align-items:flex-start"><span>Yönetim giderleri</span><span class="c-muted" style="text-align:right;font-size:13px;max-width:70%">${SECTOR_VERI.coo[0]} <a href="${SECTOR_VERI.coo[1]}" style="color:var(--accent)">${SECTOR_VERI.coo[2]}</a></span></div>`;
    const pasif = c.executives.some((e) => !e.active);
    return `<section class="ur-card" aria-labelledby="h-etki"><h2 id="h-etki">Ekibinizin etkisi</h2>
      <p class="ur-sub">Oyundaki "Ekibinizin etkisi" tablosunun karşılığı: solda taban, sağda ekibin eklediği.</p>
      <div class="ur-box">${yonetim}
        ${satir('Vergilendirme başlangıcı', `$${NF[0].format(E.vergiTaban / 1e6)}M`, `+$${NF[1].format(E.vergiArtis / 1e6)}M`)}
        ${satir('Satış hızı', '0%', `+${NF[0].format(E.satisHizi)}%`)}
        ${satir('Restoran derecesi', '+0', `+${NF[3].format(E.restoran)}`)}
        ${satir('Patent olasılığı', `${NF[2].format(E.patentTaban)}%`, `+${NF[2].format(E.patent)}%`)}
        ${satir('Araştırma üretim hızı artışı', '', `${NF[1].format(E.arastirma)}%`)}
        ${kv('Toplam maaş', money(E.maas))}</div>
      ${pasif ? '<p class="ur-note">Bazı yöneticiler eğitim görüyor, yerleşiyor veya grev yapıyor ve şu anda katkıda bulunmuyor.</p>' : ''}
      <p class="ur-note">Yönetim giderleri yalnız Üretim ve Perakende'ye girdiğiniz binalardan hesaplanır; oyundaki değer tüm binalarınızı içerir.</p></section>`;
  }
  function viewEkip(s) {
    if (draft) return formCard();
    if (api) return apiCard();
    const ex = company.executives;
    const rows = ex.map((e, i) => {
      const m = s.members[i];
      const t = esc(e.name || positionName(e.position));
      return `<div class="ur-line" style="flex-wrap:wrap">
        <div class="grow" style="min-width:150px"><div class="title ${e.active ? '' : 'c-muted'}">${t}</div>
          <div class="ur-chips" style="margin-top:4px">${chip(positionName(e.position), e.active ? '' : 'muted')}<span class="ur-note" style="align-self:center">${money(e.salary)}/gün · net ${money(m.netDay, 0, true)}</span></div>
          <div class="ur-note" style="margin-top:2px">${SKILL_LABELS.map(([k, n]) => `${n} ${dec(e.skills[k])}`).join(' · ')}</div></div>
        <div class="ur-row" style="flex:1 1 200px"><div class="grow">${seg(`execActive.${i}`, [['1', 'Aktif'], ['0', 'Eğitimde']], e.active ? '1' : '0', `${t} durumu`)}</div>
          <button type="button" class="ur-btn" data-act="execEdit" data-v="${i}" aria-label="${t} düzenle">${icon('edit')}</button></div></div>`;
    }).join('');
    const scores = H.teamScores(ex);
    return `<section class="ur-card" aria-labelledby="h-exec"><h2 id="h-exec">Yöneticiler</h2>
      <p class="ur-sub">Ekibiniz yalnız burada girilir; Üretim ve Perakende hesapları da buradan okur.</p>
      <div class="ur-row"><button type="button" class="ur-btn tint grow" data-act="apiOpen">${icon('plus')}JSON ekle</button><button type="button" class="ur-btn grow" data-act="execNew">${icon('plus')}Manuel giriş</button></div>
      ${ex.length ? `<div>${rows}</div>` : '<p class="ur-note">Henüz yönetici yok.</p>'}
      ${ex.length ? `<div class="ur-box"><span class="ur-note" style="font-weight:600">Ekip puanı (yalnız aktifler)</span><div class="ur-grid4" style="margin-top:6px">${SKILL_LABELS.map(([k, n]) => `<div class="ur-stat"><span>${n}</span><span>${puanHtml(scores[k])}</span></div>`).join('')}</div>
        <p class="ur-note" style="margin-top:6px">Okun sağındaki sayı etkili beceridir (oyunda "etkili yetenek"): 60'a kadar aynı, 60–80 arası her puan yarım, 80 üstü çeyrek sayılır. Etkiler bu sayıdan hesaplanır.</p></div>` : ''}</section>${ex.length ? etkiKarti(s) + sectorCard(s) : ''}
      ${kisayolSatiri('uretimKurulum', 'perakendeKurulum', 'simulasyon')}`;
  }

  // ---- ARAŞTIRMA ----
  const priceTag = (manual, market) => (manual != null ? chip('Elle girildi', 'muted') : market?.price != null ? chip(`Borsa · ${market.source}`) : chip('Fiyat yok', 'down'));
  const options = (list, selected, empty) => `<option value="" ${selected == null ? 'selected' : ''}>${esc(empty)}</option>${list.map((p) => `<option value="${p.id}" ${Number(selected) === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`;
  function upgradeRow(u, i, row, rowNone) {
    const market = marketOf(u.researchId);
    return `<div class="yo-up">
      <div class="ur-grid2"><label class="ur-field"><span>Ürün</span><select data-u="${i}.product">${options(qualityList(), u.product, products ? 'Ürün seçin' : productError ? 'Liste okunamadı' : 'Yükleniyor…')}</select></label>
        <label class="ur-field"><span>Araştırma</span><select data-u="${i}.researchId">${options(researchList(), u.researchId, 'Araştırma seçin')}</select></label></div>
      <div class="yo-q">${field('Mevcut Q', `${i}.from`, String(u.from), { mode: 'numeric', attr: 'data-u' })}${field('Hedef Q', `${i}.to`, String(u.to), { mode: 'numeric', attr: 'data-u' })}
        ${field('Birim fiyat', `${i}.price`, u.price != null ? dec(u.price) : '', { unit: '$', attr: 'data-u', placeholder: market?.price != null ? NF[2].format(market.price) : '' })}</div>
      <div class="ur-chips">${priceTag(u.price, market)}</div>
      <div class="yo-res"><div><span>Patent</span><span>${num(row.patents)}</span></div><div><span>Araştırma</span><span>${num(row.research)}</span></div><div class="wide"><span>Maliyet</span><span class="c-price">${money(row.cost)}</span></div></div>
      ${row.patents > 0 && rowNone.research > row.research ? `<p class="ur-note">Bilim puanı olmasa ${num(rowNone.research)} araştırma${rowNone.cost != null ? `, ${money(rowNone.cost)}` : ''} gerekirdi.</p>` : ''}
      <div class="ur-row"><button type="button" class="ur-btn danger" data-act="upDel" data-v="${i}" aria-label="Satırı kaldır">${icon('trash')}Satırı kaldır</button></div></div>`;
  }
  function viewArastirma(s) {
    const c = company;
    const plan = s.plan;
    const none = s.planWithout;
    const rows = c.research.upgrades.map((u, i) => upgradeRow(u, i, plan.rows[i], none.rows[i])).join('');
    return `<section class="ur-card" aria-labelledby="h-up"><h2 id="h-up">Kalite planı</h2>
      <p class="ur-sub">Ürünlerinizi daha yüksek kaliteye çıkarmak için gereken patent ve araştırma. Gereken araştırma = patent ÷ patent olasılığı.</p>
      <div class="ur-box">${kv('Patent olasılığınız', `%${NF[2].format(plan.chancePct)}`, 'c-price', true)}<p class="ur-note">Taban %6,25, etkili bilim puanı başı +%0,0625 (bilim 60 → %10).</p></div>
      <div class="ur-row"><button type="button" class="ur-btn tint grow" data-act="upNew">${icon('plus')}Ürün ekle</button><button type="button" class="ur-btn grow" data-act="prices">${icon('refresh')}Fiyatları yenile</button></div>
      ${productError ? `<div class="ur-msg err">Ürün listesi okunamadı (${esc(productError)}). Fiyatları elle girebilirsiniz.</div>` : ''}
      ${rows || '<p class="ur-note">Henüz satır yok.</p>'}
      ${c.research.upgrades.length ? `<div class="ur-box"><span class="ur-note" style="font-weight:600">Toplam</span>
        ${kv('Patent', num(plan.patents))}${kv('Araştırma', num(plan.research))}${kv('Maliyet', money(plan.cost), 'c-price', true)}
        ${s.upgradeSaving > 0 ? `<div class="ur-hr"></div>${kv('Bilim puanı olmasa', money(none.cost))}${kv('Ekibinizin tasarrufu', money(s.upgradeSaving), 'c-up', true)}` : ''}
        ${plan.missingPrice ? '<p class="ur-note">Fiyatı olmayan satırlar maliyete katılmadı.</p>' : ''}</div>` : ''}</section>`;
  }

  // ---- olaylar ----
  const newExec = () => ({ id: uid('e'), name: '', position: 'o', salary: 0, skills: { coo: 0, cfo: 0, cmo: 0, cto: 0 }, active: true });
  function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const act = el.dataset.act;
    const v = el.dataset.v;
    if (act.startsWith('execActive.')) {
      const i = Number(act.split('.')[1]);
      return commit({ ...company, executives: company.executives.map((e, j) => (j === i ? { ...e, active: v === '1' } : e)) });
    }
    if (act === 'execNew') { draft = { index: null, e: newExec() }; api = null; return render(); }
    if (act === 'execEdit') { const i = Number(v); draft = { index: i, e: JSON.parse(JSON.stringify(company.executives[i])) }; return render(); }
    if (act === 'formClose') { draft = null; return render(); }
    if (act === 'dPos') { draft.e.position = v; return render(); }
    if (act === 'dActive') { draft.e.active = v === '1'; return render(); }
    if (act === 'execSave') {
      const list = [...company.executives];
      if (draft.index != null) list[draft.index] = draft.e; else list.push(draft.e);
      draft = null;
      commit({ ...company, executives: list });
      return toast('Kaydedildi.');
    }
    if (act === 'execDel') {
      const list = company.executives.filter((_, j) => j !== draft.index);
      draft = null;
      return commit({ ...company, executives: list });
    }
    if (act === 'apiOpen') { api = { text: '' }; draft = null; return render(); }
    if (act === 'apiClose') { api = null; return render(); }
    if (act === 'apiRead') {
      const text = root.querySelector('[data-api]')?.value || '';
      api = { text, ...apiOku(text) };
      return render();
    }
    if (act === 'apiApply') {
      const list = api.parsed.map((e) => ({ name: e.name, position: e.position, salary: e.salary, skills: e.skills, active: e.active }));
      api = null;
      commit({ ...company, executives: list });
      return toast(`${list.length} yönetici yüklendi.`);
    }
    if (act === 'upNew') {
      const last = company.research.upgrades[company.research.upgrades.length - 1];
      const u = { id: uid('u'), product: null, researchId: last?.researchId ?? null, from: 0, to: 1, price: null };
      return commit({ ...company, research: { ...company.research, upgrades: [...company.research.upgrades, u] } });
    }
    if (act === 'upDel') {
      const i = Number(v);
      return commit({ ...company, research: { ...company.research, upgrades: company.research.upgrades.filter((_, j) => j !== i) } });
    }
    if (act === 'prices') return refreshPrices();
  }
  function setPath(obj, path, value) {
    const [a, b] = path.split('.');
    return b ? { ...obj, [a]: { ...obj[a], [b]: value } } : { ...obj, [a]: value };
  }
  // Alan değerini şirket kaydına işler. Değişen bir şey yoksa null döner.
  function applyField(t) {
    if (t.dataset.f) {
      const path = t.dataset.f;
      const raw = t.value;
      let value;
      if (t.tagName === 'SELECT') value = raw === '' ? null : Number(raw);
      else if (path === 'research.price') value = raw.trim() === '' ? null : parseNum(raw, { ref: marketOf(company.research.researchId)?.price });
      else value = parseNum(raw) ?? 0;
      return setPath(company, path, value);
    }
    if (t.dataset.u) {
      const [i, k] = t.dataset.u.split('.');
      const raw = t.value;
      let value;
      if (k === 'product' || k === 'researchId') value = raw === '' ? null : Number(raw);
      else if (k === 'price') value = raw.trim() === '' ? null : parseNum(raw, { ref: marketOf(company.research.upgrades[Number(i)]?.researchId)?.price });
      else value = parseNum(raw) ?? 0;
      const upgrades = company.research.upgrades.map((u, j) => (j === Number(i) ? { ...u, [k]: value } : u));
      return { ...company, research: { ...company.research, upgrades } };
    }
    return null;
  }
  // Yazarken kaydet: her tuşta kısa gecikmeyle işlenir; kutudan çıkmak ya da sekme değiştirmek gerekmez.
  let typeTimer = null;
  let typeTarget = null;
  function flushTyping() {
    clearTimeout(typeTimer);
    typeTimer = null;
    const t = typeTarget;
    typeTarget = null;
    if (!t || destroyed || !t.isConnected) return;
    const next = applyField(t);
    if (next) commit(next, { silent: true });
  }
  function onChange(ev) {
    const t = ev.target;
    if (!(t.dataset.f || t.dataset.u)) return;
    clearTimeout(typeTimer); typeTimer = null; typeTarget = null;
    const next = applyField(t);
    if (next) commit(next, { soft: true });
  }
  function onInput(ev) {
    const t = ev.target;
    if ((t.dataset.f || t.dataset.u) && t.tagName !== 'SELECT') {
      typeTarget = t;
      clearTimeout(typeTimer);
      typeTimer = setTimeout(flushTyping, 350);
      return;
    }
    if (!t.dataset.d || !draft) return;
    const k = t.dataset.d;
    if (k === 'name') draft.e.name = t.value;
    else if (k === 'salary') draft.e.salary = Math.max(0, parseNum(t.value) ?? 0);
    else if (k.startsWith('skill.')) draft.e.skills[k.slice(6)] = Math.max(0, parseNum(t.value) ?? 0);
  }
  function onHash() {
    const parts = location.hash.slice(1).split('/');
    if (parts[0] !== 'yonetim') return;
    flushTyping();
    const x = yonetimRota(parts, { tab, sim });
    if (x.yonlendir) { try { history.replaceState(null, '', rotaAdresi(x)); } catch { /* yok */ } }
    if (x.tab === tab && x.sim === sim) return;
    tab = x.tab; sim = x.sim;
    draft = null; api = null;
    try { localStorage.setItem(TAB_KEY, tab); localStorage.setItem(SIM_KEY, sim); } catch { /* yok */ }
    render();
    window.scrollTo(0, 0);
  }

  root.addEventListener('click', onClick);
  root.addEventListener('click', onAnyClick, true);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('hashchange', onHash);
  load();

  return {
    setRealm(next) {
      if (next === r) return;
      flushTyping(); // yazılmakta olan değer eski realm'e kaydedilir
      r = next;
      ({ company } = loadCompany(r));
      draft = null; api = null;
      insaat?.setRealm(next);
      load();
    },
    destroy() {
      flushTyping();
      destroyed = true;
      insaat?.destroy(); insaat = null;
      clearTimeout(toastTimer); clearTimeout(settleTimer);
      root.removeEventListener('click', onClick);
      root.removeEventListener('click', onAnyClick, true);
      root.removeEventListener('change', onChange);
      root.removeEventListener('input', onInput);
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('hashchange', onHash);
      style.remove();
      root.replaceChildren();
    },
  };
}
