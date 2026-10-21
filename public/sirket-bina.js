// DentSimco — Şirketin binaları (Şirketler › ayrıntı penceresi). Veri: DentSimco-Bot bot/sirket_bina.mjs (günde bir tarama):
//   meta/sb_r{realm}_{NNN}   {t, c: {şirketNo: kayıt}}   NNN = şirketNo % 128
//   kayıt = {n, t: tarama anı, lv: şirket seviyesi, rt: rating, w: işçi, ao: yönetim gideri %, rb: dinlenme bonusu, pm/sm: üretim/satış
//            değiştiricisi, go: GO seviyesi, ls: son görülme, cc: ülke, b: [[harf, seviye, meşguliyet|null, meşguliyetBitişi|null, lüks]]}
// Oyunun herkese açık şirket profilinden gelir; binada üretilen ürün profilde yoktur. ÖNEMLİ: profildeki "size" gerçek seviye değil,
// binanın görsel kademesinin alt sınırıdır (restoranda 1, 2, 3, 6, 10, 15; akademide 1, 5, 10, 15, 20). 15 yazan restoran 15 ya da daha
// yüksektir (oyunda 20'nin üstü var). Gerçek seviye yalnız şirketin kendisine görünür; bu yüzden toplamlar "en az" değerlerdir.

import { PATHS, readDocs, dataField, fmtDateTime } from './veri.js';
import { LOCALE } from './i18n.js';
import { binaAdi } from './adlar.js';
import { esc } from './esc.js';

export const KADEME_NOTU = 'Oyunun herkese açık profili bina seviyesini görsel kademenin alt sınırıyla verir (1, 2, 3, 6, 10, 15; akademide 20 gibi): 15+ yazan bina 15 ya da daha yüksek seviyededir. Bina bazında gerçek seviye görünmez; tablodaki toplamlar ve ortalamalar en az değerlerdir, sıralamalar da bunlara göredir.';
export const TOPLAM_NOTU = 'Toplam seviye, profildeki yönetim giderinden hesaplanır (yönetim gideri = 1 + (toplam seviye − 1) ÷ 170). Akademi ve satın alınmış mevsimlik pazarlar dahildir; banka, dinlenme binaları ve oyunun ücretsiz verdiği ilk mevsimlik pazar dahil değildir. Üst kademedeki binaların toplamı, bu toplamdan alt kademedeki binaların olası seviyeleri çıkarılarak bulunur; bu yüzden bir aralıktır.';
export const PARCA = 128;
// Mevsimlik pazarlara (Cadılar Bayramı, Yılbaşı, Plaj Bar, Bahar) profilde seviye basılmaz; boyut bilgi taşımaz (Halloween pazarı hep 3, Yılbaşı hep 1).
export const MEVSIMLIK = new Set(['t', 'u', 'z', 'I']);
export const mevsimlikMi = (harf) => MEVSIMLIK.has(harf);
export const MEVSIMLIK_NOTU = 'Mevsimlik pazarların seviyesi profilde gösterilmez.';
export const parcaYolu = (r, id) => PATHS.meta(`sb_r${r}_${String(Number(id) % PARCA).padStart(3, '0')}`);

// Oyunun meşguliyet kodları (binanın o anki işi)
export const MESGUL = { b: 'İnşa / yükseltme', r: 'Üretimde', s: 'Satışta', u: 'Bakımı sürüyor', a: 'Robot kuruluyor', e: 'Restoran yenileniyor', o: 'Restoran açık', c: 'Açık artırmada', n: 'Besleniyor', g: 'Yumurta' };

