---
phase: 02-cadence-guide-whatsapp-quick-actions
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/cadencia.ts
  - src/lib/__tests__/cadencia.test.ts
autonomous: true
requirements:
  - CAD-01
  - CAD-02
  - CAD-03
  - CAD-04
  - WA-01
  - WA-02
  - WA-03

must_haves:
  truths:
    - "Consultor vê badge D-point colorido (verde/amber/vermelho) em todo lead com cadência ativa no kanban"
    - "Badge mostra formato 'D3 · 2d' e ao clicar navega para /mensagens com contexto pré-preenchido"
    - "Página /cadencia tem skeleton de loading, empty state descritivo e CTA para /leads"
    - "Página do lead exibe card verde com sugestão textual da cadência e botão WhatsApp"
    - "MensagensPage tem botão 'Copiar link' que copia url wa.me para clipboard"
    - "Badge nunca aparece em leads terminais nem após D10 encerrado"
  artifacts:
    - path: "src/lib/cadencia.ts"
      provides: "getNextCadenciaPoint() exportada — Next D-point com daysUntil"
      exports: ["getNextCadenciaPoint", "NextCadenciaResult"]
    - path: "src/lib/__tests__/cadencia.test.ts"
      provides: "Suite de testes unitários de getNextCadenciaPoint"
      contains: "getNextCadenciaPoint"
    - path: "src/components/leads/LeadCard.tsx"
      provides: "Badge D-point reformulado + botão WA"
    - path: "src/pages/CadenciaPage.tsx"
      provides: "Skeleton, empty state melhorado, telefone em abordar()"
    - path: "src/pages/LeadDetailPage.tsx"
      provides: "Card de sugestão contextual CAD-03 + botão WA"
    - path: "src/pages/MensagensPage.tsx"
      provides: "Botão Copiar link wa.me (WA-03)"
  key_links:
    - from: "src/components/leads/LeadCard.tsx"
      to: "src/lib/cadencia.ts"
      via: "getNextCadenciaPoint(lead, leadInteracoes)"
      pattern: "getNextCadenciaPoint"
    - from: "src/pages/LeadDetailPage.tsx"
      to: "src/lib/cadencia.ts"
      via: "getNextCadenciaPoint(lead, leadInteracoes)"
      pattern: "getNextCadenciaPoint"
    - from: "src/pages/MensagensPage.tsx"
      to: "buildWhatsAppUrl"
      via: "copyWaLink() → navigator.clipboard.writeText(buildWhatsAppUrl(telefone, effectiveBody))"
      pattern: "copyWaLink|buildWhatsAppUrl"
---

<objective>
Entregar o Cadence Guide + WhatsApp Quick Actions (Phase 2) do CONSEJ CRM v2: badge D-point colorido no kanban, sugestão contextual na página do lead, melhorias na CadenciaPage e botão "Copiar link" no MensagensPage.

Purpose: Tornar visível para cada consultor o estado atual da cadência de contatos diretamente nos cards do kanban, sem abrir o lead. E entregar atalhos de 2 cliques do kanban até o composer de WhatsApp.

Output: `getNextCadenciaPoint()` em cadencia.ts + testes unitários + badge reformulado no LeadCard + card de sugestão na LeadDetailPage + CadenciaPage com skeleton/empty-state melhorados + botão "Copiar link" no MensagensPage.

Requisitos cobertos: CAD-01, CAD-02, CAD-03, CAD-04, WA-01, WA-02, WA-03.
Decisões implementadas: D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11.
Zero migrations. Zero novos hooks de query. Zero novos pacotes npm.
</objective>

<execution_context>
@c:\Users\Gabriel\.claude\get-shit-done\workflows\execute-plan.md
@c:\Users\Gabriel\.claude\get-shit-done\templates\summary.md
</execution_context>

