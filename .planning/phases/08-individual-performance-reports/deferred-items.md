# Deferred Items — Phase 8

Items detected during execution that are out of scope for Phase 8 (Rule:
SCOPE BOUNDARY of execute-plan workflow).

## Pre-existing test failures (not caused by Phase 8 changes)

**Detected during:** Plan 08-01 Task 4 verification (`npx vitest run`)

**Tests failing:** 10 tests across 3 files under
`supabase/functions/notify-tarefa/__tests__/`:

- `parallel.test.ts` (5 falhas)
- `self-loop.test.ts` (2 falhas)
- A 3a file in the same dir

**Root cause:** `Error: Only URLs with a scheme in: file and data are supported by the default ESM loader. Received protocol 'https:'`

These tests target Supabase Edge Functions (Deno runtime) which use
`import { ... } from 'https://deno.land/std@0.224.0/...'`. When vitest
(Node runtime) tries to load them, the Node ESM loader rejects HTTPS
imports.

**Why deferred:**

1. Pre-existing — failures are present on `main` BEFORE Plan 08-01 changes
   (confirmed by isolated re-run on the same commit).
2. Phase 8 does not touch `supabase/functions/notify-tarefa/` nor any
   Deno code.
3. Fix likely requires either:
   - excluding `supabase/functions/**` from the default vitest config
     (similar to how the project already separates `tests/rls/` via
     `test:rls` script), or
   - adding a separate vitest project for Deno-targeting code, or
   - using `vitest-environment-deno` / equivalent.

**Recommended owner:** Phase that introduces work on notifications stack
(or a dedicated test-infra cleanup task — not Phase 8).

## Phase 8 test isolation result

Phase 8 tests run green in isolation:

```
npx vitest run src/lib/__tests__/desempenho.test.ts \
              src/lib/__tests__/slug.test.ts \
              src/lib/__tests__/csv-export.test.ts \
              src/components/desempenho/__tests__/
```

→ 2 passed files (slug + desempenho) | 3 skipped files (stubs) | 21
passed tests | 11 skipped tests
