import { chromium } from "@playwright/test";

const routes = [
  "/", "/nutricion", "/fuerza", "/running", "/social", "/mas",
  "/objetivo", "/peso", "/medidas", "/nevera", "/cuenta",
  "/anadir?meal=lunch", "/escaner", "/crear-alimento", "/crear-ejercicio",
  "/sesion/act-3", "/plantilla/tpl-series-800", "/rutina/rt-pecho",
  "/ejercicio/Barbell_Bench_Press_-_Medium_Grip", "/escaner-foto", "/sesion/nueva",
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await page.addInitScript(() => {
  try {
    window.localStorage.setItem("cf_onboarding_v1", JSON.stringify({ state: { seen: true }, version: 0 }));
  } catch {}
});
for (const route of routes) {
  try {
    await page.goto(`http://localhost:8099${route}`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(900);
    const name = route.replace(/[/?=&]/g, "_");
    await page.screenshot({ path: `/tmp/audit${name}.png` });
    console.log("ok", route);
  } catch (e) {
    console.log("FAIL", route, e.message?.slice(0, 80));
  }
}
await browser.close();