<context>
@c:\Users\Gabriel\OneDrive\Área de Trabalho\projeto 1\consej-crm-v2\.planning\PROJECT.md
@c:\Users\Gabriel\OneDrive\Área de Trabalho\projeto 1\consej-crm-v2\.planning\ROADMAP.md
@c:\Users\Gabriel\OneDrive\Área de Trabalho\projeto 1\consej-crm-v2\.planning\phases\02-cadence-guide-whatsapp-quick-actions\02-CONTEXT.md
@c:\Users\Gabriel\OneDrive\Área de Trabalho\projeto 1\consej-crm-v2\.planning\phases\02-cadence-guide-whatsapp-quick-actions\02-RESEARCH.md
@c:\Users\Gabriel\OneDrive\Área de Trabalho\projeto 1\consej-crm-v2\.planning\phases\02-cadence-guide-whatsapp-quick-actions\02-UI-SPEC.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Adicionar getNextCadenciaPoint em cadencia.ts + testes unitários</name>
  <files>src/lib/cadencia.ts, src/lib/__tests__/cadencia.test.ts</files>
  <behavior>
    - lead em status terminal (ganho_assessoria, perdido, cancelado) → null
    - lead sem interação, criado há 0d → { point: D1, daysUntil: 1 } (D1 é amanhã se criado hoje — dia 1 = após 1d)
    - lead sem interação, criado há 1d → { point: D1, daysUntil: 0 } (due today)
    - lead sem interação, criado há 2d → null (D1 expirou fora de tolerância)
    - lead com última interação há 3d → { point: D3, daysUntil: 0 }
    - lead com última interação há 4d → { point: D5, daysUntil: 1 }
    - lead com última interação há 2d → { point: D3, daysUntil: 1 }
    - lead com última interação há 10d → { point: D10, daysUntil: 0 }
    - lead com última interação há 11d → null (cadência encerrada após D10)
    - lead com última interação há 9d → { point: D10, daysUntil: 1 }
  </behavior>
  <action>
    Em `src/lib/cadencia.ts`, adicionar após `daysSinceLastTouch()`:

    1. Exportar nova interface `NextCadenciaResult { point: CadenciaPoint; daysUntil: number }`.

    2. Exportar função `getNextCadenciaPoint(lead, interacoesDoLead, today?)`:
       - Guard imediato: se `(TERMINAL_STAGES as readonly string[]).includes(lead.status)` → return null (per D-03).
       - `const ultima = interacoesDoLead[0]` (array já ordenado desc por enviada_em, padrão do hook).
       - Sem interações: `diasDesdeCriacao = daysBetween(new Date(lead.created_at), today)`. O D1 corresponde a "1 dia após criação", portanto `daysUntil = 1 - diasDesdeCriacao`. Se `daysUntil >= 0` retorna `{ point: CADENCIA_DIAS[0], daysUntil }`. Se `daysUntil < 0` (criado há > 1d), retorna null — D1 expirou.
       - Com interações: `diasDesdeUltima = daysBetween(new Date(ultima.enviada_em), today)`. Encontrar próximo ponto com `CADENCIA_DIAS.find(p => p.dia >= diasDesdeUltima)`. Se nenhum encontrado (diasDesdeUltima > 10) → null. Caso contrário retorna `{ point, daysUntil: point.dia - diasDesdeUltima }`.
       - `daysUntil` pode ser negativo (atrasado) — isso é intencional; a UI trata como urgência vermelha (per D-04, D-08).

    A função `getCadenciaDueToday()` existente NÃO é alterada — continua usada em CadenciaPage.

    Em `src/lib/__tests__/cadencia.test.ts`, criar suite completa:
    - Importar `{ getNextCadenciaPoint, CADENCIA_DIAS }` de `@/lib/cadencia`.
    - Helper local `makeDate(daysAgo: number): string` que subtrai dias da data atual (formato ISO).
    - Cobrir todos os 10 comportamentos listados em `<behavior>`.
    - Para leads terminais, testar os quatro status: ganho_assessoria, ganho_consultoria, perdido, cancelado (todos os valores de TERMINAL_STAGES).
    - Verificar que `daysUntil` é o valor correto (não apenas que retorna não-null).
  </action>
  <verify>
    <automated>npx vitest run src/lib/__tests__/cadencia.test.ts --reporter=verbose</automated>
  </verify>
  <done>Todos os testes da suite cadencia.test.ts passam. `getNextCadenciaPoint` é exportada de cadencia.ts. Nenhuma alteração em getCadenciaDueToday.</done>
