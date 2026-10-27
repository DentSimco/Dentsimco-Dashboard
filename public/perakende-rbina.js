// DentSimco — Perakende'deki restoran binaları
// Restoran bölümünden bağımsız: kayıt setup.restoranBinalari, menü her binanın kendisinde. Hesap motoru ve menü satırı
// çizimi perakende-restoran.js ve hesap-restoran.js'ten gelir; bu dosya yalnız bina kartı, bina ekleme alanları ve olaylar.
// Kullanıcı seviye ve doluluğu girer (doluluk boşsa ısı haritası tahmini); kâr "şimdi" senaryosuyla hesaplanır.
//
// Kayıt: { kaynak: id | null, items: [{ id, ad, tip, seviye, fiyat, doluluk, menu, insaat }] }
// insaat: bina inşaatta; satmaz, maaş ve yemek gideri yok, seviyesi yönetim giderine girer (mağazalardaki gibi)
// kaynak: "Bu menüyü tüm binalara uygula" açık olan bina; diğer binaların menüsü onun kopyasıdır ve salt okunurdur.

import * as R from './hesap-restoran.js';
import * as RS from './perakende-restoran.js';
import { parseNum } from './uretim.js';
import { urunAdi } from './urun-adlari.js';
import { esc } from './esc.js';

const { num, money, cls, chip, inputVal, field, seg, kopyaMenu } = RS;
const TIPLER = [['eko', 'Eko'], ['luks', 'Lüks']];
const posOr = (x) => (Number.isFinite(x) && x > 0 ? x : null);
const ICON = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

export const RBINA_CSS = `
.rb-sw { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--text); font: 600 15px var(--font); text-align: left; }
.rb-sw .tr { width: 44px; height: 26px; border-radius: 13px; background: var(--line-3, var(--line-2)); position: relative; flex: none; transition: background .15s; }
.rb-sw .tr::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--surface); transition: transform .15s; }
.rb-sw[aria-pressed="true"] .tr { background: var(--accent); }
.rb-sw[aria-pressed="true"] .tr::after { transform: translateX(18px); }
.rb-kaynak { border-color: var(--accent); }
.rb-ad { width: 100%; min-height: 40px; border: 0; border-bottom: 1px dashed var(--line-2); background: transparent; color: var(--text); font: 600 19px var(--font-c); padding: 2px 0; border-radius: 0; }
.rb-kilit { opacity: .78; }
.rb-kar { display: flex; flex-direction: column; gap: 4px; padding: 12px; border: 1px solid var(--line-2); border-radius: 14px; background: var(--raise); }
.rb-kar.up { border-color: var(--up); } .rb-kar.down { border-color: var(--down); }
.rb-kar .big { font: 600 28px/1.1 var(--font-c); font-variant-numeric: tabular-nums; }
.rb-ozet-ac { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; padding: 0; border: 0; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.rb-ozet-ac:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .rb-sw .tr, .rb-sw .tr::after { transition: none; } }
`;

// ---------------------------------------------------------------------------------------------------------------
// Kayıt
// ---------------------------------------------------------------------------------------------------------------
export const varsayilanRb = () => ({ kaynak: null, items: [] });
export const rbSeviye = (rb) => (rb?.items || []).reduce((t, it) => t + (it.seviye || 0), 0);
export const kopyaMi = (rb, it) => !!rb.kaynak && rb.kaynak !== it.id;

// Kaynak bina varsa menüsü diğer binalara kopyalanır (her değişiklikten sonra çağrılır)
export function esitle(rb) {
  const k = rb.items.find((x) => x.id === rb.kaynak);
  if (!k) { rb.kaynak = null; return rb; }
  for (const it of rb.items) if (it !== k) it.menu = kopyaMenu(k.menu);
  return rb;
}

export function temizleRb(raw) {
  const rb = varsayilanRb();
  if (!raw || typeof raw !== 'object') return rb;
  const t = RS.temizleRestoran({ menuMode: 'ayri', items: raw.items });
  const ham = new Map((Array.isArray(raw.items) ? raw.items : []).map((x) => [String(x?.id), x]));
  rb.items = t.items.map(({ id, ad, tip, seviye, fiyat, doluluk, menu }) => ({ id, ad, tip, seviye, fiyat, doluluk, menu, insaat: !!ham.get(id)?.insaat }));
  rb.kaynak = rb.items.some((x) => x.id === raw.kaynak) ? raw.kaynak : null;
  return esitle(rb);
}

