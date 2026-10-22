// DentSimco — İndeks: piyasa endeksinin gün gün ve hafta hafta dökümü (Piyasa › İndeks sayfası)
//
// Gece çalışmasında motor.mjs çağırır ve meta/endeks_r{r} belgesine yazar. Endeks, sinyal motorunun makro kısmında
// kullandığı endeksin ta kendisidir (motor.mjs › piyasaEndeksi): Q0 fiyatları, mevsimsel ürünler hariç, her ürünün
// ağırlığı önceki 30 günün ortalama işlem değeri, günlük getiri = ağırlıklı ortalama log getiri. Ek Firestore okuması yoktur.
// Burada yalnız o günün getirisi ürünlere ve binalara (sektör) bölünür: ürünün katkısı = ağırlık × getiri ÷ toplam ağırlık,
// katkıların toplamı o günün endeks getirisidir. Değerlendirme metni sitede (public/endeks.js) bu sayılardan yazılır.
//
// Belge: { v, t, r, gun, bas, baz, n, g, h, evre, olay }
//   gun: son tam gün (sinyal motorunun T'si), bas: ilk satırın günü, n: endeksteki ürün sayısı
//   baz: [gün, seviye] seviyenin bağlandığı nokta. Önceki belge varsa onun seviyesine bağlanır (pencere kaydıkça seviye
//        değişmesin); yoksa ENDEKS.bazGun = 1000 (o gün pencerede değilse pencerenin ilk günü = 1000).
//   g: günler, eskiden yeniye: [gün, seviye, getiri, yükselen, düşen, tutar, artılar, eksiler, sektörler]
//        getiri: log getiri × 10⁴ (0,1 adım; ilk satırda ve verisiz günde null), tutar: endeksteki ürünlerin Q0 işlem tutarı ($)
//        artılar / eksiler: en çok yukarı / aşağı çeken ürünler [[ürün, ürünün log getirisi × 10⁴, katkı × 10⁴], ...]
//        sektörler: [[bina harfi, katkı × 10⁴], ...] mutlak katkıya göre sıralı
//   h: haftalar (pazartesi–pazar), eskiden yeniye: [ilk gün, son gün, getiri, yükselen, düşen, tutar, artılar, eksiler, sektörler, gün sayısı]
//        ürünün haftalık getirisi = hafta içindeki günlük log getirilerinin toplamı; katkı = günlük katkıların toplamı
//   evre: [[başlangıç, evre]] pencere içindeki ekonomi evreleri (motorun evre arşivinden)
//   olay: [[ürün, hız %, başlangıç, bitiş]] pencereye değen üretim hızı olayları (motorun olay arşivinden)

export const ENDEKS = {
  pencere: 365, // belgede en çok bu kadar gün
  bazGun: '2026-01-01', // önceki belge yoksa seviye bu günde 1000
  baz: 1000,
  ilk: 4, // günde en çok bu kadar artı ve eksi ürün
  ilkHafta: 6, // haftada
  sektor: 8, // en çok bu kadar sektör
};

const DAY = 86_400_000;
const fin = Number.isFinite;
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d, n) => utcDay(dayMs(d) + n * DAY);
const haftaBasi = (d) => addDays(d, -((new Date(dayMs(d)).getUTCDay() + 6) % 7)); // pazartesi
const bp = (x) => Math.round(x * 1e5) / 10; // log oran → × 10⁴, 0,1 adım

function enIyiler(katki, getiri, n) {
  const list = [...katki].filter(([, c]) => c !== 0);
  const arti = list.filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
  const eksi = list.filter(([, c]) => c < 0).sort((a, b) => a[1] - b[1]).slice(0, n);
  const yaz = ([id, c]) => [id, bp(getiri.get(id)), bp(c)];
  return [arti.map(yaz), eksi.map(yaz)];
}

function sektorler(katki, products) {
  const m = new Map();
  for (const [id, c] of katki) {
    const b = products?.[id]?.building ?? '?';
    m.set(b, (m.get(b) || 0) + c);
  }
  return [...m].filter(([, c]) => bp(c) !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, ENDEKS.sektor).map(([b, c]) => [b, bp(c)]);
}

/**
 * @param S      seriKur çıktısı
 * @param endeks piyasaEndeksi çıktısı ({ L, art, use, val })
 * @param o      { T, products, simdi, realm, onceki: önceki endeks belgesi, evreler: {başlangıç: [evre, başlangıç, bitiş]}, olaylar: {id: [ürün, hız, başlangıç, bitiş]} }
 * @returns belge ya da { yetersiz: true } (endekste hiç getiri günü yoksa)
 */