</task>

<task type="auto">
  <name>Task 2: Badge D-point + botão WA no LeadCard (CAD-01, WA-01, D-03..D-11)</name>
  <files>src/components/leads/LeadCard.tsx</files>
  <action>
    O LeadCard já importa `getCadenciaDueToday` de `@/lib/cadencia` e já possui um badge entre as linhas 322–334. Esta task substitui esse badge e adiciona o botão WA.

    Alterações em `src/components/leads/LeadCard.tsx`:

    1. Trocar import: remover `getCadenciaDueToday`, adicionar `getNextCadenciaPoint` de `@/lib/cadencia`. Manter `type CadenciaPoint` se necessário, mas o tipo já está embutido em `NextCadenciaResult`.

    2. Remover a variável `cadenciaPoint` calculada com `getCadenciaDueToday`. Adicionar no lugar:
       ```
       const nextCadencia = getNextCadenciaPoint(lead, leadInteracoes)
       ```
       `leadInteracoes` já existe no componente (hook `useInteracoes` já montado).

    2a. Atualizar `msgUrl` para incluir `telefone` (necessário para WA-02 funcionar no MensagensPage):
       ```typescript
       const msgUrl = '/mensagens?' + new URLSearchParams({
         nome: lead.nome,
         empresa: lead.empresa ?? '',
         stage: nextCadencia?.point.stage ?? (STAGE_TO_MSG[lead.status] ?? ''),
         leadId: lead.id,
         telefone: lead.telefone ?? '',
       }).toString()
       ```
       Substituir a construção de `msgUrl` existente por esta versão (adiciona `telefone` e usa `nextCadencia?.point.stage` quando disponível).

    3. Adicionar helper local `cadenciaChipStyle(daysUntil: number)` retornando `{ background, color, borderColor }` per D-08/UI-SPEC:
       - `daysUntil <= 0`: `{ background: 'rgba(239,68,68,0.18)', color: 'var(--red-hi, #f87171)', borderColor: 'rgba(239,68,68,0.30)' }`
       - `daysUntil === 1`: `{ background: 'rgba(251,191,36,0.18)', color: 'var(--amber-hi, #fbbf24)', borderColor: 'rgba(251,191,36,0.30)' }`
       - `daysUntil >= 2`: `{ background: 'rgba(37,211,102,0.18)', color: '#4ade80', borderColor: 'rgba(37,211,102,0.30)' }`

    4. Substituir o bloco `{/* Cadência badge */}` (linhas 322–334) por:
       ```jsx
       {nextCadencia && !isStagnant && (
         <button
           title={`${nextCadencia.point.label} — ${nextCadencia.point.descricao}`}
           onPointerDown={e => e.stopPropagation()}
           onClick={e => { e.stopPropagation(); navigate(msgUrl) }}
           className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 border"
           style={cadenciaChipStyle(nextCadencia.daysUntil)}
         >
           <Send className="w-2.5 h-2.5" />
           {`D${nextCadencia.point.dia} · ${
             nextCadencia.daysUntil <= 0 ? 'hoje'
             : nextCadencia.daysUntil === 1 ? 'amanhã'
             : `${nextCadencia.daysUntil}d`
           }`}
         </button>
       )}
       ```
       Per UI-SPEC copywriting contract (D-04, D-07, D-08).

    5. Adicionar botão WhatsApp (WA-01) no footer do card, ao lado do botão "Quick message" existente (linha ~381). Só renderizar quando `lead.telefone` é truthy e lead não está em estágio terminal:
       ```jsx
       {lead.telefone && !isTerminal && (
         <button
           title="Abrir mensagem WhatsApp"
           onPointerDown={e => e.stopPropagation()}
           onClick={e => { e.stopPropagation(); navigate(msgUrl) }}
           className="p-1 rounded hover:bg-[var(--alpha-bg-sm)] transition-colors"
           style={{ color: '#25D366' }}
         >
           <MessageCircle className="w-3.5 h-3.5" />
         </button>
       )}
       ```
       `isTerminal` já pode ser derivado de `TERMINAL_STAGES.includes(lead.status)` (padrão existente no arquivo). `msgUrl` já existe no componente — usa `URLSearchParams` com `nome, empresa, leadId`. Para estes botões, o `stage` deve usar `nextCadencia?.point.stage` quando disponível, senão manter o `STAGE_TO_MSG[lead.status]` existente. Adicionar também `telefone: lead.telefone ?? ''` (encodeURIComponent já é tratado pelo URLSearchParams).

    6. `MessageCircle` já está nos imports do arquivo (linha 11 — `import { Calendar, MessageCircle, Clock, UserRoundPlus, Check, Send, Target } from 'lucide-react'`). Nenhum novo import de ícone necessário.

    CRITICAL: Todo botão dentro do LeadCard DEVE ter `onPointerDown={e => e.stopPropagation()}` antes de qualquer `onClick` — DnD guard obrigatório per RESEARCH.md Pitfall 1.
  </action>
  <verify>
    <automated>npx vitest run --reporter=verbose 2>&1 | tail -20</automated>
  </verify>
  <done>LeadCard renderiza badge D-point colorido para leads com cadência ativa (D-03/D-04). Badge não aparece para leads terminais. Badge usa formato "D3 · 2d" / "D3 · amanhã" / "D3 · hoje" (D-04). Botão WA aparece quando lead.telefone existe e não é terminal (WA-01). Nenhum teste existente foi quebrado.</done>
