// Deportes que se pueden enseñar en el perfil público (mismas claves que `SPORTS` del servidor,
// `apps/server/src/schemas.ts`).
export const SPORTS = ["running", "gym", "futbol", "ciclismo", "natacion", "senderismo", "padel", "otros"] as const;
export type Sport = (typeof SPORTS)[number];

export const SPORT_LABEL: Record<Sport, string> = {
  running: "Running",
  gym: "Gimnasio",
  futbol: "Fútbol",
  ciclismo: "Ciclismo",
  natacion: "Natación",
  senderismo: "Senderismo",
  padel: "Pádel",
  otros: "Otros",
};
