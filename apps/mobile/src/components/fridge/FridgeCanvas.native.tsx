// Android/iOS: el `Canvas` de react-three-fiber sobre `expo-gl` (no funciona en Expo Go sin
// development build; en la APK sí). Ver `FridgeCanvas.tsx` para la web.
export { Canvas, useFrame, useThree } from "@react-three/fiber/native";
