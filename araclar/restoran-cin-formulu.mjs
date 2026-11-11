// DentSimco — Çinli oyuncunun (tgw / TGW-groupp, gitee.com/lclbb/sc) restoran rating formülünü ölçümlerimizle sınar.
//
// Kullanım: node araclar/restoran-cin-formulu.mjs [--k=0.27] [--sigma=0.19]
//
// Yazıdaki formül (betikte yok, yalnız şirket profili yazısında):
//   hedef = 3·ortQ/12 + 1,5·N/16 + (lüks 0,5 | eko 0) + (profesyonel 2,5 | geçici 1,25) + fiyatPuanı + bonus
//   fiyatPuanı = 0,5 (fiyat ≤ 96) | 0,5 − (fiyat − 96)/508 (fiyat > 96; $350'de 0)
//   bonus = 0,01 × CMO puanı + 0,02 × satış hızı bonusu (oyunun rehberiyle aynı; ölçülen bonusu kullanıyoruz)
// Karşılaştırma: doygun model, M3 (önerimiz), M3 + fiyat puanı, Çin formülü (olduğu gibi / ölçekli / katsayıları serbest).
// Tosuncuk (bonusu bilinmiyor, 0,35 varsayımı) ve yazarın kendi ekranı (0,00 → 0,10) ayrıca.
import * as M from './restoran-rating-modelleri.mjs';
const S0 = M.adimlar();
const ort = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sinirla = (x) => Math.min(10, Math.max(0, x));
const f2 = (x, d = 2) => (x < 0 && Math.abs(x) >= 0.5 * 10 ** -d ? '−' : '') + Math.abs(x).toFixed(d).replace('.', ',');

// eksik fiyatı aynı restoranın komşu adımından doldur
const S = [];
const sonFiyat = new Map();
for (const s of S0) { if (s.fiyat != null) sonFiyat.set(s.ad, s.fiyat); }
const ilkFiyat = new Map();
for (const s of S0) if (s.fiyat != null && !ilkFiyat.has(s.ad)) ilkFiyat.set(s.ad, s.fiyat);
const gecici = new Map();
for (const s of S0) {
  const f = s.fiyat ?? gecici.get(s.ad) ?? ilkFiyat.get(s.ad);
  gecici.set(s.ad, f);
  S.push({ ...s, fiyat: f });
}
const fp = (p) => (p <= 96 ? 0.5 : 0.5 - (p - 96) / 508);

const CIN = (_, s) => sinirla((3 * ort(s.qs)) / 12 + (1.5 * s.N) / 16 + (s.lux ? 0.5 : 0) + 1.25 + fp(s.fiyat) + s.bonus);
const fM3 = (q) => -3.228 + 8.368 * (1 - Math.exp(-Math.max(0, q) / 2.027));
const M3 = (_, s) => sinirla((ort(s.qs.map(fM3)) + 0.06 * (s.N - 6) + s.bonus) * (s.lux ? 1.207 : 1));

