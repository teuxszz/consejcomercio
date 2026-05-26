---
phase: 02-cadence-guide-whatsapp-quick-actions
plan: 01
subsystem: cadencia-whatsapp
tags: [cadencia, badge, whatsapp, kanban, lead-detail, mensagens]
dependency_graph:
  requires: []
  provides:
    - getNextCadenciaPoint (src/lib/cadencia.ts)
    - badge D-point colorido no LeadCard
    - sugestão contextual na LeadDetailPage
    - skeleton/empty-state na CadenciaPage
    - botão Copiar link no MensagensPage
  affects:
    - src/lib/cadencia.ts
    - src/components/leads/LeadCard.tsx
    - src/pages/CadenciaPage.tsx
    - src/pages/LeadDetailPage.tsx
    - src/pages/MensagensPage.tsx
tech_stack:
  added: []
  patterns:
    - função pura cadencia.ts para cálculo de D-point com daysUntil
    - badge chip colorido por urgência (inline style + border)
    - URLSearchParams para navegação SPA com telefone encoded
    - navigator.clipboard.writeText com try/catch
key_files:
  created:
    - src/lib/__tests__/cadencia.test.ts
  modified:
    - src/lib/cadencia.ts
    - src/components/leads/LeadCard.tsx
    - src/pages/CadenciaPage.tsx
    - src/pages/LeadDetailPage.tsx
    - src/pages/MensagensPage.tsx
decisions:
  - D-01: getNextCadenciaPoint em cadencia.ts, zero migration
  - D-03: badge sempre que cadência ativa, não só quando due today
  - D-04: formato D3 · hoje/amanhã/Nd com cores por urgência
  - D-05: empty state com CTA para /leads
  - D-06: sugestão contextual somente na LeadDetailPage
  - D-07: badge chip no canto superior direito do LeadCard
  - D-08: vermelho=hoje, amber=amanhã, verde=2+dias
  - D-09: botão WA navega para /mensagens com stage, telefone
  - D-10: Copiar link e Abrir no WA dentro do MensagensPage
  - D-11: stage deriva de CadenciaPoint.stage (ex: D1→primeiro_contato)
metrics:
  duration: "~30 min"
  completed: "2026-05-26"
  tasks_completed: 5
  tasks_total: 6
  tests_added: 14
  files_modified: 5
---

# Phase 02 Plan 01: Cadence Guide + WhatsApp Quick Actions — Summary

**One-liner:** Badge D-point colorido por urgência no kanban + sugestão contextual com botão WA + `getNextCadenciaPoint()` em cadencia.ts (14 testes unitários passando).

---

## What Was Built

### Task 1 — getNextCadenciaPoint em cadencia.ts + testes unitários

Adicionou interface `NextCadenciaResult { point: CadenciaPoint; daysUntil: number }` e função `getNextCadenciaPoint()` em `src/lib/cadencia.ts`. A função é uma variante de `getCadenciaDueToday()` que retorna o próximo ponto ativo da cadência com `daysUntil` (zero = hoje, negativo = atrasado, positivo = dias restantes). `getCadenciaDueToday()` permanece inalterada.

Suite `src/lib/__tests__/cadencia.test.ts` com 14 cenários cobrindo:
- 4 status terminais → null (ganho_assessoria, ganho_consultoria, perdido, cancelado)
- Sem interação criado há 0d → D1 daysUntil=1
- Sem interação criado há 1d → D1 daysUntil=0 (due today)
- Sem interação criado há 2d → null (D1 expirou)
- Interação há 2d → D3 daysUntil=1
- Interação há 3d → D3 daysUntil=0
- Interação há 4d → D5 daysUntil=1
- Interação há 9d → D10 daysUntil=1
- Interação há 10d → D10 daysUntil=0
- Interação há 11d → null (cadência encerrada)
- CADENCIA_DIAS sanity check

### Task 2 — Badge D-point + botão WA no LeadCard

