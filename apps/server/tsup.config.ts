import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // node:sqlite solo existe con el prefijo `node:`; por defecto tsup lo quita y el import se rompe.
  removeNodeProtocol: false,
});
