import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const start = async (page: Page, routine: string) => {
  await page.goto("/fuerza");
  await page.getByTestId(`start-${routine}`).first().click();
  await expect(page.getByTestId("screen-entreno")).toBeVisible();
};

test.describe("Fuerza · biblioteca", () => {
  test("buscar por nombre, alias inglés y músculo; filtrar por grupo", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByRole("tab", { name: "Ejercicios" }).click();
    await page.getByTestId("ex-search").fill("dominadas");
    await expect(page.getByTestId("ex-Pullups")).toBeVisible();
    await page.getByTestId("ex-search").fill("pull-ups");
    await expect(page.getByTestId("ex-Pullups")).toBeVisible();
    await page.getByTestId("ex-search").fill("");
    await page.getByTestId("group-biceps").click();
    await expect(page.getByTestId("ex-Barbell_Curl")).toBeVisible();
    await expect(page.getByTestId("ex-Pullups")).toHaveCount(0);
  });

  test("ficha con récords, gráfica de 1RM e historial", async ({ page }) => {
    await page.goto("/ejercicio/Barbell_Bench_Press_-_Medium_Grip");
    await expect(page.getByTestId("records")).toContainText("72,5");
    await expect(page.getByTestId("e1rm-chart")).toBeVisible();
    await expect(page.getByText("Historial")).toBeVisible();
  });

  test("crear un ejercicio propio", async ({ page }) => {
    await page.goto("/crear-ejercicio");
    await page.getByTestId("save-exercise").click();
    await expect(page.getByText("Ponle un nombre").first()).toBeVisible();
    await page.getByTestId("cx-name").fill("Press Svend");
    await page.getByTestId("cx-muscle-chest").click();
    await page.getByTestId("save-exercise").click();
    await expect(page.getByTestId("screen-ejercicio")).toContainText("Press Svend");
  });
});

