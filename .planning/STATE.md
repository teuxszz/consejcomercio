---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: adocao-e-crescimento
current_phase: archived
current_plan: 0
status: shipped
last_updated: "2026-05-27T13:00:00.000Z"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 10
  completed_plans: 10
  percent: 100
---

# STATE — CONSEJ CRM v2 (post v2.0)

*Single source of truth for current project position. Updated at each phase transition.*

---

## Project Reference

**Last shipped milestone:** v2.0 — Adoção & Crescimento (shipped 2026-05-27)
**Core value delivered:** "Transformar o CRM de 'lugar onde deveria reportar' em 'lugar onde o trabalho acontece'"
**Stack:** React 19 + Vite + Supabase (PostgreSQL + Auth + RLS + Edge Functions) + Vercel
**Constraint:** Zero custo incremental de API/hosting

Archives: [v2.0-ROADMAP.md](./milestones/v2.0-ROADMAP.md) · [v2.0-REQUIREMENTS.md](./milestones/v2.0-REQUIREMENTS.md)

---

## Current Position

**Status:** No active milestone — v2.0 shipped, awaiting `/gsd-new-milestone` to start next cycle.

```
Progress: [████████████████████] 100% (v2.0 complete: 4/4 phases, 10/10 plans, 23/23 requirements)
```

---

## v2.0 Phase Summary (shipped)

| Phase | Name | Requirements | Status | Completed |
|-------|------|--------------|--------|-----------|
| 1 | Tasks + Adoption Signal | SEC-01/02, TASK-01..04, NOTIF-04, ADOPT-01..03 | ✅ Complete | 2026-05-27 (retroactive SUMMARY) |
| 2 | Cadence Guide + WhatsApp Quick Actions | CAD-01..04, WA-01..03 | ✅ Complete | 2026-05-26 |
| 3 | Pull-back Notifications | NOTIF-01/02/03 | ✅ Complete | 2026-05-26 |
| 4 | Revenue Dashboard | REV-01/02/03 | ✅ Complete + UAT approved | 2026-05-27 |

---

## Key Decisions (v2.0 — preserved)

| Decision | Rationale | Phase |
|----------|-----------|-------|
| SEC-01 (RLS fix) precede qualquer feature TASK em produção | Clientes do tipo `cliente` não podem ler tarefas internas | Phase 1 |
| Notificações via Slack edge functions existentes | Zero custo incremental; extensão do que já existe | Phase 3 |
| `stand_by` incluído no NOT IN do cron 034 | Leads pausados não devem ser cobrados na cadência | Phase 3 |
| DM consolidada (não por evento) com cron + edge function | Um único code path para NOTIF-02 + NOTIF-03 | Phase 3 |
| WhatsApp via wa.me links (sem API) | Meta Business API exigiria número dedicado + custo fixo | Phase 2 |
| Revenue dashboard depende de Phase 1 (adoção) | Dados incompletos tornam analytics inútil | Phase 4 |
| MRR pro-rata em `valor_total ÷ duração` | Reflete receita "como se" o contrato fosse mensal | Phase 4 |
| `valor_protegido` NÃO contribui ao MRR | Provisão de risco, não receita realizada | Phase 4 |
| Forecast: contratos sem `data_fim` não entram em saídas | Sem data_fim significa "renova automaticamente" | Phase 4 |

---

## Session Continuity

**Last action:** Milestone v2.0 arquivada em 2026-05-27. ROADMAP colapsado, REQUIREMENTS arquivada, PROJECT.md atualizado com Current State + Next Goals. Git tag `v2.0` a criar.
**Next action:** Iniciar Milestone v3.0 via `/gsd-new-milestone` quando houver decisão sobre escopo (notificações por e-mail, PWA push, integração Notion, portal do cliente expansion, etc.) — ver PROJECT.md "Next Milestone Goals".
**Open questions:** Próximo escopo a ser definido em `/gsd-new-milestone` (questioning → research → requirements → roadmap).

---

*Last updated: 2026-05-27 after archiving v2.0*
