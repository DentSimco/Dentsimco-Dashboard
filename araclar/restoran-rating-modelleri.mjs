// DentSimco — Restoran rating modellerini ölçümlerle karşılaştırır.
//
// Kullanım: node araclar/restoran-rating-modelleri.mjs [seçenekler]
//   --k=0.27          döngü başına yaklaşma oranı (sabit)
//   --sigma=0.19      adım gürültüsü
//   --eco1            QUAL10ECO1'in ilk adımını (7,86 → 6,74) dışarıda bırak
//   --q1haric         Dentium Q1 dönemini ($350, neredeyse boş restoran) dışarıda bırak
//   --skyBonus=0.96   Sky bonusu (varsayılan ekrandaki 1,05)
//   --skyV222         Sky V'nin 2-2-2'ye geçtiği varsayılan son 2 adımını ekle
//   --buyumeHaric     büyüme evresinde başlayan ya da biten adımları çıkar
//   --json=yol        sonuçları JSON olarak da yaz
//
// Veri: araclar/veri/restoran-rating-olcumleri.json (adım = [bitiş, r0, r1, doluluk, fiyat, ek?]).
// Dinamik: r1 = r0 + k (hedef − r0) + ε, ε ~ N(0, σ); 0,00'da biten adım sansürlü sayılır.
//
// Modeller (hepsinde bonus toplanır, lüks hepsini çarpar; N = menüdeki ürün sayısı, 1-1-1 = 3, 2-2-2 = 6):
//   M1   Araç (Kasım): hedef = (ort f(Q) × (1 + 0,037 (N − 6)) + bonus) × oturma; f(Q) = 0,4 + 5,89 (1 − e^(−Q/3,43)); lüks 1,25.
//   M1y  Aynı biçim, yeniden uydurulmuş: f = t + g (1 − e^(−Q/c)); çeşit çarpanı w; lüks L.
//   M3   Üstel eğri + toplanan çeşit: hedef = (ort f(Q) + v (N − 6) + bonus) × L.
//   M2   Kırık doğru + toplanan çeşit: hedef = (B + ort q(Q) + v (N − 6) + bonus) × L;
//        q(Q) = a_alt (Q − Qn) (Q < Qn), a_üst (Q − Qn) (Q ≥ Qn); Qn nötr kalite (ızgarayla aranır).
//          M2-düz  : a_alt ≥ a_üst  (kaydın düz okuması: düşük kalitenin zararı arttı, yüksek kalitenin artısı azaldı)
//          M2-ters : a_alt ≤ a_üst  (ters okuma: düşük kalitenin zararı azaldı, yüksek kalitenin artısı arttı)
//          M2-doğru: a_alt = a_üst  (doğrusal)
//          Oyuncu  : a = 0,5, Qn = 6 (Q0 −3 … Q12 +3)
//   Doygun: her restoran için ayrı serbest hedef (modellerin ulaşabileceği en iyi uyum; karşılaştırma tabanı).
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (ad, varsayilan) => { const a = process.argv.find((x) => x.startsWith(`--${ad}=`)); return a ? a.slice(ad.length + 3) : varsayilan; };
const bayrak = (ad) => process.argv.includes(`--${ad}`);
const K = Number(arg('k', 0.27));
const SIGMA = Number(arg('sigma', 0.19));
const SKY_BONUS = arg('skyBonus', null);
const veri = JSON.parse(readFileSync(new URL('./veri/restoran-rating-olcumleri.json', import.meta.url), 'utf8'));

// Büyüme evresi: 23 Ekim 15:00 – 30 Ekim 15:00 UTC
const BUYUME = [Date.parse('2026-10-23T15:00:00Z'), Date.parse('2026-10-30T15:00:00Z')];
const zaman = (s) => Date.parse(`${s.replace(' ', 'T')}:00+03:00`);

