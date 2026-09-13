# GrocTrack implementation plan

## Goal

Build a responsive, installable web app that lets household members photograph or upload grocery receipts, review structured line items, map unclear merchant descriptions to canonical grocery names, and post approved purchases into a shared kitchen inventory.

Consumption and corrections are recorded as immutable inventory transactions. Compatible units are normalized so purchases and usage can be expressed differently, such as buying 1 kg of rice and consuming 250 g.

## Product scope

### Included

- Email authentication and household invitations.
- Household-scoped owner and member roles.
- Mobile camera capture and receipt file upload.
- Private receipt storage and structured extraction.
- Mandatory review before a receipt changes inventory.
- Canonical grocery names, categories, and inventory units.
- Merchant-specific aliases learned only after user confirmation.
- Exact alias reuse and fuzzy suggestions on later scans.
- Purchase, consumption, adjustment, and reversal transactions.
- Normalized mass, volume, and count units.
- Inventory history and low-stock thresholds.
- Responsive, accessible, installable PWA behavior.

### Deferred

- Expiry-date and lot tracking.
- Shopping lists and notifications.
- Nutrition analysis and recipes.
- Barcode scanning and price comparison.
- Offline writes and background synchronization.
- Multi-currency aggregation.

## Architecture

- **Application:** Next.js App Router with strict TypeScript and server-first data access.
- **Backend:** Supabase Auth, PostgreSQL, Row Level Security, and private Storage.
- **Extraction:** A provider-neutral receipt extraction interface with an initial Gemini structured-output adapter that can use a free developer tier. Provider and model remain configuration so paid or document-specific services can be evaluated later.
- **Validation:** Shared runtime schemas, decimal arithmetic, receipt-total reconciliation, editable warnings, and explicit error states.
- **Inventory:** An append-only transaction ledger with transactionally maintained balance projections.
- **Privacy:** Household-scoped database policies, private image paths, short-lived signed URLs, server-only provider credentials, and redacted logs.

## Receipt workflow

1. A household member captures or uploads a receipt.
2. The server validates and privately stores the file.
3. The configured extractor returns schema-constrained merchant, total, and line-item data.
4. Server validation records reconciliation and ambiguity warnings.
5. The review screen applies confirmed aliases and suggests candidates for unresolved lines.
6. The reviewer corrects values, selects canonical groceries, and explicitly confirms new aliases.
7. One database transaction saves aliases, purchase ledger entries, balance changes, and the posted receipt state.
8. Reposting the receipt is rejected to prevent duplicate stock.

## Grocery alias resolution

Preserve the exact receipt description permanently. Resolve a line in this order:

1. Confirmed merchant and product-code alias.
2. Confirmed normalized merchant alias.
3. PostgreSQL `pg_trgm` fuzzy candidates.
4. Optional model-generated suggestion.
5. User confirmation before a new mapping is persisted.

Aliases are scoped to both household and merchant. Changing a mapping does not rewrite prior receipt evidence or inventory history.

## Unit and inventory rules

- Canonical base units are grams for mass, milliliters for volume, and each for counts.
- Persist quantities and money as exact decimals, not JavaScript floating-point values.
- Convert only within the same unit dimension.
- Keep original quantity and unit values for audit display.
- Every balance change must have a ledger entry.
- Purchase posting and balance projection updates are atomic and idempotent.
- Negative stock is allowed only through an explicit consumption or adjustment action and is displayed clearly.

## Delivery sequence

Implementation is split into dependency-ordered GitHub issues and pull requests:

1. **#1 — Bootstrap Next.js, Supabase, and secure household data model**
2. **#5 — Add authentication and household membership workflows**
3. **#4 — Implement unit-aware inventory ledger and stock screens**
4. **#2 — Add private receipt upload and structured extraction adapters**
5. **#6 — Build receipt review, grocery alias learning, and atomic posting**
6. **#3 — Complete installable PWA UX, evaluation harness, and release checks**

Each pull request targets the branch immediately below it. This keeps each review focused while preserving a complete bottom-to-top dependency chain.

## Verification strategy

- Unit tests for unit conversion, alias normalization, extraction parsing, and receipt reconciliation.
- Database tests for Row Level Security, household boundaries, atomic posting, duplicate prevention, and ledger balances.
- Integration and end-to-end tests for sign-in, invitation acceptance, receipt upload and review, alias reuse, posting, consumption, and failure recovery.
- A labeled receipt fixture format and provider bake-off measuring line-item precision/recall, numeric accuracy, whole-receipt correctness, correction rate, and cost.

Real receipts, API credentials, and other sensitive data must never be committed.

## Operational considerations

- Free AI tiers are quota-limited and can change. Recheck model availability, quota, retention terms, and pricing before deployment.
- Bound upload sizes and supported file types, and provide clear rate-limit and quota-exhaustion messages.
- Never cache private receipt images or authenticated API responses in the service worker.
- Retain only the provider metadata and source evidence needed for audit and debugging.
