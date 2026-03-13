import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import type { PortalPayload, SessionPersistence } from "./types";

const LOGIN_EXPIRY_KEY = "digitale-poef-portal-expiry";

const persistenceOptions: { value: SessionPersistence; label: string; hint: string }[] = [
  { value: "day", label: "1 dag", hint: "Op gedeelde toestellen." },
  { value: "week", label: "1 week", hint: "Voor tijdelijk persoonlijk gebruik." },
  { value: "month", label: "1 maand", hint: "Geschikt voor een eigen gsm." },
  { value: "year", label: "1 jaar", hint: "Langdurig op een vertrouwd toestel." },
  { value: "forever", label: "Altijd", hint: "Alleen op een privetoestel." }
];

const persistenceDurations: Record<Exclude<SessionPersistence, "forever">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000
};

type AppState = "loading" | "anonymous" | "ready" | "error";

type UserRow = {
  naam: string;
  tak: string | null;
  saldo: number | string | null;
  strippen: number | null;
  updated_at: string | null;
};

type LogRow = {
  id: string;
  ts: string;
  type: string;
  product: string | null;
  amount: number | string | null;
  saldo_before: number | string | null;
  saldo_after: number | string | null;
  strips_before: number | null;
  strips_after: number | null;
  notes: string | null;
};

function formatDateTime(isoValue: string): string {
  return new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(isoValue));
}

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