export function adimlar() {
  const out = [];
  for (const p of veri.oyuncular) {
    const pk = p.ad.split(' ')[0];
    for (const r of p.restoranlar) {
      const menu = typeof r.menu === 'string' ? p.menuler[r.menu] : r.menu || p.ortakMenu;
      const grup = pk === 'Dentium' ? (r.ad.includes('Q1') ? 'Dentium Q1' : 'Dentium Q0') : pk;
      if (grup === 'Dentium Q1' && bayrak('q1haric')) continue;
      let bonus = p.bonus?.toplam ?? 0;
      if (pk === 'Sky' && SKY_BONUS != null) bonus = Number(SKY_BONUS);
      r.adim.forEach((a, i) => {
        const [bitis, r0, r1, occ, fiyat, ek] = a;
        if (r0 == null || r1 == null) return;
        let m = menu, ad = r.ad;
        if (r.ad === 'Sky Eco Resto V' && bitis > '2026-11-01 19:38') {
          if (!bayrak('skyV222') || bitis < '2026-11-02 19:38') return; // geçiş döngüsü belirsiz
          m = r.menuSonra; ad = 'Sky Eco Resto V (2-2-2)';
        }
        if (bayrak('eco1') && r.ad === 'QUAL10ECO1' && i === 0) return;
        const son = zaman(bitis), bas = son - 12 * 3600e3;
        const buyume = (bas < BUYUME[1] && son > BUYUME[0]);
        if (buyume && bayrak('buyumeHaric')) return;
        const qs = Object.values(m);
        out.push({ grup, ad, i, bitis, r0, r1, occ, fiyat, lux: r.oturma === 'luks', bonus: ek?.bonus ?? bonus, qs, N: qs.length, buyume, sansur: r1 <= 0.005 });
      });
    }
  }
  return out;
}