// Bina ekle panelinin taslağı; menuFrom: '' standart menü, yoksa kopyalanacak binanın kimliği
export const yeniTaslak = () => ({ ad: '', tip: 'eko', seviye: 0, fiyat: null, doluluk: null, menuFrom: '', menu: RS.varsayilanMenu() });
// Taslağı tek binalık kayıt gibi göstermek: menü aynı nesne olduğundan kayıt olayları taslağı doğrudan değiştirir
export const TASLAK_ID = 'taslak';
export const taslakRb = (d) => ({ kaynak: null, items: [{ ...d, id: TASLAK_ID }] });
export function taslakMenuKaynagi(d, rb) {
  const k = rb.items.find((x) => x.id === d.menuFrom);
  d.menu = k ? kopyaMenu(k.menu) : RS.varsayilanMenu();
}

export function rbEkle(rb, g) {
  const dolu = Number(g.doluluk);
  const it = { id: RS.uid(), ad: String(g.ad || '').trim().slice(0, 40) || `Restoran ${rb.items.length + 1}`, tip: g.tip === 'luks' ? 'luks' : 'eko',
    seviye: Math.max(0, Math.floor(Number(g.seviye) || 0)), fiyat: posOr(Number(g.fiyat)),
    doluluk: g.doluluk == null || g.doluluk === '' || !Number.isFinite(dolu) ? null : Math.min(100, Math.max(0, dolu)),
    menu: g.menu ? kopyaMenu(g.menu) : RS.varsayilanMenu(), insaat: false };
  rb.items.push(it);
  esitle(rb);
  return it.id;
}

// ---------------------------------------------------------------------------------------------------------------
// Hesap: Restoran bölümüyle aynı motor, her binanın kendi menüsüyle; kâr son döngü doluluğuna (boşsa tahmine) göre
// ---------------------------------------------------------------------------------------------------------------
export function rbDegerlendir(rb, c, marketOf) {
  const motor = (items) => RS.degerlendirRestoran({ menuMode: 'ayri', menu: RS.varsayilanMenu(), kontratPct: 0, gorunum: 'simdi', items }, c, marketOf);
  const tam = motor(rb.items);
  if (!rb.items.some((x) => x.insaat)) return tam;
  // İnşaattaki bina satış, maaş ve yemek gideri üretmez: satırı sıfırlanır, toplamlara girmez. Menü tablosu yine gerçek adetleri gösterir.
  const sifir = { revenueDay: 0, customersDay: 0, profitDay: 0 };
  const rows = tam.rows.map((r, i) => (rb.items[i].insaat
    ? { ...r, insaat: true, eksik: false, costDay: 0, wagesDay: 0, secili: { ...r.secili, ...sifir }, simdi: { ...r.simdi, ...sifir }, beklenen: { ...r.beklenen, ...sifir } }
    : r));
  return { rows, totals: motor(rb.items.filter((x) => !x.insaat)).totals };
}

// Özet: kâr ve zarar toplamları. satirlar: bina başına kâr (bilinmiyorsa null)
export function karZarar(degerler) {
  let kar = 0, zarar = 0, eksik = 0;
  for (const v of degerler) {
    if (v == null || !Number.isFinite(v)) eksik += 1;
    else if (v > 0) kar += v;
    else zarar += v;
  }
  return { kar, zarar, net: eksik ? null : kar + zarar, eksik };
}

// ---------------------------------------------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------------------------------------------
function uyariHtml(g) {
  return [g.eksikKategori.length ? `<div class="ur-msg err">Her kategoriden en az bir ürün gerekir: ${esc(g.eksikKategori.join(', '))} eksik.</div>` : '',
    g.eksikFiyat ? `<div class="ur-msg err">Borsada fiyatı olmayan ürün var: ${esc(g.kalemler.filter((k) => k.birim == null).map((k) => urunAdi(k.id, R.URUNLER[k.id]?.ad) || R.URUNLER[k.id]?.ad).join(', '))}. Kâr hesaplanmadı; kaliteyi değiştirin ya da maliyeti elle girin.</div>` : ''].join('');
}
function karKutusu(row) {
  const kar = row.eksik ? null : row.secili.profitDay;
  return `<div class="rb-kar ${kar == null ? '' : kar > 0.5 ? 'up' : kar < -0.5 ? 'down' : ''}" aria-live="polite">
        <span class="ur-note" style="font-weight:600">Bu binanın kârı (günlük)</span>
        <span class="big ${kar == null ? '' : cls(kar)}">${money(kar)}</span>
        <div class="ur-kv"><span>Gelir</span><span>${money(row.secili.revenueDay)}</span></div>
        <div class="ur-kv"><span>Malzeme</span><span>${money(-row.costDay)}</span></div>
        <div class="ur-kv"><span>Maaş ve yönetim</span><span>${money(-row.wagesDay)}</span></div>
      </div>`;
}

