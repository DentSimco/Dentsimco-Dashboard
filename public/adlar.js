// DentSimco — bina adları (tek kaynak). Üretim, Perakende ve diğer bölümler adları buradan okur.
// Adlar oyunun kendi Türkçe bina ekranından (Ekim 2026 fotoğrafları) birebir alındı; büyük harfler ve "Spring market"
// gibi çevrilmemiş adlar da oyundaki gibidir. Oyunda olmayan hiçbir bina eklenmedi.
// Anahtar: oyunun bina harfi (constants/buildings içindeki dbLetter).

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

// Adı olmayan bir harf ekranda "Bina X" olarak görünür (hiçbir zaman boş kalmaz)
export const binaAdi = (letter, onEk = 'Bina') => BINA_ADLARI[letter] || `${onEk} ${letter}`;
