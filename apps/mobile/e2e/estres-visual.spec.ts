import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Estrés visual: con nombres muy largos, números grandes, actividades de las tres fuentes
 * (Garmin/Strava/manual) y un móvil estrecho (360 dp), ningún texto se sale de la pantalla ni se
 * monta encima de otro, y los buscadores miden siempre lo mismo escribas lo que escribas.
 * Comprobado midiendo el DOM, no a ojo; las capturas quedan en `test-results/estres/` para revisarlas.
 */

const LONG = "Entrenamiento de fuerza para toda la parte superior del cuerpo muy largo";
const LONG_FOOD = "Yogur griego natural cremoso con trozos de fresa y arándanos silvestres";
const today = new Date().toISOString().slice(0, 10);

function seed() {
  const runs = [
    { id: "a-g", date: today, type: "run", source: "garmin", title: `${LONG} (Garmin)`, distanceM: 21097, durationS: 6325, avgHr: 162, externalId: "hc-x" },
    { id: "a-s", date: today, type: "run", source: "strava", title: `${LONG} (Strava)`, distanceM: 10012, durationS: 3001, avgHr: 171, externalId: "strava-9" },
    { id: "a-m", date: today, type: "walk", source: "manual", title: `${LONG} (manual)`, distanceM: 0, durationS: 4000 },
  ];
  return {
    cf_running_v1: {
      state: {
        activities: runs,
        templates: [{ id: "tpl-long", name: `${LONG} plantilla`, kind: "easy", items: [] }],
        planned: [{ id: "p1", date: today, templateId: "tpl-long", activityId: "a-g" }],
        lastSync: null,
        source: "garmin",
        dismissedExternalIds: [],
      },
      version: 6,
    },
    cf_nutrition_v1: {
      state: {
        profile: { name: "Chelu", sex: "male", age: 30, heightCm: 180, weightKg: 82, activity: 1.55, goal: "gain" },
        foods: [{ id: "user-long", name: LONG_FOOD, brand: "Marca con un nombre también bastante largo", source: "user", per100: { kcal: 95, protein: 9, carbs: 6, fat: 3, fiber: 0, sugars: 5, satFat: 2, salt: 0.1 }, servings: [] }],
        entries: [{ id: "e1", date: today, meal: "breakfast", foodId: "user-long", name: LONG_FOOD, brand: "Marca con un nombre también bastante largo", grams: 1250, nutrients: { kcal: 1187, protein: 112, carbs: 75, fat: 37, fiber: 0, sugars: 62, satFat: 25, salt: 1.2 } }],
        recents: ["user-long"],
      },
      version: 6,
    },
    cf_strength_v1: {
      state: {
        routines: [
          {
            id: "rt-long",
            name: LONG,
            folder: "Carpeta con un nombre larguísimo para ver cómo se corta",
            exercises: [{ id: "re1", exerciseId: "Barbell_Bench_Press_-_Medium_Grip", sets: [{ type: "normal", repMin: 8, repMax: 12 }, { type: "normal", repMin: 8, repMax: 12 }], restS: 120, rule: "double", increment: 2.5 }],
          },
        ],
        workouts: [],
      },
      version: 1,
    },
  };
}

async function seedStorage(page: Page) {
  const data = seed();
  await page.addInitScript((d) => {
    for (const [k, v] of Object.entries(d)) window.localStorage.setItem(k, JSON.stringify(v));
  }, data);
}

/** Problemas de maquetación medidos en el DOM: desbordes horizontales y textos que se pisan. */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const vw = window.innerWidth;
    if (document.documentElement.scrollWidth > vw + 1) problems.push(`scroll horizontal: ${document.documentElement.scrollWidth} > ${vw}`);

    const inHScroll = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === "auto" || ox === "scroll") && p.scrollWidth > p.clientWidth + 1) return true;
      }
      return false;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (let p: Element | null = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
      }
      return r.bottom > 0 && r.top < window.innerHeight * 3;
    };
    // Hojas de texto: elementos con texto propio (RN Web pinta cada <Text> como div/span).
    // Con un modal abierto (selector, hoja inferior) solo cuenta lo que hay dentro de él: la
    // pantalla de debajo está tapada a propósito.
    const modals = document.querySelectorAll('[aria-modal="true"]');
    const root: ParentNode = modals.length ? modals[modals.length - 1]! : document;
    // La barra de pestañas flota sobre el contenido a propósito (se desplaza por debajo): lo que
    // queda tras ella no cuenta; sus propias etiquetas sí se comprueban entre sí.
    const tabBar = document.querySelector('[data-testid="app-tab-bar"]');
    const barRect = tabBar?.getBoundingClientRect();
    const underBar = (el: Element) => {
      if (!barRect || !tabBar || tabBar.contains(el)) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > barRect.top && r.top < barRect.bottom;
    };
    const leaves = [...root.querySelectorAll("div, span")].filter(
      (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && visible(el) && !inHScroll(el) && !underBar(el),
    );
    const label = (el: Element) => {
      const t = (el.textContent ?? "").trim();
      // Los iconos (Ionicons) son un carácter de uso privado: se nombran para saber cuál es.
      return /^[\uE000-\uF8FF]+$/.test(t) ? `[icono ${el.closest("[aria-label]")?.getAttribute("aria-label") ?? ""}]` : `«${t.slice(0, 40)}»`;
    };
    for (const el of leaves) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) problems.push(`se sale de la pantalla: ${label(el)} (${Math.round(r.left)}–${Math.round(r.right)} de ${vw})`);
    }
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i]!;
        const b = leaves[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 2 && h > 2) problems.push(`se pisan: ${label(a)} y ${label(b)}`);
      }
    }
    return problems;
  });
}