// ---- yardımcılar ----
const ort = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sinirla = (x) => Math.min(10, Math.max(0, x));
const fExp = (q, t, g, c) => t + g * (1 - Math.exp(-Math.max(0, q) / c));
const qKirik = (q, Qn, aLo, aHi) => (q < Qn ? aLo * (q - Qn) : aHi * (q - Qn));
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
/** −2 log olabilirlik (sabit terimler hariç): sansürsüz adımda ((r1 − μ)/σ)², sansürlüde −2 log P(r1 ≤ 0,005). */
export function ki2(hedef, p, S, k = K) {
  let t = 0;
  for (const s of S) {
    const mu = s.r0 + k * (hedef(p, s) - s.r0);
    t += s.sansur ? -2 * Math.log(Math.max(1e-300, Phi((0.005 - mu) / SIGMA))) : ((s.r1 - mu) / SIGMA) ** 2;
  }
  return t;
}
function nm(fn, x0, it = 4000) {
  const n = x0.length;
  if (!n) return [[], fn([])];
  let S = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + 0.25 * Math.abs(v) + 0.1 : v)))];
  let F = S.map(fn);
  for (let q = 0; q < it; q++) {
    const o = F.map((v, i) => i).sort((i, j) => F[i] - F[j]); S = o.map((i) => S[i]); F = o.map((i) => F[i]);
    if (q > 200 && F[n] - F[0] < 1e-9) break;
    const c = S.slice(0, -1).reduce((a, s) => a.map((v, i) => v + s[i] / n), Array(n).fill(0));
    const xr = c.map((v, i) => v + (v - S[n][i])), fr = fn(xr);
    if (fr < F[0]) { const xe = c.map((v, i) => v + 2 * (v - S[n][i])), fe = fn(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else { const xc = c.map((v, i) => v + 0.5 * (S[n][i] - v)), fc = fn(xc); if (fc < F[n]) { S[n] = xc; F[n] = fc; } else { S = S.map((s) => s.map((v, i) => S[0][i] + 0.5 * (v - S[0][i]))); F = S.map(fn); } }
  }
  const i = F.indexOf(Math.min(...F));
  return [S[i], F[i]];
}
// birkaç başlangıçla en iyi
function uydur(hedef, p0, S, gecerli = () => true) {
  const fn = (p) => (gecerli(p) ? ki2(hedef, p, S) : 1e12);
  let best = nm(fn, p0);
  for (let r = 0; r < 3; r++) { const b = nm(fn, best[0].map((v) => v * (1 + 0.15 * (r - 1)) + 0.05 * (r - 1))); if (b[1] < best[1]) best = b; }
  best = nm(fn, best[0]);
  return { p: best[0], ki2: best[1] };
}

// ---- modeller ----
const M1h = (p, s) => sinirla((ort(s.qs.map((q) => fExp(q, 0.4, 5.89, 3.43))) * (1 + 0.037 * (s.N - 6)) + s.bonus) * (s.lux ? 1.25 : 1));
const M1yh = (p, s) => { const [t, g, c, w, L] = p; return sinirla((ort(s.qs.map((q) => fExp(q, t, g, c))) * (1 + w * (s.N - 6)) + s.bonus) * (s.lux ? L : 1)); };
const M3h = (p, s) => { const [t, g, c, v, L] = p; return sinirla((ort(s.qs.map((q) => fExp(q, t, g, c))) + v * (s.N - 6) + s.bonus) * (s.lux ? L : 1)); };
const M2h = (Qn) => (p, s) => { const [B, aLo, aHi, v, L] = p; return sinirla((B + ort(s.qs.map((q) => qKirik(q, Qn, aLo, aHi))) + v * (s.N - 6) + s.bonus) * (s.lux ? L : 1)); };
const M2dh = (p, s) => { const [B, a, v, L] = p; return sinirla((B + a * (ort(s.qs) - 6) + v * (s.N - 6) + s.bonus) * (s.lux ? L : 1)); };
const OYh = (p, s) => { const [B, v, L] = p; return sinirla((B + 0.5 * (ort(s.qs) - 6) + v * (s.N - 6) + s.bonus) * (s.lux ? L : 1)); };
const expOk = (p) => p[2] > 0.2 && p[2] < 40 && p[4] > 0.3 && p[4] < 3;

export function modelleriUydur(S) {
  const R = {};
  R.M1 = { ad: 'Araç (Kasım)', ...{ p: [], ki2: ki2(M1h, [], S) }, np: 0, hedef: M1h };
  R.M1y = { ad: 'Kasım biçimi, yeniden uydurulmuş (çeşit çarpan)', ...uydur(M1yh, [0.3, 5.0, 3.0, 0.03, 1.2], S, expOk), np: 5, hedef: M1yh };
  R.M3 = { ad: 'Üstel eğri + toplanan çeşit', ...uydur(M3h, [0.3, 5.0, 3.0, 0.15, 1.2], S, expOk), np: 5, hedef: M3h };
  R.M2dogru = { ad: 'Doğrusal kalite + toplanan çeşit', ...uydur(M2dh, [4.5, 0.4, 0.1, 1.2], S, (p) => p[3] > 0.3), np: 4, hedef: M2dh };
  R.Oyuncu = { ad: 'Oyuncunun ölçeği (Q başına 0,5) + toplanan çeşit', ...uydur(OYh, [4.5, 0.1, 1.2], S, (p) => p[2] > 0.3), np: 3, hedef: OYh };
  // M2: Qn ızgarası; her Qn için serbest uyum. Düz/ters kısıtı ihlal edilirse o Qn için en iyi kısıtlı çözüm doğrusaldır.
  const izgara = [];
  for (let Qn = 0.5; Qn <= 12.001; Qn += 0.5) {
    const h = M2h(Qn);
    const u = uydur(h, [4.4, 0.8, 0.15, 0.1, 1.2], S, (p) => p[4] > 0.3);
    izgara.push({ Qn, ...u, hedef: h });
  }
  const serbest = izgara.reduce((a, b) => (b.ki2 < a.ki2 ? b : a));
  const kisitli = (kosul) => {
    const uygun = izgara.filter((g) => kosul(g.p[1], g.p[2]));
    const b = uygun.length ? uygun.reduce((a, c) => (c.ki2 < a.ki2 ? c : a)) : null;
    return b && b.ki2 < R.M2dogru.ki2 ? b : null;
  };
  const duz = kisitli((lo, hi) => lo >= hi), ters = kisitli((lo, hi) => lo <= hi);
  R.M2serbest = { ad: 'Kırık doğru + toplanan çeşit (yön serbest)', p: serbest.p, ki2: serbest.ki2, Qn: serbest.Qn, np: 6, hedef: serbest.hedef };
  R.M2duz = duz ? { ad: 'Kırık doğru, kaydın düz okuması (alt eğim ≥ üst)', p: duz.p, ki2: duz.ki2, Qn: duz.Qn, np: 6, hedef: duz.hedef }
    : { ad: 'Kırık doğru, kaydın düz okuması (alt eğim ≥ üst) → doğrusala iniyor', p: R.M2dogru.p, ki2: R.M2dogru.ki2, np: 4, hedef: R.M2dogru.hedef, dogrusal: true };
  R.M2ters = ters ? { ad: 'Kırık doğru, ters okuma (alt eğim ≤ üst)', p: ters.p, ki2: ters.ki2, Qn: ters.Qn, np: 6, hedef: ters.hedef }
    : { ad: 'Kırık doğru, ters okuma (alt eğim ≤ üst) → doğrusala iniyor', p: R.M2dogru.p, ki2: R.M2dogru.ki2, np: 4, hedef: R.M2dogru.hedef, dogrusal: true };
  R._izgara = izgara.map((g) => ({ Qn: g.Qn, ki2: g.ki2, aLo: g.p[1], aHi: g.p[2] }));
  return R;
}

// Doygun model: her restoran (ad) için serbest hedef
export function doygun(S) {
  const gruplar = new Map();
  for (const s of S) { if (!gruplar.has(s.ad)) gruplar.set(s.ad, []); gruplar.get(s.ad).push(s); }
  let top = 0; const hedefler = {};
  for (const [ad, G] of gruplar) {
    let best = [0, Infinity];
    for (let T = -2; T <= 12; T += 0.01) { const v = ki2(() => T, [], G); if (v < best[1]) best = [T, v]; }
    // 1σ: Δ = 1
    let lo = best[0], hi = best[0];
    while (lo > -3 && ki2(() => lo, [], G) - best[1] < 1) lo -= 0.01;
    while (hi < 13 && ki2(() => hi, [], G) - best[1] < 1) hi += 0.01;
    hedefler[ad] = { T: best[0], lo, hi, n: G.length, ornek: G[0] };
    top += best[1];
  }
  return { ki2: top, np: gruplar.size, hedefler };
}

// ---- rapor ----
const f2 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2).replace('.', ','));
const isaretli = (x) => (x >= 0 ? '+' : '−') + f2(Math.abs(x));
const urunPuani = (m, q, N = 6) => m.hedef(m.p, { qs: [q], N, bonus: 0, lux: false }); // eko, bonus 0
const menuHedef = (m, o) => m.hedef(m.p, o);

