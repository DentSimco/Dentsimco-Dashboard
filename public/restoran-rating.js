// DentSimco — Restoran tahmini rating: formül yapısı
// Arayüzsüz, saf fonksiyon: tarayıcıda ve Node'da aynen çalışır.
//
//   Rating = [ (Menü kalite ve maliyet puanı × Çeşitlilik puanı) + Profesyonel personel puanı (varsa)
//              + 0,01 × etkin CMO iletişim puanı + 0,02 × taban satış hızı % ] × Lüks oturma çarpanı
//
// Kaynak: tecrübeli bir oyuncuyla birlikte çıkarılan yapı [oyuncu]. Yalnız yapı biliniyor; terimlerin büyüklüğü ölçülmedi.
// Bu yüzden menü puanı, çeşitlilik puanı, profesyonel personel puanı ve lüks çarpanı DIŞARIDAN verilir; burada varsayılan değer yoktur.
// Biri gerekli olduğu halde verilmemişse sonuç null olur (uydurma değerle hesap yapılmaz).
// Yalnız CMO (0,01) ve satış hızı (0,02) katsayıları oyundan doğrulanmıştır [oyun].

export const CMO_KATSAYISI = 0.01; // etkin iletişim puanı başına [oyun]
export const SATIS_HIZI_KATSAYISI = 0.02; // taban satış hızı yüzdesi başına [oyun]

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const pos0 = (x) => (fin(x) && x > 0 ? x : 0);

/**
 * @param {object} o
 * @param {number} o.menuPuani           menü kalite ve maliyet puanı (gerekli)
 * @param {number} o.cesitPuani          çeşitlilik puanı (gerekli)
 * @param {boolean} [o.profesyonel]      profesyonel personel kullanılıyor mu
 * @param {number|null} [o.profesyonelPuani]  profesyonel personel puanı; profesyonel true iken gerekli
 * @param {number} [o.etkinCmo]          etkin CMO iletişim puanı (yoksa 0)
 * @param {number} [o.tabanSatisHiziPct] taban satış hızı yüzdesi (yoksa 0)
 * @param {boolean} [o.luks]             lüks oturma mı
 * @param {number|null} [o.luksCarpani]  lüks oturma çarpanı; luks true iken gerekli
 * @returns {null | { rating: number, ham: number, parcalar: object }}  rating 0–10 arasına kırpılır, ham kırpılmamış değerdir
 */
export function tahminiRating(o = {}) {
  if (!fin(o.menuPuani) || !fin(o.cesitPuani)) return null;
  if (o.profesyonel && !fin(o.profesyonelPuani)) return null;
  if (o.luks && !fin(o.luksCarpani)) return null;
  const menu = o.menuPuani * o.cesitPuani;
  const profesyonel = o.profesyonel ? o.profesyonelPuani : 0;
  const cmo = CMO_KATSAYISI * pos0(o.etkinCmo);
  const satis = SATIS_HIZI_KATSAYISI * pos0(o.tabanSatisHiziPct);
  const luks = o.luks ? o.luksCarpani : 1;
  const ham = (menu + profesyonel + cmo + satis) * luks;
  return { rating: Math.min(10, Math.max(0, ham)), ham, parcalar: { menu, profesyonel, cmo, satis, luks } };
}