// Nelder–Mead (modeldeki ile aynı)
function nm(fn, x0, it = 6000) {
  const n = x0.length;
  let P = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + 0.25 * Math.abs(v) + 0.1 : v)))];
  let F = P.map(fn);
  for (let q = 0; q < it; q++) {
    const o = F.map((v, i) => i).sort((i, j) => F[i] - F[j]); P = o.map((i) => P[i]); F = o.map((i) => F[i]);
    if (q > 200 && F[n] - F[0] < 1e-10) break;
    const c = P.slice(0, -1).reduce((a, s) => a.map((v, i) => v + s[i] / n), Array(n).fill(0));
    const xr = c.map((v, i) => v + (v - P[n][i])), fr = fn(xr);
    if (fr < F[0]) { const xe = c.map((v, i) => v + 2 * (v - P[n][i])), fe = fn(xe); if (fe < fr) { P[n] = xe; F[n] = fe; } else { P[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { P[n] = xr; F[n] = fr; }
    else { const xc = c.map((v, i) => v + 0.5 * (P[n][i] - v)), fc = fn(xc); if (fc < F[n]) { P[n] = xc; F[n] = fc; } else { P = P.map((s) => s.map((v, i) => P[0][i] + 0.5 * (v - P[0][i]))); F = P.map(fn); } }
  }
  const i = F.indexOf(Math.min(...F));
  return [P[i], F[i]];
}
function uydur(h, p0, Sx = S) {
  const fn = (p) => M.ki2(h, p, Sx);
  let b = nm(fn, p0);
  for (let r = 0; r < 4; r++) { const c = nm(fn, b[0].map((v) => v * (1 + 0.2 * (r - 1.5)) + 0.07 * (r - 1.5))); if (c[1] < b[1]) b = c; }
  return nm(fn, b[0]);
}

// Çin biçimi, katsayılar serbest: hedef = a + b·ortQ + c·N + d·lüks + e·fiyatPuanı + bonus (lüks toplanan)
const CINs = (p, s) => sinirla(p[0] + p[1] * ort(s.qs) + p[2] * s.N + p[3] * (s.lux ? 1 : 0) + p[4] * fp(s.fiyat) + s.bonus);
// Çin biçimi, yalnız ölçek serbest: hedef = α × (Çin toplamı bonussuz) + β + bonus
const CINa = (p, s) => sinirla(p[0] * ((3 * ort(s.qs)) / 12 + (1.5 * s.N) / 16 + (s.lux ? 0.5 : 0) + 1.25 + fp(s.fiyat)) + p[1] + s.bonus);
// M3 serbest + fiyat terimi γ·(fiyatPuanı − 0,5): Çin'in fiyat puanı gerçek mi?
const fE = (q, t, g, c) => t + g * (1 - Math.exp(-Math.max(0, q) / c));
const M3f = (p, s) => { const [t, g, c, v, L, gam] = p; return sinirla((ort(s.qs.map((q) => fE(q, t, g, c))) + v * (s.N - 6) + s.bonus + gam * (fp(s.fiyat) - 0.5)) * (s.lux ? L : 1)); };
const M3s = (p, s) => { const [t, g, c, v, L] = p; return sinirla((ort(s.qs.map((q) => fE(q, t, g, c))) + v * (s.N - 6) + s.bonus) * (s.lux ? L : 1)); };

const D = M.doygun(S);
const r3 = uydur(M3s, [-3.2, 8.4, 2.0, 0.06, 1.2]);
const r3f = uydur(M3f, [...r3[0], 0]);
const rs = uydur(CINs, [1.5, 0.25, 0.09, 0.5, 1]);
const ra = uydur(CINa, [1, 0]);

console.log(`Adım: ${S.length} (sansürlü ${S.filter((s) => s.sansur).length}); fiyatlar: ${[...new Set(S.map((s) => s.fiyat))].sort((a, b) => a - b).join(', ')}`);
console.log('\nModel | serbest parametre | χ²');
console.log(`Doygun (her restorana ayrı hedef) | ${D.np} | ${f2(D.ki2, 1)}`);
console.log(`M3 (önerimiz; sabit değerler) | 0 (5 uydurulmuş) | ${f2(M.ki2(M3, [], S), 1)}`);
console.log(`M3 yeniden uydurulmuş | 5 | ${f2(r3[1], 1)}  p = ${r3[0].map((x) => f2(x, 3)).join(' / ')}`);
console.log(`M3 + fiyat puanı (γ) | 6 | ${f2(r3f[1], 1)}  γ = ${f2(r3f[0][5], 2)} (Çin: 1)`);
console.log(`Çin formülü olduğu gibi | 0 | ${f2(M.ki2(CIN, [], S), 1)}`);
console.log(`Çin formülü × α + β (ölçek ve kayma serbest) | 2 | ${f2(ra[1], 1)}  α ${f2(ra[0][0], 2)}, β ${f2(ra[0][1], 2)}`);
console.log(`Çin biçimi, bütün katsayılar serbest (doğrusal kalite, toplanan lüks) | 5 | ${f2(rs[1], 1)}  a ${f2(rs[0][0])}, Q başına ${f2(rs[0][1], 3)}, ürün başına ${f2(rs[0][2], 3)}, lüks +${f2(rs[0][3])}, fiyat ${f2(rs[0][4])}`);

// γ için profil (Δχ² = 1 ve 4)
{
  const prof = [];
  for (let g = -3; g <= 3.001; g += 0.25) {
    const h = (p, s) => M3f([...p, g], s);
    const r = uydur(h, r3[0]);
    prof.push([g, r[1]]);
  }
  const min = Math.min(r3f[1], ...prof.map((x) => x[1]));
  console.log('\nγ profili (en iyi γ ' + f2(r3f[0][5]) + ' ile Δχ²): ' + prof.map(([g, v]) => `${f2(g)}:${f2(v - min, 1)}`).join('  '));
}

// Restoran başına: ölçülen hedef (doygun) – Çin – M3
console.log('\nRestoran | ölçülen hedef (1σ) | Çin | M3');
const gor = new Set();
for (const [ad, h] of Object.entries(D.hedefler)) {
  const s = h.ornek;
  const anahtar = s.grup + (s.grup === 'ANARCHY' ? '' : ad);
  if (gor.has(anahtar)) continue; gor.add(anahtar);
  let T = h.T, lo = h.lo, hi = h.hi, n = h.n;
  if (s.grup === 'ANARCHY') { // 10 restoranı birleştir
    const G = S.filter((x) => x.grup === 'ANARCHY');
    let b = [0, Infinity]; for (let t = 3; t <= 9; t += 0.005) { const v = M.ki2(() => t, [], G); if (v < b[1]) b = [t, v]; }
    lo = b[0]; hi = b[0]; while (M.ki2(() => lo, [], G) - b[1] < 1) lo -= 0.005; while (M.ki2(() => hi, [], G) - b[1] < 1) hi += 0.005;
    T = b[0]; n = G.length;
  }
  const ss = { ...s, fiyat: S.find((x) => x.ad === s.ad).fiyat };
  console.log(`${s.grup === 'ANARCHY' ? 'ANARCHY (10 restoran)' : ad} [${s.lux ? 'lüks' : 'eko'}, N ${s.N}, Q ${s.qs.join('-')}, bonus ${f2(s.bonus)}, $${ss.fiyat}, ${n} adım] | ${f2(T)} (${f2(lo)} … ${f2(hi)}) | ${f2(CIN(0, ss))} | ${f2(M3(0, ss))}`);
}

// Tosuncuk (modellere girmeyen; bonus bilinmiyor, 0,35 varsayımı) — ölçülen hedefler tosuncuk.mjs'den (k 0,27)
const tq = [12, 12, 10, 8], tN = 4;
const tcin = (pro, b) => (3 * ort(tq)) / 12 + (1.5 * tN) / 16 + 0.5 + (pro ? 2.5 : 1.25) + 0.5 + b;
const tm3 = (pro, b) => (ort(tq.map(fM3)) + 0.06 * (tN - 6) + b + (pro ? 3.94 : 0)) * 1.207;
console.log('\nTosuncuk (lüks, Süt Q12 Lazanya Q12 Köfte Q10 Kokteyl Q8, $100; bonus 0,35 varsayımı):');
console.log(`  profesyonel: Çin ${f2(tcin(true, 0.35))} · M3 + pro (+3,94 lüks içinde) ${f2(Math.min(10, tm3(true, 0.35)))}`);
console.log(`  ekonomi    : Çin ${f2(tcin(false, 0.35))} · M3 ${f2(tm3(false, 0.35))}`);
console.log(`  pro farkı  : Çin ${f2(tcin(true, 0) - tcin(false, 0))} · ölçülen +4,75 ± 0,54 (lüks sonrası)`);

// Çin'in iddiası: "çift lüks (lüks + profesyonel), 6 ürün Q6 → 10"
for (const b of [0, 0.5, 1]) {
  const cin = 3 * 6 / 12 + 1.5 * 6 / 16 + 0.5 + 2.5 + 0.5 + b;
  const m3 = (fM3(6) + b + 3.94) * 1.207;
  console.log(`Çift lüks 6×Q6, bonus ${f2(b)}: Çin ${f2(cin)} · M3 + pro ${f2(m3)} (sınır 10)`);
}

// Çin'in kendi ekranı: eko, 2-2-2, Süt Q0–2, Kahve tozu Q2, Salata Q0, Samosa Q0, Portakal suyu Q1, Elma suyu Q0–1, $350; 0,00 → 0,10
for (const [ad, qs] of [['alt uç', [0, 2, 0, 0, 1, 0]], ['orta', [1, 2, 0, 0, 1, 0.5]], ['üst uç', [2, 2, 0, 0, 1, 1]]]) {
  for (const b of [0, 0.5, 1]) {
    const cin = (3 * ort(qs)) / 12 + (1.5 * 6) / 16 + 1.25 + fp(350) + b;
    const m3 = ort(qs.map(fM3)) + b;
    const bek = (T) => Math.max(0, 0.27 * T);
    console.log(`Çin ekranı (${ad} kalite, bonus ${f2(b)}): hedef Çin ${f2(cin)} → beklenen ilk adım ${f2(bek(cin))} (gözlenen 0,10; fark ${f2((bek(cin) - 0.1) / 0.19, 1)}σ) · M3 ${f2(m3)} → ${f2(bek(m3))}`);
  }
}
