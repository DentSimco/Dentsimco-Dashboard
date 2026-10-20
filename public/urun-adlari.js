// DentSimco — ürün adları (oyundaki Türkçe adlar). Ekranda görünen her ürün adı buradan geçer.
// Kaynak: oyunun ansiklopedi ekranlarından alınan fotoğraflar (Ekim 2026).
//
// İki katman çalışır:
//  1) ID_ADLARI: kimliği kesin bilinen ürünler doğrudan bu adı alır.
//  2) OYUN_ADLARI: kalan ürünlerde, veriden gelen ad büyük/küçük harf, boşluk, tire ya da Türkçe karakter
//     farkıyla bu listedekine denk geliyorsa ("Şeker kamışı" → "Şekerkamışı") liste adı kullanılır.
// Yanlış görünen bir ürün olursa: kimliğini (#sayı) ve oyundaki doğru adını ID_ADLARI'na eklemek yeterlidir.
// Diğer dillerdeki adlar oyunun kendi dil dosyalarından gelir (dil-xx.js › URUNLER, ürün numarasıyla).

import { DIL_ADLARI } from './i18n.js';

export const ID_ADLARI = {
  1: 'Enerji', 2: 'Su', 3: 'Elmalar', 4: 'Portakal', 10: 'Ham petrol', 12: 'Dizel', 13: 'Taşıma', 14: 'Mineral', 15: 'Boksit',
  16: 'Silikon', 17: 'Kimyasal', 18: 'Alüminyum', 19: 'Plastik', 20: 'İşlemci', 21: 'Elektronik bileşenler', 22: 'Pil', 23: 'Ekranlar',
  29: 'Bitki araştırma', 40: 'Pamuk', 41: 'Kumaş', 42: 'Demir cevheri', 43: 'Çelik', 44: 'Kum', 45: 'Cam',
  47: 'Yerleşik bilgisayar', 48: 'Elektrik motoru', 50: 'Temel iç kısım', 51: 'Oto karoseri', 52: 'Yanma motoru',
  53: 'Ekonomik elektrikli araba', 66: 'Tohum', 68: 'Altın cevheri', 69: 'Külçe altın', 72: 'Şekerkamışı', 73: 'Etanol',
  74: 'Metan', 75: 'Karbon fiber', 76: 'Karbon kompozit', 77: 'Uçak gövdesi', 79: 'Yüksek seviye e-bilgisayar', 81: 'Kokpit',
  82: 'Tutum kontrolü', 83: 'Roket yakıtı', 84: 'İtici tankı', 86: 'Roket motoru', 87: 'Isı kalkanı', 91: 'Alt yörüngesel roket',
  92: 'Yörüngesel güçlendirici', 93: 'Yıldız gemisi', 94: 'BFR', 100: 'Havacılık araştırması', 106: 'Odun', 107: 'Çelik kiriş', 108: 'Kereste', 109: 'Pencere', 110: 'Alet takımı',
  111: 'İnşaat gereci', 112: 'Buldozer', 124: 'Portakal suyu', 135: 'Şeker',
};

