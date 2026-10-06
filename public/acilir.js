// DentSimco — açılır menüler (select) için tek davranış.
// Sorun: tarayıcının kendi açılır listesi, seçili kutuya yeniden dokununca kapanmak yerine kapanıp yeniden açılıyordu;
// "En kârlı 10 ürün" gibi katlanan başlıklar ise tekrar dokununca kapanıyordu.
// Çözüm: sayfadaki bütün <select>'ler bu modülün listesini açar. Açıkken aynı kutuya dokunmak, listenin dışına
// dokunmak ya da Esc listeyi KAPATIR. Seçim yapılınca kutunun değeri değişir ve normal "change" olayı gelir;
// bölümlerin mevcut dinleyicileri hiçbir değişiklik gerekmeden çalışır.
// Bir kutuyu bunun dışında tutmak için: <select data-native>.

const KENAR = 8;       // ekran kenarından en az bu kadar boşluk (px)
const EN_COK = 320;    // liste en çok bu yüksek (px)
const EN_AZ_ALT = 160; // aşağıda bu kadar yer yoksa yukarı açılır

// ---- Saf yardımcılar (sınanır) ----

// Liste yerleşimi: kutunun konumu (rect) ve ekran yüksekliğinden listenin üst/yükseklik/yönünü bulur
export function yerlesim(rect, ekranYuksekligi, istenen = EN_COK) {
  const alt = ekranYuksekligi - rect.bottom - KENAR;
  const ust = rect.top - KENAR;
  const yukari = alt < Math.min(istenen, EN_AZ_ALT) && ust > alt;
  const yer = yukari ? ust : alt;
  const yukseklik = Math.max(96, Math.min(istenen, yer - 4));
  const top = yukari ? Math.max(KENAR, rect.top - 4 - yukseklik) : rect.bottom + 4;
  return { top, yukseklik, yukari };
}

// Bir sonraki seçilebilir seçenek (devre dışı olanlar atlanır); dönmez, uçta durur
export function sonrakiSecenek(liste, mevcut, yon) {
  let i = mevcut;
  for (;;) {
    i += yon;
    if (i < 0 || i >= liste.length) return mevcut;
    if (!liste[i].disabled) return i;
  }
}

export const acilirMi = (el) => !!el && el.tagName === 'SELECT' && !el.multiple && !(el.size > 1) && !el.hasAttribute('data-native');

// ---- Görünüm ----

const CHEV = (renk, yukari) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='${yukari ? 'M5 12.5l5-5 5 5' : 'M5 7.5l5 5 5-5'}' fill='none' stroke='${renk}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>`)}")`;

const KOYU = '#9fb0c8';  // gece temasında ok rengi
const ACIK = '#5b6b85';  // gündüz temasında ok rengi
const OK = (secici, yukari) => `${secici} { background-image: ${CHEV(KOYU, yukari)}; }\n:root[data-theme="light"] ${secici} { background-image: ${CHEV(ACIK, yukari)}; }`;

const CSS = `
select:not([multiple]):not([data-native]) { appearance: none; -webkit-appearance: none; background-repeat: no-repeat; background-position: right 12px center; background-size: 18px 18px; padding-right: 40px; }
${OK('select:not([multiple]):not([data-native])', false)}
${OK('select[aria-expanded="true"]:not([data-native])', true)}
.ac-list { position: fixed; z-index: 10000; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; margin: 0; padding: 4px; list-style: none;
  background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 10px 28px rgba(0,0,0,.28); font: 500 16px/1.3 var(--font-c, system-ui, sans-serif); }
.ac-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
.ac-list li[aria-selected="true"] { color: var(--accent); font-weight: 600; }
.ac-list li[aria-selected="true"]::after { content: "✓"; font-weight: 700; }
.ac-list li.ac-aktif { background: var(--raise-2); }
.ac-list li[aria-disabled="true"] { opacity: .5; cursor: default; }
`;

let stil = null;
let acik = null; // { sel, ul, aktif, secenekler, izle }

function stilEkle() {
  if (stil || typeof document === 'undefined') return;
  stil = document.createElement('style');
  stil.setAttribute('data-acilir', '');
  stil.textContent = CSS;
  document.head.appendChild(stil);
}

export function kapat({ odak = false } = {}) {
  if (!acik) return;
  const { sel, ul, izle } = acik;
  acik = null;
  clearInterval(izle);
  ul.remove();
  try { sel.removeAttribute('aria-expanded'); sel.removeAttribute('aria-activedescendant'); } catch { /* kutu silinmiş olabilir */ }
  if (odak && sel.isConnected) { try { sel.focus({ preventScroll: true }); } catch { /* önemsiz */ } }
}

