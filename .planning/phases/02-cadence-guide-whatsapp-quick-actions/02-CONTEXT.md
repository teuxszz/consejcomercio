# Phase 2: Cadence Guide + WhatsApp Quick Actions - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega ao consultor visibilidade completa da cadência de contatos diretamente no CRM, sem sair para descobrir com quem falar. Inclui: badge D-point no kanban, melhoria da `/cadencia` inbox, sugestão contextual na página do lead, e ações WhatsApp via navegação para o composer de mensagens existente.

**Fora do escopo desta fase:** notificações Slack de cadência (Phase 3), WhatsApp Business API (out of scope do milestone), editor de templates de mensagem, nova tabela/migration para `cadencia_iniciada_em`.

</domain>

<decisions>
## Implementation Decisions

### D-point Calculation (CAD-01, CAD-04)
- **D-01:** Usar a função `getCadenciaDueToday()` existente em `src/lib/cadencia.ts`, baseada em `InteracaoLead` (última interação). **Zero migration necessária** — sem coluna `cadencia_iniciada_em` nesta fase.
- **D-02:** CAD-04 ("registrar início da cadência") é satisfeito pela primeira `InteracaoLead` registrada no lead — o botão "Abordar" existente em `/cadencia` é o ponto de entrada. Sem botão explícito "Iniciar Cadência".
- **D-03:** O badge D-point aparece **sempre que há cadência ativa** (não só quando `due today`). Requer nova função `getNextCadenciaPoint(lead, interacoes): { point: CadenciaPoint; daysUntil: number } | null` em `cadencia.ts`.
- **D-04:** Formato do badge: `"D3 · 1d"` (D-point + dias até o próximo). Quando `daysUntil === 0` (due today): chip vermelho. `daysUntil === 1` (amanhã): chip amarelo. `daysUntil >= 2` (futuro): chip verde.

### CadenciaInbox (CAD-02, CAD-03)
- **D-05:** Aprimorar a `CadenciaPage.tsx` existente em `/cadencia` — sem nova rota. A página já lista quem contatar hoje; o planner pode melhorar o layout e o estado vazio ("Zero leads para hoje ✓").
- **D-06:** A sugestão de ação contextual (CAD-03: "D3 — envia follow-up de interesse; confirma dor principal") aparece **somente na página do lead** (`LeadDetailPage`), não na inbox de cadência.

### Kanban D-point Badge (CAD-01)
- **D-07:** O badge D-point é um chip colorido no **topo do card do kanban** (canto superior direito do `LeadCard`), no mesmo estilo visual dos outros chips (ICP fit, badge de tarefas da Phase 1).
- **D-08:** Esquema de cores: Verde (`bg-green-*`) = 2+ dias; Amarelo/Amber (`bg-amber-*`) = 1 dia; Vermelho (`bg-red-*`) = hoje ou atrasado (`daysUntil <= 0`).

### WhatsApp Quick Actions (WA-01, WA-02, WA-03)
- **D-09:** O botão WhatsApp no `LeadCard` do kanban e na `LeadDetailPage` **navega para `/mensagens?leadId=xxx&stage=Dx`** — envia o consultor para o composer de mensagens existente com os parâmetros pré-preenchidos. O wa.me link é gerado **dentro do MensagensPage após a mensagem ser composta**.
- **D-10:** O botão "Abrir no WhatsApp" (`wa.me/55{telefone}?text={mensagem_encoded}`) e o botão "Copiar link" (WA-03) são adicionados **no MensagensPage**, depois que o consultor montou a mensagem. Não há wa.me direto sem passar pelo composer.
- **D-11:** O parâmetro `stage` para o link de navegação é derivado do D-point atual do lead: D1→`primeiro_contato`, D3/D5/D7→`followup`, D10→`followup` (encerramento). Usar o `CadenciaPoint.stage` já existente em `CADENCIA_DIAS`.

### Claude's Discretion
- Layout exato da sugestão de ação (CAD-03) na `LeadDetailPage`: formato, posição, e texto por D-point (pode usar `CADENCIA_DIAS[x].descricao`).
- Formatação do número de telefone para wa.me (remoção de caracteres não-numéricos, prefixo 55 para Brasil).
- Estado vazio da `/cadencia` inbox quando não há leads para hoje.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Cadência — Lógica existente
- `src/lib/cadencia.ts` — `CADENCIA_DIAS`, `getCadenciaDueToday()`, `daysSinceLastTouch()`. D-point calc vive aqui; `getNextCadenciaPoint()` deve ser adicionada neste arquivo.
- `src/pages/CadenciaPage.tsx` — Implementação atual da inbox `/cadencia`. Função `abordar()` já navega para `/mensagens?...`. Esta página deve ser aprimorada, não recriada.

