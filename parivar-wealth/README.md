# Parivar Wealth

Family portfolio tracker, tax planner and (soon) FIRE calculator. Runs free:

| Piece | Free service | What it does |
|---|---|---|
| App (web + Android "install") | GitHub Pages | The website/PWA |
| Database, logins, permissions | Supabase free tier | Shared family data; permissions enforced by row-level security |
| Nightly prices + SIP auto-invest | GitHub Actions | AMFI NAVs, NSE bhavcopy closes, SIP instalments, pending orders |

## Price sources
- **Mutual funds:** AMFI `NAVAll.txt` (daily) and AMFI NAV history (back-fill). Funds are matched by AMFI scheme code.
- **Stocks / ETFs:** NSE CM bhavcopy (official end-of-day close). Falls back to Yahoo only if NSE blocks the download.

## One-time setup
1. Supabase → new project → SQL Editor → paste `supabase/schema.sql` → Run.
2. Supabase → Authentication → Providers → Email: turn **off** "Confirm email" (admin approves people inside the app instead).
3. GitHub repo → Settings → Secrets and variables → Actions:
   - Variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   - Secret: `SUPABASE_SERVICE_KEY` (service_role key — only the nightly job uses it)
4. GitHub repo → Settings → Pages → Source: **GitHub Actions**.
5. Push to `main` → the app deploys. Open it, create your account (first account = admin), then **More → Import Excel**.
6. Actions → "Nightly prices & SIPs" → Run workflow once to load today's prices.

## Develop
```
npm install
npm run dev          # http://localhost:5173/?demo=1 for demo mode
npx vitest run       # engine tests
```

## Tax rules
All rates/limits live in the `settings` table (`tax_rules`) and are editable in **More → Tax rules**. Defaults are in `src/core/rules.ts`. Review after every Budget.
