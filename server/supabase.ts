import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

export type UserRow = {
  naam: string;
  tak: string | null;
  saldo: number | string | null;
  strippen: number | null;
  updated_at?: string | null;
};

export type LogRow = {
  id: string;
  ts: string;
  type: string;
  user: string | null;
  product: string | null;
  amount: number | string | null;
  saldo_before: number | string | null;
  saldo_after: number | string | null;
  strips_before: number | null;
  strips_after: number | null;
  notes: string | null;
};

export type PortalCodeRow = {
  id: string;
  user_naam: string;
  code_hash: string;
  is_active: boolean;
  expires_at: string | null;
  revoked_at: string | null;
};

export type PortalSessionRow = {
  id: string;
  user_naam: string;
  session_token_hash: string;
  expires_at: string;
  last_seen_at: string | null;
};

export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

