// DentSimco — Şirketin binaları (Şirketler › ayrıntı penceresi). Veri: DentSimco-Bot bot/sirket_bina.mjs (günde bir tarama):
//   meta/sb_r{realm}_{NNN}   {t, c: {şirketNo: kayıt}}   NNN = şirketNo % 128
//   kayıt = {n, t: tarama anı, lv: şirket seviyesi, rt: rating, w: işçi, ao: yönetim gideri %, rb: dinlenme bonusu, pm/sm: üretim/satış
//            değiştiricisi, go: GO seviyesi, ls: son görülme, cc: ülke, b: [[harf, seviye, meşguliyet|null, meşguliyetBitişi|null, lüks]]}
// Oyunun herkese açık şirket profilinden gelir; binada üretilen ürün profilde yoktur.

import { PATHS, readDocs, dataField, fmtDateTime } from './veri.js';
import { LOCALE } from './i18n.js';
import { binaAdi } from './adlar.js';
import { esc } from './esc.js';

export const PARCA = 128;
export const parcaYolu = (r, id) => PATHS.meta(`sb_r${r}_${String(Number(id) % PARCA).padStart(3, '0')}`);

// Oyunun meşguliyet kodları (binanın o anki işi)
export const MESGUL = { b: 'İnşa / yükseltme', r: 'Üretimde', s: 'Satışta', u: 'Bakımı sürüyor', a: 'Robot kuruluyor', e: 'Restoran yenileniyor', o: 'Restoran açık', c: 'Açık artırmada', n: 'Besleniyor', g: 'Yumurta' };

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
export function binalarHtml(k, now = Date.now()) {
  if (!k) return '<p class="sk-note">Bu şirketin bina bilgisi henüz yok.</p>';
  const gruplar = binaGruplari(k.b);
  const toplamSeviye = gruplar.reduce((a, g) => a + g.toplam, 0);
  const kv = (t, v) => `<div class="sk-kv"><span>${t}</span><span>${v}</span></div>`;
  const mesgulMetni = (g) => g.mesgul.map(([kod, bitis]) => `<span class="sb-durum">${esc(MESGUL[kod] || kod)}${bitis > now ? ` · <span data-no-t>${esc(fmtDateTime(bitis))}</span>` : ''}</span>`).join('');
  return `<h3 class="sb-h">Binaları</h3>
    <div class="sb-ozet">
      ${kv('Bina', `<span data-no-t>${NUM.format(k.b?.length || 0)}</span>`)}
      ${kv('Toplam seviye', `<span data-no-t>${NUM.format(toplamSeviye)}</span>`)}
      ${k.lv != null ? kv('Şirket seviyesi', `<span data-no-t>${NUM.format(k.lv)}</span>`) : ''}
      ${k.rt ? kv('Kredi notu', `<span data-no-t>${esc(k.rt)}</span>`) : ''}
      ${k.go != null ? kv('GO seviyesi', `<span data-no-t>T${esc(k.go)}</span>`) : ''}
      ${k.ao != null ? kv('Yönetim gideri', `<span data-no-t>${yuzde(k.ao)}</span>`) : ''}
      ${k.rb != null ? kv('Dinlenme bonusu', `<span data-no-t>${yuzde(k.rb)}</span>`) : ''}
      ${k.pm != null ? kv('Üretim değiştiricisi', `<span data-no-t>${signed(k.pm)}</span>`) : ''}
      ${k.sm != null ? kv('Satış değiştiricisi', `<span data-no-t>${signed(k.sm)}</span>`) : ''}
    </div>
    ${gruplar.length ? `<div class="sk-wrap"><table class="sb-t"><thead><tr><th class="l">Bina</th><th>Adet</th><th>Toplam seviye</th><th class="l">Seviyeler</th><th class="l">Durum</th></tr></thead><tbody>${gruplar.map((g) => `<tr>
      <td class="l">${esc(binaAdi(g.harf))}${g.luks ? ' <span class="sb-durum">Lüks</span>' : ''}</td><td>${g.adet}</td><td>${g.toplam}</td>
      <td class="l" data-no-t>${g.seviyeler.join(', ')}</td><td class="l">${mesgulMetni(g)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sk-note">Şirketin binası yok.</p>'}
    <p class="sk-note"><span>${esc(`Tarama: ${fmtDateTime(k.t)}.`)}</span> <span>Kaynak: oyunun herkese açık şirket profili; binada üretilen ürün profilde görünmez.</span></p>`;
}

export const CSS = `
.sb-h { margin: 4px 0 0; font: 600 17px var(--font-c); }
.sb-ozet { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); column-gap: 18px; }
.sb-t td.l:first-child { white-space: normal; min-width: 130px; }
.sb-durum { display: inline-block; margin: 1px 4px 1px 0; padding: 1px 7px; border-radius: 999px; background: var(--raise); border: 1px solid var(--line); font-size: 12px; white-space: nowrap; }
`;
