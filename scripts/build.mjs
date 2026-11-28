// City Map Studio — construction du site publié (#97, lot 4 : #102)
//
// Les sources sont des modules ES en TypeScript (js/main.ts et ses imports, #103) : le navigateur ne les lit pas telles
// quelles. Le build produit dist/, la version publiée :
//   - les modules réunis par esbuild en un seul script classique js/app.<empreinte>.js (format IIFE), minifié : aucun
//     nom global (seuls CMS, posé sur globalThis, et en mode ?test window.__cms et la façade de test de js/main.ts) ;
//     dist/index.html s'ouvre donc aussi en file:// ;
//   - css/app.css minifiée en css/app.<empreinte>.css ;
//   - VERSION (sw.js) et CMS.build (js/core.ts) générés : cms-AAAA-MM-JJ-<empreinte> ;
//   - liste APP de sw.js générée à partir des fichiers réellement publiés ;
//   - lib/, icons/, manifeste et .nojekyll copiés.
//
// Usage : node scripts/build.mjs [dossier de sortie, dist par défaut]
import {readFile, writeFile, mkdir, rm, cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build, transform} from 'esbuild';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(SRC, process.argv[2] || 'dist');
const read = f => readFile(path.join(SRC, f), 'utf8');
const hash = s => createHash('sha256').update(s).digest('hex');
const fail = msg => { console.error('✗ ' + msg); process.exit(1); };

let html = await read('index.html');

// 1. Modules : point d'entrée js/main.ts (balise <script type="module"> de index.html)
const SCRIPT_RE = /<script type="module" src="js\/main\.ts"><\/script>\n?/;
if (!SCRIPT_RE.test(html)) fail('<script type="module" src="js/main.ts"> introuvable dans index.html');
const bundle = async () => (await build({
  entryPoints: [path.join(SRC, 'js/main.ts')], bundle: true, format: 'iife', write: false, metafile: true,
  minify: true, target: 'es2020', legalComments: 'none', charset: 'utf8'
})).outputFiles[0].text;
let js = await bundle();

// 2. CSS
const cssSrc = await read('css/app.css');

// 3. Version : date du jour (UTC) + empreinte du contenu publié
const day = new Date().toISOString().slice(0, 10);
// CMS.build (js/core.ts) vaut 'cms-dev' dans les sources : remplacé dans le script construit
if ((js.match(/"cms-dev"/g) || []).length !== 1) fail('CMS.build : version « cms-dev » introuvable (ou en double) dans le script construit');
const contentHash = hash(js + cssSrc + html).slice(0, 7);
const version = `cms-${day}-${contentHash}`;
const bundled = {code: js.replace('"cms-dev"', JSON.stringify(version))};
const css = await transform(cssSrc, {loader: 'css', minify: true, legalComments: 'none', charset: 'utf8'});
const jsName = `js/app.${hash(bundled.code).slice(0, 10)}.js`;
const cssName = `css/app.${hash(css.code).slice(0, 10)}.css`;

// 4. index.html : un seul script, la feuille minifiée
html = html.replace(SCRIPT_RE, `<script src="${jsName}"></script>\n`);
if (!html.includes('href="css/app.css"')) fail('feuille css/app.css introuvable dans index.html');
html = html.replace('href="css/app.css"', `href="${cssName}"`);

// 5. Écriture de dist/
await rm(OUT, {recursive: true, force: true});
await mkdir(path.join(OUT, 'js'), {recursive: true});
await mkdir(path.join(OUT, 'css'), {recursive: true});
await writeFile(path.join(OUT, 'index.html'), html);
await writeFile(path.join(OUT, jsName), bundled.code);
await writeFile(path.join(OUT, cssName), css.code);
for (const f of ['lib', 'icons', 'manifest.webmanifest', '.nojekyll'])
  await cp(path.join(SRC, f), path.join(OUT, f), {recursive: true});

// 6. sw.js : VERSION et APP générés (mêmes règles qu'avant : application, MapLibre, polices déclarées ; lib/sky/,
//    woff2 et licences mis en cache à leur premier usage)
let sw = await read('sw.js');
const APP_RE = /const APP = \[[\s\S]*?\];/;
if (!/const VERSION = '[^']*';/.test(sw) || !APP_RE.test(sw)) fail('sw.js : VERSION ou APP introuvable');
const app = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', cssName, jsName,
  'lib/maplibre-gl.js', 'lib/maplibre-gl.css', 'lib/fonts/fonts.css'];
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
  .replace(APP_RE, `const APP = [${app.map(f => `'${f}'`).join(', ')}];`);
await writeFile(path.join(OUT, 'sw.js'), sw);

const kb = n => (n / 1024).toFixed(0) + ' Ko';
console.log(`✓ ${path.relative(SRC, OUT) || '.'}/ · ${version}`);
console.log(`  ${jsName} : ${kb(bundled.code.length)} · ${cssName} : ${kb(css.code.length)} (source ${kb(cssSrc.length)})`);
