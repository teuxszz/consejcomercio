# Requirements — CONSEJ CRM v2 Milestone v3.0

**Project:** Plataforma completa de comunicação, portal e inteligência
**Date:** 2026-05-27
**Status:** Active
**Budget constraint:** Zero custo incremental (mantido da v2.0) — Notion explicitamente fora (não usado na CONSEJ)

---

## Goal

Completar três frentes que ficaram deferred na v2.0:
1. **Comunicação multi-canal** — não depender só de Slack (item #1 e #2)
2. **Portal do cliente expandido** — fechar o loop pós-venda (item #4)
3. **Inteligência operacional** — relatórios, forecast estatístico e classificação de leads (itens #5, #6, #7)

---

## v1 Requirements

### Email Notifications (EMAIL) — Comunicação multi-canal

- [ ] **EMAIL-01**: Usuário (interno e cliente) pode configurar preferência "notificar via e-mail" em `/me/preferencias` — opt-in granular por tipo de notificação (tarefa, cadência, renovação, indicação).
- [ ] **EMAIL-02**: Edge function `notify-email` envia e-mail via Resend free tier (100/dia, 3k/mês) usando template HTML simples. Subject + corpo em PT-BR. VITE_RESEND_API_KEY como Supabase Secret.
- [ ] **EMAIL-03**: Triggers existentes (notify-tarefa, notify-resumo-diario, notify-renovacao, notify-indicacao) leem `perfis.preferencias_notif` e disparam DM Slack **OU** e-mail, conforme escolha do usuário. Sem duplicação.
- [ ] **EMAIL-04**: Página `/me/notificacoes-historico` (gated tudo) mostra últimos 30 dias de e-mails enviados ao usuário com status de entrega (sent/bounced/opened — se Resend webhook configurado) e botão "Reenviar".

### Push Notifications PWA (PUSH) — Mobile-first

- [ ] **PUSH-01**: App registra Service Worker e habilita PWA install prompt (manifest.json + ícones em 192/512). Aparece como app instalável no Chrome Android e Safari iOS 16.4+.
- [ ] **PUSH-02**: Usuário pode ativar/desativar push notifications em `/me/preferencias` via Push API + VAPID keys (web-push protocol). Subscription persistida em `perfis.push_subscription` (JSON).
- [ ] **PUSH-03**: Edge function `notify-push` dispara web-push para subscriptions ativas em paralelo com Slack/Email (triplo canal — usuário escolhe quais ativos).
- [ ] **PUSH-04**: Notificação clicada abre o CRM direto no deep link relevante (ex: `/tarefas?highlight=<id>`, `/leads/<id>`).

### Portal do Cliente Expansion (PORTAL) — Pós-venda

- [ ] **PORTAL-01**: Página `/portal/documentos` lista documentos do cliente com upload via drag-and-drop. Storage em Supabase bucket `cliente-docs` (free tier 1GB). RLS: cliente só vê os seus.
- [ ] **PORTAL-02**: Interno (consultor+) faz upload de proposta/contrato/laudo na ficha do cliente (`/clientes/:id/docs`) com tag (proposta/contrato/relatorio/outro). Aparece automaticamente no portal do cliente correspondente.
- [ ] **PORTAL-03**: Cliente pode "aprovar" ou "solicitar revisão" em proposta upload pelo consultor — registra timestamp + status em tabela `cliente_doc_aprovacoes`. Notificação dispara para o consultor (Slack/email/push conforme preferência).
- [ ] **PORTAL-04**: Cliente vê histórico de aprovações + status pendente no portal. Interno vê dashboard `/portal-admin/aprovacoes-pendentes` listando todas aprovações em atraso (>5 dias).

### Relatórios Performance Individual (REP) — Métricas exportáveis

- [ ] **REP-01**: Página `/me/desempenho` (visível ao próprio usuário + coordenador+) exibe métricas individuais do consultor no período: leads criados, convertidos, perdidos, tempo médio de ciclo, win rate, ICP fit médio, tarefas concluídas, NPS médio dos clientes.
- [ ] **REP-02**: Botão "Exportar PDF" gera relatório formatado (jspdf ou react-pdf, client-side, ~150kb adicionais) com gráficos do recharts renderizados como imagem.
- [ ] **REP-03**: Botão "Exportar CSV" gera CSV bruto dos dados subjacentes (lista de leads, tarefas, contratos) para o consultor abrir no Excel/Sheets.
- [ ] **REP-04**: Coordenador+ na `/adocao` pode exportar PDF consolidado da equipe ou drill ao relatório individual de cada consultor.

### Forecast com Regressão Linear (ML) — Refinamento estatístico

- [ ] **ML-01**: Helper `calcularForecastLinear` em `src/lib/receita.ts` aplica regressão linear simples sobre 6 meses de histórico (lib `ml-regression-simple-linear` ~4KB ou implementação artesanal) — retorna baseline + intervalo de confiança 80%/95%.
- [ ] **ML-02**: ReceitaPage exibe toggle "Modo forecast" no header: "Simples" (atual, determinístico D-03) ou "Regressão linear" (novo, estatístico). Default = simples. Persistido em localStorage.
- [ ] **ML-03**: Gráfico LineChart no modo regressão mostra **banda de confiança 80%** sombreada nos 3 meses de forecast + linha central da regressão. Tooltip mostra valor central + faixa.
- [ ] **ML-04**: Testes unitários `src/lib/__tests__/receita.test.ts` cobrem `calcularForecastLinear` com fixtures determinísticas (crescimento, decrescimento, ruído, dados insuficientes <3 pontos).

### Classificação Inteligente de Leads (CLASS) — Heurística zero-custo

- [ ] **CLASS-01**: Helper puro `classificarLead(lead)` em `src/lib/lead-classifier.ts` aplica heurísticas determinísticas combinando: ICP fit (já existe), origem, segmento, valor estimado, dias-desde-contato, número de interações. Output: `{ prioridade: 'alta'|'media'|'baixa', score: 0-100, razoes: string[] }`. **Sem chamada de API externa — 100% client-side determinístico, alinhado com o pattern do DiagnosticForm existente.**
- [ ] **CLASS-02**: Pesos das heurísticas configuráveis em `configuracoes.lead_classifier_weights` (JSONB) — coordenador+ pode ajustar em `/configuracoes/classifier`. Default sane: ICP weight 35%, valor 25%, recência 20%, origem 10%, interações 10%.
- [ ] **CLASS-03**: LeadCard no Kanban exibe badge de prioridade (verde/amarelo/vermelho) + tooltip on-hover mostrando as 3 razões principais ("ICP alto + segmento prime + sem contato há 5 dias").
- [ ] **CLASS-04**: LeadsPage tem filtro `?prioridade=alta` (via URL como pattern dos outros filtros). Painel "Prioridade alta hoje" no `/dashboard` lista top 10 leads.
- [ ] **CLASS-05**: Testes `src/lib/__tests__/lead-classifier.test.ts` cobrem fixtures de leads sintéticos com expected output determinístico para cada combinação de heurísticas (≥20 tests).

---

## v2 Requirements (deferred)

- Templates de e-mail visualmente ricos (atualmente HTML simples)
- Push notifications agrupadas por janela de tempo (evitar spam)
- Cliente comentar inline em propostas (markup colaborativo)
- Comparação de relatórios entre períodos (delta % vs ano anterior)
- Forecast com modelos mais sofisticados (ARIMA, Prophet) — exige Python/edge computing
- Classificação de leads com TensorFlow.js (modelo treinado em dados reais) — exige histórico de >500 leads ganhos para train/test split confiável
- Classificação via Claude API (com prompt caching) — viola zero-custo se >100 classificações/dia

---

## Out of Scope

- **Notion integration** — CONSEJ não usa Notion (decisão do usuário, 2026-05-27)
- **Multi-empresa / white-label** — CONSEJ only (preservado de v2.0)
- **WhatsApp API / Bot** — preservado de v2.0 (Meta Business API tem custo fixo)
- **Inbox de e-mail por lead** — preservado de v2.0 (complexidade alta, ROI incerto)
- **AI generativa para escrever e-mails/mensagens** — viola zero-custo (Claude API por geração); deferred indefinidamente

---

## Traceability

| REQ-ID | Phase | Phase Name | Status |
|--------|-------|------------|--------|
| EMAIL-01 | Phase 5 | Multi-Channel Notifications (Email) | Pending |
| EMAIL-02 | Phase 5 | Multi-Channel Notifications (Email) | Pending |
| EMAIL-03 | Phase 5 | Multi-Channel Notifications (Email) | Pending |
| EMAIL-04 | Phase 5 | Multi-Channel Notifications (Email) | Pending |
| PUSH-01 | Phase 6 | PWA + Push Notifications | Pending |
| PUSH-02 | Phase 6 | PWA + Push Notifications | Pending |
| PUSH-03 | Phase 6 | PWA + Push Notifications | Pending |
| PUSH-04 | Phase 6 | PWA + Push Notifications | Pending |
| PORTAL-01 | Phase 7 | Client Portal Expansion | Pending |
| PORTAL-02 | Phase 7 | Client Portal Expansion | Pending |
| PORTAL-03 | Phase 7 | Client Portal Expansion | Pending |
| PORTAL-04 | Phase 7 | Client Portal Expansion | Pending |
| REP-01 | Phase 8 | Individual Performance Reports | Pending |
| REP-02 | Phase 8 | Individual Performance Reports | Pending |
| REP-03 | Phase 8 | Individual Performance Reports | Pending |
| REP-04 | Phase 8 | Individual Performance Reports | Pending |
| ML-01 | Phase 9 | Forecast Linear Regression | Pending |
| ML-02 | Phase 9 | Forecast Linear Regression | Pending |
| ML-03 | Phase 9 | Forecast Linear Regression | Pending |
| ML-04 | Phase 9 | Forecast Linear Regression | Pending |
| CLASS-01 | Phase 10 | Smart Lead Classification | Pending |
| CLASS-02 | Phase 10 | Smart Lead Classification | Pending |
| CLASS-03 | Phase 10 | Smart Lead Classification | Pending |
| CLASS-04 | Phase 10 | Smart Lead Classification | Pending |
| CLASS-05 | Phase 10 | Smart Lead Classification | Pending |

**Coverage: 25/25 requirements mapped**

---

## Definition of Done

- [ ] Todos os v1 requirements implementados e funcionando em produção (Vercel + Supabase cloud)
- [ ] Resend free tier configurado e dentro do limite (100 e-mails/dia em uso normal)
- [ ] PWA instalável tanto em Chrome Android quanto Safari iOS 16.4+
- [ ] Portal de documentos não excede 1GB no Supabase Storage free tier (LRU/quota se necessário)
- [ ] Heurísticas de classificação de leads são deterministicas e auditáveis (sem caixa-preta)
- [ ] Zero novos custos de API/hosting em qualquer canal
- [ ] Tag `v3.0` criada e Release publicada após shipping
