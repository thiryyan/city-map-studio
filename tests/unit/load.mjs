// Charge des scripts classiques de l'application dans un contexte isolé (node:vm), sans navigateur ni build.
// Les API du navigateur utilisées au chargement sont remplacées par des bouchons minimaux.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function load(files, extra = {}) {
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
  for (const f of ['js/core.js', ...files]) vm.runInContext(readFileSync(ROOT + f, 'utf8'), ctx, { filename: f });
  return ctx;
}
/** Évalue une expression dans le contexte (les déclarations de premier niveau des scripts y sont visibles) */
export const ev = (ctx, expr) => vm.runInContext(expr, ctx);
