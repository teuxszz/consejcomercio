# Phase 2: Cadence Guide + WhatsApp Quick Actions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 02-cadence-guide-whatsapp-quick-actions
**Areas discussed:** D-point calc approach, CadenciaInbox placement, Kanban D-point badge, wa.me pre-text content

---

## D-point Calculation Approach

| Option | Description | Selected |
|--------|-------------|----------|
| cadencia_iniciada_em (nova coluna) | Migration adiciona coluna na tabela leads. Botão explícito 'Iniciar Cadência'. D-point = dias desde cadencia_iniciada_em. | |
| Interações (já existe) | Usa getCadenciaDueToday() existente, zero migration. D-point = dias desde a última interação. | ✓ |
| Ambos com fallback | Preferir cadencia_iniciada_em quando definido, fallback para interações. | |

**User's choice:** Interações (já existe)
**Notes:** CAD-04 satisfeito pela primeira InteracaoLead — sem botão explícito de início.

---

## Badge visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Só quando due hoje | Badge aparece só quando getCadenciaDueToday() != null. | |
| Sempre que há cadência ativa | Badge mostra próximo D-point mesmo se não for due today. | ✓ |

**User's choice:** Sempre que há cadência ativa
**Notes:** Requer nova função getNextCadenciaPoint() em cadencia.ts.

---

## Badge format

| Option | Description | Selected |
|--------|-------------|----------|
| D-point seguinte (D3, D5...) | Só o label do próximo ponto. | |
| D-point atual + dias (D3 · 1d) | Próximo ponto + dias até ele. | ✓ |
| D-point atual + 'hoje' quando due | Destaque condicional. | |

**User's choice:** D-point atual + dias (D3 · 1d)
**Notes:** Formato "D3 · 1d" com cores por urgência (verde/amarelo/vermelho).

---

## CadenciaInbox Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Aprimorar /cadencia existente | Sem nova rota. Melhorar CadenciaPage.tsx atual. | ✓ |
| Nova aba em /cadencia | Tab 'Ação Hoje' dentro da página existente. | |
| Página separada /cadencia/hoje | Rota própria. | |

**User's choice:** Aprimorar /cadencia existente
**Notes:** Zero nova rota. A página já tem a lógica certa.

---

## Sugestão contextual (CAD-03) location

| Option | Description | Selected |
|--------|-------------|----------|
| Só na página do lead | Visível apenas no LeadDetailPage. | ✓ |
| Na cadence inbox + no lead | Linha de texto na lista /cadencia E no lead. | |
| Tooltip no badge do kanban | Hover sobre o badge. | |

**User's choice:** Só na página do lead (LeadDetailPage)

---

## Kanban Badge Visual

| Option | Description | Selected |
|--------|-------------|----------|
| Chip colorido no topo do card | Chip no canto superior direito, colorido por urgência. | ✓ |
| Tag inline no rodapé do card | Ao lado dos outros indicadores. | |
| Você decide | Deixar para o planner. | |

**User's choice:** Chip colorido no topo do card

---

## Cores do chip de urgência

| Option | Description | Selected |
|--------|-------------|----------|
| Verde / Amarelo / Vermelho | Verde = 2+ dias; Amarelo = amanhã; Vermelho = hoje/atrasado. | ✓ |
| Azul / Amber / Vermelho | Azul para neutro, evita confusão com semáforo de status. | |
| Você decide | Deixar o planner/executor escolher. | |

**User's choice:** Verde / Amarelo / Vermelho

---

## wa.me Pre-text Content

| Option | Description | Selected |
|--------|-------------|----------|
| Pré-texto simples fixo por D-point | Mapa simples D1→D10 com mensagens curtas. | |
| Blocos-mensagem renderizados (completo) | Usa templates existentes de blocos-mensagem.ts. | ✓ |
| Pré-texto simples + variáveis básicas | Texto curto com {{nome}} e {{empresa}}. | |

**User's choice:** Blocos-mensagem renderizados — via navegação para /mensagens primeiro.

---

## wa.me button placement

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-selecionar defaults por D-point | Mapeamento fixo de blocos sem intervenção. | |
| Abrir o MensagensPage primeiro | Navegar para /mensagens?leadId=xxx&stage=Dx antes do wa.me. | ✓ |
| Texto livre por D-point | Ignorar blocos, pré-textos simples. | |

**User's choice:** Abrir o MensagensPage primeiro
**Notes:** Botão wa.me e copiar link ficam NO MensagensPage após composição.

---

## Botão WhatsApp no kanban/lead

| Option | Description | Selected |
|--------|-------------|----------|
| Navega para /mensagens?leadId=xxx&stage=Dx | Shortcut para o composer, igual ao 'Abordar' do /cadencia. | ✓ |
| Abre wa.me diretamente com texto genérico | wa.me sem passar pelo composer. | |

**User's choice:** Navega para /mensagens?leadId=xxx&stage=Dx

---

## Claude's Discretion

- Layout exato da sugestão CAD-03 no LeadDetailPage (posição, texto por D-point).
- Formatação do número de telefone para wa.me.
- Estado vazio da /cadencia inbox.

## Deferred Ideas

- Notificações Slack quando lead entra no D-point → Phase 3 (NOTIF-03).
- `cadencia_iniciada_em` como coluna explícita no DB para tracking mais preciso.
- Edição de templates de mensagem por cadência dentro do CRM.
- WhatsApp Business API com número dedicado → out of scope do milestone.
