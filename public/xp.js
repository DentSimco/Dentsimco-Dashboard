// DentSimco — Tecrübe (XP) hesaplayıcısı (Kâr Hesaplayıcı › Tecrübe).
// Şirketin bir sonraki seviyeye ya da hedef seviyeye ne zaman ulaşacağını saatlik XP gelirinden hesaplar.
// Hesap kuralları hesap-xp.js'te; burada yalnız ekran ve tarayıcı kaydı var (dentsimco.xp). Ağ isteği yoktur.
// Ekran metni Türkçedir; seçili dil Türkçe değilse i18n.js sayfayı çevirir.

import { LOCALE, DIL } from './i18n.js';
import { CSS as URETIM_CSS, parseNum } from './uretim.js';
import * as X from './hesap-xp.js';

const KEY = 'dentsimco.xp';
const NF = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kv = (label, value, strong = false) => `<div class="ur-kv${strong ? ' strong' : ''}"><span>${label}</span><span>${value}</span></div>`;

// Alan adı, etiket, birim, ipucu, ondalık mı
const ALANLAR = [
  ['currentLevel', 'Mevcut seviye', '', '', false],
  ['progressValue', 'Bu seviyedeki ilerleme', '%', 'Oyunda seviyenizin altındaki çubuğun doluluğu (0–100).', true],
  ['targetLevel', 'Hedef seviye', '', '', false],
  ['operatingBuildings', 'Çalışan bina sayısı', '', 'Üretim yapan ya da satış yapan binalar; her biri saatte 12 XP.', false],
  ['numRecreationBuildings', 'Dinlenme binası sayısı', '', 'Her biri saatte 120 XP.', false],
  ['abundanceSlots', 'Bolluk yuvası sayısı', '', 'Her yuva tam gün çalışınca saatte 36 XP.', false],
  ['abundanceHours', 'Bolluk süresi', 'saat/gün', 'Bolluğun günde kaç saat açık olduğu (0–24).', true],
];

function yukle() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return { ...X.VARSAYILAN, ...s };
  } catch { /* gizli sekme */ }
  return { ...X.VARSAYILAN };
}

// "12,5" / "1.200" gibi yazıları sayıya çevirir; boş kutu boş kalır (hesapta 0 sayılır)
const oku = (metin) => (String(metin).trim() === '' ? '' : parseNum(metin) ?? '');

// Süre: Türkçede "13 gün 1 saat"; diğer dillerde "13 d 1 h" (insaat.js ile aynı kural, sözlükle çevrilmez)
function sureMetni(saat) {
  if (!Number.isFinite(saat)) return '∞';
  if (saat <= 0) return '0';
  const tr = DIL === 'tr';
  if (saat < 1) return tr ? '1 saatten az' : '< 1 h';
  const gun = Math.floor(saat / 24);
  const kalan = Math.round(saat - gun * 24);
  const g = gun >= 1 ? `${NF.format(gun)} ${tr ? 'gün' : 'd'}` : '';
  const s = kalan >= 1 ? `${kalan} ${tr ? 'saat' : 'h'}` : '';
  return [g, s].filter(Boolean).join(' ') || (tr ? '1 saatten az' : '< 1 h');
}

const tarihMetni = (d) => (d ? d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function mountXp(host) {
  let durum = yukle();
  const style = document.createElement('style');
  style.dataset.module = 'xp';
  style.textContent = `${URETIM_CSS}
.xp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.xp-err { color: var(--down); font-size: 13px; margin: 0; }
.xp-big { font: 600 26px/1.1 var(--font-c); color: var(--accent); font-variant-numeric: tabular-nums; }`;
  document.head.append(style);

  const alanHtml = ([ad, etiket, birim, ipucu, ondalik]) => `
    <label class="ur-field"><span>${etiket}</span>
      <div class="ur-input"><input type="text" inputmode="${ondalik ? 'decimal' : 'numeric'}" autocomplete="off" data-xp="${ad}" value="${esc(durum[ad])}">${birim ? `<i>${birim}</i>` : ''}</div>
      ${ipucu ? `<p class="ur-note">${ipucu}</p>` : ''}<p class="xp-err" data-hata="${ad}" hidden></p></label>`;

  host.innerHTML = `<div class="ur">
    <h1>Tecrübe (XP)</h1>
    <p class="ur-sub">Şirketinizin hedef seviyeye ne zaman ulaşacağını saatlik XP gelirinizden hesaplar. Oyunun bu iş için herkese açık bir API'si olmadığından seviye tablosu sabit değerlerle çalışır; girdilerinizi siz yazarsınız.</p>
    <section class="ur-card"><div class="xp-grid">${ALANLAR.map(alanHtml).join('')}</div></section>
    <section class="ur-card" data-xp-sonuc aria-live="polite"></section>
  </div>`;
  const sonuc = host.querySelector('[data-xp-sonuc]');

  function boya() {
    const r = X.hesapla(durum);
    for (const [ad] of ALANLAR) {
      const p = host.querySelector(`[data-hata="${ad}"]`);
      const e = r.errors.find((x) => x.field === ad);
      p.hidden = !e;
      p.textContent = e ? e.message : '';
    }
    if (r.errors.length) {
      sonuc.innerHTML = '<p class="ur-note">Sonuç için kutulardaki uyarıları düzeltin.</p>';
      return;
    }
    const sonsuz = !Number.isFinite(r.timeInHours);
    sonuc.innerHTML = `
      <div class="ur-box"><span class="ur-note">Hedefe kalan süre</span>
        <span class="xp-big">${sonsuz ? 'Hesaplanamıyor' : sureMetni(r.timeInHours)}</span>
        ${sonsuz ? '<p class="ur-note">Saatlik XP 0; en az bir bina ya da bolluk yuvası girin.</p>' : kv('Tahmini tarih', tarihMetni(r.targetDate), true)}</div>
      ${kv('Gereken toplam XP', NF.format(Math.ceil(r.totalXPNeeded)))}
      ${kv('Saatlik XP', `${NF1.format(r.hourlyXP)} XP/saat`)}
      ${kv('Çalışan binalar', `${NF1.format(r.operatingXP)} XP/saat`)}
      ${kv('Dinlenme binaları', `${NF1.format(r.recreationXP)} XP/saat`)}
      ${kv('Bolluk', `${NF1.format(r.abundanceXP)} XP/saat`)}`;
  }

  function onInput(ev) {
    const ad = ev.target?.dataset?.xp;
    if (!ad) return;
    durum = { ...durum, [ad]: oku(ev.target.value) };
    // Mevcut seviye hedefe eşit ya da büyükse hedef bir üste alınır (Cooper'ın aracındaki gibi)
    if (ad === 'currentLevel' && durum.currentLevel !== '' && Number(durum.targetLevel) <= Number(durum.currentLevel)) {
      durum.targetLevel = Number(durum.currentLevel) + 1;
      host.querySelector('[data-xp="targetLevel"]').value = durum.targetLevel;
    }
    try { localStorage.setItem(KEY, JSON.stringify(durum)); } catch { /* kayıt yoksa hesap yine çalışır */ }
    boya();
  }
  host.addEventListener('input', onInput);
  boya();

  return {
    setRealm() { /* XP tablosu realm'e bağlı değil */ },
    destroy() { host.removeEventListener('input', onInput); style.remove(); host.innerHTML = ''; },
  };
}
