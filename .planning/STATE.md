# STATE — CONSEJ CRM v2 Milestone 2

*Single source of truth for current project position. Updated at each phase transition.*

---

## Project Reference

**Milestone:** 2 — Adoção & Crescimento
**Core value:** Transformar o CRM de "lugar onde deveria reportar" em "lugar onde o trabalho acontece"
**Stack:** React 19 + Vite + Supabase (PostgreSQL + Auth + RLS + Edge Functions) + Vercel
**Constraint:** Zero custo incremental de API/hosting

---

## Current Position

**Current phase:** 1 — Tasks + Adoption Signal
**Current plan:** None (not started)
**Phase status:** Not started
**Milestone status:** Not started

```
Progress: [░░░░░░░░░░░░░░░░░░░░] 0% (0/4 phases complete)
```

---

## Phase Summary

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 1 | Tasks + Adoption Signal | SEC-01, SEC-02, TASK-01-04, NOTIF-04, ADOPT-01-03 | Not started |
| 2 | Cadence Guide + WhatsApp Quick Actions | CAD-01-04, WA-01-03 | Not started |
| 3 | Pull-back Notifications | NOTIF-01, NOTIF-02, NOTIF-03 | Not started |
| 4 | Revenue Dashboard | REV-01, REV-02, REV-03 | Not started |

---

## Key Decisions Accumulated

| Decision | Rationale | Phase |
|----------|-----------|-------|
| SEC-01 (RLS fix) deve preceder qualquer feature TASK em produção | Clientes do tipo `cliente` não podem ler tarefas internas | Phase 1 |
| Notificações via Slack edge functions existentes | Zero custo incremental; extensão do que já existe | Phase 3 |
| WhatsApp via wa.me links (sem API) | Meta Business API exigiria numero dedicado + custo fixo | Phase 2 |
| Revenue dashboard bloqueado até time usar CRM diariamente | Dados incompletos tornam analytics inútil | Phase 4 |
| Próxima migration: 033 | Fecha RLS de tarefas + coluna `notificar`; migration 034 = pg_cron diário | Phase 1/3 |

---

## Accumulated Context

### Blockers
*(none atualmente)*

### Todos por fase

**Phase 1 (pre-start):**
- Migration 033: policy `is_interno()` em `tarefas` + coluna `notificar boolean DEFAULT true`
- Hook de tarefas já existe no codebase — Phase 1 é principalmente UI + migration

**Phase 3 (pre-start):**
- Migration 034: pg_cron daily job para resumo matinal e alertas de cadência

### Validated assumptions
- pg_cron já está ativo no Supabase cloud (verificado durante pesquisa)
- Edge function `notify-tarefa` já deployada — Phase 3 é extensão, não criação
- `recharts` e `PeriodSelector` já existem no codebase (usados no dashboard ICP)

---

## Performance Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Consultor abre CRM 3x/semana | 3x/semana | baseline desconhecido |
| Leads novos registrados no dia | 100% | baseline desconhecido |
| Gestor vê receita do mês em < 30s | < 30s | indisponível (Phase 4) |
| Leads perdidos por esquecimento | 0 em 30d após Phase 1 | baseline desconhecido |

---

## Session Continuity

**Last action:** Roadmap criado (2026-05-26)
**Next action:** `/gsd-plan-phase 1` — planejar Phase 1: Tasks + Adoption Signal
**Open questions:** nenhuma no momento

---

*Last updated: 2026-05-26 after roadmap initialization*
