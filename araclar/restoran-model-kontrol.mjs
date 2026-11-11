// DentSimco — Restoran rating modeli: çeşit terimi (Çin formülü, 1,5 × N/16) ve en son döngülerin kontrolü.
//
// Kullanım: node araclar/restoran-model-kontrol.mjs [--k=0.27] [--sigma=0.19]
//
// Veri: araclar/veri/restoran-rating-olcumleri.json; "yeni" işaretli adımlar (11 Kasım akşamı: QUAL ECO3/LUX2'nin 4'er döngüsü,
// Dentium Q2 menüsünün 2 döngüsü) örnek dışı sınama için ayrılır: önce eski adımlarla uydurulur, yeni adımlar tahmin edilir.
//
// Modeller (hedef = (ort f(Q) + v (N − 6) + bonus) × L; lüks çarpanı L = 1,207 sabit; profesyonel personel modele girmez):
//   Araç   Kasım modeli (çeşit çarpan 0,037, lüks 1,25; serbest parametre yok)
//   M3     üstel eğri f = t + g (1 − e^(−Q/c)); v ve L serbest
//   M2     kırık doğru (nötr kalite Qn altında a_alt, üstünde a_üst; düz okuma a_alt ≥ a_üst); v ve L serbest
//   M3-Çin M3, ama v = 1,5/16 = 0,09375 (yazıdaki çeşit puanı: seçilen yemek sayısı / 16 × 1,5) ve L = 1,207 sabit
//   M2-Çin M2, aynı sabitlerle
import * as M from './restoran-rating-modelleri.mjs';

const { adimlar, ki2, modelleriUydur, uydur, fExp, qKirik, sinirla, ort } = M;
const arg = (ad, v) => { const a = process.argv.find((x) => x.startsWith(`--${ad}=`)); return a ? Number(a.slice(ad.length + 3)) : v; };
const K = arg('k', 0.27);
const V_CIN = 1.5 / 16; // 0,09375 / ürün
const L_BIZ = 1.207; // lüks çarpanı (kararımız; ölçüm 1,17–1,25)
const f2 = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x < 0 && Math.abs(x) >= 0.5 * 10 ** -d ? '−' : '') + Math.abs(x).toFixed(d).replace('.', ','));
const isr = (x, d = 2) => (x >= 0 ? '+' : '−') + f2(Math.abs(x), d);

const Sh = adimlar();
const Se = Sh.filter((s) => !s.yeni);
const Sy = Sh.filter((s) => s.yeni);

// ---- sabit çeşit + sabit lüks ile iki eğri ailesi ----
const M3c = (p, s) => sinirla((ort(s.qs.map((q) => fExp(q, p[0], p[1], p[2]))) + V_CIN * (s.N - 6) + s.bonus) * (s.lux ? L_BIZ : 1));
const M2c = (Qn) => (p, s) => sinirla((p[0] + ort(s.qs.map((q) => qKirik(q, Qn, p[1], p[2]))) + V_CIN * (s.N - 6) + s.bonus) * (s.lux ? L_BIZ : 1));
function uydurM3c(S) { return uydur(M3c, [-3.2, 8.4, 2.0], S, (p) => p[2] > 0.2 && p[2] < 40); }
const BASLANGIC_M2 = [[4.4, 0.8, 0.15], [4.4, 3, 0.15], [4.4, 7, 0.1]]; // alt eğim yumuşak, dik ve eşik benzeri çözümler
function uydurM2c(S, h0 = M2c, Qler = null) {
  let best = null;
  for (let Qn = 0.5; Qn <= 12.001; Qn += 0.5) {
    if (Qler && !Qler.includes(Qn)) continue;
    const h = h0(Qn);
    for (const b0 of BASLANGIC_M2) {
      const u = uydur(h, b0, S, (p) => p[1] >= p[2] - 1e-9);
      if (!best || u.ki2 < best.ki2) best = { ...u, Qn, hedef: h };
    }
  }
  return best;
}
const fM3 = (p, q) => fExp(q, p[0], p[1], p[2]);
const fM2 = (p, Qn, q) => p[0] + qKirik(q, Qn, p[1], p[2]);