function kart(rb, it, row, marketOf, acik) {
  const kaynak = rb.kaynak === it.id;
  const kopya = kopyaMi(rb, it);
  const kaynakAd = rb.items.find((x) => x.id === rb.kaynak)?.ad || 'Restoran';
  const a = (f) => `data-pf="${esc(it.id)}|${f}"`;
  const g = row.gider;
  const kar = row.eksik ? null : row.secili.profitDay;
  const secili = Object.values(it.menu).filter((x) => x.secili).length;
  const dolulukTahmin = row.simdi.doluluk;
  const insaat = !!it.insaat;
  const uyar = insaat ? '' : uyariHtml(g);
  const govde = acik ? `
      ${RS.seg('pr.tip', TIPLER, it.tip, 'Restoran tipi', ` data-i="${esc(it.id)}"`)}
      <div class="rs-form">
        ${field('Seviye', a('seviye'), it.seviye || '', { mode: 'numeric' })}
        ${field('Doluluk', a('doluluk'), inputVal(it.doluluk), { unit: '%', placeholder: `${num(dolulukTahmin, 1)} (tahmin)` })}
        ${field('Menü fiyatı', a('fiyat'), inputVal(it.fiyat), { unit: '$', placeholder: '60' })}
      </div>
      <p class="ur-note">Doluluk, oyundaki son döngü doluluğudur. Boş bırakırsanız oyunun ısı haritalarından tahmin edilir (şu an %${num(dolulukTahmin, 1)}).</p>
      <div class="${kopya ? 'rb-kilit' : ''}">
        <div class="rs-cat"><b>Menü</b><span>${kopya ? esc(`${kaynakAd} menüsü`) : `${num(secili)} ürün`}</span></div>
        ${RS.menuHtml({ kontratPct: 0 }, it.id, it.menu, g, marketOf, { on: 'pm', kontrat: false, kilit: kopya })}
      </div>
      ${uyar}
      ${insaat ? '<p class="ur-note">İnşaatta: satış ve maaş yok; seviyesi yönetim giderine girer.</p>' : karKutusu(row)}` : '';
  return `<article class="ur-card${kaynak ? ' rb-kaynak' : ''}" aria-label="${esc(it.ad || 'Restoran')}">
    <div class="ur-row" style="gap:12px;align-items:flex-start">
      <div class="grow" style="min-width:140px">
        <input type="text" class="rb-ad" ${a('ad')} value="${esc(it.ad)}" placeholder="Restoran" aria-label="Bina adı" autocomplete="off">
        <div class="ur-chips" style="margin-top:6px">${chip(it.tip === 'luks' ? 'Lüks' : 'Eko')}${insaat
          ? `${chip('İnşaatta', 'muted')}${chip('Satmaz, maaş ödemez; seviyesi yönetim giderine girer', 'muted')}`
          : `${chip(`Doluluk %${num(row.simdi.doluluk, 1)}${it.doluluk == null ? ' (tahmin)' : ''}`, 'muted')}
          ${kar == null ? chip('Kâr hesaplanamadı', 'down') : chip(`Kâr ${money(kar)}/gün`, kar > 0 ? 'up' : 'down')}`}</div></div>
      <div class="ur-level"><small>Seviye</small><b>${num(it.seviye)}</b></div></div>
    <button type="button" class="rb-sw" data-act="pr.uygula" data-i="${esc(it.id)}" aria-pressed="${kaynak}"><span class="tr" aria-hidden="true"></span><span>Bu menüyü tüm binalara uygula</span></button>
    ${kaynak ? '<p class="ur-note">Bu bina kaynak: menüsü tüm restoran binalarına uygulanıyor. Adetler her binanın kendi seviyesine göre hesaplanır.</p>' : ''}
    ${kopya ? `<p class="ur-note">Menü <b>${esc(kaynakAd)}</b> binasından geliyor. Değiştirmek için o binanın menüsünü düzenleyin ya da bu binanın anahtarını açın.</p>` : ''}
    <div class="ur-row"><button type="button" class="ur-btn grow${insaat ? ' tint' : ''}" data-act="pr.insaat" data-i="${esc(it.id)}" aria-pressed="${insaat}">İnşaatta</button></div>
    <div class="ur-row"><button type="button" class="ur-btn tint grow" data-act="pr.ac" data-i="${esc(it.id)}" aria-expanded="${acik}">${icon('edit')}Düzenle</button>
      <button type="button" class="ur-btn" data-act="pr.kopya" data-i="${esc(it.id)}" aria-label="Aynı özelliklerle kopyala">${icon('copy')}</button>
      <button type="button" class="ur-btn danger" data-act="pr.sil" data-i="${esc(it.id)}" aria-label="Sil">${icon('trash')}</button></div>
    ${govde}
  </article>`;
}