test.describe("Fuerza · imágenes del catálogo", () => {
  test("un ejercicio sin foto propia enseña su GIF, y los que no tienen ninguna imagen no se ofrecen", async ({ page }) => {
    await page.route("https://static.exercisedb.dev/**", (route) =>
      route.fulfill({ body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"), contentType: "image/gif" }),
    );
    // Un ejercicio con GIF y otro oculto (sin imagen), sacados del propio catálogo generado.
    const catalog = (await import("../src/data/catalogGen.json", { with: { type: "json" } })).default as { name: string; frames?: string[]; gif?: string; hidden?: boolean }[];
    const names = new Map<string, number>();
    for (const e of catalog) names.set(e.name, (names.get(e.name) ?? 0) + 1);
    const withGif = catalog.find((e) => e.gif && !e.frames && names.get(e.name) === 1 && e.name.length < 40)!;
    const hidden = catalog.find((e) => e.hidden && names.get(e.name) === 1 && !catalog.some((o) => !o.hidden && o.name.startsWith(e.name)))!;

    await page.goto("/fuerza");
    await page.getByRole("tab", { name: "Ejercicios" }).click();
    await page.getByTestId("ex-search").fill(withGif.name);
    await page.getByText(withGif.name, { exact: true }).first().click();
    await expect(page.getByTestId("exercise-gif")).toBeVisible();

    await page.goBack();
    await page.getByTestId("ex-search").fill(hidden.name);
    await expect(page.getByText(hidden.name, { exact: true })).toHaveCount(0);
  });
});

test.describe("Fuerza · rutinas", () => {
  test("crear una rutina con ejercicios, configurarla y verla en la lista", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByRole("tab", { name: "Rutinas" }).click();
    await page.getByTestId("new-routine").click();
    await page.getByTestId("save-routine").click();
    await expect(page.getByText("Ponle un nombre").first()).toBeVisible();
    await page.getByTestId("rt-name").fill("Mi torso");
    await page.getByTestId("add-exercise").click();
    await page.getByTestId("picker-search").fill("press banca");
    await page.getByTestId("ex-Barbell_Bench_Press_-_Medium_Grip").click();
    await expect(page.getByText("3 × 8–12")).toBeVisible();
    await page.getByRole("button", { name: "Más series" }).click();
    await expect(page.getByText("4 × 8–12")).toBeVisible();
    await page.getByTestId("save-routine").click();
    await expect(page.getByText("Mi torso").first()).toBeVisible();
  });

  test("editar una rutina: superserie con el siguiente y quitar", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByRole("tab", { name: "Rutinas" }).click();
    await page.getByTestId("edit-rt-pecho").click();
    await page.getByRole("button", { name: /Press banca con barra/ }).first().click();
    await page.getByTestId(/^link-/).first().click();
    await expect(page.getByText("A1").first()).toBeVisible();
    await expect(page.getByText("A2").first()).toBeVisible();
  });

  test("repeticiones: escribir 15 en el máximo no toca el mínimo; vaciar y salir deja lo que había", async ({ page }) => {
    await page.goto("/rutina/new");
    await page.getByTestId("rt-name").fill("ZZ rangos");
    await page.getByTestId("add-exercise").click();
    await page.getByTestId("picker-search").fill("press banca");
    await page.getByTestId("ex-Barbell_Bench_Press_-_Medium_Grip").click();
    // En la web el selector, al acabar de cerrarse, devuelve el foco a donde estaba: se espera a que termine.
    await expect(page.getByTestId("picker-search")).toHaveCount(0);
    await page.waitForTimeout(500);
    const max = page.getByTestId(/^max-/);
    const min = page.getByTestId(/^min-/);
    await max.fill("");
    await max.pressSequentially("15");
    await max.blur();
    await expect(min).toHaveValue("8");
    await expect(max).toHaveValue("15");
    await min.fill("");
    await min.blur();
    await expect(min).toHaveValue("8");
    await expect(page.getByText("3 × 8–15")).toBeVisible();
  });

  test("salir del editor con cambios sin guardar pregunta antes", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByRole("tab", { name: "Rutinas" }).click();
    await page.getByTestId("new-routine").click();
    await page.getByTestId("rt-name").fill("ZZ sin guardar");
    await page.getByRole("button", { name: "Volver", exact: true }).click();
    await expect(page.getByRole("heading", { name: "¿Salir sin guardar?" })).toBeVisible();
    await page.getByTestId("leave-unsaved-cancel").click();
    await expect(page.getByTestId("rt-name")).toHaveValue("ZZ sin guardar");
    await page.getByRole("button", { name: "Volver", exact: true }).click();
    await page.getByTestId("leave-unsaved-confirm").click();
    await expect(page.getByTestId("screen-fuerza")).toBeVisible();
    await expect(page.getByText("ZZ sin guardar")).toHaveCount(0);
  });

  test("sin cambios se sale sin preguntar, y guardar no pregunta", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByRole("tab", { name: "Rutinas" }).click();
    await page.getByTestId("edit-rt-pecho").click();
    await page.getByRole("button", { name: "Volver", exact: true }).click();
    await expect(page.getByTestId("screen-fuerza")).toBeVisible();
    await page.getByTestId("edit-rt-pecho").click();
    await page.getByTestId("rt-name").fill("Pecho nuevo");
    await page.getByTestId("save-routine").click();
    await expect(page.getByTestId("screen-fuerza")).toBeVisible();
    await expect(page.getByRole("heading", { name: "¿Salir sin guardar?" })).toHaveCount(0);
    await expect(page.getByText("Pecho nuevo").first()).toBeVisible();
  });

  test("con un entreno abierto, la barra «en curso» no tapa el pie del editor de rutina", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("minimize").click();
    await page.getByRole("tab", { name: "Rutinas" }).click();
    await page.getByTestId("edit-rt-pecho").click();
    const bar = (await page.getByTestId("workout-bar").boundingBox())!;
    const save = (await page.getByTestId("save-routine").boundingBox())!;
    const footerTop = (await page.getByTestId("screen-rutina").getByText(/ejercicios? · \d+ series?$/).boundingBox())!.y;
    expect(bar.y + bar.height).toBeLessThanOrEqual(footerTop);
    expect(bar.y + bar.height).toBeLessThanOrEqual(save.y);
  });

  test("quitar un ejercicio de la rutina se puede deshacer", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByRole("tab", { name: "Rutinas" }).click();
    await page.getByTestId("edit-rt-pecho").click();
    const before = await page.getByTestId(/^rex-/).count();
    await page.getByRole("button", { name: /Press banca con barra/ }).first().click();
    await page.getByRole("button", { name: "Quitar de la rutina" }).click();
    await expect(page.getByTestId(/^rex-/)).toHaveCount(before - 1);
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByTestId(/^rex-/)).toHaveCount(before);
  });
});

