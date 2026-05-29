---
phase: 8
slug: individual-performance-reports
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework (unit) | vitest 3.2.x (existing) |
| Framework (E2E) | Playwright 1.60.x (existing) |
| Quick run | `npm test -- src/lib/__tests__/desempenho src/lib/__tests__/slug` |
| Full suite | `npm test` |
| Estimated runtime (unit) | ~25s |

---

## Sampling Rate

- After every task commit: `npm test -- <pattern>` ≤ 25s
- After every plan wave: `npm test` ≤ 60s
- Before `/gsd-verify-work`: full suite green + manual UAT (visual PDF correctness + CSV opens in Excel + light theme during capture + iOS graceful fallback)
- Max feedback latency: 25s/task

---

## Per-Task Verification Map

> Filled after PLAN.md exists. Mapping rules:
> - `unit` for pure helpers (calcularDesempenho, slugify, sanitizeCell, period range)
> - `integration` for hook + lib combo (useDesempenho if exists)
> - `manual` for PDF visual correctness, CSV opens-in-Excel, light theme force during capture
> - `migration` N/A — Phase 8 has no migration

| Task ID | Plan | Wave | Requirement | Threat Ref | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------|-------------------|--------|
| (filled after PLAN) | | | REP-01..04 | T-08-* | | | ⬜ |

---

## Wave 0 Requirements

Before any feature task runs, scaffold:

- [ ] `src/lib/__tests__/desempenho.test.ts` — stubs for 8 metric calculations with deterministic fixtures
- [ ] `src/lib/__tests__/slug.test.ts` — stubs for slug helper (accents + spaces + special chars)
- [ ] `src/lib/__tests__/csv-export.test.ts` — stubs for CSV sanitization + UTF-8 BOM + ZIP generation
- [ ] `src/components/desempenho/__tests__/DesempenhoReport.test.tsx` — stub for off-screen renderer
- [ ] `src/components/desempenho/__tests__/ExportarPDFButton.test.tsx` — stub for click → progress → blob trigger
- [ ] Mock helpers in `src/test/pdf-mocks.ts` — mock jspdf + html2canvas (jsdom doesn't render canvas)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Steps |
|----------|-------------|------------|------------|
| PDF individual — visual correctness | REP-02 | html2canvas requires real browser DOM rendering | 1. Login como consultor; 2. `/me/desempenho`; 3. Click "Exportar PDF"; 4. Spinner 2-3s; 5. Download `desempenho_<nome>_<periodo>.pdf`; 6. Abrir PDF: 3 páginas A4 com 8 KPIs + 4 charts + dados corretos + nome consultor + período |
| PDF team report — geração + ranking | REP-04 | Multi-page composition + N consultors loop | 1. Login coord+; 2. `/adocao`; 3. "Exportar PDF equipe"; 4. Modal com progress (X/N consultors); 5. Download `desempenho_equipe_<periodo>.pdf`; 6. Verificar: capa com totais + 1 página por consultor ativo + página final com ranking sorted by leads_convertidos |
| CSV export — opens in Excel PT-BR | REP-03 | UTF-8 BOM + locale-correct decoding | 1. /me/desempenho; 2. Click "Exportar CSV"; 3. Download `desempenho_<nome>_<periodo>.zip`; 4. Unzip; 5. Abrir cada CSV no Excel → acentos PT-BR aparecem corretos (não corrompidos) + datas + decimais em PT-BR |
| CSV injection mitigation | T-08-03 | OWASP CSV injection prevention | 1. Criar lead com nome contendo `=cmd|...` ou `+SUM(...)`; 2. Exportar CSV; 3. Abrir CSV no Excel; 4. Verificar célula prefixada com `'` (apóstrofo) — fórmula NÃO executa |
| Light theme forçado durante capture | D-11 | Visual verification | 1. CRM em dark mode; 2. Click Exportar PDF; 3. Brief flash de light theme (~2s); 4. Tema volta para dark após download; 5. PDF gerado em light theme (legível) |
| iOS Safari graceful fallback | Pattern 10 | iOS heap ~100MB pode crashar | 1. iPhone Safari (PWA standalone se Phase 6 instalada); 2. `/me/desempenho`; 3. Exportar PDF individual → OK; 4. Coord+ team report → mostra warn "Recomendado desktop para 10+ consultores" se aplicável |
| AdocaoPage drill → /me/desempenho/:perfilId | D-08 | Role gate + RLS | 1. Login coord+; 2. /adocao; 3. Click row de consultor X; 4. Navega para /me/desempenho/<X-perfilId>; 5. Vê dados de X; 6. Login consultor regular → tentar mesma URL → 403 ou redirect |

---

## Validation Sign-Off

- [ ] All plan tasks have automated verify OR explicit Manual-Only entry
- [ ] No 3 consecutive tasks without automation
- [ ] Wave 0 scaffolds 5 test files + pdf-mocks
- [ ] No watch-mode flags
- [ ] Manual UAT items mapped (7 above)
- [ ] `nyquist_compliant: true` after planner fills map

**Approval:** pending (will be approved after planner maps tasks)

---

## Notes for Planner

- **html2canvas mock in vitest** — `vi.mock('html2canvas', () => ({ default: vi.fn(() => Promise.resolve({ toDataURL: () => 'data:image/png;base64,FAKE' })) }))`. Same for jspdf.
- **calcularDesempenho test fixtures** — at least 4 scenarios: 0 leads/0 tarefas/0 clientes (empty), single happy path, edge case (period with no data), large dataset (50+ leads — perf check).
- **PDF generation tests** — assert that jspdf `addImage()` is called N times (1 per page), `addPage()` called between, `save()` called with correct filename. Don't assert visual.
- **CSV tests** — for each row of fixture, assert `sanitizeCell` prefixes `=`/`+`/`-`/`@` with apóstrofo. UTF-8 BOM presence at byte 0.
- **Mobile graceful fallback** — `navigator.userAgent` detection + `console.warn` or `toast.warning` — testable via UA mock.
- **Lazy import strategy** — verify Vite emits separate chunk for jspdf/html2canvas by checking dist/assets after build (not on every task).
