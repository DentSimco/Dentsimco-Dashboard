// DentSimco — Restoran rating modeli (v1, kanıtlanmamış)
//
// Oyunun rating formülü sunucuda; model veriyle (public/restoran-deney.js) ve oyunun resmî metinleriyle kuruldu.
//   R_hedef = [ M × V + P + 0,01 × etkin_CMO_iletişim + 0,02 × taban_satış_hızı_% ] × L
// Her terim ayrı saf fonksiyon. Ölçülmemiş terim null ("bilinmiyor") döndürür; toplam yalnız bilinen kısmı verir.
// Sabitler tek tabloda (RATING_SABIT); veri büyüdükçe yalnız o tablo güncellenir.
//   [oyun] oyun metni/ekranıyla doğrulandı · [ölçüm] veriden uyduruldu · [varsayım] geçici

import { URUNLER } from './hesap-restoran.js';

export const RATING_SABIT = {
  a: 1.17,          // [ölçüm] menü puanı sabiti (c = 2 ile birlikte uydu)
  b: 0.48,          // [ölçüm] kalite başına puan (ilk tahmin 0,72 fazla dikti)
  c: 2,             // [varsayım] ürün maliyet ağırlığı; 0, 2, 3,4 aynı uyumu verdi, ayrışmıyor
  cesitUrunBasi: 0.5, // [varsayım] 6 ürünün üstündeki her ürün için; 3-3-3 ≈ +1. 17 G ortalama-kalite modelini reddediyor (≈3,6σ)
  cesitTaban: 6,
  iletisim: 0.01,   // [oyun] etkin iletişim puanı başına
  satisHizi: 0.02,  // [oyun] taban satış hızı % başına
  k: { alt: 0.15, orta: 0.19, ust: 0.25 }, // [ölçüm] döngü başına hedefe yaklaşma; Sky Eco IV 0,147 ± 0,02, eski 9 restoran 0,25 ± 0,12
  sigma: 0.26,      // [ölçüm] adım gürültüsü
  kapanis: 0.875,   // [oyun]
  refMin: 25, refMax: 2054, refPara: 7200, // ρ ölçeği: Ref = 7200 ÷ oran
};

const fin = (x) => typeof x === 'number' && Number.isFinite(x);

// Ürünün göreli maliyet puanı ρ = ln(Ref/25) / ln(2054/25), Ref = 7200 ÷ oran
export function urunRho(id) {
  const u = URUNLER[id];
  if (!u) return null;
  const { refMin, refMax, refPara } = RATING_SABIT;
  return Math.log(refPara / u.oran / refMin) / Math.log(refMax / refMin);
}

/** M: menü kalite ve maliyet puanı. menu: [{ id, kalite }]; kalite eksik/geçersiz ürün atlanır, hiçbiri yoksa null. */
export function menuPuani(menu = []) {
  const m = menu.filter((x) => URUNLER[x.id] && fin(Number(x.kalite)));
  if (!m.length) return null;
  const q = m.reduce((s, x) => s + Number(x.kalite), 0) / m.length;
  const rho = m.reduce((s, x) => s + urunRho(x.id), 0) / m.length;
  return RATING_SABIT.a + RATING_SABIT.b * q + RATING_SABIT.c * rho;
}

/** V: çeşitlilik terimi (toplanır; v1'de ek puan olarak). Ürün sayısı yemek türüne göre, kaliteler ayrı sayılmaz. */
export function cesit(menu = []) {
  const n = new Set(menu.map((x) => Number(x.id)).filter((id) => URUNLER[id])).size;
  return n ? RATING_SABIT.cesitUrunBasi * (n - RATING_SABIT.cesitTaban) : null;
}

/** P: profesyonel personel puanı. Acemide 0 [varsayım]; profesyonelde ölçülmedi → null. */
export const personel = (profesyonel) => (profesyonel ? null : 0);

/** L: lüks oturma çarpanı. Eko 1 [oyun]; lüksteki değer ölçülmedi (P ile ayrışmıyor) → null. */
export const luks = (tip) => (tip === 'luks' ? null : 1);

export const cmo = (etkinIletisim) => RATING_SABIT.iletisim * Math.max(0, Number(etkinIletisim) || 0);
export const satisHizi = (tabanHizPct) => RATING_SABIT.satisHizi * Math.max(0, Number(tabanHizPct) || 0);

/**
 * Hedef rating tahmini. Dönen: { deger, bilinmeyen: [terim adları], terimler }.
 * Bilinmeyen terim varsa deger o terimler eksik hesaplanmış (alt-sınır) demektir; arayüz bunu belirtmeli.
 */
export function hedefTahmini({ menu = [], tip = 'eko', profesyonel = false, etkinIletisim = 0, tabanHizPct = 0 } = {}) {
  const M = menuPuani(menu);
  const V = cesit(menu);
  const P = personel(profesyonel);
  const L = luks(tip);
  const terimler = { M, V, P, cmo: cmo(etkinIletisim), satisHizi: satisHizi(tabanHizPct), L };
  const bilinmeyen = Object.entries({ M, V, P, L }).filter(([, v]) => v == null).map(([k]) => k);
  const govde = (M ?? 0) + (V ?? 0) + (P ?? 0) + terimler.cmo + terimler.satisHizi;
  const deger = Math.min(10, Math.max(0, govde * (L ?? 1)));
  return { deger, bilinmeyen, terimler };
}

// ---- Dinamik: r' = r + k·(T − r) + gürültü ----
export const adimTahmini = (r, T, k = RATING_SABIT.k.orta) => r + k * (T - r);

/** Tek adımdan hedef: T = r + Δ/k; her adım ±σ/k belirsiz. Birden çok adımın ortalaması için hedefOrtalama. */
export const hedefAdimdan = (eski, yeni, k = RATING_SABIT.k.orta) => eski + (yeni - eski) / k;
export function hedefOrtalama(adimlar, k = RATING_SABIT.k.orta) {
  const a = adimlar.filter((s) => fin(s.eski) && fin(s.yeni));
  if (!a.length) return null;
  const T = a.map((s) => hedefAdimdan(s.eski, s.yeni, k));
  return { deger: T.reduce((s, x) => s + x, 0) / T.length, belirsizlik: RATING_SABIT.sigma / k / Math.sqrt(T.length), adim: T.length, guvenilir: T.length >= 5 };
}
