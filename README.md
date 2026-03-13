# Digitale Poef User Portal

Read-only user portal voor Zeescouts De Boekaniers. Gebruikers zien alleen hun eigen saldo, strippen en transacties via een persoonlijke toegangscode.

## Architectuur

- `src/`: React frontend in de Digitale Poef-stijl.
- `server/`: Express API voor veilige code-login, sessiecookies en server-side Supabase queries.
- `supabase/migrations/`: SQL voor portal toegangscodes en sessies.

De frontend leest geen ruwe Supabase tabellen rechtstreeks. Alle gevoelige data loopt via de server met `SUPABASE_SERVICE_ROLE_KEY`, waarna de server alleen de data van de ingelogde gebruiker terugstuurt.

## Vereiste environment variables

Kopieer `.env.example` naar `.env.local` of `.env` en vul minstens dit in:

```env
VITE_APP_TITLE=Digitale Poef
VITE_SUPABASE_URL=https://cyderjajlglaebxqqasd.supabase.co
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=https://cyderjajlglaebxqqasd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SESSION_SECRET=een-lange-random-string-van-minstens-32-karakters
```

Belangrijk:

- `SUPABASE_SERVICE_ROLE_KEY` hoort alleen server-side.
- Zet secrets nooit in git.
- De portal kan pas echt inloggen zodra `portal_access_codes` en `portal_sessions` zijn aangemaakt.

## Opstarten

```bash
npm install
npm run dev
```

Frontend:

- `http://localhost:5173`

API:

- `http://localhost:8787`

## Supabase setup

Voer de SQL uit uit [supabase/migrations/20260313_portal_auth.sql](/C:/Users/Dries/Documents/VSCode/Scouts/Nieuwe map/Poef-User-Portal/supabase/migrations/20260313_portal_auth.sql).

Daarna moet je voor elke gebruiker minstens een gehashte toegangscode invoeren.

Hash genereren:

```bash
node scripts/generate-access-code.mjs mijn-persoonlijke-code
```

En dan bijvoorbeeld:

```sql
insert into public.portal_access_codes (user_naam, code_hash, code_label)
values ('Cavia', '<gegenereerde-hash>', 'persoonlijke code');
```

## Aanbevolen database hardening

De screenshots tonen dat `users` en `logs` nu niet afgeschermd zijn. Voor productie raad ik dit aanvullend aan:

- RLS inschakelen op `users` en `logs`
- client-side directe toegang tot gevoelige tabellen vermijden
- `users.pin` niet hergebruiken als portalcode
- oude portal sessies periodiek opruimen
