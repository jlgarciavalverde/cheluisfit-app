import { createHash } from "node:crypto";
import type { Row } from "./db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
}

export interface AuthUser extends User {
  householdId: string;
}

export const toUser = (r: Row): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
});

/**
 * Clave de `@fastify/rate-limit` por sesión en vez de por IP: con `trustProxy: true` la IP sale de
 * `X-Forwarded-For`, que el propio cliente puede inventarse en cada petición y saltarse el límite.
 * El token no se puede inventar (hay que iniciar sesión, que tiene su propio límite), así que es
 * la clave buena para rutas autenticadas. Sin cabecera, se cae a la IP de siempre.
 */
export const perUserKey = (req: { headers: { authorization?: string }; ip: string }): string => {
  const auth = req.headers.authorization;
  return auth ? `u:${createHash("sha256").update(auth).digest("hex").slice(0, 32)}` : `ip:${req.ip}`;
};

/**
 * Resumen de un error para el log, sin el cuerpo de la petición: los errores del SDK de IA
 * (`APICallError`) llevan `requestBodyValues` con la foto en base64 o el contexto de salud de la
 * persona, y no deben acabar en `docker logs`.
 */
export function logSafeError(e: unknown): { name?: string; message: string; statusCode?: number; url?: string } {
  if (!(e instanceof Error)) return { message: String(e) };
  const x = e as Error & { statusCode?: number; url?: string };
  return { name: x.name, message: x.message.slice(0, 500), statusCode: x.statusCode, url: x.url };
}
