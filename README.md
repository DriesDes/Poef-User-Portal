# Digitale Poef User Portal

Statische read-only user portal voor Zeescouts De Boekaniers, bedoeld voor deployment op GitHub Pages.

## Architectuur

- `src/`: React frontend in de Digitale Poef-stijl.
- `supabase/migrations/20260313_github_pages_portal_auth.sql`: RLS en mapping voor frontend-only toegang via Supabase Auth.
- `scripts/provision-portal-auth.mjs`: lokaal adminscript dat voor alle bestaande users automatisch portal-auth accounts en inlogcodes aanmaakt.

Deze variant gebruikt geen eigen backend. De portal draait volledig statisch en leest rechtstreeks uit Supabase met de publieke anon key. Toegang wordt afgedwongen met Supabase Auth en RLS.

## Benodigde env vars

Voor lokaal werken in `.env.local`:

```env
VITE_APP_TITLE=Digitale Poef
VITE_SUPABASE_URL=https://cyderjajlglaebxqqasd.supabase.co
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=https://cyderjajlglaebxqqasd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Voor GitHub Pages zet je in GitHub repo settings onder `Settings` > `Secrets and variables` > `Actions` deze repository variables:

- `VITE_APP_TITLE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Eenmalige Supabase setup

1. Voer [20260313_github_pages_portal_auth.sql](/C:/Users/Dries/Documents/VSCode/Scouts/Nieuwe%20map/Poef-User-Portal/supabase/migrations/20260313_github_pages_portal_auth.sql) uit in Supabase SQL Editor.
2. Controleer dat `users` en `logs` nu RLS hebben ingeschakeld.
3. Run lokaal:

```bash
npm install
npm run provision:portal-auth
```

Dat script doet dit automatisch:

- leest alle users uit `public.users`
- maakt voor elke user een Supabase Auth account aan of werkt het bij
- maakt of update de mapping in `public.portal_accounts`
- schrijft een lokaal CSV-bestand `portal_login_codes_YYYY-MM-DD.csv` met alle plain-text login codes

Belangrijk:

- commit dat gegenereerde CSV-bestand niet
- de login code is de volledige gebruikerscode uit dat CSV-bestand
- als je codes opnieuw wilt genereren, run je hetzelfde script opnieuw

## Loginmodel

De gebruiker logt in met enkel zijn persoonlijke code.

Onderliggend gebruikt de frontend:

- een deterministisch auth e-mailadres op basis van die code
- dezelfde code als Supabase password

Dat is nodig om GitHub Pages te kunnen gebruiken zonder eigen backend.

## Lokaal draaien

```bash
npm install
npm run dev
```

## GitHub Pages deploy

1. Push naar `main`.
2. Zorg dat de GitHub Actions repo variables ingevuld zijn.
3. In GitHub:
   `Settings` > `Pages` > `Source` = `GitHub Actions`
4. De workflow in [.github/workflows/deploy-pages.yml](/C:/Users/Dries/Documents/VSCode/Scouts/Nieuwe%20map/Poef-User-Portal/.github/workflows/deploy-pages.yml) bouwt en publiceert automatisch de `dist` map.

## Codes opnieuw genereren

Als je voor iedereen nieuwe codes wilt uitdelen:

```bash
npm run provision:portal-auth
```

Dat script reset de login voor alle users naar nieuwe codes en overschrijft hun auth credentials.
