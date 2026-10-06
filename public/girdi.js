// DentSimco — sayı kutularında yazarken binlik nokta (20.000.000).
// Yalnız tam sayı kutularına (inputmode="numeric") uygulanır. Ondalık kutulara (fiyat, yüzde) dokunmaz:
// orada "2.345" hem 2,345 hem 2345 olabilir; o kutular zaten kutudan çıkınca okunur.
//
// Kural: yazılan her şeyden yalnız rakamlar (ve başta eksi) alınır, sağdan üçerli noktayla gruplanır.
// İmleç, kendinden önceki rakam sayısına göre geri konur; böylece ortadan rakam silmek ya da eklemek imleci kaydırmaz.
// "20.000.00" → rakamlar 2000000 → "2.000.000".

const MAX_RAKAM = 15; // 15 haneden uzun sayı güvenli tam sayı sınırını aşar

// Saf işlev: metin ve imleç konumu (kutudaki karakter sırası) alır, { metin, imlec } döner.
export function gruplaYaz(metin, imlec = null) {
  const ham = String(metin ?? '');
  const sonu = imlec == null ? ham.length : Math.max(0, Math.min(Number(imlec), ham.length));
  const eksi = /^\s*[-\u2212]/.test(ham);
  let rakamlar = ham.replace(/\D/g, '');
  const imlecOncesi = ham.slice(0, sonu).replace(/\D/g, '').length;
  rakamlar = rakamlar.replace(/^0+(?=\d)/, ''); // baştaki sıfırlar atılır ("007" → "7")
  const attigimiz = ham.replace(/\D/g, '').length - rakamlar.length;
  if (rakamlar.length > MAX_RAKAM) rakamlar = rakamlar.slice(0, MAX_RAKAM);
  if (!rakamlar) return { metin: eksi ? '-' : '', imlec: eksi ? 1 : 0 };
  const gruplu = rakamlar.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const onEk = eksi ? '-' : '';
  const hedef = Math.max(0, Math.min(rakamlar.length, imlecOncesi - Math.min(attigimiz, imlecOncesi)));
  // hedef: imleçten önce kaç rakam olacak; gruplu metinde o rakamın sonrasına denk gelen konum
  let say = 0;
  let konum = 0;
  while (konum < gruplu.length && say < hedef) { if (gruplu[konum] !== '.') say++; konum++; }
  return { metin: onEk + gruplu, imlec: onEk.length + konum };
}

// Bu kutu yazarken gruplanır mı?
export function gruplanirMi(el) {
  return !!el && el.tagName === 'INPUT' && el.getAttribute('inputmode') === 'numeric'
    && (el.type === 'text' || el.type === '') && !el.hasAttribute('data-gruplama-yok');
}

function onInput(ev) {
  const el = ev.target;
  if (!gruplanirMi(el) || ev.isComposing) return;
  const onceki = el.value;
  let imlec = null;
  try { imlec = el.selectionStart; } catch { imlec = null; }
  const yeni = gruplaYaz(onceki, imlec);
  if (yeni.metin === onceki) return;
  el.value = yeni.metin;
  try { el.setSelectionRange(yeni.imlec, yeni.imlec); } catch { /* bazı tarayıcılar izin vermez */ }
}

let bagli = false;
// Sayfa başında bir kez çağrılır. Yakalama aşamasında çalışır: bölümlerin kendi "input" dinleyicileri
// kutuyu zaten gruplanmış değerle görür.
export function girdiyiBagla() {
  if (bagli || typeof document === 'undefined') return;
  bagli = true;
  document.addEventListener('input', onInput, true);
}