</task>

<task type="auto">
  <name>Task 3: CadenciaPage — skeleton, empty-state e telefone em abordar() (CAD-02, WA-02)</name>
  <files>src/pages/CadenciaPage.tsx</files>
  <action>
    Aprimorar `src/pages/CadenciaPage.tsx` sem alterar nenhuma lógica de dados (getCadenciaDueToday permanece idêntico, filtros e grouping não mudam).

    1. Loading state (linhas 142–149): Substituir o Card com texto "Carregando cadência..." por três skeleton rows:
       ```jsx
       {isLoading && (
         <div className="space-y-2">
           {[0,1,2].map(i => (
             <div
               key={i}
               className="h-14 rounded-lg animate-pulse"
               style={{ background: 'var(--alpha-bg-sm)' }}
             />
           ))}
         </div>
       )}
       ```
       Per UI-SPEC seção CadenciaPage Enhancements (CAD-02).

    2. Empty state (linhas 151–164): Manter o ícone e título existentes ("Nenhum lead devido hoje"). Substituir o texto do parágrafo por: "Todos os leads ativos estão dentro da janela da cadência. Volte amanhã ou use o kanban para ver os próximos D-points."
       Adicionar CTA abaixo:
       ```jsx
       <button
         onClick={() => navigate('/leads')}
         className="mt-3 text-xs hover:underline"
         style={{ color: '#0089ac' }}
       >
         Ver kanban de leads
       </button>
       ```
       Per UI-SPEC copywriting contract e D-05.

    3. Função `abordar()` (linhas 71–79): Adicionar `telefone` aos params:
       ```typescript
       params.set('telefone', row.lead.telefone ?? '')
       ```
       Inserir após a linha `leadId: row.lead.id`. Este é o único change de lógica — garante que MensagensPage receba o número para gerar wa.me (per D-09, D-10, WA-02).

    4. Não alterar: lógica de filtros, agrupamento por dia, botões "Abordar", header, CADENCIA_DIAS lookup, ou qualquer query hook.
  </action>
  <verify>
    <automated>npx vitest run --reporter=verbose 2>&1 | tail -10</automated>
  </verify>
  <done>CadenciaPage exibe skeleton de 3 rows durante loading. Empty state tem texto descritivo e link "Ver kanban de leads". Função abordar() inclui telefone no URLSearchParams (CAD-02, WA-02 per D-05).</done>