// Binanın en yüksek görsel kademesi: meta/buildings (oyunun sabitleri, levelImages) → { harf: kademe }. Kademesi olmayan binada (ör. orman
// fidanlığı) profildeki değer gerçek seviyedir; o harf burada yoktur.
export function ustKademeler(sabit) {
  const out = {};
  for (const b of Object.values(sabit || {})) {
    const lv = (b?.levelImages || []).map((x) => Number(x?.level)).filter(Number.isFinite);
    if (b?.dbLetter != null && lv.length) out[b.dbLetter] = Math.max(...lv);
  }
  return out;
}
export async function sabitleriYukle() {
  const yol = PATHS.meta('buildings');
  return dataField((await readDocs([yol])).get(yol));
}
// Kademe metni: en yüksek kademedeki bina "15+" yazılır (o ya da daha yüksek seviye)
export const kademeMetni = (harf, sv, ust = {}) => (MAX_SEVIYE[harf] != null && sv >= MAX_SEVIYE[harf] ? String(sv) : ust[harf] != null && sv >= ust[harf] ? `${sv}+` : String(sv));

// Yönetim giderinden kesin toplam seviye. Profildeki yönetim gideri = 1 + (L − 1) ÷ 170 (L = 1: boş şirket). L, GERÇEK toplam seviyedir ve
// şunları kapsar: akademi ve tüm üretim/satış/araştırma binaları, satın alınmış mevsimlik pazarlar. Kapsamaz: banka, dinlenme binaları,
// oyunun ücretsiz verdiği kilitli bina (ilk mevsimlik pazar). 10.674 şirkette sınandı: L hiçbirinde alt sınırın altında değil.
export const ADMIN_BIRIM = 170;
export const toplamSeviye = (ao) => (Number.isFinite(ao) ? Math.round((ao - 1) * ADMIN_BIRIM + 1) : null);
// Oyunun bilinen seviye üst sınırları (akademi 20, banka 40, dinlenme binaları 3, fırlatma rampası 10). Diğer binalarda sınır görülmedi
// (ör. tek binalı bir elektronik mağazasının seviyesi kesin 79; restoran, tarla, fidanlık ortalamaları 40-60 üstünde).
export const MAX_SEVIYE = { y: 20, n: 40, 3: 3, 4: 3, 5: 3, l: 10 };
export const YONETIMDE_YOK = { harfler: new Set(['n']), kategoriler: new Set(['recreation']) };

// Kademe eşikleri ve kategoriler (meta/buildings): { harf: { esik: [1,2,3,6,10,15], kat } }
export function binaSabitleri(sabit) {
  const out = {};
  for (const b of Object.values(sabit || {})) {
    if (b?.dbLetter == null) continue;
    out[b.dbLetter] = { esik: (b.levelImages || []).map((x) => Number(x?.level)).filter(Number.isFinite).sort((a, c) => a - c), kat: b.category || null };
  }
  return out;
}

// Şirketin seviye hesabı: { L (kesin toplam), ustAdet, ustAlt, ustUst, tekTur } ya da veri yoksa null.
// Her binanın seviyesi [alt, üst] aralığındadır: kademesi alt sınır, bir sonraki eşiğin bir eksiği (ya da bilinen üst sınır) üst sınır; en yüksek
// kademedeki ("15+") binalarla satın alınmış mevsimlik pazarlarda (profildeki boyut bilgi taşımaz, en az 1) üst sınır yoktur.
// Fazla = L − Σ alt sınırlar önce alt kademedeki binalarda kalan boşluğa, kalanı üst kademedeki binalara düşer: toplamları bir aralıktır.
export function seviyeHesabi(k, sabit) {
  const L = toplamSeviye(k?.ao);
  if (L == null) return null;
  const liste = k.b || [];
  let ucretsiz = new Set();
  if (liste.length && liste.every((x) => x.length > 5)) ucretsiz = new Set(liste.map((x, i) => (x[5] ? i : -1)).filter((i) => i >= 0));
  else { // eski kayıt (bayrak yok): oyun her şirkete bir mevsimlik pazar ücretsiz verir
    for (const tur of [['t', 'z', 'I'], ['u']]) {
      const j = liste.findIndex((x) => tur.includes(x[0]));
      if (j >= 0) { ucretsiz = new Set([j]); break; }
    }
  }
  let alt = 0; let bosluk = 0; let ustAlt = 0; let ustAdet = 0;
  const turler = new Set();
  const ustTur = (harf, a) => { alt += a; ustAlt += a; ustAdet++; turler.add(harf); };
  liste.forEach(([harf, sv], i) => {
    const m = sabit?.[harf];
    if (!m || ucretsiz.has(i) || YONETIMDE_YOK.harfler.has(harf) || YONETIMDE_YOK.kategoriler.has(m.kat)) return;
    if (m.kat === 'seasonal') { ustTur(harf, 1); return; }
    const sinir = MAX_SEVIYE[harf];
    if (sinir != null && sv >= sinir) { alt += sv; return; }
    const tepe = m.esik.at(-1);
    if (tepe == null || sv >= tepe) { ustTur(harf, sv); return; }
    alt += sv;
    bosluk += Math.min(m.esik.find((e) => e > sv) - 1, sinir ?? Infinity) - sv;
  });
  const bos = { L, ustAdet: 0, ustAlt: null, ustUst: null, tekTur: null, tutarsiz: false };
  if (L <= 1) return bos;
  const fazla = L - alt;
  if (fazla < 0) return { ...bos, tutarsiz: true };
  if (!ustAdet) return { ...bos, tutarsiz: fazla > bosluk };
  return { L, ustAdet, ustAlt: ustAlt + Math.max(0, fazla - bosluk), ustUst: ustAlt + fazla, tekTur: turler.size === 1 ? [...turler][0] : null, tutarsiz: false };
}

