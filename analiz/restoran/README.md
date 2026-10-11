# Restoran talep analizi (yayın dışı)

Bu klasör siteye **yüklenmez**: Firebase Hosting yalnız `public/` klasörünü yayınlar ve `site.yml` bu klasörü ne indirir ne de değişince çalışır.

Amaç: restoranlara gelen müşteri sayısının neye bağlı olduğunu ansiklopedideki "Restoran satışları" verisinden bulmak.

| Hipotez | Anlamı | Beklenen işaret |
|---|---|---|
| H1 sabit havuz | Müşteri sayısı sabit, restoranlar paylaşıyor | Bina esnekliği ≈ 0 |
| H2 kapasiteye bağlı | Müşteri sayısı bina sayısıyla artıyor | Bina esnekliği ≈ 1 |
| H3 ekonomiye bağlı | Müşteri sayısı evreyle değişiyor | Evre değişiminde basamak |

## Veri (`veri/`)

- `tuketim.csv`: `tarih;urun;miktar`, günlük tüketilen miktar
- `binalar.csv`: `tarih;bina;ekonomi;not`, toplam restoran sayısı ve evre
- `kendi.csv`: `tarih;urun;satis;fiyat;doluluk;puan`, kendi restoranınız (isteğe bağlı)
- `kategoriler.json`: menü kategorileri ve her kategorideki **tüm** ürünler

## Çalıştırma

```
node analiz/restoran/analiz.mjs              # raporu ekrana yazar
node analiz/restoran/analiz.mjs --md rapor.md
node analiz/restoran/restoran_test.mjs       # sınamalar
```

Rapor şunları içerir: ürün başına bina başına tüketim ve esneklik, kategori eşitliği sınaması (her ziyarette her kategoriden bir ürün mü tüketiliyor), tahmini günlük ziyaret, evre etkisi, en büyük günlük değişimler ve kendi pazar payınız.
