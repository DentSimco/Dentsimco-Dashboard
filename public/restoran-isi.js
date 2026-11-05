// DentSimco — Restoran › Analiz › Isı Haritası
//
// Hesap restoran-isi-hesap.js'te (saf fonksiyonlar, Node'da sınanır); burada durum, çizim ve olaylar var. Çizim HTML metni döndürür,
// olaylar perakende.js'te bağlanır (data-act="is.*", data-is="…").
//   Gazete sayıları: bir aralık ya da tek tek seçilen sayılar (7 haftalık dönemler); harita seçilen sayıların toplamıdır.
//   Kâr: oturma (eko / lüks) seçilir, isteğe bağlı bir restoran kartı seçilir. Rating bonusu (Yönetim ve Kurulum), yönetim gideri
//   (Perakende) ve çalışan kalitesi şirketten gelir; burada ayrıca girilmez. Hücre: seviye başına döngü kârı, bin $.
//   Doluluk: oturma ayrımı yoktur (gazete eko ve lüksü ayırmaz); hücre ortalama doluluk %.

import { LOCALE } from './i18n.js';
import * as R from './hesap-restoran.js';
import * as IH from './restoran-isi-hesap.js';
import { yoneticiBonusu } from './restoran-menusec.js';
import { ISI_DONEMLER, ISI_KAYNAK } from './restoran-isi-donem.js';
import { esc } from './esc.js';
import { urunAdi } from './urun-adlari.js';
import { num, money, seg, chip } from './perakende-restoran.js';

const TIPLER = [['eko', 'Eko'], ['luks', 'Lüks']];
const METRIKLER = [['kar', 'Kâr'], ['doluluk', 'Doluluk']];
const MODLAR = [['aralik', 'Aralık'], ['tek', 'Tek tek seç']];
const TIPAD = { eko: 'Eko', luks: 'Lüks' };
const VARSAYILAN_SAYI = 3; // ilk açılışta son 3 sayı
const ad = (id) => urunAdi(id, R.URUNLER[id]?.ad) || R.URUNLER[id]?.ad || `#${id}`;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const gunAy = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const gunAyYil = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const tarih = (iso, yil = false) => (yil ? gunAyYil : gunAy).format(new Date(`${iso}T00:00:00Z`));
const yuzde = (x, d = 0) => (fin(x) ? `%${num(x * 100, d)}` : '—');
const binDolar = (x) => { const k = Math.round(x / 1000); return k === 0 ? '0' : `${k < 0 ? '−' : ''}${num(Math.abs(k))}`; };
const isaretli = (x) => (fin(x) ? `${x < 0 ? '−' : '+'}${money(Math.abs(x))}` : '—');

// ---------------------------------------------------------------------------------------------------------------
// Kayıt (tarayıcıda saklanan seçimler)
// ---------------------------------------------------------------------------------------------------------------
// mod 'aralik': a..b sayıları (boşsa son 3 sayı) · 'tek': tek listesindeki sayılar. restoran: kart kimliği ya da '' (kartsız, yalnız oturma).
export const varsayilanIsi = () => ({ mod: 'aralik', a: null, b: null, tek: [], metrik: 'kar', tip: 'eko', restoran: '', sel: null });

export function temizleIsi(raw, donemler = ISI_DONEMLER) {
  const s = varsayilanIsi();
  if (!raw || typeof raw !== 'object') return s;
  const sayilar = new Set(donemler.map((d) => d.sayi));
  s.mod = raw.mod === 'tek' ? 'tek' : 'aralik';
  if (sayilar.has(raw.a) && sayilar.has(raw.b)) { s.a = raw.a; s.b = raw.b; }
  s.tek = [...new Set(Array.isArray(raw.tek) ? raw.tek.filter((n) => sayilar.has(n)) : [])].sort((x, y) => x - y);
  s.metrik = raw.metrik === 'doluluk' ? 'doluluk' : 'kar';
  s.tip = raw.tip === 'luks' ? 'luks' : 'eko';
  s.restoran = typeof raw.restoran === 'string' ? raw.restoran.slice(0, 40) : '';
  const pi = Number(raw.sel?.pi), r = Number(raw.sel?.r);
  if (Number.isInteger(pi) && Number.isInteger(r) && pi >= 0 && pi < IH.FIYAT_DILIMLERI.length && r >= 0 && r <= 10) s.sel = { pi, r };
  return s;
}