function parametreMetni(ad, m) {
  const p = m.p;
  if (ad === 'M1') return 'sabit: f = 0,4 + 5,89(1 − e^(−Q/3,43)), çeşit 0,037/ürün (çarpan), lüks ×1,25';
  if (ad === 'M1y') return `f = ${f2(p[0])} + ${f2(p[1])}(1 − e^(−Q/${f2(p[2])})), çeşit çarpanı ${f2(p[3] * 100)}%/ürün, lüks ×${f2(p[4])}`;
  if (ad === 'M3') return `f = ${f2(p[0])} + ${f2(p[1])}(1 − e^(−Q/${f2(p[2])})), çeşit ${isaretli(p[3])}/ürün (toplanan), lüks ×${f2(p[4])}`;
  if (ad === 'M2dogru' || m.dogrusal) return `Q6'da ${f2(p[0])}, eğim ${f2(p[1])}/kalite, çeşit ${isaretli(p[2])}/ürün, lüks ×${f2(p[3])}`;
  if (ad === 'Oyuncu') return `Q6'da ${f2(p[0])}, eğim 0,50/kalite (sabit), çeşit ${isaretli(p[1])}/ürün, lüks ×${f2(p[2])}`;
  return `nötr Q${f2(m.Qn)}: ${f2(p[0])}; altında ${f2(p[1])}/kalite, üstünde ${f2(p[2])}/kalite; çeşit ${isaretli(p[3])}/ürün; lüks ×${f2(p[4])}`;
}

