// DentSimco — dil seçimi ve çeviri katmanı.
//
// Kaynak metin Türkçedir ve kodda olduğu gibi kalır. Seçili dil Türkçe değilse sayfadaki metin, sözlükteki
// (dil-xx.js) karşılığıyla değiştirilir: ekrana eklenen her yazı ve title / aria-label / placeholder / alt
// öznitelikleri izlenir (MutationObserver). Böylece ekran dosyaları değişmeden çevrilir; yeni bir ekran ya da
// yeni bir dil için yalnız sözlük büyür.
//
// Sözlük anahtarları:
//   'Ürün seç'                       tam eşleşme (boşluklar sadeleştirilerek)
//   'Son nokta: {0}'                 kalıp; {0} yerindeki parça da ayrıca çevrilir
//   'Fiyat {0:yukarıda|aşağıda}'     kalıp; {0} yalnız bu seçeneklerden biri olabilir
// Yeni dil eklemek: dil-xx.js dosyası + DILLER listesine bir satır + aşağıdaki SOZLUKLER'e bir satır.

import EN from './dil-en.js';

export const DILLER = [['tr', 'Türkçe'], ['en', 'English']];
const SOZLUKLER = { en: EN };
const YERELLER = { tr: 'tr-TR', en: 'en-US' };
const KEY = 'dentsimco.dil';

function secilenDil() {
  if (typeof document === 'undefined') return 'tr'; // sınamalar ve sunucu: kaynak dil
  try {
    const v = localStorage.getItem(KEY);
    if (DILLER.some(([k]) => k === v)) return v;
  } catch { /* gizli sekme */ }
  const n = String(globalThis.navigator?.language || '').toLowerCase();
  return n.startsWith('tr') ? 'tr' : 'en';
}

export const DIL = secilenDil();
export const LOCALE = YERELLER[DIL] || 'tr-TR';

// ---- Sözlük derleme ----
const sade = (s) => String(s).replace(/\s+/g, ' ').trim();
const kacir = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const YER = /\{(\d+)(?::([^}]*))?\}/g;

export function sozlukDerle(sozluk) {
  const tam = new Map();
  const kaliplar = [];
  for (const [k0, v] of Object.entries(sozluk || {})) {
    const k = sade(k0);
    if (!YER.test(k)) { tam.set(k, v); continue; }
    YER.lastIndex = 0;
    let re = '^';
    let son = 0;
    let sabit = 0;
    const sira = [];
    for (const m of k.matchAll(YER)) {
      const once = k.slice(son, m.index);
      re += kacir(once);
      sabit += once.length;
      sira.push(Number(m[1]));
      re += m[2] ? `(${m[2].split('|').map((x) => kacir(sade(x))).join('|')})` : '(.*?)'; // boş da olabilir ("…{2}" sondaki ek cümle gibi)
      son = m.index + m[0].length;
    }
    const kalan = k.slice(son);
    re += `${kacir(kalan)}$`;
    sabit += kalan.length;
    // Yapısal kalıp ("{0}. {1}.", "• {0}"): sabit metni çevrilmez; ancak içindeki bir parça çevrilirse kullanılır
    const yapisal = sade(v) === k.replace(YER, (_, n) => `{${n}}`);
    kaliplar.push({ re: new RegExp(re, 'u'), v, sira, sabit, yapisal });
  }
  kaliplar.sort((a, b) => b.sabit - a.sabit); // sabit metni uzun olan (daha özel) kalıp önce denenir
  return { tam, kaliplar };
}

const DERLI = DIL === 'tr' ? null : sozlukDerle(SOZLUKLER[DIL]);
const ONBELLEK = new Map();
const HARF = /[A-Za-zÇĞİÖŞÜçğıöşü]/;

// Türkçede yüzde işareti sayıdan önce gelir (%5, +%9,5); İngilizcede sonra (5%, +9.5%)
const yuzdeSona = (s) => s.replace(/%(\u2060?)(\d+(?:[.,]\d+)*)/g, '$1$2%');

function cevirIc(metin, d, derinlik) {
  const s = sade(metin);
  if (!s || !HARF.test(s)) return null;
  const tam = d.tam.get(s);
  if (tam != null) return tam;
  if (derinlik > 4) return null;
  for (const k of d.kaliplar) {
    const m = k.re.exec(s);
    if (!m) continue;
    const parca = k.sira.map((no, i) => [no, m[i + 1]]);
    let cevrilen = 0;
    const sonuc = k.v.replace(/\{(\d+)\}/g, (_, no) => {
      const p = parca.find(([n]) => n === Number(no));
      if (!p) return '';
      const ic = cevirIc(p[1], d, derinlik + 1);
      if (ic == null) return p[1];
      cevrilen++;
      return `${p[1].match(/^\s*/)[0]}${ic}${p[1].match(/\s*$/)[0]}`; // parçanın baş ve sonundaki boşluk korunur
    });
    if (k.yapisal && !cevrilen) continue; // hiçbir şey çevirmeyen yapısal kalıp: sıradaki kalıp denenir
    return sonuc;
  }
  // Son çare: liste hâlinde birleştirilmiş metin ("Yönetim 64 · Muhasebe 10", "Girdi alımları %89, Bina maaşları %2")
  for (const ayrac of [' · ', ', ']) {
    if (!s.includes(ayrac)) continue;
    let degisti = false;
    const out = s.split(ayrac).map((p) => {
      const c = cevirIc(p, d, derinlik + 1);
      if (c == null) return p;
      degisti = true;
      return c;
    });
    if (degisti) return out.join(ayrac);
  }
  return null;
}

