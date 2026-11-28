/* City Map Studio — Préférences de l'appareil (#118) : seules données gardées dans localStorage, sous le préfixe
 * « cms: » (taille de l'interface, accord préalable, sections ouvertes…). L'affiche, Mes affiches, les images et
 * l'historique sont dans IndexedDB (src/storage/).
 * Reprise des préférences d'avant le #118 (« cms3.<nom> ») : au chargement, avant toute lecture, chaque ancienne clé
 * présente est recopiée sous « cms:<nom> » ; elle l'emporte, car elle n'existe que tant que la migration unique
 * (src/storage/migrate.ts) ne l'a pas mise de côté puis effacée. Module sans import, chargé en premier (core/cms.ts). */
const PREFIX = 'cms:', LEGACY = 'cms3.';
const PREF_NAMES = ['consent', 'debug', 'welcomed', 'uiScale', 'advOpen', 'styleMoreOpen', 'themeOpen', 'textMoreOpen',
  'safeZone', 'wiki', 'places', 'editUses'];

/** Clé localStorage d'une préférence */
const prefKey = (name: string) => PREFIX + name;

(function adoptLegacyPrefs(){
  try{
    for (const n of PREF_NAMES) { const v = localStorage.getItem(LEGACY + n); if (v !== null) localStorage.setItem(PREFIX + n, v); }
  }catch(e){}
})();

export {LEGACY, PREF_NAMES, prefKey};
