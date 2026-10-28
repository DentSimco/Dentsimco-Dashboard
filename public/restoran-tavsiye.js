// DentSimco — Restoran: Maliyetler ve Tavsiye sekmeleri
//
// Hesap saf fonksiyonlardadır (Node'da sınanır); arayüz parçaları Perakende > Restoran içinde çizilir. Burada kâr ve doluluk yoktur:
// yalnız yemek maliyeti ve tahmini rating aralığı verilir. Rating modeli restoran-rating.js'te.
//   • Maliyetler: seviye 1 restoranda her ürünün her kalitedeki döngü maliyeti; kategoride aynı kalitenin en ucuzu mavi.
//   • Tavsiye: hedef ratinge ulaşan EN DÜŞÜK MALİYETLİ menü. Her ürün için ayrı kalite önerilir: rating menüdeki ürünlerin kalite
//     ortalamasından hesaplanır, bu yüzden gereken kalite toplamı en ucuza yükseltilebilen ürünlere dağıtılır. Çeşit sayısını
//     kendiniz seçersiniz ya da Otomatik, ürün sayısını da kendisi belirler.
// Yemek adedi = yukarı yuvarla(oran × kategori çarpanı × seviye × lüks çarpanı); çarpan kategorideki ürün sayısına bağlıdır.

import * as R from './hesap-restoran.js';
import * as M from './restoran-rating.js';
import { esc } from './esc.js';
import { urunAdi } from './urun-adlari.js';
import { num, money, seg, field, chip, kv, inputVal } from './perakende-restoran.js';
import { parseNum } from './uretim.js';

const KAT = R.KATEGORILER; // salata barı, ana yemek, içecek
export const KALITELER = Array.from({ length: 13 }, (_, q) => q);
export const MAKS_CESIT = Object.fromEntries(KAT.map((k) => [k.key, k.urunler.length]));
export const CARPANLAR = [[1, '1 (×2,1)'], [2, '2 (×1)'], [3, '3 (×0,9)'], [4, '4+ (×0,8)']];
const TIPLER = [['eko', 'Eko'], ['luks', 'Lüks (yemek ×0,5)']];
const MODLAR = [['oto', 'Otomatik'], ['elle', 'Çeşidi ben seçeyim']];
const ad = (id) => urunAdi(id, R.URUNLER[id]?.ad) || R.URUNLER[id]?.ad || `#${id}`;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const tamSayi = (x, a, b, d) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };

// ---------------------------------------------------------------------------------------------------------------
// Kayıt (tarayıcıda saklanan ayarlar)
// ---------------------------------------------------------------------------------------------------------------
export const varsayilanTavsiye = () => ({ kMin: 0, kMax: 12, seviye: 1, tip: 'eko', mod: 'oto', hedef: 7, carpan: 2, cesit: { salata: 2, ana: 2, icecek: 2 } });