export function endeksOzet(S, endeks, { T, products = {}, simdi, realm = 0, onceki = null, evreler = {}, olaylar = {} }) {
  const Ti = S.idx(T);
  const { L, use, val } = endeks;
  const gunler = [];
  let ilk = -1;
  for (let t = 1; t <= Ti; t++) {
    const katki = new Map();
    const getiri = new Map();
    let den = 0, up = 0, down = 0, tutar = 0;
    for (const id of use) {
      const P = S.P(id, 0);
      const U = S.U(id, 0);
      const x = P[t] * (U ? U[t] : NaN);
      if (fin(x)) tutar += x;
      const a = P[t - 1], b = P[t], w = val.get(id)[t];
      if (!(a > 0 && b > 0 && w > 0)) continue;
      const r = Math.log(b / a);
      getiri.set(id, r);
      katki.set(id, w * r);
      den += w;
      if (r > 1e-9) up++; else if (r < -1e-9) down++;
    }
    if (!(den > 0)) { gunler[t] = null; continue; }
    if (ilk < 0) ilk = t;
    for (const [id, c] of katki) katki.set(id, c / den);
    gunler[t] = { katki, getiri, up, down, tutar };
  }
  if (ilk < 0) return { yetersiz: true };

  const i0 = Math.max(ilk - 1, Ti - ENDEKS.pencere + 1);
  const bas = S.day(i0);

  // Seviyenin bağlanacağı nokta: önceki belgede bu pencerede de olan en eski gün; yoksa bazGun; o da yoksa pencere başı
  let baz = null;
  const eskiG = Array.isArray(onceki?.g) ? onceki.g : [];
  for (const row of eskiG) {
    const j = S.idx(row[0]);
    if (j >= i0 && j <= Ti && row[1] > 0) { baz = [row[0], row[1], j]; break; }
  }
  if (!baz) {
    const j = S.idx(ENDEKS.bazGun);
    baz = j >= i0 && j <= Ti ? [ENDEKS.bazGun, ENDEKS.baz, j] : [bas, ENDEKS.baz, i0];
  }
  const seviye = (t) => Math.round(baz[1] * Math.exp(L[t] - L[baz[2]]) * 100) / 100;

  const g = [];
  for (let t = i0; t <= Ti; t++) {
    const x = gunler[t];
    if (t === i0 || !x) { g.push([S.day(t), seviye(t), null, 0, 0, Math.round(x?.tutar || 0), [], [], []]); continue; }
    const [arti, eksi] = enIyiler(x.katki, x.getiri, ENDEKS.ilk);
    g.push([S.day(t), seviye(t), bp(L[t] - L[t - 1]), x.up, x.down, Math.round(x.tutar), arti, eksi, sektorler(x.katki, products)]);
  }

  // Haftalar (pazartesi–pazar); pencerenin ilk satırı yalnız seviye tabanıdır, haftaya girmez
  const h = [];
  let hafta = null;
  const kapat = () => {
    if (!hafta) return;
    const up = [...hafta.getiri.values()].filter((r) => r > 1e-9).length;
    const down = [...hafta.getiri.values()].filter((r) => r < -1e-9).length;
    const [arti, eksi] = enIyiler(hafta.katki, hafta.getiri, ENDEKS.ilkHafta);
    h.push([hafta.bas, hafta.son, bp(L[hafta.j1] - L[hafta.j0 - 1]), up, down, Math.round(hafta.tutar), arti, eksi, sektorler(hafta.katki, products), hafta.n]);
  };
  for (let t = i0 + 1; t <= Ti; t++) {
    const d = S.day(t);
    const hb = haftaBasi(d);
    if (!hafta || hafta.hb !== hb) {
      kapat();
      hafta = { hb, bas: d, son: d, j0: t, j1: t, katki: new Map(), getiri: new Map(), tutar: 0, n: 0 };
    }
    hafta.son = d;
    hafta.j1 = t;
    const x = gunler[t];
    if (!x) continue;
    hafta.n++;
    hafta.tutar += x.tutar;
    for (const [id, c] of x.katki) hafta.katki.set(id, (hafta.katki.get(id) || 0) + c);
    for (const [id, r] of x.getiri) hafta.getiri.set(id, (hafta.getiri.get(id) || 0) + r);
  }
  kapat();

  const evre = Object.values(evreler || {})
    .filter((e) => Array.isArray(e) && e[0] && e[1])
    .map((e) => [String(e[1]), String(e[0])])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .filter((e, i, a) => e[0].slice(0, 10) >= bas || !a[i + 1] || a[i + 1][0].slice(0, 10) > bas); // pencereden önce başlayıp içine süren evre de kalır
  const olay = Object.values(olaylar || {})
    .filter((e) => Array.isArray(e) && fin(Number(e[0])) && e[2] && e[3] && String(e[3]).slice(0, 10) >= bas)
    .map((e) => [Number(e[0]), Number(e[1]), String(e[2]), String(e[3])])
    .sort((a, b) => (a[2] < b[2] ? -1 : 1));

  return { v: 1, t: simdi, r: realm, gun: T, bas, baz: [baz[0], baz[1]], n: use.length, g, h, evre, olay };
}
