# BOBO Accounts · server source snapshot (25 Nov 2026)
The original ZIP from Gandi was used as the source of truth; this commit includes the updates for poster lookup and shared first-entry question. **These updates are not deployed to Gandi automatically.**

## Excluded from GitHub
- Actual `config.local.php` and backup copies
- `private/state.json` with account records, password hashes, sessions, favorites and rate-limit history
- All keys/secrets and runtime state

## Architecture
The `backend/htdocs` tree is the public document root of `movieaccount.curromatteo.it`. Other code lives **outside the document root**. Do not move `lib`, `bin`, `private` or the local configuration into public htdocs.

The poster enrichment in `backend/htdocs/api.php` reads `https://movie.curromatteo.it/data/poster-index.json`, stores a six-hour cache in the private data directory, and enriches the admin favorites response without disclosing the list to non-admin users.

The account pages use `backend/htdocs/gate.js`. It shares a 30-day welcome cookie with the main site; **the question is not authentication**.

## Deployment
1. Keep a verified backup of `config.local.php` and `private/state.json` on Gandi.
2. Update public files from `backend/htdocs/`, and PHP libraries from `backend/lib/`. Upload `backend/htdocs/gate.js` with its referencing HTML pages.
3. **Never** replace the live local configuration or state with a GitHub sample; never publish them.
4. Check `api.php?route=health`, log in as admin, open an existing user's favorites, and verify that photos load.
5. Automatic mail stays opt-in; schedule is Friday at 18:00 Europe/Rome, subject to the server secret being configured.

For the prior source archive, SHA-256 (code-only ZIP): `dd67c64a362890d01d106425ae6ac6fe1fbc88d0bc04c2917382e2cd9b97501b`.
