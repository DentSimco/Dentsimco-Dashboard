// DentSimco — Şirket grupları (saf; ağ ve tarayıcı kullanmaz).
// Simcotools/Sim Companies'te grup API'si yok: oyuncuların kurduğu gruplar resmi değildir. Grup adı ve üye şirket
// numaraları elle bu dosyaya yazılır; grup değeri üyelerin şirket değerlerinin toplamıdır (sıralama satırı: sirketler.js başı).
//   { id: 'kisa-ad', ad: 'Görünen ad', kisa: 'Kısaltma (isteğe bağlı)', idler: [şirketNo, ...], realm: 0 | 1 (yoksa iki realm'de de geçerli) }
// Şirket numaraları realm'e özgüdür; aynı numara öteki realm'de başka bir şirkettir.

export const GRUPLAR = [
  {
    id: 'tib', ad: 'Türk İhale Birliği', kisa: 'TİB', realm: 0, // 22 üyenin 22'si R1 sıralamasında (R2'de yok)
    idler: [4310385, 2799049, 4079977, 4709855, 4949966, 2988587, 4441612, 4268453, 5297305, 1452431, 4479420,
      4304388, 2163024, 4519661, 4806484, 2476225, 4304205, 5760678, 2465752, 3055940, 2933560, 4231397],
  },
  { id: 'simgo', ad: 'Simcompanies GO Türkiye', kisa: 'SimGO', realm: 0, idler: [7903, 1714292, 2924180, 4301859] },
  { id: 'kut', ad: 'KUT GRUP', kisa: 'KUT', realm: 0, idler: [5720435, 4735911, 5459724, 4739816, 982111, 5764974, 614739, 5672597, 5802530, 5768161, 5784585, 5019115, 5757994, 735676] },
];

// Satır sütunları: 0 id, 1 ad, 5 değer, 6 günlük değer farkı
export const grupRealmde = (gruplar, realm) => gruplar.filter((g) => g.realm == null || g.realm === realm);

// rows'u ve gruplar'ı değiştirmez. Sırada olmayan üye numarası eksik sayılır, toplama girmez.
export function grupDegerleri(rows, gruplar, realm = 0) {
  const byId = new Map(rows.map((r) => [String(r[0]), r]));
  return grupRealmde(gruplar, realm).map((g) => {
    const idler = [...new Set((g.idler || []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
    const uyeler = [];
    const eksik = [];
    for (const id of idler) {
      const r = byId.get(String(id));
      if (r) uyeler.push(r); else eksik.push(id);
    }
    const toplam = uyeler.reduce((s, r) => s + r[5], 0);
    const fark = uyeler.reduce((s, r) => s + r[6], 0);
    const onceki = toplam - fark;
    return { id: g.id, ad: g.kisa ? `${g.ad} (${g.kisa})` : g.ad, toplam, fark, yuzde: onceki > 0 ? fark / onceki : 0, uyeSayisi: idler.length, bulunan: uyeler.length, eksik, uyeler };
  });
}

// dir: -1 azalan (varsayılan). Eşitlikte ada göre.
export const grupSirala = (liste, dir = -1) => [...liste].sort((a, b) => ((a.toplam - b.toplam) * dir) || String(a.ad).localeCompare(String(b.ad), 'tr'));