console.log(`Adım ${Sh.length}: eski ${Se.length}, yeni ${Sy.length} · k ${f2(K)} · çeşit v = 1,5/16 = ${f2(V_CIN, 5)} · lüks ×${f2(L_BIZ, 3)}\n`);

// ---- 1) Eski adımlarla uydur ----
const Re = modelleriUydur(Se);
const c3e = uydurM3c(Se), c2e = uydurM2c(Se);
const modeller = [
  { ad: 'Araç (Kasım)', hedef: Re.M1.hedef, p: Re.M1.p },
  { ad: 'M3', hedef: Re.M3.hedef, p: Re.M3.p },
  { ad: 'M2 düz', hedef: Re.M2duz.hedef, p: Re.M2duz.p },
  { ad: 'M3-Çin', hedef: M3c, p: c3e.p },
  { ad: 'M2-Çin', hedef: c2e.hedef, p: c2e.p },
];
console.log('1) Eski adımlarla uydurulan modeller (yalnız eski adımlar; χ²):');
for (const m of modeller) console.log(`  ${m.ad.padEnd(13)} χ² ${f2(ki2(m.hedef, m.p, Se), 1)}${m.ad === 'M3-Çin' ? `  (f = ${f2(c3e.p[0])} + ${f2(c3e.p[1])} (1 − e^(−Q/${f2(c3e.p[2])})))` : ''}${m.ad === 'M2-Çin' ? `  (Qn ${f2(c2e.Qn, 1)}, B ${f2(c2e.p[0])}, eğim ${f2(c2e.p[1])}/${f2(c2e.p[2])})` : ''}`);
console.log(`  M3 serbest: v ${f2(Re.M3.p[3], 3)}, L ${f2(Re.M3.p[4], 3)}; M2 düz serbest: Qn ${f2(Re.M2duz.Qn ?? NaN, 1)}, v ${f2(Re.M2duz.p[3], 3)}, L ${f2(Re.M2duz.p[4], 3)}`);

// ---- 2) Yeni adımları tahmin et ----
console.log('\n2) Örnek dışı: yeni adımlar (önceki rating → gözlenen; modelin tahmini r\' = r + k (hedef − r); z = (gözlenen − tahmin)/σ)');
const SIGMA = arg('sigma', 0.19);
const gruplar = [...new Set(Sy.map((s) => s.ad))];
const topla = Object.fromEntries(modeller.map((m) => [m.ad, {}]));
for (const g of gruplar) {
  const adimGrup = Sy.filter((s) => s.ad === g);
  const s0 = adimGrup[0];
  console.log(`\n  ${g} [${s0.lux ? 'lüks' : 'eko'}, N ${s0.N}, Q ${s0.qs.join('-')}, bonus ${f2(s0.bonus)}, ${adimGrup.length} adım]`);
  console.log('  adım | r0 → r1 | adım başına hedef tahmini (r0 + (r1 − r0)/k) | ' + modeller.map((m) => `${m.ad}: hedef / tahmin / z`).join(' | '));
  for (const s of adimGrup) {
    const cell = modeller.map((m) => {
      const T = m.hedef(m.p, s);
      const mu = s.r0 + K * (T - s.r0);
      const tahmin = Math.max(0, mu);
      const z = (s.r1 - mu) / SIGMA;
      topla[m.ad][g] = (topla[m.ad][g] ?? 0) + (s.sansur ? 0 : z * z);
      return `${f2(T)} / ${f2(tahmin)} / ${isr(z, 1)}`;
    });
    console.log(`  ${s.bitis.slice(5)} | ${f2(s.r0)} → ${f2(s.r1)} | ${f2(s.r0 + (s.r1 - s.r0) / K)} | ${cell.join(' | ')}`);
  }
}
console.log('\n  Toplam χ² (yeni adımlar):');
console.log('  grup | ' + modeller.map((m) => m.ad).join(' | '));
for (const g of [...gruplar, 'hepsi']) {
  console.log(`  ${g} | ` + modeller.map((m) => f2(g === 'hepsi' ? Object.values(topla[m.ad]).reduce((a, b) => a + b, 0) : topla[m.ad][g], 1)).join(' | '));
}