export const OYUN_ADLARI = [
  // Tarım
  'Tohum', 'Elmalar', 'Portakal', 'Üzüm', 'Tahıl', 'İnek', 'Domuz', 'Kahve çekirdeği', 'Sebze', 'Yem', 'Pamuk', 'Şekerkamışı', 'Kakao',
  // Yiyecek
  'Biftek', 'Sosis', 'Yumurta', 'Kahve tozu', 'Süt', 'Portakal suyu', 'Elma suyu', 'Zencefilli bira', 'Çikolata', 'Şeker',
  'Hamur', 'Sos', 'Un', 'Ekmek', 'Elmalı turta', 'Dondurulmuş pizza', 'Makarna', 'Tereyağı', 'Peynir', 'Hamburger',
  'Lazanya', 'Köfte', 'Kokteyl', 'Bitkisel yağ', 'Salata', 'Samosa', 'Bal kabağı çorbası',
  // İnşaat
  'Betonarme blok', 'Tuğla', 'Kereste', 'İnşaat gereci', 'Kil', 'Odun', 'Çimento', 'Kireç taşı', 'Çelik kiriş', 'Pencere', 'Alet takımı',
  // Moda
  'Kumaş', 'Deri', 'İç çamaşır', 'Eldiven', 'Elbise', 'Topuklu ayakkabı', 'El çantası', 'Spor ayakkabı', 'Lüks saat', 'Kolye',
  // Enerji
  'Enerji', 'Ham petrol', 'Petrol', 'Dizel', 'Etanol', 'Metan', 'Roket yakıtı',
  // Elektronik
  'İşlemci', 'Elektronik bileşenler', 'Pil', 'Ekranlar', 'Akıllı telefonlar', 'Tabletler', 'Dizüstü', 'Monitör', 'Televizyon',
  'Robotlar', 'Yüksek seviye e-bilgisayar', 'Quadcopter',
  // Otomotiv
  'Buldozer', 'Yerleşik bilgisayar', 'Elektrik motoru', 'Lüks araba iç kısmı', 'Temel iç kısım', 'Oto karoseri', 'Yanma motoru',
  'Ekonomik elektrikli araba', 'Lüks elektrikli araba', 'Ekonomik araba', 'Lüks araba', 'Kamyon',
  // Havacılık
  'Uçak gövdesi', 'Kanat', 'Uçuş bilgisayarı', 'Kokpit', 'Tutum kontrolü', 'İtici tankı', 'Katı yakıt güçlendirici', 'Roket motoru',
  'Isı kalkanı', 'İyon sürücüsü', 'Jet motoru', 'Alt yörüngesel 2inci aşama', 'Alt yörüngesel roket', 'Yörüngesel güçlendirici',
  'Yıldız gemisi', 'BFR', 'Jumbo jet', 'Lüks jet', 'Tek motorlu uçak', 'Uydu',
  // Kaynaklar
  'Su', 'Taşıma', 'Plastik', 'Mineral', 'Boksit', 'Silikon', 'Kimyasal', 'Alüminyum', 'Demir cevheri', 'Çelik', 'Kum', 'Cam',
  'Altın cevheri', 'Külçe altın', 'Karbon fiber', 'Karbon kompozit',
  // Araştırma
  'Bitki araştırma', 'Enerji araştırması', 'Madencilik araştırması', 'Damızlık araştırması', 'Kimya araştırması', 'Moda araştırması',
  'Malzeme araştırması', 'Yemek tarifi', 'Elektronik araştırması', 'Yazılım', 'Otomotiv araştırması', 'Havacılık araştırması',
  // Sezonluk
  'Bal kabağı', 'Cadı kostümü', 'Ağaç', 'Yılbaşı krakerleri', 'Noel süsü', 'Bal kabağı feneri', 'Paskalya tavşanı', 'Ramazan şekeri',
  'Çikolatalı dondurma', 'Elmalı dondurma', 'Cream egg',
];

// Karşılaştırma anahtarı: Türkçe küçük harf, aksansız, yalnız harf ve rakam
const HARF = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
export function anahtar(ad) {
  return String(ad ?? '').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => HARF[c]).replace(/i̇/g, 'i').replace(/[^a-z0-9]/g, '');
}

const LISTE = new Map(OYUN_ADLARI.map((a) => [anahtar(a), a]));

