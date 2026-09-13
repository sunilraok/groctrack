# GrocTrack

GrocTrack is a Next.js application for shared household grocery inventory. This
foundation includes the application toolchain, environment validation, and a
tenant-isolated Supabase data model. User-facing workflows are intentionally
deferred to later issues.

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
   server-only; never expose it through a `NEXT_PUBLIC_` variable.

4. Apply the database migration:

   ```bash
   npx supabase db reset
   ```

5. Start the app:

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
npx supabase db lint
npx supabase test db
```

The `receipts` storage bucket is private. Object names must begin with the
household UUID, for example
`<household-id>/<receipt-id>/original.jpg`; storage policies use that first path
segment to enforce household access. Email confirmation is enabled locally and
must remain required in production so invitation acceptance proves control of
the invited mailbox.
