// DentSimco — restoran doluluk tablosunu üretir: node araclar/restoran-isi.mjs [--tam]
//
// Kaynak 1: oyunun gazetesi (Sim Companies Times). 7 haftada bir çıkan restoran makalesinde "Restaurant Occupancy Heatmap"
//   grafiği var: o dönemdeki bütün restoran döngülerinin rating dilimi (tam sayı, lüks çarpanı dahil) × menü fiyatı dilimi
//   başına döngü sayısı ve toplam doluluğu. API: /api/v3/en/{realm}/newspaper/{sayı}/ (makalenin charts[] içinde type "H").
//   Fiyat dilimi, menü fiyatının $30'un en yakın katına yuvarlanmışıdır: 60 = $60–74, 90 = $75–104 … 330 = $315–344, 360 = $345–350
//   (en yüksek fiyat $350 olduğu hâlde 360 dilimi var; $60–65 ve $75–80 döngülerinin dolulukları da bunu doğruluyor).
// Kaynak 2: ekonomi evreleri, api.simcotools.com/v1/realms/{realm}/phases (botun kullandığı kaynak).
//
// Kaynak 3: SimcoTools günlük mumları (api.simcotools.com/v1/realms/{realm}/market/resources/{ürün}/{kalite}/candlesticks). Restoranda satılan
//   16 ürünün 13 kalitesi için her sayının dönemindeki hacim ağırlıklı ortalama fiyat (VWAP) ham veriye eklenir. SimcoTools yalnız son 364 günü
//   tutar: sayı çıkınca bu betik bir kez çalışırsa o dönemin fiyatı kalıcı olur; dönemin başı penceredeki ilk günden 10 günden fazla önceyse atlanır.
//
// Ham veri araclar/veri/restoran-isi.json dosyasında birikir (yalnız yeni sayılar indirilir; --tam baştan tarar).
// Her hücre için dönemlerin evre paylarıyla ağırlıklı regresyon yapılır: doluluk = boom·b + normal·n + resesyon·r (+ zaman eğilimi);
// sonuç bugünkü düzeye göre üç evrenin doluluğudur. Sonuç public/restoran-doluluk.js olarak yazılır; o dosya elle değiştirilmez.
// Isı Haritası sekmesi için fiyatı olan her sayının hücreleri, evre payları, fiyatları ve maliyet eğrisi public/restoran-isi-donem.js olarak yazılır
// (restoran-isi-hesap.js hesaplar; o dosya da elle değiştirilmez).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as R from '../public/hesap-restoran.js';
import * as IH from '../public/restoran-isi-hesap.js';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAM = path.join(KOK, 'araclar', 'veri', 'restoran-isi.json');
const CIKTI = path.join(KOK, 'public', 'restoran-doluluk.js');
const CIKTI_DONEM = path.join(KOK, 'public', 'restoran-isi-donem.js');
const REALM = 0;
const ILK_SAYI = 220; // ısı haritası 228. sayıdan (Ocak 2023) önce yok
const GAZETE = (sayi) => `https://www.simcompanies.com/api/v3/en/${REALM}/newspaper/${sayi}/`;
const EVRE_API = (sayfa) => `https://api.simcotools.com/v1/realms/${REALM}/phases?page=${sayfa}`;
const MUM_API = (id, q, ms) => `https://api.simcotools.com/v1/realms/${REALM}/market/resources/${id}/${q}/candlesticks?start=${ms}`; // start: ms; en çok 364 gün döner
const URUN_IDLERI = R.KATEGORILER.flatMap((k) => k.urunler);
const KALITELER = Array.from({ length: 13 }, (_, q) => q);
const FIYAT_PENCERESI_GUN = 364; // SimcoTools'un tuttuğu süre
const KAPSAM_TOLERANS_GUN = 10; // dönemin başı penceredeki ilk günden en çok bu kadar önce olabilir

export const RATINGLER = Array.from({ length: 11 }, (_, i) => i); // rating dilimi 0–10
export const FIYATLAR = IH.FIYAT_DILIMLERI; // oyunun fiyat dilimi değerleri 60 … 360 ($60–74 … $345–350)
export const EVRE_ADLARI = ['recession', 'normal', 'boom']; // dizin: hesap.js ECONOMY_PHASES (0 Durgunluk, 1 Normal, 2 Büyüme)
const MIN_KOSU = 15; // oyun da 15 ve altı döngülü hücreyi göstermez

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  let son;
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (DentSimco)' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { son = e; if (i < 4) await sleep(i * 2000); }
  }
  throw new Error(`${url}: ${son.message}`);
}

