# GrocTrack

GrocTrack is a Next.js application for shared household grocery inventory. This
foundation includes the application toolchain, environment validation, a
tenant-isolated Supabase data model, email authentication, household membership,
and a unit-aware inventory ledger.

## Prerequisites

- Node.js 22.13 or newer
- npm
- Docker Desktop or another Docker-compatible runtime
- Supabase CLI

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start Supabase and copy its local API URL and anon key:

   ```bash
   npx supabase start
   ```

3. Copy `.env.example` to `.env.local` and replace the placeholder anon key
   with the value printed by Supabase. Keep `SUPABASE_SERVICE_ROLE_KEY`
   server-only; never expose it through a `NEXT_PUBLIC_` variable. Receipt
   extraction defaults to the deterministic `fake` adapter outside production.
   For Gemini, set `RECEIPT_EXTRACTOR=gemini`, `GEMINI_API_KEY`, and optionally
   `GEMINI_RECEIPT_MODEL`.

4. Apply the database migration:

   ```bash
   npx supabase db reset
   ```

5. In the local Supabase dashboard, keep email authentication enabled. For
   production, add the deployed `/auth/callback` URL to the allowed redirect
   URLs.

6. Start the app:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
npx supabase start
./scripts/test-inventory-upgrade.sh
npx supabase db reset
npx supabase db lint
npx supabase test db
npx --package supabase@2.117.0 -c 'bash supabase/tests/integration.sh'
./scripts/test-inventory-concurrency.sh
npx supabase stop --no-backup
```

The lower-layer integration script requires a running local Supabase stack and
Docker. It exercises the Storage/Auth APIs and two-connection foundation races.
The inventory upgrade test stages the initial migration, seeds a representative
ledger and projected balance, applies the inventory migration, and verifies data,
triggers, RPC permissions, and precision-safe views. The concurrency test uses
two database sessions to prove operation UUID replay applies one ledger row and
one balance change, then holds the item advisory lock while invalid quantities
are rejected before waiting.
The same checks run in GitHub Actions for pull requests and pushes to `main`.
The same checks run in GitHub Actions for pull requests and pushes to `main`.

The database tests exercise cross-household RLS, owner-only invitations,
email-bound invitation acceptance, profile visibility between members, exact
unit conversion, append-only inventory transactions, transactional balance
projection, idempotent manual changes, and duplicate purchase/reversal
protection. Receipt tests cover media validation, structured extraction,
reconciliation warnings, duplicate-work claims, and service-role-only
persistence.

The `receipts` storage bucket is private. Object names must begin with the
household and uploader UUIDs, for example
`<household-id>/<uploader-id>/<upload-id>.jpg`; storage policies bind both path
segments to active membership and object ownership. Receipt viewing uses
authorized, short-lived signed URLs. Email confirmation is enabled locally and
must remain required in production so invitation acceptance proves control of
the invited mailbox.