test.describe("Fuerza · entrenamiento en curso", () => {
  test("marcar series con un toque, descanso automático, ±15 s y saltar", async ({ page }) => {
    await start(page, "rt-pecho");
    await expect(page.getByTestId("workout-name")).toHaveText("Pecho");
    await expect(page.getByTestId("rest-idle")).toBeVisible();
    await page.getByTestId("done-0").click(); // calentamiento
    await page.getByTestId("done-1").click(); // serie 1 con lo sugerido
    await expect(page.getByTestId("rest-bar")).toBeVisible();
    await expect(page.getByTestId("kg-1")).toHaveValue("72,5");
    await expect(page.getByTestId("reps-1")).toHaveValue("10");
    await page.getByTestId("rest-plus").click();
    await expect(page.getByTestId("rest-bar")).toContainText("3:15");
    await page.getByTestId("rest-minus").click();
    await page.getByTestId("rest-minus").click();
    await expect(page.getByTestId("rest-bar")).toContainText("2:45");
    await page.getByTestId("rest-skip").click();
    await expect(page.getByTestId("rest-idle")).toBeVisible();
  });

  test("no deja marcar una serie sin datos: primera vez sin peso conocido", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("circle-add").click();
    await page.getByTestId("picker-search").fill("banca con mancuernas");
    await page.getByTestId("ex-Dumbbell_Bench_Press").click(); // sin historial: no hay peso sugerido
    await expect(page.getByTestId("suggestion")).toContainText("Primera vez");
    await page.getByTestId("done-0").click();
    await expect(page.getByTestId("done-0")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(/Faltan datos/)).toBeVisible();
    await page.getByTestId("kg-0").fill("20");
    await page.getByTestId("done-0").click();
    await expect(page.getByTestId("done-0")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("reps-0")).toHaveValue("8"); // repeticiones sugeridas (mínimo del rango)
  });

  test("escribir kilos y repeticiones distintos de lo sugerido", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("kg-1").fill("75");
    await page.getByTestId("reps-1").fill("8");
    await page.getByTestId("done-1").click();
    await expect(page.getByTestId("kg-1")).toHaveValue("75");
    await expect(page.getByTestId("reps-1")).toHaveValue("8");
    await expect(page.getByTestId("done-1")).toHaveAttribute("aria-checked", "true");
  });

  test("drop set: subfila «D», sin descanso entre la serie y su drop, descanso al acabar", async ({ page }) => {
    await start(page, "rt-biceps");
    await page.getByTestId("add-drop").click();
    const last = page.getByTestId("sets-table").locator('[data-testid^="set-row-"]').last();
    await expect(last).toContainText("D");
    // curl con barra Z: 4 series + drop → el drop es la fila 4
    await page.getByTestId("kg-4").fill("15");
    await page.getByTestId("reps-4").fill("8");
    for (const i of [0, 1, 2]) await page.getByTestId(`done-${i}`).click();
    await page.getByTestId("rest-skip").click();
    await page.getByTestId("done-3").click(); // serie madre: la siguiente fila es un drop → sin descanso
    await expect(page.getByTestId("rest-idle")).toBeVisible();
    await page.getByTestId("done-4").click(); // el drop cierra la cadena → descanso
    await expect(page.getByTestId("rest-bar")).toBeVisible();
  });

  test("tipo de serie desde el menú y «drop debajo»", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("set-label-2").click();
    await page.getByTestId("type-failure").click();
    await expect(page.getByTestId("set-row-2")).toContainText("F");
    await page.getByTestId("set-label-2").click();
    await page.getByTestId("add-drop-below").click();
    await expect(page.getByTestId("set-row-3")).toContainText("D");
  });

  test("un drop nuevo trae su sugerencia (20 % menos) aunque la serie de encima solo esté sugerida", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("set-label-2").click();
    await page.getByTestId("add-drop-below").click();
    // la serie 2 sugiere 72,5 kg → el drop, 57,5 (72,5 × 0,8 = 58 → múltiplo de 2,5 más cercano)
    await expect(page.getByTestId("kg-3")).toHaveAttribute("placeholder", "57,5");
    await expect(page.getByTestId("reps-3")).not.toHaveAttribute("placeholder", "–");
  });

  test("esfuerzo: RIR y RPE son la misma escala", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("effort-1").click();
    await page.getByTestId("effort-opt-2").click(); // RIR 2 → RPE 8
    await expect(page.getByTestId("effort-1")).toContainText("2");
    await page.getByTestId("effort-mode").click(); // pasa a RPE
    await expect(page.getByTestId("effort-1")).toContainText("8");
    await page.getByTestId("effort-mode").click();
    await expect(page.getByTestId("effort-1")).toContainText("2");
  });

  test("sobrecarga: la máquina llegó al máximo y sugiere subir; explica el motivo", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("circle-2").click();
    await expect(page.getByTestId("suggestion")).toContainText("Sube a 52,5 kg");
    await expect(page.getByTestId("suggestion")).toContainText("12·12·12");
    await expect(page.getByTestId("kg-0")).toHaveAttribute("placeholder", "52,5");
    await page.getByTestId("circle-0").click();
    await expect(page.getByTestId("suggestion")).toContainText("Mantén 72,5 kg");
  });

  test("«Anterior» se copia al tocarlo", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("prev-1").click();
    await expect(page.getByTestId("kg-1")).toHaveValue("72,5");
    await expect(page.getByTestId("reps-1")).toHaveValue("9");
  });

  test("sustituir un ejercicio por otro del mismo músculo", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("exercise-menu").click();
    await page.getByTestId("menu-replace").click();
    await expect(page.getByText(/Mismo músculo \(\d+\)/)).toBeVisible();
    await page.getByTestId("picker-search").fill("banca con mancuernas");
    await page.getByTestId("ex-Dumbbell_Bench_Press").click();
    await expect(page.getByTestId("exercise-name")).toHaveText("Press banca con mancuernas");
  });

  test("añadir un ejercicio olvidado con el círculo +", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("circle-add").click();
    await page.getByTestId("picker-search").fill("flexiones");
    await page.getByTestId("ex-Pushups").click();
    await expect(page.getByTestId("exercise-name")).toHaveText("Flexiones");
    await expect(page.getByTestId("circles").locator("[data-testid^=circle-]:not([data-testid=circle-add])")).toHaveCount(5);
  });

  test("superserie: al marcar A1 pasa a A2 sin descanso y el descanso llega tras A2", async ({ page }) => {
    await start(page, "rt-biceps");
    await page.getByTestId("circle-1").click();
    await expect(page.getByTestId("superset-note")).toBeVisible();
    await page.getByTestId("done-0").click();
    await expect(page.getByTestId("exercise-name")).toHaveText("Curl en banco Scott");
    await expect(page.getByTestId("rest-idle")).toBeVisible();
    await page.getByTestId("done-0").click();
    await expect(page.getByTestId("rest-bar")).toBeVisible();
  });

  test("enlazar dos ejercicios en superserie desde el menú", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("exercise-menu").click();
    await page.getByTestId("menu-link").click();
    await page.getByTestId("link-with-1").click();
    await expect(page.getByTestId("superset-note")).toBeVisible();
    await expect(page.getByText("A1").first()).toBeVisible();
  });

  test("las series hechas dejan el círculo con ✓", async ({ page }) => {
    await start(page, "rt-core");
    const n = await page.getByTestId("sets-table").locator('[data-testid^="set-row-"]').count();
    for (let i = 0; i < n; i++) {
      await page.getByTestId(`done-${i}`).click();
      if (await page.getByTestId("rest-skip").count()) await page.getByTestId("rest-skip").click();
    }
    await expect(page.getByTestId("circle-0")).toHaveAccessibleName(/hecho/);
    await expect(page.getByTestId("next-exercise")).toBeVisible();
  });

  test("sobrevive a cerrar la app: se retoma con las series hechas", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("done-0").click();
    await page.getByTestId("done-1").click();
    await page.goto("/fuerza"); // recarga completa = «cerrar y abrir»
    await expect(page.getByTestId("active-card")).toContainText("2 series hechas");
    await page.getByTestId("continue-workout").click();
    await expect(page.getByTestId("done-1")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("kg-1")).toHaveValue("72,5");
  });

  test("minimizar deja la barra «en curso» en las demás pestañas", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("minimize").click();
    await page.getByTestId("tab-nutricion").click();
    await expect(page.getByTestId("workout-bar")).toBeVisible();
    await page.getByTestId("workout-bar").click();
    await expect(page.getByTestId("screen-entreno")).toBeVisible();
  });

  test("empezar otro con uno abierto pregunta y permite descartar", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("minimize").click();
    await page.getByTestId("start-rt-espalda").first().click();
    await page.getByTestId("discard-and-start").click();
    await expect(page.getByTestId("workout-name")).toHaveText("Espalda");
  });

  test("terminar: descarta lo no marcado, resumen con récord y actualizar la rutina", async ({ page }) => {
    await start(page, "rt-pecho");
    // sustituir el último ejercicio para tener algo que actualizar en la rutina
    await page.getByTestId("circle-3").click();
    await page.getByTestId("exercise-menu").click();
    await page.getByTestId("menu-replace").click();
    await page.getByTestId("picker-search").fill("aperturas");
    await page.getByTestId("ex-Dumbbell_Flyes").click();
    await page.getByTestId("circle-0").click();
    // subimos el peso: récord de peso máximo en press banca (77,5 > 72,5)
    await page.getByTestId("kg-1").fill("77.5");
    await page.getByTestId("reps-1").fill("6");
    await page.getByTestId("done-1").click();
    await page.getByTestId("finish").click();
    await expect(page.getByTestId("finish-warning")).toBeVisible();
    await page.getByTestId("finish-save").click();
    await expect(page.getByTestId("screen-resumen")).toBeVisible();
    await expect(page.getByTestId("summary-prs")).toContainText("Peso máximo");
    await expect(page.getByTestId("sum-volume")).toContainText("465");
    await expect(page.getByTestId("update-routine")).toContainText("sustituido");
    await expect(page.getByTestId("update-routine")).not.toContainText("quitado");
    await page.getByTestId("update-routine-yes").click();
    await expect(page.getByText("Rutina actualizada")).toBeVisible();
    await page.getByTestId("summary-done").click();
    await page.getByRole("tab", { name: "Rutinas" }).click();
    await expect(page.getByTestId("routine-rt-pecho")).toContainText("Aperturas con mancuernas");
  });

  test("terminar sin ninguna serie marcada no guarda nada", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("finish").click();
    await expect(page.getByTestId("finish-save")).toBeDisabled();
    await page.getByTestId("finish-discard").click();
    await page.getByTestId("confirm-discard-confirm").click();
    await expect(page.getByTestId("screen-fuerza")).toBeVisible();
    await expect(page.getByTestId("active-card")).toHaveCount(0);
  });

  test("saltarse ejercicios no propone quitarlos de la rutina", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("done-1").click(); // solo se hace una serie del primero
    await page.getByTestId("finish").click();
    await page.getByTestId("finish-save").click();
    await expect(page.getByTestId("screen-resumen")).toBeVisible();
    await expect(page.getByTestId("update-routine")).toHaveCount(0);
  });

  test("repetir el último no propone «Actualizar rutina» (pisaba la rutina de verdad)", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByTestId("repeat-last").click();
    await expect(page.getByTestId("screen-entreno")).toBeVisible();
    await page.getByTestId("circle-add").click();
    await page.getByTestId("picker-search").fill("dominadas");
    await page.getByTestId("ex-Pullups").click();
    await page.getByTestId("reps-0").fill("8");
    await page.getByTestId("done-0").click();
    await page.getByTestId("finish").click();
    await page.getByTestId("finish-save").click();
    await expect(page.getByTestId("screen-resumen")).toBeVisible();
    await expect(page.getByTestId("update-routine")).toHaveCount(0);
  });

  test("entrenamiento vacío: nombre con el día, sin descanso suelto y explica por qué no se guarda", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByTestId("start-empty").click();
    await expect(page.getByTestId("workout-name")).toHaveText(/^Entreno del (lunes|martes|miércoles|jueves|viernes|sábado|domingo)$/);
    await expect(page.getByTestId("rest-start")).toHaveCount(0);
    await page.getByTestId("finish").click();
    await expect(page.getByTestId("finish-save")).toBeDisabled();
    await expect(page.getByTestId("finish-empty-hint")).toBeVisible();
    await page.getByRole("button", { name: "Seguir entrenando" }).click();
    await page.getByRole("button", { name: "Añadir ejercicio" }).first().click();
    await expect(page.getByText("Será el primero del entrenamiento")).toBeVisible();
  });

  test("entrenamiento vacío: añadir ejercicios y terminar", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByTestId("start-empty").click();
    await page.getByRole("button", { name: "Añadir ejercicio" }).first().click();
    await page.getByTestId("picker-search").fill("dominadas");
    await page.getByTestId("ex-Pullups").click();
    await expect(page.getByTestId("exercise-name")).toHaveText("Dominadas");
    await page.getByTestId("reps-0").fill("8");
    await page.getByTestId("done-0").click();
    await page.getByTestId("finish").click();
    await page.getByTestId("finish-save").click();
    await expect(page.getByTestId("screen-resumen")).toBeVisible();
  });
});

