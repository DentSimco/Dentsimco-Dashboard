// DentSimco — Restoran › Analiz › Menü Seç
//
// Hesap saf fonksiyonlardadır (Node'da sınanır); çizim HTML metni döndürür, olaylar perakende.js'te bağlanır.
//   Oyuncu her kategoride kaç çeşit olacağını (salata barı, ana yemek, içecek) ve hedef ratingi seçer; Menü Seç o ratinge ulaşan
//   EN UCUZ menüyü önerir: hangi ürünlerin seçileceğine ve her ürünün kalitesine ayrı ayrı karar verir.
//   Rating = (ürün kalite puanlarının ortalaması + çeşit + yönetici bonusu) × oturma (restoran-rating.js menuRatingi, M4 modeli).
//   Yönetici bonusu = 0,01 × etkin iletişim + 0,02 × ekip dışı satış hızı % (Yönetim ekibi ve Kurulum'dan gelir).
//   Yemek adedi = yukarı yuvarla(oran × kategori çarpanı × seviye × lüks çarpanı); maliyet = adet × borsa fiyatı (döngü başına).
//   Arama: kategori başına dinamik programlama, durum = (seçilen ürün sayısı, puan toplamı). Puan PUAN_OLCEK ile tam sayıya
//   AŞAĞI yuvarlanır: bulunan menünün gerçek ratingi hedefin altında kalmaz.

import * as R from './hesap-restoran.js';
import * as M from './restoran-rating.js';
import { esc } from './esc.js';
import { urunAdi } from './urun-adlari.js';
import { num, money, seg, field, inputVal } from './perakende-restoran.js';
import { parseNum } from './uretim.js';

const KAT = R.KATEGORILER;
// Q0–Q1'in kalite puanı negatif (menü ratingini düşürür); puan toplamı dinamik programı için aranmaz.
export const KALITELER = Array.from({ length: 13 }, (_, q) => q).filter((q) => q >= 2);
export const MAKS_CESIT = Object.fromEntries(KAT.map((k) => [k.key, k.urunler.length]));
export const PUAN_OLCEK = 50; // puan 0,02 adımlarla
export const ALT_MAKS = 3; // diğer çeşit dağılımları kategori başına en çok 3 çeşide kadar denenir
const TIPLER = [['eko', 'Eko'], ['luks', 'Lüks (yemek ×0,5)']];
const ad = (id) => urunAdi(id, R.URUNLER[id]?.ad) || R.URUNLER[id]?.ad || `#${id}`;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const tamSayi = (x, a, b, d) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const isaretli = (x) => `${x < -1e-9 ? '−' : '+'}${num(Math.abs(x), 2)}`; // bonus satırları: +0,34 / −0,06
const fiyatOf = (marketOf, id, q) => { const p = Number(marketOf?.(id, q)); return fin(p) && p > 0 ? p : null; };

