# Roadmap — CONSEJ CRM v2

## Shipped Milestones

- **v2.0 — Adoção & Crescimento** ✅ shipped 2026-05-27 — 4 phases, 10 plans, 23/23 requirements → [archive](./milestones/v2.0-ROADMAP.md)
  - Tasks + Adoption Signal, Cadence Guide + WhatsApp, Pull-back Notifications, Revenue Dashboard

---

## Active Milestone

### v3.0 — Comunicação, Portal e Inteligência

**Goal:** Completar comunicação multi-canal, expandir o portal do cliente e adicionar inteligência operacional ao CRM — todos os caminhos com zero custo incremental.

**Total de requirements v1:** 25
**Granularidade:** standard
**Modo:** mvp (vertical slice por fase)
**Cobertura:** 25/25 requirements mapeados
**Phase numbering:** continua da v2.0 (5, 6, 7, 8, 9, 10)

---

## Phases

- [ ] **Phase 5: Multi-Channel Notifications (Email)** — opt-in granular + Resend integration + histórico de envio
- [ ] **Phase 6: PWA + Push Notifications** — Service Worker + VAPID + deep links
- [ ] **Phase 7: Client Portal Expansion** — upload de documentos + aprovação de propostas
- [ ] **Phase 8: Individual Performance Reports** — métricas + export PDF/CSV
- [ ] **Phase 9: Forecast Linear Regression** — refinamento estatístico da `/receita`
- [ ] **Phase 10: Smart Lead Classification** — heurística determinística zero-custo

---

## Phase Details

### Phase 5: Multi-Channel Notifications (Email)

**Goal:** Usuário escolhe receber notificações via Slack, e-mail ou ambos. Time consultor que não usa Slack passa a receber as mesmas notificações da v2.0 por e-mail, sem perda de funcionalidade.
**Mode:** mvp
**Requirements:** EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04
**Dependencies:** Milestone v2.0 (Slack notifications precisam estar funcionais para o opt-in/out fazer sentido)
**Success Criteria:**

1. Usuário acessa `/me/preferencias` e marca/desmarca canais (Slack/Email) por tipo de notificação (tarefa, cadência, renovação, indicação).
2. Tarefa atribuída a usuário que escolheu "só email" → recebe e-mail (não Slack); usuário que escolheu "ambos" → recebe os dois; "nenhum" → não recebe.
3. Coordenador+ vê `/me/notificacoes-historico` com 30 dias de envios + status de entrega (Resend webhook), pode reenviar.
4. Limite Resend free tier (100/dia, 3k/mês) não é excedido em uso normal — gating UI mostra warning se aproximando.

**Plans:** 3/4 plans executed

Plans:
- [x] 05-01-PLAN.md — Foundation + First Email (Tarefa) — migration 035 + helpers `_shared/` + notify-tarefa refatorada + Resend MVP end-to-end (EMAIL-01 parcial, EMAIL-02, EMAIL-03 parcial)
- [x] 05-02-PLAN.md — Extend para cadência/renovação/indicação + edge function `resend-webhook` para tracking automático (EMAIL-02, EMAIL-03, EMAIL-04 backend)
- [x] 05-03-PLAN.md — UI internos: tab Notificações em MeEspacoPage + página `/me/notificacoes-historico` + reenviar + banner quota coord+ (EMAIL-01, EMAIL-04)
- [ ] 05-04-PLAN.md — Portal cliente: página `/portal/preferencias` placeholder preparando Phase 7 (EMAIL-01)

**UI hint:** sim (página de preferências + histórico)

### Phase 6: PWA + Push Notifications

**Goal:** Consultor instala o CRM como app no celular e recebe notificações push nativas para tarefas urgentes/cadência, sem precisar abrir Slack ou e-mail.
**Mode:** mvp
**Requirements:** PUSH-01, PUSH-02, PUSH-03, PUSH-04
**Dependencies:** Phase 5 (estrutura de preferências multi-canal já existe)
**Success Criteria:**

1. Em Chrome Android, usuário clica "Instalar app" do banner e o CRM aparece na home screen. Em iOS 16.4+ Safari, "Adicionar à Tela de Início" também funciona.
2. Push notifications ativadas em `/me/preferencias` — VAPID keys configuradas no Supabase Secrets, subscription persistida.
3. Tarefa atribuída → push aparece no lockscreen do celular do usuário (testado iOS + Android) **paralelo** ao Slack/email conforme preferência multi-canal da Phase 5.
4. Tocar na notificação abre o CRM direto em `/tarefas?highlight=<id>` (deep link funcional).

**Plans:** TBD
**UI hint:** sim (PWA manifest + install prompt + preferências push)

### Phase 7: Client Portal Expansion

**Goal:** Cliente acessa o portal para fazer upload de documentos solicitados pela CONSEJ e aprovar propostas online — fechando o loop pós-venda dentro do CRM sem WhatsApp/email manual.
**Mode:** mvp
**Requirements:** PORTAL-01, PORTAL-02, PORTAL-03, PORTAL-04
**Dependencies:** Phase 5 (notificações ao consultor quando cliente aprova/rejeita usam preferências multi-canal)
**Success Criteria:**

1. Cliente loga no portal → vê seus documentos com upload drag-and-drop → arquivo cai em Supabase Storage `cliente-docs/{cliente_id}/...` (RLS isola por cliente).
2. Consultor abre `/clientes/:id/docs`, faz upload de proposta com tag `proposta` → cliente vê na hora no portal.
3. Cliente clica "Aprovar" na proposta → status muda, consultor recebe notificação multi-canal (Slack+email+push conforme preferência).
4. Coordenador+ vê em `/portal-admin/aprovacoes-pendentes` quais clientes têm >5 dias sem responder uma proposta enviada — pode reenviar lembrete com 1 clique.

