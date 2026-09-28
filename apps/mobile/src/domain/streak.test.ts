import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { activeDayStreak } from "./streak";

const TODAY = "2026-09-23";

describe("activeDayStreak", () => {
  it("sin fechas activas, racha 0", () => {
    expect(activeDayStreak([], TODAY)).toBe(0);
  });

  it("hoy y varios días seguidos hacia atrás", () => {
    const dates = [TODAY, addDays(TODAY, -1), addDays(TODAY, -2)];
    expect(activeDayStreak(dates, TODAY)).toBe(3);
  });

  it("un hueco corta la racha", () => {
    const dates = [TODAY, addDays(TODAY, -1), addDays(TODAY, -3)]; // falta ayer-1 (hace 2 días)
    expect(activeDayStreak(dates, TODAY)).toBe(2);
  });

  it("sin nada hoy todavía, sigue contando desde ayer (no rompe la racha a media mañana)", () => {
    const dates = [addDays(TODAY, -1), addDays(TODAY, -2)];
    expect(activeDayStreak(dates, TODAY)).toBe(2);
  });

  it("sin nada hoy ni ayer, racha 0", () => {
    const dates = [addDays(TODAY, -3)];
    expect(activeDayStreak(dates, TODAY)).toBe(0);
  });

  it("fechas duplicadas no inflan la racha", () => {
    const dates = [TODAY, TODAY, addDays(TODAY, -1), addDays(TODAY, -1)];
    expect(activeDayStreak(dates, TODAY)).toBe(2);
  });
});
