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
