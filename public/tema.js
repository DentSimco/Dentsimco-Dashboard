// DentSimco — görünüm (gündüz / gece / otomatik).
// Tercih tarayıcıda saklanır (dentsimco.tema). Otomatik: cihazın açık/koyu ayarını izler.
// Tema <html data-theme="light|dark"> ile uygulanır; renkler index.html'deki değişkenlerden gelir.
// Grafikler 'dentsimco-tema' olayını dinleyip yeniden çizilir.

export const TEMA_ANAHTAR = 'dentsimco.tema';
export const SIRA = ['auto', 'light', 'dark'];
export const AD = { auto: 'Otomatik (cihaz ayarı)', light: 'Gündüz', dark: 'Gece' };
const META_RENK = { light: '#f1f4f9', dark: '#080d16' };

export function tercihOku() {
  try { const t = localStorage.getItem(TEMA_ANAHTAR); return SIRA.includes(t) ? t : 'auto'; } catch { return 'auto'; }
}
export function tercihYaz(t) {
  try { localStorage.setItem(TEMA_ANAHTAR, t); return true; } catch { return false; }
}
export function cihazAcik() {
  try { return !!window.matchMedia?.('(prefers-color-scheme: light)').matches; } catch { return false; }
}
// Tercihten gerçek temayı bulur: 'light' | 'dark'
export const cozumle = (tercih, acikCihaz = cihazAcik()) => (tercih === 'light' ? 'light' : tercih === 'dark' ? 'dark' : acikCihaz ? 'light' : 'dark');
export const sonraki = (tercih) => SIRA[(SIRA.indexOf(tercih) + 1) % SIRA.length];

export function uygula(tercih = tercihOku()) {
  const tema = cozumle(tercih);
  const root = document.documentElement;
  if (root.getAttribute('data-theme') !== tema) root.setAttribute('data-theme', tema);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_RENK[tema]);
  window.dispatchEvent(new CustomEvent('dentsimco-tema', { detail: { tema, tercih } }));
  return tema;
}

const IKON = {
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  dark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
};

// Düğmeyi bağlar: her dokunuşta Otomatik → Gündüz → Gece döner. Cihaz ayarı değişirse otomatikteyken izler.
export function dugmeyiBagla(btn) {
  let tercih = tercihOku();
  const boya = () => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[tercih]}</svg>`;
    const metin = `Görünüm: ${AD[tercih]}. Değiştirmek için dokunun.`;
    btn.setAttribute('aria-label', metin);
    btn.title = metin;
  };
  btn.addEventListener('click', () => { tercih = sonraki(tercih); tercihYaz(tercih); uygula(tercih); boya(); });
  const mq = window.matchMedia?.('(prefers-color-scheme: light)');
  const izle = () => { if (tercih === 'auto') uygula('auto'); };
  mq?.addEventListener?.('change', izle);
  boya();
  uygula(tercih);
  return () => { mq?.removeEventListener?.('change', izle); };
}
