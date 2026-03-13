import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashAccessCode(accessCode: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(accessCode, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyAccessCode(accessCode: string, storedHash: string): boolean {
  const [salt, expected] = storedHash.split(":");

  if (!salt || !expected) {
    return false;
  }

  const provided = scryptSync(accessCode, salt, KEY_LENGTH);
  const expectedBuffer = Buffer.from(expected, "hex");

  if (provided.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(provided, expectedBuffer);
}