function konumla() {
  if (!acik) return;
  const { sel, ul } = acik;
  const rect = sel.getBoundingClientRect();
  const y = yerlesim(rect, window.innerHeight);
  ul.style.left = `${Math.max(KENAR, rect.left)}px`;
  ul.style.width = `${Math.min(rect.width, window.innerWidth - 2 * KENAR)}px`;
  ul.style.top = `${y.top}px`;
  ul.style.maxHeight = `${y.yukseklik}px`;
}

function vurgula(i) {
  if (!acik) return;
  const { ul, secenekler } = acik;
  acik.aktif = i;
  [...ul.children].forEach((li, k) => li.classList.toggle('ac-aktif', k === i));
  const li = ul.children[i];
  if (li) {
    acik.sel.setAttribute('aria-activedescendant', li.id);
    li.scrollIntoView?.({ block: 'nearest' });
  }
  return secenekler[i];
}

function sec(i) {
  if (!acik) return;
  const { sel, secenekler } = acik;
  const o = secenekler[i];
  if (!o || o.disabled) return;
  const degisti = sel.selectedIndex !== i;
  sel.selectedIndex = i;
  kapat({ odak: true });
  if (degisti) {
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export function ac(sel) {
  if (!acilirMi(sel) || sel.disabled) return;
  if (acik?.sel === sel) { kapat({ odak: true }); return; } // açıkken aynı kutuya dokunmak KAPATIR
  kapat();
  stilEkle();
  const secenekler = [...sel.options];
  const ul = document.createElement('ul');
  ul.className = 'ac-list';
  ul.setAttribute('role', 'listbox');
  const taban = `ac-${Math.random().toString(36).slice(2, 7)}`;
  secenekler.forEach((o, i) => {
    const li = document.createElement('li');
    li.id = `${taban}-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(o.selected));
    if (o.disabled) li.setAttribute('aria-disabled', 'true');
    li.dataset.i = String(i);
    li.textContent = o.textContent;
    ul.appendChild(li);
  });
  document.body.appendChild(ul);
  sel.setAttribute('aria-expanded', 'true');
  // Kutu başka bir çizimle silinirse liste de kapanır
  const izle = setInterval(() => { if (!acik || !acik.sel.isConnected) kapat(); }, 250);
  acik = { sel, ul, secenekler, aktif: Math.max(0, sel.selectedIndex), izle };
  konumla();
  vurgula(acik.aktif);
}

// ---- Olaylar ----

let bagli = false;

function engelle(ev) {
  const sel = ev.target?.closest?.('select');
  if (!acilirMi(sel)) return;
  if (ev.cancelable) ev.preventDefault(); // tarayıcının kendi listesi açılmasın
}

function dokunma(ev) {
  const sel = ev.target?.closest?.('select');
  if (acilirMi(sel)) { ev.preventDefault(); ac(sel); return; }
  if (!acik) return;
  if (acik.ul.contains(ev.target)) {
    const li = ev.target.closest('li');
    if (li) { ev.preventDefault(); sec(Number(li.dataset.i)); }
    return;
  }
  kapat(); // listenin ve kutunun dışına dokunuldu
}

function tus(ev) {
  const sel = ev.target;
  if (acik) {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); kapat({ odak: true }); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); vurgula(sonrakiSecenek(acik.secenekler, acik.aktif, ev.key === 'ArrowDown' ? 1 : -1)); return; }
    if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); vurgula(sonrakiSecenek(acik.secenekler, ev.key === 'Home' ? -1 : acik.secenekler.length, ev.key === 'Home' ? 1 : -1)); return; }
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); sec(acik.aktif); return; }
    if (ev.key === 'Tab') kapat();
    return;
  }
  if (acilirMi(sel) && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(ev.key)) { ev.preventDefault(); ac(sel); }
}

export function acilirlariBagla() {
  if (bagli || typeof document === 'undefined') return;
  bagli = true;
  stilEkle();
  document.addEventListener('mousedown', engelle, true);
  document.addEventListener('pointerdown', (ev) => { engelle(ev); if (acik && !acik.ul.contains(ev.target) && !(ev.target?.closest?.('select') === acik.sel)) kapat(); }, true);
  document.addEventListener('click', dokunma, true);
  document.addEventListener('keydown', tus, true);
  window.addEventListener('resize', () => kapat());
  window.addEventListener('scroll', (ev) => { if (acik && !acik.ul.contains(ev.target)) kapat(); }, true);
  window.addEventListener('hashchange', () => kapat());
}