/** Seçili dönemler (eskiden yeniye); geçersiz ya da boş seçimde son 3 sayı. */
export function secili(st, donemler = ISI_DONEMLER) {
  if (!donemler.length) return [];
  let l = [];
  if (st.mod === 'tek') l = donemler.filter((d) => st.tek.includes(d.sayi));
  else if (donemler.some((d) => d.sayi === st.a) && donemler.some((d) => d.sayi === st.b)) {
    const lo = Math.min(st.a, st.b), hi = Math.max(st.a, st.b);
    l = donemler.filter((d) => d.sayi >= lo && d.sayi <= hi);
  }
  return l.length ? l : donemler.slice(-VARSAYILAN_SAYI);
}

// ---------------------------------------------------------------------------------------------------------------
// Olaylar. st doğrudan değiştirilir; değiştiyse true döner (çağıran kaydeder ve yeniden çizer).
// ---------------------------------------------------------------------------------------------------------------
const kartOf = (ctx, id) => (ctx?.restoranlar || []).find((x) => x.id === id) || null;

export function isiTikla(st, btn, ctx = {}, donemler = ISI_DONEMLER) {
  const act = btn.dataset.act || '', v = btn.dataset.v;
  if (act === 'is.mod') {
    const l = secili(st, donemler);
    if (v === 'tek' && st.mod !== 'tek') { st.mod = 'tek'; st.tek = l.map((d) => d.sayi); }
    else if (v === 'aralik' && st.mod !== 'aralik') { st.mod = 'aralik'; st.a = l[0].sayi; st.b = l[l.length - 1].sayi; }
    else return false;
    st.capa = null; st.sel = null; st.menuAc = false;
    return true;
  }
  if (act === 'is.sayi') {
    const n = Number(v);
    if (!donemler.some((d) => d.sayi === n)) return false;
    if (st.mod === 'tek') {
      const i = st.tek.indexOf(n);
      if (i >= 0) { if (st.tek.length > 1) st.tek.splice(i, 1); else return false; } else st.tek = [...st.tek, n].sort((x, y) => x - y);
    } else if (st.capa == null) { st.a = st.b = n; st.capa = n; }
    else { st.a = Math.min(st.capa, n); st.b = Math.max(st.capa, n); st.capa = null; }
    st.sel = null; st.menuAc = false;
    return true;
  }
  if (act === 'is.metrik') {
    if (v !== 'kar' && v !== 'doluluk') return false;
    st.metrik = v; st.menuAc = false;
    return true;
  }
  if (act === 'is.tip') {
    if (v !== 'eko' && v !== 'luks') return false;
    st.tip = v;
    const k = kartOf(ctx, st.restoran);
    if (k && k.tip !== v) st.restoran = ''; // kartın oturmasıyla uyuşmayan seçim kartı bırakır
    st.sel = null; st.menuAc = false;
    return true;
  }
  if (act === 'is.hucre') {
    const pi = Number(btn.dataset.pi), r = Number(btn.dataset.r);
    if (!Number.isInteger(pi) || !Number.isInteger(r) || pi < 0 || pi >= IH.FIYAT_DILIMLERI.length || r < 0 || r > 10) return false;
    st.sel = { pi, r }; st.menuAc = false;
    return true;
  }
  if (act === 'is.menu') { st.menuAc = true; return true; }
  return false;
}

