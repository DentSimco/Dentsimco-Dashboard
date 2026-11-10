// DentSimco — Restoran rating: ürünün etkisi.
//
// Kullanım: node araclar/restoran-urun-etkisi.mjs
// Veri: araclar/veri/restoran-rating-olcumleri.json (araclar/restoran-rating-modelleri.mjs ile aynı adımlar, k 0,27, σ 0,19).
//
// Sorular:
//   1) Aynı kalitede ürün değişince rating değişiyor mu? (Sky I–V: Q6 1-1-1; QUAL M3 − M2: Q5 2-2-2)
//   2) Etki fiyatla ilişkili mi? (ürünlerin Q6 fiyatının logaritması)
//   3) Ürünlerin ağırlığı maliyetine göre mi? Kalite puanlarının ortalaması w_i^γ ağırlıklı:
//        γ = 0 düz ortalama; γ = 1 ağırlık ∝ w (w: döngü maliyeti oran × fiyat, fiyat, ya da oran).
//      Aynı kaliteli menülerde ağırlık görünmez; yalnız kaliteleri farklı ürünler içeren menüler ayırır.
//   4) Tek tek ürünler (ekmek).
//   5) Önerilen sınamalarda her hipotezin tahmini.
//
// Kalite eğrisi (hepsinde): f(Q) = t + g (1 − e^(−Q/c)); hedef = (Σ w_i f(Q_i) + v (N − 6) + bonus) × oturma.
import { readFileSync } from 'node:fs';
import { adimlar, ki2, doygun } from './restoran-rating-modelleri.mjs';
import { vwapOf } from '../test/restoran-vwap-veri-ornek.mjs';
import { URUNLER } from '../public/hesap-restoran.js';

const S = adimlar();
const f2 = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x < 0 && Math.abs(x) >= 0.5 * 10 ** -d ? '−' : '') + Math.abs(x).toFixed(d).replace('.', ','));
const isr = (x, d = 2) => (x > 0.5 * 10 ** -d ? '+' : '') + f2(x, d);
const ort = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const topla = (a) => a.reduce((x, y) => x + y, 0);
const sinirla = (x) => Math.min(10, Math.max(0, x));
const AD = (id) => URUNLER[id]?.ad ?? String(id);

// Q için fiyat: borsada o kalite yoksa logaritmik doğrusal ara/dış değer
function fiyat(id, q) {
  const d = [];
  for (let k = 0; k <= 12; k++) { const v = vwapOf(id, k); if (v != null) d.push([k, Math.log(v)]); }
  const e = d.find(([k]) => k === q); if (e) return Math.exp(e[1]);
  const alt = d.filter(([k]) => k < q).pop(), ust = d.find(([k]) => k > q);
  if (alt && ust) return Math.exp(alt[1] + ((ust[1] - alt[1]) * (q - alt[0])) / (ust[0] - alt[0]));
  const [a, b] = alt ? d.slice(-2) : d.slice(0, 2);
  return Math.exp(a[1] + ((b[1] - a[1]) * (q - a[0])) / (b[0] - a[0]));
}
for (const s of S) {
  s.lnp6 = ort(s.ids.map((id) => Math.log(fiyat(id, 6))));
  s.maliyet = s.ids.map((id, i) => URUNLER[id].oran * fiyat(id, s.qs[i])); // döngü maliyeti (seviye 1, eko)
  s.fiyatlar = s.ids.map((id, i) => fiyat(id, s.qs[i]));
  s.oranlar = s.ids.map((id) => URUNLER[id].oran);
  s.ekmek = s.ids.includes(121) ? 1 : 0;
  s.m3 = s.ids.includes(129) ? 1 : 0; // QUAL M3 (Peynir, Turta, Hamburger, Köfte, Kokteyl, Zencefilli)
}