// Şirketin kaydı; taranmamışsa null
export async function sirketBinalari(realm, id) {
  const yol = parcaYolu(realm, id);
  const docs = await readDocs([yol]);
  return dataField(docs.get(yol))?.c?.[id] || null;
}

// Binaları türe göre toplar: [{harf, adet, seviyeler (büyükten küçüğe), toplam, mesgul: [[kod, bitiş]], luks}] toplam seviyeye göre
export function binaGruplari(b) {
  const m = new Map();
  for (const [harf, sv, kod, bitis, luks] of b || []) {
    const g = m.get(harf) || { harf, adet: 0, seviyeler: [], toplam: 0, mesgul: [], luks: 0 };
    g.adet++;
    g.seviyeler.push(sv);
    g.toplam += sv;
    if (kod) g.mesgul.push([kod, bitis]);
    if (luks) g.luks++;
    m.set(harf, g);
  }
  for (const g of m.values()) g.seviyeler.sort((a, b) => b - a);
  return [...m.values()].sort((a, b) => b.toplam - a.toplam || b.adet - a.adet || a.harf.localeCompare(b.harf));
}

const NUM = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const YUZDE = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 });
const ISARETLI = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const yuzde = (x) => YUZDE.format(x / 100);
const signed = (x) => ISARETLI.format(x / 100);

