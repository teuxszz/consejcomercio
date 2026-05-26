# Requirements — CONSEJ CRM v2 Milestone 2

**Project:** Adoção & Crescimento
**Date:** 2026-05-26
**Status:** Active

---

## v1 Requirements

### Security Fixes (SEC) — pré-requisito para outras features

- [ ] **SEC-01**: Tabela `tarefas` tem RLS aberta (`authenticated_all`) — usuário do tipo `cliente` consegue ler tarefas internas. Migration 033 deve adicionar policy `is_interno()` antes de qualquer feature de tarefas ir para produção.
- [ ] **SEC-02**: Adicionar coluna `notificar boolean DEFAULT true` na tabela `tarefas` para que tarefas derivadas de cadência possam optar por não disparar Slack DM automaticamente.

### Tasks (TASK) — Sistema de Tarefas

- [ ] **TASK-01**: Usuário pode criar tarefa por lead, com data de vencimento, responsável e descrição curta.
- [ ] **TASK-02**: Usuário pode criar tarefa interna do time (sem lead associado), com data e responsável.
- [ ] **TASK-03**: Usuário vê inbox de todas as tarefas atribuídas a ele, ordenadas por data de vencimento, com filtros por status (aberta / concluída).
- [ ] **TASK-04**: Usuário pode concluir, editar e excluir qualquer tarefa que criou ou que foi atribuída a ele. Coordenador+ pode gerenciar qualquer tarefa.

### Cadence (CAD) — Guia de Cadência

- [ ] **CAD-01**: Card de lead no Kanban exibe badge visual com o D-point atual da cadência (D1, D3, D5, D7, D10) calculado a partir de `cadencia_iniciada_em`.
- [ ] **CAD-02**: Existe uma vista "Ação Hoje" (CadenciaInbox) que lista apenas os leads cujo D-point cai no dia atual — o consultor abre o CRM e sabe exatamente com quem falar.
- [ ] **CAD-03**: Na página do lead e no CadenciaInbox, o sistema exibe sugestão de próxima ação contextual baseada no D-point (ex.: "D3 — envia follow-up de interesse; confirma dor principal").
- [ ] **CAD-04**: Sistema registra `cadencia_iniciada_em` no lead no momento em que o consultor marca o início da cadência (botão explícito ou criação da primeira tarefa D1).

### WhatsApp Quick Actions (WA)

- [ ] **WA-01**: Card de lead no Kanban e página do lead exibem botão WhatsApp que abre `wa.me/55{numero}?text={mensagem_encoded}` com pré-texto da cadência, sem custo de API.
- [ ] **WA-02**: O pré-texto do botão WhatsApp varia por D-point do lead (D1 = mensagem de primeiro contato, D3 = follow-up de interesse, D5 = pergunta de objeção, etc.).
- [ ] **WA-03**: Na página do lead, usuário pode copiar o link wa.me para a área de transferência com um clique (para usar em outro dispositivo).

### Notifications (NOTIF) — Notificações

- [x] **NOTIF-01**: Usuário recebe DM no Slack quando uma tarefa é atribuída a ele por outra pessoa (extensão da edge function `notify-tarefa` existente).
- [x] **NOTIF-02**: Usuário recebe DM no Slack todo dia pela manhã com resumo: "Você tem X tarefas vencendo hoje e Y leads para contato na cadência" (pg_cron daily job — migration 034).
- [x] **NOTIF-03**: Usuário recebe DM no Slack quando um lead dele chega no dia de ação da cadência (D1/D3/D5/D7/D10) — disparo automático pelo cron diário.
- [ ] **NOTIF-04**: Sidebar do CRM exibe badge numérico com a contagem de tarefas abertas atribuídas ao usuário logado (Supabase Realtime subscription montada no AppLayout).

### Adoption (ADOPT) — Visibilidade de Adoção

- [ ] **ADOPT-01**: DashboardPage exibe card de adoção com: logins únicos nos últimos 7 dias por usuário, leads criados na semana, tarefas criadas na semana. Visível para coordenador+.
- [ ] **ADOPT-02**: Página `/adocao` (gated: coordenador+) exibe histórico de atividade por usuário: último login, leads registrados no mês, tarefas criadas, leads atualizados.
- [ ] **ADOPT-03**: DashboardPage e `/adocao` listam "leads esquecidos" — leads ativos sem nenhuma atualização há 7+ dias, com link direto para o lead.

