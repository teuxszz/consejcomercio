# CONSEJ CRM v2

## What This Is

CRM interno da CONSEJ (empresa júnior de consultoria jurídica em Natal/RN) que gerencia o ciclo completo de lead → cliente → contrato.

## Current State (v3.0 active — kickoff 2026-05-27)

**Milestone ativo:** v3.0 — Comunicação, Portal e Inteligência

Completa três frentes deferred da v2.0, mantendo a restrição de zero custo incremental:

- **Comunicação multi-canal:** Slack (existente) + e-mail (Resend free tier) + push PWA (web-push protocol). Usuário escolhe canais por tipo de notificação
- **Portal do cliente expandido:** upload de documentos pelo cliente + aprovação de propostas online
- **Inteligência operacional:** relatórios de performance individual exportáveis (PDF/CSV) + forecast com regressão linear + classificação heurística de leads

Notion explicitamente fora (CONSEJ não usa). IA generativa fora (viola zero-custo). Classificação de leads usa heurísticas determinísticas locais — sem API externa.

Detalhes: [REQUIREMENTS.md](./REQUIREMENTS.md) · [ROADMAP.md](./ROADMAP.md)

## Last Shipped (v2.0)

**v2.0 — Adoção & Crescimento** ✅ shipped 2026-05-27

Transformou o CRM em "lugar onde o trabalho acontece":
- Sistema de tarefas + sinal de adoção (`/tarefas`, `/adocao`)
- Guia de cadência D-point + WhatsApp links (`/cadencia`, Kanban com badge)
- Pull-back notifications via Slack (cron diário matinal)
- Dashboard de receita end-to-end (`/receita` com MRR/ARR/forecast/renovações)

Detalhes completos: [v2.0-ROADMAP.md](./milestones/v2.0-ROADMAP.md) · [v2.0-REQUIREMENTS.md](./milestones/v2.0-REQUIREMENTS.md)

## Future Goals (post-v3.0)

Após v3.0 shipping, candidatos para v4.0+ (todos preservando zero-custo):

- Templates de e-mail visualmente ricos (atualmente HTML simples)
- Push grouping/coalescing por janela de tempo (evitar spam)
- Comentários inline em propostas no portal (markup colaborativo)
- Comparação de relatórios entre períodos (delta % vs ano anterior)
- Classificação de leads com modelo ML real (TensorFlow.js local — exige >500 leads ganhos para train/test)
- Forecast com modelos mais sofisticados (ARIMA, Prophet — exige Python/edge)

## Who It's For

- **Consultores CONSEJ** — sabem o que fazer com cada lead hoje, sem precisar lembrar da cadência
- **Coordenadores/Diretores** — vêem receita, conversão e resultado sem pedir relatório manual
- **Gabriel (gestor)** — vê se o investimento no CRM está gerando resultado

## Context

- **Stack:** React 19 + Vite + Supabase (PostgreSQL + Auth + RLS + Edge Functions)
- **Team size:** 2–5 usuários internos
- **Deployment:** Vercel (frontend) + Supabase cloud
- **Budget constraint:** Zero custo incremental de API/hosting
- **Auth:** Email/password, perfis `interno` (consultor → coordenador → diretor) e `cliente`
- **Repo:** `consej-crm-v2/` (v2 ativo; v1 Next.js em `consej-crm/` é legado)

## Out of Scope (preserved across milestones)

- **WhatsApp Bot/API** — exige número dedicado + Meta Business API. Incompatível com zero custo
- **Integração de e-mail (inbox por lead)** — OAuth + threading + storage; ROI incerto no curto prazo
- **Multi-empresa / white-label** — CONSEJ only
- **IA para classificação automática de leads** — sem dados suficientes para treinar

---

## Archive

<details>
<summary>v2.0 — Adoção & Crescimento (shipped 2026-05-27)</summary>

Milestone que resolveu o problema "o time não usa o CRM direito". Entregou:

- 4 fases / 10 plans / 23 requirements / 66 commits / +16.389 LOC
- Phase 1: Tasks + Adoption Signal (RLS fix, TarefaModal, sidebar badge, AdocaoPage)
- Phase 2: Cadence Guide + WhatsApp Quick Actions (D-point Kanban, CadenciaInbox, wa.me)
- Phase 3: Pull-back Notifications (Slack DMs via pg_cron + edge functions)
- Phase 4: Revenue Dashboard (`/receita` com MRR/ARR/forecast/renovações)

Detalhes: [v2.0-ROADMAP.md](./milestones/v2.0-ROADMAP.md)

</details>

<details>
<summary>v1.0 — Fundação (pré-GSD)</summary>

Construído antes do GSD ser adotado neste projeto. Entregou a base operacional:
- Auth email/password + perfis interno/cliente
- Pipeline de leads com Kanban (@dnd-kit) + ICP scoring dinâmico + lixeira (soft delete)
- Módulos de clientes, contratos, diagnósticos
- Audit log global e por entidade
- Integração Slack (canais + mensagens via edge function autenticada)
- Portal de indicações + account switcher CRM ↔ Portal
- Onboarding wizard, busca global (Cmd+K), error boundary

Sem archive formal — entregas registradas no git history.

</details>

---

## Evolution

Este documento evolui a cada milestone shipped.

**Ao iniciar próximo milestone** (via `/gsd-new-milestone`):
1. Mover "Next Milestone Goals" para a seção de requirements ativos do novo
2. Atualizar "Current State" quando o próximo milestone for shipped
3. Adicionar entry colapsada na seção "Archive"

---

*Last updated: 2026-05-27 after archiving v2.0*