export function rapor() {
  const S = adimlar();
  const R = modelleriUydur(S);
  const D = doygun(S);
  const sirala = ['M1', 'M1y', 'M3', 'M2duz', 'M2ters', 'M2serbest', 'M2dogru', 'Oyuncu'];
  const gruplar = [...new Set(S.map((s) => s.grup))];
  const satir = [];
  satir.push(`Adım ${S.length} · k ${f2(K)} · σ ${f2(SIGMA)} · seçenekler: ${process.argv.slice(2).join(' ') || '(yok)'}`);
  satir.push(`Doygun (her restorana serbest hedef): χ² ${f2(D.ki2)}, ${D.np} parametre`);
  const aicMin = Math.min(...sirala.map((a) => R[a].ki2 + 2 * R[a].np));
  satir.push('\nModel | χ² | parametre | AIC farkı | ' + gruplar.map((g) => `χ² ${g}`).join(' | '));
  for (const a of sirala) {
    const m = R[a];
    const gk = gruplar.map((g) => f2(ki2(m.hedef, m.p, S.filter((s) => s.grup === g))));
    satir.push(`${a} ${m.ad} | ${f2(m.ki2)} | ${m.np} | ${f2(m.ki2 + 2 * m.np - aicMin)} | ${gk.join(' | ')}`);
  }
  satir.push('\nParametreler:');
  for (const a of sirala) satir.push(`  ${a}: ${parametreMetni(a, R[a])}`);
  satir.push('\nÜrün puanı (eko, 2-2-2, bonus 0) kaliteye göre:');
  satir.push('  Q   | ' + sirala.join(' | '));
  for (const q of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) satir.push(`  Q${String(q).padEnd(2)} | ` + sirala.map((a) => f2(urunPuani(R[a], q))).join(' | '));
  satir.push('\nÇeşit etkisi 1-1-1 → 2-2-2 (eko, bonus 0):');
  for (const q of [1, 6, 12]) satir.push(`  Q${q}: ` + sirala.map((a) => `${a} ${isaretli(urunPuani(R[a], q, 6) - urunPuani(R[a], q, 3))}`).join(' · '));
  satir.push('\nRestoran başına: ölçülen hedef (doygun, 1σ) ve model tahminleri');
  for (const [ad, h] of Object.entries(D.hedefler)) {
    const o = h.ornek;
    satir.push(`  ${ad} (${h.n} adım): ölçülen ${f2(h.T)} (${f2(h.lo)}–${f2(h.hi)}) | ` + ['M1', 'M3', 'M2duz', 'M2ters'].map((a) => `${a} ${f2(menuHedef(R[a], o))}`).join(' · '));
  }
  // Eski satırlar (önceki oturum özeti; tarihleri ve evreleri belirsiz): yalnız normal personel
  const ozet = veri.oncekiOturumOzeti?.satirlar ?? [];
  satir.push('\nÖrnek dışı: önceki oturumun özet satırları (tarih/evre belirsiz; profesyonel personelliler atlandı)');
  for (const [ad, T, sig, bonus, menu, oturma, personel] of ozet) {
    if (personel !== 'normal') continue;
    const o = { qs: Object.values(menu), N: Object.keys(menu).length, bonus, lux: oturma === 'luks' };
    satir.push(`  ${ad}: ölçülen ${f2(T)} ± ${f2(sig)} | ` + ['M1', 'M3', 'M2duz', 'M2ters'].map((a) => `${a} ${f2(menuHedef(R[a], o))}`).join(' · '));
  }
  satir.push('\nM2 nötr kalite ızgarası (Qn: χ², alt/üst eğim):');
  satir.push('  ' + R._izgara.map((g) => `Q${f2(g.Qn)}: ${f2(g.ki2)} (${f2(g.aLo)}/${f2(g.aHi)})`).join(' · '));
  console.log(satir.join('\n'));
  const jsonYol = arg('json', null);
  if (jsonYol) {
    const sonuc = {
      secenekler: process.argv.slice(2), k: K, sigma: SIGMA, adim: S.length, doygun: { ki2: D.ki2, np: D.np },
      modeller: Object.fromEntries(sirala.map((a) => [a, { ad: R[a].ad, ki2: R[a].ki2, np: R[a].np, p: R[a].p, Qn: R[a].Qn ?? null, metin: parametreMetni(a, R[a]),
        gruplar: Object.fromEntries(gruplar.map((g) => [g, ki2(R[a].hedef, R[a].p, S.filter((s) => s.grup === g))])),
        egri: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((q) => urunPuani(R[a], q)),
        cesit: [1, 6, 12].map((q) => urunPuani(R[a], q, 6) - urunPuani(R[a], q, 3)) }])),
      restoranlar: Object.entries(D.hedefler).map(([ad, h]) => ({ ad, n: h.n, T: h.T, lo: h.lo, hi: h.hi, grup: h.ornek.grup, tahmin: Object.fromEntries(sirala.map((a) => [a, menuHedef(R[a], h.ornek)])) })),
      izgara: R._izgara,
    };
    writeFileSync(jsonYol, JSON.stringify(sonuc, null, 1));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) rapor();