async function evreleriIndir() {
  const out = [];
  for (let sayfa = 1, son = 1; sayfa <= son; sayfa++) {
    const d = await getJson(EVRE_API(sayfa));
    son = d?.metadata?.lastPage || 1;
    for (const x of d.ranges || []) out.push([x.phase, x.start, x.end]);
  }
  return [...new Map(out.map((x) => [x[1], x])).values()].sort((a, b) => a[1].localeCompare(b[1]));
}

// Bir sayıdaki restoran ısı haritası (yoksa null)
function donemOf(sayi, d) {
  for (const a of d?.articles || []) {
    const h = (a.charts || []).find((c) => c.type === 'H');
    if (!h || !Array.isArray(h.data) || !h.data.length) continue;
    const hucreler = h.data.map((c) => [c.rating_bracket, c.price_bracket, c.count, Math.round(c.sum_occupancy * 1e4) / 1e4])
      .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    // D grafiği: rating dilimi başına [eko seviye, lüks seviye] (doğrulama için saklanır; sekme kullanmaz)
    const dg = (a.charts || []).find((c) => c.type === 'D');
    const seviyeler = dg && Array.isArray(dg.data) ? dg.data.map((x) => [x.ratingBracket, x.economyLevels, x.luxuryLevels]).sort((x, y) => x[0] - y[0]) : undefined;
    return { sayi, makale: a.id, bas: a.dateRangeFrom, bit: a.dateRangeTo, hucreler, ...(seviyeler ? { seviyeler } : {}) };
  }
  return null;
}

async function hamGuncelle(tam) {
  let ham = { v: 1, realm: REALM, evreler: [], donemler: [] };
  let eski = null;
  try { eski = JSON.parse(await readFile(HAM, 'utf8')); } catch { /* ilk çalıştırma */ }
  if (!tam && eski) ham = eski;
  const liste = await getJson(`https://www.simcompanies.com/api/v3/en/${REALM}/newspaper/`);
  const enSon = Math.max(...liste.map((x) => Number(x.issueId)).filter(Number.isFinite));
  const onceki = ham.donemler.length;
  const bas = ham.donemler.length ? Math.max(...ham.donemler.map((x) => x.sayi)) + 1 : ILK_SAYI;
  for (let sayi = bas; sayi <= enSon; sayi++) {
    const d = await getJson(GAZETE(sayi)).catch(() => null);
    const dn = d && !Array.isArray(d) ? donemOf(sayi, d) : null;
    if (dn) { ham.donemler.push(dn); console.log(`${sayi}: ${dn.bas.slice(0, 10)} → ${dn.bit.slice(0, 10)}, ${dn.hucreler.length} hücre`); }
    await sleep(250);
  }
  ham.donemler.sort((a, b) => a.sayi - b.sayi);
  // --tam gazete verisini baştan okur ama fiyatlar yeniden alınamaz (SimcoTools yalnız son 364 günü tutar): eskiler korunur
  if (tam && eski) for (const d of ham.donemler) { const o = eski.donemler.find((x) => x.sayi === d.sayi); if (o?.fiyat) d.fiyat = o.fiyat; }
  ham.evreler = await evreleriIndir();
  const fiyatEklendi = await fiyatlariGuncelle(ham);
  // Ham dosya yalnız yeni sayı ya da fiyat eklendiğinde yazılır: değişmeyen çalışma (faz listesi her hafta değişir) dosyalara dokunmaz,
  // haftalık iş akışı boş commit ve yayın yapmaz
  const degisti = tam || ham.donemler.length !== onceki || fiyatEklendi || !ham.guncellendi;
  if (!degisti) return ham;
  ham.guncellendi = new Date().toISOString().slice(0, 10);
  await mkdir(path.dirname(HAM), { recursive: true });
  await writeFile(HAM, `${JSON.stringify(ham, null, 0).replace(/\],\[/g, '],\n[')}\n`);
  return ham;
}