// ---- 3) Hepsiyle yeniden uydur ----
console.log('\n3) Bütün adımlarla yeniden uydurma:');
const Rh = modelleriUydur(Sh);
const c3h = uydurM3c(Sh), c2h = uydurM2c(Sh);
const tablo = [
  ['M3 (v, L serbest)', Rh.M3.ki2, (q) => fM3(Rh.M3.p, q), `v ${f2(Rh.M3.p[3], 3)}, L ${f2(Rh.M3.p[4], 3)}`],
  ['M2 düz (v, L serbest)', Rh.M2duz.ki2, (q) => Rh.M2duz.dogrusal ? Rh.M2duz.p[0] + Rh.M2duz.p[1] * (q - 6) : fM2(Rh.M2duz.p, Rh.M2duz.Qn, q), `Qn ${f2(Rh.M2duz.Qn ?? NaN, 1)}, v ${f2(Rh.M2duz.p[3], 3)}, L ${f2(Rh.M2duz.p[4], 3)}`],
  ['M3-Çin', c3h.ki2, (q) => fM3(c3h.p, q), `f = ${f2(c3h.p[0])} + ${f2(c3h.p[1])} (1 − e^(−Q/${f2(c3h.p[2])}))`],
  ['M2-Çin', c2h.ki2, (q) => fM2(c2h.p, c2h.Qn, q), `Qn ${f2(c2h.Qn, 1)}, B ${f2(c2h.p[0])}, eğim ${f2(c2h.p[1])} / ${f2(c2h.p[2])}`],
];
console.log('  model | χ² | ' + [0, 1, 2, 3, 4, 5, 6, 8, 12].map((q) => `f(Q${q})`).join(' | ') + ' | parametreler');
for (const [ad, ki, f, par] of tablo) console.log(`  ${ad} | ${f2(ki, 1)} | ` + [0, 1, 2, 3, 4, 5, 6, 8, 12].map((q) => f2(f(q))).join(' | ') + ` | ${par}`);
console.log(`  Araç (Kasım) | ${f2(ki2(Rh.M1.hedef, Rh.M1.p, Sh), 1)} | ` + [0, 1, 2, 3, 4, 5, 6, 8, 12].map((q) => f2(0.4 + 5.89 * (1 - Math.exp(-q / 3.43)))).join(' | '));
const dy = M.doygun(Sh);
console.log(`  Doygun (her restorana ayrı hedef) | ${f2(dy.ki2, 1)} (${dy.np} parametre)`);
const gk = [...new Set(Sh.map((s) => s.grup))];
console.log('\n  Gruba göre χ² (bütün adımlar; grup adım sayısı): ' + gk.map((g) => `${g} (${Sh.filter((s) => s.grup === g).length})`).join(' | '));
for (const [ad, h, p] of [['M3 serbest', Rh.M3.hedef, Rh.M3.p], ['M2 düz serbest', Rh.M2duz.hedef, Rh.M2duz.p], ['M3-Çin', M3c, c3h.p], ['M2-Çin', c2h.hedef, c2h.p], ['Araç', Rh.M1.hedef, Rh.M1.p]]) {
  console.log(`  ${ad.padEnd(15)} ` + gk.map((g) => f2(ki2(h, p, Sh.filter((s) => s.grup === g)), 1)).join(' | '));
}
console.log('  Doygun'.padEnd(17) + gk.map((g) => f2(Object.entries(dy.hedefler).filter(([, h]) => h.ornek.grup === g).reduce((a, [ad]) => a + ki2(() => dy.hedefler[ad].T, [], Sh.filter((s) => s.ad === ad)), 0), 1)).join(' | '));
console.log('\n  Ölçülen hedefler (doygun, k ' + f2(K) + '; 1σ aralığı) — yeni menüler ayrı:');
for (const ad of ['Q0 restoranı', 'Q0 restoranı (Q1 dönemi)', 'Q0 restoranı (Q2 dönemi)', 'QUAL1LUX2', 'QUAL1LUX2 (yeni menü)', 'QUAL10ECO3', 'QUAL10ECO3 (yeni menü)', 'QUAL10ECO2', 'QUAL1LUX3']) {
  const h = dy.hedefler[ad]; if (!h) continue;
  console.log(`    ${ad.padEnd(28)} ${f2(h.T)} (${f2(h.lo)} … ${f2(h.hi)}) · ${h.n} adım`);
}