</task>

<task type="auto">
  <name>Task 4: Sugestão contextual + botão WA na LeadDetailPage (CAD-03, WA-01, D-06, D-09)</name>
  <files>src/pages/LeadDetailPage.tsx</files>
  <action>
    Adicionar o card de sugestão contextual de cadência na `LeadDetailPage` (per D-06: somente nesta página).

    1. Adicionar imports no topo do arquivo:
       ```typescript
       import { getNextCadenciaPoint } from '@/lib/cadencia'
       import { useInteracoesByLead } from '@/hooks/useInteracoes'
       import { Send } from 'lucide-react'
       ```
       `Send` pode já não estar importado — verificar e adicionar apenas se ausente.

    2. Dentro do componente `LeadDetailPage`, após `const lead = leads?.find(l => l.id === id)`, adicionar:
       ```typescript
       const { data: leadInteracoes = [] } = useInteracoesByLead(id)
       const nextCadencia = getNextCadenciaPoint(lead ?? { id: '', status: '', created_at: '' }, leadInteracoes)
       ```
       Usar guard `lead ?` na renderização (lead já tem guard de `if (!lead) return ...` na linha 40).

    3. Adicionar helper local de timing string:
       ```typescript
       function cadenciaTiming(daysUntil: number): string {
         if (daysUntil === 0) return 'hoje'
         if (daysUntil === 1) return 'amanhã'
         if (daysUntil > 1) return `em ${daysUntil} dias`
         return `${Math.abs(daysUntil)}d atrasado`
       }
       ```

    4. Inserir o card de sugestão imediatamente antes de `<Tabs defaultValue="info">` (linha ~87):
       ```jsx
       {nextCadencia && (
         <div
           className="flex items-start gap-3 p-4 rounded-xl mb-4"
           style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.20)' }}
         >
           <Send className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
           <div className="flex-1 min-w-0">
             <p className="text-xs font-semibold" style={{ color: '#4ade80' }}>
               {nextCadencia.point.label} da cadência — {cadenciaTiming(nextCadencia.daysUntil)}
             </p>
             <p className="text-sm text-foreground mt-0.5">{nextCadencia.point.descricao}</p>
           </div>
           <button
             title={`Abrir mensagem WhatsApp para ${lead.nome}`}
             onClick={() => {
               const params = new URLSearchParams({
                 leadId: lead.id,
                 nome: lead.nome,
                 empresa: lead.empresa ?? '',
                 stage: nextCadencia.point.stage,
                 telefone: lead.telefone ?? '',
               })
               navigate(`/mensagens?${params.toString()}`)
             }}
             className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white"
             style={{ backgroundColor: '#25D366' }}
           >
             <Send className="w-3.5 h-3.5" />
             WhatsApp
           </button>
         </div>
       )}
       ```
       Per UI-SPEC seção 4 e Pattern 3 do RESEARCH.md. Copywriting per UI-SPEC tabela.

    5. `useNavigate` já está importado (linha 1 do arquivo). `Lead` type já importado. Sem DnD guard necessário (LeadDetailPage não tem drag-and-drop).

    O card não é dismissable (per UI-SPEC Interaction Contracts). Sem close button.
  </action>
  <verify>
    <automated>npx vitest run --reporter=verbose 2>&1 | tail -10</automated>
  </verify>
  <done>LeadDetailPage exibe card verde com label do D-point, timing e descricao quando getNextCadenciaPoint retorna não-null (CAD-03). Botão WhatsApp navega para /mensagens com leadId, nome, empresa, stage e telefone (WA-01, D-06, D-09). Card não aparece para leads terminais (guard via getNextCadenciaPoint). Nenhum teste existente quebrado.</done>