// ---------------------------------------------------------------------------------------------------------------
// Dönem fiyatları (SimcoTools günlük mumları)
// ---------------------------------------------------------------------------------------------------------------

// Gazete tarihleri 22:00/23:00 UTC'dir; oyun gününe çevirmek için +3 saat (analizdeki kural). Dönem [bas, bit) gün aralığıdır.
export const gunSiniri = (iso) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10);

/**
 * Bir dönemin fiyatları. mumlar: { [id]: { [kalite]: [[gün 'YYYY-AA-GG', vwap, hacim], ...] } }
 * Dönen: { gun, urun: { [id]: [ [vwap, işlemGünü, hacim] | 0 (13 kalite) ] } }; vwap hacim ağırlıklı ortalama, 2 ondalık.
 */
export function donemFiyati(mumlar, bas, bit) {
  const b = gunSiniri(bas), e = gunSiniri(bit);
  const urun = {};
  for (const [id, kaliteler] of Object.entries(mumlar)) {
    urun[id] = KALITELER.map((q) => {
      const r = (kaliteler[q] || []).filter((x) => x[0] >= b && x[0] < e && x[1] > 0 && x[2] > 0);
      const hacim = r.reduce((s, x) => s + x[2], 0);
      if (!hacim) return 0;
      return [Math.round((r.reduce((s, x) => s + x[1] * x[2], 0) / hacim) * 100) / 100, r.length, Math.round(hacim)];
    });
  }
  return { gun: Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5), urun };
}

async function mumlariIndir(baslangicMs) {
  const mumlar = {};
  for (const id of URUN_IDLERI) {
    mumlar[id] = {};
    for (const q of KALITELER) {
      const d = await getJson(MUM_API(id, q, baslangicMs));
      mumlar[id][q] = (d.candlesticks || []).map((x) => [x.date.slice(0, 10), x.vwap, x.volume]);
      await sleep(560); // SimcoTools: saniyede 2 istek
    }
    process.stdout.write(`${id} `);
  }
  process.stdout.write('\n');
  return mumlar;
}

