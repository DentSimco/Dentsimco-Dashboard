// DentSimco — Restoran doluluk tahmini
// restoran-doluluk.js tablosundan (oyunun gazetesindeki restoran ısı haritaları) rating, menü fiyatı ve ekonomi evresine göre doluluk okur.
// Arayüzsüz, saf fonksiyonlar: tarayıcıda ve Node'da aynen çalışır. Doluluk piyasa ortalamasıdır [oyun verisi].

import { DOLULUK_TABLO, DOLULUK_FIYATLAR, DOLULUK_KOSU, DOLULUK_KAYNAK } from './restoran-doluluk.js';

export const FIYAT_MIN = 60;
export const FIYAT_MAX = 350;

// Ekonomi evresi: hesap.js ECONOMY_PHASES ile aynı dizin (0 Durgunluk, 1 Normal, 2 Büyüme); bilinmiyorsa Normal
export const EVRE_NORMAL = 1;
export const evreOf = (e) => (e !== null && e !== '' && [0, 1, 2].includes(Number(e)) ? Number(e) : EVRE_NORMAL);
export { DOLULUK_KAYNAK };
export const DOLULUK_AZ_VERI = 1000; // hücrede 28 dönemde bundan az döngü varsa tahmin zayıf sayılır

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Tablodaki dilimin temsil ettiği nokta: rating dilimi r → r + 0,5 (rating 10 dilimi yalnız 10), fiyat dilimi p → p + 15
const RATING_MERKEZ = DOLULUK_TABLO[0][0].map((_, i) => (i < 10 ? i + 0.5 : 10));
const FIYAT_MERKEZ = DOLULUK_FIYATLAR.map((p) => p + 15);
// Sıralı merkezler arasında konum: [alt dizin, üst dizin, ağırlık]; uçlarda sabit
function konum(merkez, x) {
  if (!(x > merkez[0])) return [0, 0, 0];
  const n = merkez.length - 1;
  if (x >= merkez[n]) return [n, n, 0];
  let i = 0;
  while (merkez[i + 1] < x) i++;
  return [i, i + 1, (x - merkez[i]) / (merkez[i + 1] - merkez[i])];
}

/** Tahmini doluluk (%): rating (lüks çarpanı dahil), menü fiyatı ve evreye göre tablodan iki yönlü ara değer. */
export function dolulukTahmini(rating, fiyat, evre = EVRE_NORMAL) {
  const t = DOLULUK_TABLO[evreOf(evre)];
  const r = clamp(fin(Number(rating)) ? Number(rating) : 0, 0, 10);
  const p = clamp(fin(Number(fiyat)) ? Number(fiyat) : FIYAT_MIN, FIYAT_MIN, FIYAT_MAX);
  const [r0, r1, a] = konum(RATING_MERKEZ, r);
  const [p0, p1, b] = konum(FIYAT_MERKEZ, p);
  const satir = (pi) => t[pi][r0] + (t[pi][r1] - t[pi][r0]) * a;
  return satir(p0) + (satir(p1) - satir(p0)) * b;
}

/** Tahminin dayandığı hücredeki döngü sayısı (en yakın dilim); DOLULUK_AZ_VERI altı zayıf. */
export function dolulukVerisi(rating, fiyat) {
  const r = clamp(Math.floor(Number(rating) || 0), 0, 10);
  const p = clamp(Number(fiyat) || FIYAT_MIN, FIYAT_MIN, FIYAT_MAX);
  let pi = 0;
  while (pi + 1 < DOLULUK_FIYATLAR.length && DOLULUK_FIYATLAR[pi + 1] <= p) pi++;
  return DOLULUK_KOSU[pi][r];
}