function buildPortalEmail(code: string): string {
  const normalized = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${normalized}@portal.digitale-poef.local`;
}

function setLoginExpiry(persistence: SessionPersistence) {
  if (persistence === "forever") {
    window.localStorage.removeItem(LOGIN_EXPIRY_KEY);
    return;
  }

  const expiresAt = Date.now() + persistenceDurations[persistence];
  window.localStorage.setItem(LOGIN_EXPIRY_KEY, String(expiresAt));
}

async function clearExpiredSession() {
  const expiry = window.localStorage.getItem(LOGIN_EXPIRY_KEY);
  if (!expiry) {
    return;
  }

  const expiresAt = Number(expiry);
  if (Number.isNaN(expiresAt) || expiresAt > Date.now()) {
    return;
  }

  await supabase.auth.signOut();
  window.localStorage.removeItem(LOGIN_EXPIRY_KEY);
}

function mapTransactions(logs: LogRow[]) {
  return logs.map((log) => {
    const stripDelta =
      log.strips_before !== null && log.strips_after !== null
        ? log.strips_after - log.strips_before
        : null;
    const saldoDelta =
      log.saldo_before !== null && log.saldo_after !== null
        ? Number(log.saldo_after) - Number(log.saldo_before)
        : null;

    let amountLabel = formatMoney(log.amount) ?? "Geen bedrag";
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
  });
}

export function App() {
  const [state, setState] = useState<AppState>("loading");
  const [payload, setPayload] = useState<PortalPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [persistence, setPersistence] = useState<SessionPersistence>("month");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void initializePortal();
  }, []);

  async function initializePortal() {
    setState("loading");
    setErrorMessage(null);

    try {
      await clearExpiredSession();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setPayload(null);
        setState("anonymous");
        return;
      }

      await loadPortal();
    } catch (error) {
      setPayload(null);
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Portal kon niet geladen worden.");
    }
  }

  async function loadPortal() {
    setState("loading");
    setErrorMessage(null);

    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        setPayload(null);
        setState("anonymous");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("naam,tak,saldo,strippen,updated_at")
        .single<UserRow>();

      if (profileError) {
        throw profileError;
      }

      const { data: logs, error: logsError } = await supabase
        .from("logs")
        .select("id,ts,type,product,amount,saldo_before,saldo_after,strips_before,strips_after,notes")
        .order("ts", { ascending: false })
        .limit(100)
        .returns<LogRow[]>();

      if (logsError) {
        throw logsError;
      }

      setPayload({
        profile: {
          naam: profile.naam,
          tak: profile.tak,
          saldo: formatMoney(profile.saldo),
          strippen: profile.strippen ?? 0,
          updatedAt: profile.updated_at ?? null
        },
        transactions: mapTransactions(logs)
      });
      setState("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Portal kon niet geladen worden.";
      setPayload(null);
      setState("error");
      setErrorMessage(message);
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const normalizedCode = code.trim().toLowerCase();
      const { error } = await supabase.auth.signInWithPassword({
        email: buildPortalEmail(normalizedCode),
        password: normalizedCode
      });

      if (error) {
        throw error;
      }

      setLoginExpiry(persistence);
      setCode("");
      await loadPortal();
    } catch (error) {
      setPayload(null);
      setState("anonymous");
      setErrorMessage(error instanceof Error ? "Aanmelden mislukt. Controleer je code." : "Aanmelden mislukt.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await supabase.auth.signOut();
      window.localStorage.removeItem(LOGIN_EXPIRY_KEY);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Afmelden mislukt.");
    } finally {
      setSubmitting(false);
      setPayload(null);
      setState("anonymous");
    }
  }

  const title = import.meta.env.VITE_APP_TITLE || "Digitale Poef";

  return (
    <div className="shell">
      <header className="portal-header">
        <div className="brand-mark" aria-hidden="true">
          <span />
        </div>
        <div className="header-copy">
          <p className="eyebrow">Zeescouts De Boekaniers</p>
          <h1>{title} Portal</h1>
          <p className="subtitle">Bekijk veilig je saldo, strippen en recente transacties.</p>
        </div>
        <div className="status-badge">{state === "ready" ? "Verbonden" : "Read-only"}</div>
      </header>

      <main className="portal-main">
        {(state === "loading" || state === "error" || state === "anonymous") && (
          <section className="panel auth-panel">
            <div className="panel-heading">
              <h2>Persoonlijke toegang</h2>
              <p>Gebruik je persoonlijke code om alleen je eigen portaal te openen.</p>
            </div>

            <form className="auth-form" onSubmit={handleLogin}>
              <label className="field">
                <span>Gebruikerscode</span>
                <input
                  type="password"
                  inputMode="text"
                  autoComplete="current-password"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Vul je persoonlijke code in"
                  disabled={submitting}
                />
              </label>

              <label className="field">
                <span>Ingelogd blijven</span>
                <select
                  value={persistence}
                  onChange={(event) => setPersistence(event.target.value as SessionPersistence)}
                  disabled={submitting}
                >
                  {persistenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="option-hints" aria-hidden="true">
                {persistenceOptions.map((option) => (
                  <div
                    key={option.value}
                    className={option.value === persistence ? "option-hint active" : "option-hint"}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                  </div>
                ))}
              </div>

              {errorMessage && <p className="feedback error">{errorMessage}</p>}
              {state === "loading" && <p className="feedback">Sessie controleren...</p>}

              <button className="primary-button" type="submit" disabled={submitting || code.trim().length < 6}>
                {submitting ? "Bezig..." : "Verder naar mijn portal"}
              </button>
            </form>
          </section>
        )}

        {state === "ready" && payload && (
          <>
            <section className="panel hero-panel">
              <div className="hero-copy">
                <p className="eyebrow">Persoonlijk overzicht</p>
                <h2>{payload.profile.naam}</h2>
                <p>{payload.profile.tak ? `Tak: ${payload.profile.tak}` : "Tak niet beschikbaar"}</p>
              </div>
              <div className="hero-actions">
                <p className="read-only-pill">Alleen consulteren</p>
                <button className="secondary-button" type="button" onClick={handleLogout} disabled={submitting}>
                  Uitloggen
                </button>
              </div>
            </section>

            <section className="metrics-grid" aria-label="Kerngegevens">
              <article className="panel metric-card">
                <p className="metric-label">Huidig saldo</p>
                <strong className="metric-value">{payload.profile.saldo ?? "Onbekend"}</strong>
                <span className="metric-meta">Laatste gekende stand</span>
              </article>

              <article className="panel metric-card">
                <p className="metric-label">Strippen</p>
                <strong className="metric-value">{payload.profile.strippen}</strong>
                <span className="metric-meta">Beschikbaar op je account</span>
              </article>
            </section>

            <section className="panel transactions-panel">
              <div className="panel-heading">
                <h2>Transactiegeschiedenis</h2>
                <p>Meest recente bewegingen eerst. Dit overzicht is uitsluitend read-only.</p>
              </div>

              {payload.transactions.length === 0 ? (
                <div className="empty-state">
                  <h3>Nog geen transacties</h3>
                  <p>Er zijn nog geen portaltransacties zichtbaar voor dit account.</p>
                </div>
              ) : (
                <div className="transaction-list" role="list">
                  {payload.transactions.map((transaction) => (
                    <article key={transaction.id} className="transaction-row" role="listitem">
                      <div>
                        <p className="transaction-type">{transaction.type}</p>
                        <p className="transaction-description">{transaction.description}</p>
                      </div>
                      <div className="transaction-side">
                        <strong>{transaction.amountLabel}</strong>
                        <span>{formatDateTime(transaction.timestamp)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
