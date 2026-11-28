/* City Map Studio — Préférences de l'appareil (#118) : seules données gardées dans localStorage, sous le préfixe
 * « cms: » (taille de l'interface, accord préalable, sections ouvertes…). L'affiche, Mes affiches, les images et
 * l'historique sont dans IndexedDB (src/storage/).
 * Reprise des données d'avant le #118 (« cms3.* ») : lues, jamais effacées avant la porte 2 de l'Horizon 1, car la
 * version publiée et les préversions partagent l'origine (une préversion ouverte ne doit rien retirer à la version
 * publiée). Au chargement, avant toute lecture, une empreinte de l'ensemble des clés cms3.* est comparée à celle de
 * la dernière reprise (« cms:legacy ») : si elles diffèrent (première visite après le #118, ou données modifiées
 * depuis par une version qui écrit encore cms3.*), les préférences sont recopiées sous « cms:<nom> » et
 * `legacyChanged` signale à la migration (src/storage/migrate.ts) qu'il faut reprendre l'affiche et Mes affiches.
 * Module sans import, chargé en premier (core/cms.ts). */
const PREFIX = 'cms:', LEGACY = 'cms3.', MARK = 'cms:legacy';
const PREF_NAMES = ['consent', 'debug', 'welcomed', 'uiScale', 'advOpen', 'styleMoreOpen', 'themeOpen', 'textMoreOpen',
  'safeZone', 'wiki', 'places', 'editUses'];

/** Clé localStorage d'une préférence */
const prefKey = (name: string) => PREFIX + name;

/** Empreinte (FNV-1a, 32 bits) d'un texte */
function fnv(s: string){ let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }

/** Données cms3.* modifiées depuis la dernière reprise (calculé une fois, au chargement) */
const legacyChanged: boolean = (function adoptLegacyPrefs(){
  try{
    const keys = Object.keys(localStorage).filter(k => k.startsWith(LEGACY)).sort();
    if (!keys.length) return false;
    const mark = fnv(JSON.stringify(keys.map(k => [k, localStorage.getItem(k)])));
    if (localStorage.getItem(MARK) === mark) return false;
    for (const n of PREF_NAMES) { const v = localStorage.getItem(LEGACY + n); if (v !== null) localStorage.setItem(PREFIX + n, v); }
    localStorage.setItem(MARK, mark);
    return true;
  }catch(e){ return false; }
})();

export {LEGACY, legacyChanged, PREF_NAMES, prefKey};
