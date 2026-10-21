// DentSimco — Diğer: Government Order | Binalar | Ekonomik Evreler | Sertifikalar
// Veri: DentSimco-Bot bot/diger.mjs saatte bir yazar (biçim o dosyanın başında):
//   meta/go_r{realm}     GO arşivi: Sim Companies (ilandaki ve yürüyen siparişler, miktarlarıyla) + Simcotools (tüm geçmiş)
//   meta/bina_r{realm}   bina türü başına sayı ve günlük geçmişi;  meta/ihale_r{realm}  açık bina açık artırmaları
//   meta/evre_r{realm}   ekonomi evreleri, günlük realm özeti (2022'den), üretim olayları, yarışmalar
//   meta/sert_r{realm}   sertifika türleri ve son verilenler;  meta/sert_r{realm}_k{tür}  türün kazananları
//   meta/sb_ozet_r{realm} şirketlerin binaları özeti (bot/sirket_bina.mjs, günde bir tarama): bina türü başına sahip ve en büyükler, GO seviyeleri
// Ürün adları ve borsa fiyatı (GO değeri) canlı borsa verisinden (loadBasics) gelir. Oyunun proje, kurum ve sertifika adları
// diger-adlar.js'de (diğer diller dil-xx.js › DIGER_ADLARI). Şirket ve oyun adları çevrilmez (data-no-t).
// Adres: #diger/go[/ilan|yuruyen|gecmis|urunler] | #diger/bina | #diger/evre | #diger/sertifika[/{tür}]

import { PATHS, readDocs, dataField, loadBasics, anlikFiyat, VeriHatasi, fmtPrice, fmtNum, fmtCompact, fmtShare, fmtDate, fmtDateTime, DAY, HOUR, MIN } from './veri.js';
import { DIL, LOCALE, DIL_ADLARI } from './i18n.js';
import { binaAdi } from './adlar.js';
import { urunAdi } from './urun-adlari.js';
import { esc } from './esc.js';
import * as G from './sirket-gecmis.js';
import { PROJELER, GO_KURAL, BOLLUK, ADLAR_TR, ADLAR_EN } from './diger-adlar.js';

export const SEKMELER = [['go', 'Government Order'], ['bina', 'Binalar'], ['evre', 'Ekonomik Evreler'], ['sertifika', 'Sertifikalar']];
const GO_ALT = [['ilan', 'İlanda'], ['yuruyen', 'Yürüyen'], ['gecmis', 'Geçmiş'], ['urunler', 'İstenen ürünler']];
export const EVRELER = ['Durgunluk', 'Normal', 'Büyüme'];
const EVRE_NO = { recession: 0, normal: 1, boom: 2 };
const EVRE_RENK = ['var(--down)', 'var(--accent)', 'var(--up)'];
const SAYFA = 50;
const ARALIKLAR = [[90, 'Son 90 gün'], [365, 'Son 1 yıl'], [0, 'Tüm zamanlar']];

