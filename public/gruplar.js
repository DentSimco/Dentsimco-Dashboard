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
  {
    id: 'bathing', ad: 'Bathing Association', realm: 0,
    // Üyeler isim listesinden sıralamayla eşlendi (90 şirket). Sıralamada bulunamayanlar (grup liderleri Feedback'ten iletişime geçebilir):
    // Qieliii, FXRYL, LDDL Corp., Lemon boy, MengYinGroup, Mr. House, toooomy, billibilli airline, TechniClub, Balvenie Group, SUPERNOOB233, Ace Taffy, 17.12, Artintel
    idler: [
      3397590, 3419938, 3126578, 2808136, 3386551, 4576173, 4684269, 2370443, 3386508, 5291602,
      3630858, 4475386, 3639622, 5596153, 3373372, 5762126, 4373919, 3971886, 5824947, 3447060,
      2027567, 5854452, 4019071, 5193459, 4191804, 3415675, 4582596, 3673679, 5859049, 5745173,
      4481216, 5508414, 3564173, 3592315, 1666095, 5487468, 4813308, 3513938, 4270612, 4438543,
      5767351, 2988288, 3461870, 3394044, 5834454, 3879247, 4234505, 3898887, 4998048, 4062806,
      5775914, 3757996, 3539110, 3417230, 3422465, 5103808, 4232099, 3537815, 5794628, 4505259,
      4405527, 5070543, 3644856, 3496394, 5601965, 3753050, 4411179, 2174646, 5044553, 3658523,
      4139637, 3530775, 3486610, 5774910, 5661484, 5483552, 5805583, 3516999, 4065582, 3508540,
      4065073, 4362225, 3422501, 4517439, 3637420, 5095772, 4088048, 3669404, 3621292, 3634074,
    ],
  },
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

// Grup geçmişi: gecmis = Map(şirketNo → gün listesi; gün = [YYYYMMDD, sıra, eva, değer, ...], bkz. sirket-gecmis.js).
// Gün, geçmişi olan tüm üyelerde varsa toplanır (eksik günde toplam sahte düşerdi); hiç geçmişi olmayan üye toplama girmez.
// Dönüş: { noktalar: [[YYYYMMDD, toplam]], uye: geçmişi olan üye sayısı, gecmissiz: geçmişi olmayan üye sayısı }
export function grupGecmisi(idler, gecmis) {
  const uyeler = idler.map((id) => new Map((gecmis.get(Number(id)) || []).filter((g) => Number.isFinite(g[3])).map((g) => [g[0], g[3]])));
  const var_ = uyeler.filter((m) => m.size);
  const gunler = [...new Set(var_.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const noktalar = gunler.filter((d) => var_.every((m) => m.has(d))).map((d) => [d, var_.reduce((t, m) => t + m.get(d), 0)]);
  return { noktalar, uye: var_.length, gecmissiz: uyeler.length - var_.length };
}
