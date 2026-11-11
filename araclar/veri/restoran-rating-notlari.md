# Restoran rating ve doluluk: araştırma notları (Ekim–Kasım 2026)

Ölçümler: `restoran-rating-olcumleri.json` (Sky, ANARCHY, Dentium ekranları ve önceki oturumun 16 satırı).
Oyunun rating ve doluluk formülü sunucuda; buradaki her şey oyunun metinleri, istemci kodu ve bu ölçümlerden çıkarımdır.
Durum: **doğrulandı** (araca işlendi), **aday** (kanıt var, doğrulanmadı, hesaba katılmadı), **elendi**.

## Doğrulandı (araçta)

| Bulgu | Kanıt | Araçta |
|---|---|---|
| Gazetenin fiyat dilimi menü fiyatının $30'un en yakın katına yuvarlanmışıdır: 60 = $60–74, 90 = $75–104 … 330 = $315–344, 360 = $345–350 | En yüksek fiyat $350 iken $360 dilimi var; 70 döngüde alt sınır varsayımı ortalama 15,5, yuvarlama 9,6 puan hata (sapma +8,1 → −1,3), tavan varsayımı sapma −9,3 | Isı Haritası etiketleri, kâr fiyatı ($15 fazlaydı), $345–350 dilimi; Perakende doluluk tahmini ($75–100'de 15–20 puan fazlaydı) |
| Rating bonusu eksi olabilir: ekip dışı satış hızı −%3 → −0,06 | Dentium Yönetim ekranı "Restoran derecesi −0,06 +0,200" | Kurulum'da eksi satış hızı; Menü Seç ve hedef rating eksi bonusu kullanır |
| Döngü zamanlaması: fiyat, rating ve yemek döngü başında sabitlenir; doluluk, gelir, yeni rating ve yorum döngü sonunda hesaplanır; ayar değişikliği sonraki döngüde geçerli | İstemci kodu: koşu kaydı `datetime` (başlangıç), `rating`, `menuPrice`; `resolved` olunca `occupancy`, `revenue`, `newRating`, `review`, `cogs`, `wages`; sayfa başlangıç + 12 saatte yenilenir. Rehber: "döngü başlamadan önce fiyatı güncelleyebilirsiniz" | Açıklama |
| Yaklaşma hızı k ≈ 0,2–0,3, döngü gürültüsü σ ≈ 0,18 | ANARCHY: aynı menülü 10 restoranın 2 günlük ortalamaları SS 0,22; özdeş restoran benzetimi k 0,2–0,3 ile 0,19–0,25, k 0,9 ile 0,09 verir. Sky 37 adım: k 0,36 ± 0,14 | Model k = 0,2 (değişmedi) |

## Elendi

- **Günlük referans fiyat (dünkü VWAP) rating değişimini sürer.** ANARCHY'nin aynı menülü, aynı dakikada başlayan 9 restoranı aynı döngüde −0,61 ile +0,37 arası değişti (ortak bileşen −0,01/−0,11/−0,04). Sky I ve III aynı saatte, Samosa ve Portakal ortak: değişimleri bağıntısız (r = −0,06). Restoran sabitli regresyonda maliyet katsayısı −0,38 ± 0,43; referans güncelleme saati 0–21 UTC taranmıştır.
- **Menünün toplam maliyeti ratingi yükseltir.** Koltuk başına referans maliyet oran tablosu yüzünden menüler arasında 41–46 $ (V'nin 1-1-1'i 60 $); en ucuz menü en yüksek ratingli.
- **7200 ÷ oran ürünlerin referans maliyetidir.** 7200, 21 Eyl–25 Eki 2026 Q6 fiyatı × oran'ın geometrik ortalamasıdır (7.145, log-log R² 0,99). Oyunun bir sabiti değildir; sütte 3,6 kat şişer. Oyunun referans fiyatı ürün ve kalite başına her gün önceki günün VWAP'ından (hareketli ortalama) hesaplanır.
- **Adetle ağırlıklı ortalama.** 16 satırda χ² 95 (düz ortalama 73).
- **Doluluk rating değişimini etkiler.** Restoran sabitli: −0,23 ± 0,24, permütasyon p = 0,36; ANARCHY döngü içinde eğim ≈ 0.

## Aday (doğrulanmadı, hesaba katılmadı)

- **Ekonomi evresi ratingi etkiler.** 29 gazete döneminde ortalama döngü ratingi: tamamen büyüme olan dönem normale göre +0,42 … +0,62, durgunluk −0,12 … −0,35 (zaman eğilimiyle; evre payları karıştırılınca p = 0,003). Sky'ın restoranları büyümenin bittiği 30 Ekim'den sonra düştü (III, menü sabitken 5,97 → 5,15). Restoranların kapanıp açılmasından (bileşim) da gelebilir. Sınama: evre değişiminden sonra 3–4 gün aynı restoranları izlemek.
- **Rehberdeki "etkisi çoğunlukla maliyetine bağlı" = ürün ağırlığı.** Menü puanı = Σ (adet × kaynak değeri × kalite puanı) ÷ Σ (adet × kaynak değeri). Sunucu yemeği "kaynak değeriyle" değerliyor (Dumpster Chef sertifikası). Kaliteler yakınken düz ortalamayla aynı sonucu verir (16 satırda χ² 74,1 / 70,0, düz 73,2). Sınama: Süt Q12 + Kokteyl Q0 ile Süt Q0 + Kokteyl Q12 (beklenen fark ~1,5).
- ~~**Tüketim miktarı (oran) ürünün katkısını artırır.**~~ **9 Kasım'da elendi** (QUAL deneyi: aynı kalitede az tüketilen pahalı ürünler, M3, çok tüketilen ucuz ürünlerden, M2, düşük değil: M3 − M2 = −0,02 … +0,28; tüketim terimi −0,8 bekliyordu). Sky'daki menü farkları (en belirgini V, Ekmek-Köfte-Kokteyl) belirli bir ürüne (ör. ekmek) ya da o restoranlara özgü olabilir.
- **Kasım modeli normal evrede fazla tahmin eder.** ANARCHY: model 6,54, gözlenen 5,88; QUAL deneyi: eko Q5 menü model 5,75, gözlenen ~4,9–5,4; eko Q11–12 model 6,92, gözlenen ~6,5–6,7. Nedeni evre değil: aynı evrede Sky (1-1-1 Q6) modele uyuyor; fazlalık kalite eğrisinin üst bölümünde ve çeşit çarpanında.

## Rating denklemi yeniden (8 Kasım): çeşit, kalite eğrisi, lüks

Mevcut model (restoran-rating.js): hedef = (ürün puanı ortalaması × çeşit + bonus) × oturma; çeşit = 1 + 0,037 × (ürün sayısı − 6)
(3 ürün 0,889; 6 ürün 1). Ürün puanı f(q) = 0,4 + 5,89 (1 − e^(−q/3,43)): Q0 0,40, Q1 1,89, Q6 5,27, Q12 6,11.

Normal evrede (30 Eki–8 Kas; ANARCHY 17–19 Eki) adımlardan çıkan hedefler (k = 0,27) ile mevcut model:

| Test | Ürün | Ölçülen hedef | Mevcut model | Fark |
|---|---|---|---|---|
| Sky I–IV (1-1-1 Q6, bonus 1,05) | 3 | 5,33–5,95 | 5,73 | −0,40 … +0,22 |
| Sky V (Ekmek, Köfte, Kokteyl Q6) | 3 | 4,68 ± 0,30 | 5,73 | −1,05 |
| ANARCHY (2-2-2 Q5–Q10, bonus 0,99) | 6 | 5,88 ± 0,12 | 6,54 | −0,66 |
| Dentium Q0 (2-2-2, bonus 0,14) | 6 | 0,35 ± 0,30 | 0,54 | −0,19 |
| Dentium Q1 (2-2-2, bonus −0,03) | 6 | 0,68 ± 0,38 | 1,86 | −1,18 |

- **Çeşit:** Sky I (3 ürün, Q6) ile ANARCHY (6 ürün, Q5–Q10, aynı ürün aileleri, aynı evre) bonus çıkarılınca eşit: 4,90 ve 4,89
  (fark 0,00 ± 0,26). Mevcut model +0,87 bekliyor (kalite +0,29, çeşit +0,58). Çeşidin 3 → 6 ürün katkısı normal evre verisinde
  görünmüyor; mevcut modelin +0,58'i desteklenmiyor. Önceki oturumun (büyüme haftası / tarih belirsiz) Yanko ve eski ANARCHY
  satırları +0,4–0,5 gösteriyordu; tarihleri bilinmeden çelişki çözülmez.
