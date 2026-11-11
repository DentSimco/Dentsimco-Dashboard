// DentSimco — Restoran rating tahmini (M4, 11 Kasım 2026)
//
// Arayüzsüz, saf fonksiyonlar. Oyunun rating formülü sunucuda olduğu için model oyuncu verisinden (Ekim–Kasım 2026, 117 rating adımı)
// ve oyunun rehberinden kuruldu; kesin değil, tahmindir. Kanıt düzeyi:
//   [oyun]    oyunun rehberi ya da ekranıyla doğrulandı
//   [ölçüm]   oyuncu verisinden uydurma; yeni veriyle güncellenebilir
//   [karar]   kullanıcı kararı
//
//   Hedef = [ ort q(Q) + 0,09375 × N + B (+ 3,94 profesyonel) ] × L        (0–10 ile sınırlı)
//   q(Q)  ürünün kalite puanı: −20,30 + 24,64 × (1 − e^(−Q/1,12)); çeşitten ve yöneticiden bağımsız. Menü puanı ürünlerin q ortalaması.
//         Q0 −20,3 · Q1 −5,75 · Q2 0,21 · Q3 2,65 · Q4 3,65 · Q5 4,06 · Q6 4,22 · Q8 4,32 · Q12 4,34. İçbükey: düşük kalite ratingi eksiye çeker
//         (oyun ekibi: "not merely a smaller positive bonus"), Q5'ten sonrası neredeyse düz. Q2 ve Q5–Q12 ölçüldü; Q4 doğru kabul edildi; Q3 ölçülmedi;
//         Q0–Q1 yalnız "hedef sıfır ya da altı" bilgisi veriyor (rating 0'da sınırlı), değerleri eğrinin uzantısı [ölçüm]
//   N     menüdeki toplam ürün sayısı; çeşit puanı 1,5 × N/16 = ürün başına 0,09375, toplanan [Çin oyuncu formülü; verimizle tutarlı, doğrulanmadı]
//   B     yönetici bonusu: 0,01 × etkin CMO iletişimi + 0,02 × ekip dışı satış hızı % [oyun]; eksi olabilir
//   L     oturma çarpanı: eko 1, lüks 1,207 [ölçüm; oyun: lüks ratingi çarpar]
//   Profesyonel personel lüks çarpanının içinde +3,94 (lüks sonrası +4,75) [ölçüm]; maaş ×5
//   Rating her döngü hedefin %27'si kadar yaklaşır: r' = r + 0,27 × (hedef − r), gürültü ≈ ±0,19 [ölçüm]
// Ürün maliyetinin, bina seviyesinin ve doluluğun ratinge etkisi görülmedi. Araştırma: araclar/veri/restoran-rating-notlari.md

export const MODEL = {
  cesitEk: 1.5 / 16, // çeşit: ürün başına
  luks: 1.207, // lüks oturma çarpanı
  profesyonel: 3.94, // profesyonel personel (lüks içinde, toplanan)
  yaklasma: 0.27, // döngü başına hedefe yaklaşma oranı k
  hata: 0.5, // tahmin aralığının yarı genişliği (rating puanı; eko) ≈ modelin ölçümlerle uyum hatası
};
export const KALITE = { taban: -20.3, genlik: 24.64, olcek: 1.12 };
export const RATING_MAX = 10;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Bir ürünün kalite puanı q(Q). Q0–Q1 negatiftir (rating 0'da sınırlı olduğu için ölçülemez, eğri uzantısı). */
export const kalitePuani = (q) => (fin(q) ? KALITE.taban + KALITE.genlik * (1 - Math.exp(-Math.max(0, q) / KALITE.olcek)) : null);
/** Çeşit puanı (toplanan): 1,5 × N/16 = 0,09375 × N; N menüdeki toplam ürün sayısı. */
export const cesitPuani = (urunSayisi) => MODEL.cesitEk * urunSayisi;
export const tipCarpani = (tip) => (tip === 'luks' ? MODEL.luks : 1);

/**
 * Menü ratingi (0–10): (ürün kalite puanlarının ortalaması + çeşit + bonus [+ profesyonel]) × oturma.
 * Bonus 1:1 eklenir (satış hızı eksiyse bonus eksi olabilir).
 */
export function menuRatingi({ puanOrt, urunSayisi, bonus = 0, tip = 'eko', profesyonel = false }) {
  if (!fin(puanOrt) || !(urunSayisi >= 1)) return null;
  const b = fin(bonus) ? bonus : 0;
  return clamp((puanOrt + cesitPuani(urunSayisi) + b + (profesyonel ? MODEL.profesyonel : 0)) * tipCarpani(tip), 0, RATING_MAX);
}

/** Hedef ve ± hata payıyla aralık { alt, orta, ust }; lüksde hata çarpanla büyür. */
export function ratingAraligi(o) {
  const orta = menuRatingi(o);
  if (orta == null) return null;
  const h = MODEL.hata * tipCarpani(o.tip);
  return { alt: clamp(orta - h, 0, RATING_MAX), orta, ust: clamp(orta + h, 0, RATING_MAX) };
}

// Hedefin verilen oranına (0–1) yaklaşmak için gereken döngü sayısı (12 saat)
export const yaklasmaDongusu = (oran) => (oran > 0 && oran < 1 ? Math.ceil(Math.log(1 - oran) / Math.log(1 - MODEL.yaklasma) - 1e-9) : null);