// Türkçe ad → oyundaki ürün numarası (oyunun Türkçe ve İngilizce dil dosyasından eşlendi; 151 ürünün hepsi).
// Ürün numarası bilinmeyen ya da yanlış gelen veride diğer dillerdeki ad bu numarayla bulunur.
export const URUN_NO = {
  'Tohum': 66, 'Elmalar': 3, 'Portakal': 4, 'Üzüm': 5, 'Tahıl': 6, 'İnek': 115, 'Domuz': 116, 'Kahve çekirdeği': 118,
  'Sebze': 120, 'Yem': 139, 'Pamuk': 40, 'Şekerkamışı': 72, 'Kakao': 136, 'Biftek': 7, 'Sosis': 8, 'Yumurta': 9,
  'Kahve tozu': 119, 'Süt': 117, 'Portakal suyu': 124, 'Elma suyu': 125, 'Zencefilli bira': 126, 'Çikolata': 140,
  'Şeker': 135, 'Hamur': 137, 'Sos': 138, 'Un': 133, 'Ekmek': 121, 'Elmalı turta': 123, 'Dondurulmuş pizza': 127,
  'Makarna': 128, 'Tereyağı': 134, 'Peynir': 122, 'Hamburger': 129, 'Lazanya': 130, 'Köfte': 131, 'Kokteyl': 132,
  'Bitkisel yağ': 141, 'Salata': 142, 'Samosa': 143, 'Bal kabağı çorbası': 149, 'Betonarme blok': 101, 'Tuğla': 102,
  'Kereste': 108, 'İnşaat gereci': 111, 'Kil': 104, 'Odun': 106, 'Çimento': 103, 'Kireç taşı': 105,
  'Çelik kiriş': 107, 'Pencere': 109, 'Alet takımı': 110, 'Kumaş': 41, 'Deri': 46, 'İç çamaşır': 60, 'Eldiven': 61,
  'Elbise': 62, 'Topuklu ayakkabı': 63, 'El çantası': 64, 'Spor ayakkabı': 65, 'Lüks saat': 70, 'Kolye': 71,
  'Enerji': 1, 'Ham petrol': 10, 'Petrol': 11, 'Dizel': 12, 'Etanol': 73, 'Metan': 74, 'Roket yakıtı': 83,
  'İşlemci': 20, 'Elektronik bileşenler': 21, 'Pil': 22, 'Ekranlar': 23, 'Akıllı telefonlar': 24, 'Tabletler': 25,
  'Dizüstü': 26, 'Monitör': 27, 'Televizyon': 28, 'Robotlar': 114, 'Yüksek seviye e-bilgisayar': 79, 'Quadcopter': 98,
  'Buldozer': 112, 'Yerleşik bilgisayar': 47, 'Elektrik motoru': 48, 'Lüks araba iç kısmı': 49, 'Temel iç kısım': 50,
  'Oto karoseri': 51, 'Yanma motoru': 52, 'Ekonomik elektrikli araba': 53, 'Lüks elektrikli araba': 54,
  'Ekonomik araba': 55, 'Lüks araba': 56, 'Kamyon': 57, 'Uçak gövdesi': 77, 'Kanat': 78, 'Uçuş bilgisayarı': 80,
  'Kokpit': 81, 'Tutum kontrolü': 82, 'İtici tankı': 84, 'Katı yakıt güçlendirici': 85, 'Roket motoru': 86,
  'Isı kalkanı': 87, 'İyon sürücüsü': 88, 'Jet motoru': 89, 'Alt yörüngesel 2inci aşama': 90,
  'Alt yörüngesel roket': 91, 'Yörüngesel güçlendirici': 92, 'Yıldız gemisi': 93, 'BFR': 94, 'Jumbo jet': 95,
  'Lüks jet': 96, 'Tek motorlu uçak': 97, 'Uydu': 99, 'Su': 2, 'Taşıma': 13, 'Plastik': 19, 'Mineral': 14,
  'Boksit': 15, 'Silikon': 16, 'Kimyasal': 17, 'Alüminyum': 18, 'Demir cevheri': 42, 'Çelik': 43, 'Kum': 44,
  'Cam': 45, 'Altın cevheri': 68, 'Külçe altın': 69, 'Karbon fiber': 75, 'Karbon kompozit': 76, 'Bitki araştırma': 29,
  'Enerji araştırması': 30, 'Madencilik araştırması': 31, 'Damızlık araştırması': 33, 'Kimya araştırması': 34,
  'Moda araştırması': 59, 'Malzeme araştırması': 113, 'Yemek tarifi': 145, 'Elektronik araştırması': 32,
  'Yazılım': 35, 'Otomotiv araştırması': 58, 'Havacılık araştırması': 100, 'Bal kabağı': 146, 'Cadı kostümü': 148,
  'Ağaç': 150, 'Yılbaşı krakerleri': 67, 'Noel süsü': 144, 'Bal kabağı feneri': 147, 'Paskalya tavşanı': 151,
  'Ramazan şekeri': 152, 'Çikolatalı dondurma': 153, 'Elmalı dondurma': 154, 'Cream egg': 155,
};
const NO_ANAHTAR = new Map(Object.entries(URUN_NO).map(([k, v]) => [anahtar(k), v]));

// Bir ürünün ekranda görünecek adı. id bilinen üründe liste adı; değilse veriden gelen ad liste ile eşleşiyorsa liste adı;
// hiçbiri değilse veriden gelen ad olduğu gibi.
export function turkceAd(id, ad) {
  const kesin = ID_ADLARI[Number(id)];
  if (kesin) return kesin;
  const k = anahtar(ad);
  return (k && LISTE.get(k)) || ad;
}

export function urunAdi(id, ad, adlar = DIL_ADLARI.urun) {
  const tr = turkceAd(id, ad);
  if (!adlar) return tr; // Türkçe
  // Diğer diller: oyunun o dildeki adı (ürün numarasıyla; numara tabloda yoksa Türkçe adın numarasıyla).
  // Bilinmeyen üründe veriden gelen ad olduğu gibi kalır.
  return adlar[Number(id)] || adlar[NO_ANAHTAR.get(anahtar(tr)) ?? NO_ANAHTAR.get(anahtar(ad))] || ad;
}