// ---- Adres ----
export function digerRota(hash) {
  const p = String(hash ?? '').replace(/^#/, '').split('/');
  const tab = SEKMELER.some(([k]) => k === p[1]) ? p[1] : 'go';
  return {
    tab,
    go: tab === 'go' && GO_ALT.some(([k]) => k === p[2]) ? p[2] : null,
    tur: tab === 'sertifika' && /^\d+$/.test(p[2] || '') ? Number(p[2]) : null,
  };
}

// ---- Oyunun adları (seçili dilde) ----
const adTablosu = (b) => (DIL === 'tr' ? ADLAR_TR[b] : { ...ADLAR_EN[b], ...(DIL === 'en' ? {} : DIL_ADLARI.diger?.[b] || {}) });
const AD = { p: adTablosu('p'), a: adTablosu('a'), c: adTablosu('c') };
const EN_AD = new Map();
for (const [k, v] of Object.entries(ADLAR_EN.p)) {
  const key = v.toLowerCase();
  if (!EN_AD.has(key)) EN_AD.set(key, []);
  EN_AD.get(key).push(k);
}
const urunKumesi = (list) => [...list].map(Number).sort((a, b) => a - b).join();

// Siparişin proje anahtarı. Simcotools yalnız İngilizce adı verir; aynı adlı birden çok proje varsa istenen ürünlerden bulunur.
export function projeAnahtari(o) {
  if (o?.k) return o.k;
  const adaylar = EN_AD.get(String(o?.n ?? '').toLowerCase()) || [];
  if (adaylar.length <= 1) return adaylar[0] || null;
  const urunler = urunKumesi((o.r || []).map((x) => x[0]));
  return adaylar.find((k) => urunKumesi(PROJELER[k]?.r || []) === urunler) || adaylar[0];
}
export const projeAdi = (o) => { const k = projeAnahtari(o); return (k && AD.p[k]) || o?.n || k || '?'; };
export const kurumAdi = (o) => { const a = PROJELER[projeAnahtari(o)]?.a; return a ? AD.a[a] || a : ''; };
export const sertAdi = (tur) => AD.c[tur] || `#${tur}`;

// ---- Government Order (saf) ----
// Oyundaki gibi: sipariş çıkınca 5 gün teklif toplanır; kazanan çarpanı alır ve teslim süresi başlar.
export const teklifBitisi = (o) => o.c + GO_KURAL.teklifGun * DAY;
export const teslimBitisi = (o) => teklifBitisi(o) + (o.d || 0) * DAY;
export function goDurum(o, now) {
  if (!Number.isFinite(o?.c)) return 'gecmis';
  if (o.m == null && now < teklifBitisi(o)) return 'ilan';
  return now < teslimBitisi(o) ? 'yuruyen' : 'gecmis';
}
export function goListeleri(orders, now) {
  const out = { ilan: [], yuruyen: [], gecmis: [] };
  for (const o of Object.values(orders || {})) if (o && Number.isFinite(o.id)) out[goDurum(o, now)].push(o);
  out.ilan.sort((a, b) => teklifBitisi(a) - teklifBitisi(b) || a.id - b.id);
  out.yuruyen.sort((a, b) => teslimBitisi(a) - teslimBitisi(b) || a.id - b.id);
  out.gecmis.sort((a, b) => b.c - a.c || b.id - a.id);
  return out;
}
export const gerekenMiktar = (temel, carpan) => (temel == null || !(carpan > 0) ? null : Math.ceil(carpan * temel));

// Siparişin borsa değeri: Σ gereken miktar × fiyat(ürün, kalite). Fiyatı ya da miktarı olmayan kalem `eksik` sayılır.
export function goDegeri(o, carpan, fiyat) {
  let toplam = 0;
  let eksik = 0;
  for (const [kind, q, temel] of o?.r || []) {
    const n = gerekenMiktar(temel, carpan);
    const p = fiyat(kind, q);
    if (n == null || !(p > 0)) { eksik++; continue; }
    toplam += n * p;
  }
  return { toplam, eksik };
}

// Verilmiş çarpanlar (aynı büyüklükteki siparişlerde): ilandaki sipariş için yol gösterir
export function carpanAraligi(orders, size) {
  const m = Object.values(orders || {}).filter((o) => o?.m > 0 && (size == null || o.s === size)).map((o) => o.m).sort((a, b) => a - b);
  if (!m.length) return null;
  return { n: m.length, min: m[0], orta: m[Math.floor((m.length - 1) / 2)], max: m.at(-1) };
}

// Geçmişte en çok istenen ürünler: [{kind, n, son, kaliteler: Map(q → adet)}] çoktan aza
export function urunTalepleri(orders) {
  const m = new Map();
  for (const o of Object.values(orders || {})) {
    for (const [kind, q] of o?.r || []) {
      const x = m.get(kind) || { kind, n: 0, son: 0, kaliteler: new Map() };
      x.n++;
      x.son = Math.max(x.son, o.c || 0);
      x.kaliteler.set(q, (x.kaliteler.get(q) || 0) + 1);
      m.set(kind, x);
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.son - a.son);
}

// Tek ürünün talep ayrıntısı: sipariş sayısı, kaliteye göre dağılım, gereken toplam miktar (yalnız çarpanı bilinen siparişlerden)
export function urunAyrintisi(orders, kind) {
  const siparisler = [];
  const kaliteler = new Map();
  let miktar = 0;
  let miktarliSiparis = 0;
  for (const o of Object.values(orders || {})) {
    const kalemler = (o?.r || []).filter((x) => String(x[0]) === String(kind));
    if (!kalemler.length) continue;
    siparisler.push(o);
    for (const [, q, temel] of kalemler) {
      const n = gerekenMiktar(temel, o.m);
      const x = kaliteler.get(q) || { n: 0, miktar: 0, miktarli: 0 };
      x.n++;
      if (n != null) { x.miktar += n; x.miktarli++; miktar += n; miktarliSiparis++; }
      kaliteler.set(q, x);
    }
  }
  siparisler.sort((a, b) => (b.c || 0) - (a.c || 0) || b.id - a.id);
  return { n: siparisler.length, siparisler, kaliteler, miktar, miktarliSiparis };
}

// Yazılan metinden ürün bulur: kimlik, tam ad ya da (tek eşleşme varsa) adın bir parçası. adlar: [[id, ad]]
export function urunBul(metin, adlar) {
  const q = String(metin ?? '').trim().toLocaleLowerCase(LOCALE).replace(/^#/, '');
  if (!q) return null;
  if (/^\d+$/.test(q)) return adlar.find(([id]) => String(id) === q)?.[0] ?? null;
  const tam = adlar.filter(([, ad]) => String(ad).toLocaleLowerCase(LOCALE) === q);
  if (tam.length === 1) return tam[0][0];
  const kismi = adlar.filter(([, ad]) => String(ad).toLocaleLowerCase(LOCALE).includes(q));
  return kismi.length === 1 ? kismi[0][0] : null;
}

// ---- Evre (saf) ----
// ranges: [[evre, baş, bit]] artan. Dönüş: { simdiki, sonraki?, istatistik: [{evre, adet, hafta, ort}] }
export function evreOzeti(ranges, now) {
  const list = (ranges || []).filter((r) => r && r[0] in EVRE_NO && Number.isFinite(r[1]));
  const simdiki = [...list].reverse().find((r) => r[1] <= now) || null;
  const istatistik = EVRELER.map((ad, i) => ({ evre: i, adet: 0, hafta: 0 }));
  for (const [ev, bas, bit] of list) {
    if (!Number.isFinite(bit)) continue;
    const s = istatistik[EVRE_NO[ev]];
    s.adet++;
    s.hafta += Math.round((bit - bas) / (7 * DAY));
  }
  const toplam = istatistik.reduce((a, s) => a + s.hafta, 0);
  for (const s of istatistik) { s.ort = s.adet ? s.hafta / s.adet : null; s.pay = toplam ? s.hafta / toplam : null; }
  return { simdiki, istatistik, toplamHafta: toplam };
}
export const evreNo = (ad) => EVRE_NO[ad] ?? null;

// Kalan süre metni: "2 g 5 sa", "5 sa 12 dk", "12 dk"; geçtiyse null
export function kalanMetni(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const g = Math.floor(ms / DAY);
  const sa = Math.floor((ms % DAY) / HOUR);
  const dk = Math.floor((ms % HOUR) / MIN);
  if (g > 0) return sa ? `${g} g ${sa} sa` : `${g} g`;
  if (sa > 0) return dk ? `${sa} sa ${dk} dk` : `${sa} sa`;
  return `${Math.max(1, dk)} dk`;
}

// Simcotools'un yarım hesaplanmış günleri (ör. 300 bin yerine 5 bin bina): komşu 6 günün ortancasının %60'ının altındaki nokta atılır.
// noktalar: [[gün, değer]] artan; 0 ve boş değer de atılır.
export function aykiriAt(noktalar) {
  const v = noktalar.filter((x) => x[1] > 0);
  return v.filter((x, i) => {
    const komsu = [...v.slice(Math.max(0, i - 3), i), ...v.slice(i + 1, i + 4)].map((y) => y[1]).sort((a, b) => a - b);
    if (komsu.length < 2) return true;
    const orta = (komsu[Math.floor((komsu.length - 1) / 2)] + komsu[Math.ceil((komsu.length - 1) / 2)]) / 2;
    return x[1] >= orta * 0.6;
  });
}

// ---- Bina (saf) ----
// Gün anahtarları (YYYYMMDD) arasında bugünden önceki en yakın gün; yoksa null
function oncekiGun(hist, gun, enAzFark) {
  const keys = Object.keys(hist || {}).map(Number).filter((d) => d < gun).sort((a, b) => b - a);
  const hedef = enAzFark ? gunEkle(gun, -enAzFark) : null;
  return (hedef ? keys.find((d) => d <= hedef) : keys[0]) ?? null;
}
export function gunEkle(gun, n) {
  const d = new Date(Date.UTC(Math.floor(gun / 10000), Math.floor(gun / 100) % 100 - 1, gun % 100) + n * DAY);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
const KATEGORI = { production: 'Üretim', sales: 'Satış', research: 'Araştırma', recreation: 'Dinlenme', seasonal: 'Mevsimlik', other: 'Diğer' };
export const kategoriAdi = (k) => KATEGORI[k] || k || '—';

// Bina tablosu satırları: [{harf, kat, n, pay, f1 (dünden fark), f7 (7 gün önceden fark), cu, sure, urunler}]
export function binaSatirlari(bina, sabitler, products) {
  const hist = bina?.hist || {};
  const gun = Number(bina?.date) || null;
  const d1 = gun && oncekiGun(hist, gun, 1);
  const d7 = gun && oncekiGun(hist, gun, 7);
  const urunSay = {};
  for (const p of Object.values(products || {})) if (p?.building) (urunSay[p.building] ||= []).push(p.id);
  const sabit = {};
  for (const b of Object.values(sabitler || {})) if (b?.dbLetter != null) sabit[b.dbLetter] = b;
  return Object.entries(bina?.counts || {}).map(([harf, [n, pay]]) => ({
    harf, n, pay,
    kat: sabit[harf]?.category || null,
    f1: d1 && hist[d1]?.[harf] != null ? n - hist[d1][harf] : null,
    f7: d7 && hist[d7]?.[harf] != null ? n - hist[d7][harf] : null,
    cu: sabit[harf]?.costUnits ?? null,
    sure: sabit[harf]?.buildDuration ?? null,
    urunler: urunSay[harf] || [],
  }));
}

// Şirket binaları özeti (meta/sb_ozet_r) → [{harf, sirket, bina, seviye, enYuksek}] toplam seviyeye göre
export function sbTurleri(sb) {
  return Object.entries(sb?.kinds || {}).map(([harf, [sirket, bina, seviye, enYuksek]]) => ({ harf, sirket, bina, seviye, enYuksek }))
    .filter((x) => x.bina > 0).sort((a, b) => b.seviye - a.seviye || b.sirket - a.sirket);
}

// Bolluk düzeyinin alt eşiği (%): oyundaki adlar (Exceptional, VeryGood…)
export const bollukEsigi = (ad) => BOLLUK[String(ad).replace(/\s+/g, '')] ?? null;

// ---- Sertifika (saf) ----
const DEGER_ADI = { amount: 'Miktar', goldenBars: 'Altın külçe', governmentOrderRevenue: 'GO geliri', yearStarted: 'Başlangıç yılı', contestId: 'Yarışma no' };
export const degerAdi = (vk) => DEGER_ADI[vk] || 'Değer';
export function donemMetni(d) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(d ?? ''));
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const w = /^(\d{4})-W(\d{2})$/.exec(String(d ?? ''));
  if (w) return `${w[1]} · ${Number(w[2])}. hafta`;
  return String(d ?? '');
}

// ---- Biçim ----
const NUM = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const usd = (x) => (x == null || !Number.isFinite(x) ? '—' : `$${NUM.format(Math.round(x))}`);
const usdK = (x) => (x == null || !Number.isFinite(x) ? '—' : `$${fmtCompact(x)}`);
const signed = (x) => (x == null ? '—' : x > 0 ? `+${NUM.format(x)}` : x < 0 ? `−${NUM.format(-x)}` : '0');
const tone = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
const yyyymmdd = (ms) => { const d = new Date(ms); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
const tarih = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const oyun = (s) => `<span data-no-t>${esc(s)}</span>`; // oyundan gelen ad: çeviri katmanı dokunmaz
const NADIR = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumSignificantDigits: 2 });
const nadirlik = (x) => (x == null || !Number.isFinite(x) ? '—' : NADIR.format(x));
const sureMetni = (sn) => (sn == null ? '—' : sn >= 3600 ? `${Math.round(sn / 360) / 10} sa` : `${Math.round(sn / 60)} dk`);

const CSS = G.GRAFIK_CSS + `
.dg { max-width: 1100px; margin: 0 auto; padding: 8px 14px 40px; display: flex; flex-direction: column; gap: 12px; }
.dg h1 { font: 600 22px/1.2 var(--font-c); margin: 0; }
.dg h2 { font: 600 17px var(--font-c); margin: 0; }
.dg h3 { font: 600 16px var(--font-c); margin: 0; overflow-wrap: anywhere; }
.dg-note { color: var(--muted); font-size: 14px; margin: 0; line-height: 1.45; }
.dg-card { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 12px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.dg-sub { display: flex; flex-wrap: wrap; gap: 6px; }
.dg-sub a, .dg-seg button { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--raise); color: var(--muted); font: 600 14px var(--font); text-decoration: none; cursor: pointer; }
.dg-sub a[aria-current="page"], .dg-seg button[aria-pressed="true"] { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
.dg-sub a b { font-weight: 700; }
.dg-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.dg-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dg-row select, .dg-row input { height: 40px; padding: 0 10px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--surface); color: var(--text); min-width: 0; }
.dg-row input[type=search] { flex: 1 1 200px; }
.dg-row input[type=number] { width: 110px; }
.dg-row label { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 14px; }
.dg-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
.dg-tile { border: 1px solid var(--line); border-radius: 12px; background: var(--raise); padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dg-tile span { color: var(--muted); font-size: 13px; }
.dg-tile b { font: 600 20px var(--font-c); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.dg-tile small { font-size: 13px; color: var(--muted); }
.dg-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.dg table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.dg th, .dg td { padding: 8px 9px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--row-line); font-size: 14px; }
.dg th { position: sticky; top: 0; background: var(--raise); color: var(--muted); font: 600 13px var(--font-c); }
.dg th[data-sort] { cursor: pointer; user-select: none; }
.dg th[aria-sort] { color: var(--accent); }
.dg th.l, .dg td.l { text-align: left; }
.dg td.w { white-space: normal; min-width: 160px; }
.dg td.ww { white-space: normal; min-width: 280px; }
.dg tbody tr:hover { background: var(--hover); }
.dg tr[data-git] { cursor: pointer; }
.dg .up { color: var(--up); }
.dg .down { color: var(--down); }
.dg .dim { color: var(--faint); }
.dg small.alt { display: block; color: var(--faint); font-size: 12px; }
.dg-gos { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 500px), 1fr)); gap: 12px; }
.dg-go th, .dg-go td { padding: 7px 6px; font-size: 13px; }
.dg-go header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.dg-go header > div { min-width: 0; }
.dg-kurum { color: var(--muted); font-size: 13px; }
.dg-rozet { flex: none; padding: 3px 9px; border-radius: 999px; font: 600 12px var(--font-c); border: 1px solid var(--line-2); color: var(--muted); }
.dg-rozet.ilan { color: var(--late); border-color: var(--late-line); background: var(--late-bg); }
.dg-rozet.yuruyen { color: var(--up); border-color: var(--up-line); background: var(--up-bg); }
.dg-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px 12px; }
.dg-kv div { display: flex; flex-direction: column; min-width: 0; }
.dg-kv span { color: var(--muted); font-size: 12px; }
.dg-kv b { font-weight: 600; font-size: 15px; font-variant-numeric: tabular-nums; }
.dg-kalan { color: var(--late); font-size: 13px; font-weight: 600; }
.dg-cips { display: flex; flex-wrap: wrap; gap: 4px; }
.dg-cip { display: inline-flex; gap: 4px; padding: 2px 8px; border-radius: 999px; background: var(--raise); border: 1px solid var(--line); font-size: 13px; white-space: nowrap; }
.dg-cip b { color: var(--accent); font-weight: 600; }
.dg-pager { display: flex; gap: 8px; align-items: center; justify-content: center; }
.dg-pager button { height: 40px; padding: 0 14px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--surface); color: var(--text); font-weight: 600; cursor: pointer; }
.dg-pager button:disabled { opacity: .4; cursor: default; }
.dg-bar { display: flex; height: 28px; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); }
.dg-bar i { display: block; height: 100%; min-width: 1px; }
.dg-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; color: var(--muted); }
.dg-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.dg-evre { font: 600 24px var(--font-c); }
.dg tr.dg-sec { background: var(--sel); }
.dg tr[data-sb-tur], .dg tr[data-urun-ekle] { cursor: pointer; }
.dg-btn { min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--raise); color: var(--muted); font: 600 14px var(--font); cursor: pointer; }
.dg-btn[aria-pressed="true"] { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
.dg-chips { gap: 6px; }
.dg-sec-cip { align-items: center; gap: 6px; padding: 4px 6px 4px 10px; font-size: 14px; }
.dg-x { border: 0; background: transparent; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px; }
.dg details > summary { cursor: pointer; }
.dg-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
`;

export function mountDiger(root, { realm: startRealm = 0 } = {}) {
  let realm = startRealm;
  let alive = true;
  let token = 0;
  let rota = digerRota(location.hash);
  const durum = {
    goAlt: null, goSayfa: 1, goAra: '', carpan: carpanOku(), urunSec: [], urunAra: '', urunAcik: true, urunHata: '',
    binaSira: ['n', -1], ihaleBina: '', ihaleSira: ['kapanis', 1], ihaleSayfa: 1, binaAralik: 365,
    evreMetrik: 1, evreAralik: 0, ozetAralik: 365, olaySayfa: 1,
    sertSira: ['rar', 1], sertUrun: '', sertAra: '', sertSayfa: 1,
    sbTur: '',
  };

  const style = document.createElement('style');
  style.dataset.module = 'diger';
  style.textContent = CSS;
  document.head.append(style);
  const subnav = document.createElement('nav');
  subnav.className = 'subnav on';
  subnav.id = 'subnav-diger';
  subnav.setAttribute('aria-label', 'Diğer bölümleri');
  subnav.innerHTML = SEKMELER.map(([k, t]) => `<a href="#diger/${k}" data-sub="${k}">${t}</a>`).join('');
  root.before(subnav);
  const subnavBoya = () => { for (const a of subnav.querySelectorAll('a')) { if (a.dataset.sub === rota.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); } };
  root.innerHTML = '<div class="dg"></div>';
  const box = root.querySelector('.dg');

  // ---- Veri ----
  const yollar = {
    go: () => PATHS.meta(`go_r${realm}`), bina: () => PATHS.meta(`bina_r${realm}`), ihale: () => PATHS.meta(`ihale_r${realm}`),
    evre: () => PATHS.meta(`evre_r${realm}`), sert: () => PATHS.meta(`sert_r${realm}`), tur: (k) => PATHS.meta(`sert_r${realm}_k${k}`),
    sabit: () => PATHS.meta('buildings'), sb: () => PATHS.meta(`sb_ozet_r${realm}`),
  };
  // Saatte bir değişen belgeler 10 dakikadan eskiyse yeniden okunur (veri.js önbelleği meta için 6 saat tutar)
  const okundu = new Map();
  async function oku(paths) {
    const now = Date.now();
    const docs = await readDocs(paths, { refresh: (p) => p !== yollar.sabit() && now - (okundu.get(p) || 0) > 10 * MIN });
    for (const p of paths) if (!okundu.has(p) || now - okundu.get(p) > 10 * MIN) okundu.set(p, now);
    return (p) => dataField(docs.get(p));
  }
  let temel = null; // { products, live } realm başına
  async function temelOku() {
    if (temel?.realm === realm) return temel;
    const b = await loadBasics(realm);
    temel = { realm, products: b.products || {}, live: b.live };
    return temel;
  }
  const urun = (id) => urunAdi(id, temel?.products?.[id]?.name || `#${id}`);
  const fiyat = (kind, q) => anlikFiyat(temel?.live, kind, q)?.p ?? null;

  function hataGoster(e, ne) {
    box.innerHTML = `<h1>Diğer</h1><p class="dg-note">${esc(e instanceof VeriHatasi ? e.message : `${ne} açılamadı. Biraz sonra tekrar dene.`)}</p>`;
  }
  const yukleniyor = () => { box.innerHTML = '<h1>Diğer</h1><p class="dg-note">Yükleniyor…</p>'; };
  const botNotu = (t) => (Number.isFinite(t) ? `<p class="dg-note"><span>${esc(`Son güncelleme: ${fmtDateTime(t)}.`)}</span> <span>Veri: Sim Companies ve Simcotools.</span></p>` : '');
  const veriYok = '<p class="dg-note">Bu bölümün verisi henüz toplanmadı. Biraz sonra tekrar bakın.</p>';

  // ---- Çizim ----
  async function ciz() {
    const my = ++token;
    subnavBoya();
    yukleniyor();
    try {
      if (rota.tab === 'go') await goCiz(my);
      else if (rota.tab === 'bina') await binaCiz(my);
      else if (rota.tab === 'evre') await evreCiz(my);
      else await sertCiz(my);
    } catch (e) {
      if (!alive || my !== token) return;
      console.error(e);
      hataGoster(e, 'Bölüm');
    }
    if (alive && my === token) { box.querySelectorAll('.sg-kutu').forEach(G.grafikBagla); sayac(); }
  }
  const gecerli = (my) => alive && my === token;

  // Geri sayımlar ([data-bitis]) yarım dakikada bir yenilenir
  function sayac() {
    const now = Date.now();
    for (const el of box.querySelectorAll('[data-bitis]')) {
      const k = kalanMetni(Number(el.dataset.bitis) - now);
      el.textContent = k ? `${k} kaldı` : 'Süre doldu';
    }
  }
  const timer = setInterval(sayac, 30_000);

  // ---- Government Order ----
  let goVeri = null;
  async function goCiz(my) {
    const [get] = await Promise.all([oku([yollar.go(), yollar.sb()]), temelOku()]);
    if (!gecerli(my)) return;
    const doc = get(yollar.go());
    const now = Date.now();
    goVeri = { doc, list: goListeleri(doc?.orders, now), sb: get(yollar.sb()) };
    goBoya();
  }
  function goBoya() {
    const { doc, list, sb } = goVeri;
    if (!doc) { box.innerHTML = `<h1>Government Order</h1>${veriYok}`; return; }
    const alt = rota.go || durum.goAlt || (list.ilan.length ? 'ilan' : 'yuruyen');
    const say = { ilan: list.ilan.length, yuruyen: list.yuruyen.length, gecmis: list.gecmis.length, urunler: urunTalepleri(doc.orders).length };
    const sekme = ([k, t]) => `<a href="#diger/go/${k}" ${k === alt ? 'aria-current="page"' : ''}>${t} <b data-no-t>${NUM.format(say[k])}</b></a>`;
    let govde;
    if (alt === 'ilan' || alt === 'yuruyen') govde = goKartlari(list[alt], alt, doc.orders);
    else if (alt === 'gecmis') govde = goGecmis(list.gecmis);
    else govde = goUrunler(doc.orders);
    box.innerHTML = `<h1>Government Order</h1>
      <p class="dg-note">Devlet siparişleri her çarşamba 16:00'da (TR saati) çıkar. 5 gün teklif toplanır, pazartesi 16:00'da kazanan ekip seçilir ve teslim süresi başlar. Teklif 3-7 şirketlik ekiplerle verilir; kazanan teklifin %10'u teminat olarak alınır. Gereken miktar = temel miktar × çarpan (çarpan kazanan ekibin seviyesine göre).</p>
      <nav class="dg-sub" aria-label="Government Order bölümleri">${GO_ALT.map(sekme).join('')}</nav>
      ${govde}
      ${alt === 'ilan' ? '' : goSeviyeKarti(sb)}
      ${botNotu(doc.t)}`;
  }

  function goKartlari(list, alt, orders) {
    if (!list.length) {
      return `<p class="dg-note">${alt === 'ilan' ? 'Şu an teklif toplayan sipariş yok. Yeni siparişler çarşamba 16:00\'da (TR saati) çıkar.' : 'Şu an teslim süresi devam eden sipariş yok.'}</p>`;
    }
    const kendi = alt === 'ilan' ? `<div class="dg-card"><div class="dg-row"><label>Çarpanınız <input type="number" min="1" step="1" inputmode="numeric" data-carpan value="${durum.carpan ?? ''}" placeholder="—"></label></div>
      <p class="dg-note">İlandaki siparişte çarpan henüz belli değildir. Kendi çarpanınızı yazarsanız gereken miktar ve borsa değeri ona göre hesaplanır. Yazmazsanız temel miktar (1×) gösterilir.</p></div>` : '';
    return `${kendi}<div class="dg-gos">${list.map((o) => goKarti(o, alt, orders)).join('')}</div>`;
  }

  function goKarti(o, alt, orders) {
    const carpan = alt === 'ilan' ? durum.carpan : o.m;
    const bitis = alt === 'ilan' ? teklifBitisi(o) : teslimBitisi(o);
    const deger = goDegeri(o, carpan ?? 1, fiyat);
    const aralik = alt === 'ilan' ? carpanAraligi(orders, o.s) : null;
    const satirlar = (o.r || []).map(([kind, q, temel]) => {
      const n = gerekenMiktar(temel, carpan ?? 1);
      const p = fiyat(kind, q);
      return `<tr><td class="l">${oyun(urun(kind))}</td><td>Q${q}</td><td>${temel == null ? '<span class="dim">—</span>' : NUM.format(temel)}</td>
        <td>${n == null ? '<span class="dim">—</span>' : NUM.format(n)}</td><td>${p ? fmtPrice(p) : '<span class="dim">—</span>'}</td><td>${n != null && p ? usdK(n * p) : '<span class="dim">—</span>'}</td></tr>`;
    }).join('');
    const kv = (etiket, deger_, ek = '') => `<div><span>${etiket}</span><b>${deger_}</b>${ek}</div>`;
    return `<article class="dg-card dg-go">
      <header><div><h3>${oyun(projeAdi(o))}</h3><span class="dg-kurum">${oyun(kurumAdi(o))}</span></div><span class="dg-rozet ${alt}">${alt === 'ilan' ? 'Teklif toplanıyor' : 'Teslim sürüyor'}</span></header>
      <div class="dg-kv">
        ${kv('Sipariş no', `<span data-no-t>#${o.id}</span>`)}
        ${kv('Çıkış', `<span data-no-t>${esc(fmtDateTime(o.c))}</span>`)}
        ${kv(alt === 'ilan' ? 'Teklif bitişi' : 'Teslim bitişi', `<span data-no-t>${esc(fmtDateTime(bitis))}</span>`, `<span class="dg-kalan" data-bitis="${bitis}"></span>`)}
        ${kv('Teslim süresi', `${o.d ?? '—'} gün`)}
        ${o.s != null ? kv('Büyüklük', `<span data-no-t>${o.s}</span>`) : ''}
        ${kv(alt === 'ilan' ? 'Çarpan' : 'Verilen çarpan', carpan ? `<span data-no-t>${NUM.format(carpan)}×</span>` : '<span class="dim">—</span>')}
        ${o.e != null ? kv('Tahmini temel değer', `<span data-no-t>${usdK(o.e)}</span>`) : ''}
        ${kv(carpan ? 'Borsa değeri' : 'Borsa değeri (1×)', `<span data-no-t>${deger.toplam ? `${deger.eksik ? '≥ ' : ''}${usdK(deger.toplam)}` : '—'}</span>`)}
      </div>
      <div class="dg-wrap"><table><thead><tr><th class="l">Ürün</th><th>Kalite</th><th>Temel miktar</th><th>Gereken</th><th>Borsa fiyatı</th><th>Tutar ($)</th></tr></thead><tbody>${satirlar}</tbody></table></div>
      ${aralik ? `<p class="dg-note">${esc(`Aynı büyüklükte verilmiş çarpanlar: en az ${NUM.format(aralik.min)}×, ortanca ${NUM.format(aralik.orta)}×, en çok ${NUM.format(aralik.max)}×.`)}</p>` : ''}
    </article>`;
  }

  function goGecmis(list) {
    const q = durum.goAra.trim().toLocaleLowerCase(LOCALE);
    const sec = q ? list.filter((o) => [projeAdi(o), kurumAdi(o), o.n || '', ...(o.r || []).map(([k]) => urun(k))].some((s) => String(s).toLocaleLowerCase(LOCALE).includes(q)) || String(o.id) === q) : list;
    const sayfa = Math.max(1, Math.min(durum.goSayfa, Math.ceil(sec.length / SAYFA) || 1));
    durum.goSayfa = sayfa;
    const satir = (o) => `<tr><td class="l" data-no-t>#${o.id}</td><td class="l" data-no-t>${esc(tarih(o.c))}</td>
      <td class="l w">${oyun(projeAdi(o))}<small class="alt">${oyun(kurumAdi(o))}</small></td>
      <td class="l ww"><div class="dg-cips">${(o.r || []).map(([k, kq, temel]) => `<span class="dg-cip">${oyun(urun(k))} <b>Q${kq}</b>${temel != null && o.m ? ` <span data-no-t>${fmtCompact(gerekenMiktar(temel, o.m))}</span>` : ''}</span>`).join('')}</div></td>
      <td>${o.d ?? '—'} gün</td><td>${o.m ? `<span data-no-t>${NUM.format(o.m)}×</span>` : '<span class="dim">—</span>'}</td><td>${o.e != null ? `<span data-no-t>${usdK(o.e)}</span>` : '<span class="dim">—</span>'}</td></tr>`;
    return `<div class="dg-row"><input type="search" data-go-ara placeholder="Proje, kurum ya da ürün ara" aria-label="Proje, kurum ya da ürün ara" value="${esc(durum.goAra)}" autocomplete="off"></div>
      <p class="dg-note"><span>${esc(`${NUM.format(sec.length)} sipariş.`)}</span></p>
      <div class="dg-wrap"><table><thead><tr><th class="l">Sipariş no</th><th class="l">Çıkış</th><th class="l">Proje</th><th class="l">İstenen ürünler</th><th>Teslim süresi</th><th>Çarpan</th><th>Tahmini temel değer</th></tr></thead>
      <tbody>${sec.slice((sayfa - 1) * SAYFA, sayfa * SAYFA).map(satir).join('') || '<tr><td colspan="7" class="l dim">Eşleşen sipariş yok.</td></tr>'}</tbody></table></div>
      ${sayfalar('go', sayfa, Math.ceil(sec.length / SAYFA))}`;
  }

  // Ürün adları (seçim kutusu için): istenen ürünler + borsadaki tüm ürünler
  function urunAdlari(list) {
    const ids = new Set(list.map((x) => x.kind));
    for (const id of Object.keys(temel?.products || {})) ids.add(Number(id));
    return [...ids].map((id) => [id, urun(id)]);
  }

  function urunSecimi(list) {
    const adlar = urunAdlari(list);
    const sec = durum.urunSec;
    const chip = (id) => `<span class="dg-cip dg-sec-cip">${oyun(urun(id))} <span class="dim" data-no-t>#${id}</span> <button type="button" class="dg-x" data-urun-kaldir="${id}" aria-label="${esc(`${urun(id)} seçimini kaldır`)}">×</button></span>`;
    return `<div class="dg-card"><div class="dg-row">
        <input type="search" list="dg-urun-adlari" data-urun-ara placeholder="Ürün adı ya da ID yaz" aria-label="Ürün adı ya da ID" value="${esc(durum.urunAra)}" autocomplete="off">
        <button type="button" class="dg-btn" data-urun-ekle-btn>Ekle</button>
        <datalist id="dg-urun-adlari">${adlar.sort((a, b) => String(a[1]).localeCompare(String(b[1]), LOCALE)).map(([id, ad]) => `<option value="${esc(ad)}" label="#${id}"></option>`).join('')}</datalist>
      </div>
      <div class="dg-row dg-chips"><button type="button" class="dg-btn" data-urun-tumu aria-pressed="${!sec.length}">Tüm ürünler</button>${sec.map(chip).join('')}</div>
      ${durum.urunHata ? `<p class="dg-note down">${esc(durum.urunHata)}</p>` : '<p class="dg-note">Listeden bir satıra dokunarak, ürün adı ya da ID yazarak ürün seçin; birden fazla ürün seçebilirsiniz. × ile seçimi kaldırın.</p>'}</div>`;
  }

  function urunKarti(kind, orders, toplam) {
    const d = urunAyrintisi(orders, kind);
    const p0 = fiyat(kind, 0);
    let deger = 0;
    let degerliKalem = 0;
    const kalite = [...d.kaliteler].sort((a, b) => a[0] - b[0]).map(([q, x]) => {
      const p = fiyat(kind, q);
      const v = p ? x.miktar * p : null;
      if (v != null && x.miktarli) { deger += v; degerliKalem += x.miktarli; }
      return `<tr><td class="l"><b>Q${q}</b></td><td>${NUM.format(x.n)}</td><td>${x.miktarli ? NUM.format(x.miktar) : '<span class="dim">—</span>'}${x.miktarli && x.miktarli < x.n ? `<small class="alt">${esc(`${NUM.format(x.miktarli)} siparişten`)}</small>` : ''}</td>
        <td>${p ? fmtPrice(p) : '<span class="dim">—</span>'}</td><td>${v != null && x.miktarli ? usdK(v) : '<span class="dim">—</span>'}</td></tr>`;
    }).join('');
    const son = d.siparisler[0]?.c;
    const kv = (etiket, v) => `<div><span>${etiket}</span><b>${v}</b></div>`;
    const siparisSatiri = (o) => (o.r || []).filter((x) => String(x[0]) === String(kind)).map(([, q, t]) => `<tr><td class="l" data-no-t>#${o.id}</td><td class="l" data-no-t>${esc(tarih(o.c))}</td><td class="l w">${oyun(projeAdi(o))}</td><td><b>Q${q}</b></td>
        <td>${t == null ? '<span class="dim">—</span>' : NUM.format(t)}</td><td>${o.m ? `<span data-no-t>${NUM.format(o.m)}×</span>` : '<span class="dim">—</span>'}</td><td>${gerekenMiktar(t, o.m) == null ? '<span class="dim">—</span>' : NUM.format(gerekenMiktar(t, o.m))}</td></tr>`).join('');
    return `<article class="dg-card dg-go">
      <header><div><h3>${oyun(urun(kind))}</h3><span class="dg-kurum" data-no-t>ID ${kind}</span></div></header>
      <div class="dg-kv">
        ${kv('Sipariş', `<span data-no-t>${NUM.format(d.n)}</span>`)}
        ${kv('Pay', fmtShare(toplam ? d.n / toplam : null))}
        ${kv('Toplam gereken miktar', d.miktarliSiparis ? `<span data-no-t>${NUM.format(d.miktar)}</span>` : '<span class="dim">—</span>')}
        ${kv('Toplam borsa değeri', degerliKalem ? `<span data-no-t>${usdK(deger)}</span>` : '<span class="dim">—</span>')}
        ${kv('Borsa fiyatı (Q0)', p0 ? fmtPrice(p0) : '<span class="dim">—</span>')}
        ${kv('Son isteniş', `<span data-no-t>${esc(tarih(son))}</span>`)}
      </div>
      <p class="dg-note">Toplam gereken miktar, çarpanı bilinen (kazananı seçilmiş) siparişlerden hesaplanır; ilandaki ve eski siparişlerde miktar yoktur.</p>
      <div class="dg-wrap"><table><thead><tr><th class="l">Kalite</th><th>Sipariş</th><th>Toplam gereken</th><th>Borsa fiyatı</th><th>Değer ($)</th></tr></thead><tbody>${kalite || '<tr><td colspan="5" class="l dim">Bu ürün hiçbir siparişte istenmemiş.</td></tr>'}</tbody></table></div>
      ${d.n ? `<details><summary class="dg-note">${esc(`Bu ürünü isteyen siparişler (${NUM.format(d.n)})`)}</summary>
        <div class="dg-wrap"><table><thead><tr><th class="l">Sipariş no</th><th class="l">Çıkış</th><th class="l">Proje</th><th>Kalite</th><th>Temel miktar</th><th>Çarpan</th><th>Gereken</th></tr></thead><tbody>${d.siparisler.slice(0, 200).map(siparisSatiri).join('')}</tbody></table></div>
        ${d.n > 200 ? `<p class="dg-note">${esc(`En yeni 200 sipariş gösteriliyor.`)}</p>` : ''}</details>` : ''}
    </article>`;
  }

  function goUrunler(orders) {
    const list = urunTalepleri(orders);
    const toplam = Object.keys(orders || {}).length;
    const sec = durum.urunSec;
    let ozet = '';
    if (sec.length > 1) {
      const kumesi = new Set(sec.map(String));
      const siparis = Object.values(orders || {}).filter((o) => (o?.r || []).some((x) => kumesi.has(String(x[0]))));
      ozet = `<p class="dg-note">${esc(`${NUM.format(sec.length)} ürün seçili: en az birini isteyen ${NUM.format(siparis.length)} sipariş, toplam ${NUM.format(toplam)} sipariş içinde.`)}</p>`;
    }
    const tablo = `<div class="dg-wrap"><table><thead><tr><th class="l">Ürün</th><th>Sipariş</th><th>Pay</th><th class="l">Kaliteler</th><th>Son isteniş</th><th>Borsa fiyatı (Q0)</th></tr></thead><tbody>${list.map((x) => `<tr data-urun-ekle="${x.kind}" tabindex="0" role="button" aria-pressed="${sec.includes(x.kind)}"${sec.includes(x.kind) ? ' class="dg-sec"' : ''}>
        <td class="l">${oyun(urun(x.kind))}</td><td>${NUM.format(x.n)}</td><td>${fmtShare(toplam ? x.n / toplam : null)}</td>
        <td class="l"><div class="dg-cips">${[...x.kaliteler].sort((a, b) => a[0] - b[0]).map(([q, n]) => `<span class="dg-cip"><b>Q${q}</b> <span data-no-t>${NUM.format(n)}</span></span>`).join('')}</div></td>
        <td data-no-t>${esc(tarih(x.son))}</td><td>${fiyat(x.kind, 0) ? fmtPrice(fiyat(x.kind, 0)) : '<span class="dim">—</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    return `<p class="dg-note"><span>${esc(`Bugüne kadarki ${NUM.format(toplam)} siparişte her ürünün kaç kez istendiği.`)}</span> <span>Sık istenen ürünleri stokta tutmak teklif şansını artırır.</span></p>
      ${urunSecimi(list)}
      ${ozet}
      ${sec.map((k) => urunKarti(k, orders, toplam)).join('')}
      <details data-urun-liste${!sec.length || durum.urunAcik ? ' open' : ''}><summary class="dg-note">${esc(`Tüm ürünler (${NUM.format(list.length)})`)}</summary>${tablo}</details>`;
  }

  // Şirketlerin GO seviyesi (oyunun şirket profilindeki governmentOrderTierIndex; şirket binaları taramasından)
  function goSeviyeKarti(sb) {
    const satir = Object.entries(sb?.go || {}).map(([k, n]) => [Number(k), n]).sort((a, b) => b[0] - a[0]);
    if (!satir.length) return '';
    const toplam = satir.reduce((a, x) => a + x[1], 0);
    return `<section class="dg-card"><h2>Şirketlerin GO seviyesi</h2>
      <p class="dg-note">Oyun her şirkete bir GO seviyesi verir; teklifin seviyesi ekipteki en büyük şirketin seviyesidir ve istenen miktarı belirler.</p>
      <div class="dg-wrap"><table><thead><tr><th class="l">GO seviyesi</th><th>Şirket</th><th>Pay</th></tr></thead><tbody>${satir.map(([k, n]) => `<tr><td class="l" data-no-t>T${k}</td><td>${NUM.format(n)}</td><td>${fmtShare(n / toplam)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  // ---- Binalar ----
  let binaVeri = null;
  async function binaCiz(my) {
    const [get] = await Promise.all([oku([yollar.bina(), yollar.ihale(), yollar.evre(), yollar.sabit(), yollar.sb()]), temelOku()]);
    if (!gecerli(my)) return;
    binaVeri = { bina: get(yollar.bina()), ihale: get(yollar.ihale()), evre: get(yollar.evre()), sabit: get(yollar.sabit()), sb: get(yollar.sb()) };
    binaBoya();
  }
  function binaBoya() {
    const { bina, ihale, evre, sabit, sb } = binaVeri;
    if (!bina && !ihale) { box.innerHTML = `<h1>Binalar</h1>${veriYok}`; return; }
    const days = (evre?.days || []).filter((d) => d[3] > 0);
    const sonGun = days.at(-1);
    const toplam = bina?.total ?? sonGun?.[3] ?? null;
    const dunGun = bina?.date ? Object.keys(bina.hist || {}).map(Number).filter((d) => d < bina.date).sort((a, b) => b - a)[0] : null;
    const dunToplam = dunGun ? Object.values(bina.hist[dunGun]).reduce((a, x) => a + x, 0) : null;
    const bugunToplam = bina?.counts ? Object.values(bina.counts).reduce((a, x) => a + x[0], 0) : null;
    const toplamFark = dunToplam && bugunToplam ? bugunToplam - dunToplam : null;
    const aktif = evre?.realm?.activeCompanies ?? sonGun?.[1] ?? null;
    const rows = binaSatirlari(bina, sabit, temel?.products);
    const [k, yon] = durum.binaSira;
    rows.sort((a, b) => ((a[k] ?? -Infinity) - (b[k] ?? -Infinity)) * yon || b.n - a.n);
    const th = (key, t, cls = '') => `<th data-sort="bina:${key}" class="${cls}" ${key === k ? `aria-sort="${yon > 0 ? 'ascending' : 'descending'}"` : ''}>${t}</th>`;
    const aralik = durum.binaAralik;
    const sinir = aralik ? yyyymmdd(Date.now() - aralik * DAY) : 0;
    const grafik = days.length > 1 ? G.cizgiGrafik([{ ad: 'Toplam bina', renk: G.RENKLER[0], noktalar: aykiriAt(days.map((d) => [d[0], d[3]])).filter((d) => d[0] >= sinir) }],
      { bicim: (v) => fmtCompact(v), oku: (v) => NUM.format(v), doldur: true, ad: 'Toplam bina' }) : '';
    box.innerHTML = `<h1>Binalar</h1>
      <div class="dg-tiles">
        <div class="dg-tile"><span>Toplam bina</span><b data-no-t>${toplam == null ? '—' : NUM.format(toplam)}</b>${toplamFark != null ? `<small><span class="${tone(toplamFark)}" data-no-t>${signed(toplamFark)}</span> · dünden</small>` : ''}</div>
        <div class="dg-tile"><span>Aktif şirket</span><b data-no-t>${aktif == null ? '—' : NUM.format(aktif)}</b></div>
        <div class="dg-tile"><span>Şirket başına bina</span><b data-no-t>${toplam && aktif ? (toplam / aktif).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) : '—'}</b></div>
        <div class="dg-tile"><span>Açık artırmadaki bina</span><b data-no-t>${ihale?.list ? NUM.format(ihale.list.length) : '—'}</b></div>
      </div>
      ${grafik ? `<section class="dg-card"><h2>Realmdaki toplam bina</h2>
        <div class="dg-seg" role="group" aria-label="Aralık">${ARALIKLAR.map(([v, t]) => `<button type="button" data-bina-aralik="${v}" aria-pressed="${v === aralik}">${t}</button>`).join('')}</div>
        ${grafik}<p class="dg-note">Günlük realm özeti (Simcotools). Tüm şirketlerin bina sayısı toplamıdır; Simcotools'ta yarım kalmış günler gösterilmez.</p></section>` : ''}
      ${rows.length ? `<section class="dg-card"><h2>Bina türleri</h2>
        <p class="dg-note">Realmdaki her bina türünün sayısı. Değişim sütunları Ekim 2026'dan itibaren biriken kayıtlardan hesaplanır. Sütun başlığına dokunarak sıralayın.</p>
        <div class="dg-wrap"><table><thead><tr>${th('harf', 'Bina', 'l')}${th('kat', 'Kategori', 'l')}${th('n', 'Sayı')}${th('pay', 'Pay')}${th('f1', 'Dünden')}${th('f7', '7 gün')}${th('cu', 'Maliyet birimi')}${th('sure', 'Yapım süresi')}<th class="l">Ürünler</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="l">${oyun(binaAdi(r.harf))}</td><td class="l">${kategoriAdi(r.kat)}</td><td>${NUM.format(r.n)}</td><td>${fmtShare(r.pay)}</td>
          <td class="${tone(r.f1)}">${r.f1 == null ? '<span class="dim">—</span>' : signed(r.f1)}</td><td class="${tone(r.f7)}">${r.f7 == null ? '<span class="dim">—</span>' : signed(r.f7)}</td>
          <td>${r.cu == null ? '—' : NUM.format(r.cu)}</td><td>${sureMetni(r.sure)}</td>
          <td class="l ww"><div class="dg-cips">${r.urunler.slice(0, 8).map((id) => `<span class="dg-cip">${oyun(urun(id))}</span>`).join('')}${r.urunler.length > 8 ? `<span class="dg-cip" data-no-t>+${r.urunler.length - 8}</span>` : ''}</div></td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${sirketBinaKarti(sb)}
      ${ihaleKarti(ihale)}
      ${botNotu(bina?.t ?? ihale?.t)}`;
  }

  // Şirketlerin binaları: botun günlük taramasından bina türü başına sahip şirket, toplam seviye ve en büyükler
  function sirketBinaKarti(sb) {
    const turler = sbTurleri(sb);
    if (!turler.length) return '';
    const sec = turler.find((x) => x.harf === durum.sbTur) || turler[0];
    const top = sb.top?.[sec.harf] || [];
    return `<section class="dg-card" data-sb><h2>Şirketlerin binaları</h2>
      <p class="dg-note">Bina türüne dokunun: en büyük sahipleri görün.</p>
      <div class="dg-wrap"><table><thead><tr><th class="l">Bina</th><th>Sahip şirket</th><th>Bina sayısı</th><th>Toplam seviye</th><th>Ortalama seviye</th><th>En yüksek seviye</th></tr></thead>
      <tbody>${turler.map((x) => `<tr data-sb-tur="${esc(x.harf)}" tabindex="0" role="button" aria-pressed="${x.harf === sec.harf}"${x.harf === sec.harf ? ' class="dg-sec"' : ''}><td class="l">${oyun(binaAdi(x.harf))}</td><td>${NUM.format(x.sirket)}</td><td>${NUM.format(x.bina)}</td><td>${NUM.format(x.seviye)}</td>
        <td>${(x.seviye / x.bina).toLocaleString(LOCALE, { maximumFractionDigits: 1 })}</td><td>${NUM.format(x.enYuksek)}</td></tr>`).join('')}</tbody></table></div>
      <h3>${oyun(binaAdi(sec.harf))}</h3>
      <div class="dg-wrap"><table><thead><tr><th class="l">Sıra</th><th class="l">Şirket</th><th>Toplam seviye</th><th>Bina sayısı</th></tr></thead><tbody>${top.map((t, i) => `<tr><td class="l">${i + 1}</td><td class="l">${oyun(t[1])}<small class="alt" data-no-t>ID ${t[0]}</small></td><td>${NUM.format(t[2])}</td><td>${NUM.format(t[3])}</td></tr>`).join('')}</tbody></table></div>
    </section>`;
  }

  const IHALE_SIRA = { kapanis: 6, teklif: 4, seviye: 2, garanti: 5 };
  function ihaleKarti(ihale) {
    const list = ihale?.list || [];
    if (!list.length) return '';
    const harfler = [...new Set(list.map((a) => a[1]))].sort((a, b) => binaAdi(a).localeCompare(binaAdi(b), LOCALE));
    const sec = durum.ihaleBina ? list.filter((a) => a[1] === durum.ihaleBina) : list;
    const [k, yon] = durum.ihaleSira;
    const col = IHALE_SIRA[k];
    const sirali = [...sec].sort((a, b) => ((a[col] ?? 0) - (b[col] ?? 0)) * yon || a[0] - b[0]);
    const sayfa = Math.max(1, Math.min(durum.ihaleSayfa, Math.ceil(sirali.length / SAYFA) || 1));
    durum.ihaleSayfa = sayfa;
    const th = (key, t) => `<th data-sort="ihale:${key}" ${key === k ? `aria-sort="${yon > 0 ? 'ascending' : 'descending'}"` : ''}>${t}</th>`;
    const now = Date.now();
    return `<section class="dg-card"><h2>Bina açık artırmaları</h2>
      <p class="dg-note">Oyunun bina açık artırmasında şu an satıştaki binalar. Garanti tutarı oyunun verdiği değerdir (en az teklifin %80'i).</p>
      <div class="dg-row"><select data-ihale-bina aria-label="Bina türü"><option value="">${esc(`Tüm binalar (${NUM.format(list.length)})`)}</option>${harfler.map((h) => `<option data-no-t value="${esc(h)}" ${h === durum.ihaleBina ? 'selected' : ''}>${esc(binaAdi(h))} (${NUM.format(list.filter((a) => a[1] === h).length)})</option>`).join('')}</select></div>
      <div class="dg-wrap"><table><thead><tr><th class="l">Bina</th>${th('seviye', 'Seviye')}<th>Robot</th>${th('teklif', 'En az teklif')}${th('garanti', 'Garanti tutarı')}${th('kapanis', 'Kapanış zamanı')}<th class="l">Bolluk</th><th class="l">Satıcı</th></tr></thead>
      <tbody>${sirali.slice((sayfa - 1) * SAYFA, sayfa * SAYFA).map((a) => `<tr><td class="l">${oyun(binaAdi(a[1]))}${a[8] ? ' <span class="dg-cip">Öne çıkan</span>' : ''}</td><td>${a[2] ?? '—'}</td><td>${a[3] ?? '—'}</td>
        <td data-no-t>${usd(a[4])}</td><td data-no-t>${usd(a[5])}</td><td><span data-no-t>${esc(fmtDateTime(a[6]))}</span>${a[6] > now ? `<small class="alt dg-kalan" data-bitis="${a[6]}"></small>` : ''}</td>
        <td class="l"><div class="dg-cips">${(a[11] || []).map(([kind, lv]) => `<span class="dg-cip">${oyun(urun(kind))} <b data-no-t>${bollukEsigi(lv) != null ? `≥${bollukEsigi(lv)}%` : esc(lv)}</b></span>`).join('') || '<span class="dim">—</span>'}</div></td>
        <td class="l">${oyun(a[10])}<small class="alt" data-no-t>ID ${a[9]}</small></td></tr>`).join('')}</tbody></table></div>
      ${sayfalar('ihale', sayfa, Math.ceil(sirali.length / SAYFA))}</section>`;
  }

  // ---- Ekonomik Evreler ----
  let evreVeri = null;
  async function evreCiz(my) {
    const [get] = await Promise.all([oku([yollar.evre()]), temelOku()]);
    if (!gecerli(my)) return;
    evreVeri = get(yollar.evre());
    evreBoya();
  }
  const METRIK = [[1, 'Aktif şirket', (v) => NUM.format(v), (v) => fmtCompact(v)], [2, 'Toplam şirket değeri', usd, usdK], [3, 'Toplam bina', (v) => NUM.format(v), (v) => fmtCompact(v)], [4, 'Satılan bono', usd, usdK]];
  function evreBoya() {
    const e = evreVeri;
    if (!e) { box.innerHTML = `<h1>Ekonomik Evreler</h1>${veriYok}`; return; }
    const now = Date.now();
    const oz = evreOzeti(e.ranges, now);
    const s = oz.simdiki;
    const sNo = s ? EVRE_NO[s[0]] : null;
    const gecmis = [...(e.ranges || [])].reverse();
    // Zaman çizelgesi: son 52 hafta (ya da tümü)
    const tumu = durum.evreAralik === 1;
    const bas = tumu ? (e.ranges?.[0]?.[1] ?? now) : now - 365 * DAY;
    const bit = Math.max(now, s?.[2] || now);
    const parcalar = (e.ranges || []).filter((r) => (r[2] ?? bit) > bas).map((r) => {
      const a = Math.max(r[1], bas); const b = Math.min(r[2] ?? bit, bit);
      return `<i style="flex:${Math.max(0, b - a)} 0 0;background:${EVRE_RENK[EVRE_NO[r[0]]]}" title="${esc(EVRELER[EVRE_NO[r[0]]])} · ${esc(tarih(r[1]))} – ${esc(tarih(r[2]))}"></i>`;
    }).join('');
    const [mi, mad, mOku, mEksen] = METRIK.find((m) => m[0] === durum.evreMetrik) || METRIK[0];
    const ozetSinir = durum.ozetAralik ? yyyymmdd(now - durum.ozetAralik * DAY) : 0;
    const noktalar = aykiriAt((e.days || []).map((d) => [d[0], d[mi]])).filter((d) => d[0] >= ozetSinir);
    const grafik = noktalar.length > 1 ? G.cizgiGrafik([{ ad: mad, renk: G.RENKLER[0], noktalar }], { bicim: mEksen, oku: mOku, doldur: true, ad: mad }) : '';
    const aktifOlay = (e.events || []).filter((x) => x[4] > now && x[3] <= now);
    const gelecekOlay = (e.events || []).filter((x) => x[3] > now);
    const eskiOlay = (e.events || []).filter((x) => x[4] <= now);
    const sayfa = Math.max(1, Math.min(durum.olaySayfa, Math.ceil(eskiOlay.length / SAYFA) || 1));
    durum.olaySayfa = sayfa;
    const olaySatir = (x) => `<tr><td class="l">${oyun(urun(x[1]))}</td><td class="l">${oyun(binaAdi(x[5]))}</td><td class="${tone(x[2])}" data-no-t>${x[2] > 0 ? '+' : '−'}${Math.abs(x[2])}%</td><td data-no-t>${esc(tarih(x[3]))}</td><td data-no-t>${esc(tarih(x[4]))}</td></tr>`;
    const olayTablo = (list) => `<div class="dg-wrap"><table><thead><tr><th class="l">Ürün</th><th class="l">Bina</th><th>Üretim hızı</th><th>Başlangıç</th><th>Bitiş</th></tr></thead><tbody>${list.map(olaySatir).join('')}</tbody></table></div>`;
    box.innerHTML = `<h1>Ekonomik Evreler</h1>
      <section class="dg-card">
        <span class="dg-note">Şu anki evre</span>
        <div class="dg-evre" style="color:${sNo == null ? 'var(--text)' : EVRE_RENK[sNo]}">${s ? EVRELER[sNo] : '—'}</div>
        ${s ? `<div class="dg-kv"><div><span>Başlangıç</span><b data-no-t>${esc(fmtDateTime(s[1]))}</b></div><div><span>Bitiş</span><b data-no-t>${esc(fmtDateTime(s[2]))}</b><span class="dg-kalan" data-bitis="${s[2]}"></span></div>
          <div><span>Süre</span><b>${Math.round((s[2] - s[1]) / (7 * DAY))} hafta</b></div></div>` : ''}
        <p class="dg-note">Evre cuma 18:00'de (TR saati) değişebilir. Evre maaşları, üretim hızını ve perakende talebini etkiler; Kâr Hesaplayıcı güncel evreyi kendiliğinden kullanır.</p>
      </section>
      <section class="dg-card"><h2>Evre geçmişi</h2>
        <div class="dg-seg" role="group" aria-label="Aralık"><button type="button" data-evre-aralik="0" aria-pressed="${!tumu}">Son 1 yıl</button><button type="button" data-evre-aralik="1" aria-pressed="${tumu}">Tüm zamanlar</button></div>
        <div class="dg-bar" role="img" aria-label="Evre zaman çizelgesi">${parcalar}</div>
        <div class="dg-legend">${EVRELER.map((t, i) => `<span><i style="background:${EVRE_RENK[i]}"></i>${t}</span>`).join('')}</div>
        <div class="dg-wrap"><table><thead><tr><th class="l">Evre</th><th>Kaç kez</th><th>Toplam hafta</th><th>Zaman payı</th><th>Ortalama süre</th></tr></thead><tbody>${oz.istatistik.map((x) => `<tr><td class="l"><i class="dg-dot" style="background:${EVRE_RENK[x.evre]}"></i>${EVRELER[x.evre]}</td>
          <td>${NUM.format(x.adet)}</td><td>${NUM.format(x.hafta)}</td><td>${fmtShare(x.pay)}</td><td>${x.ort == null ? '—' : `${x.ort.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} hafta`}</td></tr>`).join('')}</tbody></table></div>
        <details><summary class="dg-note">${esc(`Tüm evreler (${NUM.format(gecmis.length)})`)}</summary>
        <div class="dg-wrap"><table><thead><tr><th class="l">Evre</th><th>Başlangıç</th><th>Bitiş</th><th>Süre</th></tr></thead><tbody>${gecmis.map((r) => `<tr><td class="l"><i class="dg-dot" style="background:${EVRE_RENK[EVRE_NO[r[0]]]}"></i>${EVRELER[EVRE_NO[r[0]]]}</td>
          <td data-no-t>${esc(tarih(r[1]))}</td><td data-no-t>${esc(tarih(r[2]))}</td><td>${Math.round(((r[2] ?? now) - r[1]) / (7 * DAY))} hafta</td></tr>`).join('')}</tbody></table></div></details>
      </section>
      ${grafik ? `<section class="dg-card"><h2>Realm özeti</h2>
        <div class="dg-seg" role="group" aria-label="Ölçüt">${METRIK.map(([i, t]) => `<button type="button" data-evre-metrik="${i}" aria-pressed="${i === mi}">${t}</button>`).join('')}</div>
        <div class="dg-seg" role="group" aria-label="Aralık">${ARALIKLAR.map(([v, t]) => `<button type="button" data-ozet-aralik="${v}" aria-pressed="${v === durum.ozetAralik}">${t}</button>`).join('')}</div>
        ${grafik}<p class="dg-note">Simcotools'un günlük realm özeti (Eylül 2022'den bu yana). Yarım kalmış günler gösterilmez.</p></section>` : ''}
      <section class="dg-card"><h2>Üretim olayları</h2>
        <p class="dg-note">Oyunun rastgele olayları bir ürünün üretim hızını üç hafta boyunca artırır ya da azaltır. Kâr Hesaplayıcı etkin olayları hesaba katar.</p>
        ${aktifOlay.length ? olayTablo(aktifOlay) : '<p class="dg-note">Şu an etkin olay yok.</p>'}
        ${gelecekOlay.length ? `<h3>Yaklaşan</h3>${olayTablo(gelecekOlay)}` : ''}
        ${eskiOlay.length ? `<details><summary class="dg-note">${esc(`Geçmiş olaylar (${NUM.format(eskiOlay.length)})`)}</summary>${olayTablo(eskiOlay.slice((sayfa - 1) * SAYFA, sayfa * SAYFA))}${sayfalar('olay', sayfa, Math.ceil(eskiOlay.length / SAYFA))}</details>` : ''}
      </section>
      ${(e.contests || []).length ? `<section class="dg-card"><h2>Yarışmalar</h2>
        <div class="dg-wrap"><table><thead><tr><th class="l">Yarışma</th><th class="l">Ürün</th><th>Başlangıç</th><th>Bitiş</th></tr></thead><tbody>${e.contests.map((c) => `<tr><td class="l w">${oyun(c[1])}${c[4] > now ? ` <span class="dg-cip">${c[3] > now ? 'Yaklaşan' : 'Sürüyor'}</span>` : ''}</td><td class="l">${oyun(urun(c[2]))}</td><td data-no-t>${esc(tarih(c[3]))}</td><td data-no-t>${esc(tarih(c[4]))}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${botNotu(e.t)}`;
  }

  // ---- Sertifikalar ----
  let sertVeri = null;
  async function sertCiz(my) {
    const paths = [yollar.sert(), ...(rota.tur != null ? [yollar.tur(rota.tur)] : [])];
    const [get] = await Promise.all([oku(paths), temelOku()]);
    if (!gecerli(my)) return;
    sertVeri = { sert: get(yollar.sert()), tur: rota.tur != null ? get(yollar.tur(rota.tur)) : null };
    if (rota.tur != null) turBoya(); else sertBoya();
  }
  const SERT_SIRA = { rar: (x) => x.rar ?? Infinity, cnt: (x) => x.cnt ?? -1, total: (x) => x.total ?? -1, ad: null };
  function sertBoya() {
    const s = sertVeri.sert;
    if (!s) { box.innerHTML = `<h1>Sertifikalar</h1>${veriYok}`; return; }
    const turler = Object.entries(s.kinds || {}).map(([k, v]) => ({ tur: Number(k), ...v }));
    const [k, yon] = durum.sertSira;
    turler.sort(k === 'ad' ? (a, b) => sertAdi(a.tur).localeCompare(sertAdi(b.tur), LOCALE) * yon : (a, b) => (SERT_SIRA[k](a) - SERT_SIRA[k](b)) * yon || a.tur - b.tur);
    const th = (key, t, cls = '') => `<th data-sort="sert:${key}" class="${cls}" ${key === k ? `aria-sort="${yon > 0 ? 'ascending' : 'descending'}"` : ''}>${t}</th>`;
    box.innerHTML = `<h1>Sertifikalar</h1>
      <p class="dg-note">Oyunun her sertifika türü: kaç şirkette olduğu, toplam kaç kez verildiği ve nadirliği (şirketlerin yüzde kaçında var). Kazananları görmek için türe dokunun.</p>
      <div class="dg-wrap"><table><thead><tr>${th('ad', 'Sertifika', 'l')}${th('cnt', 'Şirket')}${th('total', 'Verilme')}${th('rar', 'Nadirlik')}</tr></thead><tbody>${turler.map((x) => `<tr data-git="#diger/sertifika/${x.tur}" tabindex="0" role="link">
        <td class="l w">${oyun(sertAdi(x.tur))}<small class="alt" data-no-t>#${x.tur}</small></td><td>${x.cnt == null ? '—' : NUM.format(x.cnt)}</td><td>${x.total == null ? '—' : NUM.format(x.total)}</td>
        <td data-no-t>${nadirlik(x.rar)}</td></tr>`).join('')}</tbody></table></div>
      ${(s.latest || []).length ? `<section class="dg-card"><h2>Son verilen sertifikalar</h2><div class="dg-wrap"><table><thead><tr><th class="l">Tarih</th><th class="l">Sertifika</th><th class="l">Şirket</th></tr></thead><tbody>${s.latest.slice(0, 40).map((r) => `<tr data-git="#diger/sertifika/${r[3]}" tabindex="0" role="link">
        <td class="l" data-no-t>${esc(tarih(r[5]))}</td><td class="l w">${oyun(sertAdi(r[3]))}</td><td class="l">${oyun(r[2])}<small class="alt" data-no-t>ID ${r[1]}</small></td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${botNotu(s.t)}`;
  }

  const topTablo = (rows, bas) => `<div class="dg-wrap"><table><thead><tr><th class="l">Sıra</th><th class="l">Şirket</th><th>Adet</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td class="l">${bas + i + 1}</td><td class="l">${oyun(r[1])}<small class="alt" data-no-t>ID ${r[0]}</small></td><td>${NUM.format(r[2])}</td></tr>`).join('')}</tbody></table></div>`;
  function turBoya() {
    const { sert, tur: doc } = sertVeri;
    const tur = rota.tur;
    const bilgi = sert?.kinds?.[tur] || {};
    const geri = '<p class="dg-note"><a href="#diger/sertifika">‹ Tüm sertifikalar</a></p>';
    if (!doc) { box.innerHTML = `<h1>${oyun(sertAdi(tur))}</h1>${geri}${veriYok}`; return; }
    const urunlu = (doc.rows || []).some((r) => r[4] != null);
    const urunler = urunlu ? [...new Set(doc.rows.map((r) => r[4]).filter((x) => x != null))].sort((a, b) => urun(a).localeCompare(urun(b), LOCALE)) : [];
    const q = durum.sertAra.trim().toLocaleLowerCase(LOCALE);
    const sec = (doc.rows || []).filter((r) => (!durum.sertUrun || String(r[4]) === durum.sertUrun) && (!q || r[2].toLocaleLowerCase(LOCALE).includes(q) || String(r[1]) === q));
    const sayfa = Math.max(1, Math.min(durum.sertSayfa, Math.ceil(sec.length / SAYFA) || 1));
    durum.sertSayfa = sayfa;
    const para = doc.vk === 'governmentOrderRevenue';
    const deger = (v) => (v == null ? '<span class="dim">—</span>' : `<span data-no-t>${para ? usd(v) : doc.vk === 'yearStarted' || doc.vk === 'contestId' ? esc(v) : NUM.format(v)}</span>`);
    box.innerHTML = `<h1>${oyun(sertAdi(tur))}</h1>${geri}
      <div class="dg-tiles">
        <div class="dg-tile"><span>Şirket</span><b data-no-t>${bilgi.cnt == null ? '—' : NUM.format(bilgi.cnt)}</b></div>
        <div class="dg-tile"><span>Verilme</span><b data-no-t>${NUM.format(doc.total ?? sec.length)}</b></div>
        <div class="dg-tile"><span>Nadirlik</span><b data-no-t>${nadirlik(bilgi.rar)}</b></div>
      </div>
      ${(doc.top || []).length ? `<section class="dg-card"><h2>En çok toplayanlar</h2>${topTablo(doc.top.slice(0, 10), 0)}
        ${doc.top.length > 10 ? `<details><summary class="dg-note">${esc(`İlk ${NUM.format(doc.top.length)}`)}</summary>${topTablo(doc.top.slice(10), 10)}</details>` : ''}</section>` : ''}
      <section class="dg-card"><h2>Kazananlar</h2>
        <div class="dg-row">${urunlu ? `<select data-sert-urun aria-label="Ürün"><option value="">Tüm ürünler</option>${urunler.map((id) => `<option data-no-t value="${id}" ${String(id) === durum.sertUrun ? 'selected' : ''}>${esc(urun(id))}</option>`).join('')}</select>` : ''}
          <input type="search" data-sert-ara placeholder="Şirket adı ya da numarası ara" aria-label="Şirket ara" value="${esc(durum.sertAra)}" autocomplete="off"></div>
        ${doc.full ? '' : `<p class="dg-note">${esc(`Bu tür çok sık verildiği için yalnız son ${NUM.format(doc.rows?.length || 0)} kayıt gösterilir.`)}</p>`}
        <div class="dg-wrap"><table><thead><tr><th class="l">Dönem</th><th class="l">Şirket</th>${urunlu ? '<th class="l">Ürün</th>' : ''}${doc.vk ? `<th>${degerAdi(doc.vk)}</th>` : ''}<th>Tarih</th></tr></thead>
        <tbody>${sec.slice((sayfa - 1) * SAYFA, sayfa * SAYFA).map((r) => `<tr><td class="l">${esc(donemMetni(r[3]) || '—')}</td><td class="l">${oyun(r[2])}<small class="alt" data-no-t>ID ${r[1]}</small></td>
          ${urunlu ? `<td class="l">${r[4] == null ? '—' : oyun(urun(r[4]))}</td>` : ''}${doc.vk ? `<td>${deger(r[5])}</td>` : ''}<td data-no-t>${esc(tarih(r[6]))}</td></tr>`).join('') || '<tr><td colspan="5" class="l dim">Eşleşen kayıt yok.</td></tr>'}</tbody></table></div>
        ${sayfalar('sert', sayfa, Math.ceil(sec.length / SAYFA))}</section>
      ${botNotu(doc.t)}`;
  }

  // ---- Ortak ----
  function sayfalar(ad, sayfa, toplam) {
    if (!(toplam > 1)) return '';
    return `<div class="dg-pager"><button type="button" data-sayfa="${ad}:-1" ${sayfa <= 1 ? 'disabled' : ''}>‹ Önceki</button><span data-no-t>${sayfa} / ${toplam}</span><button type="button" data-sayfa="${ad}:1" ${sayfa >= toplam ? 'disabled' : ''}>Sonraki ›</button></div>`;
  }
  function yenidenBoya() {
    if (rota.tab === 'go' && goVeri) goBoya();
    else if (rota.tab === 'bina' && binaVeri) binaBoya();
    else if (rota.tab === 'evre' && evreVeri) evreBoya();
    else if (rota.tab === 'sertifika' && sertVeri) { if (rota.tur != null) turBoya(); else sertBoya(); }
    box.querySelectorAll('.sg-kutu').forEach(G.grafikBagla);
    sayac();
  }
  // Arama kutusunda yazarken odak kaybolmasın: yeniden çizdikten sonra kutuya geri dönülür
  function odakla(sec) {
    const el = box.querySelector(sec);
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* sayı kutusu */ }
  }

  box.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) {
      const [ad, key] = s.dataset.sort.split(':');
      const alan = { bina: 'binaSira', ihale: 'ihaleSira', sert: 'sertSira' }[ad];
      const [k, yon] = durum[alan];
      durum[alan] = [key, k === key ? -yon : (ad === 'ihale' && key === 'kapanis') || (ad === 'sert' && (key === 'rar' || key === 'ad')) || (ad === 'bina' && (key === 'harf' || key === 'kat')) ? 1 : -1];
      if (ad === 'ihale') durum.ihaleSayfa = 1;
      return yenidenBoya();
    }
    const p = e.target.closest('[data-sayfa]');
    if (p) {
      const [ad, d] = p.dataset.sayfa.split(':');
      const alan = { go: 'goSayfa', ihale: 'ihaleSayfa', olay: 'olaySayfa', sert: 'sertSayfa' }[ad];
      durum[alan] += Number(d);
      return yenidenBoya();
    }
    const ba = e.target.closest('[data-bina-aralik]');
    if (ba) { durum.binaAralik = Number(ba.dataset.binaAralik); return yenidenBoya(); }
    const ea = e.target.closest('[data-evre-aralik]');
    if (ea) { durum.evreAralik = Number(ea.dataset.evreAralik); return yenidenBoya(); }
    const oa = e.target.closest('[data-ozet-aralik]');
    if (oa) { durum.ozetAralik = Number(oa.dataset.ozetAralik); return yenidenBoya(); }
    const em = e.target.closest('[data-evre-metrik]');
    if (em) { durum.evreMetrik = Number(em.dataset.evreMetrik); return yenidenBoya(); }
    const ue = e.target.closest('[data-urun-ekle]');
    if (ue) { urunEkle(Number(ue.dataset.urunEkle)); return undefined; }
    if (e.target.closest('[data-urun-ekle-btn]')) { urunYaz(box.querySelector('[data-urun-ara]')?.value); return undefined; }
    const uk = e.target.closest('[data-urun-kaldir]');
    if (uk) { urunKaldir(Number(uk.dataset.urunKaldir)); return undefined; }
    if (e.target.closest('[data-urun-tumu]')) { durum.urunSec = []; durum.urunHata = ''; durum.urunAcik = true; return yenidenBoya(); }
    const sbt = e.target.closest('[data-sb-tur]');
    if (sbt) { durum.sbTur = sbt.dataset.sbTur; yenidenBoya(); box.querySelector('[data-sb] h3')?.scrollIntoView({ block: 'nearest' }); return undefined; }
    const git = e.target.closest('[data-git]');
    if (git && !e.target.closest('a')) location.hash = git.dataset.git;
    return undefined;
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches?.('[data-urun-ara]')) { e.preventDefault(); urunYaz(e.target.value); return; }
    const ue = e.target.closest?.('[data-urun-ekle]');
    if (ue && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ue.click(); return; }
    const sbt = e.target.closest?.('[data-sb-tur]');
    if (sbt && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sbt.click(); return; }
    const git = e.target.closest?.('[data-git]');
    if (git && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = git.dataset.git; }
  });
  box.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-urun-ara]')) durum.urunAra = t.value;
    else if (t.matches('[data-go-ara]')) { durum.goAra = t.value; durum.goSayfa = 1; yenidenBoya(); odakla('[data-go-ara]'); }
    else if (t.matches('[data-sert-ara]')) { durum.sertAra = t.value; durum.sertSayfa = 1; yenidenBoya(); odakla('[data-sert-ara]'); }
    else if (t.matches('[data-carpan]')) {
      const v = Number(t.value);
      durum.carpan = v > 0 ? v : null;
      carpanYaz(durum.carpan);
      yenidenBoya();
      odakla('[data-carpan]');
    }
  });
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-urun-ara]')) urunYaz(t.value);
    else if (t.matches('[data-ihale-bina]')) { durum.ihaleBina = t.value; durum.ihaleSayfa = 1; yenidenBoya(); }
    else if (t.matches('[data-sert-urun]')) { durum.sertUrun = t.value; durum.sertSayfa = 1; yenidenBoya(); }
  });

  box.addEventListener('toggle', (e) => { if (e.target.matches?.('[data-urun-liste]')) durum.urunAcik = e.target.open; }, true);

  // Ürün seçimi: ID ya da adla eklenir, × ile kaldırılır. Seçim varken liste kapanır, boşalınca açılır.
  function urunEkle(kind) {
    if (!durum.urunSec.includes(kind)) {
      if (!durum.urunSec.length) durum.urunAcik = false;
      durum.urunSec = [...durum.urunSec, kind];
    }
    durum.urunAra = ''; durum.urunHata = '';
    yenidenBoya();
    box.querySelector('[data-urun-ara]')?.focus();
  }
  function urunKaldir(kind) {
    durum.urunSec = durum.urunSec.filter((k) => k !== kind);
    if (!durum.urunSec.length) durum.urunAcik = true;
    durum.urunHata = '';
    yenidenBoya();
  }
  function urunYaz(metin) {
    if (!String(metin ?? '').trim()) return;
    const adlar = urunAdlari(urunTalepleri(goVeri?.doc?.orders));
    const id = urunBul(metin, adlar);
    if (id == null) {
      durum.urunAra = String(metin);
      durum.urunHata = `"${String(metin).trim()}" ile eşleşen tek bir ürün bulunamadı. Tam adı ya da ID'yi yazın.`;
      yenidenBoya();
      odakla('[data-urun-ara]');
      return;
    }
    urunEkle(id);
  }

  function onHash() {
    if (location.hash.slice(1).split('/')[0] !== 'diger') return;
    const eski = rota;
    rota = digerRota(location.hash);
    if (rota.go) durum.goAlt = rota.go;
    if (rota.tab !== eski.tab || rota.tur !== eski.tur) {
      durum.sertUrun = ''; durum.sertAra = ''; durum.sertSayfa = 1;
      ciz();
    } else yenidenBoya();
  }
  window.addEventListener('hashchange', onHash);
  if (rota.go) durum.goAlt = rota.go;
  ciz();

  return {
    setRealm(next) {
      if (next === realm) return;
      realm = next;
      goVeri = binaVeri = evreVeri = sertVeri = null;
      durum.goSayfa = 1; durum.ihaleSayfa = 1; durum.olaySayfa = 1; durum.sertSayfa = 1; durum.ihaleBina = ''; durum.sertUrun = '';
      durum.urunSec = []; durum.urunAra = ''; durum.urunHata = ''; durum.urunAcik = true;
      ciz();
    },
    destroy() { alive = false; clearInterval(timer); window.removeEventListener('hashchange', onHash); style.remove(); subnav.remove(); root.replaceChildren(); },
  };
}

const CARPAN_KEY = 'dentsimco.go.carpan';
function carpanOku() {
  try { const v = Number(localStorage.getItem(CARPAN_KEY)); return v > 0 ? v : null; } catch { return null; }
}
function carpanYaz(v) {
  try { if (v) localStorage.setItem(CARPAN_KEY, String(v)); else localStorage.removeItem(CARPAN_KEY); } catch { /* gizli sekme */ }
}
