import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { env } from "./env.js";
import { verifyAccessCode } from "./hash.js";
import {
  clearSessionCookie,
  createSessionToken,
  getSessionExpiry,
  hashSessionToken,
  isSessionPersistence,
  readSessionToken,
  setSessionCookie
} from "./session.js";
import {
  supabaseAdmin,
  type LogRow,
  type PortalCodeRow,
  type PortalSessionRow,
  type UserRow
} from "./supabase.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../dist-client");

app.disable("x-powered-by");
app.use(express.json());
app.use(cookieParser());

const loginSchema = z.object({
  code: z.string().trim().min(6).max(128),
  persistence: z.string()
});

type PortalTransaction = {
  id: string;
  timestamp: string;
  type: string;
  amountLabel: string;
  description: string;
};

function formatMoney(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = typeof value === "string" ? Number(value) : value;

  if (Number.isNaN(numeric)) {
    return null;
  }

  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR"
  }).format(numeric);
}

function buildTransaction(log: LogRow): PortalTransaction {
  const amount = formatMoney(log.amount);
  const stripDelta =
    log.strips_before !== null && log.strips_after !== null
      ? log.strips_after - log.strips_before
      : null;
  const saldoDelta =
    log.saldo_before !== null && log.saldo_after !== null
      ? Number(log.saldo_after) - Number(log.saldo_before)
      : null;

  let amountLabel = amount ?? "Geen bedrag";
  let description = log.notes?.trim() || "Geen extra omschrijving";

  if (stripDelta !== null && stripDelta !== 0) {
    amountLabel = `${stripDelta > 0 ? "+" : ""}${stripDelta} strip${Math.abs(stripDelta) === 1 ? "" : "pen"}`;
  } else if (saldoDelta !== null && saldoDelta !== 0) {
    amountLabel = `${saldoDelta > 0 ? "+" : ""}${formatMoney(saldoDelta)}`;
  }

  if (log.product) {
    description = `${log.product}${log.notes ? ` - ${log.notes}` : ""}`;
  }

  return {
    id: log.id,
    timestamp: log.ts,
    type: log.type,
    amountLabel,
    description
  };
}

async function getActivePortalSession(requestToken: string) {
  const tokenHash = hashSessionToken(requestToken);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("portal_sessions")
    .select("id,user_naam,session_token_hash,expires_at,last_seen_at")
    .eq("session_token_hash", tokenHash)
    .gt("expires_at", nowIso)
    .maybeSingle<PortalSessionRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  await supabaseAdmin
    .from("portal_sessions")
    .update({ last_seen_at: nowIso })
    .eq("id", data.id);

  return data;
}

async function requirePortalSession(request: express.Request, response: express.Response, next: express.NextFunction) {
  try {
    const requestToken = readSessionToken(request);

    if (!requestToken) {
      response.status(401).json({ error: "Niet ingelogd." });
      return;
    }

    const session = await getActivePortalSession(requestToken);

    if (!session) {
      clearSessionCookie(response);
      response.status(401).json({ error: "Sessie verlopen. Meld opnieuw aan." });
      return;
    }

    response.locals.portalUserNaam = session.user_naam;
    next();
  } catch (error) {
    next(error);
  }
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ error: "Ongeldige login-aanvraag." });
      return;
    }

    const { code, persistence } = parsed.data;

    if (!isSessionPersistence(persistence)) {
      response.status(400).json({ error: "Ongeldige bewaartermijn." });
      return;
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("portal_access_codes")
      .select("id,user_naam,code_hash,is_active,expires_at,revoked_at")
      .eq("is_active", true)
      .is("revoked_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .returns<PortalCodeRow[]>();

    if (error) {
      throw error;
    }

    const matchedCode = data.find((item) => verifyAccessCode(code, item.code_hash));

    if (!matchedCode) {
      response.status(401).json({ error: "Onbekende of verlopen gebruikerscode." });
      return;
    }

    const expiresAt = getSessionExpiry(persistence);
    const rawToken = createSessionToken();
    const tokenHash = hashSessionToken(rawToken);

    const { error: insertError } = await supabaseAdmin.from("portal_sessions").insert({
      user_naam: matchedCode.user_naam,
      session_token_hash: tokenHash,
      expires_at: expiresAt.toISOString()
    });

    if (insertError) {
      throw insertError;
    }

    await supabaseAdmin
      .from("portal_access_codes")
      .update({ last_used_at: nowIso })
      .eq("id", matchedCode.id);

    setSessionCookie(response, rawToken, expiresAt);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", requirePortalSession, async (request, response, next) => {
  try {
    const requestToken = readSessionToken(request);
    if (requestToken) {
      await supabaseAdmin
        .from("portal_sessions")
        .delete()
        .eq("session_token_hash", hashSessionToken(requestToken));
    }

    clearSessionCookie(response);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/api/portal/me", requirePortalSession, async (_request, response, next) => {
  try {
    const userNaam = response.locals.portalUserNaam as string;

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("naam,tak,saldo,strippen,updated_at")
      .eq("naam", userNaam)
      .maybeSingle<UserRow>();

    if (userError) {
      throw userError;
    }

    if (!user) {
      response.status(404).json({ error: "Gebruiker niet gevonden." });
      return;
    }

    const { data: logs, error: logsError } = await supabaseAdmin
      .from("logs")
      .select("id,ts,type,user,product,amount,saldo_before,saldo_after,strips_before,strips_after,notes")
      .eq("user", userNaam)
      .order("ts", { ascending: false })
      .limit(100)
      .returns<LogRow[]>();

    if (logsError) {
      throw logsError;
    }

    response.json({
      profile: {
        naam: user.naam,
        tak: user.tak,
        saldo: formatMoney(user.saldo),
        strippen: user.strippen ?? 0,
        updatedAt: user.updated_at ?? null
      },
      transactions: logs.map(buildTransaction)
    });
  } catch (error) {
    next(error);
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDist));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({
    error: "Er liep iets mis bij het laden van de portal."
  });
});

app.listen(env.PORT, () => {
  console.log(`Digitale Poef portal server running on http://localhost:${env.PORT}`);
});
