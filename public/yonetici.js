// DentSimco — Yönetici simülasyonu (hesap motoru, ekransız)
// Yöneticilerin dört alandaki para karşılığı: yönetim (maaş tasarrufu), muhasebe (vergi), iletişim (perakende satış hızı),
// bilim (araştırma üretim hızı ve kalite yükseltmede patent olasılığı). Ekip etkileri hesap.js'teki doğrulanmış
// teamEffects'ten gelir; burada yalnız paraya çevirme var.
//
// Şirket kaydı (company):
//   executives: [{ name, position, salary, skills: {coo,cfo,cmo,cto}, active }]
//   finance:  { cash, bondsBought, bondsIssued, bankLevel }        // bono = oyundaki tahvil
//   admin:    { totalLevels, wagesDay }      // yönetim gideri için: toplam bina seviyesi, yönetim gideri DAHİL günlük maaş
//   retail:   { marginDay, otherSpeedPct }   // perakende: günlük brüt marj (satış − mal maliyeti), ekip dışı satış hızı bonusu
//   research: { upgrades: [{ label, researchId, from, to, price }] }   (outputDay ve price eski kayıtlarda kalır, kullanılmaz)

import * as H from './hesap.js';

const num = (x, d = 0) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : d);
const EPS = 1e-9;

// ---------------------------------------------------------------------------------------------------------------
// Kalite yükseltme: her basamak için gereken patent (oyunda ürüne göre değişmez; Cooper's Tools ile doğrulandı)
// PATENTS_PER_STEP[q] = Q(q) → Q(q+1)
// ---------------------------------------------------------------------------------------------------------------
export const PATENTS_PER_STEP = [12, 50, 500, 2000, 5000, 10000, 10000, 10000, 10000, 10000, 50000, 50000];

export function patentsNeeded(from, to) {
  const a = H.clampQuality(from);
  const b = H.clampQuality(to);
  let total = 0;
  for (let q = a; q < b; q++) total += PATENTS_PER_STEP[q];
  return total;
}

// Patent olasılığı (%): taban %6,25 + etkili bilim puanı × 0,0625 (bilim 60 → %10)
export const patentChancePct = (team) => H.PATENT_BASE_PCT + (team?.patentPct || 0);

// Gereken araştırma = patent ÷ olasılık (yukarı yuvarlanır: araştırma tam adet)
export function researchNeeded(patents, chancePct) {
  const p = num(chancePct, 0) / 100;
  if (!(p > 0) || !(patents > 0)) return 0;
  return Math.ceil(patents / p - EPS);
}

