# CONSEJ CRM v2 — Milestone 2: Adoção & Crescimento

## What This Is

CRM interno da CONSEJ (empresa júnior de consultoria jurídica em Natal/RN) que gerencia o ciclo completo de lead → cliente → contrato.

O **Milestone 1** construiu a fundação: pipeline de leads, clientes, contratos, diagnósticos, ICP scoring, Slack, portal de indicações, auditoria. Tudo isso existe e funciona.

O **Milestone 2** resolve o problema real: **o time não usa o CRM direito**. Com 2-5 pessoas, o CRM existe mas é subutilizado — o time esquece de abrir e não tem clareza sobre o que fazer quando abre. Isso significa dados incompletos, leads esquecidos e liderança operando no escuro.

## Core Value

> Transformar o CRM de "lugar onde deveria reportar" em "lugar onde o trabalho acontece" — criando razões para o time abrir todo dia e valor visível quando abre.

## Who It's For

- **Consultores CONSEJ** — precisam saber o que fazer com cada lead hoje, sem precisar lembrar da cadência
- **Coordenadores/Diretores** — precisam ver receita, conversão e resultado sem pedir relatório manual
- **Gabriel (gestor)** — precisa saber se o investimento no CRM está gerando resultado

## Context

- **Stack:** React 19 + Vite + Supabase (PostgreSQL + Auth + RLS + Edge Functions)
- **Team size:** 2–5 usuários internos
- **Deployment:** Vercel (frontend) + Supabase cloud
- **Budget constraint:** Zero custo incremental de API/hosting — integrações devem usar recursos já pagos
- **Auth:** Email/password, perfis `interno` (role: consultor → coordenador → diretor) e `cliente`
- **Repo:** `consej-crm-v2/` (v2 ativo; v1 Next.js em `consej-crm/` é legado)

## Requirements

### Validated (já existe e funciona)

- ✓ Auth email/password + perfis interno/cliente — existing
- ✓ Pipeline de leads com Kanban (etapas arrastáveis com @dnd-kit) — existing
- ✓ ICP scoring dinâmico (win rate, ganhos diretos vs atribuíveis, badge ICP-fit) — existing
- ✓ Lixeira de leads (soft delete + restauração) — existing
- ✓ Gestão de clientes (detail page, histórico) — existing
- ✓ Módulo de contratos — existing
- ✓ Módulo de diagnósticos — existing
- ✓ Audit log global + por entidade — existing
- ✓ Integração Slack (canais, mensagens via edge function autenticada) — existing
- ✓ Portal de indicações + account switcher CRM ↔ Portal — existing
- ✓ Onboarding wizard — existing
- ✓ Busca global — existing
- ✓ Error boundary + validação de env vars — existing

### Active (Milestone 2 — a construir)

- [ ] Dashboard de receita — faturamento por período, contratos ativos, forecast, renovações pendentes
- [ ] Sistema de tarefas por lead — to-dos com data e responsável atrelados ao lead
- [ ] Rastreamento de cadência — CRM mostra quais leads estão no D3/D5/D7/D10 hoje
- [ ] Tarefas internas do time — tarefas não atreladas a lead (preparar proposta, revisão de contrato)
- [ ] Notificações de pull-back — alertas (email ou WhatsApp deep link) para trazer o time de volta ao CRM
- [ ] Guia de próxima ação — sugestão contextual por lead ("está no D3, manda mensagem de follow-up")
- [ ] Links rápidos de WhatsApp — `wa.me` com pré-texto da cadência, sem custo de API
- [ ] Visibilidade de adoção — dashboard simples para gestor ver quem registrou o quê e o que está faltando

### Out of Scope

- Bot WhatsApp com API (sem bot existente, exige infraestrutura de telefone/cloud — alto custo)
- Integração de e-mail (inbox por lead) — complexidade alta para ROI incerto no curto prazo
- Expansão significativa do Portal do cliente — fora do foco de adoção interna
- Multi-empresa / white-label — CONSEJ só

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WhatsApp via `wa.me` links (sem API) | Zero custo incremental; integração real exigiria número dedicado + Meta Business API | Links deep com pré-texto da cadência — suficiente para o use case atual |
| Foco em adoção antes de features | Dados incompletos tornam analytics inútil. Resolver friction primeiro | Milestone 2 prioriza pull-back, processo claro e visibilidade de resultado |
| Notificações via recursos existentes | Supabase edge functions já deployadas; usar `notify-tarefa` para alerts | Sem custo extra; extensão do que já existe |

## Success Metrics

- Consultor abre o CRM pelo menos 3x/semana (rastreável via audit log de login)
- 100% dos leads novos registrados no mesmo dia de captação
- Gestor consegue ver receita do mês atual em < 30 segundos
- Zero leads perdidos por esquecimento de follow-up em 30 dias após lançamento das tarefas

## Evolution

Este documento evolui a cada transição de fase.

**Após cada fase** (via `/gsd-transition`):
1. Requirements invalidados? → Mover para Out of Scope com razão
2. Requirements validados? → Mover para Validated com referência da fase
3. Novos requirements emergiram? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions

**Após o milestone** (via `/gsd-complete-milestone`):
1. Review completo de todas as seções
2. Core Value check — ainda é a prioridade certa?
3. Auditar Out of Scope — razões ainda válidas?

---
*Last updated: 2026-05-26 after initialization*
