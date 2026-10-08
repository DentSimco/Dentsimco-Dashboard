// DentSimco — ürün adları (oyundaki Türkçe adlar). Ekranda görünen her ürün adı buradan geçer.
// Kaynak: oyunun ansiklopedi ekranlarından alınan fotoğraflar (Ekim 2026).
//
// İki katman çalışır:
//  1) ID_ADLARI: kimliği kesin bilinen ürünler doğrudan bu adı alır.
//  2) OYUN_ADLARI: kalan ürünlerde, veriden gelen ad büyük/küçük harf, boşluk, tire ya da Türkçe karakter
//     farkıyla bu listedekine denk geliyorsa ("Şeker kamışı" → "Şekerkamışı") liste adı kullanılır.
// Yanlış görünen bir ürün olursa: kimliğini (#sayı) ve oyundaki doğru adını ID_ADLARI'na eklemek yeterlidir.

import { DIL } from './i18n.js';

export const ID_ADLARI = {
  1: 'Enerji', 2: 'Su', 3: 'Elmalar', 4: 'Portakal', 10: 'Ham petrol', 12: 'Dizel', 13: 'Taşıma', 14: 'Mineral', 15: 'Boksit',
  16: 'Silikon', 17: 'Kimyasal', 18: 'Alüminyum', 19: 'Plastik', 20: 'İşlemci', 21: 'Elektronik bileşenler', 22: 'Pil', 23: 'Ekranlar',
  29: 'Bitki araştırma', 40: 'Pamuk', 41: 'Kumaş', 42: 'Demir cevheri', 43: 'Çelik', 44: 'Kum', 45: 'Cam',
  47: 'Yerleşik bilgisayar', 48: 'Elektrik motoru', 50: 'Temel iç kısım', 51: 'Oto karoseri', 52: 'Yanma motoru',
  53: 'Ekonomik elektrikli araba', 66: 'Tohum', 68: 'Altın cevheri', 69: 'Külçe altın', 72: 'Şekerkamışı', 73: 'Etanol',
  74: 'Metan', 75: 'Karbon fiber', 76: 'Karbon kompozit', 77: 'Uçak gövdesi', 79: 'Yüksek seviye e-bilgisayar', 81: 'Kokpit',
  82: 'Tutum kontrolü', 83: 'Roket yakıtı', 84: 'İtici tankı', 86: 'Roket motoru', 87: 'Isı kalkanı', 92: 'Yörüngesel güçlendirici',
  93: 'Yıldız gemisi', 94: 'BFR', 106: 'Odun', 107: 'Çelik kiriş', 108: 'Kereste', 109: 'Pencere', 110: 'Alet takımı',
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

// Oyundaki İngilizce ürün adları (anahtar: Türkçe adın anahtar() biçimi). Veri Türkçe adla gelse bile İngilizce modda bu görünür.
const EN_AD = {
  'Tohum': 'Seeds',
  'Elmalar': 'Apples',
  'Portakal': 'Oranges',
  'Üzüm': 'Grapes',
  'Tahıl': 'Grain',
  'İnek': 'Cattle',
  'Domuz': 'Pigs',
  'Kahve çekirdeği': 'Coffee beans',
  'Sebze': 'Vegetables',
  'Yem': 'Feed',
  'Pamuk': 'Cotton',
  'Şekerkamışı': 'Sugarcane',
  'Kakao': 'Cocoa',
  'Biftek': 'Steak',
  'Sosis': 'Sausages',
  'Yumurta': 'Eggs',
  'Kahve tozu': 'Ground coffee',
  'Süt': 'Milk',
  'Portakal suyu': 'Orange juice',
  'Elma suyu': 'Apple juice',
  'Zencefilli bira': 'Ginger beer',
  'Çikolata': 'Chocolate',
  'Şeker': 'Sugar',
  'Hamur': 'Dough',
  'Sos': 'Sauce',
  'Un': 'Flour',
  'Ekmek': 'Bread',
  'Elmalı turta': 'Apple pie',
  'Dondurulmuş pizza': 'Frozen pizza',
  'Makarna': 'Pasta',
  'Tereyağı': 'Butter',
  'Peynir': 'Cheese',
  'Hamburger': 'Hamburger',
  'Lazanya': 'Lasagna',
  'Köfte': 'Meatballs',
  'Kokteyl': 'Cocktails',
  'Bitkisel yağ': 'Vegetable oil',
  'Salata': 'Salad',
  'Samosa': 'Samosa',
  'Bal kabağı çorbası': 'Pumpkin soup',
  'Betonarme blok': 'Reinforced concrete',
  'Tuğla': 'Bricks',
  'Kereste': 'Planks',
  'İnşaat gereci': 'Construction units',
  'Kil': 'Clay',
  'Odun': 'Wood',
  'Çimento': 'Cement',
  'Kireç taşı': 'Limestone',
  'Çelik kiriş': 'Steel beams',
  'Pencere': 'Windows',
  'Alet takımı': 'Tools',
  'Kumaş': 'Fabric',
  'Deri': 'Leather',
  'İç çamaşır': 'Underwear',
  'Eldiven': 'Gloves',
  'Elbise': 'Dress',
  'Topuklu ayakkabı': 'Stiletto heel',
  'El çantası': 'Handbags',
  'Spor ayakkabı': 'Sneakers',
  'Lüks saat': 'Luxury watch',
  'Kolye': 'Necklace',
  'Enerji': 'Power',
  'Ham petrol': 'Crude oil',
  'Petrol': 'Petrol',
  'Dizel': 'Diesel',
  'Etanol': 'Ethanol',
  'Metan': 'Methane',
  'Roket yakıtı': 'Rocket fuel',
  'İşlemci': 'Processors',
  'Elektronik bileşenler': 'Electronic components',
  'Pil': 'Batteries',
  'Ekranlar': 'Displays',
  'Akıllı telefonlar': 'Smartphones',
  'Tabletler': 'Tablets',
  'Dizüstü': 'Laptops',
  'Monitör': 'Monitors',
  'Televizyon': 'Televisions',
  'Robotlar': 'Robots',
  'Yüksek seviye e-bilgisayar': 'High grade e-comps',
  'Quadcopter': 'Quadcopters',
  'Buldozer': 'Bulldozer',
  'Yerleşik bilgisayar': 'On-board computer',
  'Elektrik motoru': 'Electric motor',
  'Lüks araba iç kısmı': 'Luxury car interior',
  'Temel iç kısım': 'Basic interior',
  'Oto karoseri': 'Car body',
  'Yanma motoru': 'Combustion engine',
  'Ekonomik elektrikli araba': 'Economy e-car',
  'Lüks elektrikli araba': 'Luxury e-car',
  'Ekonomik araba': 'Economy car',
  'Lüks araba': 'Luxury car',
  'Kamyon': 'Truck',
  'Uçak gövdesi': 'Fuselage',
  'Kanat': 'Wing',
  'Uçuş bilgisayarı': 'Flight computer',
  'Kokpit': 'Cockpit',
  'Tutum kontrolü': 'Attitude control',
  'İtici tankı': 'Propellant tank',
  'Katı yakıt güçlendirici': 'Solid fuel booster',
  'Roket motoru': 'Rocket engine',
  'Isı kalkanı': 'Heat shield',
  'İyon sürücüsü': 'Ion drive',
  'Jet motoru': 'Jet engine',
  'Alt yörüngesel 2inci aşama': 'Sub-orbital 2nd stage',
  'Alt yörüngesel roket': 'Sub-orbital rocket',
  'Yörüngesel güçlendirici': 'Orbital booster',
  'Yıldız gemisi': 'Starship',
  'BFR': 'BFR',
  'Jumbo jet': 'Jumbo jet',
  'Lüks jet': 'Luxury jet',
  'Tek motorlu uçak': 'Single-engine plane',
  'Uydu': 'Satellite',
  'Su': 'Water',
  'Taşıma': 'Transport',
  'Plastik': 'Plastic',
  'Mineral': 'Minerals',
  'Boksit': 'Bauxite',
  'Silikon': 'Silicon',
  'Kimyasal': 'Chemicals',
  'Alüminyum': 'Aluminium',
  'Demir cevheri': 'Iron ore',
  'Çelik': 'Steel',
  'Kum': 'Sand',
  'Cam': 'Glass',
  'Altın cevheri': 'Gold ore',
  'Külçe altın': 'Gold bar',
  'Karbon fiber': 'Carbon fibers',
  'Karbon kompozit': 'Carbon composite',
  'Bitki araştırma': 'Plant research',
  'Enerji araştırması': 'Energy research',
  'Madencilik araştırması': 'Mining research',
  'Damızlık araştırması': 'Breeding research',
  'Kimya araştırması': 'Chemistry research',
  'Moda araştırması': 'Fashion research',
  'Malzeme araştırması': 'Materials research',
  'Yemek tarifi': 'Recipes',
  'Elektronik araştırması': 'Electronics research',
  'Yazılım': 'Software',
  'Otomotiv araştırması': 'Automotive research',
  'Havacılık araştırması': 'Aerospace research',
  'Bal kabağı': 'Pumpkin',
  'Cadı kostümü': 'Witch costume',
  'Ağaç': 'Tree',
  'Yılbaşı krakerleri': 'Christmas crackers',
  'Noel süsü': 'Christmas bauble',
  'Bal kabağı feneri': 'Jack-o\'-lantern',
  'Paskalya tavşanı': 'Easter bunny',
  'Ramazan şekeri': 'Ramadan candy',
  'Çikolatalı dondurma': 'Chocolate ice cream',
  'Elmalı dondurma': 'Apple ice cream',
  'Cream egg': 'Cream egg',
};
const EN_ANAHTAR = new Map(Object.entries(EN_AD).map(([k, v]) => [anahtar(k), v]));

// Bir ürünün ekranda görünecek adı. id bilinen üründe liste adı; değilse veriden gelen ad liste ile eşleşiyorsa liste adı;
// hiçbiri değilse veriden gelen ad olduğu gibi.
export function turkceAd(id, ad) {
  const kesin = ID_ADLARI[Number(id)];
  if (kesin) return kesin;
  const k = anahtar(ad);
  return (k && LISTE.get(k)) || ad;
}

export function urunAdi(id, ad) {
  const tr = turkceAd(id, ad);
  if (DIL === 'tr') return tr;
  // İngilizce (ve sonraki diller): bilinen ürünün İngilizce adı; bilinmeyende veriden gelen ad olduğu gibi
  return EN_ANAHTAR.get(anahtar(tr)) || EN_ANAHTAR.get(anahtar(ad)) || ad;
}