test.describe("Fuerza · historial", () => {
  test("detalle de un entreno pasado, corregir una serie y repetirlo", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByRole("tab", { name: "Historial" }).click();
    await expect(page.getByTestId("muscle-volume")).toBeVisible();
    await page.getByTestId(/^workout-/).first().click();
    await expect(page.getByTestId("screen-detalle")).toBeVisible();
    await page.getByTestId("edit-set-0-1").click();
    await page.getByTestId("edit-kg").fill("80");
    await expect(page.getByTestId("wex-0")).toContainText("80 kg");
    await page.getByRole("button", { name: "Listo" }).click();
    await page.getByTestId("repeat-workout").click();
    await expect(page.getByTestId("screen-entreno")).toBeVisible();
  });

  test("corregir el tipo de una serie desde el historial", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByRole("tab", { name: "Historial" }).click();
    await page.getByTestId(/^workout-/).first().click();
    await expect(page.getByTestId("screen-detalle")).toBeVisible();
    await page.getByTestId("edit-set-0-1").click();
    const title = page.getByRole("heading", { name: /^Corregir serie/ });
    await expect(title).toHaveText(/^Corregir serie \d$/);
    await page.getByTestId("edit-type-failure").click();
    await expect(page.getByText(/· Al fallo$/)).toBeVisible();
  });

  test("eliminar un entreno con deshacer", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByRole("tab", { name: "Historial" }).click();
    const before = await page.getByTestId(/^workout-/).count();
    await page.getByTestId(/^workout-/).first().click();
    await page.getByTestId("delete-workout").click();
    await expect(page.getByText("Entrenamiento eliminado")).toBeVisible();
    await page.getByRole("button", { name: "Deshacer" }).click();
    await page.getByRole("tab", { name: "Historial" }).click();
    await expect(page.getByTestId(/^workout-/)).toHaveCount(before);
  });
});

