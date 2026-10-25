// Web: el `Canvas` de react-three-fiber pinta en un <canvas> WebGL normal.
// En Android/iOS se usa `FridgeCanvas.native.tsx` (expo-gl). Los hooks salen del mismo sitio que
// el `Canvas` para que compartan la misma copia del renderizador.
export { Canvas, useFrame, useThree } from "@react-three/fiber";