// ---- 4) Çeşit profili: v sabitlenir, geri kalan parametreler serbest ----
console.log('\n4) Çeşit katsayısı v (ürün başına, toplanan) profili: bütün adımlar; Δχ² = en iyi uyuma göre (L = 1,207 sabit)');
const vler = [-0.05, 0, 0.03, 0.06, V_CIN, 0.12, 0.15, 0.2];
const profil = (aile) => vler.map((v) => {
  if (aile === 'M3') {
    const h = (p, s) => sinirla((ort(s.qs.map((q) => fExp(q, p[0], p[1], p[2]))) + v * (s.N - 6) + s.bonus) * (s.lux ? L_BIZ : 1));
    return [v, uydur(h, [-3.2, 8.4, 2.0], Sh, (p) => p[2] > 0.2 && p[2] < 40).ki2];
  }
  const h0 = (Qn) => (p, s) => sinirla((p[0] + ort(s.qs.map((q) => qKirik(q, Qn, p[1], p[2]))) + v * (s.N - 6) + s.bonus) * (s.lux ? L_BIZ : 1));
  return [v, uydurM2c(Sh, h0, [2, 2.5, 3, 4, 5, 5.5, 6, 7, 8]).ki2];
});
for (const aile of ['M3', 'M2']) {
  const pr = profil(aile); const mn = Math.min(...pr.map((x) => x[1]));
  console.log(`  ${aile}: ` + pr.map(([v, k]) => `v ${f2(v, 3)}: ${f2(k - mn, 1)}`).join('  ') + `  (en iyi χ² ${f2(mn, 1)})`);
}

// ---- 5) İleri tahmin: önerilen (M3-Çin ve M2-Çin) ve araç ile yeni menülerde sonraki döngüler ----
console.log('\n5) İleri tahmin (bu menü sürerse; r\' = r + k (hedef − r)):');
const gel = [
  { ad: 'QUAL10ECO3 yeni menü (Q8,Q10,Q7×4; eko; bonus 0,83)', r: 5.02, s: { qs: [8, 10, 7, 7, 7, 7], N: 6, bonus: 0.83, lux: false } },
  { ad: 'QUAL1LUX2 yeni menü (Q4×6; lüks; bonus 0,83)', r: 6.22, s: { qs: [4, 4, 4, 4, 4, 4], N: 6, bonus: 0.83, lux: true } },
  { ad: 'Dentium Q2 (Q2×6; eko; bonus 0,14)', r: 0.40, s: { qs: [2, 2, 2, 2, 2, 2], N: 6, bonus: 0.14, lux: false } },
];
const ileri = [
  { ad: 'Araç', hedef: Re.M1.hedef, p: Re.M1.p },
  { ad: 'M3-Çin (bütün adımlar)', hedef: M3c, p: c3h.p },
  { ad: 'M2-Çin (bütün adımlar)', hedef: c2h.hedef, p: c2h.p },
];
for (const g of gel) {
  console.log(`  ${g.ad}, şimdi ${f2(g.r)}`);
  for (const m of ileri) {
    const T = m.hedef(m.p, g.s); let r = g.r; const yol = [];
    for (let i = 0; i < 6; i++) { r = r + K * (T - r); yol.push(f2(r)); }
    console.log(`    ${m.ad.padEnd(24)} hedef ${f2(T)} → ${yol.join(', ')}`);
  }
}