`src/components/leads/LeadCard.tsx`:
- Substituiu `getCadenciaDueToday` por `getNextCadenciaPoint`
- Helper `cadenciaChipStyle(daysUntil)`: vermelho (≤0), amber (=1), verde (≥2)
- Badge formato "D3 · hoje" / "D3 · amanhã" / "D3 · 2d" com borda colorida
- Badge não aparece em leads terminais nem quando `isStagnant`
- `msgUrl` via `URLSearchParams` inclui `telefone` para pré-preenchimento
- Botão WA (MessageCircle verde #25D366) no footer quando `lead.telefone` truthy e não-terminal
- Todos os botões com `onPointerDown={e => e.stopPropagation()}` — DnD guard

### Task 3 — CadenciaPage melhorias

`src/pages/CadenciaPage.tsx`:
- Loading: 3 skeleton rows `h-14 animate-pulse` com `var(--alpha-bg-sm)`
- Empty state: texto "Todos os leads ativos estão dentro da janela da cadência..."
- Empty state: CTA "Ver kanban de leads" navega para `/leads`
- `abordar()`: adiciona `params.set('telefone', row.lead.telefone ?? '')` após leadId

### Task 4 — Sugestão contextual na LeadDetailPage

`src/pages/LeadDetailPage.tsx`:
- Importa `useInteracoesByLead`, `getNextCadenciaPoint`, `Send`
- Calcula `nextCadencia` por lead
- Card verde (rgba(37,211,102,0.08)) acima das tabs com: label, timing ("hoje"/"amanhã"/"em N dias"), descricao
- Helper `cadenciaTiming()` para formatação do timing
- Botão WhatsApp verde navega para `/mensagens` com todos os params (leadId, nome, empresa, stage, telefone)
- Card não aparece para leads terminais; sem botão de fechar (per UI-SPEC)

### Task 5 — Botão "Copiar link" no MensagensPage

`src/pages/MensagensPage.tsx`:
- Import `toast` from 'sonner' (não existia antes no arquivo)
- Estado `waLinkCopied` para feedback visual
- Função `copyWaLink()` com try/catch e `toast.error()` em falha de clipboard
- Botão "Copiar link" ANTES do "Abrir no WhatsApp", com guard `channel === 'whatsapp' && telefone`
- Feedback: "Link copiado!" por 2s após clicar

### Task 6 — Checkpoint: aguardando verificação visual humana

---

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 RED | `95e4df7` | feat(02-02): getNextCadenciaPoint em cadencia.ts + testes unitários (14/14 pass) |
| Task 2 | `ddc47a8` | feat(02-02): badge D-point colorido + botão WA no LeadCard (CAD-01, WA-01) |
| Task 3 | `9e15fa5` | feat(02-02): CadenciaPage — skeleton loading, empty-state descritivo e telefone em abordar() (CAD-02, WA-02) |
| Task 4 | `36f6ed8` | feat(02-02): card de sugestão contextual de cadência na LeadDetailPage (CAD-03, WA-01, D-06, D-09) |
| Task 5 | `161bada` | feat(02-02): botão 'Copiar link' wa.me no MensagensPage (WA-03, D-10) |

---

## Test Results

- **cadencia.test.ts:** 14/14 passing
- **Full suite:** 123 passed | 5 skipped | 1 todo (17 test files)
- **Regressões:** zero

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] makeDate helper usava UTC midnight — daysBetween usa local**
- **Found during:** Task 1, GREEN phase (testes falhavam por timezone offset)
- **Issue:** `makeDate` usava `setUTCHours(0,0,0,0)` mas `daysBetween()` faz truncamento por data local. Em fuso UTC-3, "1 dia atrás UTC midnight" eram 2 dias locais.
- **Fix:** Mudou para `setHours(0, 0, 0, 0)` + `setDate(d.getDate() - daysAgo)` (local midnight)
- **Files modified:** `src/lib/__tests__/cadencia.test.ts`

**2. [Rule 2 - Missing functionality] toast não importado em MensagensPage**
- **Found during:** Task 5
- **Issue:** `copyWaLink()` usa `toast.error()` mas MensagensPage não tinha import de sonner
- **Fix:** Adicionou `import { toast } from 'sonner'` ao topo do arquivo
- **Files modified:** `src/pages/MensagensPage.tsx`

---

## Known Stubs

Nenhum stub identificado — todos os dados são lidos de hooks existentes (useInteracoes, useLeads).

---

## Threat Flags

Nenhuma nova superfície de segurança além do documentado no threat model do plano:
- `telefone` via URLSearchParams: encodeURIComponent aplicado via `URLSearchParams` constructor
- `buildWhatsAppUrl()`: sanitiza com `replace(/\D/g, '')` antes de montar URL
- `navigator.clipboard.writeText()`: try/catch com toast.error em falha

---

## Requirements Satisfied

| Req ID | Status | Evidence |
|--------|--------|----------|
| CAD-01 | Done | getNextCadenciaPoint + badge colorido no LeadCard com 14 testes |
| CAD-02 | Done | Skeleton loading + empty state descritivo + CTA para /leads |
| CAD-03 | Done | Card de sugestão contextual na LeadDetailPage |
| CAD-04 | Done | Satisfeito pelo botão Abordar existente (D-02, sem migration) |
| WA-01 | Done | Botão WA no LeadCard + LeadDetailPage navegam para /mensagens com params |
| WA-02 | Done | telefone passado via URLSearchParams de LeadCard, CadenciaPage e LeadDetailPage |
| WA-03 | Done | Botão "Copiar link" no MensagensPage com guard channel+telefone |

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/lib/cadencia.ts exists | FOUND |
| src/lib/__tests__/cadencia.test.ts exists | FOUND |
| src/components/leads/LeadCard.tsx exists | FOUND |
| src/pages/CadenciaPage.tsx exists | FOUND |
| src/pages/LeadDetailPage.tsx exists | FOUND |
| src/pages/MensagensPage.tsx exists | FOUND |
| Commit 95e4df7 exists | FOUND |
| Commit ddc47a8 exists | FOUND |
| Commit 9e15fa5 exists | FOUND |
| Commit 36f6ed8 exists | FOUND |
| Commit 161bada exists | FOUND |