export function rbKartlarHtml(rb, res, marketOf, acikSet) {
  if (!rb.items.length) return '';
  return `<section style="display:flex;flex-direction:column;gap:12px" aria-labelledby="h-rb"><h2 id="h-rb">Restoranlar</h2>
    ${rb.items.map((it, i) => kart(rb, it, res.rows[i], marketOf, acikSet.has(it.id))).join('')}</section>`;
}

// Bina ekle panelindeki restoran alanları: bina bilgisi, altında menü, en altta binanın kârı.
// env: { c: Perakende bağlamı (adminNet, ratingBonus, evre ...), marketOf }
export function sheetHtml(d, rb, env) {
  const kopyalar = rb.items.map((x) => `<option value="${esc(x.id)}" ${d.menuFrom === x.id ? 'selected' : ''}>${esc(x.ad || 'Restoran')} menüsünü kopyala</option>`).join('');
  const t = taslakRb(d);
  const row = rbDegerlendir(t, env.c, env.marketOf).rows[0];
  const kaynakAd = rb.items.find((x) => x.id === rb.kaynak)?.ad;
  return `<div class="rs-mini"><span>Restoran tipi</span>${seg('rb.tip', TIPLER, d.tip, 'Restoran tipi')}</div>
    <div class="rs-form">
      ${field('Seviye', 'data-d="rb.seviye"', d.seviye || '', { mode: 'numeric' })}
      ${field('Doluluk', 'data-d="rb.doluluk"', inputVal(d.doluluk), { unit: '%', placeholder: `${num(row.simdi.doluluk, 1)} (tahmin)` })}
      ${field('Menü fiyatı', 'data-d="rb.fiyat"', inputVal(d.fiyat), { unit: '$', placeholder: '60' })}
      ${field('Ad (isteğe bağlı)', 'data-d="rb.ad"', d.ad, { mode: 'text', placeholder: `Restoran ${rb.items.length + 1}` })}
    </div>
    <p class="ur-note">Doluluk, oyundaki son döngü doluluğudur. Boş bırakırsanız oyunun ısı haritalarından tahmin edilir.</p>
    <label class="ur-field"><span>Menünün çıkış noktası</span><select data-d="rb.menuFrom" aria-label="Menünün çıkış noktası"><option value="" ${d.menuFrom ? '' : 'selected'}>Standart menü</option>${kopyalar}</select></label>
    <div class="rs-cat"><b>Menü</b><span>${num(Object.values(d.menu).filter((x) => x.secili).length)} ürün</span></div>
    ${RS.menuHtml({ kontratPct: 0 }, TASLAK_ID, d.menu, row.gider, env.marketOf, { on: 'pm', kontrat: false })}
    ${uyariHtml(row.gider)}
    ${karKutusu(row)}
    ${kaynakAd ? `<p class="ur-note">"Bu menüyü tüm binalara uygula" ${esc(kaynakAd)} için açık: eklenen bina o binanın menüsünü alır.</p>` : ''}
    <p class="ur-note">Ürün, PPHPL ve fiyat grafiği restoranda yoktur.</p>`;
}

