import { config } from "dotenv";
import { z } from "zod";

config({ path: ".env.local" });
config();

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1).default("digitale_poef_portal"),
  SESSION_SECRET: z.string().min(32),
  PORTAL_SECURE_COOKIE: z
    .string()
    .optional()
    .transform((value) => value === "true")
});

export const env = envSchema.parse(process.env);