### Revenue (REV) — Dashboard de Receita *(Fase 4)*

- [ ] **REV-01**: Página `/receita` (gated: coordenador+) exibe: MRR de contratos assessoria, ARR projetado, forecast dos próximos 3 meses, renovações vencendo em 30/60/90 dias. Separação por tipo de serviço (assessoria recorrente vs consultoria pontual).
- [ ] **REV-02**: Gráfico de evolução de MRR mês a mês (últimos 6 meses) usando `recharts` e `PeriodSelector` existentes.
- [ ] **REV-03**: Lista de renovações pendentes com alerta visual para contratos vencendo em ≤ 30 dias.

---

## v2 Requirements (deferred)

- Notificações por e-mail como alternativa ao Slack (para usuários sem Slack)
- PWA / notificações push nativas no mobile
- Integração Notion (linkar atas e docs com leads/clientes)
- Portal do cliente — expansão com upload de documentos e aprovação de propostas
- Relatório de performance individual exportável (PDF/CSV)

---

## Out of Scope

- **WhatsApp Bot/API** — exige número dedicado + Meta Business API + infraestrutura. Zero custo é incompatível com WhatsApp Business API real.
- **Integração de e-mail (inbox por lead)** — complexidade alta (OAuth Gmail/Outlook, threading, storage) para ROI incerto no curto prazo.
- **Multi-empresa / white-label** — CONSEJ only; sem plano de SaaS por ora.
- **Expansão do Portal do cliente** — fora do foco de adoção interna deste milestone.
- **IA para classificação automática de leads** — sem dados suficientes para treinar; retornar após 3 meses de uso real.

---

## Traceability

| REQ-ID | Phase | Phase Name | Status |
|--------|-------|------------|--------|
| SEC-01 | Phase 1 | Tasks + Adoption Signal | Pending |
| SEC-02 | Phase 1 | Tasks + Adoption Signal | Pending |
| TASK-01 | Phase 1 | Tasks + Adoption Signal | Pending |
| TASK-02 | Phase 1 | Tasks + Adoption Signal | Pending |
| TASK-03 | Phase 1 | Tasks + Adoption Signal | Pending |
| TASK-04 | Phase 1 | Tasks + Adoption Signal | Pending |
| NOTIF-04 | Phase 1 | Tasks + Adoption Signal | Pending |
| ADOPT-01 | Phase 1 | Tasks + Adoption Signal | Pending |
| ADOPT-02 | Phase 1 | Tasks + Adoption Signal | Pending |
| ADOPT-03 | Phase 1 | Tasks + Adoption Signal | Pending |
| CAD-01 | Phase 2 | Cadence Guide + WhatsApp Quick Actions | Pending |
| CAD-02 | Phase 2 | Cadence Guide + WhatsApp Quick Actions | Pending |
| CAD-03 | Phase 2 | Cadence Guide + WhatsApp Quick Actions | Pending |
| CAD-04 | Phase 2 | Cadence Guide + WhatsApp Quick Actions | Pending |
| WA-01 | Phase 2 | Cadence Guide + WhatsApp Quick Actions | Pending |
| WA-02 | Phase 2 | Cadence Guide + WhatsApp Quick Actions | Pending |
| WA-03 | Phase 2 | Cadence Guide + WhatsApp Quick Actions | Pending |
| NOTIF-01 | Phase 3 | Pull-back Notifications | Pending |
| NOTIF-02 | Phase 3 | Pull-back Notifications | Pending |
| NOTIF-03 | Phase 3 | Pull-back Notifications | Pending |
| REV-01 | Phase 4 | Revenue Dashboard | Pending |
| REV-02 | Phase 4 | Revenue Dashboard | Pending |
| REV-03 | Phase 4 | Revenue Dashboard | Pending |

**Coverage: 23/23 requirements mapped**

---

## Definition of Done

- [ ] Todos os v1 requirements implementados e funcionando em produção (Vercel + Supabase cloud)
- [ ] RLS de tarefas fechada (SEC-01) antes de qualquer deploy de feature TASK
- [ ] Dashboard de adoção mostra sinal real de uso do time
- [ ] Consultor consegue abrir o CRM, ver o que fazer no dia e agir (WhatsApp ou tarefa) em < 2 minutos
- [ ] Zero novos custos de API/hosting adicionados
