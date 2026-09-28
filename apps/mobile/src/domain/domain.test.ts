import { describe, expect, it } from "vitest";
import { addDays, dayLabel, toDateKey } from "./dates";
import { fmtDuration, fmtInt, fmtKg, fmtKm, fmtPace, fmtRelativeTime } from "./format";
import { gtinVariants, isValidGtin, normalizeGtin13 } from "./gtin";
import {
  bmr,
  calcTargets,
  nutrientIssues,
  scaleNutrients,
  sumNutrients,
  totalsByMeal,
} from "./nutrition";
import type { Entry, Nutrients, Profile } from "./types";

const profile: Profile = {
  name: "Ejemplo",
  sex: "male",
  age: 30,
  heightCm: 178,
  weightKg: 78,
  activity: 1.55,
  goal: "lose",
};

describe("objetivos", () => {
  it("calcula la TMB de Mifflin-St Jeor", () => {
    // 10·78 + 6,25·178 − 5·30 + 5 = 1747,5
    expect(bmr(profile)).toBeCloseTo(1747.5, 5);
  });

  it("bajar peso: −15 % sobre el mantenimiento, macros coherentes", () => {
    const t = calcTargets(profile);
    // 1747,5 · 1,55 = 2708,6 → ·0,85 = 2302 → 2300
    expect(t.kcal).toBe(2300);
    expect(t.protein).toBe(156); // 2,0 g/kg
    expect(t.fat).toBe(70); // 0,9 g/kg
    // los hidratos son el resto
    expect(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.kcal)).toBeLessThanOrEqual(4);
    expect(t.fiber).toBe(32);
    expect(Object.values(t.mealSplit).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("subir masa: +10 % y proteína 1,8 g/kg", () => {
    const t = calcTargets({ ...profile, goal: "gain" });
    expect(t.kcal).toBe(2980);
    expect(t.protein).toBe(140);
  });

  it("la grasa nunca baja del 20 % de las kcal", () => {
    const t = calcTargets({ ...profile, weightKg: 45, goal: "maintain" });
    expect(t.fat * 9).toBeGreaterThanOrEqual(t.kcal * 0.2 - 9);
  });

  it("acepta un ajuste personalizado", () => {
    expect(calcTargets(profile, -0.2).kcal).toBe(2170);
  });
});

const yogur: Nutrients = {
  kcal: 139,
  protein: 3.3,
  carbs: 13.8,
  fat: 7.8,
  fiber: 0,
  sugars: 13,
  satFat: 5,
  salt: 0.1,
};

describe("nutrientes", () => {
  it("escala por gramos", () => {
    const n = scaleNutrients(yogur, 125);
    expect(n.kcal).toBe(174);
    expect(n.protein).toBe(4.1);
    expect(n.carbs).toBe(17.3);
  });

  it("suma y agrupa por comida", () => {
    const mk = (id: string, meal: Entry["meal"], grams: number): Entry => ({
      id,
      date: "2026-09-21",
      meal,
      foodId: "x",
      name: "x",
      grams,
      nutrients: scaleNutrients(yogur, grams),
    });
    const entries = [mk("a", "breakfast", 100), mk("b", "breakfast", 100), mk("c", "lunch", 200)];
    const by = totalsByMeal(entries);
    expect(by.breakfast.kcal).toBe(278);
    expect(by.lunch.kcal).toBe(278);
    expect(by.dinner.kcal).toBe(0);
    expect(sumNutrients(entries.map((e) => e.nutrients)).kcal).toBe(556);
  });

  it("detecta fichas incoherentes", () => {
    expect(nutrientIssues(yogur)).toEqual([]);
    expect(nutrientIssues({ ...yogur, kcal: 0, protein: 0, carbs: 0, fat: 0 })).toEqual([
      "Faltan los valores nutricionales",
    ]);
    expect(nutrientIssues({ ...yogur, kcal: 20 }).length).toBeGreaterThan(0);
    expect(nutrientIssues({ ...yogur, sugars: 30 })).toContain("Hay más azúcares que hidratos");
  });

  it("una bebida alcohólica no dispara «las kcal no cuadran» falso — el alcohol también aporta energía", () => {
    // Datos reales de OFF (whisky Talisker Storm): 254 kcal/100g con macros casi a 0. Sin el
    // término del alcohol, 4·0+4·0,1+9·0 ≈ 0,4 kcal esperadas frente a 254 reales → falso positivo.
    // 36,1 g de alcohol/100g (ya convertido de % vol por `offClient.ts`, no el 45,8 % vol crudo).
    const whisky = { kcal: 254, protein: 0, carbs: 0.1, fat: 0, fiber: 0, sugars: 0, satFat: 0, salt: 0 };
    expect(nutrientIssues(whisky)).toContain("Las kcal no cuadran con los macros (≈ 0 kcal)"); // sin alcohol: sigue fallando
    expect(nutrientIssues(whisky, 36.1)).toEqual([]); // con el alcohol real, cuadra
  });
});

describe("códigos de barras", () => {
  // Códigos reales vistos en Open Food Facts.
  it.each(["8480000038524", "8480000205049", "8480017588098", "8431876115895", "8480010198867"])(
    "%s es un EAN-13 válido",
    (code) => {
      expect(isValidGtin(code)).toBe(true);
    },
  );

  it("rechaza un dígito de control erróneo o formatos raros", () => {
    expect(isValidGtin("8480000038525")).toBe(false);
    expect(isValidGtin("12345")).toBe(false);
    expect(isValidGtin("84800000385AB")).toBe(false);
    expect(isValidGtin("")).toBe(false);
  });

  it("normaliza UPC-A y EAN-8 a 13 dígitos", () => {
    expect(normalizeGtin13("036000291452")).toBe("0036000291452"); // UPC-A
    expect(normalizeGtin13("96385074")).toBe("0000096385074"); // EAN-8
    expect(normalizeGtin13("8480000038524")).toBe("8480000038524");
    expect(normalizeGtin13("nada")).toBeNull();
  });

  it("genera variantes con y sin ceros para buscar en Open Food Facts", () => {
    const v = gtinVariants("96385074"); // EAN-8 válido
    expect(v).toContain("96385074");
    expect(v).toContain("0000096385074");
    expect(gtinVariants("0036000291452")).toContain("036000291452");
  });

  it("los «códigos» 20512 y 00020512 de Open Food Facts no son GTIN válidos", () => {
    // Aparecen duplicados en OFF (Hacendado «Yogur griego ligero») pero fallan el
    // dígito de control: son errores de la base de datos, un escáner nunca los leerá.
    expect(isValidGtin("00020512")).toBe(false);
    expect(gtinVariants("00020512")).toEqual([]);
  });

  it("un GTIN-14 con dígito indicador distinto de 0 (caja/palé) también genera el GTIN-13 de dentro", () => {
    // "15000281032730": indicador "1" + GTIN-13 real "5000281032733" con su propio dígito de
    // control recalculado para los 14 dígitos — antes solo se quitaban ceros iniciales, así que
    // un indicador 1-9 nunca generaba el código de 13 dígitos que Open Food Facts sí tiene.
    const code = "15000281032730";
    expect(isValidGtin(code)).toBe(true);
    expect(gtinVariants(code)).toContain("5000281032730");
  });
});

describe("fechas y formatos", () => {
  it("suma días y etiqueta hoy/ayer/mañana", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayLabel("2026-09-21", "2026-09-21")).toBe("Hoy");
    expect(dayLabel("2026-09-20", "2026-09-21")).toBe("Ayer");
    expect(dayLabel("2026-09-22", "2026-09-21")).toBe("Mañana");
    expect(toDateKey(new Date(2026, 8, 5))).toBe("2026-09-05");
  });

  it("formatea como en España", () => {
    expect(fmtInt(2302)).toBe("2.302");
    expect(fmtInt(999)).toBe("999");
    expect(fmtInt(12345)).toBe("12.345");
    expect(fmtDuration(2890)).toBe("48:10");
    expect(fmtDuration(6022)).toBe("1:40:22");
    expect(fmtPace(314)).toBe("5:14");
    expect(fmtKm(9200)).toBe("9,2");
    expect(fmtKg(1.25)).toBe("1,25");
    expect(fmtKg(62.5)).toBe("62,5");
    expect(fmtKg(60)).toBe("60");
    expect(fmtKg(71.25)).toBe("71,25");
  });

  it("tiempo relativo de un post social", () => {
    const now = Date.parse("2026-09-23T12:00:00.000Z");
    expect(fmtRelativeTime(now - 30_000, now)).toBe("ahora");
    expect(fmtRelativeTime(now - 5 * 60_000, now)).toBe("hace 5 min");
    expect(fmtRelativeTime(now - 3 * 3600_000, now)).toBe("hace 3 h");
    expect(fmtRelativeTime(now - 2 * 86400_000, now)).toBe("hace 2 d");
    expect(fmtRelativeTime(now - 14 * 86400_000, now)).toBe("hace 2 sem");
    expect(fmtRelativeTime(Date.parse("2025-01-01T00:00:00.000Z"), now)).toBe("1 ene");
  });
});

import { parseNum as parseNumEs } from "./format";

describe("parseNum a la española", () => {
  it("coma o punto decimal, punto de miles, y nada ambiguo", () => {
    expect(parseNumEs("62,5")).toBe(62.5);
    expect(parseNumEs("62.5")).toBe(62.5);
    expect(parseNumEs("1.000")).toBe(1000);
    expect(parseNumEs("1.250")).toBe(1250);
    expect(parseNumEs("1.234,5")).toBe(1234.5);
    expect(parseNumEs("12.345.678")).toBe(12345678);
    expect(parseNumEs("0,25")).toBe(0.25);
    expect(parseNumEs(" 80 ")).toBe(80);
    expect(parseNumEs("")).toBeNull();
    expect(parseNumEs("abc")).toBeNull();
    expect(parseNumEs("1,2,3")).toBeNull();
    expect(parseNumEs("5:14")).toBeNull();
  });
});