- **Çeşit çarpan mı toplanan mı:** mevcut veriyle ayırt edilemez (normal evre uyumunda üç biçim de χ² 80,7). Model 6 ürünü referans
  aldığından (çarpan 1) 2-2-2 Q0 testi çeşit hakkında bilgi vermez; iki biçim ancak aynı düşük kalitede 1-1-1 ile 2-2-2 karşılaştırılınca ayrılır.
- **Kalite eğrisi alt ucu:** Q1 (2-2-2) hedefi 0,7 ± 0,4; mevcut eğri 1,86 (yaklaşık 2,5σ fazla). Q0 0,2 ± 0,3 (eğri 0,4). İçbükey eğrinin
  bu noktalardan geçmesi için Q1 ≥ ~0,95 gerekir; S biçimli (Q0–Q1 düz, Q2–Q5 hızlı yükselen) eğri daha iyi uyuyor. Q2–Q5 ölçülmedi.
- **Kalite eğrisi üst ucu:** normal evrede Q6 ≈ 4,7 (Sky, ürün etkisi düzeltilmiş), Q5–Q10 karışımı ≈ 4,9; eğri 5,27 ve 5,55 diyor.
- **Önerilen denklem (normal evre, eko; aday):** hedef = Ü + 0,5 × (menünün ort. ln(oran) − 4,1) + bonus, çeşit terimi yok.
  Ü (ürün puanı ortalaması): Q0 0,2 · Q1 0,7 · Q6 4,7 · Q5–Q10 karışımı 4,9 (ölçülen); Q2–Q5 ve Q11–Q12 bilinmiyor (S uyumu: Q3 ~2,5, Q12 ~5,2).
  Bu denklem normal evre gruplarının hepsini ±0,1 içinde veriyor (8 grup; parametre sayısına göre fazla uyum riski var).
- **Lüks (eski veri):** normal personelli lüks satırları (Tosuncuk, Star Deluxe; tarih belirsiz) ×1,25'in çok altında: ölçülen 3,2–5,6,
  ×1,25 ile beklenen 5,3–5,9. Eko karşılıklarına oranı ~0,7–1,1. Lüksün ratingi yükseltmediği de olası; eko–lüks testi bunu ölçecek.
  **9 Kasım:** QUAL deneyi lüksün ratingi yükselttiğini gösterdi (×1,14–1,25); eski lüks satırları başka bir nedenle düşük.

## QUAL deneyi (9 Kasım): kalite × ürün × oturma

Tasarım: 3 menü (M1 Süt, Kahve, Salata, Samosa Q12 + Portakal, Elma Q11; M2 aynı ürünler Q5; M3 Peynir, Turta, Hamburger, Köfte,
Kokteyl, Zencefilli Q5), her biri hem lüks (seviye 1 ya da 5) hem eko (seviye 10). Hepsi 2-2-2, eko personel, bonus 0,83, normal evre,
4'er döngü. Başlangıç ratingleri dengede değildi (9,20 / 7,86 / 8,77 / 5,12 / 6,99 / 5,49).

Dört çözümleme (tüm adımlar; ECO1'in tek seferlik −1,12 adımı hariç; k 0,27 ve 0,36 sabit) aynı sonucu veriyor:

| Etki | Sonuç | Mevcut model | 8 Kasım adayı |
|---|---|---|---|
| Lüks | **×1,14–1,25** (ya da +1,0–1,4) | ×1,25 | ölçülmemişti |
| Kalite Q5 → Q11–12 (ürün puanı) | **+0,70 … +1,15** | +1,17 | +1,07 |
| Ürün M3 − M2 (aynı kalite) | **−0,02 … +0,28** | 0 | −0,81 (elendi) |
| Ürün puanı Q5 (M2) | **4,2–4,45** | 4,92 | 4,15 |
| Ürün puanı Q11–12 (M1) | **5,0–5,5** | 6,09 | 5,22 |

- Lüksün çarpan mı sabit ek mi olduğu ayırt edilemiyor (χ² farkı < 1). Q12 menüsünde lüks kazancı en küçük çıktı; LUX1 hâlâ 9,20'den
  iniyor, birkaç döngü daha gerekli.
- Çeşit: QUAL'ın 6 ürünlü Q5 menüsü (4,3–4,45) ile Sky'ın 3 ürünlü Q6 menüleri (4,65–4,9) birlikte, 6 ürünün 3 üründen yüksek
  olmadığını gösteriyor; mevcut modelin +0,58'i desteklenmiyor. Doğrudan sınama: aynı şirkette 1-1-1 Q5 eko.
- Yaklaşma hızı: ECO1'in ilk adımı hariç k ≈ 0,22–0,38; adım gürültüsü 0,14–0,22. Doluluğun ratinge etkisi yine yok.
- ECO1'in ilk adımı (7,86 → 6,74) modelin beklediğinden 0,6–0,8 fazla düşük (~4σ). Önceki yapılandırması bilinmiyor; saatlik ücreti de
  aynı seviye ve işçi sayısındaki öteki eko'lardan yüksek ($10.212, ötekiler $7.560).
- Ortak döngü etkisi ipucu: ikinci döngüde (ölçüm dosyasında 2026-11-08 11:27 satırı) altı restoranın hepsi beklenenden ortalama
  +0,16 yukarıda (z ≈ 2,5). Tek döngü, ama evre etkisi gibi pazar geneli bir bileşene işaret edebilir; deneylerde değişmeyen bir
  kontrol restoranı bu yüzden yararlı.
- Karışıklık: lüksler seviye 1 ve 5, eko'lar seviye 10. Seviyenin ratinge etkisi varsa lüks tahminine karışır (Kasım
  ölçümlerinde seviye etkisi görülmemişti).
- **Kasım içbükey eğrisinin sınaması:** biçim destekleniyor, yükseklik desteklenmiyor. Ürün puanı = s × f_Kasım(Q) modeli QUAL'a
  üç serbest menü puanı kadar iyi uyuyor (χ² en çok 2,2 kötü, 2 parametre az). Q0 ölçümüne (0,25 ± 0,3) bağlı doğrusal eğri
  reddediliyor (k 0,27: χ² 80–97, içbükey 15,6–29). Düzey: s = 0,86–0,90, yani 2-2-2 menüler aracın 1-1-1'e uyguladığı 0,889
  düzeyinde; s = 0,889 sabit de aynı iyi uyuyor. Aracın şu anki hâli (s 1, lüks 1,25) χ² 52–76. ×0,889 ile: QUAL Q5 4,37 (ölçülen
  4,2–4,45), Q11–12 5,42 (5,0–5,5), ANARCHY 19 Ekim 4,94 (4,89 ± 0,12), Sky 1-1-1 Q6 4,68 (değişmez). Lüks bu uyumda ×1,16–1,25.
  Alt uçta eğri Q1'de 1,68 diyor, ölçülen 0,7 ± 0,4 (~2,5σ). İçbükeylik orada da reddedilmiyor (Q0 0,2 ile Q5 4,35'ten geçen
  içbükey eğri için Q1 ≥ 1,03 yeter); sorun üstel biçimin büyük ilk adımı (+1,3). Eski iki 2-2-2 satırı (ANARCHY 6,64, Yanko 6,33;
  tarihleri belirsiz) ölçeksiz eğriye uyuyor; büyüme evresinden iseler evre etkisiyle (+0,4–0,6) tutarlı.
- Aday denklem (9 Kasım; normal evre): hedef = (Ü + bonus) × oturma, lüks ≈ ×1,2; çeşit ve ürün (tüketim) terimi yok.
  Ü (ürün puanı ortalaması): Q0 0,2 · Q1 0,7 · Q5 ~4,35 · Q6 ~4,6 · Q5–Q10 karışımı ~4,9 · Q11–12 ~5,2. Q2–Q4 ve Q7–Q10 ayrı ölçülmedi.
- **Sınamalar:** (1) aynı 6 ürünle Q3 2-2-2 (eğrinin ortası; mevcut model ~3,8 + bonus, S eğrisi ~2,5 + bonus); (2) bir Sky 1-1-1 Q6
  restoranını aynı ürün ailelerinden 2-2-2 Q6'ya çevirmek, diğeri kontrol (mevcut model +0,58, yeni ~0); (3) ~~eko–lüks Q11–Q12
  2-2-2~~ QUAL deneyinin M1'i olarak yapıldı (yukarıda).