</task>

<task type="auto">
  <name>Task 5: Botão "Copiar link" wa.me no MensagensPage (WA-03)</name>
  <files>src/pages/MensagensPage.tsx</files>
  <action>
    Adicionar o botão "Copiar link" ao lado do botão "Abrir no WhatsApp" existente em MensagensPage (per D-10, WA-03).

    1. Adicionar estado no componente (próximo aos outros estados de UI, ao lado de `copied`):
       ```typescript
       const [waLinkCopied, setWaLinkCopied] = useState(false)
       ```

    2. Adicionar função `copyWaLink`:
       ```typescript
       async function copyWaLink() {
         try {
           const url = buildWhatsAppUrl(telefone, effectiveBody)
           await navigator.clipboard.writeText(url)
           setWaLinkCopied(true)
           setTimeout(() => setWaLinkCopied(false), 2000)
         } catch {
           toast.error('Não foi possível copiar o link. Copie manualmente o endereço.')
         }
       }
       ```
       `buildWhatsAppUrl` e `effectiveBody` já existem no escopo do componente. `toast` já está importado via `sonner`. Per RESEARCH.md security note sobre clipboard API + UI-SPEC clipboard error handling.

    3. Localizar o bloco do botão "Abrir no WhatsApp" (linhas ~1092–1102):
       ```jsx
       {channel === 'whatsapp' && telefone && (
         <button type="button" onClick={openWhatsAppConfirm} ...>
           Abrir no WhatsApp
         </button>
       )}
       ```
       Envolver ambos (botão existente + novo) em um `<div className="flex items-center gap-2">`. Adicionar o novo botão ANTES do "Abrir no WhatsApp":
       ```jsx
       <div className="flex items-center gap-2">
         {channel === 'whatsapp' && telefone && (
           <button
             type="button"
             onClick={copyWaLink}
             className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border transition-colors"
             style={waLinkCopied
               ? { background: 'rgba(37,211,102,0.15)', color: '#4ade80', borderColor: 'rgba(37,211,102,0.40)' }
               : { background: 'var(--alpha-bg-xs)', color: 'var(--text-soft-a)', borderColor: 'var(--alpha-border)' }
             }
             title="Copiar link wa.me para usar em outro dispositivo"
           >
             {waLinkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
             {waLinkCopied ? 'Link copiado!' : 'Copiar link'}
           </button>
         )}
         {channel === 'whatsapp' && telefone && (
           <button type="button" onClick={openWhatsAppConfirm} ...>
             {/* botão existente — não alterar */}
           </button>
         )}
       </div>
       ```
       Per UI-SPEC seção 6 e copywriting contract.

    4. `Copy` e `Check` já estão importados de lucide-react (verificar — se `Copy` não estiver, adicionar ao import existente). O guard `channel === 'whatsapp' && telefone` é idêntico ao botão "Abrir no WhatsApp" existente (per RESEARCH.md Pitfall 5).

    5. Sem toast de sucesso — o estado visual do botão é feedback suficiente. Toast apenas em caso de erro (per UI-SPEC copywriting contract).
  </action>
  <verify>
    <automated>npx vitest run --reporter=verbose 2>&1 | tail -10</automated>
  </verify>
  <done>MensagensPage exibe botão "Copiar link" ao lado do "Abrir no WhatsApp" quando channel=whatsapp e telefone preenchido (WA-03). Botão exibe "Link copiado!" por 2s após clicar. Guard idêntico ao botão WA existente — não aparece sem telefone. Try/catch com toast.error em falha de clipboard. Nenhum teste existente quebrado.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 6: Verificação visual — badge, sugestão contextual e botão copiar link</name>
  <what-built>
    - Badge D-point colorido (verde/amber/vermelho) nos cards do kanban, clicável, com formato "D3 · 2d"
    - CadenciaPage com skeleton de loading e empty state descritivo com CTA para /leads
    - Card de sugestão contextual verde na LeadDetailPage com botão WhatsApp
    - Botão "Copiar link" no MensagensPage ao lado do "Abrir no WhatsApp"
  </what-built>
  <how-to-verify>
    1. Abrir o app em http://localhost:5173 (ou `npm run dev` se não estiver rodando).

    2. Kanban (/leads):
       - Encontrar um lead não-terminal com pelo menos uma interação registrada.
       - Confirmar que o card exibe badge colorido "D{N} · {timing}" no canto superior direito.
       - Confirmar que clicar no badge navega para /mensagens com os params corretos na URL (leadId, nome, empresa, stage, telefone).
       - Confirmar que arrastar o card ainda funciona (badge não interfere com DnD).
       - Confirmar que leads terminais (ganho/perdido/cancelado) NÃO exibem o badge.

    3. CadenciaPage (/cadencia):
       - Se houver leads devidos hoje: confirmar que os rows existem e "Abordar" navega para /mensagens incluindo &telefone= na URL.
       - Recarregar a página enquanto os dados carregam: confirmar skeleton de 3 rows animados (pode precisar de network throttle no DevTools).
       - Se não houver leads devidos: confirmar empty state com texto "Todos os leads ativos estão dentro da janela da cadência..." e link "Ver kanban de leads".

    4. LeadDetailPage (/leads/:id):
       - Abrir um lead ativo (não-terminal) com ao menos uma interação.
       - Confirmar card verde acima das tabs com: label do D-point ("Dia X da cadência — hoje/amanhã/em N dias"), texto de descricao, e botão WhatsApp verde.
       - Clicar no botão WhatsApp: confirmar navegação para /mensagens com params corretos.
       - Abrir um lead terminal (ganho/perdido): confirmar que o card NÃO aparece.

    5. MensagensPage (/mensagens):
       - Navegar para /mensagens com um leadId e stage via URL (ou direto pela CadenciaPage).
       - Preencher o campo Telefone com um número válido.
       - Selecionar canal WhatsApp.
       - Compor uma mensagem (selecionar alguns blocos).
       - Confirmar que aparece botão "Copiar link" ao lado de "Abrir no WhatsApp".
       - Clicar "Copiar link": confirmar que o botão muda para "Link copiado!" por ~2s.
       - Colar em qualquer texto editor: confirmar que começa com "https://wa.me/55..." com o número correto.
       - Sem número preenchido: confirmar que o botão "Copiar link" NÃO aparece.
  </how-to-verify>
  <resume-signal>Digite "aprovado" se tudo passou, ou descreva os problemas encontrados para correção.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| URL params → MensagensPage | `telefone`, `nome`, `empresa`, `stage`, `leadId` chegam via URLSearchParams de navegação interna; nenhum dado externo não-autenticado |