// Ayrıntı penceresindeki bölüm (k: kayıt ya da null)
export function binalarHtml(k, now = Date.now(), ust = {}, sabit = null) {
  if (!k) return '<p class="sk-note">Bu şirketin bina bilgisi henüz yok.</p>';
  const gruplar = binaGruplari(k.b);
  const toplamKademe = gruplar.reduce((a, g) => a + (mevsimlikMi(g.harf) ? 0 : g.toplam), 0);
  const sh = sabit ? seviyeHesabi(k, binaSabitleri(sabit)) : null;
  const ortMetni = (x) => NUM.format(Math.round(x * 10) / 10);
  const aralik = (a, u) => (u - a < 0.5 ? NUM.format(Math.round(u)) : `${NUM.format(Math.round(a))} – ${NUM.format(Math.round(u))}`);
  const kv = (t, v) => `<div class="sk-kv"><span>${t}</span><span>${v}</span></div>`;
  const mesgulMetni = (g) => g.mesgul.map(([kod, bitis]) => `<span class="sb-durum">${esc(MESGUL[kod] || kod)}${bitis > now ? ` · <span data-no-t>${esc(fmtDateTime(bitis))}</span>` : ''}</span>`).join('');
  return `<h3 class="sb-h">Binaları</h3>
    <div class="sb-ozet">
      ${kv('Bina', `<span data-no-t>${NUM.format(k.b?.length || 0)}</span>`)}
      ${sh ? kv('Toplam seviye (kesin)', `<span data-no-t>${NUM.format(sh.L)}</span>`) : kv('Toplam seviye (en az)', `<span data-no-t>${NUM.format(toplamKademe)}</span>`)}
      ${sh?.ustAlt != null ? kv(`Üst kademedeki ${sh.ustAdet} binanın toplam seviyesi`, `<span data-no-t>${aralik(sh.ustAlt, sh.ustUst)}</span>`) : ''}
      ${sh?.ustAlt != null && sh.tekTur ? kv('Üst kademedeki binaların ortalama seviyesi', `<span data-no-t>${sh.ustUst - sh.ustAlt < 0.5 * sh.ustAdet ? `≈ ${ortMetni(sh.ustUst / sh.ustAdet)}` : `${ortMetni(sh.ustAlt / sh.ustAdet)} – ${ortMetni(sh.ustUst / sh.ustAdet)}`}</span>`) : ''}
      ${k.lv != null ? kv('Şirket seviyesi', `<span data-no-t>${NUM.format(k.lv)}</span>`) : ''}
      ${k.rt ? kv('Kredi notu', `<span data-no-t>${esc(k.rt)}</span>`) : ''}
      ${k.go != null ? kv('GO seviyesi', `<span data-no-t>T${esc(k.go)}</span>`) : ''}
      ${k.ao != null ? kv('Yönetim gideri', `<span data-no-t>${yuzde(k.ao)}</span>`) : ''}
      ${k.rb != null ? kv('Dinlenme bonusu', `<span data-no-t>${yuzde(k.rb)}</span>`) : ''}
      ${k.pm != null ? kv('Üretim değiştiricisi', `<span data-no-t>${signed(k.pm)}</span>`) : ''}
      ${k.sm != null ? kv('Satış değiştiricisi', `<span data-no-t>${signed(k.sm)}</span>`) : ''}
    </div>
    ${gruplar.length ? `<div class="sk-wrap"><table class="sb-t"><thead><tr><th class="l">Bina</th><th>Adet</th><th>Toplam seviye (en az)</th><th class="l">Kademeler</th><th class="l">Durum</th></tr></thead><tbody>${gruplar.map((g) => `<tr>
      <td class="l">${esc(binaAdi(g.harf))}${g.luks ? ' <span class="sb-durum">Lüks</span>' : ''}</td><td>${g.adet}</td><td>${mevsimlikMi(g.harf) ? '—' : g.toplam}</td>
      <td class="l" data-no-t>${mevsimlikMi(g.harf) ? '—' : g.seviyeler.map((v) => kademeMetni(g.harf, v, ust)).join(', ')}</td><td class="l">${mesgulMetni(g)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sk-note">Şirketin binası yok.</p>'}
    <p class="sk-note">${KADEME_NOTU}${gruplar.some((g) => mevsimlikMi(g.harf)) ? ` ${MEVSIMLIK_NOTU}` : ''}</p>
    ${sh ? `<p class="sk-note">${TOPLAM_NOTU}</p>` : ''}
    <p class="sk-note"><span>${esc(`Tarama: ${fmtDateTime(k.t)}.`)}</span> <span>Kaynak: oyunun herkese açık şirket profili; binada üretilen ürün profilde görünmez.</span></p>`;
}

export const CSS = `
.sb-h { margin: 4px 0 0; font: 600 17px var(--font-c); }
.sb-ozet { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); column-gap: 18px; }
.sb-t td.l:first-child { white-space: normal; min-width: 130px; }
.sb-durum { display: inline-block; margin: 1px 4px 1px 0; padding: 1px 7px; border-radius: 999px; background: var(--raise); border: 1px solid var(--line); font-size: 12px; white-space: nowrap; }
`;
