// DentSimco — Restoran rating tahmini
//
// Arayüzsüz, saf fonksiyonlar. Oyunun rating formülü sunucuda olduğu için model oyuncu verisinden (Ekim 2026, 12 ölçüm) ve
// oyunun rehberinden kuruldu; kesin değil, tahmindir. Kaynak ve kanıt düzeyi her sabitin yanında:
//   [oyun]    oyunun rehberi ya da ekranıyla doğrulandı
//   [ölçüm]   oyuncu verisinden uydurma; yeni veriyle güncellenebilir
//   [karar]   kullanıcı kararı, ölçülmedi
//
//   Hedef = [ M × V + P + 0,01 × etkin CMO iletişimi + 0,02 × taban satış hızı % ] × L
//   M = R × (1 + 0,021 × (Q − 6))   Q: menüdeki yemeklerin kalite ortalaması; R, Q6'daki ürün ratingi ve her üründe aynıdır:
//                                   ürün maliyetinin ratinge etkisi veride görünmedi (0,1 ± 1,0 puan)
//   V = 1 + 0,06 × (N − 6)          N: menüdeki toplam ürün sayısı (kategori çarpanı değil); ürün başına ≈ +%6
//   P                               profesyonel personel puanı hesaba katılmaz (ölçülmedi)
//   L                               oturma çarpanı: eko 1, lüks 1,25
//   Bonus (iletişim ve satış hızı kısmı) Yönetim ekibinden gelir; burada hazır toplam olarak alınır.
//   Rating her döngü hedefin ≈ beşte biri kadar yaklaşır: r' = r + 0,2 × (hedef − r) [ölçüm]

export const MODEL = {
  urunRating: 5.37, // R: Q6'da ürün ratingi [ölçüm, ± 0,10]
  kaliteOrta: 6, // eğrinin sabitlendiği kalite
  kaliteEgim: 0.021, // kalite başına M'nin göreli artışı: Q0 → Q12 yalnız ≈ +%25 [ölçüm; doğrusal, eğrilik ayırt edilemedi]
  cesitOrta: 6, // çeşit puanının 1 olduğu ürün sayısı
  cesitEgim: 0.06, // ek ürün başına V artışı [ölçüm, 1σ 0,04–0,08]
  luks: 1.25, // lüks oturma çarpanı [karar]
  yaklasma: 0.2, // döngü başına hedefe yaklaşma oranı k [ölçüm, 0,17–0,21]
  hata: 0.5, // tahmin aralığının yarı genişliği (rating puanı): modelin ölçümlerle uyum hatası ≈ 1σ [ölçüm]
};
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const RATING_MAX = 10;

