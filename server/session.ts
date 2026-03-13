import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "./env.js";

const SESSION_TTL_MS: Record<string, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
  forever: 10 * 365 * 24 * 60 * 60 * 1000
};

export type SessionPersistence = keyof typeof SESSION_TTL_MS;

export function isSessionPersistence(value: string): value is SessionPersistence {
  return value in SESSION_TTL_MS;
}

export function createSessionToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(`${token}:${env.SESSION_SECRET}`).digest("hex");
}

export function getSessionExpiry(persistence: SessionPersistence): Date {
  return new Date(Date.now() + SESSION_TTL_MS[persistence]);
}

export function setSessionCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.PORTAL_SECURE_COOKIE,
    sameSite: "lax",
    expires: expiresAt,
    path: "/"
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.PORTAL_SECURE_COOKIE,
    sameSite: "lax",
    path: "/"
  });
}

export function readSessionToken(request: Request): string | null {
  const value = request.cookies[env.SESSION_COOKIE_NAME];
  return typeof value === "string" && value.length > 0 ? value : null;
}
