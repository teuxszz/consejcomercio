# Phase 2: Cadence Guide + WhatsApp Quick Actions — Validation

**Phase:** 02-cadence-guide-whatsapp-quick-actions
**Generated from:** 02-RESEARCH.md §Validation Architecture
**Date:** 2026-05-26

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/__tests__/cadencia.test.ts` |
| Full suite command | `npx vitest run` |

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAD-01 | `getNextCadenciaPoint` retorna ponto correto com `daysUntil` | unit | `npx vitest run src/lib/__tests__/cadencia.test.ts` | ❌ Task 1 |
| CAD-01 | Badge não aparece em leads terminais | unit | `npx vitest run src/lib/__tests__/cadencia.test.ts` | ❌ Task 1 |
| CAD-01 | Badge não aparece após D10 (interação há 11+ dias) | unit | `npx vitest run src/lib/__tests__/cadencia.test.ts` | ❌ Task 1 |
| CAD-02 | `getCadenciaDueToday` sem alteração — testes existentes suficientes | unit | `npx vitest run` | N/A — função não muda |
| CAD-03 | Sugestão exibe texto correto por D-point | manual | n/a — Task 6 checkpoint |  |
| CAD-04 | Satisfeito pelo botão "Abordar" existente — sem novo código | n/a | n/a | N/A |
| WA-01 | Navegação para /mensagens com params corretos | manual | n/a — Task 6 checkpoint |  |
| WA-02 | `abordar()` inclui `telefone` no URLSearchParams | manual | `grep -c "telefone" src/pages/CadenciaPage.tsx` |  |
| WA-03 | `navigator.clipboard.writeText` chamado com URL correta | manual | Task 6 checkpoint |  |

---

## Sampling Rate

- **Por task commit:** `npx vitest run src/lib/__tests__/cadencia.test.ts`
- **Por wave merge:** `npx vitest run`
- **Phase gate:** Full suite green antes de `/gsd-verify-work`

---

## Wave Gaps (to be created by executor)

- [ ] `src/lib/__tests__/cadencia.test.ts` — testes unitários de `getNextCadenciaPoint()` (REQ CAD-01)
  - Cenários mínimos:
    - lead terminal (ganho_assessoria) → null
    - lead terminal (ganho_consultoria) → null
    - lead terminal (perdido) → null
    - lead terminal (cancelado) → null
    - sem interação, criado há 0d → `{ point: D1, daysUntil: 1 }`
    - sem interação, criado há 1d → `{ point: D1, daysUntil: 0 }`
    - sem interação, criado há 2d → null (D1 expirado)
    - interação há 3d → `{ point: D3, daysUntil: 0 }`
    - interação há 4d → `{ point: D5, daysUntil: 1 }`
    - interação há 2d → `{ point: D3, daysUntil: 1 }`
    - interação há 10d → `{ point: D10, daysUntil: 0 }`
    - interação há 11d → null (cadência encerrada após D10)
    - interação há 9d → `{ point: D10, daysUntil: 1 }`

---

## Grep Gates (post-execution verification)

```bash
grep -c "getNextCadenciaPoint" src/lib/cadencia.ts         # >= 1
grep -c "getNextCadenciaPoint" src/components/leads/LeadCard.tsx  # >= 1
grep -c "getNextCadenciaPoint" src/pages/LeadDetailPage.tsx       # >= 1
grep -c "copyWaLink\|waLinkCopied" src/pages/MensagensPage.tsx    # >= 1
grep -c "telefone" src/pages/CadenciaPage.tsx                      # >= 1
```

---

## Human Verification Checklist (Task 6)

- [ ] Badge D-point colorido no kanban com formato "D{N} · {timing}"
- [ ] Badge clicável navega para /mensagens com params corretos
- [ ] DnD não interferido pelo badge (arrastar card funciona)
- [ ] Leads terminais não exibem badge
- [ ] CadenciaPage skeleton de 3 rows durante loading
- [ ] CadenciaPage empty state com CTA para /leads
- [ ] CadenciaPage abordar() inclui &telefone= na URL
- [ ] LeadDetailPage card verde com D-point label, timing e descricao
- [ ] LeadDetailPage botão WhatsApp navega com stage correto
- [ ] MensagensPage botão "Copiar link" ao lado de "Abrir no WhatsApp"
- [ ] "Copiar link" muda para "Link copiado!" por ~2s após clique
- [ ] URL copiada começa com `https://wa.me/55...`
- [ ] Sem telefone: botão "Copiar link" não aparece
