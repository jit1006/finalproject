// Environment-driven configuration. Never hardcode secrets in real environments.
import { randomBytes } from "node:crypto";

const env = process.env;

export const config = {
  port: Number(env.PRMS_PORT ?? 8000),
  databaseFile: env.PRMS_DATABASE_FILE ?? "./prms.db",
  // Session secret: generated per-process if unset (dev only). Set a fixed value
  // in production so sessions survive restarts.
  sessionSecret: env.PRMS_SESSION_SECRET ?? randomBytes(32).toString("hex"),
  sessionTtlMinutes: Number(env.PRMS_SESSION_TTL_MINUTES ?? 480),
  sessionCookieName: env.PRMS_SESSION_COOKIE ?? "prms_session",
  secureCookies: env.PRMS_SECURE_COOKIES === "true",
  frontendOrigin: env.PRMS_FRONTEND_ORIGIN ?? "http://localhost:5173",
  engineVersion: "prms-sqlite-recon-0.1.0",
  environment: env.PRMS_ENV ?? "development",
};
