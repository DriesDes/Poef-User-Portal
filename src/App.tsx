import { useEffect, useState } from "react";
import { fetchPortalData, loginWithCode, logout } from "./lib/api";
import type { PortalPayload, SessionPersistence } from "./types";

const persistenceOptions: { value: SessionPersistence; label: string; hint: string }[] = [
  { value: "day", label: "1 dag", hint: "Op gedeelde toestellen." },
  { value: "week", label: "1 week", hint: "Voor tijdelijk persoonlijk gebruik." },
  { value: "month", label: "1 maand", hint: "Geschikt voor een eigen gsm." },
  { value: "year", label: "1 jaar", hint: "Langdurig op een vertrouwd toestel." },
  { value: "forever", label: "Altijd", hint: "Alleen op een privetoestel." }
];

function formatDateTime(isoValue: string): string {
  return new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(isoValue));
}

type AppState = "loading" | "anonymous" | "ready" | "error";

export function App() {
  const [state, setState] = useState<AppState>("loading");
  const [payload, setPayload] = useState<PortalPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [persistence, setPersistence] = useState<SessionPersistence>("month");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadPortal();
  }, []);

  async function loadPortal() {
    setState("loading");
    setErrorMessage(null);

    try {
      const nextPayload = await fetchPortalData();
      setPayload(nextPayload);
      setState("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Portal kon niet geladen worden.";
      if (message === "Niet ingelogd." || message === "Sessie verlopen. Meld opnieuw aan.") {
        setPayload(null);
        setState("anonymous");
        setErrorMessage(message === "Niet ingelogd." ? null : message);
        return;
      }

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
      await loginWithCode(code, persistence);
      setCode("");
      await loadPortal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Aanmelden mislukt.");
      setState("anonymous");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await logout();
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
                  autoComplete="one-time-code"
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
              {state === "error" && !errorMessage && (
                <p className="feedback error">Portal is tijdelijk niet beschikbaar.</p>
              )}

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
