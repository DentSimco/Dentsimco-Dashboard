// DentSimco — Restoran bölümü parola kapısı
// Parola kodda yazılı değildir; yalnız tuzlu PBKDF2 özeti (SHA-256, 310,000 tur) vardır. Doğru parola girilince özet bu tarayıcıda saklanır.
// DİKKAT: Site statik olduğu için bu kapı gerçek bir kilit değildir; ziyaretçiyi kapıdan döndürür, ama kodu okuyan kişi aşabilir ve
// borsa verisi herkese açıktır. Parola 8 haneli sayı olduğundan özetten çözülebilir. Gerçek koruma için sunucu tarafı oturum gerekir.

export const KILIT = { tuz: 'eb385cf3679b96667ff0a78531667681', tur: 310000, ozet: 'c30d41d148dca3005ea18382f37bedee57fe99f8b4da5b834d6e4b77e1ce6c34' };
export const KILIT_ANAHTAR = 'dentsimco.restoran.erisim';
export const BEKLEME_MS = 1500; // yanlış denemeden sonra yeni denemeye kadar

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const bayt = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

// Parolanın özeti (hex)
export async function ozetle(parola, k = KILIT) {
  const anahtar = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(parola)), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bayt(k.tuz), iterations: k.tur }, anahtar, 256));
}

// Bu tarayıcıda daha önce doğru parola girilmiş mi
export function kilitAcik(depo = globalThis.localStorage, k = KILIT) {
  try { return depo?.getItem(KILIT_ANAHTAR) === k.ozet; } catch { return false; }
}

// Parolayı dener; doğruysa tarayıcıya yazar. Dönüş: true | false
export async function kilitDene(parola, depo = globalThis.localStorage, k = KILIT) {
  const girilen = String(parola ?? '').trim();
  if (!girilen) return false;
  const dogru = (await ozetle(girilen, k)) === k.ozet;
  if (dogru) { try { depo?.setItem(KILIT_ANAHTAR, k.ozet); } catch { /* gizli sekme: bu oturumda açık kalmaz */ } }
  return dogru;
}

export function kilitKapat(depo = globalThis.localStorage) {
  try { depo?.removeItem(KILIT_ANAHTAR); } catch { /* yok */ }
}
