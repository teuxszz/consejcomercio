# Roadmap — CONSEJ CRM v2 Milestone 2

## Overview

Milestone 2 transforma o CRM de "lugar onde deveria reportar" em "lugar onde o trabalho acontece". As 4 fases entregam em sequência: fundação segura com tarefas e visibilidade de adoção → guia de cadência e ações rápidas no WhatsApp → notificações que puxam o time de volta → dashboard de receita para o gestor. Cada fase é um slice vertical usável — o time ganha valor real ao final de cada uma.

**Total de requirements v1:** 23
**Granularidade:** standard
**Modo:** mvp (vertical slice)
**Cobertura:** 23/23 requirements mapeados

---

## Phases

- [ ] **Phase 1: Tasks + Adoption Signal** — Tarefas por lead e por time, RLS corrigida, badge de inbox e painel de adoção para o gestor
- [ ] **Phase 2: Cadence Guide + WhatsApp Quick Actions** — Vista "Ação Hoje", badge D-point no Kanban, sugestão contextual e links wa.me com pré-texto por D-point
- [ ] **Phase 3: Pull-back Notifications** — DM Slack ao atribuir tarefa, resumo diário e alerta de cadência via pg_cron
- [ ] **Phase 4: Revenue Dashboard** — Página de receita com MRR, ARR, forecast, renovações e gráfico histórico

---

## Phase Details

### Phase 1: Tasks + Adoption Signal
**Goal:** O time consegue registrar e gerenciar tarefas por lead e internas, vê seu inbox de tarefas no sidebar, e o gestor enxerga quem está usando o CRM e quais leads estão esquecidos.
**Mode:** mvp
**Requirements:** SEC-01, SEC-02, TASK-01, TASK-02, TASK-03, TASK-04, NOTIF-04, ADOPT-01, ADOPT-02, ADOPT-03
**Dependencies:** none
**Success Criteria:**
1. Consultor abre o lead, cria uma tarefa com data e responsável, e essa tarefa aparece no seu inbox ordenada por vencimento — sem precisar sair do contexto do lead.
2. Consultor cria uma tarefa interna (sem lead) para o time e ela aparece no inbox do responsável.
3. Badge numérico no sidebar mostra em tempo real quantas tarefas abertas o usuário tem; zera conforme ele conclui.
4. Coordenador acessa o painel de adoção e vê, sem pedir relatório, quais consultores logaram na última semana, quantos leads criaram e quais leads estão sem atualização há 7+ dias.
**Plans:** TBD
**UI hint:** yes

### Phase 2: Cadence Guide + WhatsApp Quick Actions
**Goal:** O consultor abre o CRM e sabe exatamente com quem falar hoje, qual mensagem enviar e dispara o contato direto no WhatsApp em menos de 2 minutos — sem sair do CRM para descobrir a cadência.
**Mode:** mvp
**Requirements:** CAD-01, CAD-02, CAD-03, CAD-04, WA-01, WA-02, WA-03
**Dependencies:** Phase 1
**Success Criteria:**
1. Kanban exibe badge D-point (D1/D3/D5/D7/D10) visível em cada card de lead com cadência ativa — consultor identifica prioridade sem abrir o lead.
2. Vista "Ação Hoje" lista apenas os leads cujo D-point cai no dia atual; consultor chega ao CRM pela manhã e vê zero ou N leads com o que fazer.
3. Na página do lead, o sistema sugere a próxima ação textual ("D3 — envia follow-up de interesse; confirma dor principal") e exibe botão WhatsApp que abre wa.me com o pré-texto correto para aquele D-point, sem custo de API.
4. Consultor pode copiar o link wa.me para área de transferência com um clique (uso em dispositivo mobile separado).
**Plans:** TBD
**UI hint:** yes

### Phase 3: Pull-back Notifications
**Goal:** O time recebe alertas no Slack que os trazem de volta ao CRM antes de esquecer um lead ou uma tarefa — sem nenhuma ação manual do gestor.
**Mode:** mvp
**Requirements:** NOTIF-01, NOTIF-02, NOTIF-03
**Dependencies:** Phase 1, Phase 2
**Success Criteria:**
1. Quando alguém atribui uma tarefa a um colega, o colega recebe DM no Slack com o nome da tarefa e link direto — sem precisar abrir o CRM para descobrir.
2. Todo dia pela manhã cada consultor recebe uma DM com "Você tem X tarefas vencendo hoje e Y leads para contato na cadência" (pg_cron diário via migration 034).
3. Quando um lead entra no dia de ação da cadência (D1/D3/D5/D7/D10), o responsável pelo lead recebe DM no Slack com o nome do lead e o D-point.
**Plans:** TBD

### Phase 4: Revenue Dashboard
**Goal:** O gestor consegue ver receita do mês atual, ARR projetado, forecast dos próximos 3 meses e renovações pendentes em menos de 30 segundos — sem pedir relatório manual a ninguém.
**Mode:** mvp
**Requirements:** REV-01, REV-02, REV-03
**Dependencies:** Phase 1, Phase 3 (team actively using CRM)
**Success Criteria:**
1. Gestor acessa `/receita` e vê MRR de contratos de assessoria recorrente, ARR projetado e forecast dos próximos 3 meses, separados por tipo de serviço — tudo calculado em tempo real sem importar planilha.
2. Gráfico de evolução de MRR mês a mês dos últimos 6 meses está visível com seletor de período — gestor consegue identificar tendência de crescimento ou queda sem planilha.
3. Lista de renovações pendentes destaca visualmente contratos vencendo em 30 dias — gestor age antes de perder o cliente.
**Plans:** TBD
**UI hint:** yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Tasks + Adoption Signal | 0/? | Not started | - |
| 2. Cadence Guide + WhatsApp Quick Actions | 0/? | Not started | - |
| 3. Pull-back Notifications | 0/? | Not started | - |
| 4. Revenue Dashboard | 0/? | Not started | - |

---

## Coverage Map

| REQ-ID | Phase |
|--------|-------|
| SEC-01 | Phase 1 |
| SEC-02 | Phase 1 |
| TASK-01 | Phase 1 |
| TASK-02 | Phase 1 |
| TASK-03 | Phase 1 |
| TASK-04 | Phase 1 |
| NOTIF-04 | Phase 1 |
| ADOPT-01 | Phase 1 |
| ADOPT-02 | Phase 1 |
| ADOPT-03 | Phase 1 |
| CAD-01 | Phase 2 |
| CAD-02 | Phase 2 |
| CAD-03 | Phase 2 |
| CAD-04 | Phase 2 |
| WA-01 | Phase 2 |
| WA-02 | Phase 2 |
| WA-03 | Phase 2 |
| NOTIF-01 | Phase 3 |
| NOTIF-02 | Phase 3 |
| NOTIF-03 | Phase 3 |
| REV-01 | Phase 4 |
| REV-02 | Phase 4 |
| REV-03 | Phase 4 |

**Mapped: 23/23**

---

*Created: 2026-05-26 | Milestone 2: Adoção & Crescimento*
