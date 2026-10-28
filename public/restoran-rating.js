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
export const RATING_MAX = 10;

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

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
  const b = fin(bonus) ? Math.max(0, bonus) : 0;
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