// ---- Kasım 2026 ölçümleri (32 satır, 5 oyuncu, eko ve lüks; yaklaşık 130 rating adımı) ----
// Kalite içbükey: ürün başına kalite puanı f(Q) = taban + genlik × (1 − e^(−Q/ölçek)); menü puanı ürünlerin ortalaması.
// Q0 ≈ 0,4, Q5 ≈ 4,9, Q12 ≈ 6,1: ilk kalite adımları çok, Q9'dan sonrakiler çok az kazandırır (Q11 → Q12 ≈ +0,06 puan/ürün).
// Aynı çeşit ve bonusla Q5 menüsü ile Q12 menüsü arası yalnız ≈ +0,5 ± 0,6 çıktı; bu eğri +1,2 veriyor (doğrusal reddedildi, ΔAIC ≈ 17).
// Eş uyum: çeşit 1 + 0,037 × (N − 6) [N = ürün sayısı, 6'nın altında da hafif düşüş], lüks oturma ×1,25 (lüks ratingi artırır; ilk uyumdaki 0,80 = 1/1,25 ters yorumlanmıştı),
// profesyonel personel lüksün içinde ≈ +6,7 [ölçüm], bonus 1:1 eklenir (9 restoranlık ANARCHY grubu: ölçülen 6,64 ± 0,18, model 6,55).
// Ürün maliyeti ve bina seviyesinin etkisi görülmedi. Aşağıdaki doğrusal hedefRating yalnız gizli Tavsiye'de kullanılıyor, güncellenmedi.
// 11 Kasım 2026 (M4, 117 adım + Q4 sabit): kalite puanı f(Q) = taban + genlik (1 − e^(−Q/ölçek)); Q4 lüks restoranında rating neredeyse hiç değişmedi, Q4 doğru kabul edildi
// (hedef ≈ 6,2). Q2 ölçüldü (≈ 0,7), Q3 ölçülmedi, Q0–Q1 yalnız "hedef ≈ 0 ya da altı": negatif uzantı 0'da kesilir (ürün puanı ≥ 0).
// Kalite puanı çeşitten ve yöneticiden bağımsızdır: çeşit puanı 1,5 × N/16 ayrı eklenir (eski f'nin N = 6'daki 0,5625'i çeşide taşındı), bonus ayrı. Negatif değerler (Q0 −20,3; Q1 −5,8) tutulur.
// Çeşit toplanan: 1,5 × N/16 = 0,09375 / ürün (Çin oyuncu formülü; verimizle tutarlı, doğrulanmadı). Lüks ×1,207, profesyonel +3,94 (lüks içinde; ölçüm).
export const KALITE = { taban: -20.30, genlik: 24.64, olcek: 1.12 };
export const MODEL_KASIM = { cesitEk: 1.5 / 16, luks: 1.207, profesyonel: 3.94 };
/** Bir ürünün kalite puanı (rating puanı cinsinden; menü puanı ürünlerin bu puanlarının ortalamasıdır). Q0–Q1 negatiftir (rating 0'da sınırlı olduğu için ölçülemez, eğri uzantısı). */
export const kalitePuani = (q) => (fin(q) ? KALITE.taban + KALITE.genlik * (1 - Math.exp(-Math.max(0, q) / KALITE.olcek)) : null);

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Çeşit puanı (toplanan): 1,5 × N/16 = 0,09375 × N; N menüdeki toplam ürün sayısı. */
export const cesitKasim = (urunSayisi) => MODEL_KASIM.cesitEk * urunSayisi;
/**
 * Menü ratingi (0–10): (ürün kalite puanlarının ortalaması + çeşit + bonus [+ profesyonel]) × oturma (eko 1, lüks 1,207).
 * Bonus 1:1 eklenir (yönetici: 0,01 × etkin iletişim + 0,02 × ekip dışı satış hızı %; satış hızı eksiyse bonus eksi olabilir).
 */
export function menuRatingi({ puanOrt, urunSayisi, bonus = 0, tip = 'eko', profesyonel = false }) {
  if (!fin(puanOrt) || !(urunSayisi >= 1)) return null;
  const b = fin(bonus) ? bonus : 0;
  return clamp((puanOrt + cesitKasim(urunSayisi) + b + (profesyonel ? MODEL_KASIM.profesyonel : 0)) * (tip === 'luks' ? MODEL_KASIM.luks : 1), 0, RATING_MAX);
}

export const tipCarpani = (tip) => (tip === 'luks' ? MODEL.luks : 1);

// Menü kalite puanı M (ürün ratingi, kaliteye göre ölçeklenmiş)
export const menuPuani = (kalite) => MODEL.urunRating * (1 + MODEL.kaliteEgim * (kalite - MODEL.kaliteOrta));

// Çeşitlilik puanı V (çarpan): 6 ürün 1, ürün başına +0,06
export const cesitPuani = (urunSayisi) => 1 + MODEL.cesitEgim * (urunSayisi - MODEL.cesitOrta);

/**
 * Ratingin yerleşeceği hedef (0–10).
 * @param {{ kalite: number, urunSayisi: number, bonus?: number, tip?: 'eko'|'luks' }} o
 *   kalite: yemeklerin kalite ortalaması · urunSayisi: toplam ürün sayısı · bonus: Yönetim'den gelen rating bonusu
 */
export function hedefRating({ kalite, urunSayisi, bonus = 0, tip = 'eko' }) {
  if (!fin(kalite) || !(urunSayisi >= 1)) return null;
  const b = fin(bonus) ? bonus : 0;
  return clamp((menuPuani(kalite) * cesitPuani(urunSayisi) + b) * tipCarpani(tip), 0, RATING_MAX);
}

// Hedef ve ± hata payıyla aralık: { alt, orta, ust }
export function ratingAraligi(o) {
  const orta = hedefRating(o);
  if (orta == null) return null;
  const h = MODEL.hata * tipCarpani(o.tip);
  return { alt: clamp(orta - h, 0, RATING_MAX), orta, ust: clamp(orta + h, 0, RATING_MAX) };
}

// Hedefin verilen oranına (0–1) yaklaşmak için gereken döngü sayısı (12 saat); sıfırdan başlayan ya da hedefe doğru ilerleyen rating için
export const yaklasmaDongusu = (oran) => (oran > 0 && oran < 1 ? Math.ceil(Math.log(1 - oran) / Math.log(1 - MODEL.yaklasma) - 1e-9) : null);
