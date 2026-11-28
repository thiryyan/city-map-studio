/* City Map Studio — Base IndexedDB unique (#118) : « city-map-studio », quatre magasins.
 *   documents : affiche en cours (« current ») et Mes affiches (« saves »), au format PosterDoc (src/core/doc/poster-doc.ts)
 *   images    : illustrations importées, par empreinte SHA-256 (src/features/illustration.ts)
 *   history   : historique annuler / rétablir de l'affiche en cours (#16)
 *   legacy    : copie brute des données d'avant le #118 (clés cms3.*), gardée jusqu'à la porte 2 de l'Horizon 1
 * Sans IndexedDB (navigation privée stricte, stockage bloqué), chaque appel échoue : les appelants gardent alors les
 * données en mémoire le temps de la visite. */
const DB_NAME = 'city-map-studio', DB_VERSION = 1;
type StoreName = 'documents' | 'images' | 'history' | 'legacy';
const STORES: StoreName[] = ['documents', 'images', 'history', 'legacy'];

let dbP: Promise<IDBDatabase | null> | null = null;
/** Base ouverte (créée à la première visite) ; null si IndexedDB est indisponible */
function openDb(): Promise<IDBDatabase | null> {
  if (dbP) return dbP;
  dbP = new Promise<IDBDatabase | null>(res => {
    try {
      const rq = indexedDB.open(DB_NAME, DB_VERSION);
      rq.onupgradeneeded = () => { for (const s of STORES) if (!rq.result.objectStoreNames.contains(s)) rq.result.createObjectStore(s); };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return dbP;
}
/** Requête dans une transaction ; résultat une fois la transaction terminée */
async function idb<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const d = await openDb(); if (!d) throw new Error('IndexedDB indisponible');
  return new Promise((res, rej) => {
    try {
      const tx = d.transaction(store, mode), rq = fn(tx.objectStore(store));
      tx.oncomplete = () => res(rq?.result); tx.onerror = tx.onabort = () => rej(tx.error || new Error('IndexedDB'));
    } catch (e) { rej(e); }
  });
}
const dbGet = <T>(store: StoreName, key: string) => idb<T>(store, 'readonly', s => s.get(key));
const dbPut = (store: StoreName, key: string, value: unknown) => idb(store, 'readwrite', s => s.put(value, key));
const dbDelete = (store: StoreName, key: string) => idb(store, 'readwrite', s => s.delete(key));
const dbKeys = async (store: StoreName) => (await idb<IDBValidKey[]>(store, 'readonly', s => s.getAllKeys()) || []).map(String);

export {DB_NAME, dbDelete, dbGet, dbKeys, dbPut, idb, openDb};
export type {StoreName};
