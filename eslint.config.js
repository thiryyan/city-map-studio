// ESLint (#102) : garde-fous des modules ES de js/, lancés par tests/globals.py (donc par la CI)
import globals from 'globals';

export default [{
  files: ['js/**/*.js'],
  languageOptions: {
    sourceType: 'module', ecmaVersion: 2022,
    // CMS : espace de noms posé sur globalThis (js/core.js) ; SKY_* : données du ciel chargées à la demande (lib/sky/)
    globals: {...globals.browser, CMS: 'readonly', SKY_MW: 'readonly', SKY_DATA: 'readonly', maplibregl: 'readonly'}
  },
  rules: {
    'no-undef': ['error', {typeof: true}],   // tout nom d'un autre fichier passe par un import (ou le registre late)
    'no-import-assign': 'error',             // une variable importée ne se réaffecte pas : passer par son setter
    'no-redeclare': 'error'
  }
}];
