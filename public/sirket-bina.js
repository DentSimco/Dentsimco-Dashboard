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
import { MAX_SEVIYE, binaSabitleri, seviyeCoz } from './seviye-coz.js';

export const KADEME_NOTU = 'Oyunun herkese açık profili bina seviyesini görsel kademenin alt sınırıyla verir (1, 2, 3, 6, 10, 15; akademide 20 gibi): 15+ yazan bina 15 ya da daha yüksek seviyededir. Bina bazında gerçek seviye görünmez; tablodaki toplamlar ve ortalamalar en az değerlerdir, sıralamalar da bunlara göredir.';
export const COZUM_NOTU = 'Gerçek seviyeler çözülerek bulunur: kesin toplam seviye (yönetim giderinden) ve bina değeri (bina başına maliyet × seviye) iki denklem verir; profildeki kademeler her binanın en az ve en çok seviyesini sınırlar. Tek sayı kesin seviyedir, aralık olası en düşük ve en yüksek seviyedir. Aynı türdeki binalar birbirinden ayrılamaz: tür toplamı bina başına aralıklardan daha kesindir.';
export const TOPLAM_NOTU = 'Toplam seviye, profildeki yönetim giderinden hesaplanır (yönetim gideri = 1 + (toplam seviye − 1) ÷ 170). Akademi ve satın alınmış mevsimlik pazarlar dahildir; banka, dinlenme binaları ve oyunun ücretsiz verdiği ilk mevsimlik pazar dahil değildir.';
export const OZET_COZUM_NOTU = 'Tür toplamları yönetim giderindeki kesin toplam seviyeden (ve güvenilir olduğunda bina değerinden) çözülür: tablodaki toplamlar ve ortalamalar çözülmüş en az değerlerdir. Sahipler tablosunda tek sayı kesin toplamdır, aralık olası en düşük ve en yüksek toplamdır.';
export const BV_VAR_NOTU = 'Bina değeri de hesaba katıldı.';
export const BV_YOK_NOTU = 'Bina değeri hesaba katılmadı: oyun onu günde bir kez kaydeder ve şirket o andan beri değişmiş olabilir. Şirket iki tarama arasında değişmezse kullanılır.';
export const PARCA = 128;
// Mevsimlik pazarlara (Cadılar Bayramı, Yılbaşı, Plaj Bar, Bahar) profilde seviye basılmaz; boyut bilgi taşımaz (Halloween pazarı hep 3, Yılbaşı hep 1).
export const MEVSIMLIK = new Set(['t', 'u', 'z', 'I']);
export const mevsimlikMi = (harf) => MEVSIMLIK.has(harf);
// Sezon gelince oyun her şirkete bir mevsimlik pazar (perakende binası) hediye eder: seviyesi herkeste aynıdır, artırılamaz, azaltılamaz, yalnız
// yıkılabilir; yönetim giderine, bina değerine ve işçiye girmez (yalnız bu pazarı olan 7 şirkette işçi 0, yönetim gideri 1). Seviyesi herkese açık
// veride görünmez (profilde boyut 3): bilgi oyunculardan. 21 Ekim 2026: Halloween pazarı (t) hediyesi 5. Diğer sezonların hediyesi bilinmiyor.
export const HEDIYE_SEVIYE = { t: 5 };
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

// Toplam seviye, kademe aralıkları ve tür başına gerçek seviye çözümü: seviye-coz.js (bot ile ortak)
export { ADMIN_BIRIM, toplamSeviye, MAX_SEVIYE, YONETIMDE_YOK, binaSabitleri, seviyeCoz } from './seviye-coz.js';

// Şirketin kaydı; taranmamışsa null
export async function sirketBinalari(realm, id) {
  const yol = parcaYolu(realm, id);
  const docs = await readDocs([yol]);
  return dataField(docs.get(yol))?.c?.[id] || null;
}

