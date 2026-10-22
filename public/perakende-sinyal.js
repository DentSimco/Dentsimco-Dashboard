// DentSimco — Sinyaller › Perakende: "borsadan al, perakende binasında en kârlı fiyatla sat".
// Her ürün ve kalite için borsadaki güncel fiyat mal maliyeti sayılır; satış fiyatı Perakende hesaplayıcısındaki
// en kârlı fiyattır. Ürün birden çok binada satılıyorsa en iyisi alınır. Yönetim gideri ve satış bonusu YOK sayılır
// (yalnız bina maaşı düşülür); kendi sonucun için Kâr Hesaplayıcı › Perakende'yi kullan.
// Net marj = seviye başı saatlik net kâr ÷ aynı saatte satılan malın maliyeti.

import { readDocs, PATHS, dataField, loadGamePhase, urunAdlariniDuzelt, anlikFiyat } from './veri.js';
import * as H from './hesap.js';
import * as R from './hesap-perakende.js';

// Perakende hesaplayıcısıyla aynı: Restoran ayrı planlanır, Satış ofisi ölçülmez
export const HARIC = new Set(['r', 'B']);
export const KAR_ESIGI = 3; // net marj bu yüzdenin üstündeyse KÂR

// Saf işlev. Girdi: economy (0-2), saturation {ürün: s}, market {ürün: {kalite: fiyat}}, buildings {harf: {salaryModifier}},
// averageSalary, qualityWeight. Çıktı: [{ id, q, letter, cost, price, pphpl, marj, sellable }]
export function hesaplaPerakende({ economy = 0, saturation = {}, market = {}, buildings = {}, averageSalary = 345, qualityWeight } = {}) {
  const best = new Map();
  for (const letter of R.retailLetters()) {
    if (HARIC.has(letter)) continue;
    for (const id of R.buildingProducts(letter, economy)) {
      for (const [qText, cost] of Object.entries(market[id] || {})) {
        const q = Number(qText);
        if (!(cost > 0) || !Number.isInteger(q) || q < 0 || q > R.MAX_QUALITY) continue;
        const model = R.getModel(economy, id, q);
        if (!model) continue;
        const wage = R.storeWage({ modelW: model.W, salaryModifier: buildings[letter]?.salaryModifier, averageSalary, adminNet: 0 });
        const r = R.calcProduct({ economy, productId: id, quality: q, saturation: saturation[id], cAct: cost, bonusPct: 0, weather: 1, qualityWeight, wage });
        if (!r.ok) continue;
        const alim = r.sellable ? r.cAct * r.usphplMax : 0; // saatte satılan malın maliyeti (seviye başı)
        const marj = r.sellable && alim > 0 ? (r.pphplMax / alim) * 100 : null;
        const x = { id, q, letter, cost: r.cAct, price: r.rMax, pphpl: r.pphplMax, marj, sellable: r.sellable };
        const key = `${id}:${q}`;
        const old = best.get(key);
        if (!old || x.pphpl > old.pphpl) best.set(key, x);
      }
    }
  }
  return [...best.values()];
}

export const karMi = (x) => x.sellable && x.pphpl > 0 && x.marj != null && x.marj >= KAR_ESIGI;
export const zararMi = (x) => !x.sellable || x.pphpl <= 0;

function parseLive(doc) {
  const out = {};
  for (const [id, e] of Object.entries(doc?.items || {})) {
    const byQ = Array.isArray(e) ? e[1] : e;
    if (!byQ || typeof byQ !== 'object') continue;
    const m = {};
    for (const q of Object.keys(byQ)) { const f = anlikFiyat(doc, id, q); if (f) m[q] = f.p; } // ilan yoksa fiyat yok
    out[id] = m;
  }
  return out;
}

export async function loadPerakendeSinyal(r, options) {
  const P = { products: PATHS.meta(`products_r${r}`), buildings: PATHS.meta('buildings'), core: PATHS.meta('core'), retail: PATHS.meta(`retail_r${r}`), live: PATHS.live(r) };
  const [docs, gamePhase] = await Promise.all([readDocs(Object.values(P), options), loadGamePhase(r)]);
  const get = (k) => dataField(docs.get(P[k]));
  const products = urunAdlariniDuzelt(get('products'));
  if (!products || !Object.keys(products).length) throw new Error('Ürün verisi okunamadı.');
  const core = get('core') || {};
  const saturation = {};
  for (const [id, p] of Object.entries(products)) {
    const s = p?.marketSaturation;
    if (s != null && s !== '' && Number.isFinite(Number(s))) saturation[id] = Number(s);
  }
  const ri = get('retail');
  Object.assign(saturation, R.parseSaturation(Array.isArray(ri) ? ri : ri?.items ?? ri));
  const norm = H.normalizeData({ products, buildings: get('buildings') || {}, core, modifiers: {}, realm: r });
  const live = get('live');
  const economy = Number.isInteger(gamePhase?.index) ? gamePhase.index : Number.isInteger(norm.economy?.currentPhase) ? norm.economy.currentPhase : 0;
  const qw = core.RETAIL_MODELING_QUALITY_WEIGHT;
  const list = hesaplaPerakende({
    economy, saturation, market: parseLive(live), buildings: norm.buildings, averageSalary: norm.averageSalary,
    qualityWeight: qw != null && Number.isFinite(Number(qw)) ? Number(qw) : undefined,
  });
  return { list, economy, t: Number(live?.t) || null, hasRetailInfo: !!ri };
}