// ---------------------------------------------------------------------------------------------------------------
// Kayıt (tarayıcıda saklanan seçimler)
// ---------------------------------------------------------------------------------------------------------------
export const varsayilanMenuSec = () => ({ cesit: { salata: 2, ana: 2, icecek: 2 }, hedef: 6, seviye: 1, tip: 'eko' });
export function temizleMenuSec(raw) {
  const s = varsayilanMenuSec();
  if (!raw || typeof raw !== 'object') return s;
  for (const k of KAT) s.cesit[k.key] = tamSayi(raw.cesit?.[k.key], 1, MAKS_CESIT[k.key], s.cesit[k.key]);
  const h = Number(raw.hedef);
  s.hedef = fin(h) ? Math.min(M.RATING_MAX, Math.max(0, h)) : s.hedef;
  s.seviye = tamSayi(raw.seviye, 1, 9999, s.seviye);
  s.tip = raw.tip === 'luks' ? 'luks' : 'eko';
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Hesap
// ---------------------------------------------------------------------------------------------------------------
/** Yönetici bonusu ve dökümü: { iletisim, hiz, iletisimPuan, hizPuan, toplam }. */
export function yoneticiBonusu(iletisim, hizPct) {
  const i = Math.max(0, Number(iletisim) || 0), h = Number(hizPct) || 0; // satış hızı eksi olabilir (oyunda −%3 → −0,06)
  const iletisimPuan = R.ILETISIM_RATING * i, hizPuan = R.SATIS_HIZI_RATING * h;
  return { iletisim: i, hiz: h, iletisimPuan, hizPuan, toplam: iletisimPuan + hizPuan };
}

/** Bir üründen döngüde tüketilen adet: kategoride n ürün varken, seviye ve oturmaya göre. */
export function adet(id, n, seviye = 1, tip = 'eko') {
  const u = R.URUNLER[id];
  if (!u) return 0;
  return Math.ceil(u.oran * R.kategoriCarpani(n) * Math.max(0, seviye) * (tip === 'luks' ? R.LUKS_YEMEK : 1) - 1e-9);
}
/** Kalite puanının tam sayı karşılığı (aşağı yuvarlanır). */
export const puanBirim = (q) => Math.floor(M.kalitePuani(q) * PUAN_OLCEK + 1e-9);

/**
 * Kategoride tam n farklı ürün: puan toplamı (birim) → en ucuz seçim { toplam, urunler: [{ id, q, adet, birim, tutar, puan }] }.
 * Fiyatı olmayan kalite seçilmez; kategoride n ürünün fiyatı yoksa boş Map.
 */
export function kategoriTablosu(marketOf, katKey, n, { seviye = 1, tip = 'eko' } = {}) {
  const kat = KAT.find((k) => k.key === katKey);
  if (!kat || !(n >= 1) || n > kat.urunler.length) return new Map();
  let dp = Array.from({ length: n + 1 }, () => new Map());
  dp[0].set(0, { toplam: 0, urunler: [] });
  for (const id of kat.urunler) {
    const a = adet(id, n, seviye, tip), secenek = [];
    for (const q of KALITELER) {
      const birim = fiyatOf(marketOf, id, q);
      if (birim != null) secenek.push({ id, q, adet: a, birim, tutar: a * birim, puan: M.kalitePuani(q), p: puanBirim(q) });
    }
    if (!secenek.length) continue;
    const yeni = dp.map((m) => new Map(m)); // bu ürünü seçmeme
    for (let c = 0; c < n; c++) for (const [s, st] of dp[c]) for (const o of secenek) {
      const ns = s + o.p, toplam = st.toplam + o.tutar, cur = yeni[c + 1].get(ns);
      if (!cur || toplam < cur.toplam - 1e-9) yeni[c + 1].set(ns, { toplam, urunler: [...st.urunler, o] });
    }
    dp = yeni;
  }
  return dp[n];
}

const maksAnahtar = (m) => { let t = -1; for (const s of m.keys()) t = Math.max(t, s); return t; };
// "en az s birim" için en ucuz seçim (sonek minimumu)
function sonek(m) {
  const mx = maksAnahtar(m), a = new Array(Math.max(0, mx) + 2).fill(null);
  for (let s = mx; s >= 0; s--) { const o = m.get(s); a[s] = o && (!a[s + 1] || o.toplam < a[s + 1].toplam - 1e-9) ? { ...o, s } : a[s + 1]; }
  return a;
}

/** Hedefe ulaşmak için gereken en küçük puan toplamı (birim); hedef bonusla zaten aşılıyorsa 0. */
export function gerekliPuan(urunSayisi, { hedef, bonus = 0, tip = 'eko' }) {
  const L = tip === 'luks' ? M.MODEL.luks : 1;
  const ort = hedef / L - (Number(bonus) || 0) - M.cesitPuani(urunSayisi);
  return Math.max(0, Math.ceil(ort * urunSayisi * PUAN_OLCEK - 1e-9));
}

function coz(tablolar, ns, { hedef, bonus, tip }) {
  const N = ns.reduce((t, x) => t + x, 0);
  const [A, B, C] = tablolar, Cs = sonek(C), maksC = Cs.length - 2;
  const S = gerekliPuan(N, { hedef, bonus, tip });
  let best = null;
  for (const [s1, x] of A) for (const [s2, y] of B) {
    const g = Math.max(0, S - s1 - s2);
    if (g > maksC) continue;
    const z = Cs[g];
    if (!z) continue;
    const toplam = x.toplam + y.toplam + z.toplam;
    if (!best || toplam < best.toplam - 1e-9) best = { toplam, parcalar: [x, y, z] };
  }
  if (best) return { ok: sonucOlustur(best.parcalar, ns, { bonus, tip }) };
  // ulaşılamıyor: bu çeşitle en yüksek rating (her kategoride en yüksek puan)
  const enYuksekPuan = KAT.reduce((t, k, i) => {
    let m = 0; for (const o of tablolar[i].values()) m = Math.max(m, o.urunler.reduce((a, u) => a + u.puan, 0));
    return t + m;
  }, 0);
  return { yok: true, enYuksek: M.menuRatingi({ puanOrt: enYuksekPuan / N, urunSayisi: N, bonus, tip }) };
}

function sonucOlustur(parcalar, ns, { bonus, tip }) {
  const urunSayisi = ns.reduce((t, x) => t + x, 0);
  const kategoriler = parcalar.map((p, i) => {
    const sira = (id) => KAT[i].urunler.indexOf(id);
    return { key: KAT[i].key, ad: KAT[i].ad, n: ns[i], urunler: [...p.urunler].sort((x, y) => sira(x.id) - sira(y.id)), toplam: p.toplam };
  });
  const toplam = kategoriler.reduce((t, k) => t + k.toplam, 0);
  const puanOrt = kategoriler.reduce((t, k) => t + k.urunler.reduce((s, u) => s + u.puan, 0), 0) / urunSayisi;
  return { kategoriler, urunSayisi, cesit: ns.join('-'), toplam, gunluk: toplam * R.GUN_DONGU, puanOrt,
    cesitEk: M.cesitPuani(urunSayisi), bonus, tip, rating: M.menuRatingi({ puanOrt, urunSayisi, bonus, tip }) };
}

// kaynak (borsa verisinin nesnesi; yoksa marketOf) → Map(anahtar → kategori tablosu): yeniden çizimde DP tekrarlanmasın.
// Veri yenilenince kaynak nesnesi değişir ve tablolar yeniden hesaplanır.
const tabloCache = new WeakMap();
function tablo(marketOf, kaynak, katKey, n, seviye, tip) {
  const anahtar = kaynak && typeof kaynak === 'object' ? kaynak : typeof marketOf === 'function' ? marketOf : null;
  let m = anahtar ? tabloCache.get(anahtar) : null;
  if (anahtar && !m) { m = new Map(); tabloCache.set(anahtar, m); }
  const k = `${katKey}|${n}|${seviye}|${tip}`;
  if (m?.has(k)) return m.get(k);
  const t = kategoriTablosu(marketOf, katKey, n, { seviye, tip });
  if (m) { if (m.size > 200) m.clear(); m.set(k, t); }
  return t;
}

/**
 * Seçilen çeşit sayılarıyla hedef ratinge ulaşan en ucuz menü. kaynak: borsa verisi nesnesi (önbellek anahtarı; isteğe bağlı).
 * Dönen: menü { kategoriler, urunSayisi, cesit, toplam, gunluk, puanOrt, cesitEk, bonus, tip, rating }
 *   | { eksik: [kategori adları] } (borsada yeterli ilan yok) | { yok: true, enYuksek }.
 */
export function menuSec(marketOf, { cesit, hedef = 6, seviye = 1, tip = 'eko', bonus = 0, kaynak = null }) {
  const ns = KAT.map((k) => tamSayi(cesit?.[k.key], 1, MAKS_CESIT[k.key], 1));
  const tablolar = KAT.map((k, i) => tablo(marketOf, kaynak, k.key, ns[i], seviye, tip));
  const eksik = KAT.filter((k, i) => !tablolar[i].size).map((k) => k.ad);
  if (eksik.length) return { eksik };
  const c = coz(tablolar, ns, { hedef, bonus, tip });
  return c.ok || c;
}

/** Aynı hedefe seçilenden daha ucuza ulaşan diğer çeşit dağılımları (kategori başına 1–3), ucuzdan pahalıya, en çok `adet`. */
export function digerDagilimlar(marketOf, o, enFazla = 3) {
  const secili = KAT.map((k) => o.cesit?.[k.key]).join('-');
  const ana = menuSec(marketOf, o);
  const sinir = ana?.kategoriler ? ana.toplam : Infinity;
  const out = [];
  for (let a = 1; a <= Math.min(ALT_MAKS, MAKS_CESIT.salata); a++) for (let b = 1; b <= Math.min(ALT_MAKS, MAKS_CESIT.ana); b++) for (let c = 1; c <= Math.min(ALT_MAKS, MAKS_CESIT.icecek); c++) {
    if (`${a}-${b}-${c}` === secili) continue;
    const m = menuSec(marketOf, { ...o, cesit: { salata: a, ana: b, icecek: c } });
    if (m.kategoriler && m.toplam < sinir - 1e-9) out.push(m);
  }
  return out.sort((x, y) => x.toplam - y.toplam || x.urunSayisi - y.urunSayisi).slice(0, enFazla);
}

// ---------------------------------------------------------------------------------------------------------------
// Olaylar. st doğrudan değiştirilir; değiştiyse true döner (çağıran kaydeder ve yeniden çizer).
// ---------------------------------------------------------------------------------------------------------------
export function menuSecTikla(st, btn) {
  const act = btn.dataset.act || '';
  if (act === 'ms.tip') { st.tip = btn.dataset.v === 'luks' ? 'luks' : 'eko'; return true; }
  if (act === 'ms.cesit') {
    const k = btn.dataset.k;
    if (!(k in MAKS_CESIT)) return false;
    st.cesit[k] = tamSayi(st.cesit[k] + Number(btn.dataset.v), 1, MAKS_CESIT[k], st.cesit[k]);
    return true;
  }
  if (act === 'ms.dagilim') {
    const p = String(btn.dataset.v || '').split('-').map(Number);
    if (p.length !== 3 || KAT.some((k, i) => !(p[i] >= 1 && p[i] <= MAKS_CESIT[k.key]))) return false;
    KAT.forEach((k, i) => { st.cesit[k.key] = p[i]; });
    return true;
  }
  return false;
}
export function menuSecDegis(st, el) {
  const f = el.dataset?.ms;
  if (f === 'hedef') { const n = parseNum(el.value); if (!fin(n)) return false; st.hedef = Math.min(M.RATING_MAX, Math.max(0, n)); return true; }
  if (f === 'seviye') { st.seviye = tamSayi(parseNum(el.value), 1, 9999, st.seviye); return true; }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------------------------------------------
export const MENUSEC_CSS = `
.ms-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.ms-step { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ms-step > span { color: var(--muted); font-size: 12px; font-weight: 600; }
.ms-step .rt-stepper { display: flex; justify-content: space-between; }
.ms-yon { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; background: var(--raise); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; font-size: 14px; font-variant-numeric: tabular-nums; }
.ms-yon > span { color: var(--muted); }
.ms-yon .t { color: var(--text); font-weight: 700; }
.ms-ok b { color: var(--up); }
.ms-alt { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 0 4px; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--text); font: 500 14px var(--font); font-variant-numeric: tabular-nums; text-align: left; cursor: pointer; }
.ms-alt:last-of-type { border-bottom: 0; }
.ms-alt span:nth-child(2) { color: var(--muted); }
.ms-alt:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
`;

const stepper = (k, ad2, n, max) => `<div class="ms-step"><span>${esc(ad2)}</span><div class="rt-stepper" role="group" aria-label="${esc(ad2)} çeşit sayısı">
  <button type="button" data-act="ms.cesit" data-k="${k}" data-v="-1" aria-label="Azalt"${n <= 1 ? ' disabled' : ''}>−</button><output>${n}</output>
  <button type="button" data-act="ms.cesit" data-k="${k}" data-v="1" aria-label="Arttır"${n >= max ? ' disabled' : ''}>+</button></div></div>`;

function menuTablo(m) {
  const satir = (p) => `<tr class="grp"><th colspan="5" scope="colgroup">${esc(p.ad)} · ${p.n} <span>çeşit</span></th></tr>${p.urunler.map((u) =>
    `<tr><th class="nm" scope="row">${esc(ad(u.id))}</th><td class="q">Q${u.q}</td><td>${num(u.puan, 2)}</td><td>${num(u.adet)}</td><td>${money(u.tutar)}</td></tr>`).join('')}`;
  return `<div class="rt-wrap" tabindex="0" role="region" aria-label="Önerilen menü"><table class="rt-m"><thead><tr><th class="nm" scope="col">Ürün</th><th scope="col">Kalite</th><th scope="col">Rating</th><th scope="col">Adet</th><th scope="col">Tutar</th></tr></thead>
    <tbody>${m.kategoriler.map(satir).join('')}</tbody><tfoot><tr><th class="nm" scope="row">Toplam</th><td></td><td>${num(m.puanOrt, 2)}</td><td></td><td>${money(m.toplam)}</td></tr></tfoot></table></div>`;
}

function sonucHtml(m, hedef) {
  return `<section class="ur-card" aria-label="Önerilen menü">
    <div class="rt-tiles"><div class="rt-tile ms-ok"><small>Tahmini rating</small><b>${num(m.rating, 2)}</b><small>hedef ${num(hedef, 2)}</small></div>
      <div class="rt-tile"><small>Yemek maliyeti / döngü</small><b>${money(m.toplam)}</b><small>günlük ${money(m.gunluk)}</small></div></div>
    ${menuTablo(m)}</section>`;
}

/** Menü Seç sekmesi. ctx: { iletisim (etkin iletişim), hiz (ekip dışı satış hızı %), kaynak (borsa verisi nesnesi) }. */
export function menuSecHtml(st, marketOf, ctx = {}) {
  const yb = yoneticiBonusu(ctx.iletisim, ctx.hiz);
  const o = { cesit: st.cesit, hedef: st.hedef, seviye: st.seviye, tip: st.tip, bonus: yb.toplam, kaynak: ctx.kaynak };
  const m = menuSec(marketOf, o);
  const hata = (t) => `<div class="ur-msg err" role="alert">${t}</div>`;
  let sonuc;
  if (m.eksik) sonuc = hata(`Borsada yeterli ilan yok (${esc(m.eksik.join(', '))}); çeşit sayısını azaltın.`);
  else if (m.yok) sonuc = hata(`${num(st.hedef, 2)} bu çeşit sayısıyla ulaşılamıyor.${m.enYuksek != null ? ` En yüksek: ${num(m.enYuksek, 2)}.` : ''} Çeşit ekleyin ya da hedefi düşürün.`);
  else sonuc = sonucHtml(m, st.hedef);
  const alt = digerDagilimlar(marketOf, o);
  const altHtml = alt.length ? `<section class="ur-card" aria-labelledby="h-ms-alt"><div class="ur-head"><h2 id="h-ms-alt">Daha ucuz çeşit dağılımları</h2></div>
    ${alt.map((x) => `<button type="button" class="ms-alt" data-act="ms.dagilim" data-v="${x.cesit}" aria-label="${esc(`${x.cesit} çeşit dağılımını seç`)}"><span>${x.cesit} <span>(salata-ana-içecek)</span></span><span>${num(x.rating, 2)}</span><b>${money(x.toplam)}</b></button>`).join('')}</section>` : '';
  return `<section class="ur-card" aria-labelledby="h-ms"><div class="ur-head"><h2 id="h-ms">Menü Seç</h2></div>
      <div class="ms-steps">${KAT.map((k) => stepper(k.key, k.ad, st.cesit[k.key], MAKS_CESIT[k.key])).join('')}</div>
      <div class="rs-form">
        ${field('Hedef rating', 'data-ms="hedef"', inputVal(st.hedef), { mode: 'decimal' })}
        ${field('Bina seviyesi', 'data-ms="seviye"', st.seviye, { mode: 'numeric' })}
      </div>
      <div class="rs-mini"><span>Oturma</span>${seg('ms.tip', TIPLER, st.tip, 'Oturma')}</div>
      <div class="ms-yon" aria-label="Yönetici bonusu"><span class="t">Yönetici bonusu</span><b>${isaretli(yb.toplam)}</b>
        <span>Etkin iletişim ${num(yb.iletisim)} × 0,01</span><span>${isaretli(yb.iletisimPuan)}</span>
        <span>Ekip dışı satış hızı ${yb.hiz < 0 ? '−' : ''}%${num(Math.abs(yb.hiz), Number.isInteger(yb.hiz) ? 0 : 1)} × 0,02</span><span>${isaretli(yb.hizPuan)}</span></div>
    </section>${sonuc}${altHtml}`;
}
