# Data migration

**Goal:** data moved from the old system is complete and correct.
**Oracle:** the migration mapping document (field to field, transformations) and agreed counts.

## Checklist
- Counts per entity: source vs target, by a query or report the client provides.
- Sample records (risk-based): each mapped field, transformations, defaults, nulls.
- Edge records: oldest, newest, longest names, Arabic text, special characters, closed accounts.
- Referential links: child records point to the right parent after migration.
- Business totals: balances and sums match within the agreed rounding.

## Tools
Reports or exports the client provides; the app UI for sample checks. Never connect to a
production database; ask for extracts with masked personal data.

## Evidence
The count table and the sample sheet (masked) as evidence files.

## Not a bug
A difference the mapping document explains; data that was already wrong in the source (report as a data-quality finding).
