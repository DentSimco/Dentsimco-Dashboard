// DentSimco — Şirket izleme listeleri (saf; tarayıcı kaydı dışında hiçbir şey kullanmaz).
// Listeler bu tarayıcıda tutulur (realm başına ayrı: şirket numaraları realm'e özgüdür): dentsimco.sirketliste.r{realm}
//   { v: 1, aktif: listeNo | null, listeler: [{ id, ad, idler: [şirketNo, ...] }] }
// Sitede hesap olmadığı için cihazlar arasında eşlenmez.

export const LISTE_MAX = 20;      // liste sayısı
export const SIRKET_MAX = 100;    // listedeki şirket sayısı
export const AD_MAX = 40;
export const KIYAS_MAX = 5;       // Kıyas'ta aynı anda şirket
const KEY = (r) => `dentsimco.sirketliste.r${r}`;

const bos = () => ({ v: 1, aktif: null, listeler: [] });
const uid = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const temizAd = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, AD_MAX);

// Bozuk ya da eski kaydı güvenli biçime getirir
export function duzenle(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.listeler)) return bos();
  const listeler = [];
  const gorulen = new Set();
  for (const l of raw.listeler.slice(0, LISTE_MAX)) {
    const ad = temizAd(l?.ad);
    if (!ad || typeof l?.id !== 'string' || gorulen.has(l.id)) continue;
    gorulen.add(l.id);
    const idler = [...new Set((Array.isArray(l.idler) ? l.idler : []).map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, SIRKET_MAX);
    listeler.push({ id: l.id, ad, idler });
  }
  return { v: 1, aktif: listeler.some((l) => l.id === raw.aktif) ? raw.aktif : listeler[0]?.id ?? null, listeler };
}

export function oku(r) {
  try { return duzenle(JSON.parse(localStorage.getItem(KEY(r)) || 'null')); } catch { return bos(); }
}
export function yaz(r, durum) {
  try { localStorage.setItem(KEY(r), JSON.stringify(durum)); return true; } catch { return false; }
}

// Aşağıdakiler durumu değiştirmez, yenisini döndürür.
export function olustur(durum, ad) {
  const a = temizAd(ad);
  if (!a || durum.listeler.length >= LISTE_MAX) return durum;
  const l = { id: uid(), ad: a, idler: [] };
  return { ...durum, aktif: l.id, listeler: [...durum.listeler, l] };
}
export function adlandir(durum, id, ad) {
  const a = temizAd(ad);
  if (!a) return durum;
  return { ...durum, listeler: durum.listeler.map((l) => (l.id === id ? { ...l, ad: a } : l)) };
}
export function sil(durum, id) {
  const listeler = durum.listeler.filter((l) => l.id !== id);
  return { ...durum, listeler, aktif: durum.aktif === id ? listeler[0]?.id ?? null : durum.aktif };
}
export function sec(durum, id) {
  return durum.listeler.some((l) => l.id === id) ? { ...durum, aktif: id } : durum;
}
export function ekle(durum, id, sirketNo) {
  const n = Number(sirketNo);
  if (!Number.isInteger(n) || n <= 0) return durum;
  return { ...durum, listeler: durum.listeler.map((l) => (l.id === id && !l.idler.includes(n) && l.idler.length < SIRKET_MAX ? { ...l, idler: [...l.idler, n] } : l)) };
}
export function cikar(durum, id, sirketNo) {
  const n = Number(sirketNo);
  return { ...durum, listeler: durum.listeler.map((l) => (l.id === id ? { ...l, idler: l.idler.filter((x) => x !== n) } : l)) };
}
export const aktifListe = (durum) => durum.listeler.find((l) => l.id === durum.aktif) || null;
export const listedeMi = (liste, sirketNo) => !!liste?.idler.includes(Number(sirketNo));