export function temizleTavsiye(raw) {
  const s = varsayilanTavsiye();
  if (!raw || typeof raw !== 'object') return s;
  s.kMin = tamSayi(raw.kMin, 0, 12, s.kMin);
  s.kMax = tamSayi(raw.kMax, 0, 12, s.kMax);
  if (s.kMin > s.kMax) s.kMax = s.kMin;
  s.seviye = tamSayi(raw.seviye, 1, 9999, s.seviye);
  s.tip = raw.tip === 'luks' ? 'luks' : 'eko';
  s.mod = raw.mod === 'elle' ? 'elle' : 'oto';
  s.carpan = tamSayi(raw.carpan, 1, 4, s.carpan);
  const h = Number(raw.hedef);
  s.hedef = fin(h) ? Math.min(M.RATING_MAX, Math.max(0, h)) : s.hedef;
  for (const k of KAT) s.cesit[k.key] = tamSayi(raw.cesit?.[k.key], 1, MAKS_CESIT[k.key], s.cesit[k.key]);
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Hesap
// ---------------------------------------------------------------------------------------------------------------
const fiyatOf = (marketOf, id, q) => { const p = Number(marketOf?.(id, q)); return fin(p) && p > 0 ? p : null; };

/** Bir üründen döngüde tüketilen adet: kategoride n ürün varken, seviye ve oturma tipine göre. */
export function adet(id, n, seviye = 1, tip = 'eko') {
  const u = R.URUNLER[id];
  if (!u) return 0;
  return Math.ceil(u.oran * R.kategoriCarpani(n) * Math.max(0, seviye) * (tip === 'luks' ? R.LUKS_YEMEK : 1) - 1e-9);
}

/**
 * Seviye 1 restoranın maliyet tablosu: her kategori, her ürün, Q0–Q12 için döngü maliyeti.
 * hucre.enUcuz: kategoride aynı kalitenin en düşük maliyetli ürünü (eşitlikte hepsi). Fiyatı olmayan hücre tutar: null.
 */
export function maliyetTablosu(marketOf, { carpan = 2, tip = 'eko' } = {}) {
  return KAT.map((kat) => {
    const urunler = kat.urunler.map((id) => {
      const a = adet(id, carpan, 1, tip);
      return { id, adet: a, hucre: KALITELER.map((q) => { const birim = fiyatOf(marketOf, id, q); return { kalite: q, birim, tutar: birim == null ? null : a * birim, enUcuz: false }; }) };
    });
    for (const q of KALITELER) {
      const t = urunler.map((u) => u.hucre[q].tutar).filter((x) => x != null);
      if (!t.length) continue;
      const min = Math.min(...t);
      for (const u of urunler) if (u.hucre[q].tutar === min) u.hucre[q].enUcuz = true;
    }
    return { key: kat.key, ad: kat.ad, urunler };
  });
}

/**
 * Kategoride n ürün seçimi için her kalite toplamına (seçilen ürünlerin kalitelerinin toplamı) en ucuz çözüm.
 * Dönen: Map(kalite toplamı → { toplam, urunler: [{ id, q, adet, birim, tutar }] }). Kalite aralığı [kMin, kMax]; fiyatı olmayan kalite seçilmez.
 * Küçük bir dinamik programlama: ürünler sırayla, durum = (seçilen ürün sayısı, kalite toplamı).
 */
export function kategoriSecenekleri(marketOf, katKey, n, { seviye = 1, tip = 'eko', kMin = 0, kMax = 12 } = {}) {
  const kat = KAT.find((k) => k.key === katKey);
  if (!kat || !(n >= 1)) return new Map();
  let dp = Array.from({ length: n + 1 }, () => new Map());
  dp[0].set(0, { toplam: 0, urunler: [] });
  for (const id of kat.urunler) {
    const a = adet(id, n, seviye, tip);
    const secenek = [];
    for (let q = kMin; q <= kMax; q++) { const birim = fiyatOf(marketOf, id, q); if (birim != null) secenek.push({ id, q, adet: a, birim, tutar: a * birim }); }
    if (!secenek.length) continue;
    const yeni = dp.map((m) => new Map(m)); // bu ürünü seçmeme
    for (let c = 0; c < n; c++) for (const [s, st] of dp[c]) for (const o of secenek) {
      const ns = s + o.q, toplam = st.toplam + o.tutar;
      const cur = yeni[c + 1].get(ns);
      if (!cur || toplam < cur.toplam - 1e-9) yeni[c + 1].set(ns, { toplam, urunler: [...st.urunler, o] });
    }
    dp = yeni;
  }
  return dp[n];
}

/** Rating hedefine ulaşmak için N ürünlük menünün gereken en küçük kalite toplamı; ulaşılamazsa null. */
export function gerekliKaliteToplami(urunSayisi, { hedef, bonus = 0, tip = 'eko' }) {
  for (let s = 0; s <= urunSayisi * 12; s++) {
    const r = M.hedefRating({ kalite: s / urunSayisi, urunSayisi, bonus, tip });
    if (r != null && r >= hedef - 1e-9) return s;
  }
  return null;
}

// n = [salata, ana, içecek] ürün sayıları; secimler = kategori başına kategoriSecenekleri sonuçları
function enIyiBirlesim(secimler, S) {
  const [a, b, c] = secimler;
  let maks3 = -1;
  for (const s of c.keys()) maks3 = Math.max(maks3, s);
  const suf = new Array(maks3 + 2).fill(null); // suf[s]: kalite toplamı ≥ s olan en ucuz içecek seçimi
  for (let s = maks3; s >= 0; s--) {
    const o = c.get(s);
    suf[s] = o && (!suf[s + 1] || o.toplam < suf[s + 1].toplam) ? o : suf[s + 1];
  }
  let best = null;
  for (const [s1, x] of a) for (const [s2, y] of b) {
    const gerek = Math.max(0, S - s1 - s2);
    if (gerek > maks3) continue;
    const z = suf[gerek];
    if (!z) continue;
    const toplam = x.toplam + y.toplam + z.toplam;
    if (!best || toplam < best.toplam - 1e-9) best = { toplam, parcalar: [x, y, z] };
  }
  return best;
}

const maksToplam = (m) => { let t = -1; for (const s of m.keys()) t = Math.max(t, s); return t; };

function sonucOlustur(parcalar, ns, { seviye, tip, bonus }) {
  const urunSayisi = ns.reduce((t, x) => t + x, 0);
  const kategoriler = parcalar.map((p, i) => {
    const sira = (id) => KAT[i].urunler.indexOf(id);
    const urunler = [...p.urunler].sort((x, y) => sira(x.id) - sira(y.id));
    return { key: KAT[i].key, ad: KAT[i].ad, n: ns[i], urunler, toplam: p.toplam };
  });
  const toplam = kategoriler.reduce((t, k) => t + k.toplam, 0);
  const kaliteToplam = kategoriler.reduce((t, k) => t + k.urunler.reduce((s, u) => s + u.q, 0), 0);
  const ortKalite = kaliteToplam / urunSayisi;
  return { kategoriler, urunSayisi, toplam, gunluk: toplam * R.GUN_DONGU, seviyeBasi: toplam / Math.max(1, seviye), ortKalite,
    cesit: ns.join('-'), rating: M.ratingAraligi({ kalite: ortKalite, urunSayisi, bonus, tip }) };
}

function cozum(secimler, ns, o) {
  const urunSayisi = ns.reduce((t, x) => t + x, 0);
  const maks = secimler.reduce((t, m) => t + maksToplam(m), 0);
  const S = gerekliKaliteToplami(urunSayisi, o);
  const best = S != null && S <= maks ? enIyiBirlesim(secimler, S) : null;
  if (best) return { ok: sonucOlustur(best.parcalar, ns, o) };
  // hedefe ulaşılamıyor: bu çeşitte ulaşılabilecek en yüksek rating
  return { yok: true, enYuksek: M.hedefRating({ kalite: maks / urunSayisi, urunSayisi, bonus: o.bonus, tip: o.tip }) };
}

const secimleri = (marketOf, ns, o) => KAT.map((k, i) => kategoriSecenekleri(marketOf, k.key, ns[i], o));

/**
 * Elle seçilen çeşit sayılarıyla, hedef ratinge ulaşan en ucuz menü ve her ürünün kalitesi.
 * Dönen: menü | { eksik: [kategori adları] } (kalite aralığında yeterli fiyatlı ürün yok) | { yok: true, enYuksek }.
 */
export function menuOner(marketOf, { seviye = 1, tip = 'eko', cesit, bonus = 0, hedef = 7, kMin = 0, kMax = 12 }) {
  const ns = KAT.map((k) => cesit?.[k.key]);
  const o = { seviye, tip, bonus, hedef, kMin, kMax };
  const secimler = secimleri(marketOf, ns, o);
  const eksik = KAT.filter((k, i) => !secimler[i].size).map((k) => k.ad);
  if (eksik.length) return { eksik };
  const c = cozum(secimler, ns, o);
  return c.ok || { yok: true, enYuksek: c.enYuksek ?? null };
}

/**
 * Otomatik: ürün sayısını ve her ürünün kalitesini kendisi seçer; hedef ratinge ulaşan en ucuz menü ve en ucuz 4 diğer seçenek.
 * Dönen: { en, secenekler } ya da { fiyatYok: true } (hiçbir menü kurulamıyor) ya da { yok: true, enYuksek } (hedef çok yüksek).
 */
export function otomatikOner(marketOf, { seviye = 1, tip = 'eko', hedef = 7, bonus = 0, kMin = 0, kMax = 12 }) {
  const o = { seviye, tip, bonus, hedef, kMin, kMax };
  const tablo = KAT.map((k) => Array.from({ length: MAKS_CESIT[k.key] }, (_, i) => kategoriSecenekleri(marketOf, k.key, i + 1, o)));
  const ok = [];
  let var_ = false, enYuksek = null;
  for (let a = 1; a <= MAKS_CESIT.salata; a++) for (let b = 1; b <= MAKS_CESIT.ana; b++) for (let c = 1; c <= MAKS_CESIT.icecek; c++) {
    const secimler = [tablo[0][a - 1], tablo[1][b - 1], tablo[2][c - 1]];
    if (secimler.some((m) => !m.size)) continue;
    var_ = true;
    const r = cozum(secimler, [a, b, c], o);
    if (r.ok) ok.push(r.ok); else if (r.enYuksek != null) enYuksek = Math.max(enYuksek ?? 0, r.enYuksek);
  }
  if (!var_) return { fiyatYok: true };
  if (!ok.length) return { yok: true, enYuksek };
  ok.sort((x, y) => x.toplam - y.toplam || x.urunSayisi - y.urunSayisi || (x.cesit < y.cesit ? -1 : 1));
  return { en: ok[0], secenekler: ok.slice(1, 5) };
}

// ---------------------------------------------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------------------------------------------
export const TAVSIYE_CSS = `
.rt-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--line-2); border-radius: 12px; background: var(--surface); }
.rt-m { border-collapse: separate; border-spacing: 0; font-variant-numeric: tabular-nums; font-size: 13px; width: 100%; }
.rt-m th, .rt-m td { height: 38px; padding: 0 9px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
.rt-m thead th { background: var(--raise); color: var(--muted); font: 600 12px var(--font); }
.rt-m .nm { position: sticky; left: 0; z-index: 2; background: var(--surface); text-align: left; min-width: 112px; border-right: 1px solid var(--line-2); font: 600 14px var(--font-c); }
.rt-m thead .nm { background: var(--raise); z-index: 3; }
.rt-m .nm small { display: block; color: var(--faint); font: 500 11px var(--font); }
.rt-m tbody tr:last-child td, .rt-m tbody tr:last-child th { border-bottom: 0; }
.rt-m td.low { background: var(--tint-bg); color: var(--accent); font-weight: 700; box-shadow: inset 0 0 0 1px var(--tint-line); }
.rt-m td.q { color: var(--accent); font-weight: 700; }
.rt-m td.yok { color: var(--faint); }
.rt-m tfoot th, .rt-m tfoot td { background: var(--raise); font-weight: 700; border-bottom: 0; }
.rt-m .grp th { height: 30px; text-align: left; background: var(--raise); color: var(--accent); font: 600 12px var(--font-c); letter-spacing: .06em; text-transform: uppercase; }
.rt-legend { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); font-size: 12.5px; }
.rt-sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: var(--tint-bg); box-shadow: inset 0 0 0 1px var(--tint-line); vertical-align: -2px; margin-right: 5px; }
.rt-steps { display: flex; gap: 10px; flex-wrap: wrap; }
.rt-step { display: flex; flex-direction: column; gap: 4px; }
.rt-step > span { color: var(--muted); font-size: 12px; font-weight: 600; }
.rt-stepper { display: inline-flex; align-items: center; border: 1px solid var(--line-2); border-radius: 10px; background: var(--raise); }
.rt-stepper button { width: 44px; height: 44px; border: 0; background: transparent; color: var(--accent); font: 700 20px var(--font); cursor: pointer; }
.rt-stepper button:disabled { color: var(--faint); cursor: default; }
.rt-stepper output { min-width: 30px; text-align: center; font: 700 16px var(--font); font-variant-numeric: tabular-nums; }
.rt-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.rt-tile { background: var(--raise); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.rt-tile small { color: var(--muted); font-size: 12px; }
.rt-tile b { font: 700 22px var(--font-c); font-variant-numeric: tabular-nums; }
.rt-alt { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; font-variant-numeric: tabular-nums; }
.rt-alt:last-child { border-bottom: 0; }
`;

const birimFmt = (x) => (fin(x) ? money(x, x < 100 ? 2 : 0) : '—');

/** Maliyetler sekmesi. */
export function maliyetHtml(st, marketOf) {
  const tablolar = maliyetTablosu(marketOf, { carpan: st.carpan, tip: st.tip });
  const bas = `<tr><th class="nm" scope="col">Ürün</th>${KALITELER.map((q) => `<th scope="col">Q${q}</th>`).join('')}</tr>`;
  const kartlar = tablolar.map((t) => `<section class="ur-card" aria-label="${esc(t.ad)}"><div class="ur-head"><h2>${esc(t.ad)}</h2></div>
    <div class="rt-wrap" tabindex="0" role="region" aria-label="${esc(t.ad)} maliyetleri"><table class="rt-m"><thead>${bas}</thead><tbody>${t.urunler.map((u) =>
      `<tr><th class="nm" scope="row">${esc(ad(u.id))}<small>${num(u.adet)} <span>adet</span></small></th>${u.hucre.map((h) =>
        `<td class="${h.enUcuz ? 'low' : ''}${h.tutar == null ? ' yok' : ''}">${h.tutar == null ? '—' : money(h.tutar)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('');
  return `<section class="ur-card" aria-labelledby="h-rt-m"><div class="ur-head"><h2 id="h-rt-m">Maliyetler</h2></div>
      <p class="ur-sub">Seviye 1 restoranın 12 saatlik döngüde her üründen ve her kalitede yemek maliyeti. Adet = yukarı yuvarla(oran × çarpan × seviye).</p>
      <div class="rs-mini"><span>Kategorideki ürün sayısı (tüketim çarpanı)</span>${seg('rt.carpan', CARPANLAR, st.carpan, 'Kategorideki ürün sayısı')}</div>
      <div class="rs-mini"><span>Oturma</span>${seg('rt.tip', TIPLER, st.tip, 'Oturma')}</div>
      <div class="rt-legend"><span><i class="rt-sw"></i>Kategoride aynı kalitenin en düşük maliyetli ürünü</span><span>— borsada ilan yok</span></div></section>${kartlar}`;
}

const stepper = (k, ad2, n, max) => `<div class="rt-step"><span>${esc(ad2)}</span><div class="rt-stepper" role="group" aria-label="${esc(ad2)} ürün sayısı">
  <button type="button" data-act="rt.cesit" data-k="${k}" data-v="-1" aria-label="Azalt"${n <= 1 ? ' disabled' : ''}>−</button><output>${n}</output>
  <button type="button" data-act="rt.cesit" data-k="${k}" data-v="1" aria-label="Arttır"${n >= max ? ' disabled' : ''}>+</button></div></div>`;

function menuTablo(m) {
  const satir = (p) => `<tr class="grp"><th colspan="5" scope="colgroup">${esc(p.ad)} · ${p.n} <span>ürün</span></th></tr>${p.urunler.map((u) =>
    `<tr><th class="nm" scope="row">${esc(ad(u.id))}</th><td class="q">Q${u.q}</td><td>${num(u.adet)}</td><td>${birimFmt(u.birim)}</td><td>${money(u.tutar)}</td></tr>`).join('')}`;
  return `<div class="rt-wrap" tabindex="0" role="region" aria-label="Önerilen menü"><table class="rt-m"><thead><tr><th class="nm" scope="col">Ürün</th><th scope="col">Kalite</th><th scope="col">Adet</th><th scope="col">Birim</th><th scope="col">Tutar</th></tr></thead>
    <tbody>${m.kategoriler.map(satir).join('')}</tbody><tfoot><tr><th class="nm" scope="row">Toplam</th><td></td><td></td><td></td><td>${money(m.toplam)}</td></tr></tfoot></table></div>`;
}

const kaliteSecim = (f, deger, etiket) => `<label class="ur-field"><span>${etiket}</span><select data-rt="${f}" aria-label="${etiket}">${KALITELER.map((q) =>
  `<option value="${q}" ${q === deger ? 'selected' : ''}>Q${q}</option>`).join('')}</select></label>`;

/** Tavsiye sekmesi. ctx: { bonus } (ekip dışı satış hızı ve Yönetim ekibinden gelen rating bonusu). */
export function tavsiyeHtml(st, marketOf, ctx = {}) {
  const bonus = fin(ctx.bonus) ? ctx.bonus : 0;
  const girdi = { seviye: st.seviye, tip: st.tip, bonus, hedef: st.hedef, kMin: st.kMin, kMax: st.kMax };
  const oto = st.mod === 'oto';
  const aralik = `Q${st.kMin}–Q${st.kMax}`;
  const hata = (t) => `<div class="ur-msg err" role="alert">${t}</div>`;
  const yokMesaji = (en) => hata(`Hedef rating ${num(st.hedef, 1)} bu kalite aralığında tahmini olarak ulaşılamıyor.${en != null ? ` En yüksek tahmin: ${num(en, 1)}.` : ''} Hedefi ya da kalite aralığını değiştirin.`);
  let sonuc = '', diger = '';
  if (oto) {
    const o = otomatikOner(marketOf, girdi);
    if (o.fiyatYok) sonuc = hata(`${aralik} aralığında borsada yeterli ilan yok; aralığı genişletin.`);
    else if (o.yok) sonuc = yokMesaji(o.enYuksek);
    else {
      sonuc = menuSonuc(o.en, st);
      if (o.secenekler.length) diger = `<section class="ur-card"><div class="ur-head"><h2>Diğer seçenekler</h2></div>${o.secenekler.map((m) =>
        `<div class="rt-alt"><span>${esc(m.cesit)} · ${m.urunSayisi} <span>ürün</span></span><span>${num(m.rating.alt, 1)} – ${num(m.rating.ust, 1)}</span><b>${money(m.toplam)}</b></div>`).join('')}
        <p class="ur-note">Hedefi karşılayan, maliyete göre sıralı sonraki seçenekler.</p></section>`;
    }
  } else {
    const m = menuOner(marketOf, { ...girdi, cesit: st.cesit });
    sonuc = m.eksik ? hata(`${aralik} aralığında borsada yeterli ilan yok (${esc(m.eksik.join(', '))}); çeşit sayısını azaltın ya da aralığı genişletin.`)
      : m.yok ? yokMesaji(m.enYuksek) : menuSonuc(m, st);
  }
  return `<section class="ur-card" aria-labelledby="h-rt-t"><div class="ur-head"><h2 id="h-rt-t">Menü tavsiyesi</h2></div>
      <p class="ur-sub">Hedef ratinge ulaşan en düşük maliyetli menüyü, her ürün için ayrı kalite önererek bulur. Doluluk ve kâr hesaplanmaz.</p>
      <div class="rs-form">
        ${field('Hedef rating', 'data-rt="hedef"', inputVal(st.hedef), { mode: 'decimal' })}
        ${field('Bina seviyesi', 'data-rt="seviye"', st.seviye, { mode: 'numeric' })}
        ${kaliteSecim('kmin', st.kMin, 'En düşük kalite')}
        ${kaliteSecim('kmax', st.kMax, 'En yüksek kalite')}
      </div>
      <p class="ur-note">Önerilen kaliteler bu aralıkta kalır.</p>
      <div class="rs-mini"><span>Oturma</span>${seg('rt.tip', TIPLER, st.tip, 'Oturma')}</div>
      ${kv('Rating bonusu (satış hızı ve yönetici ekibi)', `+${num(bonus, 2)}`)}
      ${seg('rt.mod', MODLAR, st.mod, 'Çeşit seçimi')}
      ${oto ? '<p class="ur-note">Ürün sayısını ve her ürünün kalitesini kendisi belirler.</p>'
      : `<div class="rt-steps">${KAT.map((k) => stepper(k.key, k.ad, st.cesit[k.key], MAKS_CESIT[k.key])).join('')}</div>`}
    </section>${sonuc}${diger}`;
}

function menuSonuc(m, st) {
  const r = m.rating;
  const yaklas = M.yaklasmaDongusu(0.9);
  return `<section class="ur-card" aria-label="Önerilen menü">
    <div class="rt-tiles"><div class="rt-tile"><small>Tahmini rating</small><b>${num(r.alt, 1)} – ${num(r.ust, 1)}</b><small>orta ${num(r.orta, 1)}</small></div>
      <div class="rt-tile"><small>Maliyet / döngü (12 saat)</small><b>${money(m.toplam)}</b><small>günlük ${money(m.gunluk)}</small></div></div>
    <div class="ur-chips">${chip(`Ort. Q${num(m.ortKalite, 1)}`)}${chip(`${m.cesit} çeşit`)}${chip(`${m.urunSayisi} ürün`, 'muted')}${chip(`Seviye ${num(st.seviye)}`, 'muted')}${st.tip === 'luks' ? chip('Lüks', 'muted') : ''}</div>
    ${menuTablo(m)}
    <p class="ur-note">Rating, menüdeki ürünlerin kalite ortalamasından hesaplanır; bu yüzden kalite en ucuza yükseltilebilen ürünlere verilir, pahalıya yükselenlerin kalitesi düşük bırakılır. Yalnız yemek maliyeti; maaş dahil değildir.</p>
    <p class="ur-note">Rating her döngüde (12 saat) hedefin yaklaşık beşte biri kadar yaklaşır; hedefin %90'ına ≈ ${yaklas} döngüde ulaşır. Tahmin, ölçümlerle kurulmuş bir modeldir; profesyonel personel hesaba katılmadı.</p></section>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Olaylar. st doğrudan değiştirilir; değiştiyse true döner (çağıran kaydeder ve yeniden çizer).
// ---------------------------------------------------------------------------------------------------------------
export function tavsiyeTikla(st, btn) {
  const act = btn.dataset.act || '';
  if (act === 'rt.carpan') st.carpan = tamSayi(btn.dataset.v, 1, 4, st.carpan);
  else if (act === 'rt.tip') st.tip = btn.dataset.v === 'luks' ? 'luks' : 'eko';
  else if (act === 'rt.mod') st.mod = btn.dataset.v === 'elle' ? 'elle' : 'oto';
  else if (act === 'rt.cesit') {
    const k = btn.dataset.k;
    if (!(k in MAKS_CESIT)) return false;
    st.cesit[k] = tamSayi(st.cesit[k] + Number(btn.dataset.v), 1, MAKS_CESIT[k], st.cesit[k]);
  } else return false;
  return true;
}

export function tavsiyeDegis(st, el) {
  const f = el.dataset?.rt;
  if (!f) return false;
  if (f === 'kmin') { st.kMin = tamSayi(el.value, 0, 12, st.kMin); if (st.kMax < st.kMin) st.kMax = st.kMin; }
  else if (f === 'kmax') { st.kMax = tamSayi(el.value, 0, 12, st.kMax); if (st.kMin > st.kMax) st.kMin = st.kMax; }
  else if (f === 'seviye') st.seviye = tamSayi(parseNum(el.value), 1, 9999, st.seviye);
  else if (f === 'hedef') { const n = parseNum(el.value); if (fin(n)) st.hedef = Math.min(M.RATING_MAX, Math.max(0, n)); }
  else return false;
  return true;
}