export function upgradePlan(upgrades = [], team) {
  const chance = patentChancePct(team);
  const rows = upgrades.map((u) => {
    const patents = patentsNeeded(u.from, u.to);
    const research = researchNeeded(patents, chance);
    const price = num(u.price, null);
    return { ...u, patents, research, price, cost: price == null ? null : research * price };
  });
  const priced = rows.filter((x) => x.cost != null);
  return {
    chancePct: chance, rows,
    patents: rows.reduce((s, x) => s + x.patents, 0),
    research: rows.reduce((s, x) => s + x.research, 0),
    cost: priced.reduce((s, x) => s + x.cost, 0),
    missingPrice: rows.some((x) => x.patents > 0 && x.price == null),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Şirket kaydı
// ---------------------------------------------------------------------------------------------------------------
export function defaultCompany() {
  return {
    v: 1,
    executives: [],
    finance: { cash: 0, bondsBought: 0, bondsIssued: 0, bankLevel: 0 },
    admin: { totalLevels: 0, wagesDay: 0 },
    // Üretim ve Perakende kendi payını buraya yazar (bina seviyesi, akademi, günlük maaş). Yönetim gideri ikisinin toplamıdır.
    // researchDay: Üretim'deki araştırma binalarının ekipsiz (bilim puanı olmadan) günlük üretim değeri ($); bilimin değeri bundan hesaplanır
    parts: { uretim: { levels: 0, academy: 0, wagesDay: 0, researchDay: 0 }, perakende: { levels: 0, academy: 0, wagesDay: 0, researchDay: 0 } },
    retail: { marginDay: 0, otherSpeedPct: 0 },
    research: { outputDay: 0, price: null, researchId: null, otherSpeedPct: 0, upgrades: [] },
  };
}

const pos = (x) => Math.max(0, num(x, 0));
let seq = 0;
const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function sanitizeCompany(raw) {
  const base = defaultCompany();
  if (!raw || typeof raw !== 'object') return base;
  const c = { ...base };
  c.executives = (Array.isArray(raw.executives) ? raw.executives : []).filter((e) => e && typeof e === 'object')
    .map((e) => ({ id: e.id || uid('e'), name: String(e.name || ''), position: String(e.position || 'o'), salary: pos(e.salary),
      skills: Object.fromEntries(H.SKILLS.map((k) => [k, pos(e.skills?.[k])])), active: e.active !== false }));
  const f = raw.finance || {};
  c.finance = { cash: pos(f.cash), bondsBought: pos(f.bondsBought), bondsIssued: pos(f.bondsIssued), bankLevel: H.clampBankLevel(f.bankLevel) };
  const a = raw.admin || {};
  c.admin = { totalLevels: Math.floor(pos(a.totalLevels)), wagesDay: pos(a.wagesDay) }; // eski kayıtlardaki elle giriş (yedek)
  const part = (x) => ({ levels: Math.floor(pos(x?.levels)), academy: Math.floor(pos(x?.academy)), wagesDay: pos(x?.wagesDay), researchDay: pos(x?.researchDay) });
  c.parts = { uretim: part(raw.parts?.uretim), perakende: part(raw.parts?.perakende) };
  const fromParts = adminFromParts(c.parts);
  // Üretim/Perakende bir kez kaydettiyse (parts var) elle girişin yerine geçer; hepsi 0'a inse bile eski değer geri gelmez
  if (['uretim', 'perakende'].some((k) => raw.parts?.[k] && raw.parts[k].levels != null)) c.admin = fromParts;
  else if (fromParts.totalLevels > 0 || fromParts.wagesDay > 0) c.admin = fromParts;
  const r = raw.retail || {};
  c.retail = { marginDay: num(r.marginDay, 0), otherSpeedPct: pos(r.otherSpeedPct) };
  const s = raw.research || {};
  c.research = {
    outputDay: pos(s.outputDay),
    price: s.price == null || s.price === '' ? null : pos(s.price),
    researchId: s.researchId == null || s.researchId === '' ? null : Number(s.researchId),
    otherSpeedPct: pos(s.otherSpeedPct),
    upgrades: (Array.isArray(s.upgrades) ? s.upgrades : []).filter((u) => u && typeof u === 'object').map((u) => {
      const from = H.clampQuality(u.from);
      return {
        id: u.id || uid('u'), label: String(u.label || ''),
        product: u.product == null || u.product === '' ? null : Number(u.product),
        researchId: u.researchId == null || u.researchId === '' ? null : Number(u.researchId),
        from, to: Math.max(from, H.clampQuality(u.to)),
        price: u.price == null || u.price === '' ? null : pos(u.price),
      };
    }),
  };
  return c;
}

// Yönetim gideri: Üretim ve Perakende binalarının seviyeleri tek toplamda birleşir; akademi bir kez sayılır (büyük olan).
export function adminFromParts(parts) {
  const u = parts?.uretim || {};
  const p = parts?.perakende || {};
  return {
    totalLevels: Math.floor(pos(u.levels)) + Math.floor(pos(p.levels)) + Math.max(Math.floor(pos(u.academy)), Math.floor(pos(p.academy))),
    wagesDay: pos(u.wagesDay) + pos(p.wagesDay),
  };
}
// Bir bölümün (uretim | perakende) yönetim gideri hesabına diğerinden gelen seviyeler ve akademi
export function otherAdminLevels(company, name) {
  const other = name === 'uretim' ? company?.parts?.perakende : company?.parts?.uretim;
  return { levels: Math.floor(pos(other?.levels)), academy: Math.floor(pos(other?.academy)) };
}

// Tarayıcı kaydı: Üretim, Yönetim ve Perakende aynı şirket kaydını okur ve yazar.
export const COMPANY_KEY = (r) => `dentsimco.sirket.r${r}`;
const URETIM_KEY = (r) => `dentsimco.uretim.r${r}`;

// Üretim kurulumundan (eski yer) yöneticileri ve nakdi bir kez taşır
export function companyFromUretim(uretimSetup) {
  if (!uretimSetup || typeof uretimSetup !== 'object') return null;
  const ex = Array.isArray(uretimSetup.executives) ? uretimSetup.executives : [];
  const f = uretimSetup.finance || {};
  if (!ex.length && !f.cash && !f.bondsBought && !f.bondsIssued && !f.bankLevel) return null;
  return sanitizeCompany({ executives: ex, finance: f });
}

// ---------------------------------------------------------------------------------------------------------------
// Para karşılığı
// ---------------------------------------------------------------------------------------------------------------
// Sabit tabanlar (mevcut ekiple girilen değerlerden ekipsiz tabana iner, böylece ekip değişince doğru ölçeklenir)
export function companyBases(company) {
  const c = company;
  const team = H.teamEffects(c.executives, { bankLevel: c.finance.bankLevel });
  const gross = H.grossOverhead(c.admin.totalLevels);
  const savingsNow = Math.min(100, team.adminSavingsPct) / 100;
  // girilen maaş = taban × (1 + brüt × (1 − tasarruf))
  const wageBaseDay = c.admin.wagesDay / (1 + gross * (1 - savingsNow));
  // satış hızı: adet ∝ 1 ÷ (1 − b/100), b = ekip dışı hız + ekibin satış hızı (Perakende motoruyla aynı, oyunda doğrulandı).
  // Girilen marj şimdiki ekiple olduğundan sabit katsayı K = marj × (1 − b/100); ekip değişince marj K ÷ (1 − b'/100) olur.
  const speedNow = c.retail.otherSpeedPct + team.salesSpeedPct;
  const retailK = speedNow < 100 ? c.retail.marginDay * (1 - speedNow / 100) : 0;
  // araştırma hızı çarpandır: şimdiki üretim = ekipsiz üretim × (1 + hız). Üretim bölümü araştırma binalarının EKİPSİZ günlük
  // değerini yazar (kendi araştırma ürünü fiyatıyla); bilimin değeri bunun hız yüzdesi kadarıdır. Simülasyondaki elle giriş kalktı.
  const researchPerPct = pos(c.parts?.uretim?.researchDay) / 100;
  return { team, gross, wageBaseDay, retailK, retailOtherPct: c.retail.otherSpeedPct, researchPerPct, assets: H.assessableAssets(c.finance) };
}

// Bir ekibin günlük getirisi ve kalite planı maliyeti (tabanlar sabit tutulur)
export function teamValue(executives, company, bases = companyBases(company)) {
  const team = H.teamEffects(executives, { bankLevel: company.finance.bankLevel });
  const coo = bases.wageBaseDay * bases.gross * (Math.min(100, team.adminSavingsPct) / 100);
  const taxNone = H.accountingOverheadDay(bases.assets, H.TAX_BASE_THRESHOLD);
  const tax = H.accountingOverheadDay(bases.assets, H.TAX_BASE_THRESHOLD + team.thresholdLift);
  const cfo = Math.max(0, taxNone - tax);
  // İletişim: ekip satış hızı olmasaydı marj ne olurdu? Fark = ekibin günlük katkısı (%100 ve üstü hız hesaplanamaz → 0)
  const withTeam = bases.retailOtherPct + team.salesSpeedPct;
  const cmo = bases.retailK && bases.retailOtherPct < 100 && withTeam < 100
    ? bases.retailK * (1 / (1 - withTeam / 100) - 1 / (1 - bases.retailOtherPct / 100)) : 0;
  const cto = bases.researchPerPct * team.researchSpeedPct;
  const plan = upgradePlan(company.research.upgrades, team);
  return { team, coo, cfo, cmo, cto, day: coo + cfo + cmo + cto, tax, taxNone, plan };
}

const SECTORS = ['coo', 'cfo', 'cmo', 'cto'];
const diff = (a, b) => Object.fromEntries(SECTORS.map((k) => [k, a[k] - b[k]]));

// Ana analiz: ekip toplamı + her yöneticinin alan alan katkısı
// Kişi başı katkı = o yönetici bugün ayrılsa kaybedilecek tutar (azalan getiri yüzünden toplamı ekip toplamına eşit olmayabilir).
export function executiveSimulation(rawCompany) {
  const company = sanitizeCompany(rawCompany);
  const ex = company.executives;
  const bases = companyBases(company);
  const now = teamValue(ex, company, bases);
  const none = teamValue([], company, bases);
  const salariesDay = ex.reduce((s, e) => s + e.salary, 0);
  const members = ex.map((e, index) => {
    const others = ex.filter((_, j) => j !== index);
    if (e.active) {
      const w = teamValue(others, company, bases);
      const by = diff(now, w);
      const day = SECTORS.reduce((s, k) => s + by[k], 0);
      return {
        index, id: e.id, name: e.name, position: e.position, active: true, salary: e.salary, by, day, netDay: day - e.salary,
        ratio: e.salary > 0 ? day / e.salary : null,
        upgradeSaving: w.plan.cost - now.plan.cost, // kalite planında tek seferlik tasarruf
        effects: {
          salesSpeedPct: now.team.salesSpeedPct - w.team.salesSpeedPct,
          restaurantRating: now.team.restaurantRating - w.team.restaurantRating,
          researchSpeedPct: now.team.researchSpeedPct - w.team.researchSpeedPct,
          patentPct: now.team.patentPct - w.team.patentPct,
          adminSavingsPct: now.team.adminSavingsPct - w.team.adminSavingsPct,
          thresholdLift: now.team.thresholdLift - w.team.thresholdLift,
        },
      };
    }
    const activated = ex.map((x, j) => (j === index ? { ...x, active: true } : x));
    const w = teamValue(activated, company, bases);
    const by = diff(w, now);
    const day = SECTORS.reduce((s, k) => s + by[k], 0);
    return {
      index, id: e.id, name: e.name, position: e.position, active: false, salary: e.salary,
      by: null, day: 0, netDay: -e.salary, ratio: null,
      ifActive: { by, day, upgradeSaving: now.plan.cost - w.plan.cost },
    };
  });
  return {
    company, bases, team: now.team,
    sectors: { coo: now.coo, cfo: now.cfo, cmo: now.cmo, cto: now.cto },
    day: now.day, salariesDay, netDay: now.day - salariesDay,
    tax: { assets: bases.assets, threshold: H.TAX_BASE_THRESHOLD + now.team.thresholdLift, day: now.tax, withoutDay: now.taxNone },
    plan: now.plan, planWithout: none.plan, upgradeSaving: none.plan.cost - now.plan.cost,
    members,
  };
}

// Kayıt yoksa eski Üretim kurulumundaki yöneticileri ve nakdi bir kez taşır. Hata olursa (gizli sekme, Node) boş şirket döner.
export function loadCompanyRecord(r) {
  try {
    const raw = localStorage.getItem(COMPANY_KEY(r));
    if (raw) return { company: sanitizeCompany(JSON.parse(raw)), migrated: false };
    const moved = companyFromUretim(JSON.parse(localStorage.getItem(URETIM_KEY(r)) || 'null'));
    if (moved) { localStorage.setItem(COMPANY_KEY(r), JSON.stringify(moved)); return { company: moved, migrated: true }; }
  } catch { /* gizli sekme ya da bozuk kayıt */ }
  return { company: defaultCompany(), migrated: false };
}
export function saveCompanyRecord(r, company) {
  try { localStorage.setItem(COMPANY_KEY(r), JSON.stringify(company)); return true; } catch { return false; }
}

// Üretim ya da Perakende kendi payını yazar. Değişmediyse kayda dokunmaz. Güncel şirket kaydını döndürür.
export function setCompanyPart(r, name, part) {
  const { company } = loadCompanyRecord(r);
  const next = { levels: Math.floor(pos(part?.levels)), academy: Math.floor(pos(part?.academy)), wagesDay: Math.round(pos(part?.wagesDay)), researchDay: Math.round(pos(part?.researchDay)) };
  const cur = company.parts?.[name] || {};
  if (cur.levels === next.levels && cur.academy === next.academy && Math.abs((cur.wagesDay || 0) - next.wagesDay) < 1 && Math.abs((cur.researchDay || 0) - next.researchDay) < 1) return company;
  const saved = sanitizeCompany({ ...company, parts: { ...company.parts, [name]: next } });
  saveCompanyRecord(r, saved);
  return saved;
}
