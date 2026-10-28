// DentSimco — Restoran rating deney verisi (devir notu, Ekim 2026). Her satır bir döngü geçişi.
// kapanis: true ise eski rating kapanıştan sonraki değerdir (×0,875 uygulanmış). menu: { id: kalite }; 'a-b' = Q12-7 karışık.
// Kimlikler: Süt 117, Ekmek 121, Kahve 119, Elmalı turta 123, Peynir 122, Hamburger 129, Köfte 131, Salata 142, Samosa 143,
//            Bal kabağı 149, Kokteyl 132, Portakal suyu 124, Elma suyu 125, Zencefilli bira 126.
const IV = { 117: 12, 119: 7, 142: 12, 143: 12, 124: '12-7', 125: 12 };
const III = { 122: 7, 123: 7, 129: 7, 131: 7, 132: 7, 126: 7 };
const II = { 117: 7, 119: 7, 142: 7, 143: 12, 124: '12-7', 125: 12 };
const I = { 117: 7, 121: 7, 119: 7, 142: 7, 143: 12, 149: 8, 124: '12-7', 125: 12, 126: 7 };
const LUKS1 = { 117: 11, 121: 12, 142: 6, 143: 3, 124: 3, 125: 11 };
const seri = (restoran, ozellik, menu, adimlar) => adimlar.map(([eski, yeni, kapanis], i) => ({ restoran, dongu: i + 1, eski, yeni, kapanis: !!kapanis, menu, ...ozellik }));

export const DENEY = [
  ...seri('Sky Eco IV', { tip: 'eko', seviye: 5, bonus: 0.95, fiyat: 75, evre: 'boom' }, IV,
    [[0, 1.26], [1.26, 2.35], [2.35, 3.24], [3.24, 4.04], [3.54, 4.36, true]]),
  ...seri('Sky Eco III', { tip: 'eko', seviye: 4, bonus: 0.95, fiyat: 75, evre: 'boom' }, III,
    [[3.77, 3.99], [3.99, 4.31], [3.77, 4.29, true], [4.29, 4.79], [4.79, 5.04]]),
  ...seri('Sky Eco II', { tip: 'eko', seviye: 3, bonus: 0.95, fiyat: 75, evre: 'boom' }, II,
    [[4.86, 5.15], [5.15, 5.65], [4.94, 5.01, true], [5.01, 5.12], [5.12, 4.97]]),
  ...seri('Sky Eco I', { tip: 'eko', seviye: 5, bonus: 0.95, fiyat: 75, evre: 'boom' }, I,
    [[4.17, 4.66], [4.66, 5.19], [4.54, 5.33, true], [5.33, 5.61], [5.61, 5.81]]),
  ...seri('Lüks 1', { tip: 'luks', profesyonel: true, seviye: 1, bonus: 0.35 }, LUKS1,
    [[3.57, 4.19], [3.67, 4.79, true], [4.79, 5.56], [5.56, 5.88], [5.14, 5.72, true], [5.72, 5.86]]),
  ...seri('Eko 2', { tip: 'eko', seviye: 2, bonus: 0.35 }, null,
    [[1.29, 1.34], [1.17, 1.68, true], [1.47, 2.04, true]]),
];
