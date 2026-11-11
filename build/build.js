// Bundles CodePop into one self-contained dist/index.html (fonts embedded as base64 woff2).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const fp = n => path.join(__dirname, 'node_modules', '@fontsource', n, 'files');

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const DEVA = 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF';
const ARAB = 'U+0600-06FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE80-FEFC';

// [family, package, file stem, weight, unicode-range]
const FONTS = [
  ['Baloo 2', 'baloo-2', 'baloo-2-latin-500-normal', 500, LATIN],
  ['Baloo 2', 'baloo-2', 'baloo-2-latin-700-normal', 700, LATIN],
  ['Baloo 2', 'baloo-2', 'baloo-2-latin-800-normal', 800, LATIN],
  ['Baloo 2', 'baloo-2', 'baloo-2-devanagari-500-normal', 500, DEVA],
  ['Baloo 2', 'baloo-2', 'baloo-2-devanagari-700-normal', 700, DEVA],
  ['Baloo 2', 'baloo-2', 'baloo-2-devanagari-800-normal', 800, DEVA],
  ['Baloo Bhaijaan 2', 'baloo-bhaijaan-2', 'baloo-bhaijaan-2-arabic-500-normal', 500, ARAB],
  ['Baloo Bhaijaan 2', 'baloo-bhaijaan-2', 'baloo-bhaijaan-2-arabic-700-normal', 700, ARAB],
  ['Baloo Bhaijaan 2', 'baloo-bhaijaan-2', 'baloo-bhaijaan-2-arabic-800-normal', 800, ARAB],
  ['Space Mono', 'space-mono', 'space-mono-latin-400-normal', 400, LATIN],
  ['Space Mono', 'space-mono', 'space-mono-latin-700-normal', 700, LATIN],
  ['Bungee', 'bungee', 'bungee-latin-400-normal', 400, LATIN],
  ['Audiowide', 'audiowide', 'audiowide-latin-400-normal', 400, LATIN],
  ['Bowlby One', 'bowlby-one', 'bowlby-one-latin-400-normal', 400, LATIN],
  ['Lilita One', 'lilita-one', 'lilita-one-latin-400-normal', 400, LATIN],
  ['Russo One', 'russo-one', 'russo-one-latin-400-normal', 400, LATIN],
  ['Chewy', 'chewy', 'chewy-latin-400-normal', 400, LATIN],
  ['Press Start 2P', 'press-start-2p', 'press-start-2p-latin-400-normal', 400, LATIN],
  ['Fredoka', 'fredoka', 'fredoka-latin-600-normal', 600, LATIN]
];

let fontCss = '', total = 0;
for (const [fam, pkg, stem, wt, range] of FONTS) {
  const file = path.join(fp(pkg), stem + '.woff2');
  if (!fs.existsSync(file)) { console.error('missing font', file); process.exit(1); }
  const b = fs.readFileSync(file); total += b.length;
  fontCss += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${wt};font-display:swap;src:url(data:font/woff2;base64,${b.toString('base64')}) format('woff2');unicode-range:${range}}\n`;
}

const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const css = read('style.css');
const engines = ['content.js', 'cpp.js', 'html.js', 'explain.js', 'editor.js'].map(read).join('\n;\n') + '\n;\n' + fs.readFileSync(path.join(root, 'shared', 'core.js'), 'utf8');
const appParts = fs.readdirSync(path.join(root, 'src', 'app')).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(root, 'src', 'app', f), 'utf8')).join('\n');
const app = '(function(){\n"use strict";\n' + appParts + '\n})();';
const tpl = read('template.html');
const html = tpl
  .replace('/*FONTS*/', () => fontCss)
  .replace('/*CSS*/', () => css)
  .replace('/*JS*/', () => (engines + '\n;\n' + app).replace(/<\/script/gi, '<\\/script'));
// 1) dist/index.html: the self-contained DEMO build (one file, no server needed; runs the Arena against a built-in practice backend)
fs.mkdirSync(path.join(root, 'dist', 'web'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html.replace('<!--WEBHEAD-->', () => '').replace('<!--WEBTAIL-->', () => ''));
// 2) dist/web: what the CodePop server serves: manifest + icons + service worker (installable on Android) and /config.js (server mode)
const webHead = '<link rel="manifest" href="/manifest.webmanifest">\n<link rel="icon" type="image/png" href="/icons/icon-192.png">\n<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">\n<script src="/config.js"></script>';
const webTail = '<script>if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}</script>';
fs.writeFileSync(path.join(root, 'dist', 'web', 'index.html'), html.replace('<!--WEBHEAD-->', () => webHead).replace('<!--WEBTAIL-->', () => webTail));
const cp = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); };
const pub = path.join(root, 'public');
(function walk(dir, rel) { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const r = path.join(rel, f.name); if (f.isDirectory()) walk(path.join(dir, f.name), r); else cp(path.join(dir, f.name), path.join(root, 'dist', 'web', r)); } })(pub, '');
console.log('fonts', (total / 1024).toFixed(0) + 'KB', '| html', (html.length / 1024).toFixed(0) + 'KB', '| dist/index.html (demo) + dist/web (server)');
