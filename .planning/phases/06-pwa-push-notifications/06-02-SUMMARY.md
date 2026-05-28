---
plan: 06-02
phase: 06
title: PWA shell installable
status: complete
wave: 2
duration_min: ~30
date: 2026-05-28
---

# Plan 06-02 — PWA shell installable

> Wave 2 deliverable. PUSH-01 browser-side (instalável Chrome Android + iOS Safari 16.4+) e metade browser-side de PUSH-04 (SW recebe push e abre deep link).

## What was built

**Browser-side foundation completa para PWA:**
- `public/manifest.json` (557 bytes) — `name=CONSEJ CRM`, `display=standalone`, `start_url=/dashboard`, `theme_color=#0a0a0a`, 2 ícones com purpose `any maskable`
- `public/sw.js` (~2.4 KB) — Service Worker minimal: `push` event listener + `notificationclick` com same-origin guard (T-06-07) + smart focus-existing-tab via `postMessage`
- `public/icon-192.png` (3.2 KB) + `public/icon-512.png` (11 KB) — gerados via script Node + `sharp` a partir de `public/logo.png` (896×504 → square com bg `#0a0a0a` + 70% safe-area)
- `index.html` — `<link rel="manifest">`, `<meta name="theme-color">`, 3 tags `apple-mobile-web-app-*`, `<link rel="apple-touch-icon">`, title `CONSEJ CRM`
- `src/main.tsx` — registro do SW com feature detection (`'serviceWorker' in navigator`) no boot, catch para evitar tela branca se falhar
- `vercel.json` — 2 routes: `/sw.js` com `Cache-Control: must-revalidate` + `Service-Worker-Allowed: /`; `/manifest.json` com `max-age=3600`
- `scripts/verify-pwa-static.cjs` — validador estático one-shot (20+ checks)

## Tasks

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| 2.1 — Generate icons 192/512 | ✅ complete | `07e39c0` | Script Node + sharp@^0.34.0 (devDep). Background `#0a0a0a` + safe-area 70%. PNG válido, dims exatas. |
| 2.2 — Manifest + SW + Vercel cache | ✅ complete | `ce24a4b` | Helper agent (prior executor). All fields conform to D-10/D-11. |
| 2.3 — index.html PWA tags + main.tsx SW reg | ✅ complete | `44a3dba` | Helper agent. grep robust (Warning #8 fix), `npm run build && echo BUILD_OK` (Warning #11 fix). |
| 2.4 — UAT DevTools | 🟨 **partial** — static PASS, browser-visual deferred | `776bc58` | Static validator passes 100%. Browser-visual UAT bundled into Plan 05 Wave 4 final UAT (8 items). See Deviations. |

## Verification

`scripts/verify-pwa-static.cjs` output (20+ checks all OK):
- sw.js syntax + push/notificationclick handlers + same-origin guard
- manifest.json installability heuristic = PASS (Chrome PWA criteria)
- index.html: 6 PWA tags present
- main.tsx: feature detection + register('/sw.js')
- vercel.json: 2 routes with correct Cache-Control + Service-Worker-Allowed
- icon-192/512: valid PNG signatures, exact dimensions, < 50 KB each
- dist/ build outputs: all 4 PWA assets emitted by Vite

`npm run build` exits 0 with BUILD_OK signal. Bundle warning (>500KB chunk) pre-existed Phase 6.

## Deviations

1. **Task 2.4 split into static + browser-visual.** Browser-visual portion (Chrome DevTools Application tab → Installability badge green + SW activated badge + DevTools push simulator test) is **deferred to Plan 05 Wave 4 final UAT** because:
   - Orchestrator cannot drive a real browser
   - User attempted `npm run preview` locally but hit PowerShell ExecutionPolicy block (`npm.ps1` requires policy change OR use `npm.cmd`)
   - Plan 05 Task 5.4 already has 8-item manual UAT including PWA install + push delivery end-to-end — adding the 2-3 DevTools checks there avoids duplicate context-switches for Gabriel
   - **Static validator (`verify-pwa-static.cjs`) catches structural errors** — what's left is purely behavioral (does the browser actually activate the SW, does the install button appear) and is best validated alongside the full push-delivery UAT
   - Rationale documented per Rule 1/2 (Plan 02 UAT scope reduced; carried over to Plan 05 explicitly — no scope drop)

2. **`sharp` added as devDep.** RESEARCH §2 mentioned online tools as preferred, but the prior executor flagged anti-slop guard concerns about `npx --yes` for one-shot tools. As orchestrator I installed `sharp@^0.34.0` (reputable, 3M+ downloads/wk, used widely in Vite/Vercel pipelines anyway) and generated icons via script. This is aligned with CONTEXT D-10 ("via script Node simples (sharp lib local OU gerar manualmente e commitar)"). sharp stays as devDep — useful for future icon/asset generation.

## Files Created (key-files)

- `public/manifest.json` — PWA manifest D-10
- `public/sw.js` — SW minimal D-11
- `public/icon-192.png` + `public/icon-512.png` — derived from logo.png
- `scripts/verify-pwa-static.cjs` — static PWA validator (reusable)

## Files Modified

- `index.html` — 6 PWA meta tags added
- `src/main.tsx` — SW registration with feature detection
- `vercel.json` — 2 routes for sw.js and manifest.json
- `package.json`, `package-lock.json` — sharp@^0.34.0 devDep

## Tech Debt / Open Items

- **PWA browser-visual UAT** — deferred to Plan 05 Wave 4 final UAT (8-item manual checklist). Includes: Installability badge green, SW activated + scope /, DevTools push simulator displays notification, click navigates to deep link, title shows `CONSEJ CRM` (not `consej-crm-v2`).
- **iOS PWA install** — needs real iPhone iOS 16.4+ test (Compartilhar → Adicionar à Tela). Also in Plan 05 final UAT.
- **macOS Safari install** (File → Add to Dock) does NOT trigger `beforeinstallprompt` — known limitation accepted (RESEARCH §5).

## Wave 2 → Wave 3 handoff

Plan 06-03 (sendPush helper + notify-* integration) and Plan 06-04 (subscribe UI + matrix extension) can now proceed in parallel (Wave 3, files_modified disjoint). Both depend on Plan 02's SW + manifest being shipped (✅) and Plan 01's types + smoke-push (✅).
