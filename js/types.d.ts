// Types partagés de City Map Studio (#103). L'espace de noms CMS est posé sur globalThis par js/core.ts ;
// ses modules (CMS.geo, CMS.perf…) sont ajoutés par CMS.define, typés ici au fur et à mesure de la migration.

interface PerfMeasure { k: string; ms: number; info: string; at: number }

interface CmsPerf {
  readonly BUDGET: Record<string, number>;
  readonly LABEL: Record<string, string>;
  add(k: string, ms: number, info?: string): PerfMeasure;
  since(k: string, t0: number, info?: string): PerfMeasure;
  ready(info?: string): PerfMeasure | null;
  start(k: string, waitFor?: string): void;
  end(k: string, source?: string): PerfMeasure | null;
  watchFrames(el: EventTarget): void;
  latest(): PerfMeasure[];
  ok(m: PerfMeasure): boolean;
  readonly log: PerfMeasure[];
}

interface CmsNamespace {
  on(type: string, fn: (detail: any) => void): () => void;
  emit(type: string, detail?: unknown): void;
  define<T extends object>(name: string, factory: (cms: CmsNamespace) => T): Readonly<T>;
  build: { readonly version: string; label(v?: string): string };
  perf: CmsPerf;
  /** Modules encore en JavaScript (non typés) */
  [module: string]: any;
}

// eslint-disable-next-line no-var
declare var CMS: CmsNamespace;

/** Erreur typée des services réseau (géocodeur, Wikipédia) : code et détails (retryInMs, status…) */
interface CmsError extends Error { code: string; retryInMs?: number; status?: number }

// Réglages des tests (?test seulement : délais raccourcis), lus par geocoder.ts, wiki.ts, maplibre-loader.ts
// eslint-disable-next-line no-var
declare var __cmsTestConfig: Record<string, any> | undefined;
// Librairie MapLibre chargée par maplibre-loader.ts (script classique : variable globale ; API non typée)
// eslint-disable-next-line no-var
declare var maplibregl: any;

// Plein écran préfixé (Safari ancien) : facultatif
interface Document { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void }
interface HTMLElement { webkitRequestFullscreen?: (o?: FullscreenOptions) => Promise<void> | void }
// Façade des tests (main.ts, ?test seulement)
interface Window { __cms?: Record<string, any> }
// Données du ciel (lib/sky/*.js, scripts chargés à la demande : variables globales)
// eslint-disable-next-line no-var
declare var SKY_DATA: any;
// eslint-disable-next-line no-var
declare var SKY_MW: number[][][] | undefined;
interface Window { SKY_DATA?: any; SKY_MW?: number[][][] }