// Fiyatı olmayan ve yayımlanmış dönemler için fiyat toplar (bir kez). Pencerenin dışında kalan eski dönemler fiyatsız kalır.
export async function fiyatlariGuncelle(ham, simdi = Date.now()) {
  const eksik = ham.donemler.filter((d) => !d.fiyat && Date.parse(d.bit) <= simdi && Date.parse(d.bas) >= simdi - (FIYAT_PENCERESI_GUN + KAPSAM_TOLERANS_GUN) * 864e5);
  if (!eksik.length) return false;
  const bas = Math.min(...eksik.map((d) => Date.parse(gunSiniri(d.bas))));
  console.log(`fiyat: ${eksik.map((d) => `#${d.sayi}`).join(', ')} için SimcoTools mumları indiriliyor (${URUN_IDLERI.length * KALITELER.length} istek)`);
  const mumlar = await mumlariIndir(bas);
  const ilkGun = Object.values(mumlar).flatMap((k) => Object.values(k)).flatMap((m) => (m.length ? [m[0][0]] : [])).sort()[0];
  for (const d of eksik) {
    if (ilkGun && Date.parse(`${gunSiniri(d.bas)}T00:00:00Z`) < Date.parse(`${ilkGun}T00:00:00Z`) - KAPSAM_TOLERANS_GUN * 864e5) { console.log(`  #${d.sayi}: dönem pencerenin dışında, atlandı`); continue; }
    d.fiyat = donemFiyati(mumlar, d.bas, d.bit);
    console.log(`  #${d.sayi}: ${d.fiyat.gun} gün`);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Isı Haritası veri dosyası
// ---------------------------------------------------------------------------------------------------------------

/**
 * Fiyatı olan dönemlerden istemci verisi: [{ sayi, bas, bit, gun, evre [resesyon, normal, boom], h: [[rating, fiyat dilimi (FIYAT_DILIMLERI dizini 0–10),
 *   döngü, doluluk toplamı]], fiyat, egri: { eko, luks } }]. egri: restoran-isi-hesap.js maliyetEgrisi.
 */
export function donemVerisi(ham) {
  const out = [];
  for (const d of ham.donemler) {
    if (!d.fiyat) continue;
    const evre = evrePayi(d.bas, d.bit, ham.evreler) || [0, 1, 0];
    const h = d.hucreler.flatMap(([r, p, n, s]) => { const pi = IH.FIYAT_DILIMLERI.indexOf(p); return pi < 0 || r < 0 || r > 10 ? [] : [[r, pi, n, s]]; });
    const donem = { sayi: d.sayi, bas: d.bas.slice(0, 10), bit: d.bit.slice(0, 10), gun: d.fiyat.gun, evre: evre.map((x) => Math.round(x * 1e3) / 1e3), h, fiyat: d.fiyat.urun };
    donem.egri = { eko: IH.maliyetEgrisi(donem, 'eko'), luks: IH.maliyetEgrisi(donem, 'luks') };
    out.push(donem);
  }
  return out.sort((a, b) => a.sayi - b.sayi);
}

export function donemDosyasi(donemler, guncellendi) {
  const satir = (d) => `  ${JSON.stringify(d)},`;
  return `// DentSimco — Restoran Isı Haritası verisi. ÜRETİLMİŞ DOSYA: elle değiştirmeyin, node araclar/restoran-isi.mjs yeniden üretir.
// Kaynak: oyunun gazetesindeki restoran ısı haritaları (Sim Companies Times, H grafiği), SimcoTools ekonomi evreleri ve günlük mum fiyatları.
// Her dönem (7 haftalık gazete sayısı): h = [rating dilimi, fiyat dilimi (ISI_FIYAT_DILIMLERI dizini), döngü sayısı, doluluk toplamı (0–1 × döngü)],
// fiyat[ürün][kalite] = [VWAP $, işlem günü, hacim] | 0, egri = seviye başına döngü malzeme maliyeti, bonussuz, $: [[hedef rating ızgara dizini (× 0,005), maliyet | null], ...]
// yalnız maliyetin değiştiği noktalar (restoran-isi-hesap.js maliyetEgrisi).
export const ISI_KAYNAK = { guncellendi: '${guncellendi}', donem: ${donemler.length} };
export const ISI_FIYAT_DILIMLERI = [${IH.FIYAT_DILIMLERI.join(', ')}]; // oyunun dilim değeri: fiyat $30'un en yakın katına yuvarlanır (60 = $60–74 … 360 = $345–350)
export const ISI_DONEMLER = [
${donemler.map(satir).join('\n')}
];
`;
}

// ---------------------------------------------------------------------------------------------------------------
// Uyum (saf hesap; test/restoran_doluluk_test.mjs aynı fonksiyonu çağırıp yayımlanan tabloyla karşılaştırır)
// ---------------------------------------------------------------------------------------------------------------

// Dönemin evre payları [resesyon, normal, boom] (evre listesinin kapsamadığı süre payda dışında kalır)
export function evrePayi(bas, bit, evreler) {
  const A = Date.parse(bas);
  const B = Date.parse(bit);
  const p = [0, 0, 0];
  for (const [ad, s, e] of evreler) {
    const i = EVRE_ADLARI.indexOf(ad);
    const o = Math.min(B, Date.parse(e)) - Math.max(A, Date.parse(s));
    if (i >= 0 && o > 0) p[i] += o;
  }
  const t = p[0] + p[1] + p[2];
  return t > 0 ? p.map((x) => x / t) : null;
}

// Ağırlıklı en küçük kareler: β ve kovaryans
function wls(X, y, w) {
  const k = X[0].length;
  const ort = w.reduce((s, x) => s + x, 0) / w.length;
  const W = w.map((x) => x / ort);
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  X.forEach((row, t) => { for (let i = 0; i < k; i++) { b[i] += W[t] * row[i] * y[t]; for (let j = 0; j < k; j++) A[i][j] += W[t] * row[i] * row[j]; } });
  const inv = tersMatris(A);
  if (!inv) return null;
  const beta = inv.map((r) => r.reduce((s, x, j) => s + x * b[j], 0));
  const sse = X.reduce((s, row, t) => s + W[t] * (y[t] - row.reduce((u, x, i) => u + x * beta[i], 0)) ** 2, 0);
  const s2 = sse / Math.max(1, X.length - k);
  return { beta, kov: inv.map((r) => r.map((x) => x * s2)) };
}
function tersMatris(A) {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}

// Ağırlıklı izotonik regresyon (PAVA): artan dizi
function izotonik(y, w) {
  const blok = [];
  for (let i = 0; i < y.length; i++) {
    blok.push({ v: y[i], w: w[i], n: 1 });
    while (blok.length > 1 && blok[blok.length - 2].v > blok[blok.length - 1].v) {
      const b = blok.pop();
      const a = blok.pop();
      const ww = a.w + b.w;
      blok.push({ v: (a.v * a.w + b.v * b.w) / ww, w: ww, n: a.n + b.n });
    }
  }
  return blok.flatMap((b) => new Array(b.n).fill(b.v));
}

/**
 * Ham veriden tablo: { tablo[evre][fiyat][rating] (%), kosu[fiyat][rating], donem, ilk, son }
 * Hücre başına: en az 12 dönem verisi varsa evreler + zaman eğilimi, 8–11 dönemde yalnız evreler, daha azsa evresiz ortalama.
 * Evre farkı gürültüye göre küçültülür (fark² ÷ (fark² + varyans)): az veriyle büyük görünen fark tabloya taşınmaz.
 * Veri olmayan hücre komşulardan doldurulur; son olarak doluluk fiyatla artmayacak, ratingle azalmayacak biçimde düzeltilir.
 */
export function dolulukUyumu(ham) {
  const donemler = ham.donemler.map((d) => ({ ...d, pay: evrePayi(d.bas, d.bit, ham.evreler) })).filter((d) => d.pay);
  const T = donemler.length;
  const ham3 = () => FIYATLAR.map(() => RATINGLER.map(() => null));
  const tablo = [ham3(), ham3(), ham3()];
  const kosu = FIYATLAR.map(() => RATINGLER.map(() => 0));
  FIYATLAR.forEach((p, pi) => RATINGLER.forEach((r, ri) => {
    const y = []; const w = []; const X = [];
    donemler.forEach((d, t) => {
      const c = d.hucreler.find((h) => h[0] === r && h[1] === p);
      if (c && c[2] > MIN_KOSU) { y.push((c[3] / c[2]) * 100); w.push(c[2]); X.push([...d.pay, (t - (T - 1)) / T]); }
    });
    kosu[pi][ri] = w.reduce((s, x) => s + x, 0);
    if (!y.length) return;
    const ortalama = y.reduce((s, x, t) => s + x * w[t], 0) / kosu[pi][ri];
    let deger = [ortalama, ortalama, ortalama];
    const fit = y.length >= 12 ? wls(X, y, w) : y.length >= 8 ? wls(X.map((x) => x.slice(0, 3)), y, w) : null;
    if (fit) {
      const [bR, bN, bB] = fit.beta;
      const v = fit.kov;
      const kucult = (i, b) => { const d = b - bN; const varD = v[i][i] + v[1][1] - 2 * v[i][1]; return bN + (d * d) / (d * d + Math.max(varD, 1e-9)) * d; };
      deger = [kucult(0, bR), bN, kucult(2, bB)];
    }
    deger.forEach((x, e) => { tablo[e][pi][ri] = Math.min(100, Math.max(0, x)); });
  }));
  for (const t of tablo) { doldur(t); duzelt(t, kosu); }
  const yuvarla = (x) => Math.round(x * 10) / 10;
  return {
    tablo: tablo.map((t) => t.map((row) => row.map(yuvarla))), kosu,
    donem: T, ilk: donemler[0]?.bas.slice(0, 10), son: donemler[T - 1]?.bit.slice(0, 10),
    toplamKosu: donemler.reduce((s, d) => s + d.hucreler.reduce((u, h) => u + h[2], 0), 0),
  };
}

// Boş hücre: aynı ratingde komşu fiyatların, yoksa aynı fiyatta komşu ratinglerin ortalaması (dolana kadar tekrar)
function doldur(t) {
  for (let tur = 0; tur < 40 && t.some((row) => row.some((x) => x == null)); tur++) {
    const yeni = t.map((row) => row.slice());
    t.forEach((row, pi) => row.forEach((x, ri) => {
      if (x != null) return;
      const fiyatKomsu = [t[pi - 1]?.[ri], t[pi + 1]?.[ri]].filter((v) => v != null);
      const ratingKomsu = [row[ri - 1], row[ri + 1]].filter((v) => v != null);
      const k = fiyatKomsu.length ? fiyatKomsu : ratingKomsu;
      if (k.length) yeni[pi][ri] = k.reduce((s, v) => s + v, 0) / k.length;
    }));
    t.splice(0, t.length, ...yeni);
  }
}

// Doluluk fiyatla artmaz, ratingle azalmaz: dönüşümlü izotonik regresyon (ağırlık: döngü sayısı), sonra kesin düzeltme
function duzelt(t, kosu) {
  const P = t.length;
  const Rn = t[0].length;
  const ag = (pi, ri) => kosu[pi][ri] + 1;
  for (let tur = 0; tur < 30; tur++) {
    for (let ri = 0; ri < Rn; ri++) {
      const col = izotonik(t.map((row) => -row[ri]), t.map((_, pi) => ag(pi, ri))).map((x) => -x); // fiyat arttıkça azalan
      col.forEach((x, pi) => { t[pi][ri] = x; });
    }
    for (let pi = 0; pi < P; pi++) t[pi] = izotonik(t[pi], t[pi].map((_, ri) => ag(pi, ri))); // rating arttıkça artan
  }
  for (let pi = 0; pi < P; pi++) for (let ri = 1; ri < Rn; ri++) t[pi][ri] = Math.max(t[pi][ri], t[pi][ri - 1]);
  for (let pi = 1; pi < P; pi++) for (let ri = 0; ri < Rn; ri++) t[pi][ri] = Math.min(t[pi][ri], t[pi - 1][ri]);
}

export function tabloDosyasi(u) {
  const satir = (row) => `[${row.join(', ')}]`;
  const evre = (t, ad) => `  // ${ad}\n  [\n${t.map((row, pi) => `    ${satir(row)}, // ${IH.dilimAdi(pi)}`).join('\n')}\n  ],`;
  return `// DentSimco — restoran doluluk tablosu. ÜRETİLMİŞ DOSYA: elle değiştirmeyin, node araclar/restoran-isi.mjs yeniden üretir.
// Kaynak: oyunun gazetesindeki restoran ısı haritaları (Sim Companies Times, ${u.donem} dönem, ${u.ilk} – ${u.son},
// ${u.toplamKosu.toLocaleString('en-US')} restoran döngüsü) ve SimcoTools ekonomi evreleri. Rating dilimi lüks çarpanı uygulanmış ratingin tam
// sayı kısmı; fiyat dilimi menü fiyatının $30'un en yakın katına yuvarlanmışı (60 = $60–74 … 360 = $345–350). Değerler hücre başına
// evre paylarıyla regresyondan, bugünkü düzeye göre; piyasa ortalamasıdır.
export const DOLULUK_KAYNAK = { donem: ${u.donem}, ilk: '${u.ilk}', son: '${u.son}', kosu: ${u.toplamKosu} };
export const DOLULUK_FIYATLAR = [${FIYATLAR.join(', ')}]; // oyunun fiyat dilimi değeri (dilimin ortası; 60 ve 360 uçta)
// DOLULUK_TABLO[evre][fiyat dilimi][rating dilimi 0–10] = doluluk %; evre: 0 Durgunluk (resesyon), 1 Normal, 2 Büyüme (boom)
export const DOLULUK_TABLO = [
${evre(u.tablo[0], 'Durgunluk')}
${evre(u.tablo[1], 'Normal')}
${evre(u.tablo[2], 'Büyüme')}
];
// Hücredeki toplam döngü sayısı (0: veri yok, değer komşulardan)
export const DOLULUK_KOSU = [
${u.kosu.map((row, pi) => `  ${satir(row)}, // $${FIYATLAR[pi]}`).join('\n')}
];
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ham = await hamGuncelle(process.argv.includes('--tam'));
  const u = dolulukUyumu(ham);
  await writeFile(CIKTI, tabloDosyasi(u));
  console.log(`${u.donem} dönem (${u.ilk} – ${u.son}), ${u.toplamKosu} döngü → ${path.relative(KOK, CIKTI)}`);
  const donemler = donemVerisi(ham);
  await writeFile(CIKTI_DONEM, donemDosyasi(donemler, ham.guncellendi));
  console.log(`${donemler.length} dönem fiyatlı (${donemler.map((d) => `#${d.sayi}`).join(', ')}) → ${path.relative(KOK, CIKTI_DONEM)}`);
}
