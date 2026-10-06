// DentSimco — bina adları (tek kaynak). Üretim, Perakende ve diğer bölümler adları buradan okur.
// Oyunun dil paketlerinden resmî Türkçe adlar bulununca yalnız bu dosyadaki listeyi güncellemek yeterlidir.
// Anahtar: oyunun bina harfi (constants/buildings içindeki dbLetter).

export const BINA_ADLARI = {
  // Üretim
  E: 'Enerji santrali', W: 'Su deposu', P: 'Tarla', F: 'Çiftlik', O: 'Petrol kuyusu', R: 'Rafineri', S: 'Nakliye deposu',
  M: 'Maden', Q: 'Taş ocağı', Y: 'Fabrika', L: 'Elektronik fabrikası', T: 'Moda fabrikası', D: 'İtici fabrikası',
  1: 'Araba fabrikası', 6: 'İçecek fabrikası', 7: 'Havacılık fabrikası', 8: 'Havacılık elektroniği', 9: 'Dikey entegrasyon tesisi',
  0: 'Hangar', k: 'Gıda işleme tesisi', e: 'Mezbaha', i: 'Değirmen', j: 'Fırın', m: 'Catering', o: 'Beton santrali',
  x: 'İnşaat fabrikası', g: 'Genel müteahhit', v: 'Orman fidanlığı',
  // Araştırma
  p: 'Bitki araştırma merkezi', h: 'Fizik laboratuvarı', b: 'Islah laboratuvarı', c: 'Kimya laboratuvarı', s: 'Yazılım Ar-Ge',
  a: 'Otomotiv Ar-Ge', f: 'Moda ve tasarım', l: 'Fırlatma rampası', q: 'Mutfak',
  // Satış (perakende)
  G: 'Bakkal', A: 'Benzin istasyonu', C: 'Elektronik mağazası', 2: 'Araba galerisi', H: 'Giyim mağazası', d: 'Yapı market',
  B: 'Satış ofisleri', r: 'Restoran',
  // Mevsimlik pazarlar (adlar oyundaki görsel adlarından; resmî Türkçe adla değiştirilecek)
  I: 'Bahar pazarı', t: 'Sonbahar pazarı', u: 'Noel pazarı', z: 'Plaj pazarı',
  // Dinlenme, banka, akademi
  3: 'Tapınak', 4: 'Park', 5: 'Göl', n: 'Banka', y: 'Akademi',
};

// Adı olmayan bir harf ekranda "Bina X" olarak görünür (hiçbir zaman boş kalmaz)
export const binaAdi = (letter, onEk = 'Bina') => BINA_ADLARI[letter] || `${onEk} ${letter}`;