| MensagensPage → wa.me | `buildWhatsAppUrl()` constrói URL externa com número e mensagem composta |
| MensagensPage → clipboard | `navigator.clipboard.writeText()` escreve URL wa.me no clipboard do usuário |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Tampering | `telefone` via URL param → wa.me URL | mitigate | `buildWhatsAppUrl()` já sanitiza com `replace(/\D/g, '')` antes de montar URL; `encodeURIComponent` ao construir URLSearchParams no caller |
| T-02-02 | Spoofing | wa.me link com conteúdo de mensagem (lead.nome/empresa em template) | accept | Texto é gerado pelo sistema a partir de templates CADENCIA_DIAS; não é input livre do usuário neste fluxo; encodeURIComponent aplicado |
| T-02-03 | Availability | `navigator.clipboard.writeText()` falha em contexto HTTP não-seguro | mitigate | `try/catch` em `copyWaLink()` com `toast.error(...)` — usuário notificado; app serve em HTTPS via Vercel em produção |
| T-02-04 | Information Disclosure | Dados do lead (nome, empresa, telefone) em URL de navegação interna | accept | Navegação é interna SPA (React Router) entre rotas autenticadas; URL não é compartilhada externamente; RLS existente controla dados na origem |
| T-02-SC | Tampering | npm installs | accept | Nenhum pacote novo instalado nesta fase — sem risco de supply chain |
</threat_model>

