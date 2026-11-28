// Charge des modules de l'application dans un contexte isolé (node:vm), sans navigateur.
// Les modules demandés (et leurs imports) sont réunis par esbuild en un script, puis exécutés dans le contexte ;
// leurs exports y sont posés en variables globales, pour que les tests les évaluent par leur nom (#102).
// Les API du navigateur utilisées au chargement sont remplacées par des bouchons minimaux. Les modules de js/ non
// demandés (interface, rendu…) sont remplacés par des bouchons dont les exports valent undefined, comme lorsque ces
// fichiers n'étaient pas chargés.
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export async function load(files, extra = {}) {
  const store = new Map();
  const ctx = vm.createContext({
    console, structuredClone, URL, URLSearchParams, EventTarget, Event, AbortController, setTimeout, clearTimeout,
    CustomEvent: class CustomEvent extends Event { constructor(t, o = {}) { super(t); this.detail = o.detail; } },
    navigator: { userAgent: 'node', platform: '', maxTouchPoints: 0 },
    location: { search: '', protocol: 'file:' },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    ...extra,
  });
  ctx.globalThis = ctx; ctx.window = ctx;
  const mods = ['js/core.ts', ...files];
  const entry = mods.map((f, i) => `import * as m${i} from ${JSON.stringify(ROOT + f)};`).join('\n')
    + `\nObject.assign(globalThis, ${mods.map((_, i) => `m${i}`).join(', ')});`;
  const noExt = p => p.replace(/\.[jt]s$/, '');   // js/geo.js désigne aussi js/geo.ts (migration TypeScript, #103)
  const wanted = new Set(mods.map(f => noExt(ROOT + f)));
  const stub = {
    name: 'bouchons', setup(b) {
      b.onLoad({ filter: /[\\/]js[\\/][\w-]+\.[jt]s$/ }, a => {
        if (wanted.has(noExt(a.path))) return undefined;
        const names = [...readFileSync(a.path, 'utf8').matchAll(/^export \{([^}]*)\};$/gm)].flatMap(m => m[1].split(',').map(n => n.trim()).filter(Boolean));
        return { contents: names.length ? `export const ${names.map(n => `${n} = undefined`).join(', ')};` : '', loader: 'js' };
      });
    }
  };
  const { outputFiles } = await build({ stdin: { contents: entry, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'error', plugins: [stub] });
  vm.runInContext(outputFiles[0].text, ctx, { filename: 'modules.js' });
  return ctx;
}
/** Évalue une expression dans le contexte (les exports des modules chargés y sont visibles) */
export const ev = (ctx, expr) => vm.runInContext(expr, ctx);
