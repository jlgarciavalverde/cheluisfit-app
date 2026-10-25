// Configuración de Metro: la de Expo tal cual, con un único cambio.
//
// three ≥ 0.18x solo es ESM de verdad: su `build/three.cjs` (lo que resuelve un `require("three")`,
// como el de react-three-fiber en su build CommonJS) llama a `process.emitWarning`, que no existe
// en React Native — la APK se cerraba al abrir la Nevera 3D («undefined is not a function» en
// three.cjs:12, visto en el emulador). Se fuerza siempre el build ESM (`three.module.js`).
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const threeModule = path.join(path.dirname(require.resolve("three")), "three.module.js");

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "three") return { type: "sourceFile", filePath: threeModule };
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
