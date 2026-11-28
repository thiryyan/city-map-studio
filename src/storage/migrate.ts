/* City Map Studio — Reprise des données d'avant le #118 (clés localStorage « cms3.* », base « cms3 »).
 * Seulement si ces données ont changé depuis la dernière reprise (src/core/prefs.ts : legacyChanged) :
 * 1. copie brute de toutes les clés cms3.* dans le magasin « legacy » ;
 * 2. affiche en cours (cms3.affiche) et Mes affiches (cms3.saves) converties en PosterDoc dans « documents » ;
 *    les préférences ont déjà été reprises sous « cms:* » au chargement ;
 * 3. images de l'ancienne base « cms3 » recopiées dans « images » (celles qui manquent).
 * Rien n'est effacé : la version publiée et les préversions partagent l'origine, et la version publiée d'avant la
 * fusion du lot 1 lit encore cms3.* ; l'effacement des clés cms3.* et de la base cms3 vient à la porte 2.
 * Les données de la version classique (cityMapStudio.*) ne sont jamais lues ni modifiées. */
import {LEGACY, legacyChanged} from '../core/prefs.js';
import {parseDoc, toDoc} from '../core/doc/poster-doc.js';
import {dbGet, dbPut, idb} from './db.js';

const LEGACY_DOC = LEGACY + 'affiche', LEGACY_SAVES = LEGACY + 'saves', OLD_DB = 'cms3';

async function migrateLegacy(): Promise<void> {
  if (!legacyChanged) return;
  let keys: string[] = [];
  try { keys = Object.keys(localStorage).filter(k => k.startsWith(LEGACY)); } catch (e) {}
  if (keys.length) {
    const items: Record<string, string | null> = {};
    for (const k of keys) items[k] = localStorage.getItem(k);
    const at = new Date().toISOString();
    await dbPut('legacy', 'localStorage@' + at, {at, items});
    if (items[LEGACY_DOC]) { try { await dbPut('documents', 'current', toDoc(parseDoc(JSON.parse(items[LEGACY_DOC]!)))); } catch (e) {} }
    if (items[LEGACY_SAVES]) {
      try { const list = JSON.parse(items[LEGACY_SAVES]!); if (Array.isArray(list)) await dbPut('documents', 'saves', {list}); } catch (e) {}
    }
  }
  await copyOldImages();
}

/** Images de la base « cms3 » (avant le #118) qui manquent recopiées ; base d'origine laissée intacte */
async function copyOldImages(){
  const exists = typeof indexedDB.databases === 'function'
    ? (await indexedDB.databases().catch(() => [])).some(d => d.name === OLD_DB) : false;
  if (exists) {
    const recs = await new Promise<[IDBValidKey, unknown][]>(res => {
      try {
        const rq = indexedDB.open(OLD_DB);
        rq.onsuccess = () => {
          const d = rq.result; if (!d.objectStoreNames.contains('images')) { d.close(); res([]); return; }
          const out: [IDBValidKey, unknown][] = [], cur = d.transaction('images').objectStore('images').openCursor();
          cur.onsuccess = () => { const c = cur.result; if (c) { out.push([c.key, c.value]); c.continue(); } else { d.close(); res(out); } };
          cur.onerror = () => { d.close(); res(out); };
        };
        rq.onerror = () => res([]);
      } catch (e) { res([]); }
    });
    for (const [k, v] of recs) if (!(await dbGet('images', String(k)))) await idb('images', 'readwrite', s => { s.put(v, k); });
  }
}

export {migrateLegacy};
