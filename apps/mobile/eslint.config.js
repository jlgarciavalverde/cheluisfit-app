// Configuración de ESLint (plana) de Expo: `npx expo lint`.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Reglas del compilador de React (react-hooks 6): marcan patrones que funcionan bien aquí
    // (sincronizar un campo con una prop, `Date.now()` al pintar un resumen). Se ven como aviso
    // para ir limpiándolos, sin que tapen los errores de verdad.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    ignores: ["dist/*", "android/*", "ios/*", "test-results/*", "playwright-report/*", "tools/catalog-cache/*"],
  },
]);
