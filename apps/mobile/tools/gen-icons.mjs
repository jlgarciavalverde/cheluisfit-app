// Genera los iconos de la app (icon, adaptativo, monocromo, splash, favicon).
// Uso: node tools/gen-icons.mjs   (necesita Playwright y la fuente Barlow Condensed)
import { chromium } from "@playwright/test";
import { readdirSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fontDir = resolve(root, "node_modules/@expo-google-fonts/barlow-condensed/700Bold");
const font = join(fontDir, readdirSync(fontDir).find((f) => f.endsWith(".ttf")));
const fontData = readFileSync(font).toString("base64"); // se incrusta: about:blank no puede leer file://
const out = join(root, "assets");
mkdirSync(out, { recursive: true });

const BG = "#0F0E0D";
const TRACK = "#2A2622";
const BRAND = "#FF5B2E";

/** SVG de 1024×1024: anillo de progreso (78 %) con «CF» dentro. `scale` reduce el dibujo para la zona segura. */
function svg({ scale = 1, bg = BG, track = TRACK, arc = BRAND, text = "#F6F2ED", withText = true }) {
  const r = 300;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.78;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ""}
    <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
      <circle cx="512" cy="512" r="${r}" fill="none" stroke="${track}" stroke-width="84"/>
      <circle cx="512" cy="512" r="${r}" fill="none" stroke="${arc}" stroke-width="84" stroke-linecap="round"
        stroke-dasharray="${dash} ${circ}" transform="rotate(-90 512 512)"/>
      ${withText ? `<text x="512" y="595" text-anchor="middle" font-family="Barlow" font-weight="700" font-size="290" fill="${text}" letter-spacing="4">CF</text>` : ""}
    </g>
  </svg>`;
}

const html = (inner, size) => `<!doctype html><html><head><style>
  @font-face { font-family: "Barlow"; src: url("data:font/ttf;base64,${fontData}"); font-weight: 700; }
  html, body { margin: 0; background: transparent; } svg { display: block; width: ${size}px; height: ${size}px; }
</style></head><body>${inner}</body></html>`;

const browser = await chromium.launch();
async function render(name, opts, size = 1024, transparent = false) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(svg(opts), size));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, name), omitBackground: transparent });
  await page.close();
  console.log("ok", name);
}

await render("icon.png", {});
await render("android-icon-foreground.png", { bg: null, scale: 0.66 }, 1024, true);
await render("android-icon-background.png", { bg: BG, withText: false, track: BG, arc: BG }, 1024);
await render("android-icon-monochrome.png", { bg: null, scale: 0.66, track: "#FFFFFF66", arc: "#FFFFFF", text: "#FFFFFF" }, 1024, true);
await render("splash-icon.png", { bg: null, scale: 0.9 }, 1024, true);
await render("favicon.png", { bg: BG, withText: false }, 256);
await browser.close();