export function isiDegis(st, el, ctx = {}, donemler = ISI_DONEMLER) {
  const f = el.dataset?.is;
  if (f === 's0' || f === 's1') {
    const l = secili(st, donemler), n = Number(el.value);
    if (!donemler.some((d) => d.sayi === n)) return false;
    const a = f === 's0' ? n : l[0].sayi, b = f === 's1' ? n : l[l.length - 1].sayi;
    st.mod = 'aralik'; st.a = Math.min(a, b); st.b = Math.max(a, b); st.capa = null; st.sel = null; st.menuAc = false;
    return true;
  }
  if (f === 'restoran') {
    const k = kartOf(ctx, el.value);
    st.restoran = k ? k.id : '';
    if (k) st.tip = k.tip;
    st.sel = null; st.menuAc = false;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------------------------------------------
export const ISI_CSS = `
.is-col { display: flex; flex-direction: column; gap: 10px; }
.is-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(46px, 1fr)); gap: 5px; }
.is-iss { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 2px 6px; min-height: 52px; border-radius: 10px; background: var(--raise); border: 1px solid var(--line-2); color: var(--muted); font: 600 14px var(--font-c); }
.is-iss small { font: 500 10.5px var(--font); color: var(--faint); white-space: nowrap; }
.is-iss .bar { display: flex; width: 62%; height: 5px; border-radius: 3px; overflow: hidden; background: var(--line); }
.is-iss .bar i { display: block; height: 100%; }
.is-iss[aria-pressed="true"] { background: var(--tint-bg); border-color: var(--accent); color: var(--accent); }
.is-iss[aria-pressed="true"] small { color: var(--accent); }
.is-ph { display: flex; gap: 12px; flex-wrap: wrap; color: var(--muted); font-size: 12px; }
.is-ph i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.is-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.is-grid { display: grid; grid-template-columns: 46px repeat(11, minmax(0, 1fr)); gap: 2px; min-width: 0; }
.is-ax { font: 500 10px var(--font); color: var(--faint); display: flex; align-items: center; justify-content: flex-end; padding-right: 4px; font-variant-numeric: tabular-nums; white-space: nowrap; letter-spacing: -0.02em; }
.is-axx { justify-content: center; padding: 2px 0 0; }
.is-cell { position: relative; min-height: 32px; min-width: 0; border: 0; border-radius: 4px; padding: 0; font: 600 10.5px var(--font); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; color: var(--text); background: var(--raise); }
.is-cell.pos { background: color-mix(in oklab, var(--up) calc(var(--a) * 1%), var(--raise)); }
.is-cell.neg { background: color-mix(in oklab, var(--down) calc(var(--a) * 1%), var(--raise)); }
.is-cell.occ { background: color-mix(in oklab, var(--accent) calc(var(--a) * 1%), var(--raise)); }
.is-cell.strong { color: var(--on-accent); }
.is-cell.thin { background-image: repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--surface) 55%, transparent) 4px 6px); color: var(--faint); }
.is-cell.empty, .is-cell.unreach { background: transparent; box-shadow: inset 0 0 0 1px var(--line); color: var(--faint); font-weight: 500; }
.is-cell.best { outline: 2px solid var(--text); outline-offset: 1px; z-index: 1; }
.is-cell.sel { box-shadow: 0 0 0 2px var(--accent), 0 0 0 4px var(--bg); z-index: 2; }
.is-cell.mine::after { content: ""; position: absolute; top: 2px; right: 2px; width: 7px; height: 7px; border-radius: 50%; background: var(--price); box-shadow: 0 0 0 1.5px var(--bg); }
.is-cell:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.is-leg { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; color: var(--muted); font-size: 12px; }
.is-leg span { display: inline-flex; align-items: center; gap: 5px; }
.is-leg .ramp { width: 90px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, var(--down), var(--raise), var(--up)); border: 1px solid var(--line-2); }
.is-leg .ramp.occ { background: linear-gradient(90deg, var(--raise), var(--accent)); }
.is-leg .sw { width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--line-2); display: inline-block; }
.is-leg .sw.hatch { background: var(--raise) repeating-linear-gradient(135deg, transparent 0 3px, var(--surface) 3px 5px); }
.is-leg .sw.ring { outline: 2px solid var(--text); outline-offset: -2px; border-color: transparent; background: var(--raise); }
.is-leg .sw.dot { width: 8px; height: 8px; border-radius: 50%; border: 0; background: var(--price); }
.is-tablo th, .is-tablo td { padding: 0 4px; }
.is-tablo .nm { min-width: 0; width: 1%; font-size: 13px; }
.is-tablo thead th { font-size: 11px; }
`;

function sayiAlani(st, sec, donemler) {
  const idx = new Set(sec.map((d) => d.sayi));
  const secenek = donemler.map((d) => `<option value="${d.sayi}">#${d.sayi} · ${esc(tarih(d.bas))} – ${esc(tarih(d.bit))}</option>`);
  const secimli = (sayi) => secenek.map((o, i) => (donemler[i].sayi === sayi ? o.replace('<option ', '<option selected ') : o)).join('');
  const serit = donemler.map((d) => `<button type="button" class="is-iss" data-act="is.sayi" data-v="${d.sayi}" aria-pressed="${idx.has(d.sayi)}" title="${esc(`${tarih(d.bas, true)} – ${tarih(d.bit, true)}`)}">#${d.sayi}<span class="bar" aria-hidden="true"><i style="width:${d.evre[2] * 100}%;background:var(--up)"></i><i style="width:${d.evre[1] * 100}%;background:var(--faint)"></i><i style="width:${d.evre[0] * 100}%;background:var(--down)"></i></span><small>${esc(tarih(d.bit))}</small></button>`).join('');
  const bas = sec[0], son = sec[sec.length - 1], nums = sec.map((d) => `#${d.sayi}`);
  const ipucu = st.mod === 'tek'
    ? `${sec.length} sayı seçili: ${nums.join(', ')}. Dokunarak ekle ya da çıkar.`
    : `${sec.length} sayı seçili: ${nums[0]}${sec.length > 1 ? ` – ${nums[nums.length - 1]}` : ''} (${tarih(bas.bas, true)} – ${tarih(son.bit, true)}). ${st.capa != null ? 'Aralığı bitirmek için ikinci sayıya dokunun.' : 'Sayıya dokunun; bitiş için ikinci sayıya dokunun.'}`;
  return `<section class="ur-card" aria-labelledby="h-is-sayi"><div class="ur-head"><h2 id="h-is-sayi">Gazete sayıları</h2>${chip(`Son sayı #${donemler[donemler.length - 1].sayi} · ${tarih(donemler[donemler.length - 1].bit, true)}`, 'muted')}</div>
    <p class="ur-sub">Oyunun gazetesi restoranları 7 haftalık dönemler halinde veriyor. Tek bir sayıyı, bir aralığı ya da istediğiniz sayıları seçin; harita seçilen sayıların toplamıdır.</p>
    ${seg('is.mod', MODLAR, st.mod, 'Seçim biçimi')}
    ${st.mod === 'tek' ? '' : `<div class="ur-grid2"><label class="ur-field"><span>İlk sayı</span><select data-is="s0">${secimli(bas.sayi)}</select></label><label class="ur-field"><span>Son sayı</span><select data-is="s1">${secimli(son.sayi)}</select></label></div>`}
    <div class="is-strip" role="group" aria-label="Gazete sayıları">${serit}</div>
    <div class="is-ph"><span><i style="background:var(--up)"></i>Büyüme</span><span><i style="background:var(--faint)"></i>Normal</span><span><i style="background:var(--down)"></i>Durgunluk</span></div>
    <p class="ur-note">${esc(ipucu)} Fiyat verisi #${donemler[0].sayi} ve sonrası için var; eski sayılarda kâr hesaplanamaz.</p></section>`;
}

function restoranAlani(st, ctx, kart, tip, pro, yb) {
  const kartlar = (ctx.restoranlar || []).filter((x) => x.seviye > 0);
  const secenekler = `<option value=""${kart ? '' : ' selected'}>Yok: yalnız oturma</option>${kartlar.map((k) => `<option value="${esc(k.id)}"${kart && kart.id === k.id ? ' selected' : ''}>${esc(k.ad || 'Restoran')} · ${TIPAD[k.tip]}</option>`).join('')}`;
  const adminPct = (Number(ctx.adminNet) || 0) * 100;
  const chipler = [
    chip(`Rating bonusu +${num(yb.toplam, 2)} (CMO ${num(yb.iletisim)} · satış hızı %${num(yb.hiz, Number.isInteger(yb.hiz) ? 0 : 1)})`),
    chip(`Yönetim gideri %${num(adminPct, 1)}`, 'muted'), chip(`${TIPAD[tip]} oturma`, 'muted'), chip(pro ? 'Profesyonel çalışan (maaş ×5)' : 'Ekonomi çalışan', 'muted'),
    ...(kart ? [chip(`${kart.fiyat > 0 ? `Fiyat $${num(kart.fiyat)}` : 'Fiyat yok'} · ${fin(kart.rating) ? `rating ${num(kart.rating, 1)}` : 'rating yok'} · seviye ${num(kart.seviye)}`, 'muted')] : []),
  ].join('');
  return `<div class="is-col">
      <div class="ur-field"><span>Oturma</span>${seg('is.tip', TIPLER, tip, 'Oturma')}</div>
      ${kartlar.length ? `<label class="ur-field"><span>Restoranım (isteğe bağlı)</span><select data-is="restoran">${secenekler}</select></label>` : ''}
      <div class="ur-chips">${chipler}</div>
      <p class="ur-note">Rating bonusu ve yönetim gideri Yönetim, Kurulum ve Perakende'den okunur; burada girilmez.${kartlar.length ? ' Restoran seçerseniz haritada işaretlenir.' : ''}</p></div>`;
}

function haritaHtml(st, gor, tip, o, en, mine, sel, kar) {
  const kmode = st.metrik === 'kar';
  let mx = 1;
  if (kmode) for (let pi = 0; pi < IH.FIYAT_DILIMLERI.length; pi++) for (const r of IH.RATING_DILIMLERI) { const h = gor.hucre[pi][r][0] >= IH.MIN_KOSU ? IH.hucreKari(gor, tip, pi, r, o) : null; if (h) mx = Math.max(mx, Math.abs(h.kar)); }
  let h = `<div class="is-ax">${kmode ? 'bin $' : '%'}</div>${IH.RATING_DILIMLERI.map((r) => `<div class="is-ax is-axx">${r}</div>`).join('')}`;
  for (let pi = IH.FIYAT_DILIMLERI.length - 1; pi >= 0; pi--) {
    h += `<div class="is-ax">${IH.FIYAT_DILIMLERI[pi]}–${IH.FIYAT_DILIMLERI[pi] + IH.DILIM_GENISLIK - 1}</div>`;
    for (const r of IH.RATING_DILIMLERI) {
      const [n, occ] = gor.hucre[pi][r], at = `data-act="is.hucre" data-pi="${pi}" data-r="${r}"`, ad2 = `${IH.dilimAdi(pi)}, rating ${r}`;
      const etk = `${en && en.pi === pi && en.r === r && kmode ? ' best' : ''}${sel.pi === pi && sel.r === r ? ' sel' : ''}${mine && mine.pi === pi && mine.r === r ? ' mine' : ''}`;
      if (occ == null || n < IH.MIN_GOSTER) { h += `<button type="button" class="is-cell empty" disabled aria-label="${esc(ad2)}: veri yok">·</button>`; continue; }
      const thin = n < IH.MIN_KOSU ? ' thin' : '';
      if (kmode) {
        const k = IH.hucreKari(gor, tip, pi, r, o);
        if (!k) { h += `<button type="button" class="is-cell unreach${etk}" ${at} aria-label="${esc(ad2)}: bu rating menüyle ulaşılamıyor">×</button>`; continue; }
        const u = Math.max(-1, Math.min(1, k.kar / mx)), a = Math.round(Math.abs(u) * (thin ? 30 : 100));
        h += `<button type="button" class="is-cell ${u >= 0 ? 'pos' : 'neg'}${Math.abs(u) > 0.55 && !thin ? ' strong' : ''}${thin}${etk}" style="--a:${a}" ${at} aria-label="${esc(`${ad2}: kâr ${money(k.kar)}, doluluk ${yuzde(occ)}, ${num(n)} döngü`)}">${binDolar(k.kar)}</button>`;
      } else {
        const a = Math.round(occ * 100 * (thin ? 0.3 : 1));
        h += `<button type="button" class="is-cell occ${occ > 0.6 && !thin ? ' strong' : ''}${thin}${etk}" style="--a:${a}" ${at} aria-label="${esc(`${ad2}: doluluk ${yuzde(occ)}, ${num(n)} döngü`)}">${Math.round(occ * 100)}</button>`;
      }
    }
  }
  const lej = (kmode ? '<span>zarar</span><i class="ramp"></i><span>kâr</span><span><i class="sw ring"></i>en kârlı</span>' : '<span>düşük</span><i class="ramp occ"></i><span>dolu</span>')
    + (mine ? '<span><i class="sw dot"></i>restoranım</span>' : '') + '<span><i class="sw hatch"></i>100\'den az döngü</span>' + (kmode ? '<span><i class="sw"></i>× menüyle ulaşılamıyor</span>' : '');
  return `<div class="is-scroll"><div class="is-grid" role="grid" aria-label="Rating ve menü fiyatına göre ${kmode ? 'kâr' : 'doluluk'}">${h}</div></div><div class="is-leg">${lej}</div>`;
}

function detayHtml(st, gor, tumGor, tip, o, en, mine, sel) {
  const pi = sel.pi, r = sel.r, [n, occ] = gor.hucre[pi][r];
  const etiket = (en && en.pi === pi && en.r === r && st.metrik === 'kar' ? chip('en kârlı', 'up') : '') + (mine && mine.pi === pi && mine.r === r ? chip('restoranım') : '') + (n < IH.MIN_KOSU ? chip(`${num(n)} döngü: zayıf veri`, 'down') : '');
  const baslik = `<div class="ur-head"><b style="font:600 17px var(--font-c)">${esc(IH.dilimAdi(pi))} · rating ${r}${st.metrik === 'kar' ? ` · ${TIPAD[tip]}` : ''}</b><span class="ur-chips">${etiket}</span></div>`;
  const kv = (label, value, strong = false, c = '') => `<div class="ur-kv${strong ? ' strong' : ''}"><span>${label}</span><span class="${c}">${value}</span></div>`;
  if (st.metrik !== 'kar') {
    const tum = tumGor.hucre[pi][r][1];
    const fark = fin(occ) && fin(tum) ? occ - tum : null;
    return `<div class="ur-box">${baslik}${kv('Fiyat dilimi', esc(IH.dilimAdi(pi)))}${kv('Rating dilimi', String(r))}${kv('Doluluk', yuzde(occ, 1), true)}${kv('Döngü sayısı', num(n))}${kv('Tüm sayıların ortalamasından fark', fark == null ? '—' : `${fark >= 0 ? '+' : '−'}${num(Math.abs(fark) * 100, 1)} puan`)}</div>`;
  }
  const k = IH.hucreKari(gor, tip, pi, r, o);
  if (!k) return `<div class="ur-box">${baslik}${kv('Doluluk', yuzde(occ, 1))}${kv('Döngü sayısı', num(n))}<p class="ur-note">${occ == null ? 'Bu hücrede veri yok.' : 'Bu rating, rating bonusuyla bile menüyle ulaşılamıyor.'}</p></div>`;
  let menu = '';
  if (st.menuAc) {
    const m = IH.menuDetayi(gor.son, tip, o.bonus, IH.ratingMerkez(r));
    menu = m ? `<div class="ur-hr"></div><p class="ur-note">En ucuz menü (${esc(m.cesit.replace(/-/g, ' + '))} ürün, #${gor.son.sayi} fiyatlarıyla), seviye başına döngü: ${m.urunler.map((u) => `${esc(ad(u.id))} Q${u.q} ${money(u.tutar)}`).join(' · ')}</p>` : '';
  } else menu = '<button type="button" class="ur-btn" data-act="is.menu">Menüyü göster</button>';
  return `<div class="ur-box">${baslik}${kv('Doluluk', yuzde(k.doluluk, 1))}${kv('Döngü sayısı', num(k.kosu))}${kv('Fiyat (dilim ortası)', money(k.fiyat))}${kv('Gelir / seviye', money(k.gelir))}${kv('Malzeme / seviye', money(k.malzeme))}${kv('Maaş / seviye', money(k.maas))}`
    + `${kv('Kâr / seviye / döngü', money(k.kar), true, k.kar >= 0 ? 'c-up' : 'c-down')}${kv('Kâr / seviye / gün', money(2 * k.kar))}${kv('Başabaş doluluğu', yuzde(k.basabas, 1))}${menu}</div>`;
}

function ratingTablosuHtml(gor, tip, o) {
  const satirlar = IH.ratingTablosu(gor, tip, o);
  const enIyiKar = Math.max(...satirlar.filter((s) => fin(s.kar)).map((s) => s.kar), -Infinity);
  const govde = satirlar.filter((s) => s.r >= 3).map((s) => {
    if (!s.fiyat) return `<tr><th class="nm" scope="row">R${s.r}</th><td colspan="4">veri yok</td></tr>`;
    return `<tr><th class="nm" scope="row">R${s.r}</th><td>${IH.FIYAT_DILIMLERI[s.pi]}–${IH.FIYAT_DILIMLERI[s.pi] + IH.DILIM_GENISLIK - 1}</td><td>${yuzde(s.doluluk)}</td><td>${s.malzeme == null ? '—' : money(s.malzeme)}</td><td class="${s.kar === enIyiKar ? 'low' : ''}${fin(s.kar) && s.kar !== enIyiKar ? (s.kar >= 0 ? ' c-up' : ' c-down') : ''}">${s.kar == null ? '—' : money(s.kar)}</td></tr>`;
  }).join('');
  return `<section class="ur-card" aria-labelledby="h-is-tablo"><div class="ur-head"><h2 id="h-is-tablo">Rating dilimi başına en iyi fiyat</h2></div>
    <div class="rt-wrap" tabindex="0" role="region" aria-label="Rating dilimi başına kâr"><table class="rt-m is-tablo"><thead><tr><th class="nm" scope="col">Rating</th><th scope="col">Fiyat ($)</th><th scope="col">Doluluk</th><th scope="col">Malzeme</th><th scope="col">Kâr</th></tr></thead><tbody>${govde}</tbody></table></div>
    <p class="ur-note">Her rating diliminde koltuk başına geliri en yüksek fiyat ve o ratingin en ucuz menüsüyle seviye başına döngü kârı. Mavi hücre en kârlı dilim.</p></section>`;
}

/**
 * Isı Haritası sekmesi.
 * ctx: { restoranlar: [{ id, ad, tip, profesyonel, seviye, fiyat, rating }], iletisim (etkin CMO iletişimi), hiz (ekip dışı satış hızı %),
 *        adminNet (yönetim gideri, kesir), averageSalary, salaryModifier (restoran binası katsayısı) }
 */
export function isiHtml(st, ctx = {}, donemler = ISI_DONEMLER) {
  if (!donemler.length) return '<section class="ur-card"><h2>Isı Haritası</h2><p class="ur-sub">Fiyatı olan gazete sayısı yok. node araclar/restoran-isi.mjs ile veri toplanır.</p></section>';
  const sec = secili(st, donemler), gor = IH.gorunum(sec);
  const kart = (ctx.restoranlar || []).filter((x) => x.seviye > 0).find((x) => x.id === st.restoran) || null;
  const tip = kart ? kart.tip : st.tip, pro = !!kart?.profesyonel;
  const yb = yoneticiBonusu(ctx.iletisim, ctx.hiz);
  const o = { bonus: yb.toplam, maas: IH.maasSeviye(tip, { adminNet: ctx.adminNet, averageSalary: ctx.averageSalary, salaryModifier: ctx.salaryModifier, profesyonel: pro }) };
  const kmode = st.metrik === 'kar';
  const en = IH.enKarliHucre(gor, tip, o);
  const mine = kart ? IH.hucreOf(kart.fiyat, kart.rating) : null;
  const sel = st.sel || (mine ? { pi: mine.pi, r: mine.r } : en ? { pi: en.pi, r: en.r } : { pi: 1, r: 7 });
  const birim = kmode ? 'Kâr, bin $ · 26 = $26.000 · seviye başına, 12 saatlik döngüde' : 'Sayılar doluluk yüzdesi · eko ve lüks birlikte';
  const alt = kmode ? 'Dikey: menü fiyatı ($), yatay: rating (lüks çarpanı ve bonus dahil).' : 'Hücre: seçili sayılardaki ortalama doluluk. Gazete eko ve lüksü ayırmaz. Dikey: menü fiyatı ($), yatay: rating (lüks çarpanı dahil).';
  return `${sayiAlani(st, sec, donemler)}
    <section class="ur-card" aria-labelledby="h-is"><div class="ur-head"><h2 id="h-is">Isı haritası</h2></div>
      ${seg('is.metrik', METRIKLER, st.metrik, 'Gösterilen değer')}
      ${kmode ? restoranAlani(st, ctx, kart, tip, pro, yb) : ''}
      <p class="ur-sub">${esc(alt)}</p>
      <div class="ur-chips">${chip(birim)}</div>
      ${haritaHtml(st, gor, tip, o, en, mine, sel)}
      ${detayHtml(st, gor, IH.gorunum(donemler), tip, o, en, mine, sel)}</section>
    ${kmode ? ratingTablosuHtml(gor, tip, o) : ''}
    <p class="ur-note">Doluluk: oyunun gazetesi, restoran ısı haritası (H grafiği). Malzeme: SimcoTools günlük VWAP, dönem ortalaması, Menü Seç motoruyla en ucuz menü. Kâr = fiyat × koltuk × doluluk − malzeme − maaş, seviye başına 12 saatlik döngü. Veri ${esc(ISI_KAYNAK.guncellendi)} tarihinde güncellendi.</p>`;
}
