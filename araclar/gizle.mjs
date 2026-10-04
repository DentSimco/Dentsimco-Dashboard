// DentSimco — yayın öncesi kod gizleme. Yalnız GitHub Actions'ta, yayın kopyası üzerinde çalışır;
// depodaki okunur kaynak dosyalar değişmez. Çalıştırma: node araclar/gizle.mjs (site.yml çağırır)
//
// public/ içindeki her .js dosyasını javascript-obfuscator ile karıştırır:
//   • formül ve sabit tablo dosyaları (FORMUL) en güçlü ayarla: akış düzleştirme, sayıları ifadeye çevirme,
//     metinleri parçalayıp şifreli diziye taşıma;
//   • arayüz dosyaları daha hafif ayarla (tablette hız için).
// Sonra denetler: her modül yeniden içe aktarılabiliyor ve dışa aktardığı adlar değişmedi.
// Bir şey bozulursa hata verip yayını durdurur; canlı site eski hâliyle kalır.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const DIR = path.resolve('public');
const FORMUL = new Set(['hesap.js', 'hesap-perakende.js', 'perakende-veri.js', 'yonetici.js']);

const ORTAK = {
  target: 'browser', sourceType: 'module', compact: true, sourceMap: false, // dosyalar ES modülü (import/export)
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false, // dışa aktarılan adlar korunur (modüller birbirini bu adlarla çağırır)
  stringArray: true, stringArrayEncoding: ['base64'], stringArrayRotate: true, stringArrayShuffle: true,
  selfDefending: false, debugProtection: false, disableConsoleOutput: false,
  deadCodeInjection: false, transformObjectKeys: false, unicodeEscapeSequence: false,
};
const GUCLU = {
  ...ORTAK,
  controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.4, // site yavaşlarsa 0.2'ye indirin
  numbersToExpressions: true, simplify: true,
  stringArrayThreshold: 1, splitStrings: true, splitStringsChunkLength: 6,
};
const HAFIF = { ...ORTAK, controlFlowFlattening: false, numbersToExpressions: false, stringArrayThreshold: 0.6 };

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

// Dışa aktarılan adları ayrı bir Node sürecinde okur (önbellek temiz olsun, gizlenmiş modüller birbirine bağlansın)
function exportNames(files) {
  const urls = files.map((f) => pathToFileURL(path.join(DIR, f)).href);
  const code = `const out = {};
for (const [f, u] of ${JSON.stringify(files.map((f, i) => [f, urls[i]]))}) {
  try { out[f] = Object.keys(await import(u)).sort(); } catch (e) { out[f] = { hata: String(e?.message || e) }; }
}
console.log(JSON.stringify(out));`;
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(stdout.trim().split('\n').pop());
}

const files = (await readdir(DIR)).filter((f) => f.endsWith('.js')).sort();
if (!files.length) fail('public/ klasöründe .js dosyası bulunamadı.');

const before = exportNames(files);
for (const f of files) if (!Array.isArray(before[f])) fail(`${f} gizlemeden önce bile yüklenemiyor: ${before[f].hata}`);

let inBytes = 0;
let outBytes = 0;
for (const f of files) {
  const p = path.join(DIR, f);
  const src = await readFile(p, 'utf8');
  let out;
  try {
    out = JavaScriptObfuscator.obfuscate(src, FORMUL.has(f) ? GUCLU : HAFIF).getObfuscatedCode();
  } catch (e) {
    fail(`${f} gizlenemedi: ${e?.message || e}`);
  }
  if (!out || out.length < 20) fail(`${f} gizlenince boş çıktı verdi.`);
  await writeFile(p, out);
  inBytes += Buffer.byteLength(src);
  outBytes += Buffer.byteLength(out);
  console.log(`gizlendi: ${f.padEnd(20)} ${FORMUL.has(f) ? 'güçlü' : 'hafif'}  ${Math.round(Buffer.byteLength(src) / 1024)} KB → ${Math.round(Buffer.byteLength(out) / 1024)} KB`);
}

const after = exportNames(files);
for (const f of files) {
  if (!Array.isArray(after[f])) fail(`${f} gizlendikten sonra yüklenemiyor: ${after[f].hata}`);
  if (JSON.stringify(after[f]) !== JSON.stringify(before[f])) fail(`${f} dışa aktardığı adlar değişti: ${before[f].join(',')} → ${after[f].join(',')}`);
}
console.log(`Tamam: ${files.length} dosya gizlendi ve denetlendi (${Math.round(inBytes / 1024)} KB → ${Math.round(outBytes / 1024)} KB).`);
