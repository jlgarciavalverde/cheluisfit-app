import { describe, expect, it } from "vitest";
import { footballSummary, inMonth, matchAnalysisData, mergeImportedMatches, outcomeOf, scoreText, type Match } from "./football";

const m = (id: string, date: string, extra: Partial<Match> = {}): Match => ({ id, date, source: "manual", title: "Pachanga", durationS: 3600, ...extra });

describe("resultado", () => {
  it("victoria, empate, derrota y sin resultado", () => {
    expect(outcomeOf({ goalsFor: 3, goalsAgainst: 1 })).toBe("win");
    expect(outcomeOf({ goalsFor: 2, goalsAgainst: 2 })).toBe("draw");
    expect(outcomeOf({ goalsFor: 0, goalsAgainst: 1 })).toBe("loss");
    expect(outcomeOf({ goalsFor: 3 })).toBeNull();
    expect(scoreText({ goalsFor: 3, goalsAgainst: 1 })).toBe("3 – 1");
  });
});

describe("mergeImportedMatches", () => {
  it("no duplica lo ya importado ni lo borrado a propósito", () => {
    const existing = [m("a", "2026-10-01", { externalId: "hc-1", source: "garmin" })];
    const imported = [
      { date: "2026-10-01", source: "garmin" as const, title: "Fútbol", durationS: 3000, externalId: "hc-1" },
      { date: "2026-10-08", source: "garmin" as const, title: "Fútbol", durationS: 3000, externalId: "hc-2" },
      { date: "2026-10-15", source: "garmin" as const, title: "Fútbol", durationS: 3000, externalId: "hc-3" },
    ];
    let n = 0;
    const r = mergeImportedMatches(existing, imported, () => `m${++n}`, ["hc-3"]);
    expect(r.addedCount).toBe(1);
    expect(r.matches.map((x) => x.externalId)).toEqual(["hc-2", "hc-1"]);
  });
});

describe("footballSummary", () => {
  const all = [
    m("a", "2026-10-02", { goalsFor: 3, goalsAgainst: 1, goals: 2, assists: 1, distanceM: 7200, avgHr: 150 }),
    m("b", "2026-10-09", { goalsFor: 1, goalsAgainst: 1, goals: 0, distanceM: 6800, avgHr: 160 }),
    m("c", "2026-09-25", { goalsFor: 0, goalsAgainst: 2 }),
  ];
  it("suma goles, asistencias, balance y medias", () => {
    expect(footballSummary(all)).toEqual({ matches: 3, minutes: 180, goals: 2, assists: 1, wins: 1, draws: 1, losses: 1, avgKm: 7, avgHr: 155 });
  });
  it("filtra por mes y no inventa medias sin datos", () => {
    expect(inMonth(all, "2026-10")).toHaveLength(2);
    expect(footballSummary([m("x", "2026-10-01")])).toMatchObject({ avgKm: null, avgHr: null, wins: 0 });
  });
});

describe("matchAnalysisData", () => {
  it("incluye resultado, lo tuyo, pulso y los partidos anteriores", () => {
    const prev = m("p", "2026-09-20", { goals: 1, goalsFor: 2, goalsAgainst: 0 });
    const cur = m("c", "2026-10-10", { goalsFor: 4, goalsAgainst: 2, goals: 1, assists: 2, position: "medio", format: "7", avgHr: 162, distanceM: 6500, rpe: 8, notes: "Rodilla bien" });
    const text = matchAnalysisData(cur, [prev, cur], 190);
    expect(text).toContain("Partido «Pachanga» del 2026-10-10 (Fútbol 7): 1:00:00 jugados, 6,5 km recorridos, resultado 4 – 2 (victoria).");
    expect(text).toContain("posición medio, 1 gol, 2 asistencias, esfuerzo percibido 8/10");
    expect(text).toContain("FC media 162 ppm (zona 4 de 5");
    expect(text).toContain("Últimos 3 meses antes de este partido: 1 partidos, 1 goles");
    expect(text).toContain("Notas de la persona: Rodilla bien");
  });
});