- **QUAL sonrası sınamalar (9 Kasım):** (a) altı restoranı 4–6 döngü daha hiç değiştirmeden sürdürmek (LUX1, LUX2 hâlâ iniyor;
  8–10 döngüde kalan fark %10'un altına iner); (b) aynı şirkette 1-1-1 Q5 eko (Süt, Salata, Portakal), ECO2 ile aynı seviye: çeşidin
  doğrudan sınaması (mevcut model −0,55, yeni ~0); (c) lüks Q0 ya da Q1 menü: lüks çarpan ise eko'dan yalnız +0,2–0,3, sabit ek ise
  +1,0–1,4 yukarıda olur; (d) aynı ürünlerle Q8 2-2-2 eko: eğrinin Q5–Q12 arası.

## Dentium Q1, 8 döngü (10 Kasım)

Q1 2-2-2, eko, seviye 1, $350; 7–10 Kasım. Ratingler 0,37 → 0,32 → 0,42 → 0,62 → 0,42 → 0,02 → 0,17 → 0,18 → 0,00 (alt sınır).
Son 2 döngüde yönetici eğitimde (bonus −0,03); öncekilerde 0,14 ya da −0,03 (belli değil). Doluluk %0–15.

- **Ölçülen Q1 ürün puanı ~0,0–0,2** (k 0,22–0,36 ve üç bonus varsayımı; 1σ ±0,2–0,35; 0,00'daki adım sansürlü sayıldı). Aynı
  restoranın Q0 dönemi ($60, doluluk %8–15): 0,21. Adım gürültüsü 0,19 (başka yerlerle aynı).
- İlk yorum (S biçimli eğri) geri alındı: kullanıcıya göre oyunda eğri doğrusal ya da içbükey olabilir, S olamaz. Q1 dışındaki
  bütün ölçümler Kasım eğrisi ×0,889'a oturuyor: Dentium Q0 0,21 (eğri 0,36), QUAL Q5 4,2–4,45 (4,37), Sky Q6 ~4,7 (4,68), ANARCHY
  ~4,9 (4,94), QUAL Q11–12 5,0–5,5 (5,42). Yalnız Q1 uymuyor (eğri 1,68); Q0 0,21 ve Q5 4,35 ile içbükeylik için Q1 ≥ ~1,0 olmalı.
  Bu yüzden Q1 ölçümü bozuk sayılıyor. **(10 Kasım akşamı düzeltildi, aşağıda: Patrik'in doğrulaması.)**
- Q1'i bozabilecek iki etken (ikisi de yalnız Dentium'da var):
  - $350 fiyat. Zayıf aday: $350'deki ilk 4 döngüde rating 0,18 → 0,62 yükseldi.
  - Neredeyse boş restoran. Dentium'da doluluk ile rating değişimi arasında korelasyon 0,85 (8 Q1 adımı); ortalamaya dönüş hesaba
    katılınca doluluk terimi χ²'yi 9,7'den 5,1'e indiriyor (~2σ). %0 doluluklu döngü −0,20, %1,67'lik −0,40, %14,65'lik +0,15.
    QUAL'da (%35–100) doluluğun etkisi yok; etki varsa yalnız çok düşük dolulukta. Oyun döngü sırasında "müşteri geri bildirimleri
    ve doluluk istatistikleri" topluyor.
- **Sıradaki sınama:** Q1 menüsü, fiyat $60 (Q0 dönemiyle aynı), 4–6 döngü. İçbükeyse hedef ~1,8 (bonus 0,14); 4 döngüde ~1,3'e
  çıkar. ~0,2–0,3'te kalırsa aynı koşulda Q1 = Q0 demektir. Ardından Q3.

## Oyuncunun doğrusal ölçeği ve ölçülen aralık (10 Kasım)

Tecrübeli bir oyuncunun ölçeği: kalite başına 0,5; Q0 −3, Q6 0, Q12 +3 (toplam 6). Ölçülen ürün puanları Q6'ya göre:

| Kalite | Ölçülen | Q6'ya göre | Oyuncu | Kasım ×0,889 |
|---|---|---|---|---|
| Q0 | 0,21 (Dentium, $60) | −4,5 | −3 | −4,3 |
| Q1 | ~0,05 (Dentium, $350, boş) | −4,6 | −2,5 | −3,0 |
| Q5 | 4,2–4,45 (QUAL) | −0,35 | −0,5 | −0,3 |
| Q6 | ~4,7 (Sky 1-1-1) | 0 | 0 | 0 |
| Q7,5 ort. | ~4,9 (ANARCHY) | +0,2 | +0,75 | +0,26 |
| Q11–12 | 5,2–5,5 (QUAL) | +0,5 … +0,8 | +2,8 | +0,74 |

- Toplam aralık benzer (~5,2'ye karşı 6), ama simetrik değil: etkinin neredeyse tamamı Q6'nın altında.
- Oyuncunun eğimi Q6 üstünde reddediliyor: QUAL'da (aynı ürün, şirket, zaman) M1 − M2 = 3,33 bekliyor, ölçülen 0,7–1,0; χ² 80–187,
  serbest model 15–27. Q5–Q12 arasındaki en iyi doğrusal eğim 0,10–0,14/kalite. ANARCHY − Sky I: oyuncu +0,75, ölçülen ~0.
- 8 Aralık 2021 güncelleme notu ("düşük kalite ratingi daha çok düşürür, yüksek kalitenin artı etkisi azaltıldı") simetrik bir
  ölçeğin asimetrik yapıldığını düşündürüyor; oyuncunun ölçeği bu değişiklikten önceki hâl olabilir (varsayım).

## Oyunun kendi açıklamaları ve güncelleme kayıtları (10 Kasım)

Kaynak: oyunun Restoran Rehberi (`/api/v3/pages/en/restaurant-guide/`) ve istemci kodundaki güncelleme kayıtları (10 Kasım 2026
dosyası; 5 Kasım'dan beri yeni kayıt yok). Entrepreneurs gazetesi #58 (9 Kasım 2023).

Rehber: "At least one item in each food category is required." · "Each food item has a different impact on your new rating,
depending mostly on their cost. You also receive a rating bonus for having a variety of items." · "Higher quality food impacts
your new rating as well." · "Effective communication skill points increases your restaurant rating by 0.01." · "Sales speed bonus
adds 0.02 to the resulting restaurant rating." · "Luxury restaurant multiplies the effect of the rating, rather than add to it."

| Tarih | Kayıt (kısaltılmış) | Modele etkisi |
|---|---|---|
| 2021-10-20 | Kapanan restoranın ratingi %12,5 düşer | Kapanış cezası (araçta var) |
| 2021-10-25 | Sales speed bonus adds 0.02 to the resulting restaurant rating | Bonus formülü doğrulandı |
| 2021-12-08 | Low food quality hurts rating a bit more, high quality food has smaller positive effect than before | Kalite etkisi asimetrik: yön ölçümle aynı (Q6'ya göre −4,5 / +0,5…+0,8) |
| 2022-02-21 | Luxury multiplies the effect of the rating rather than add to it; good staff slightly less positive; consumption up; occupancy extremes less likely; luxury capacity 50% | Lüks çarpan (araçtaki biçim) |
| 2022-06-17 | CMOs impact on the restaurant rating reduced by 33% | Bonus ekrandan okunuyor; etkilemez |
| 2022-08-16 | Multiple qualities of the same food kind were incorrectly considered as multiple food options; fixed | Çeşit = farklı yemek sayısı; çeşit etkisi var |
| 2022-08-30 | Max menu price $350 (was $450), minimum occupancy slightly decreased (rating 0 + max price exploit) | Dentium'un $350 testi tam bu durumda |
| 2023-11-13 | Gazete E#58: wages marginally increased, luxury rating bonus reduced, good service bonus slightly increased | Eski lüks verileri bugünkünden yüksek olabilir |
| 2025-09-12 | Fix restaurant rating computation (ayrıntı yok) | Öncesine ait oyuncu bilgileri eskimiş olabilir |

- Çeşit etkisi kesin (rehber + 2022-08-16). Biçimi (toplanan / çarpan) belgelerde yok. Q5 üstünde iki biçim neredeyse aynı tahmini
  verir (3 → 6 ürün: çarpanla Q5'te +0,55, Q12'de +0,68; toplananla her yerde ~+0,58); ayrım yalnız düşük kalitede.
- "Eğri ×0,889" önerisi (çeşit etkisi yok varsayımı) geri çekildi. Kalan bulgu: 2-2-2 menüler araçta 0,5–0,7 fazla tahmin
  ediliyor (QUAL, ANARCHY). Düzeltmenin eğriye mi çeşit terimine mi gideceği, aynı şirkette 1-1-1 ile 2-2-2 karşılaştırmasıyla
  belli olur. Şirketler arası karşılaştırma (Sky 1-1-1 ile QUAL/ANARCHY 2-2-2) 3 → 6 farkını ~0 ± 0,3 gösteriyor; ya etki aracın
  0,58'inden küçük ya da şirketler arası karşılaştırma yanıltıyor.
- Oyuncunun simetrik ±3 ölçeği 2021-12-08 kaydıyla çelişiyor; kayıt "a bit more" diyor ama bugün ölçülen asimetri daha büyük.

## İki model ailesinin karşılaştırması (10 Kasım)

Araç: `node araclar/restoran-rating-modelleri.mjs [--eco1] [--q1haric] [--k=..] [--skyBonus=..] [--skyV222] [--buyumeHaric]`.
107 adım (Sky 38, ANARCHY 32, Dentium 13, QUAL 24); k 0,27, σ 0,19; 0,00'da biten adım sansürlü. Modeller:
M1 araç (Kasım: üstel eğri × çeşit çarpanı, lüks 1,25, serbest parametre yok); M1y aynı biçim yeniden uydurulmuş; M3 üstel eğri +
toplanan çeşit (1-1-1 = 3, 2-2-2 = 6 ürün; v × (N − 6)); M2 kırık doğru + toplanan çeşit (nötr kalite Qn'nin altında a_alt,
üstünde a_üst eğim): düz okuma a_alt ≥ a_üst, ters okuma a_alt ≤ a_üst; oyuncunun ölçeği (0,5/kalite). Doygun: her restorana
ayrı serbest hedef (23 parametre).

| Model | χ² (tümü) | χ² (ECO1:0 ve Dentium Q1 hariç) |
|---|---|---|
| Doygun (taban, 23 parametre) | 97,0 | 74,1 |
| M1 araç (0 parametre) | 242,4 | 155,9 |
| M1y / M3: üstel içbükey, çeşit çarpan / toplanan (5) | 112,7 | 91,6 |
| M2 düz okuma: kırık içbükey (6) | 112,4 | 91,5 |
| M2 ters okuma → doğrusala iniyor (4) | 244,5 | 154,0 |
| Oyuncunun ölçeği (3) | 245,2 | 166,2 |

- **Kaydın düz okuması destekleniyor.** "Low food quality hurts rating a bit more, high quality food has smaller positive effect"
  = düşük kalitenin zararı arttı, yüksek kalitenin artısı azaldı (içbükey). Ters okuma (düşük kalitenin zararı azaldı, yüksek
  kalitenin artısı arttı) en iyi hâlinde doğrusal çizgiye iniyor; içbükey modellerden Δχ² 60–200 kötü (bütün varyasyonlarda) ve
  çeşit etkisini eksi buluyor.
- İçbükey modeller doygun modele yakın (tümünde 112,7'ye karşı 97,0; 17 parametre az): kalan sapma çoğunlukla restorana özgü.
- **Çeşit toplanan mı çarpan mı ayırt edilemiyor** (M1y = M3): ürün sayısı yalnız Sky'ın Q6 1-1-1 menüleriyle ötekiler arasında değişiyor.
- **Çeşit 1-1-1 → 2-2-2:** M3'te +0,18 (1σ 0,0 … +0,37; %95 −0,15 … +0,51), M2'de +0,14 … +0,70. Aracın +0,58'i Δχ² ≈ 6 ile zayıf,
  sıfır Δχ² ≈ 1 ile dışlanmıyor. Tahmin, Q5 ile Q6 arasındaki eğri biçimine bağlı; kesin ölçüm için aynı şirkette 1-1-1 ile 2-2-2 gerek.
- **Lüks ×1,17–1,25** (M3 %95: 1,11–1,30).
- **Kalite (ürün puanı, eko, 2-2-2):** Q5 ~4,4 · Q6 ~4,7 · Q12 5,0–5,5; Q6 → Q12 yalnız +0,4 … +0,6. Alt uç Dentium Q1'e bağlı:
  dahilse Q1 ≈ 0 ve Q0 eksi (−1 … −3, rating 0'da sınırlanıyor; kayıttaki "hurts" ile uyumlu); hariçse Q0 0,21, Q1 1,1–1,7.
- Varyasyonlar (k 0,22 / 0,36, Sky bonusu 0,96, Sky V 2-2-2 dönemi, büyüme evresi hariç) sonucu değiştirmiyor.

## Oyun ekibinden doğrulama (10 Kasım): Patrik (moderatör)

Kaynak: Sim Companies sohbeti, kullanıcının ekran görüntüsü (10 Kasım 17:46). Patrik 8 Aralık 2021 değişikliğini güncel kodla karşılaştırdı.

- "The intended meaning is that low-quality food became somewhat worse for restaurant rating, while the positive effect of
  high-quality food was reduced." Düz okuma (içbükey) doğrulandı ve güncel kodda geçerli. Ters okuma ve simetrik doğrusal ölçek
  oyun ekibince de dışlandı (veride zaten Δχ² 60–200 kötüydü).
- "Lower-quality food can have a negative impact on the restaurant's rating; it is not merely a smaller positive bonus."
  Düşük kalitenin katkısı eksi olabiliyor ("düşük ama pozitif" okuması yanlış). Aynı cevap: "food quality is only one of several
  factors ... I cannot confirm example values or the exact calculation" ve "We do not disclose the exact calculation".
  Türkçe rehbere önerilen cümle: "Lower-quality food can hurt the rating, while higher-quality food can improve it."
- Bonus: "each CMO skill point adds 0.01 (English and code)"; Türkçe rehberdeki 0,015 yanlış. Araçtaki 0,01 kodla doğrulandı.
  Lüks maaşı eko'nun yarısı (araçta var); kapanışta rating bir kez düşer (%12,5, araçta bilinen).
- **Tecrübeli oyuncunun ölçeği** (Q0 −3 … Q12 +3): işaret mantığı doğru (düşük kalite eksi); büyüklük ve doğrusallık veriyle
  uyuşmuyor. Ölçülen: Q6'ya göre Q0 ≲ −4,5, Q12 +0,5 … +0,8. Ölçeğin 2021 öncesi simetrik hâl olması olası (varsayım).

Çıkarımlar:
- **Dentium Q1'i "bozuk" saymak için gerekçem eksikti** (yukarıdaki Q1 bölümünde): Q0'ın 0,21 ölçüldüğünü varsayıp içbükey bir
  eğri için Q1 ≥ ~1,0 gerektiğini söylemiştim. Rating 0'ın altına inemediği için Q0 da yalnız üst sınır (≲ 0,5). Eksi etkiyle
  içbükey eğri Q1 ≈ 0'dan geçebilir: "bütün adımlar" uyumunda Q0 −3,2, Q1 0,03, Q5 4,43. Q1 artık şüpheli sayılmıyor; $350 ve boş
  restoran etkenleri sürüyor ama gerekli değil.
- **Q0 ve Q1 tabana yapışıyor, ama tam sıfıra değil.** Benzetim (k 0,27, σ 0,19, rating ≥ 0): hedef ≤ 0 ise ortalama rating
  0,16, döngülerin %32'sinde tam 0,00; hedef +0,2 … +0,3 ise ortalama 0,27–0,34, tam 0,00 %10–16. Gözlenen (Dentium, 13 döngü):
  ortalama 0,30, tam 0,00 1/13. Etkin hedef Q0 ve Q1'de küçük pozitif (+0,2 … +0,3); toplam hedef eksiyse tabanın tam 0 olmadığı
  anlamına gelir (taban bilinmiyor).
- Nötr kalite (etkinin 0 olduğu düzey) verimizden okunamıyor: ürün puanı f, taban puanla birlikte ölçülüyor. Kırık doğruda kırılma
  noktası Q1,5–Q6 arasında aynı iyi uyuyor (Δχ² ≤ 1,5).
- Öneri değişmedi: içbükey eğri + toplanan çeşit (ya da kırık doğru), "bütün adımlar" uyumu. Q3 eğrinin biçimini ayırır:
  içbükey eğri 3,2, Q1–Q5,5 arası doğrusal 2,2 (içbükey bir eğri 2,2'nin altına inemez).

## Ürünün etkisi (10 Kasım): Patrik'in ikinci cevabı ve verimiz

Patrik (moderatör), rehberdeki "Each food item has a different impact on your rating, mostly depending on its cost" cümlesi için:
"that's too cryptic and misleading. Change to: each food item can impact the rating differently. Or remove altogether."
Kokteyl portakal suyundan pahalı olduğu için mi daha yüksek rating veriyor diye sorulunca: "it's more complicated".
Yani ürünlerin etkisi farklı olabilir, ama "çoğunlukla maliyete bağlı" yanıltıcı; ayrıntı verilmedi.

Çözümleme: `node araclar/restoran-urun-etkisi.mjs` (107 adım, k 0,27, σ 0,19; k 0,22 ve 0,36 aynı sonucu veriyor).

| Soru | Sonuç |
|---|---|
| Sky I–V (aynı kalite Q6, 1-1-1, beş farklı ürün seti): hedefler eşit mi | χ² 4,8 (4 sd), p 0,30 (k 0,22: 0,45; k 0,36: 0,11); hedefler 5,23–5,95 |
| QUAL M3 − M2 (Q5; altı ürün tamamen farklı; ort. fiyat 5 kat, döngü maliyeti %39 yüksek) | +0,08 (−0,23 … +0,39); k 0,22: +0,18; k 0,36: −0,02 |
| Fiyatla artan ürün etkisi b (ort. ln Q6 fiyatı başına, tüm veri) | −0,13 (−0,24 … −0,02); +0,1'in üstü %95 dışlanıyor |
| Kokteyl − Portakal suyu (topluluğun örneği; Sky V − III − II + I) | +0,20 ± 0,54: ayırt edilemiyor |
| Köfte − Samosa · Zencefilli bira − Portakal suyu | −0,32 ± 0,39 · −0,22 ± 0,37 |
| Ekmek (Sky III ve V) | −0,47 (−0,70 … −0,24), Δχ² −4,2; ekmekli iki menü aynı zamanda seviye 3–4 (karışık) |

- Aynı kalitede ürün değiştirmek ratingi ±0,3–0,4 oynatıyor; fiyatla artan bir ürün farkı yok.
- **Ağırlık hipotezi sınanamadı.** Menünün kalite ortalaması ürünlerin maliyetiyle ağırlıklandırılıyorsa (w^γ, γ 0 düz, 1 maliyet
  ağırlıklı) bu bütün menülerde ürünler aynı kalitede olduğu için görünmez: Δχ² −0,2 … +1,2 (bütün γ, üç ağırlık biçimi).
  Tek ipucu eski, tarihi belirsiz Tosuncuk çifti: (Süt Q0 + üç pahalı Q12) − (hepsi Q10–12) menüsü, ölçülen +0,66 ± 1,12; düz
  ortalama −2,5 (2,8σ), maliyet ağırlıklı −0,4 (0,9σ). Ya pahalı ürünün kalitesi daha çok sayılıyor ya da Q0 çok eksi değil.
- QUAL M2/M3 sorunun yarısını cevaplıyor (ürün farkı ≈ 0); ağırlığı ölçemez.

Sınamalar:
1. **Takas (Q2):** A = Süt Q12, Samosa Q6, Kokteyl Q2; B = Süt Q2, Samosa Q6, Kokteyl Q12 (1-1-1, aynı seviye ve oturma).
   B − A: düz ortalama 0; maliyet ağırlıklı +1,0; fiyat ağırlıklı +2,4 (Q3 sürümü: 0 / +0,6 / +1,4). 4–6 döngü; LUX2 ve LUX3
   (seviye 1, lüks) kullanılabilir.
2. **Ekmek:** {Süt, Samosa, Portakal suyu} − {Ekmek, Samosa, Portakal suyu}, hepsi Q6 1-1-1: Sky I − III ≈ +0,6 çıkar mı.
3. Patrik'e kısa sorular: bir ürünün etkisi yalnız o ürünün türüne ve kalitesine mi bağlı, yoksa menünün geri kalanına da mı;
   aynı kalitede bir ürünü başka bir ürünle değiştirince rating değişebilir mi.

## Tosuncuk: profesyonel ve ekonomi personelli iki lüks restoran (11 Kasım, tarih tahmini)

Aynı şirket, aynı menü (1-2-1: Süt Q12, Lazanya Q12, Köfte Q10, Kokteyl Q8), $100, ikisi de lüks. R1 seviye 2, profesyonel personel
(son döngü ekonomi; sonra kapatıldı: 8,21 → 7,19, kapanış cezası %12,4). R2 seviye 1, ekonomi ("stajyer"). Bonus ekranda yok
(CMO eğitimde). Ölçüm dosyasında "Tosuncuk"; bonusu bilinmediği için modellere girmiyor, profesyonel adımlar da girmiyor.

| | k 0,22 | k 0,27 | k 0,36 |
|---|---|---|---|
| R1 profesyonel hedef | 9,76 ± 0,50 | 9,57 ± 0,41 | 9,36 ± 0,31 |
| Ekonomi hedef (R2 + R1'in son döngüsü) | 4,60 ± 0,43 | 4,82 ± 0,35 | 5,06 ± 0,27 |
| Profesyonel etkisi (lüks sonrası) | +5,16 ± 0,66 | +4,75 ± 0,54 | +4,29 ± 0,41 |

- **Profesyonel personel ≈ +4,75 (lüks sonrası), lüks içinde ≈ +3,9.** Eski satırlar tekrarlandı: 1-2-1 Q10–12 menüsü profesyonelle
  10,25, ekonomiyle 4,94 (+5,3); eski 2-2-2 7,9 ve 3,2 (+4,7). Sabit bir ek (farklar 4,3–5,3) çarpandan (oranlar 1,9–2,5) daha
  tutarlı. Araçtaki kullanılmayan "profesyonel +6,7" büyük.
- Döngü gideri profesyonelle $116.367, ekonomiyle $83.754: fark 4 × ekonomi maaşı, maaş oranı 5,0 (rehberle aynı).
- **Ekonomi personelli lüks bu menüde ~4,8; modeller tutmuyor.** İçbükey model bonus 0,35 ile 6,40, bonus 0 ile 5,98 diyor; tutması
  için bonusun −0,8 … −1,1 olması gerekir (araç için −1,5 … −1,9). Eski Tosuncuk ve Star Deluxe lüks satırları da aynı ölçüde
  düşük (4,94; 4,58; 3,2): eski satırlar hatalı değilmiş. QUAL'ın lüks restoranları (bonus 0,83, eko personel) modele uyuyor:
  QUAL LUX1'in ürün puanı 5,01, bu menü için model 5,07.
- Aday nedenler: (1) Tosuncuk'un bonusu çok düşük; (2) ürünler (Lazanya başka hiçbir testte yok, Star Deluxe'te var ve o da düşük;
  Köfte ve Kokteyl QUAL M3'te Q5'te sorunsuzdu); (3) 1-2-1 yapısı (çeşit tahminimiz yalnız −0,12 veriyor).
- Eski Süt Q0 satırı (5,60 ± 1,00, bonus 0,37): ekonomi personelliyse bugünkü ekonomi düzeyinden (4,8) yüksek, profesyonelliyse
  (9,6) çok düşük. Hangisi olduğu bilinmeden yorumlanamaz.

Sınamalar:
1. Tosuncuk'un Yönetim ekranındaki "Restoran derecesi" satırı (bonus).
2. Bonus normalse R2'de bir değişiklik: Lazanya → Samosa ya da Salata Q12 (1-2-1 kalır), ya da QUAL M1 menüsü (2-2-2, Q11–12).
3. Eski Süt Q0 menüsünün hangi restoranda ve hangi personelle çalıştığı.

## Çeşit değerlendirmesi (11 Kasım)

Her testin ölçülen hedefinden kalite (içbükey eğri, "bütün adımlar" uyumu), bonus ve lüks (×1,207) çıkarıldı; çeşit terimi
olmadan kalan fark (lüks öncesi, ağırlıklı ortalama):

| Grup | Yapı | Kalan fark |
|---|---|---|
| Sky (5 restoran, eko) | 1-1-1, N 3 | −0,18 ± 0,12 |
| ANARCHY, QUAL eko (bugünkü veriler) | 2-2-2, N 6 | 0,00 ± 0,11 |
| QUAL lüks | 2-2-2, N 6 | +0,01 ± 0,17 |
| Tosuncuk lüks eko bugün (bonus 0,35 / 0 varsayımı) | 1-2-1, N 4 | −1,43 / −1,08 ± 0,29 |
| Tosuncuk lüks eko eski | 1-2-1, N 4 | −1,36 ± 0,41 |
| Star Deluxe lüks eko eski | 2-2-1, N 5 | −1,12 ± 0,48 |
| Tosuncuk lüks eko eski | 2-2-2, N 6 | −2,12 ± 0,50 |
| Eski eko satırlar (Yanko, eski ANARCHY, Sky V 2-2-2; büyüme evresi olabilir) | 2-2-2, N 6 | +0,66 ± 0,21 |

- **1-1-1 → 2-2-2 ≈ +0,18 ± 0,16.** Çeşit etkisi küçük; aracın +0,58'i (Q6) büyük. Toplanan ya da çarpan ayırt edilemiyor
  (N'si 6'dan farklı düşük kaliteli ölçüm yok); Q5 üstünde ikisi aynı sonucu veriyor.
- **Tosuncuk ve Star Deluxe'ün açığı çeşitten değil:** 3 ürünlü Sky açıksız, 4–5 ürünlü menüler −1,1 … −1,4, Tosuncuk'un 6 ürünlü
  dengeli eski menüsü de −2,1. Açık ürün sayısını ya da kategori dengesini değil, restoran grubunu izliyor (lüks, düşük kayıtlı bonus).
- Pratik: 3-3-3 2-2-2'ye göre ~%35 fazla yemek tüketir, rating'e katkısı ~+0,18; araç (çarpan 0,037) Q6'da +0,58 veriyor ve
  Menü Seç'i büyük menülere fazla yöneltiyor.

Sınama (Tosuncuk lüks eko restoranı): Köfte'yi çıkarıp 1-1-1 (Süt Q12, Lazanya Q12, Kokteyl Q8). Bugün 4,82. Açık şirkete
özgüyse ~4,74; 1-2-1 dengesizliğindense ~6,33; Lazanya'dansa (payı 1/4 → 1/3) ~4,22.

## Çinli oyuncunun formülü (11 Kasım): tgw / TGW-groupp

Kaynak: kullanıcının gönderdiği Çince şirket profili yazısı (6 ekran görüntüsü) ve yazının bağladığı Tampermonkey betiği
(gitee.com/lclbb/sc, "SimCompanies餐馆菜单模拟" v5.3, 26 Ekim 2026). Betik bir maliyet / başabaş hesaplayıcısı (simcotools VWAP,
kategori tüketim çarpanları 2,1 / 1 / 0,9 / 0,8, lüks yemek ve maaş ×0,5, profesyonel maaş ×5). Rating formülü betiğin hiçbir
sürümünde yok (v20.0 Haziran, v20.2 Ağustos, v5.3 Ekim), yalnız yazıda. Sınama: `node araclar/restoran-cin-formulu.mjs --eski` (107 adım; yeni
117 adımla: Çin formülü olduğu gibi 402,3, ölçek + kayma 261,0, katsayılar serbest 182,8; M3 sabit değerlerle 130,2, yeniden uydurulmuş 122,7).

Yazıdaki formül: hedef = 3·ortQ/12 + 1,5·N/16 + (lüks 0,5) + (profesyonel 2,5 | geçici 1,25) + fiyat puanı + bonus; fiyat puanı
$96'ya kadar 0,5, sonra $350'de 0'a doğrusal iner; bonus = 0,01 × CMO puanı + 0,02 × satış hızı (rehberle aynı).

| Model (107 adım, k 0,27, σ 0,19) | Serbest parametre | χ² |
|---|---|---|
| Doygun | 23 | 97,0 |
| M3 (önerimiz) | 5 | 112,7 |
| M3 + fiyat puanı (γ serbest) | 6 | 110,9 (γ −3 … +3 arası Δχ² 0,8–3,5: ölçülemiyor) |
| Çin formülü olduğu gibi | 0 | 377,5 |
| Çin formülü × α + β | 2 | 248,5 (α 1,74, β −2,25) |
| Çin biçimi, bütün katsayılar serbest | 5 | 176,1 (Q başına 0,36, ürün başına −0,14, lüks +1,25) |

Restoran başına (ölçülen → Çin / M3): Sky 1-1-1 Q6 5,2–6,0 → 4,5–4,6 / 5,58 · ANARCHY 5,88 → 5,18 / 5,85 · Dentium Q0 0,35 →
2,45 / 0,00 · Dentium Q1 0,10 → 2,20 / 0,17 · QUAL eko Q11–12 5,95 → 6,06 / 5,94 · QUAL lüks Q11–12 7,05 → 6,56 / 7,17 · QUAL eko Q5
4,9–5,3 → 4,39 / 5,26 · QUAL lüks Q5 6,4–6,5 → 4,89 / 6,35 · Tosuncuk (bonus 0,35 varsayımı) profesyonel 9,57 ± 0,41 → 6,85 / 10,
ekonomi 4,82 ± 0,35 → 5,60 / 6,40.

- **Elendi:** doğrusal kalite (Q başına 0,25) ve eksi bölge yok: Q0–Q1'i ~2 puan fazla, Q5–Q7'yi 0,5–1,5 eksik tahmin ediyor.
  Lüks +0,5 (ölçülen ×1,21 ≈ +1,0 … +1,3), profesyonel +1,25 (ölçülen +4,75 ± 0,54; 6σ). Yazarın kendi ekranı da formülle
  çelişiyor: eko 2-2-2 Q0–Q2, $350, 0,00 → 0,10; formül ilk döngüde 0,52–0,83 bekler (2,2–3,8σ), M3 0,00–0,16.
- **Uyuşan:** bonus biçimi (rehber, Patrik); ürün başına çeşit 0,094 (bizim 0,06, 1σ 0 … 0,12); seviyeden bağımsızlık; tüketim
  çarpanları; "çift lüks (lüks + profesyonel) 6×Q6 → 10" gözlemi (kendi formülü 5,6–6,6 verir, M3 + profesyonel ≥ 10).
- Fiyat puanı (en çok 0,5): verimizde yalnız Dentium $350 ve Sky V $150 adımları var; ne doğrulanıyor ne dışlanıyor.
- Ekonomi görselleri: lüks için yemek ve maaş yarıya indirilmemiş (P豪华 = (F + 12C)/(500D), kâr formülünde 2F ve 14.076);
  "lüks her ölçekte zarar eder" sonucu bu hatadan. Betik Ağustos 2026'dan (v20.2) beri ikisini de yarıya indiriyor. Doğru hâliyle
  aynı fiyatta başabaş doluluğu lüks ve ekoda aynı, lüksün kâr tavanı yarı.
- **$350 + en ucuz yemek:** yazarın döngüsü %14,06 doluluk, maliyet $31.830 (yemek 24.585, maaş 7.245; başabaş %9,1), kâr +$13.027.
  Dentium'un aynı ürünlerle (Q1) denemesi: 8 döngüde doluluk %0–14,65, ortalama %6,75 ± 1,8; döngü maliyeti ~$42.700 (başabaş
  %12,2; maaş 13.803, tabanın (7.038) ~2 katı, büyük olasılıkla yönetim gideri), 5 döngüde toplam −$119.318. Ortalama %6,75 ile yazarın maliyetiyle de döngü başına
  ~−$8.000: strateji ancak döngü maliyeti (seviye 1 eko) ~$23.600'ün altındaysa beklenen değerde kârlı. Gazete ısı haritası
  ($330–350, rating 0–1) %10–11 diyor; tek döngü kanıt değil.
- Varsayım (sınanmadı): profesyonel etki lüks içinde toplanan +3,9 ise lüks + profesyonelde hedef 10 için ortalama ürün puanı
  ≥ 4,35 − bonus yeter (M3, N 6): bonus 0 ile ~Q5, 0,5 ile ~Q4, 1 ile ~Q3–Q4. Q2–Q4 eğrisi ve profesyonel etkinin biçimi ölçülmedi.

## Yeni döngüler, Dentium Q2 ve Çin çeşit terimi (11 Kasım akşamı)

Kaynak: kullanıcının ekran görüntüleri (QUAL10ECO3 ve QUAL1LUX2 rating geçmişi ile Yönetim ekranı 19:05; Dentium Q2 menüsü ve rating
geçmişi 20:22) ve "Restaurant rating −0.06 +0.200". Betik: `node araclar/restoran-model-kontrol.mjs`. Ölçüm dosyasına 10 adım eklendi
(`yeni` işaretli; adım başına menü için `ek.menu` desteği eklendi).

**Eklenen veri**
- QUAL10ECO3 ve QUAL1LUX2: 9 Kasım 11:27'den sonra 4'er döngü (23:27, 11:27, 23:27, 11:27). Kullanıcı: yalnız son döngü yeni menüyle,
  öncekiler eski menü (ECO3: M3, LUX2: M2; Q5). Maliyetler ECO3'te bunu doğruluyor: ilk üç döngüde zarar ≈ $221–238 bin (gelir $371–381 bin;
  M3 Q5 menüsünün 4 Kasım VWAP'ıyla maliyeti ≈ $598 bin), sonuncuda ≈ $114 bin (yeni menünün maliyeti $502.567 = yemek 415.184 + maaş 87.383).
  LUX2'de son döngünün maliyeti $22.653 (panel $22.564, Q4 menüsü); önceki üç döngüde $20,6–21,1 bin (ikisi kesin): Q5 menüsünden (≈ $23,5 bin) %10–12 ucuz,
  nedeni bilinmiyor (fiyat düşüşü ya da menü farkı); doğrulanmadı.
- Yeni menüler: ECO3 (eko, seviye 10, $65): Süt Q8, Kahve tozu Q10, Salata, Samosa, Portakal suyu, Elma suyu Q7. LUX2 (lüks, seviye 1, $75;
  önceki üç döngüde $85): aynı altı ürün Q4. Her ikisi 6 ürün, bonus 0,83 (Yönetim ekranı yine +0,14 +0,690).
- Dentium Q2 (eko, seviye 1, $350; Süt, Kahve tozu, Salata, Samosa, Portakal suyu, Elma suyu hepsi Q2): 11 Kas 00:56 0,00 → 0,06 (doluluk %11,61,
  zarar $2.045); 12:56 0,06 → 0,40 (%14,6, kâr $7.498). Bonus −0,06 + 0,200 = 0,14 (eğitim bitti). Maliyet $42,7–43,6 bin (Q1'e yakın).

**Örnek dışı sınama** (modeller eski 107 adımla uydurulmuş; yeni 10 adım; mükemmel uyumda χ² ≈ 10)

| Model | Toplam | Dentium Q2 (2) | LUX2 eski (3) | LUX2 Q4 (1) | ECO3 eski (3) | ECO3 yeni (1) |
|---|---|---|---|---|---|---|
| Araç (Kasım) | 50,9 | 23,9 | 17,0 | 0,2 | 6,3 | 3,6 |
| M3 (v 0,06, L 1,207) | 17,5 | 9,0 | 4,6 | 0,5 | 2,7 | 0,8 |
| M2 düz (kırık doğru) | 13,5 | 2,2 | 4,7 | 3,2 | 2,5 | 0,9 |
| M3-Çin (v 0,09375, L 1,207) | 19,1 | 9,7 | 5,2 | 0,4 | 2,9 | 0,9 |
| M2-Çin | 12,4 | 2,1 | 3,4 | 3,8 | 2,3 | 0,8 |

- **Dentium Q2 ölçülen hedef 0,77 (0,27 … 1,27)**: Q0 (0,35) ve Q1 (0,10) gibi tabana yakın. Eski M3 Q2 için 2,16 öngörmüştü (z −2,8 ve −1,2),
  araç 3,14 (−4,1 ve −2,6), M2 düz 1,26 (−1,5 ve +0,1). Q2'de ürün puanı ≈ 0,6–0,7; eski M3'ün (2,0) ve aracın (3,0) çok altında.
- **Yeni menüler yeni bir çelişki çıkarmadı:** LUX2 Q4 tek adım, ölçülen hedef 6,30 (5,59 … 7,01) (M3-Çin yeniden uydurma 5,56, araç 6,61, M2-Çin 4,89);
  ECO3 yeni menü 5,13 (4,42 … 5,84) (M3-Çin 5,78, araç 6,46). Tek adımda σ/k ≈ 0,7 olduğu için ayırt etmez; ilerideki döngüler ayırır (aşağıda).
- Eski menülü ek 3'er döngü: LUX2 Q5 hedefi 7 adımda 6,06 (5,79 … 6,33) (önceki 4 adımda 6,45 ± 0,36; M3-Çin 6,30), ECO3 (M3 menüsü Q5)
  5,14 (4,87 … 5,41) (önceki 5,32 ± 0,36; M3-Çin 5,22).

**Yeniden uydurma (117 adım, L 1,207 sabit)**

| Model | χ² | f(Q0) | f(Q1) | f(Q2) | f(Q3) | f(Q4) | f(Q5) | f(Q6) | f(Q8) | f(Q12) |
|---|---|---|---|---|---|---|---|---|---|---|
| M3 serbest (v 0,052, L 1,202) | 122,7 | −9,14 | −2,84 | 0,67 | 2,63 | 3,73 | 4,34 | 4,68 | 4,98 | 5,10 |
| **M3-Çin: −9,82 + 14,95 (1 − e^(−Q/1,66)), v 0,09375** | 123,5 | −9,82 | −3,07 | 0,63 | 2,66 | 3,78 | 4,39 | 4,72 | 5,01 | 5,12 |
| M2 düz serbest (Qn 2,5, v 0,021, L 1,165) | 123,1 | −13,44 | −6,40 | 0,63 | 4,21 | 4,34 | 4,46 | 4,59 | 4,84 | 5,34 |
| M2-Çin (Qn 5,5, eğim 1,06 / 0,04) | 125,6 | −1,03 | 0,03 | 1,09 | 2,16 | 3,22 | 4,29 | 4,84 | 4,93 | 5,11 |
| Araç | 293,4 | 0,40 | 1,89 | 3,00 | 3,83 | 4,45 | 4,92 | 5,27 | 5,72 | 6,11 |
| Doygun (26 hedef) | 104,1 | | | | | | | | | |

- 117 adımda diğer modeller: doğrusal kalite 263,6 · oyuncunun ölçeği (Q başına 0,5) 267,9 · araç 293,4 (içbükey modeller 122,7–123,5, doygun 104,1);
  Dentium Q2 doğrusal reddi güçlendirdi (Δχ² 107 adımda 130, şimdi 141).
- Gruba göre χ² (M3-Çin / araç / doygun): Sky 40,6 / 42,0 / 35,1 · ANARCHY 35,1 / 63,2 / 26,4 · Dentium Q0 3,7 / 2,8 / 2,5 · Dentium Q1 9,6 / 65,8 / 9,4 ·
  Dentium Q2 1,2 / 23,9 / 1,2 · QUAL 33,4 / 95,7 / 29,5. Araç Q1 ve Q2'de tabandaki restoranı ≈ 2 puan fazla tahmin ediyor (hedef 2,03 ve 3,14; ölçülen 0,10 ve 0,77).
- Yeniden uydurmada içbükey üstel eğri Q2'yi karşılıyor (0,63–0,67); eğim Q1 → Q2 3,7, Q2 → Q3 2,0, Q3 → Q4 1,1, Q4 → Q5 0,6: S yok. Q0 ve Q1'in
  −9,8 ve −3,1 değerleri uzantıdır (rating 0'da sınırlı; veri yalnız hedefin ≈ 0 ya da altında olduğunu söylüyor).
- **Q3 hâlâ ölçülmedi ve modeller orada ayrışıyor:** üstel eğri 2,66, eşik benzeri kırık doğru 4,21, eski doğrusal 2,16, araç 3,83. Dentium'da Q3 menüsü
  (bonus 0,14, başlangıç 0,40) 2 döngüde: üstel 1,05 → 1,53; eşik 1,47 → 2,25; araç 1,36 → 2,07 (2. döngüde fark 0,7; iki döngü birlikte ≈ 3σ). Q4 ayırt etmez (3,78 / 4,34).

**Çeşit terimi (yazıdaki 1,5 × N/16 = 0,09375 / ürün, toplanan)**
- **Tutarlı:** eski 107 adımda v serbestken 112,7, v = 0,09375 ve L = 1,207 sabitken 113,1 (Δχ² +0,4; 2 parametre az). Bütün adımlarda v profili
  (Δχ², üstel eğri): −0,05: 4,1 · 0: 1,0 · 0,03: 0,1 · 0,06: 0,0 · **0,094: 0,8** · 0,12: 2,1 · 0,15: 4,3 · 0,20: 9,8. Kırık doğru ailesinde profil düz
  (0: 0,0 · 0,094: 1,3 · 0,20: 3,2).
- **Doğrulanmadı:** v = 0 da Δχ² ≤ 1,0 içinde. Çeşit bilgisi yalnız Sky'ın N = 3 (1-1-1) menüsünden geliyor (N = 3 → 6: ölçülen +0,18 ± 0,16, yazı
  +0,28). Destekleyen: rehberdeki "rating bonus for having a variety of items", 16 yemek (6 + 6 + 4) üzerinden temiz bir 1,5 üst sınır, 2022-08-16 kaydı.
  Karar (kullanıcı): tutarlı olduğu için modele alındı; v = 0,09375 sabit, lüks ×1,207 ve profesyonel +3,94 (lüks içinde; lüks sonrası +4,75) değişmedi.
  Doğrudan sınama: aynı şirkette 1-1-1 ile 4-4-4 (N 3 → 12: +0,84 eko, +1,02 lüks).

**Model (önerilen, "M4" = M3-Çin):** hedef = (ort f(Q) + 0,09375 × (N − 6) + bonus [+ 3,94 profesyonel]) × (lüks 1,207 | eko 1), 0–10 ile sınırlı;
f(Q) = −9,82 + 14,95 (1 − e^(−Q/1,66)); r' = r + 0,27 (hedef − r). Aracın Kasım modeline göre fark (eko, N 6, bonus 1,0): Q3 −1,16 · Q4 −0,67 · Q5 −0,52 ·
Q6 −0,54 · Q8 −0,71 · Q10 −0,88 · Q12 −0,99; lüks bonus 1,0: Q5 7,40 → 6,51, Q12 8,89 → 7,39. Güvenilir aralıklar: Q2 (2 döngü), Q5–Q12; Q3–Q4 eğri
biçimine bağlı; Q0–Q1 uzantı; karışık menülerde "ürün puanlarının ortalaması" düşük kalitede sınanmadı (Q0–Q3 ürünle Q12 ürün karışımı yok).
Araç henüz değişmedi.

**İleri tahmin** (menü sürerse; şimdiki rating → sonraki 3 döngü; araç / M3-Çin / M2-Çin):
- ECO3 yeni menü (5,02): araç 5,41 → 5,69 → 5,90 · M3-Çin 5,23 → 5,38 → 5,49 · M2-Çin 5,22 → 5,36 → 5,47.
- LUX2 Q4 (6,22): araç 6,32 → 6,40 → 6,46 · M3-Çin 6,04 → 5,91 → 5,82 · M2-Çin 5,86 → 5,60 → 5,41. Üç döngüde araç ile M3-Çin 0,64 ayrılır (adım adım ≈ 2,5σ):
  temiz bir Q4 sınaması (aynı menü, 2-2-2 ucuz altı ürün).
- Dentium Q2 (0,40): araç 1,14 → 1,68 → 2,08 · M3-Çin 0,50 → 0,57 → 0,63.
- $350 stratejisi (Çin yazısı): Dentium'da 10 döngüde ortalama doluluk %8,0 (gelir ≈ $28 bin), döngü maliyeti $42,7–43,6 bin → beklenen ≈ −$15 bin/döngü;
  başabaş %12,2–12,5; başabaşın (%12,2) üstünde yalnız 2 döngü (%14,65 ve %14,6; %12,11 hemen altında).

## Açık sorular

- Rating dilimi: gazetenin ortalaması (7,59–7,74) dilim değerini merkez sayınca (7,65) tutuyor, alt sınır sayınca (8,0) tutmuyor; doluluk gözlemleri ise alt sınırı (tam sayı kısmı) destekliyor. Araç tam sayı kısmını kullanıyor.
- Doluluk, aynı 12 saatlik penceredeki restoranlarda birlikte hareket ediyor (Sky: restoran sabitinden sonra farkın %88'i pencereden). Rakiplerin hangi anki teklifinin kullanıldığı bilinmiyor.
- Sky IV'ün 1–3 Kasım'daki düşüşü (6,29 → 5,32, menü ve döngü saati aynı) açıklanamadı.
- Çeşidin biçimi (9 Kasım): araçta çeşit ürün puanı ortalamasını çarpıyor (bonusu çarpmıyor). Rehber "a rating bonus for having a
  variety of items" diyor; bu ayrı bir puana daha yakın. Normal evrede 3 → 6 ürün farkı Q5'te, Q5–Q10 karışımında ve Q11–12'de ≈ 0;
  çarpan (+0,55 … +0,68) da aynı büyüklükte ayrı puan (+0,58) da desteklenmiyor. Veriyle uyumlu okuma: bonus 3 üründe (her
  kategoride bir ürün) zaten dolu. Elimizdeki ölçümlerin hepsinde üç kategori de dolu. Sınama: (1) aynı şirkette 1-1-1 ile 2-2-2
  (etki var mı); (2) varsa düşük kalitede aynı karşılaştırma (Q1'de çarpan +0,21, ayrı puan +0,58). Boş kategorili menü
  sınanamaz: rehbere göre her kategoride en az bir ürün zorunlu (en küçük menü 1-1-1).
- Q3 eğri biçimi (11 Kasım akşamı): üstel 2,66 · eşik benzeri kırık doğru 4,21 · doğrusal 2,16 · araç 3,83. Dentium'da Q3 menüsü (2-2-2, $350, bonus 0,14) 2 döngüde ayırır.
- LUX2 Q4 (6 ürün, lüks, $75) ve ECO3 karışık menüsü (Q8, Q10, Q7 × 4): menü değişmeden 3 döngü daha; beklenen yollar yukarıdaki "İleri tahmin" bölümünde.
- Çeşit 0,09375 / ürün doğrulanmadı (Δχ² ≤ 1 içinde 0 … 0,12); doğrudan sınama 1-1-1 ile 4-4-4.
- LUX2'nin 9–11 Kasım döngülerinde yemek maliyeti Q5 menüsünün beklentisinden %10–12 düşük: menü gerçekten M2 (Q5) miydi?

## Q4 sabit ve araç güncellemesi (11 Kasım gece)

Yeni veri: QUAL1LUX3 (lüks, seviye 1) 9–11 Kasım: 3 döngü eski menü (M3, Q5; 6,58 → 6,77 → 6,93 → 6,67), son döngü ECO3'ün yeni menüsüyle
(Süt Q8, Kahve Q10, Salata/Samosa/Portakal/Elma Q7; $80): 6,67 → 6,56 (hedef ≈ 6,26). Yönetici aynı. İki bağımsız restoran (ECO3 eko 5,13, LUX3 lüks 6,26)
karışık menüyü modelin öngördüğünden ≈ 0,6 düşük buldu (ürün puanı ortalaması ≈ 4,3; model 4,95); her biri tek adım, birlikte ≈ −1,5σ.
Karar (kullanıcı): LUX2 Q4'te rating neredeyse hiç değişmedi (6,19 → 6,22): Q4 doğru kabul edildi (lüks hedef ≈ 6,2 ± 0,15).
Q4 sabitlenerek uydurma (LUX2 Q4 adımı yerine ceza terimi; v 0,09375, L 1,207 sabit): f(Q) = −19,74 + 24,64 (1 − e^(−Q/1,12)):
Q2 0,74 · Q3 3,19 · Q4 4,19 · Q5 4,60 · Q6 4,77 · Q8 4,87 · Q12 4,89 (serbest uydurmada Q4 3,80, χ² 127,9; sabitlemede χ² 131,9). Q12 artık Q5'ten yalnız +0,3.
Araç bu modele geçirildi (public/restoran-rating.js: M4; ürün puanı negatifte 0'da kesilir; menusec ve ısı haritası eğrileri uyarlandı; testlerde hedefler
düşürüldü, çünkü eko menü bonussuz en çok ≈ 5,1 + çeşit veriyor).

Düzeltme (kullanıcı): kalite puanı çeşitten ve yöneticiden bağımsız yazılmalı, eksi değerler gösterilmeli. Araçta Q0–Q1 0'a kesilmişti ve eğri N = 6'daki
çeşit payını (0,5625) içeriyordu. Şimdi: q(Q) = −20,30 + 24,64 (1 − e^(−Q/1,12)) (Q0 −20,3 · Q1 −5,75 · Q2 0,21 · Q3 2,65 · Q4 3,65 · Q5 4,06 · Q6 4,22 ·
Q8 4,32 · Q12 4,34), çeşit 1,5 × N/16 (mutlak) ve bonus ayrı; hedef = (ort q + 0,09375 × N + bonus [+ 3,94]) × L. Hesap aynı (f = q + 0,5625).
Menü Seç Q0–Q1'i aramaz (eksi puan); eğri grafiği eksi değeri eksende 0'a çizer, etiket gerçek değeri yazar.