// Binaları türe göre toplar: [{harf, adet, seviyeler (büyükten küçüğe), toplam, mesgul: [[kod, bitiş]], luks}] toplam seviyeye göre
export function binaGruplari(b) {
  const m = new Map();
  (b || []).forEach(([harf, sv, kod, bitis, luks, ucretsiz], i) => {
    const g = m.get(harf) || { harf, adet: 0, seviyeler: [], toplam: 0, mesgul: [], luks: 0, ucretsiz: 0, kalemler: [] };
    g.kalemler.push({ sv, ucretsiz: ucretsiz === 1, i });
    if (ucretsiz === 1) g.ucretsiz++;
    g.adet++;
    g.seviyeler.push(sv);
    g.toplam += sv;
    if (kod) g.mesgul.push([kod, bitis]);
    if (luks) g.luks++;
    m.set(harf, g);
  });
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
  const cz = sabit ? seviyeCoz(k, binaSabitleri(sabit)) : null;
  const coz = cz && !cz.celiski ? cz : null;
  const bina = new Map((coz?.binalar || []).map((x) => [x.i, x]));
  const aralik = (a, u) => (a === u ? `<b>${NUM.format(a)}</b>` : u === Infinity ? `≥ ${NUM.format(a)}` : `${NUM.format(a)} – ${NUM.format(u)}`);
  const kv = (t, v) => `<div class="sk-kv"><span>${t}</span><span>${v}</span></div>`;
  const mesgulMetni = (g) => g.mesgul.map(([kod, bitis]) => `<span class="sb-durum">${esc(MESGUL[kod] || kod)}${bitis > now ? ` · <span data-no-t>${esc(fmtDateTime(bitis))}</span>` : ''}</span>`).join('');
  const hediye = (g) => (HEDIYE_SEVIYE[g.harf] ? NUM.format(HEDIYE_SEVIYE[g.harf]) : '—');
  // Tür satırı: toplam seviye ve bina başına seviyeler (çözüm varsa gerçek seviye aralıkları, yoksa profildeki kademeler)
  const toplamHucre = (g) => {
    const t = coz?.turler[g.harf];
    if (t) return `<span data-no-t>${aralik(t.alt, t.ust)}</span>`;
    // Çözümde olmayan tür: binalarının hepsi ücretsiz hediye
    if ((coz || g.ucretsiz === g.adet) && HEDIYE_SEVIYE[g.harf]) return `<span data-no-t>${NUM.format(HEDIYE_SEVIYE[g.harf] * g.adet)}</span>`;
    return mevsimlikMi(g.harf) ? '—' : `<span data-no-t>≥ ${NUM.format(g.toplam)}</span>`;
  };
  // Aynı aralıktaki binalar birleştirilir ("15 – 130 ×14"); birden çok binada tür ortalaması (Ø) da yazılır
  const seviyeHucre = (g) => {
    if (coz) {
      const sayac = new Map();
      for (const x of g.kalemler) {
        const y = bina.get(x.i);
        const metin = y ? aralik(y.alt, y.ust) : hediye(g, x);
        const e = sayac.get(metin) || { metin, n: 0, ust: y ? y.ust : -1 };
        e.n++;
        sayac.set(metin, e);
      }
      const liste = [...sayac.values()].sort((p, q) => q.ust - p.ust).map((e) => (e.n > 1 ? `${e.metin} ×${e.n}` : e.metin)).join(', ');
      const t = coz.turler[g.harf];
      const ort = t && t.adet > 1 ? (t.alt === t.ust ? `Ø ${NUM.format(t.alt / t.adet)}` : Number.isFinite(t.ust) ? `Ø ${NUM.format(t.alt / t.adet)} – ${NUM.format(t.ust / t.adet)}` : '') : '';
      return ort ? `${liste} · ${ort}` : liste;
    }
    return mevsimlikMi(g.harf) ? g.kalemler.map((x) => (x.ucretsiz ? hediye(g, x) : '—')).join(', ') : g.seviyeler.map((v) => kademeMetni(g.harf, v, ust)).join(', ');
  };
  return `<h3 class="sb-h">Binaları</h3>
    <div class="sb-ozet">
      ${kv('Bina', `<span data-no-t>${NUM.format(k.b?.length || 0)}</span>`)}
      ${coz ? kv('Toplam seviye (kesin)', `<span data-no-t>${NUM.format(coz.L)}</span>`) : kv('Toplam seviye (en az)', `<span data-no-t>${NUM.format(toplamKademe)}</span>`)}
      ${k.bv != null ? kv('Bina değeri', `<span data-no-t>$${NUM.format(k.bv)}</span>`) : ''}
      ${k.lv != null ? kv('Şirket seviyesi', `<span data-no-t>${NUM.format(k.lv)}</span>`) : ''}
      ${k.rt ? kv('Kredi notu', `<span data-no-t>${esc(k.rt)}</span>`) : ''}
      ${k.go != null ? kv('GO seviyesi', `<span data-no-t>T${esc(k.go)}</span>`) : ''}
      ${k.ao != null ? kv('Yönetim gideri', `<span data-no-t>${yuzde(k.ao)}</span>`) : ''}
      ${k.rb != null ? kv('Dinlenme bonusu', `<span data-no-t>${yuzde(k.rb)}</span>`) : ''}
      ${k.pm != null ? kv('Üretim değiştiricisi', `<span data-no-t>${signed(k.pm)}</span>`) : ''}
      ${k.sm != null ? kv('Satış değiştiricisi', `<span data-no-t>${signed(k.sm)}</span>`) : ''}
    </div>
    ${gruplar.length ? `<div class="sk-wrap"><table class="sb-t"><thead><tr><th class="l">Bina</th><th>Adet</th><th>${coz ? 'Toplam seviye' : 'Toplam seviye (en az)'}</th><th class="l">${coz ? 'Seviyeler' : 'Kademeler'}</th><th class="l">Durum</th></tr></thead><tbody>${gruplar.map((g) => `<tr>
      <td class="l">${esc(binaAdi(g.harf))}${g.luks ? ' <span class="sb-durum">Lüks</span>' : ''}${g.ucretsiz ? ' <span class="sb-durum">Ücretsiz hediye</span>' : ''}</td><td>${g.adet}</td><td>${toplamHucre(g)}</td>
      <td class="l" data-no-t>${seviyeHucre(g)}</td><td class="l">${mesgulMetni(g)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sk-note">Şirketin binası yok.</p>'}
    ${coz ? `<p class="sk-note"><span>${COZUM_NOTU}</span> <span>${coz.bvKullanildi ? BV_VAR_NOTU : BV_YOK_NOTU}</span></p>
    <p class="sk-note">${TOPLAM_NOTU}</p>` : `<p class="sk-note">${KADEME_NOTU}${gruplar.some((g) => mevsimlikMi(g.harf)) ? ` ${MEVSIMLIK_NOTU}` : ''}</p>`}
    <p class="sk-note"><span>${esc(`Tarama: ${fmtDateTime(k.t)}.`)}</span> <span>Kaynak: oyunun herkese açık şirket profili; binada üretilen ürün profilde görünmez.</span></p>`;
}

export const CSS = `
.sb-h { margin: 4px 0 0; font: 600 17px var(--font-c); }
.sb-ozet { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); column-gap: 18px; }
.sb-t td.l:first-child { white-space: normal; min-width: 130px; }
.sb-durum { display: inline-block; margin: 1px 4px 1px 0; padding: 1px 7px; border-radius: 999px; background: var(--raise); border: 1px solid var(--line); font-size: 12px; white-space: nowrap; }
`;