<verification>
Suite completa verde antes de marcar a fase como concluída:

```bash
npx vitest run
```

Verificações específicas da fase:
- `npx vitest run src/lib/__tests__/cadencia.test.ts` — 10+ cenários de getNextCadenciaPoint
- `npx vitest run` — full suite sem regressões

Grep gates de cobertura (após implementação):
- `grep -c "getNextCadenciaPoint" src/lib/cadencia.ts` deve retornar >= 1
- `grep -c "getNextCadenciaPoint" src/components/leads/LeadCard.tsx` deve retornar >= 1
- `grep -c "getNextCadenciaPoint" src/pages/LeadDetailPage.tsx` deve retornar >= 1
- `grep -c "copyWaLink\|waLinkCopied" src/pages/MensagensPage.tsx` deve retornar >= 1
- `grep -c "telefone" src/pages/CadenciaPage.tsx` deve retornar >= 1 (linha do params.set)
</verification>

<success_criteria>
- [ ] `getNextCadenciaPoint()` exportada de `src/lib/cadencia.ts` com interface `NextCadenciaResult` (D-03)
- [ ] Suite `src/lib/__tests__/cadencia.test.ts` cobre 10 cenários, todos passando (CAD-01)
- [ ] LeadCard exibe badge colorido "D{N} · {timing}" usando `getNextCadenciaPoint` (CAD-01, D-03, D-04, D-07, D-08)
- [ ] Badge não aparece em leads terminais nem após D10 encerrado (D-03)
- [ ] Todo botão no LeadCard tem `onPointerDown` guard — DnD funcional após changes (WA-01)
- [ ] LeadCard exibe botão WA (MessageCircle verde) quando `lead.telefone` truthy e não-terminal (WA-01)
- [ ] CadenciaPage loading exibe 3 skeleton rows animados (CAD-02)
- [ ] CadenciaPage empty state tem texto descritivo e CTA para /leads (CAD-02, D-05)
- [ ] Função `abordar()` inclui `telefone` no URLSearchParams (WA-02, D-09)
- [ ] LeadDetailPage exibe card verde com sugestão somente quando cadência ativa (CAD-03, D-06)
- [ ] Botão WhatsApp no card navega para /mensagens com stage correto (WA-01, D-09, D-11)
- [ ] MensagensPage tem botão "Copiar link" ao lado de "Abrir no WhatsApp" (WA-03, D-10)
- [ ] "Copiar link" guarded por `channel === 'whatsapp' && telefone` (WA-03)
- [ ] try/catch em copyWaLink com toast.error em falha
- [ ] Full suite `npx vitest run` verde sem regressões
- [ ] Verificação visual humana aprovada (Task 6)
</success_criteria>

<output>
Ao concluir, criar `.planning/phases/02-cadence-guide-whatsapp-quick-actions/02-01-SUMMARY.md` com:
- Artifacts created/modified (paths absolutos)
- Decisions implemented (D-01..D-11)
- Requirements satisfied (CAD-01..04, WA-01..03)
- Test results (cadencia.test.ts count, full suite status)
- Any deviations from plan with rationale
</output>
