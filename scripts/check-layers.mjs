// City Map Studio — règle de dépendance entre couches (#118).
// Une couche n'importe que des couches inférieures : content (données pures) < core < render, map, services, storage
// < map < view (aperçu : carte, rendu, canevas) < features < ui < app.
// Les couches de même rang (render, services, storage) ne s'importent pas entre elles. Les imports d'un même
// dossier sont libres. Lit le graphe d'imports d'esbuild (metafile) et le registre « late » (appels vers une couche
// postérieure, à supprimer) ; affiche chaque écart. Usage : node scripts/check-layers.mjs [--json]
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RANK = {content: 0, core: 1, render: 2, services: 2, storage: 2, map: 3, view: 4, features: 5, ui: 6, app: 7};
const ALLOWED_SIDEWAYS = new Set();
const layer = f => f.split('/')[1];
const folder = f => path.dirname(f);

const {metafile} = await build({entryPoints: [path.join(ROOT, 'src/app/main.ts')], bundle: true, write: false,
  metafile: true, format: 'esm', logLevel: 'silent', absWorkingDir: ROOT});
const bad = [];
for (const [file, info] of Object.entries(metafile.inputs)) {
  if (!file.startsWith('src/')) continue;
  for (const imp of info.imports) {
    if (!imp.path.startsWith('src/')) continue;
    const a = layer(file), b = layer(imp.path);
    if (folder(file) === folder(imp.path) || a === b && file.split('/').length === imp.path.split('/').length) continue;
    if (!(a in RANK) || !(b in RANK)) { bad.push([file, imp.path, 'couche inconnue']); continue; }
    if (RANK[b] < RANK[a] || ALLOWED_SIDEWAYS.has(`${a}>${b}`)) continue;
    if (a === b) continue;   // sous-dossiers d'une même couche (core/doc → core/geo)
    bad.push([file, imp.path, RANK[b] > RANK[a] ? 'vers une couche supérieure' : 'entre couches voisines']);
  }
}
// Registre late : chaque nom lu est un appel vers un fichier postérieur
const late = [];
for (const file of Object.keys(metafile.inputs).filter(f => f.startsWith('src/'))) {
  for (const m of readFileSync(path.join(ROOT, file), 'utf8').matchAll(/(?<![\w$.])late\.([A-Za-z_$][\w$]*)/g)) late.push([file, m[1]]);
}
// Écritures directes de l'état hors de src/core/doc/ : toute écriture passe par update() (src/core/doc/store.ts)
const WRITE = /(?<![\w$.])st(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])+\s*(?:=(?!=)|\+=|-=|\*=|\/=|\|\|=|&&=|\?\?=|\+\+|--)|(?<![\w$.])st(?:\.[A-Za-z_$][\w$]*)+\.(?:push|pop|splice|shift|unshift|sort|reverse|fill)\(|\(st(?:\.[A-Za-z_$][\w$]*)* as [^)]+\)(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])+\s*=(?!=)|Object\.assign\(st\b|delete st\.|setPath\(st\b|(?:\+\+|--)st\./g;
const writes = [];
for (const file of Object.keys(metafile.inputs).filter(f => f.startsWith('src/') && !f.startsWith('src/core/doc/'))) {
  const text = readFileSync(path.join(ROOT, file), 'utf8');
  for (const m of text.matchAll(WRITE)) writes.push([file, m[0].replace(/\s+/g, ' ').slice(0, 60)]);
}
// Taille des fichiers source : 40 Ko au plus (lot 2 de l'Horizon 1, #119) ; chaque fichier trop gros est signalé
const MAX_KB = 40, big = [];
for (const file of Object.keys(metafile.inputs).filter(f => f.startsWith('src/'))) {
  const kb = readFileSync(path.join(ROOT, file)).length / 1024;
  if (kb > MAX_KB) big.push([file, `${kb.toFixed(1)} Ko`, `plus de ${MAX_KB} Ko`]);
}
if (process.argv.includes('--json')) console.log(JSON.stringify({imports: bad, late, writes, big}));
else {
  for (const [f, i, why] of bad) console.log(`  ${f} → ${i} (${why})`);
  console.log(`  imports hors règle : ${bad.length} ; appels par le registre late : ${late.length} ; écritures directes de st : ${writes.length} ; fichiers de plus de ${MAX_KB} Ko : ${big.length}`);
  for (const [f, kb] of big) console.log(`  ${f} : ${kb}`);
}