// ---- eniyileme ----
function nm(fn, x0, it = 5000) {
  const n = x0.length;
  if (!n) return [[], fn([])];
  let P = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + 0.25 * Math.abs(v) + 0.1 : v)))];
  let F = P.map(fn);
  for (let q = 0; q < it; q++) {
    const o = F.map((v, i) => i).sort((i, j) => F[i] - F[j]); P = o.map((i) => P[i]); F = o.map((i) => F[i]);
    if (q > 200 && F[n] - F[0] < 1e-9) break;
    const c = P.slice(0, -1).reduce((a, s) => a.map((v, i) => v + s[i] / n), Array(n).fill(0));
    const xr = c.map((v, i) => v + (v - P[n][i])), fr = fn(xr);
    if (fr < F[0]) { const xe = c.map((v, i) => v + 2 * (v - P[n][i])), fe = fn(xe); if (fe < fr) { P[n] = xe; F[n] = fe; } else { P[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { P[n] = xr; F[n] = fr; }
    else { const xc = c.map((v, i) => v + 0.5 * (P[n][i] - v)), fc = fn(xc); if (fc < F[n]) { P[n] = xc; F[n] = fc; } else { P = P.map((s) => s.map((v, i) => P[0][i] + 0.5 * (v - P[0][i]))); F = P.map(fn); } }
  }
  const i = F.indexOf(Math.min(...F));
  return [P[i], F[i]];
}
function uydur(hedef, p0, gecerli, veri = S) {
  const fn = (p) => (gecerli(p) ? ki2(hedef, p, veri) : 1e12);
  let b = nm(fn, p0);
  for (let r = 0; r < 3; r++) { const c = nm(fn, b[0].map((v) => v * (1 + 0.12 * (r - 1)) + 0.04 * (r - 1))); if (c[1] < b[1]) b = c; }
  b = nm(fn, b[0]);
  return { p: b[0], ki2: b[1], fn };
}
// j. parametrenin 1σ aralığı (profil olabilirlik)
function aralik(fit, j, adim = 0.01) {
  const { p, ki2: f0, fn } = fit;
  const prof = (v) => { const g = (x) => { const y = x.slice(); y.splice(j, 0, v); return fn(y); }; const a = nm(g, p.filter((_, i) => i !== j)); return nm(g, a[0])[1]; };
  const s = (yon) => { let d = 0; for (let t = 0; t < 600; t++) { d += yon * adim; if (prof(p[j] + d) - f0 >= 1) return p[j] + d; } return NaN; };
  return [s(-1), s(1)];
}
const f = (q, p) => p[0] + p[1] * (1 - Math.exp(-Math.max(0, q) / p[2]));
const ok5 = (p) => p[2] > 0.3 && p[2] < 25 && p[4] > 0.5 && p[4] < 2;
const T0 = [0.2, 5, 3, 0.06, 1.2];

// ================= 1) Sky I–V: aynı kalite (Q6), 1-1-1, farklı ürünler =================
console.log('== 1) Sky I–V (Q6, 1-1-1): ürün değişince rating değişiyor mu?');
const sky = S.filter((s) => s.grup === 'Sky');
const D = doygun(sky);
const ADI = { 'Sky Eco Resto': 'I', 'Sky Eco Resto II': 'II', 'Sky Eco Resto III': 'III', 'Sky Eco Resto IV': 'IV', 'Sky Eco Resto V': 'V' };
const ROW = Object.entries(D.hedefler).map(([ad, h]) => ({ ad: ADI[ad], T: h.T, sg: (h.hi - h.lo) / 2, n: h.n, urunler: h.ornek.ids.map(AD).join(', ') }));
ROW.forEach((r) => console.log(`  Sky ${r.ad.padEnd(3)} ${r.urunler.padEnd(28)} hedef ${f2(r.T)} ± ${f2(r.sg)} (${r.n} adım)`));
{
  const w = ROW.map((r) => 1 / r.sg ** 2), m = topla(ROW.map((r, i) => r.T * w[i])) / topla(w);
  const x = topla(ROW.map((r, i) => w[i] * (r.T - m) ** 2)), df = ROW.length - 1;
  const p = Math.exp(-x / 2) * (1 + x / 2); // df = 4 için kuyruk olasılığı
  console.log(`  Beş menünün hedefi eşit mi? ort ${f2(m)}, χ² ${f2(x, 1)} (${df} sd), p = ${f2(p)}`);
  const R = Object.fromEntries(ROW.map((r) => [r.ad, r]));
  const fark = (a, b, ad) => { const d = R[a].T - R[b].T, sg = Math.hypot(R[a].sg, R[b].sg); console.log(`  ${ad.padEnd(34)} ${isr(d)} ± ${f2(sg)}`); return [d, sg]; };
  fark('II', 'I', 'Köfte − Samosa (II − I)');
  fark('III', 'I', 'Ekmek − Süt (III − I)');
  fark('IV', 'I', 'Zencefilli bira − Portakal suyu (IV − I)');
  const kt = R.V.T - R.III.T - R.II.T + R.I.T, sk = Math.sqrt(topla(['V', 'III', 'II', 'I'].map((a) => R[a].sg ** 2)));
  console.log(`  ${'Kokteyl − Portakal suyu (V − III − II + I)'.padEnd(34)} ${isr(kt)} ± ${f2(sk)}   (topluluğun "kokteyl pahalı, rating'i yüksek" örneği)`);
  const ekmek = [R.III, R.V], yok = [R.I, R.II, R.IV];
  const mw = (a) => { const ww = a.map((r) => 1 / r.sg ** 2); return [topla(a.map((r, i) => r.T * ww[i])) / topla(ww), 1 / Math.sqrt(topla(ww))]; };
  const [me, se] = mw(ekmek), [my, sy] = mw(yok);
  console.log(`  Ekmekli menüler (III, V) ${f2(me)} ± ${f2(se)}; ekmeksizler (I, II, IV) ${f2(my)} ± ${f2(sy)}; fark ${isr(me - my)} ± ${f2(Math.hypot(se, sy))}`);
  // fiyat eğimi: hedef ~ a + b × ortalama ln(Q6 fiyatı)
  const x1 = ROW.map((r) => ort(D.hedefler[Object.keys(ADI).find((k) => ADI[k] === r.ad)].ornek.ids.map((id) => Math.log(fiyat(id, 6)))));
  const wv = ROW.map((r) => 1 / r.sg ** 2), mx = topla(x1.map((v, i) => v * wv[i])) / topla(wv), my2 = topla(ROW.map((r, i) => r.T * wv[i])) / topla(wv);
  const sxx = topla(x1.map((v, i) => wv[i] * (v - mx) ** 2)), sxy = topla(ROW.map((r, i) => wv[i] * (x1[i] - mx) * (r.T - my2)));
  console.log(`  Fiyat eğimi (Sky): hedef ~ b × ort ln(fiyat): b = ${isr(sxy / sxx)} ± ${f2(1 / Math.sqrt(sxx))} (ürün başına ln-fiyat birimi)`);
  globalThis.__skyB = [sxy / sxx, 1 / Math.sqrt(sxx)];
}

// ================= 2) Birlikte uyum: ürün terimleri =================
console.log('\n== 2) Bütün adımlar (107): içbükey eğri + toplanan çeşit + ürün terimi');
const H0 = (p, s) => sinirla((ort(s.qs.map((q) => f(q, p))) + p[3] * (s.N - 6) + s.bonus) * (s.lux ? p[4] : 1));
const fit0 = uydur(H0, T0, ok5);
console.log(`  P0 ürün terimi yok: χ² ${f2(fit0.ki2, 1)}; f: Q0 ${f2(f(0, fit0.p))}, Q1 ${f2(f(1, fit0.p))}, Q5 ${f2(f(5, fit0.p))}, Q6 ${f2(f(6, fit0.p))}, Q12 ${f2(f(12, fit0.p))}; çeşit ${isr(fit0.p[3])}/ürün; lüks ×${f2(fit0.p[4])}`);
const satir = (ad, fit, j, birim = '') => { const [lo, hi] = aralik(fit, j); console.log(`  ${ad.padEnd(46)} χ² ${f2(fit.ki2, 1)} (P0'a göre ${isr(fit.ki2 - fit0.ki2, 1)})  ${isr(fit.p[j])} (${f2(lo)} … ${f2(hi)}) ${birim}`); return [fit.p[j], lo, hi]; };
// QUAL: M3 ürünleri (pahalı) − M2 ürünleri (ucuz), aynı kalite Q5
const H1 = (p, s) => sinirla((ort(s.qs.map((q) => f(q, p))) + p[5] * s.m3 + p[3] * (s.N - 6) + s.bonus) * (s.lux ? p[4] : 1));
const fM3 = uydur(H1, [...fit0.p, 0], (p) => ok5(p) && Math.abs(p[5]) < 3);
const [dM3] = satir('QUAL: M3 ürünleri − M2 ürünleri (Q5)', fM3, 5, 'puan');
// fiyat eğimi
const H2 = (p, s) => sinirla((ort(s.qs.map((q) => f(q, p))) + p[5] * (s.lnp6 - 5) + p[3] * (s.N - 6) + s.bonus) * (s.lux ? p[4] : 1));
const fB = uydur(H2, [...fit0.p, 0], (p) => ok5(p) && Math.abs(p[5]) < 3);
const [bB] = satir('Fiyat eğimi b (ort ln Q6 fiyatı başına, tümü)', fB, 5, 'puan');
// ekmek
const H3 = (p, s) => sinirla((ort(s.qs.map((q) => f(q, p))) + p[5] * s.ekmek + p[3] * (s.N - 6) + s.bonus) * (s.lux ? p[4] : 1));
const fE = uydur(H3, [...fit0.p, 0], (p) => ok5(p) && Math.abs(p[5]) < 3);
satir('Ekmek (menüde varsa, Sky III ve V)', fE, 5, 'puan');
// fiyat eğimi yalnız QUAL'dan: M3 − M2 farkını ln-fiyat farkına bölerek
{
  const ln = (ids, q) => ort(ids.map((id) => Math.log(fiyat(id, q))));
  const d = ln([122, 123, 129, 131, 132, 126], 6) - ln([117, 119, 142, 143, 124, 125], 6);
  const [lo, hi] = aralik(fM3, 5);
  console.log(`  QUAL'da M3 − M2 ort ln(fiyat) farkı ${f2(d)}; b = ${isr(dM3 / d)} (${f2(lo / d)} … ${f2(hi / d)})`);
}

// ================= 3) Ağırlık hipotezleri =================
console.log('\n== 3) Ürün ağırlığı maliyete göre mi? hedef = (Σ w_i^γ f(Q_i) / Σ w_i^γ + ...) × oturma');
const AGIRLIK = { 'döngü maliyeti (oran × fiyat)': (s) => s.maliyet, 'fiyat': (s) => s.fiyatlar, 'oran (tüketim)': (s) => s.oranlar };
const wh = (anahtar) => (p, s) => {
  const w = AGIRLIK[anahtar](s).map((x) => x ** p[5]), t = topla(w);
  return sinirla(((topla(s.qs.map((q, i) => w[i] * f(q, p))) / t) + p[3] * (s.N - 6) + s.bonus) * (s.lux ? p[4] : 1));
};
const profGama = {};
for (const ad of Object.keys(AGIRLIK)) {
  const h = wh(ad);
  console.log(`  Ağırlık: ${ad}`);
  profGama[ad] = [];
  for (const g of [-1, -0.5, 0, 0.5, 1, 1.5, 2]) {
    const fit = uydur((p, s) => h([...p, g], s), fit0.p, ok5);
    profGama[ad].push([g, fit.ki2]);
  }
  const dk = profGama[ad].map(([, k]) => k - fit0.ki2);
  console.log('    γ: ' + profGama[ad].map(([g, k]) => `${g} → ${isr(k - fit0.ki2, 1)}`).join(' | ') + `   (γ = 0'a göre Δχ²; en küçük ${f2(Math.min(...dk), 1)}, en büyük ${f2(Math.max(...dk), 1)}: profil düz)`);
}

// ================= 4) Eski satırlar: karışık kaliteli menüler (tarih/evre belirsiz) =================
console.log('\n== 4) Önceki oturumun karışık kaliteli satırları (lüks, normal personel; tarih ve evre belirsiz)');
const ham = JSON.parse(readFileSync(new URL('./veri/restoran-rating-olcumleri.json', import.meta.url), 'utf8'));
const ID = { Süt: 117, Ekmek: 121, Tereyağı: 134, Peynir: 122, Kahve: 119, Turta: 123, Hamburger: 129, Lazanya: 130, Köfte: 131, Salata: 142, Samosa: 143, BalKabağı: 149, Kokteyl: 132, Portakal: 124, Elma: 125, Zencefilli: 126 };
const eski = ham.oncekiOturumOzeti.satirlar.filter((r) => r[6] === 'normal' && ['Tosuncuk 1-2-1 Süt Q0', 'Tosuncuk 1-2-1 Q10-12 normal', 'Star Deluxe 2-2-1', 'Tosuncuk eski 2-2-2 normal'].includes(r[0]));
const tahminEski = (r, gama, anahtar) => {
  const [ad, T, sg, bonus, menu, oturma] = r; const ids = Object.keys(menu).map((k) => ID[k]), qs = Object.values(menu);
  const s = { ids, qs, N: qs.length, bonus, lux: oturma === 'luks', maliyet: ids.map((id, i) => URUNLER[id].oran * fiyat(id, qs[i])), fiyatlar: ids.map((id, i) => fiyat(id, qs[i])), oranlar: ids.map((id) => URUNLER[id].oran) };
  return AGIRLIK[anahtar] ? wh(anahtar)([...fit0.p, gama], s) : H0(fit0.p, s);
};
const A = eski.find((r) => r[0] === 'Tosuncuk 1-2-1 Süt Q0'), B = eski.find((r) => r[0] === 'Tosuncuk 1-2-1 Q10-12 normal');
for (const r of eski) {
  const mt = Object.entries(r[4]).map(([k, q]) => `${k} Q${q}`).join(', ');
  console.log(`  ${r[0].padEnd(30)} ölçülen ${f2(r[1])} ± ${f2(r[2])} | düz ${f2(tahminEski(r, 0, 'döngü maliyeti (oran × fiyat)'))} · maliyet ağırlıklı ${f2(tahminEski(r, 1, 'döngü maliyeti (oran × fiyat)'))} | ${mt}`);
}
{
  const d = A[1] - B[1], sg = Math.hypot(A[2], B[2]);
  console.log(`  Aynı restoranın iki menüsü (Süt Q0 + üç pahalı Q12) − (hepsi Q10–12): ölçülen ${isr(d)} ± ${f2(sg)}`);
  for (const [ad, g] of [['düz ortalama (γ 0)', 0], ['γ 0,5', 0.5], ['maliyet ağırlıklı (γ 1)', 1], ['γ 2', 2]]) {
    const t = tahminEski(A, g, 'döngü maliyeti (oran × fiyat)') - tahminEski(B, g, 'döngü maliyeti (oran × fiyat)');
    console.log(`    ${ad.padEnd(26)} tahmin ${isr(t)} → ölçülene uzaklık ${f2(Math.abs(t - d) / sg, 1)}σ`);
  }
}

// ================= 5) Önerilen sınamalar: tahminler =================
console.log('\n== 5) Önerilen sınamaların tahminleri (eko, bonus 0,14; kalite eğrisi P0 uyumu)');
const tahmin = (ids, qs, gama, anahtar, bonus = 0.14) => {
  const s = { ids, qs, N: qs.length, bonus, lux: false, maliyet: ids.map((id, i) => URUNLER[id].oran * fiyat(id, qs[i])), fiyatlar: ids.map((id, i) => fiyat(id, qs[i])), oranlar: ids.map((id) => URUNLER[id].oran) };
  return wh(anahtar)([...fit0.p, gama], s);
};
const HIP = [['düz ortalama', 0, 'döngü maliyeti (oran × fiyat)'], ['maliyet ağırlıklı', 1, 'döngü maliyeti (oran × fiyat)'], ['fiyat ağırlıklı', 1, 'fiyat']];
const SINAMA = {
  'Takas: A = Süt Q12, Samosa Q6, Kokteyl Q2 · B = Süt Q2, Samosa Q6, Kokteyl Q12': [[[117, 143, 132], [12, 6, 2]], [[117, 143, 132], [2, 6, 12]]],
  'Takas (Q3): A = Süt Q12, Samosa Q6, Kokteyl Q3 · B = Süt Q3, Samosa Q6, Kokteyl Q12': [[[117, 143, 132], [12, 6, 3]], [[117, 143, 132], [3, 6, 12]]],
};
for (const [ad, [a, b]] of Object.entries(SINAMA)) {
  console.log(`  ${ad}`);
  for (const [hn, g, an] of HIP) { const ta = tahmin(a[0], a[1], g, an), tb = tahmin(b[0], b[1], g, an); console.log(`    ${hn.padEnd(20)} A ${f2(ta)} · B ${f2(tb)} · B − A ${isr(tb - ta)}`); }
}
// QUAL genişletme: M3 ürünleri Q12 (M4) ↔ M1 (ucuz ürünler Q12/Q11)
{
  const m1 = [[117, 119, 142, 143, 124, 125], [12, 12, 12, 12, 11, 11]], m4 = [[122, 123, 129, 131, 132, 126], [12, 12, 12, 12, 12, 12]];
  const m2 = [[117, 119, 142, 143, 124, 125], [5, 5, 5, 5, 5, 5]], m3 = [[122, 123, 129, 131, 132, 126], [5, 5, 5, 5, 5, 5]];
  const maliyetToplam = (m) => topla(m[0].map((id, i) => URUNLER[id].oran * fiyat(id, m[1][i])));
  console.log(`  QUAL döngü maliyeti (seviye 1, 4 Kasım fiyatı): M2 $${Math.round(maliyetToplam(m2))} · M3 $${Math.round(maliyetToplam(m3))} · M1 $${Math.round(maliyetToplam(m1))} · M4 (M3 ürünleri Q12) $${Math.round(maliyetToplam(m4))}`);
  console.log(`  Ürün başına ort. fiyat: ucuz küme (Q5) ${f2(ort(m2[0].map((id) => fiyat(id, 5))), 0)}, pahalı küme (Q5) ${f2(ort(m3[0].map((id) => fiyat(id, 5))), 0)}`);
}