// Bir metni seçili dile çevirir (bulunamazsa olduğu gibi döner). Baştaki ve sondaki boşluklar korunur.
export function cevirMetin(metin, d = DERLI, dil = DIL) {
  if (!d || metin == null) return metin;
  const raw = String(metin);
  if (d === DERLI && ONBELLEK.has(raw)) return ONBELLEK.get(raw);
  const bas = raw.match(/^\s*/)[0];
  const son = raw.match(/\s*$/)[0];
  const ic = cevirIc(raw, d, 0);
  let out = ic != null ? `${bas}${ic}${son}` : raw;
  if (dil !== 'tr') out = yuzdeSona(out);
  if (d === DERLI) {
    if (ONBELLEK.size > 6000) ONBELLEK.clear();
    ONBELLEK.set(raw, out);
  }
  return out;
}
// Kodda (tuval, onay penceresi gibi DOM dışı yerlerde) kullanmak için kısa ad
export const t = (metin) => cevirMetin(metin);

// ---- Sayfayı çevirme ----
const OZNITELIK = ['title', 'aria-label', 'placeholder', 'alt'];
const ATLA = 'script,style,textarea,[data-no-t],[contenteditable="true"]'; // metni çevrilmeyenler (kullanıcının yazdığı alanlar)
const ATLA_OZ = '[data-no-t]'; // öznitelikleri çevrilmeyenler (yazı kutusunun etiketi çevrilir, içeriği çevrilmez)

function metinDugumu(n) {
  const p = n.parentElement;
  if (!p || p.closest(ATLA)) return;
  const v = n.nodeValue;
  if (!v || !/\S/.test(v)) return;
  const c = cevirMetin(v);
  if (c !== v) n.nodeValue = c;
}
function oznitelikler(el) {
  if (el.closest(ATLA_OZ)) return;
  for (const a of OZNITELIK) {
    if (!el.hasAttribute(a)) continue;
    const v = el.getAttribute(a);
    const c = cevirMetin(v);
    if (c !== v) el.setAttribute(a, c);
  }
}
export function agaciCevir(kok) {
  if (!DERLI || !kok) return;
  if (kok.nodeType === 3) { metinDugumu(kok); return; }
  if (kok.nodeType !== 1) return;
  oznitelikler(kok);
  const w = document.createTreeWalker(kok, 1 | 4); // NodeFilter.SHOW_ELEMENT | SHOW_TEXT
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) metinDugumu(n);
    else oznitelikler(n);
  }
}
export function izle(kok = document.documentElement) {
  document.documentElement.lang = DIL;
  if (!DERLI) return;
  agaciCevir(kok);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(agaciCevir);
      else if (m.type === 'characterData') metinDugumu(m.target);
      else if (m.type === 'attributes') oznitelikler(m.target);
    }
  }).observe(kok, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: OZNITELIK });
}

// ---- Dil menüsü: düğmeye dokununca altında küçük bir liste açılır ----
export function dilSec(dil) {
  try { localStorage.setItem(KEY, dil); } catch { /* gizli sekme: yalnız bu açılışta */ }
  location.reload();
}
export function dilMenusuBagla(dugme, menu) {
  if (!dugme || !menu) return;
  dugme.textContent = DIL.toUpperCase();
  dugme.setAttribute('aria-label', DIL === 'tr' ? 'Dil: Türkçe' : 'Language: English');
  menu.innerHTML = DILLER.map(([k, ad]) => `<li role="none"><button type="button" role="menuitemradio" data-dil="${k}" aria-checked="${k === DIL}"><span>${ad}</span><b>${k.toUpperCase()}</b></button></li>`).join('');
  const ac = (acik) => {
    menu.hidden = !acik;
    dugme.setAttribute('aria-expanded', String(acik));
    if (acik) menu.querySelector('[aria-checked="true"]')?.focus();
  };
  dugme.addEventListener('click', (e) => { e.stopPropagation(); ac(menu.hidden); });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dil]');
    if (!b) return;
    if (b.dataset.dil === DIL) { ac(false); return; }
    dilSec(b.dataset.dil);
  });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== dugme) ac(false); });
  document.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'Escape') { ac(false); dugme.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...menu.querySelectorAll('[data-dil]')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    e.preventDefault();
  });
}