**Plans:** TBD
**UI hint:** sim (drag-drop, ficha cliente docs, dashboard aprovações)

### Phase 8: Individual Performance Reports

**Goal:** Consultor exporta seu próprio relatório de performance em PDF/CSV para reunião 1:1 com coordenador. Coordenador exporta relatório consolidado da equipe para reuniões mensais.
**Mode:** mvp
**Requirements:** REP-01, REP-02, REP-03, REP-04
**Dependencies:** Phase 1 (dados de adoção da v2.0 já existem) — não tem dep das Phases 5/6/7
**Success Criteria:**

1. Consultor acessa `/me/desempenho` e vê dashboards de leads/conversões/tarefas/NPS do período (PeriodSelector). Coordenador+ pode acessar qualquer `/users/:id/desempenho`.
2. Botão "Exportar PDF" baixa relatório de ~3 páginas com gráficos do recharts renderizados como imagem inline (jspdf + html2canvas ou react-pdf).
3. Botão "Exportar CSV" baixa lista bruta de leads/tarefas/contratos do período para Excel.
4. `/adocao` ganha botão "Exportar PDF equipe" gerando relatório consolidado com todos consultores ativos no período.

**Plans:** TBD
**UI hint:** sim (página de desempenho + botões export)

### Phase 9: Forecast Linear Regression

**Goal:** Gestor pode escolher entre forecast determinístico (atual) e regressão linear estatística com banda de confiança 80%, refinando a tomada de decisão de receita futura.
**Mode:** mvp
**Requirements:** ML-01, ML-02, ML-03, ML-04
**Dependencies:** Milestone v2.0 Phase 4 (`/receita` precisa existir com forecast determinístico)
**Success Criteria:**

1. Helper `calcularForecastLinear` em `src/lib/receita.ts` retorna `{ baseline, ci80Lower, ci80Upper, r2 }` para os próximos 3 meses, dado >=3 pontos de histórico.
2. Toggle "Simples / Regressão" no header da ReceitaPage troca entre modos. Preferência persistida em localStorage. Default = Simples.
3. No modo Regressão, LineChart mostra banda sombreada 80% CI ao redor da linha central da regressão (sem vazar para o histórico — Pitfall 5 mantido).
4. Testes unitários cobrem: crescimento monotônico, declínio, ruído branco, série constante, dados insuficientes (<3 pontos retorna fallback determinístico com aviso).

**Plans:** TBD
**UI hint:** sim (toggle no header + banda no chart)

### Phase 10: Smart Lead Classification

**Goal:** Consultor abre o Kanban e cada lead tem um indicador visual de prioridade (alta/média/baixa) baseado em heurísticas auditáveis combinando ICP, valor, recência, origem e interações — sem caixa-preta, sem custo de API.
**Mode:** mvp
**Requirements:** CLASS-01, CLASS-02, CLASS-03, CLASS-04, CLASS-05
**Dependencies:** Phase 5 (não estrita; mas notificações de "leads em prioridade alta esquecidos" via canal multi-canal fica disponível)
**Success Criteria:**

1. Cada lead recebe badge de prioridade no card do Kanban; tooltip on-hover mostra as 3 razões principais ("ICP 85, valor estimado R$ 50k, sem contato há 7 dias").
2. Coordenador+ ajusta pesos das heurísticas em `/configuracoes/classifier` (ICP 35%, valor 25%, recência 20%, origem 10%, interações 10% como default sane).
3. Filtro URL `/leads?prioridade=alta` funciona. Dashboard tem painel "Prioridade alta hoje" listando top 10.
4. >=20 testes unitários em `src/lib/__tests__/lead-classifier.test.ts` cobrem combinações determinísticas de heurísticas.

**Plans:** TBD
**UI hint:** sim (badge no card + tooltip + painel dashboard + página de pesos)

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 5. Multi-Channel Notifications (Email) | 3/4 | In Progress|  |
| 6. PWA + Push Notifications | 0/TBD | Not started | - |
| 7. Client Portal Expansion | 0/TBD | Not started | - |
| 8. Individual Performance Reports | 0/TBD | Not started | - |
| 9. Forecast Linear Regression | 0/TBD | Not started | - |
| 10. Smart Lead Classification | 0/TBD | Not started | - |

---

## Coverage Map

| REQ-ID | Phase |
|--------|-------|
| EMAIL-01 | Phase 5 |
| EMAIL-02 | Phase 5 |
| EMAIL-03 | Phase 5 |
| EMAIL-04 | Phase 5 |
| PUSH-01 | Phase 6 |
| PUSH-02 | Phase 6 |
| PUSH-03 | Phase 6 |
| PUSH-04 | Phase 6 |
| PORTAL-01 | Phase 7 |
| PORTAL-02 | Phase 7 |
| PORTAL-03 | Phase 7 |
| PORTAL-04 | Phase 7 |
| REP-01 | Phase 8 |
| REP-02 | Phase 8 |
| REP-03 | Phase 8 |
| REP-04 | Phase 8 |
| ML-01 | Phase 9 |
| ML-02 | Phase 9 |
| ML-03 | Phase 9 |
| ML-04 | Phase 9 |
| CLASS-01 | Phase 10 |
| CLASS-02 | Phase 10 |
| CLASS-03 | Phase 10 |
| CLASS-04 | Phase 10 |
| CLASS-05 | Phase 10 |

**Mapped: 25/25**

---

*Created: 2026-05-27 | Milestone v3.0: Comunicação, Portal e Inteligência*
