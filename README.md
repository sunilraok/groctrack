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
npm run test:receipt-upgrade
npm run test:receipt-integration
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

The database tests exercise cross-household RLS, owner-only invitations,
email-bound invitation acceptance, profile visibility between members, exact
unit conversion, append-only inventory transactions, transactional balance
projection, idempotent manual changes, and duplicate purchase/reversal
protection. Receipt tests cover media validation, structured extraction,
reconciliation warnings, duplicate-work claims, and service-role-only
persistence. Database CI also exercises a populated `002` to `003` migration
upgrade and live Storage/RLS concurrency, signed-URL, and membership-revocation
boundaries.

The `receipts` storage bucket is private. Object names must begin with the
household and uploader UUIDs, for example
`<household-id>/<uploader-id>/<upload-id>.jpg`; storage policies bind both path
segments to active membership and object ownership. Receipt viewing uses
authorized, short-lived signed URLs. Email confirmation is enabled locally and
must remain required in production so invitation acceptance proves control of
the invited mailbox.

Receipt images are fully decoded with patched `sharp`/libvips under a
25-megapixel, 12,000-pixel-edge, single-frame limit; container lengths and
trailing data are also checked. PDFs are structurally parsed with `pdf-lib`,
must end at `%%EOF`, and are limited to 50 pages and the common 10 MiB upload
bound. PDF embedded streams are not rendered server-side, avoiding unbounded
rasterization while the byte and page caps bound parser exposure. Extracted
money and quantity evidence remains validated decimal text until PostgreSQL
casts it to exact `numeric` columns.

Upload object names are deterministic for each client operation. If receipt
registration fails, the private object is retained rather than synchronously
deleted; a retry verifies ownership, size, and SHA-256 before reusing it. This
avoids deleting an object that a concurrent successful request is about to
reference. Any future orphan cleanup must be delayed and use the Storage API,
never direct `storage.objects` metadata deletion.
