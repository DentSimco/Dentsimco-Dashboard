// DentSimco — Tecrübe (XP) hesap motoru (saf hesap; ekran yok).
// Kurallar Cooper'ın XP aracından (cooperinc.xyz/experience) alındı; oyunun XP için herkese açık bir API'si yok:
//   • Seviye tablosu sabittir: 1. seviyeden 23. seviyeye her seviyenin bitmesi için gereken XP aşağıdadır;
//     24. ile 60. seviye arası her seviye 400.000 XP'dir. 60'ın üstü için veri yok.
//   • Saatlik XP = çalışan bina × 12 + dinlenme (recreation) binası × 120 + bolluk (abundance) yuvası × 36 × (saat / 24).
//   • "İlerleme" mevcut seviyenin yüzde kaçının bittiğidir; kalan XP = seviye XP'si × (1 − ilerleme).
//   • Süre = kalan toplam XP / saatlik XP.

export const SEVIYE_XP = {
  1: 10, 2: 20, 3: 30, 4: 50, 5: 80, 6: 130, 7: 210, 8: 340, 9: 550, 10: 890, 11: 1430, 12: 2320, 13: 3750, 14: 6000,
  15: 10000, 16: 16000, 17: 26000, 18: 42000, 19: 68000, 20: 110000, 21: 170000, 22: 280000, 23: 400000,
};
export const SABIT_SEVIYE_XP = 400000; // 24–60. seviye
export const ILK_SABIT_SEVIYE = 24;
export const MAKS_SEVIYE = 60;
export const SAATLIK = { calisan: 12, dinlenme: 120, bolluk: 36 };

// Bir seviyenin tamamlanması için gereken XP (tabloda yoksa 0)
export const seviyeXp = (n) => {
  n = Math.floor(Number(n));
  if (!(n >= 1) || n > MAKS_SEVIYE) return 0;
  return n >= ILK_SABIT_SEVIYE ? SABIT_SEVIYE_XP : SEVIYE_XP[n] || 0;
};

const sayi = (x) => (x === '' || x == null || !Number.isFinite(Number(x)) ? 0 : Number(x));

export const VARSAYILAN = { currentLevel: 1, progressValue: 0, targetLevel: 2, operatingBuildings: 1, numRecreationBuildings: 0, abundanceSlots: 0, abundanceHours: 24 };

// Girdi → { operatingXP, recreationXP, abundanceXP, hourlyXP, totalXPNeeded, timeInHours, targetDate, errors: [{ field, message }] }
export function hesapla(girdi, simdi = Date.now()) {
  const v = sayi(girdi.currentLevel);
  const p = sayi(girdi.progressValue);
  const hedef = sayi(girdi.targetLevel);
  const calisan = sayi(girdi.operatingBuildings);
  const dinlenme = sayi(girdi.numRecreationBuildings);
  const bolluk = sayi(girdi.abundanceSlots);
  const saat = girdi.abundanceHours == null || girdi.abundanceHours === '' ? 24 : sayi(girdi.abundanceHours);

  const operatingXP = calisan * SAATLIK.calisan;
  const recreationXP = dinlenme * SAATLIK.dinlenme;
  const abundanceXP = bolluk * SAATLIK.bolluk * (saat / 24);
  const hourlyXP = operatingXP + recreationXP + abundanceXP;
  const bos = { operatingXP, recreationXP, abundanceXP, hourlyXP, totalXPNeeded: 0, timeInHours: 0, targetDate: null };

  const errors = [];
  if (!(v >= 1) || !Number.isInteger(v)) errors.push({ field: 'currentLevel', message: 'Mevcut seviye 1 veya daha büyük bir tam sayı olmalı.' });
  else if (v > MAKS_SEVIYE) errors.push({ field: 'currentLevel', message: `XP tablosu ${MAKS_SEVIYE}. seviyeye kadar.` });
  if (p < 0) errors.push({ field: 'progressValue', message: 'İlerleme 0’dan küçük olamaz.' });
  if (p > 100) errors.push({ field: 'progressValue', message: 'İlerleme en çok %100 olabilir.' });
  if (!Number.isInteger(hedef) || hedef <= v) errors.push({ field: 'targetLevel', message: 'Hedef seviye mevcut seviyeden büyük olmalı.' });
  else if (hedef > MAKS_SEVIYE + 1) errors.push({ field: 'targetLevel', message: `XP tablosu ${MAKS_SEVIYE}. seviyeye kadar; hedef en çok ${MAKS_SEVIYE + 1} olabilir.` });
  if (calisan < 0) errors.push({ field: 'operatingBuildings', message: 'Çalışan bina sayısı 0’dan küçük olamaz.' });
  if (dinlenme < 0) errors.push({ field: 'numRecreationBuildings', message: 'Dinlenme binası sayısı 0’dan küçük olamaz.' });
  if (bolluk < 0) errors.push({ field: 'abundanceSlots', message: 'Bolluk yuvası sayısı 0’dan küçük olamaz.' });
  if (saat < 0 || saat > 24) errors.push({ field: 'abundanceHours', message: 'Bolluk süresi günde 0 ile 24 saat arasında olmalı.' });
  if (errors.length) return { ...bos, errors };

  // Mevcut seviyenin kalanı + aradaki tam seviyeler (hedef seviyeye ulaşınca biter, hedefin kendisi sayılmaz)
  let toplam = Math.max(0, seviyeXp(v) * (1 - p / 100));
  for (let n = v + 1; n < hedef; n++) toplam += seviyeXp(n);
  const saatSonuc = toplam <= 0 ? 0 : hourlyXP > 0 ? toplam / hourlyXP : Infinity;
  const tarih = Number.isFinite(saatSonuc) && saatSonuc > 0 ? new Date(simdi + saatSonuc * 3600 * 1000) : null;
  return { ...bos, errors: [], totalXPNeeded: toplam, timeInHours: saatSonuc, targetDate: tarih };
}
