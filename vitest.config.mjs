// Tests unitaires (#103) : fonctions pures sous Node, sans navigateur (tests/unit/load.mjs réunit les modules et les
// exécute dans un contexte node:vm). npx vitest run ; lancés aussi par tests/unit.py, donc par la suite et la CI.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/unit/*.test.mjs'], environment: 'node', reporters: ['verbose'], testTimeout: 20000 }
});
