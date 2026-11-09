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

## Açık sorular

- Rating dilimi: gazetenin ortalaması (7,59–7,74) dilim değerini merkez sayınca (7,65) tutuyor, alt sınır sayınca (8,0) tutmuyor; doluluk gözlemleri ise alt sınırı (tam sayı kısmı) destekliyor. Araç tam sayı kısmını kullanıyor.
- Doluluk, aynı 12 saatlik penceredeki restoranlarda birlikte hareket ediyor (Sky: restoran sabitinden sonra farkın %88'i pencereden). Rakiplerin hangi anki teklifinin kullanıldığı bilinmiyor.
- Sky IV'ün 1–3 Kasım'daki düşüşü (6,29 → 5,32, menü ve döngü saati aynı) açıklanamadı.