async function check(page: Page, name: string) {
  await page.waitForTimeout(400); // animaciones de entrada
  await page.screenshot({ path: `test-results/estres/${name}.png`, fullPage: true });
  expect(await layoutProblems(page), name).toEqual([]);
}

test("el detector sí caza un solape y un desborde de verdad (control del propio test)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/mas");
  await expect(page.getByTestId("screen-mas")).toBeVisible();
  await page.evaluate(() => {
    const mk = (text: string, css: string) => {
      const d = document.createElement("div");
      d.textContent = text;
      d.setAttribute("style", `position:fixed;z-index:9999;background:#000;color:#fff;${css}`);
      document.body.appendChild(d);
    };
    mk("Etiqueta Garmin", "top:200px;left:40px;width:120px;height:20px");
    mk("Título encima", "top:205px;left:90px;width:120px;height:20px");
    mk("Texto que se sale por la derecha", "top:300px;left:300px;width:200px;height:20px");
  });
  const problems = await layoutProblems(page);
  expect(problems.some((p) => p.includes("se pisan") && p.includes("Garmin"))).toBe(true);
  expect(problems.some((p) => p.includes("se sale de la pantalla"))).toBe(true);
});

for (const [w, h] of [
  [360, 740],
  [390, 844],
] as const) {
  test.describe(`Estrés visual ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test("pantallas con nombres largos y las tres fuentes de actividad", async ({ page }) => {
      await seedStorage(page);
      await page.goto("/");
      await expect(page.getByTestId("screen-hoy")).toBeVisible();
      await check(page, `${w}-hoy`);

      await page.goto("/nutricion");
      await expect(page.getByTestId("screen-nutricion")).toBeVisible();
      await check(page, `${w}-nutricion`);

      await page.goto("/running");
      await expect(page.getByTestId("screen-running")).toBeVisible();
      await check(page, `${w}-running-sesiones`);
      await page.getByRole("tab", { name: "Plantillas" }).click();
      await check(page, `${w}-running-plantillas`);
      await page.getByRole("tab", { name: "Progreso" }).click();
      await check(page, `${w}-running-progreso`);

      await page.goto("/sesion/a-g");
      await check(page, `${w}-sesion-garmin`);

      await page.goto("/fuerza");
      await page.getByRole("tab", { name: "Rutinas" }).click();
      await check(page, `${w}-fuerza-rutinas`);

      await page.goto("/mas");
      await check(page, `${w}-mas`);
    });

    test("entreno en curso: la tabla de series cabe entera", async ({ page }) => {
      await seedStorage(page);
      await page.goto("/fuerza");
      await page.getByRole("tab", { name: "Rutinas" }).click();
      await page.getByText(LONG, { exact: true }).first().click();
      const start = page.getByRole("button", { name: /Empezar/ }).first();
      if (await start.isVisible()) await start.click();
      await expect(page.getByTestId("sets-table")).toBeVisible();
      const done = page.getByTestId("done-0");
      const box = await done.boundingBox();
      expect(box, "círculo de serie hecha").not.toBeNull();
      expect(box!.x + box!.width, "el círculo de «hecha» cabe en la pantalla").toBeLessThanOrEqual(w);
      await check(page, `${w}-entreno`);
    });

    test("los buscadores miden siempre lo mismo, escribas lo que escribas", async ({ page }) => {
      const inputs: [string, () => Promise<void>][] = [
        ["food-search", () => page.goto("/anadir?meal=lunch").then(() => undefined)],
        [
          "ex-search",
          async () => {
            await page.goto("/fuerza");
            await page.getByRole("tab", { name: "Ejercicios" }).click();
          },
        ],
        [
          "picker-search",
          async () => {
            await page.goto("/rutina/new");
            await page.getByTestId("add-exercise").click();
          },
        ],
      ];
      for (const [testId, open] of inputs) {
        await open();
        const input = page.getByTestId(testId);
        await expect(input).toBeVisible();
        const box = input.locator("..");
        const size = async () => {
          const b = (await box.boundingBox())!;
          return { w: Math.round(b.width), h: Math.round(b.height) };
        };
        const empty = await size();
        for (const text of ["a", "ar", "Press banca con barra inclinada", "x".repeat(120), "🏋️‍♂️💪🔥 pollo"]) {
          await input.fill(text);
          await page.waitForTimeout(350);
          expect(await size(), `${testId} con «${text.slice(0, 20)}»`).toEqual(empty);
        }
        await check(page, `${w}-${testId}-lleno`);
        await page.getByRole("button", { name: "Borrar búsqueda" }).first().click();
        expect(await size(), `${testId} tras borrar`).toEqual(empty);
      }
    });
  });
}
