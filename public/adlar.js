// DentSimco — bina adları (tek kaynak). Üretim, Perakende ve diğer bölümler adları buradan okur.
// Adlar oyunun kendi Türkçe bina ekranından (Ekim 2026 fotoğrafları) birebir alındı; büyük harfler ve "Spring market"
// gibi çevrilmemiş adlar da oyundaki gibidir. Oyunda olmayan hiçbir bina eklenmedi.
// Anahtar: oyunun bina harfi (constants/buildings içindeki dbLetter).

import { DIL, DIL_ADLARI } from './i18n.js';

export const BINA_ADLARI = {
  // Üretim
  E: 'Enerji Santrali', W: 'Su deposu', P: 'Tarla', F: 'Çiftlik', O: 'Petrol kuyusu', R: 'Rafineri', S: 'Nakliye deposu',
  M: 'Maden', Q: 'Taş Ocağı', Y: 'Fabrika', L: 'Elektronik fabrikası', T: 'Moda fabrikası', D: 'İtici fabrikası',
  1: 'Araba fabrikası', 6: 'İçecek fabrikası', 7: 'Havacılık ve uzay fabrikası', 8: 'Havacılık ve uzay elektroniği',
  9: 'Dikey entegrasyon tesisi', 0: 'Hangar', k: 'Yiyecek işleme merkezi', e: 'Mezbaha', i: 'Değirmen', j: 'Fırın',
  m: 'Yemek servisi', o: 'Beton Santrali', x: 'İnşaat fabrikası', g: 'Genel müteahhit', v: 'Orman fidanlığı',
  // Araştırma
  p: 'Bitki araştırma merkezi', h: 'Fizik laboratuvarı', b: 'Damızlık laboratuvarı', c: 'Kimya laboratuvarı',
  s: 'Yazılım Araştırması', a: 'Otomotiv Araştırması', f: 'Moda & Tasarım', l: 'Fırlatma rampası', q: 'Mutfak',
  // Satış (perakende)
  G: 'Bakkal', A: 'Benzin istasyonu', C: 'Elektronik mağazası', 2: 'Araba bayisi', H: 'Moda mağazası', d: 'Donanım mağazası',
  B: 'Satış ofisleri', r: 'Restoran',
  // Mevsimlik pazarlar (oyundaki adlar)
  I: 'Spring market', t: 'Cadılar Bayramı Pazarı', u: 'Yılbaşı Pazarı', z: 'Plaj Bar',
  // Dinlenme, banka, akademi
  3: 'Tapınak', 4: 'Park', 5: 'Göl', n: 'Banka', y: 'Akademi',
};

// İngilizce adlar oyunun İngilizce bina ekranından (7 Ekim 2026 fotoğrafları) birebir alındı.
export const BINA_ADLARI_EN = {
  // Üretim
  E: 'Power plant', W: 'Water reservoir', P: 'Farm', F: 'Ranch', O: 'Oil rig', R: 'Refinery', S: 'Shipping depot',
  M: 'Mine', Q: 'Quarry', Y: 'Factory', L: 'Electronics factory', T: 'Fashion factory', D: 'Propulsion factory',
  1: 'Car factory', 6: 'Beverage factory', 7: 'Aerospace factory', 8: 'Aerospace electronics',
  9: 'Vertical integration facility', 0: 'Hangar', k: 'Food processing plant', e: 'Slaughterhouse', i: 'Mill', j: 'Bakery',
  m: 'Catering', o: 'Concrete plant', x: 'Construction factory', g: 'General contractor', v: 'Forest nursery',
  // Araştırma
  p: 'Plant research center', h: 'Physics laboratory', b: 'Breeding laboratory', c: 'Chemistry laboratory',
  s: 'Software R&D', a: 'Automotive R&D', f: 'Fashion & Design', l: 'Launch pad', q: 'Kitchen',
  // Satış (perakende)
  G: 'Grocery store', A: 'Gas station', C: 'Electronics store', 2: 'Car dealership', H: 'Fashion store', d: 'Hardware store',
  B: 'Sales offices', r: 'Restaurant',
  // Mevsimlik pazarlar
  I: 'Spring market', t: 'Halloween market', u: 'Xmas market', z: 'Beach market',
  // Dinlenme, banka, akademi
  3: 'Temple', 4: 'Park', 5: 'Lake', n: 'Bank', y: 'Academy',
};

// Diğer dillerde adlar oyunun o dildeki dil dosyasından gelir (dil-xx.js › BINALAR); orada olmayan harf İngilizce görünür.
const ADLAR = DIL === 'tr' ? BINA_ADLARI : { ...BINA_ADLARI_EN, ...(DIL === 'en' ? {} : DIL_ADLARI.bina) };
// Adı olmayan bir harf ekranda "Bina X" olarak görünür (hiçbir zaman boş kalmaz; ön ek çeviri katmanında çevrilir)
export const binaAdi = (letter, onEk = 'Bina') => ADLAR[letter] || BINA_ADLARI[letter] || `${onEk} ${letter}`;
