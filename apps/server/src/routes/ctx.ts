import type { FastifyInstance } from "fastify";
import type { DB } from "../db";

export interface AppConfig {
  dbPath: string;
  mediaDir: string;
  version: string;
  setupCode?: string;
  webDir?: string;
  downloadsDir?: string;
  allowedOrigins: string[];
  authRateLimit?: number;
  logLevel?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  stravaClientId?: string;
  stravaClientSecret?: string;
}

export interface Ctx {
  db: DB;
  cfg: AppConfig;
}

export type Register = (app: FastifyInstance, ctx: Ctx) => void;
