// DentSimco — Optimum Seviye: son 28 günün borsa özeti (yalnız Realm 0)
//
// Gece çalışmasında motor.mjs çağırır ve meta/optimum_r0 belgesine yazar. Seri, sinyal motorunun zaten kurduğu
// seridir (sinyal/gecmis-r0.json + botun günlük belgeleri, seriKur): ek Firestore okuması yoktur. Geçmiş dosyasındaki
// satış adetleri seriKur'da botun ölçeğine çekildiği için pencerenin iki parçası aynı ölçektedir.
//
// Burada yalnız piyasa istatistiği var. Kâr, yönetim gideri ve seviye hesabı sitede (public/optimum-hesap.js) yapılır;
// kullanıcıya özgü her şey (yöneticiler, binalar, faz, pazar payı) tarayıcıda kalır.
//
// Belge: { v, t, r, gun, bas, n, k, u }
//   gun: pencerenin son tam günü (sinyal motorunun T'si), bas: ilk günü, n: pencere uzunluğu (28)
//   k:   pencerede verisi olan gün (borsadaki ürünlerin en az %40'ında Q0 fiyatı olan gün)
//   u:   {ürün: {kalite: [VWAP, günlük satış adedi, işlem günü]}}
//        VWAP = işlem olan günlerin toplam tutarı ÷ toplam adedi; günlük adet = toplam adet ÷ k; işlem günü = fiyatı olan gün

export const OPT = {
  pencere: 28,
  enAzGun: 20, // pencerede bundan az veri günü varsa belge yazılmaz (son iyi belge yayında kalır)
  kapsamaPay: 0.4, // bir gün "verisi var" sayılsın diye Q0 fiyatı olması gereken ürün payı (motorun T kuralıyla aynı)
};

const yuvarla = (x) => Number(x.toPrecision(5));

/**
 * @param S  seriKur çıktısı (P(id, q), U(id, q), idx(gün), day(i))
 * @param o  { T: son tam gün, ids: borsadaki ürünler, simdi, realm }
 * @returns  belge ya da { yetersiz: true, k } (yeterli veri günü yoksa)
 */
export function optimumOzet(S, { T, ids, simdi, realm = 0 }) {
  const Ti = S.idx(T);
  const i0 = Math.max(0, Ti - OPT.pencere + 1);
  const esik = Math.max(1, Math.floor(ids.length * OPT.kapsamaPay));
  let k = 0;
  for (let j = i0; j <= Ti; j++) {
    let n = 0;
    for (const id of ids) if (S.P(id, 0)?.[j] > 0) n++;
    if (n >= esik) k++;
  }
  if (k < OPT.enAzGun) return { yetersiz: true, k };
  const u = {};
  for (const id of ids) {
    for (let q = 0; q <= 12; q++) {
      const P = S.P(id, q);
      const U = S.U(id, q);
      if (!P || !U) continue;
      let tutar = 0;
      let adet = 0;
      let gun = 0;
      for (let j = i0; j <= Ti; j++) {
        if (P[j] > 0 && U[j] > 0) { tutar += P[j] * U[j]; adet += U[j]; gun++; }
      }
      if (!gun) continue;
      (u[id] ||= {})[q] = [yuvarla(tutar / adet), yuvarla(adet / k), gun];
    }
  }
  return { v: 1, t: simdi, r: realm, gun: T, bas: S.day(i0), n: OPT.pencere, k, u };
}
