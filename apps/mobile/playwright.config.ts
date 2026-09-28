import { defineConfig } from "@playwright/test";

const PORT = 8099;

// Sirve el export estático de la web (`pnpm e2e` lo genera antes) con la app de siempre.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-ES",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx serve -s dist -l ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