// Özet'te restoranın gelir, malzeme ve maaş ayrıntısı
export function ozetDetayHtml(row, k) {
  const m = (v) => (v == null ? '—' : money(v * k));
  return `<div class="ur-box"><div class="ur-kv"><span>Gelir (doluluk %${num(row.simdi.doluluk, 1)}, ${money(row.fiyat)})</span><span>${m(row.secili.revenueDay)}</span></div>
    <div class="ur-kv"><span>Malzeme</span><span>${m(-row.costDay)}</span></div><div class="ur-kv"><span>Maaş ve yönetim</span><span>${m(-row.wagesDay)}</span></div></div>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Olaylar. rb doğrudan değiştirilir (çağıran kopya verir); işlendiyse true döner.
// env: { marketOf(id, q), acik: Set }
// ---------------------------------------------------------------------------------------------------------------
export function rbTikla(rb, btn, env) {
  const act = btn.dataset.act || '';
  if (!/^p[rm]\./.test(act)) return false;
  const it = rb.items.find((x) => x.id === (btn.dataset.i || btn.dataset.s));
  if (!it) return false;
  if (act === 'pr.ac') { if (env.acik.has(it.id)) env.acik.delete(it.id); else env.acik.add(it.id); return true; }
  if (act === 'pr.tip') it.tip = btn.dataset.v === 'luks' ? 'luks' : 'eko';
  else if (act === 'pr.sil') { rb.items = rb.items.filter((x) => x !== it); env.acik.delete(it.id); }
  else if (act === 'pr.uygula') rb.kaynak = rb.kaynak === it.id ? null : it.id;
  else if (act === 'pr.insaat') it.insaat = !it.insaat;
  else if (act === 'pr.kopya') {
    // Aynı özelliklerle bina; menü da kopyalanır. Kaynak anahtarı kopyaya geçmez.
    const k = { ...it, id: RS.uid(), ad: it.ad ? `${it.ad} (kopya)`.slice(0, 40) : '', menu: kopyaMenu(it.menu) };
    rb.items.splice(rb.items.indexOf(it) + 1, 0, k);
  }
  else if (kopyaMi(rb, it)) return true; // kopya menü salt okunur
  else if (act === 'pm.urun') { const x = it.menu[btn.dataset.p]; if (x) x.secili = !x.secili; }
  else if (act === 'pm.kaynak') {
    const x = it.menu[btn.dataset.p];
    if (!x) return true;
    x.kaynak = btn.dataset.v === 'manuel' ? 'manuel' : 'borsa';
    if (x.kaynak === 'manuel' && x.manuel == null) x.manuel = env.marketOf(Number(btn.dataset.p), x.kalite);
  } else return false;
  esitle(rb);
  return true;
}

// Düğme olayından sonra kullanıcıya gösterilecek kısa bildirim (yoksa boş)
export function bildirim(act, rb, id) {
  const it = rb.items.find((x) => x.id === id);
  if (act === 'pr.insaat' && it) return it.insaat ? 'Bina inşaatta: satış ve maaş yok, seviyesi yönetim giderine girer.' : 'Bina inşaattan çıktı.';
  if (act === 'pr.kopya') return 'Bina kopyalandı.';
  if (act === 'pr.sil') return 'Bina silindi.';
  return '';
}

export function rbDegis(rb, t) {
  const pf = t.dataset.pf;
  if (pf) {
    const [id, f] = pf.split('|');
    const it = rb.items.find((x) => x.id === id);
    if (!it) return false;
    const n = parseNum(t.value);
    if (f === 'ad') it.ad = t.value.trim().slice(0, 40);
    else if (f === 'seviye') it.seviye = Math.max(0, Math.floor(n ?? 0));
    else if (f === 'fiyat') it.fiyat = n != null && n > 0 ? n : null;
    else if (f === 'doluluk') it.doluluk = n == null ? null : Math.min(100, Math.max(0, n));
    else return false;
    return true;
  }
  const pm = t.dataset.pm;
  if (!pm) return false;
  const [id, pid, f] = pm.split('|');
  const it = rb.items.find((x) => x.id === id);
  const x = it?.menu?.[pid];
  if (!x || kopyaMi(rb, it)) return false;
  if (f === 'kalite') x.kalite = Math.min(12, Math.max(0, Math.floor(Number(t.value) || 0)));
  else if (f === 'satir') {
    // Oyundaki "Sourcing Cost" satırı: toplam tutar ÷ adet = birim maliyet
    const tutar = posOr(parseNum(t.value));
    const ids = Object.keys(it.menu).filter((i) => it.menu[i].secili).map(Number);
    const adet = R.ihtiyac(ids, it.seviye, it.tip)[pid];
    if (tutar != null && adet > 0) { x.kaynak = 'manuel'; x.manuel = tutar / adet; }
  } else return false;
  esitle(rb);
  return true;
}