### Mensagens — Flow existente
- `src/lib/blocos-mensagem.ts` — Sistema de blocos por categoria (Abertura, Identificação, Gancho, etc.).
- `src/lib/mensagens-rules.ts` — `getSuggestedStatus()` para avanço de pipeline após mensagem.
- `src/pages/MensagensPage.tsx` — Composer de mensagens. O botão wa.me e copiar link devem ser adicionados aqui.

### Leads — Tipos e hooks
- `src/types/index.ts` — Interface `Lead` (possui `telefone: string`; sem `cadencia_iniciada_em`), interface `InteracaoLead`.
- `src/hooks/useLeads.ts` — Hook principal de leads; padrão para queries TanStack Query.
- `src/hooks/useInteracoes.ts` — Retorna interações por lead; necessário para cálculo de D-point.

### Kanban — LeadCard existente
- `src/components/leads/LeadCard.tsx` — Componente do card no kanban. Badge D-point deve ser adicionado aqui.
- `src/lib/constants.ts` — `PIPELINE_STAGES`, `TERMINAL_STAGES`, `STAGE_COLORS`.

### Requirements
- `.planning/REQUIREMENTS.md` — CAD-01..04, WA-01..03 com critérios de aceitação detalhados.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getCadenciaDueToday(lead, interacoes)` em `src/lib/cadencia.ts`: calcula D-point de hoje. Estender com `getNextCadenciaPoint()` para retornar próximo ponto mesmo quando não é hoje.
- `CadenciaPage.tsx` função `abordar(row)`: já navega para `/mensagens?nome=&empresa=&stage=&leadId=`. Reutilizar esta lógica no kanban button e lead page button.
- `CADENCIA_DIAS` array: mapeia dia → stage → label → descricao. `CadenciaPoint.stage` já é o valor certo para o parâmetro `?stage=` do MensagensPage.
- `TarefaStatusBadge` (Phase 1): padrão visual de chip colorido por estado — seguir mesmo estilo para o badge D-point.
- `Lead.telefone: string` — campo existe, disponível para wa.me. Limpar com `.replace(/\D/g, '')` antes de montar a URL.

### Established Patterns
- Navegação com URLSearchParams: `new URLSearchParams({ nome, empresa, stage, leadId })` → `navigate('/mensagens?' + params)` — padrão já validado em CadenciaPage.
- Badge chips no LeadCard: ICP fit badge já existe. D-point badge segue a mesma estrutura (`cn()` + tailwind variants).
- TanStack Query: todos os hooks em `src/hooks/use*.ts`. Sem novo hook de cadência necessário — `useLeads()` + `useInteracoes()` são suficientes.
- `QUERY_KEYS` em `src/lib/query-keys.ts` — não adicionar nova query key para dados já disponíveis.

### Integration Points
- `LeadCard.tsx`: adicionar badge D-point + botão WhatsApp (shortcut para /mensagens).
- `LeadDetailPage.tsx`: adicionar sugestão contextual CAD-03 + botão WhatsApp de atalho.
- `CadenciaPage.tsx`: aprimorar UI (estado vazio, layout) sem mudar a lógica de dados.
- `MensagensPage.tsx`: adicionar botão "Abrir no WhatsApp" e "Copiar link" após a composição.
- `src/lib/cadencia.ts`: adicionar `getNextCadenciaPoint()` (nova função pública).

</code_context>

<specifics>
## Specific Ideas

- Badge no kanban deve ser discreto mas visível — chip pequeno no canto superior direito do `LeadCard`, não dentro do texto principal do card.
- O formato `"D3 · 1d"` usa o separador `·` (interpunct) por ser mais limpo que `/` ou `-` em espaços pequenos.
- No MensagensPage, o botão WhatsApp deve aparecer próximo ao textarea da mensagem composta, não no header — o consultor só o vê depois de ter escrito algo.
- O link wa.me segue o padrão `https://wa.me/55{numerolimpo}?text={encodeURIComponent(textoMensagem)}`.

</specifics>

<deferred>
## Deferred Ideas

- Notificações Slack quando lead entra no D-point (→ Phase 3, NOTIF-03).
- `cadencia_iniciada_em` como coluna explícita no DB para tracking mais preciso → decidido manter com interações por ora; pode ser revisado após Phase 3 com dados reais.
- Edição de templates de mensagem por cadência dentro do CRM (muito escopo, nova feature separada).
- WhatsApp Business API com número dedicado → out of scope do milestone inteiro.

</deferred>

---

*Phase: 2-cadence-guide-whatsapp-quick-actions*
*Context gathered: 2026-05-26*