test.describe("Fuerza · extras", () => {
  test("calculadora de discos: 100 kg = 25 + 15 por lado con barra de 20", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("exercise-menu").click();
    await page.getByTestId("menu-plates").click();
    await page.getByTestId("plates-total").fill("100");
    await expect(page.getByTestId("plates-result")).toContainText("25 kg");
    await expect(page.getByTestId("plates-result")).toContainText("15 kg");
    await page.getByTestId("plates-total").fill("62,5");
    await expect(page.getByTestId("plates-result")).toContainText("20 kg");
    await expect(page.getByTestId("plates-result")).toContainText("1,25 kg");
  });

  test("ajustes de gimnasio: la barra y los discos cambian la calculadora", async ({ page }) => {
    await page.goto("/mas");
    await page.getByTestId("bar-15").click();
    await page.getByTestId("plate-25").click(); // quita los discos de 25
    await page.getByTestId("plate-20").click(); // y los de 20
    await start(page, "rt-pecho");
    await page.getByTestId("exercise-menu").click();
    await page.getByTestId("menu-plates").click();
    await page.getByTestId("plates-total").fill("75");
    // (75 − 15) / 2 = 30 por lado = 15 + 15 (sin discos de 25 ni de 20)
    await expect(page.getByTestId("plates-result")).toContainText("2 ×");
    await expect(page.getByTestId("plates-result")).toContainText("15 kg");
  });

  test("Hoy: enseña la rutina que toca, empieza y luego ofrece continuar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("hoy-fuerza")).toContainText("Hoy toca");
    await page.getByTestId("hoy-start").click();
    await expect(page.getByTestId("screen-entreno")).toBeVisible();
    await page.getByTestId("minimize").click();
    await page.getByTestId("tab-index").click();
    await expect(page.getByTestId("hoy-fuerza")).toContainText("en curso");
    await page.getByTestId("hoy-continue").click();
    await expect(page.getByTestId("screen-entreno")).toBeVisible();
  });

  test("restablecer datos de ejemplo también restablece el gimnasio", async ({ page }) => {
    await start(page, "rt-pecho");
    await page.getByTestId("done-1").click();
    await page.getByTestId("finish").click();
    await page.getByTestId("finish-save").click();
    await page.getByTestId("summary-done").click();
    await page.getByRole("tab", { name: "Historial" }).click();
    const withNew = await page.getByTestId(/^workout-/).count();
    await page.getByTestId("tab-mas").click();
    await page.getByTestId("reset-demo").click();
    await page.getByTestId("confirm-reset-confirm").click();
    await page.getByTestId("tab-fuerza").click();
    await page.getByRole("tab", { name: "Historial" }).click();
    expect(await page.getByTestId(/^workout-/).count()).toBe(withNew - 1);
  });
});

