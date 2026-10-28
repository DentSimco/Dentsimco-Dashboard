// DentSimco — Restoran: Maliyetler ve Tavsiye sekmeleri
//
// Hesap saf fonksiyonlardadır (Node'da sınanır); arayüz parçaları Perakende > Restoran içinde çizilir. Burada kâr ve doluluk yoktur:
// yalnız yemek maliyeti ve tahmini rating aralığı verilir. Rating modeli restoran-rating.js'te.
//   • Maliyetler: seviye 1 restoranda her ürünün her kalitedeki döngü maliyeti; kategoride aynı kalitenin en ucuzu mavi.
//   • Tavsiye: kaliteyi siz seçersiniz; her kategoride o kalitenin en ucuz ürünleri seçilir. Çeşit sayısını kendiniz seçersiniz
//     ya da Otomatik, hedef ratinge ulaşan en ucuz menüyü bulur.
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
export const varsayilanTavsiye = () => ({ kalite: 7, seviye: 1, tip: 'eko', mod: 'oto', hedef: 7, carpan: 2, cesit: { salata: 2, ana: 2, icecek: 2 } });

export function temizleTavsiye(raw) {
  const s = varsayilanTavsiye();
  if (!raw || typeof raw !== 'object') return s;
  s.kalite = tamSayi(raw.kalite, 0, 12, s.kalite);
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

/** Kategoride n ürünün en ucuz seçimi (verilen kalitede). Fiyatı olan ürün n'den azsa null. */
export function enUcuzSecim(marketOf, katKey, n, kalite, seviye = 1, tip = 'eko') {
  const kat = KAT.find((k) => k.key === katKey);
  if (!kat || !(n >= 1)) return null;
  const adaylar = [];
  for (const id of kat.urunler) {
    const birim = fiyatOf(marketOf, id, kalite);
    if (birim == null) continue;
    const a = adet(id, n, seviye, tip);
    adaylar.push({ id, adet: a, birim, tutar: a * birim });
  }
  if (adaylar.length < n) return null;
  adaylar.sort((x, y) => x.tutar - y.tutar || x.id - y.id);
  const urunler = adaylar.slice(0, n);
  return { key: kat.key, ad: kat.ad, n, urunler, toplam: urunler.reduce((t, u) => t + u.tutar, 0) };
}

function birlestir(parcalar, { kalite, seviye, tip, bonus }) {
  const urunSayisi = parcalar.reduce((t, p) => t + p.n, 0);
  const toplam = parcalar.reduce((t, p) => t + p.toplam, 0);
  return { kategoriler: parcalar, urunSayisi, toplam, gunluk: toplam * R.GUN_DONGU, seviyeBasi: toplam / Math.max(1, seviye),
    cesit: parcalar.map((p) => p.n).join('-'), rating: M.ratingAraligi({ kalite, urunSayisi, bonus, tip }) };
}

/** Elle seçilen çeşit sayılarıyla menü. Bir kategoride yeterli fiyatlı ürün yoksa { eksik: [kategori adları] }. */
export function menuOner(marketOf, { kalite, seviye = 1, tip = 'eko', cesit, bonus = 0 }) {
  const parcalar = [], eksik = [];
  for (const kat of KAT) {
    const p = enUcuzSecim(marketOf, kat.key, cesit?.[kat.key], kalite, seviye, tip);
    if (p) parcalar.push(p); else eksik.push(kat.ad);
  }
  return eksik.length ? { eksik } : birlestir(parcalar, { kalite, seviye, tip, bonus });
}

/**
 * Otomatik: hedef ratinge (tahminin ortası) ulaşan en ucuz menü ve en ucuz 4 diğer seçenek.
 * Dönen: { en, secenekler } ya da { fiyatYok: true } (hiçbir menü kurulamıyor) ya da { yok: true, enYuksek } (hedef çok yüksek).
 */
export function otomatikOner(marketOf, { kalite, seviye = 1, tip = 'eko', hedef = 7, bonus = 0 }) {
  const secim = {};
  for (const kat of KAT) {
    secim[kat.key] = [];
    for (let n = 1; n <= MAKS_CESIT[kat.key]; n++) { const p = enUcuzSecim(marketOf, kat.key, n, kalite, seviye, tip); if (p) secim[kat.key].push(p); }
  }
  const [s, a, i] = KAT.map((k) => secim[k.key]);
  const uygun = [];
  for (const x of s) for (const y of a) for (const z of i) uygun.push(birlestir([x, y, z], { kalite, seviye, tip, bonus }));
  if (!uygun.length) return { fiyatYok: true };
  const ok = uygun.filter((m) => m.rating.orta >= hedef - 1e-9)
    .sort((x, y) => x.toplam - y.toplam || x.urunSayisi - y.urunSayisi || (x.cesit < y.cesit ? -1 : 1));
  if (!ok.length) return { yok: true, enYuksek: Math.max(...uygun.map((m) => m.rating.orta)) };
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
  const satir = (p) => `<tr class="grp"><th colspan="4" scope="colgroup">${esc(p.ad)} · ${p.n} <span>ürün</span></th></tr>${p.urunler.map((u, i) =>
    `<tr><th class="nm" scope="row">${esc(ad(u.id))}</th><td>${num(u.adet)}</td><td>${birimFmt(u.birim)}</td><td${u.tutar === p.urunler[0].tutar ? ' class="low"' : ''}>${money(u.tutar)}</td></tr>`).join('')}`;
  return `<div class="rt-wrap" tabindex="0" role="region" aria-label="Önerilen menü"><table class="rt-m"><thead><tr><th class="nm" scope="col">Ürün</th><th scope="col">Adet</th><th scope="col">Birim</th><th scope="col">Tutar</th></tr></thead>
    <tbody>${m.kategoriler.map(satir).join('')}</tbody><tfoot><tr><th class="nm" scope="row">Toplam</th><td></td><td></td><td>${money(m.toplam)}</td></tr></tfoot></table></div>`;
}

/** Tavsiye sekmesi. ctx: { bonus } (Yönetim ekibinden gelen rating bonusu). */
export function tavsiyeHtml(st, marketOf, ctx = {}) {
  const bonus = fin(ctx.bonus) ? ctx.bonus : 0;
  const girdi = { kalite: st.kalite, seviye: st.seviye, tip: st.tip, bonus };
  const oto = st.mod === 'oto';
  const hata = (t) => `<div class="ur-msg err" role="alert">${t}</div>`;
  let sonuc = '', diger = '';
  if (oto) {
    const o = otomatikOner(marketOf, { ...girdi, hedef: st.hedef });
    if (o.fiyatYok) sonuc = hata(`Q${st.kalite} için borsada yeterli ilan yok; başka bir kalite seçin.`);
    else if (o.yok) sonuc = hata(`Bu kalite ve bonusla hedef rating ${num(st.hedef, 1)} tahmini olarak ulaşılamıyor. En yüksek tahmin: ${num(o.enYuksek, 1)}. Kaliteyi ya da hedefi değiştirin.`);
    else {
      sonuc = menuSonuc(o.en, st);
      if (o.secenekler.length) diger = `<section class="ur-card"><div class="ur-head"><h2>Diğer seçenekler</h2></div>${o.secenekler.map((m) =>
        `<div class="rt-alt"><span>${esc(m.cesit)} · ${m.urunSayisi} <span>ürün</span></span><span>${num(m.rating.alt, 1)} – ${num(m.rating.ust, 1)}</span><b>${money(m.toplam)}</b></div>`).join('')}
        <p class="ur-note">Hedefi karşılayan, maliyete göre sıralı sonraki seçenekler.</p></section>`;
    }
  } else {
    const m = menuOner(marketOf, { ...girdi, cesit: st.cesit });
    sonuc = m.eksik ? hata(`Q${st.kalite} için borsada yeterli ilan yok (${esc(m.eksik.join(', '))}); çeşit sayısını azaltın ya da başka bir kalite seçin.`) : menuSonuc(m, st);
  }
  return `<section class="ur-card" aria-labelledby="h-rt-t"><div class="ur-head"><h2 id="h-rt-t">Menü tavsiyesi</h2></div>
      <p class="ur-sub">Kaliteyi siz seçersiniz; her kategoride o kalitenin en ucuz ürünleri seçilir. Doluluk ve kâr hesaplanmaz.</p>
      <div class="rs-form">
        <label class="ur-field"><span>Kalite</span><select data-rt="kalite" aria-label="Kalite">${KALITELER.map((q) => `<option value="${q}" ${q === st.kalite ? 'selected' : ''}>Q${q}</option>`).join('')}</select></label>
        ${field('Bina seviyesi', 'data-rt="seviye"', st.seviye, { mode: 'numeric' })}
      </div>
      <div class="rs-mini"><span>Oturma</span>${seg('rt.tip', TIPLER, st.tip, 'Oturma')}</div>
      ${kv('Rating bonusu (satış hızı ve yönetici ekibi)', `+${num(bonus, 2)}`)}
      ${seg('rt.mod', MODLAR, st.mod, 'Çeşit seçimi')}
      ${oto ? `<div class="rs-form">${field('Hedef rating', 'data-rt="hedef"', inputVal(st.hedef), { mode: 'decimal' })}</div>
        <p class="ur-note">Hedefe ulaşan en ucuz menüyü seçer; kategori başına ürün sayısını kendisi belirler.</p>`
      : `<div class="rt-steps">${KAT.map((k) => stepper(k.key, k.ad, st.cesit[k.key], MAKS_CESIT[k.key])).join('')}</div>`}
    </section>${sonuc}${diger}`;
}

function menuSonuc(m, st) {
  const r = m.rating;
  const yaklas = M.yaklasmaDongusu(0.9);
  return `<section class="ur-card" aria-label="Önerilen menü">
    <div class="rt-tiles"><div class="rt-tile"><small>Tahmini rating</small><b>${num(r.alt, 1)} – ${num(r.ust, 1)}</b><small>orta ${num(r.orta, 1)}</small></div>
      <div class="rt-tile"><small>Maliyet / döngü (12 saat)</small><b>${money(m.toplam)}</b><small>günlük ${money(m.gunluk)}</small></div></div>
    <div class="ur-chips">${chip(`Q${st.kalite}`)}${chip(`${m.cesit} çeşit`)}${chip(`${m.urunSayisi} ürün`, 'muted')}${chip(`Seviye ${num(st.seviye)}`, 'muted')}${st.tip === 'luks' ? chip('Lüks', 'muted') : ''}</div>
    ${menuTablo(m)}
    <p class="ur-note">Mavi tutar, kategoride aynı kalitenin en düşük maliyetli ürünüdür; seçilen ürünler her kategoride en ucuz olanlardır. Yalnız yemek maliyeti; maaş dahil değildir.</p>
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
  if (f === 'kalite') st.kalite = tamSayi(el.value, 0, 12, st.kalite);
  else if (f === 'seviye') st.seviye = tamSayi(parseNum(el.value), 1, 9999, st.seviye);
  else if (f === 'hedef') { const n = parseNum(el.value); if (fin(n)) st.hedef = Math.min(M.RATING_MAX, Math.max(0, n)); }
  else return false;
  return true;
}
