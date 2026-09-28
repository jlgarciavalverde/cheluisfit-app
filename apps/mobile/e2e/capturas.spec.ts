import { expect, test } from "./fixtures";

/**
 * Capturas de referencia de ~12 pantallas clave (Fase 6.3 del plan de consolidación del
 * sistema de diseño): detectan cambios visuales no intencionados. Las fotos de ejercicio
 * (`raw.githubusercontent.com`, ver `data/exerciseCatalog.ts`) se sustituyen por un marcador
 * fijo para que la captura no dependa de la red ni cambie si el dataset externo cambia.
 *
 * Primera vez / tras un cambio de diseño intencionado:
 *   pnpm e2e:only -- e2e/capturas.spec.ts --update-snapshots
 */

const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({ body: PLACEHOLDER_PNG, contentType: "image/png" }),
  );
  // El saludo de «Hoy» cambia según la hora del día: congelamos la mañana para que la
  // captura sea estable da igual la hora a la que se ejecute.
  await page.addInitScript(() => {
    const fixed = new Date(2026, 8, 22, 9, 0, 0).getTime();
    const RealDate = window.Date;
    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) super(fixed);
        // biome-ignore lint: reconstruir la fecha real con los argumentos que lleguen
        else super(...(args as ConstructorParameters<typeof Date>));
      }
      static now() {
        return fixed;
      }
    }
    (window as unknown as { Date: typeof Date }).Date = MockDate as unknown as typeof Date;
  });
});

const MOBILE = [
  { name: "hoy", path: "/" },
  { name: "nutricion", path: "/nutricion" },
  { name: "running", path: "/running" },
  { name: "fuerza", path: "/fuerza" },
  { name: "objetivo", path: "/objetivo" },
  { name: "sesion", path: "/sesion/act-3" },
  { name: "ejercicio", path: "/ejercicio/Barbell_Bench_Press_-_Medium_Grip" },
  { name: "entreno-detalle", path: "/entreno/detalle/none" },
  { name: "mas", path: "/mas" },
  { name: "galeria", path: "/galeria" },
] as const;

for (const scheme of ["dark", "light"] as const) {
  test.describe(`capturas · móvil · tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const { name, path } of MOBILE) {
      test(name, async ({ page }) => {
        await page.addInitScript((s) => localStorage.setItem("cf_theme", s), scheme);
        await page.goto(path);
        await page.waitForTimeout(500); // fin de animaciones de entrada
        await expect(page).toHaveScreenshot(`${name}-${scheme}.png`, { fullPage: true });
      });
    }
  });
}

test.describe("capturas · escritorio", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("hoy con barra lateral", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("hoy-escritorio.png", { fullPage: true });
  });
  test("objetivo con barra lateral persistente", async ({ page }) => {
    await page.goto("/objetivo");
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("objetivo-escritorio.png", { fullPage: true });
  });
});
