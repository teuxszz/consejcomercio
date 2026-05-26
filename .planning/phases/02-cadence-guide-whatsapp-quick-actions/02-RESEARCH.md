# Phase 2: Cadence Guide + WhatsApp Quick Actions — Research

**Researched:** 2026-05-26
**Domain:** React UI enhancement — cadência badge, CadenciaPage inbox, contextual suggestion, wa.me integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Usar `getCadenciaDueToday()` existente em `src/lib/cadencia.ts`, baseada em `InteracaoLead`. Zero migration necessária.

**D-02:** CAD-04 é satisfeito pela primeira `InteracaoLead` registrada no lead — o botão "Abordar" existente em `/cadencia` é o ponto de entrada. Sem botão explícito "Iniciar Cadência".

**D-03:** O badge D-point aparece sempre que há cadência ativa (não só `due today`). Requer nova função `getNextCadenciaPoint(lead, interacoes): { point: CadenciaPoint; daysUntil: number } | null` em `cadencia.ts`.

**D-04:** Formato do badge: `"D3 · 1d"`. Cores: vermelho (`daysUntil <= 0`), amarelo (`daysUntil === 1`), verde (`daysUntil >= 2`).

**D-05:** Aprimorar `CadenciaPage.tsx` existente em `/cadencia` — sem nova rota.

**D-06:** Sugestão contextual (CAD-03) aparece somente na `LeadDetailPage`, não na inbox de cadência.

**D-07:** Badge D-point é um chip colorido no canto superior direito do `LeadCard`, no mesmo estilo visual dos outros chips.

**D-08:** Esquema de cores: Verde = 2+ dias; Amber = 1 dia; Vermelho = hoje ou atrasado.

**D-09:** Botão WhatsApp no `LeadCard` e `LeadDetailPage` navega para `/mensagens?leadId=xxx&stage=Dx`. O wa.me link é gerado dentro do `MensagensPage` após composição.

**D-10:** Botões "Abrir no WhatsApp" e "Copiar link" são adicionados no `MensagensPage` após composição. Sem wa.me direto sem passar pelo composer.

**D-11:** O parâmetro `stage` para navegação é derivado do D-point atual: D1→`primeiro_contato`, D3/D5/D7/D10→`followup`. Usar `CadenciaPoint.stage` de `CADENCIA_DIAS`.

### Claude's Discretion
- Layout exato da sugestão de ação (CAD-03) na `LeadDetailPage`: formato, posição, e texto por D-point.
- Formatação do número de telefone para wa.me (remoção de caracteres não-numéricos, prefixo 55).
- Estado vazio da `/cadencia` inbox quando não há leads para hoje.

### Deferred Ideas (OUT OF SCOPE)
- Notificações Slack quando lead entra no D-point (→ Phase 3, NOTIF-03).
- `cadencia_iniciada_em` como coluna explícita no DB.
- Edição de templates de mensagem por cadência dentro do CRM.
- WhatsApp Business API com número dedicado.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAD-01 | Card de lead no Kanban exibe badge visual com o D-point atual da cadência (D1/D3/D5/D7/D10) | `LeadCard.tsx` já tem placeholder de cadência; nova função `getNextCadenciaPoint()` fornece `daysUntil` para cores |
| CAD-02 | Vista "Ação Hoje" lista apenas leads cujo D-point cai no dia atual | `CadenciaPage.tsx` já implementa isso; aprimorar layout/UX |
| CAD-03 | Sugestão de próxima ação contextual baseada no D-point (somente LeadDetailPage) | `CADENCIA_DIAS[x].descricao` já contém o texto; hook `useInteracoesByLead` fornece dados |
| CAD-04 | Sistema registra início da cadência (via primeira InteracaoLead) | Satisfeito pelo botão "Abordar" existente no CadenciaPage — sem migration |
| WA-01 | Botão WhatsApp no LeadCard e LeadDetailPage abre mensagem pré-preenchida | Navegação para `/mensagens?leadId=&stage=` — padrão já existe em LeadCard |
| WA-02 | Pré-texto do botão WhatsApp varia por D-point | `CadenciaPoint.stage` determina o template correto no MensagensPage |
| WA-03 | Na LeadDetailPage, usuário pode copiar o link wa.me com um clique | `buildWhatsAppUrl()` já existe em MensagensPage; expor botão "Copiar link" |
</phase_requirements>

---

## Summary

Esta fase é puramente UI — zero migrations, zero novos hooks de query, zero novos endpoints. Todo o dado necessário já está disponível via `useLeads()` + `useInteracoes()`. O trabalho consiste em: (1) adicionar uma função pura em `cadencia.ts`, (2) alterar o visual de três componentes existentes (`LeadCard`, `LeadDetailPage`, `CadenciaPage`) e (3) adicionar dois botões no `MensagensPage`.

A função `getCadenciaDueToday()` já existe e está correta para a inbox (`CadenciaPage`). Ela retorna `null` para leads que não estão "devidos hoje". O badge do kanban precisa de `getNextCadenciaPoint()` — uma variação que retorna o próximo ponto E `daysUntil` para colorir o chip. Esta é a única adição de lógica pura.

O `LeadCard` já tem um cadência badge básico (linhas 322–334), mas ele usa apenas `getCadenciaDueToday()` — portanto só aparece quando o lead está due today. A decisão D-03 exige que o badge apareça sempre que há cadência ativa com `daysUntil` colorindo o chip. O badge atual também não exibe o formato `"D3 · 1d"`. Essa é a principal diferença entre o estado atual e o alvo.

O `MensagensPage` já tem `buildWhatsAppUrl()` (linha 456-459) e o botão "Abrir no WhatsApp" (linha 1092-1102). O que falta é um botão "Copiar link wa.me" e a capacidade de passagem do parâmetro `telefone` via URL para pré-preencher o campo telefone no composer.

**Primary recommendation:** Implementar em wave única top-down: `cadencia.ts` primeiro (função pura testável), depois `LeadCard` + `LeadDetailPage` + `CadenciaPage` + `MensagensPage` em paralelo, pois não há dependência entre os arquivos de UI.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cálculo de D-point | Lib pura (`src/lib/cadencia.ts`) | — | Lógica de data pura, sem side-effects; já reside aqui |
| Badge D-point no kanban | Browser/Client (`LeadCard.tsx`) | — | Badge é UI local; dados vêm de hook já montado no componente |
| CadenciaInbox (layout) | Browser/Client (`CadenciaPage.tsx`) | — | Dados já carregados via `useLeads` + `useInteracoes` |
| Sugestão contextual no lead | Browser/Client (`LeadDetailPage.tsx`) | — | Componente já monta `useInteracoesByLead`; sugestão é texto derivado do D-point |
| Geração wa.me URL | Browser/Client (`MensagensPage.tsx`) | — | `buildWhatsAppUrl()` já existe; abrir `_blank` sem backend |
| Cópia de link wa.me | Browser/Client (`MensagensPage.tsx`) | — | `navigator.clipboard.writeText()` puro |

---

## Standard Stack

### Nenhum pacote novo necessário

Esta fase não instala nenhuma dependência. Todo o stack já está disponível:

| Recurso | Localização | Uso nesta fase |
|---------|-------------|----------------|
| `getCadenciaDueToday` | `src/lib/cadencia.ts` | Reusado em CadenciaPage (sem alteração) |
| `CADENCIA_DIAS` | `src/lib/cadencia.ts` | Fonte do texto de sugestão (`.descricao`) e stages |
| `useInteracoes()` | `src/hooks/useInteracoes.ts` | Todas as interações (já montado em LeadCard) |
| `useInteracoesByLead()` | `src/hooks/useInteracoes.ts` | Interações por lead (usar em LeadDetailPage) |
| `buildWhatsAppUrl()` | `src/pages/MensagensPage.tsx` | Já implementado — extrair ou replicar inline |
| `cn()` + Tailwind | `src/lib/utils.ts` | Chips coloridos por urgência |
| `navigator.clipboard.writeText` | Web API nativa | Copiar link wa.me — sem lib externa |
| `useNavigate()` | react-router-dom | Navegação para `/mensagens?...` |

### Package Legitimacy Audit

> Nenhum pacote externo novo é instalado nesta fase. Esta seção é N/A.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
[Kanban Board]
    │
    ├─ LeadCard
    │     ├─ useInteracoes() ──► getNextCadenciaPoint(lead, interacoes)
    │     │                          └─► { point: CadenciaPoint, daysUntil: number }
    │     ├─ D-point badge chip (vermelho/amber/verde por daysUntil)
    │     └─ WhatsApp button ──► navigate('/mensagens?leadId=&stage=')
    │
[/cadencia route]
    │
    └─ CadenciaPage (aprimorado)
          ├─ useLeads() + useInteracoes()
          ├─ getCadenciaDueToday() [sem alteração]
          ├─ Empty state melhorado
          └─ "Abordar" ──► navigate('/mensagens?...')

[/leads/:id route]
    │
    └─ LeadDetailPage (adição)
          ├─ useInteracoesByLead(id)
          ├─ getNextCadenciaPoint(lead, interacoes)
          ├─ Sugestão contextual card (texto de CADENCIA_DIAS[x].descricao)
          └─ WhatsApp button ──► navigate('/mensagens?leadId=&stage=')

[/mensagens route]
    │
    └─ MensagensPage (adição wa.me actions)
          ├─ Já recebe leadId, nome, empresa, stage via URL params
          ├─ telefone já pré-preenchido se passado via URL (NOVO)
          ├─ "Abrir no WhatsApp" button [já existe para canal whatsapp + telefone]
          └─ "Copiar link wa.me" button [NOVO]
```

### Recommended Project Structure

Nenhuma pasta ou arquivo novo. Apenas edições em arquivos existentes:

```
src/
├── lib/
│   └── cadencia.ts          # + getNextCadenciaPoint() [ADIÇÃO]
├── components/
│   └── leads/
│       └── LeadCard.tsx     # badge D-point reformulado [EDIÇÃO]
├── pages/
│   ├── CadenciaPage.tsx     # UX aprimorado [EDIÇÃO]
│   ├── LeadDetailPage.tsx   # sugestão contextual + WA button [EDIÇÃO]
│   └── MensagensPage.tsx    # copiar link wa.me + telefone param [EDIÇÃO]
```

### Pattern 1: `getNextCadenciaPoint` — função pura adicionada a cadencia.ts

**What:** Dado um lead e suas interações, retorna o próximo D-point da cadência E quantos dias faltam. Ao contrário de `getCadenciaDueToday()` que só retorna quando `daysUntil === 0`, esta retorna o próximo ponto futuro também.

**When to use:** Qualquer lugar que precisa mostrar o estado atual da cadência (badge no kanban, sugestão no LeadDetailPage).

**Example:**
```typescript
// src/lib/cadencia.ts — ADIÇÃO após as funções existentes

export interface NextCadenciaResult {
  point: CadenciaPoint
  daysUntil: number  // 0 = hoje, negativo = atrasado, positivo = dias restantes
}

/**
 * Retorna o próximo ponto da cadência com quantos dias faltam,
 * independente de ser hoje ou futuro.
 *
 * Diferença de getCadenciaDueToday():
 *  - getCadenciaDueToday retorna apenas quando daysUntil === 0 (exact match)
 *  - getNextCadenciaPoint retorna QUALQUER ponto ativo, com daysUntil
 *
 * Retorna null se:
 *  - lead em estágio terminal
 *  - cadência concluída (última interação > dia 10)
 *  - nenhuma interação e lead criado há > 1 dia (sem D1 ativo)
 */
export function getNextCadenciaPoint(
  lead: Pick<Lead, 'id' | 'status' | 'created_at'>,
  interacoesDoLead: InteracaoLead[],
  today: Date = new Date(),
): NextCadenciaResult | null {
  if ((TERMINAL_STAGES as readonly string[]).includes(lead.status)) return null

  const ultima = interacoesDoLead[0]

  if (!ultima) {
    // Sem interações: D1 ativo se criado há 0-1 dias
    const diasDesdeCriacao = daysBetween(new Date(lead.created_at), today)
    const point = CADENCIA_DIAS[0]  // Dia 1
    // D1 está "ativo" até o dia 2 inclusive (tolerância 1 dia)
    if (diasDesdeCriacao <= 1) {
      return { point, daysUntil: Math.max(0, point.dia - diasDesdeCriacao) }
    }
    // Lead criado há > 1 dia sem interação: D1 atrasado mas ainda mostra
    if (diasDesdeCriacao <= point.dia + CADENCIA_TOLERANCIA) {
      return { point, daysUntil: point.dia - diasDesdeCriacao }
    }
    return null
  }

  const diasDesdeUltima = daysBetween(new Date(ultima.enviada_em), today)

  // Encontrar o próximo ponto não alcançado ainda
  const proximo = CADENCIA_DIAS.find(p => p.dia >= diasDesdeUltima)
  if (!proximo) return null  // cadência encerrada (passado dia 10)

  return { point: proximo, daysUntil: proximo.dia - diasDesdeUltima }
}
```

### Pattern 2: Badge D-point no LeadCard

**What:** Chip colorido por urgência substituindo o badge atual (que só mostra quando `due today`).

**Key insight:** O LeadCard atual (linha 322-334) já tem um badge que usa `getCadenciaDueToday()`. Este padrão deve ser substituído para usar `getNextCadenciaPoint()` e exibir `"D3 · 1d"`.

**Example:**
```typescript
// Em LeadCard.tsx — substituir bloco "Cadência badge" (linhas 322-334)

// Imports adicionados:
import { getNextCadenciaPoint } from '@/lib/cadencia'

// Dentro do componente, substitui cadenciaPoint:
const nextCadencia = getNextCadenciaPoint(lead, leadInteracoes)

// Derivar cor por urgência:
function cadenciaBadgeStyle(daysUntil: number) {
  if (daysUntil <= 0) return { bg: 'rgba(239,68,68,0.18)', color: '#f87171' }   // vermelho
  if (daysUntil === 1) return { bg: 'rgba(251,191,36,0.18)', color: '#fbbf24' } // amber
  return { bg: 'rgba(37,211,102,0.18)', color: '#4ade80' }                       // verde
}

// Badge:
{nextCadencia && !isStagnant && (
  <button
    title={`${nextCadencia.point.label} — ${nextCadencia.point.descricao}`}
    onPointerDown={e => e.stopPropagation()}
    onClick={e => { e.stopPropagation(); navigate(msgUrl) }}
    className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80"
    style={cadenciaBadgeStyle(nextCadencia.daysUntil)}
  >
    <Send className="w-2.5 h-2.5" />
    D{nextCadencia.point.dia}
    {nextCadencia.daysUntil > 0 && ` · ${nextCadencia.daysUntil}d`}
    {nextCadencia.daysUntil === 0 && ' · hoje'}
    {nextCadencia.daysUntil < 0 && ` · ${Math.abs(nextCadencia.daysUntil)}d atraso`}
  </button>
)}
```

### Pattern 3: Sugestão contextual na LeadDetailPage

**What:** Card de sugestão exibido no topo da aba "Informações" quando há cadência ativa, usando `CADENCIA_DIAS[x].descricao` como texto.

**Layout (Claude's discretion):** Card com fundo verde suave, ícone `Send`, título "Cadência ativa", texto da sugestão e botão WhatsApp de atalho.

**Example:**
```typescript
// Em LeadDetailPage.tsx — adicionar imports e bloco de sugestão

import { getNextCadenciaPoint } from '@/lib/cadencia'
import { useInteracoesByLead } from '@/hooks/useInteracoes'
import { Send } from 'lucide-react'

// Dentro do componente:
const { data: leadInteracoes = [] } = useInteracoesByLead(id)
const nextCadencia = getNextCadenciaPoint(lead, leadInteracoes)

// Sugestão contextual (acima dos tabs ou dentro da aba "Informações"):
{nextCadencia && (
  <div
    className="flex items-start gap-3 p-4 rounded-xl mb-4"
    style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.20)' }}
  >
    <Send className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold" style={{ color: '#4ade80' }}>
        {nextCadencia.point.label} da cadência
        {nextCadencia.daysUntil === 0 && ' — hoje'}
        {nextCadencia.daysUntil === 1 && ' — amanhã'}
        {nextCadencia.daysUntil > 1 && ` — em ${nextCadencia.daysUntil} dias`}
        {nextCadencia.daysUntil < 0 && ` — ${Math.abs(nextCadencia.daysUntil)}d atrasado`}
      </p>
      <p className="text-sm text-foreground mt-0.5">{nextCadencia.point.descricao}</p>
    </div>
    <button
      onClick={() => navigate(
        `/mensagens?leadId=${lead.id}&nome=${encodeURIComponent(lead.nome)}&empresa=${encodeURIComponent(lead.empresa ?? '')}&stage=${nextCadencia.point.stage}&telefone=${encodeURIComponent(lead.telefone ?? '')}`
      )}
      className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white"
      style={{ backgroundColor: '#25D366' }}
    >
      <Send className="w-3.5 h-3.5" />
      WhatsApp
    </button>
  </div>
)}
```

### Pattern 4: Telefone via URL param no MensagensPage

**What:** MensagensPage já lê `nome`, `empresa`, `stage`, `leadId` via `searchParams`. Adicionar leitura de `telefone` para pré-preencher o campo.

**Current state (linha 471):** `useState(searchParams.get('telefone') ?? '')` — **o campo telefone JÁ lê de searchParams.** Nenhuma alteração necessária no MensagensPage para este caso. Basta que os chamadores passem `&telefone=`.

**What's missing:** O botão "Copiar link wa.me" — que copia `buildWhatsAppUrl(telefone, effectiveBody)` para a área de transferência. Implementar ao lado do botão "Abrir no WhatsApp" existente.

**Example:**
```typescript
// Em MensagensPage.tsx — adicionar botão copiar link wa.me
// Ao lado do botão "Abrir no WhatsApp" (linha ~1092)

const [waLinkCopied, setWaLinkCopied] = useState(false)

async function copyWaLink() {
  const url = buildWhatsAppUrl(telefone, effectiveBody)
  await navigator.clipboard.writeText(url)
  setWaLinkCopied(true)
  setTimeout(() => setWaLinkCopied(false), 2000)
}

// JSX (ao lado do botão "Abrir no WhatsApp"):
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
```

### Anti-Patterns to Avoid

- **Criar nova migration:** Não há nada de DB a migrar nesta fase. O badge usa dados já disponíveis via `useInteracoes()`. `cadencia_iniciada_em` é deferred.
- **Novo hook de query:** Não criar `useCadencia()` ou similar. `useInteracoes()` + função pura basta.
- **Badge que bloqueia DnD:** Qualquer botão dentro do `LeadCard` DEVE ter `onPointerDown={e => e.stopPropagation()}` e `onClick={e => { e.stopPropagation(); ... }}` para não interferir com o drag-and-drop.
- **Abrir wa.me sem composer:** Decisão D-09 exige que o link passe pelo MensagensPage primeiro. Não criar shortcuts de wa.me direto em LeadCard ou LeadDetailPage.
- **Inlinar `buildWhatsAppUrl`:** Não duplicar a lógica de formatação de número nos componentes. A função já existe em MensagensPage; se necessário para outros componentes, extrair para `src/lib/utils.ts`.
- **Usar `findLast` ou Array methods modernos sem checar compatibilidade:** O projeto targeting ES2023 — safe.
- **Estado global para cadência:** Não adicionar a `QUERY_KEYS` ou ao `QueryClient` para dados que são computados de `interacoes` que já estão em cache.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Formatação de número para wa.me | Regex manual inline | `buildWhatsAppUrl()` já em MensagensPage | Já lida com prefixo 55 e `replace(/\D/g, '')` |
| Cálculo de dias entre datas | `new Date() - new Date()` raw | `daysBetween()` interna de `cadencia.ts` | Já normaliza para timezone local |
| Estado do D-point | Hook separado com query Supabase | `getNextCadenciaPoint()` função pura | `interacoes` já estão em cache; cálculo é sync |
| Toast de "copiado" com timeout | `setTimeout` manual por componente | Padrão existente: `setState(true); setTimeout(() => setState(false), 2000)` | Já validado em `copyMessage()` do MensagensPage |
| Badge colorido por estado | CSS classes condicionais ad-hoc | `cn()` + `style` inline com variáveis CSS | Padrão do `TarefaStatusBadge.tsx` |

**Key insight:** Esta fase é de enriquecimento de UI sobre dados já disponíveis. Qualquer adição de query ou migration é um sinal de que o scope foi além do planejado.

---

## Common Pitfalls

### Pitfall 1: DnD event propagation — botões dentro do LeadCard

**What goes wrong:** Clicar no badge D-point ou botão WhatsApp inicia o drag do card em vez de navegar.

**Why it happens:** `@dnd-kit/sortable` usa `listeners` (que incluem `onPointerDown`) espalhados no elemento pai via `{...listeners}`. Qualquer filho que não intercepte `onPointerDown` antes propaga para o listener do DnD.

**How to avoid:** Todo botão/clicável dentro do `LeadCard` precisa de:
```typescript
onPointerDown={e => e.stopPropagation()}
onClick={e => { e.stopPropagation(); /* ação */ }}
```
Este padrão já está no DropdownMenu de responsável (linha 204) e no botão "mensagem" (linha 381).

**Warning signs:** Arrastar o card acidentalmente ao tentar clicar no badge.

---

### Pitfall 2: `getNextCadenciaPoint` retornando ponto incorreto quando há interações além do D10

**What goes wrong:** Lead com interação registrada há 15 dias (além do D10) retorna `null` corretamente, mas lead com interação há 11 dias encontra `CADENCIA_DIAS.find(p => p.dia >= diasDesdeUltima)` → retorna nada (correto). Mas se o array `CADENCIA_DIAS` for filtrado de forma errada, pode retornar um ponto futuro equivocado.

**Why it happens:** `find(p => p.dia >= diasDesdeUltima)` onde `diasDesdeUltima = 11` não encontra nenhum ponto (máximo é D10), logo retorna `undefined` → função retorna `null`. Isso é o comportamento correto. O problema surge se alguém mudar `>=` para `>`.

**How to avoid:** Testar explicitamente: interação há 11 dias → retorna `null`. Interação há 10 dias → retorna `{ point: D10, daysUntil: 0 }`. Interação há 9 dias → retorna `{ point: D10, daysUntil: 1 }`.

**Warning signs:** Badge D-point aparecendo em leads com cadência já encerrada (interação > dia 10).

---

### Pitfall 3: `telefone` passado via URL — caracteres especiais não codificados

**What goes wrong:** Número como `(84) 99999-9999` contém `(`, `)`, espaços. Se passado como `&telefone=(84)...` sem encode, o `URLSearchParams.get('telefone')` pode retornar string truncada.

**Why it happens:** Parênteses e espaços são reservados em URLs.

**How to avoid:** Sempre usar `encodeURIComponent(lead.telefone ?? '')` ao montar o URL de navegação. O `buildWhatsAppUrl()` faz `replace(/\D/g, '')` internamente, mas o parse do URL pode corromper antes.

**Warning signs:** Campo telefone no MensagensPage aparece vazio ou com valor parcial ao navegar de LeadDetailPage.

---

### Pitfall 4: Badge aparece em leads terminais

**What goes wrong:** `getNextCadenciaPoint()` retorna um ponto mesmo para lead em status `ganho_assessoria`.

**Why it happens:** Se o guard `TERMINAL_STAGES.includes(lead.status)` for omitido ou mal-colocado.

**How to avoid:** O guard já existe em `getCadenciaDueToday()`. Replicar idêntico como primeiro passo em `getNextCadenciaPoint()`.

**Warning signs:** Cards de leads ganhos/perdidos/cancelados no kanban exibindo badge D-point verde.

---

### Pitfall 5: MensagensPage — botão "Copiar link" aparece mesmo sem telefone

**What goes wrong:** Botão "Copiar link wa.me" aparece quando `telefone === ''`, tentando copiar `https://wa.me/55?text=...`.

**Why it happens:** Guard incompleto — verificar só `channel === 'whatsapp'` sem verificar `telefone`.

**How to avoid:** Condição idêntica ao botão "Abrir no WhatsApp" existente: `{channel === 'whatsapp' && telefone && ...}`.

**Warning signs:** Link copiado começa com `https://wa.me/55?text=` sem número.

---

## Code Examples

### getCadenciaDueToday — comportamento atual (referência)

```typescript
// src/lib/cadencia.ts (existente — NÃO alterar)
// Retorna ponto apenas quando daysUntil === 0 (exact day match)
export function getCadenciaDueToday(
  lead: Pick<Lead, 'id' | 'status' | 'created_at'>,
  interacoesDoLead: InteracaoLead[],
  today: Date = new Date(),
): CadenciaPoint | null
```

### buildWhatsAppUrl — helper existente (referência, não duplicar)

```typescript
// src/pages/MensagensPage.tsx:456-459
function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('55') ? digits : '55' + digits
  return 'https://wa.me/' + intl + '?text=' + encodeURIComponent(message)
}
```

### Navegação para MensagensPage (padrão validado em CadenciaPage)

```typescript
// src/pages/CadenciaPage.tsx:71-79 (padrão canônico — já funciona)
function abordar(row: DueRow) {
  const params = new URLSearchParams({
    nome: row.lead.nome,
    empresa: row.lead.empresa ?? '',
    stage: row.point.stage,
    leadId: row.lead.id,
  })
  navigate(`/mensagens?${params.toString()}`)
}
// ADIÇÃO para LeadDetailPage: incluir telefone:
// params.set('telefone', lead.telefone ?? '')
```

### TarefaStatusBadge — template de chip colorido (seguir este padrão)

```typescript
// src/components/tarefas/TarefaStatusBadge.tsx — estilo canônico de chips
<span
  className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold border"
  style={{ background: s.bg, color: s.color, borderColor: s.border }}
>
  {s.label}
</span>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Badge apenas quando due today | Badge para qualquer ponto ativo com urgência colorida | D-03 desta fase | Visibilidade contínua do estado da cadência |
| wa.me apenas no MensagensPage | wa.me gerado no MensagensPage, acessível via navegação direta de qualquer card | D-09/D-10 | Fluxo em 2 cliques do kanban até wa.me |

**Nenhum deprecated** nesta fase — tudo é adição conservadora.

---

## Assumptions Log

> Esta pesquisa é baseada inteiramente em leitura direta do codebase. Sem claims assumed.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `telefone` já é lido de `searchParams` em MensagensPage (`useState(searchParams.get('telefone') ?? '')`) | Code Examples | Se campo mudou de nome, o pré-preenchimento não funciona — mas verificado na linha 471 do arquivo |

**Se esta tabela está essencialmente vazia:** Todos os claims desta pesquisa foram verificados diretamente no codebase — sem user confirmation necessária para nenhuma decisão técnica.

---

## Open Questions (RESOLVED)

1. **`buildWhatsAppUrl` deve ser extraída para `src/lib/utils.ts`?**
   - What we know: Atualmente é uma função local em MensagensPage (não exportada). LeadDetailPage vai precisar do mesmo comportamento para montar a URL de navegação — mas não chamará `buildWhatsAppUrl` diretamente, apenas passará o telefone como URL param.
   - What's unclear: Se a sugestão contextual em LeadDetailPage precisará gerar um wa.me direto (sem passar pelo composer), o que contraria D-09.
   - RESOLVED: Manter em MensagensPage. LeadDetailPage apenas navega com `&telefone=encodeURIComponent(lead.telefone ?? '')`. O wa.me é gerado DENTRO do MensagensPage. (D-09 locked)

2. **`daysUntil` negativo — exibir no badge do kanban?**
   - What we know: D-04 define cores por `daysUntil <= 0` (vermelho), `=== 1` (amber), `>= 2` (verde). Badge deve mostrar urgência.
   - What's unclear: Se mostrar `"D3 · 2d atraso"` ou apenas `"D3 · hoje"` para negativos.
   - RESOLVED: Usar `"D3 · hoje"` para `daysUntil <= 0` (simplifica o badge; atraso implica urgência pelo vermelho). UI-SPEC copywriting contract adota este padrão.

---

## Environment Availability

> Step 2.6 SKIPPED — esta fase é puramente code/UI changes. Nenhuma dependência externa além do stack já instalado.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/__tests__/cadencia.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAD-01 | `getNextCadenciaPoint` retorna ponto correto com `daysUntil` | unit | `npx vitest run src/lib/__tests__/cadencia.test.ts` | ❌ Wave 0 |
| CAD-01 | Badge não aparece em leads terminais | unit | `npx vitest run src/lib/__tests__/cadencia.test.ts` | ❌ Wave 0 |
| CAD-01 | Badge não aparece após D10 (interação há 11+ dias) | unit | `npx vitest run src/lib/__tests__/cadencia.test.ts` | ❌ Wave 0 |
| CAD-02 | `getCadenciaDueToday` sem alteração — testes existentes suficientes | unit | `npx vitest run` | N/A — função não muda |
| CAD-03 | Sugestão exibe texto correto por D-point | manual | n/a — UI component render | — |
| WA-01 | Navegação para /mensagens com params corretos | manual | n/a — react-router navigate | — |
| WA-02 | `buildWhatsAppUrl` formata número corretamente | unit | `npx vitest run src/lib/__tests__/utils.test.ts` | ❌ Wave 0 (extrair e testar) |
| WA-03 | `navigator.clipboard.writeText` chamado com URL correta | unit | `npx vitest run src/lib/__tests__/utils.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Por task commit:** `npx vitest run src/lib/__tests__/cadencia.test.ts`
- **Por wave merge:** `npx vitest run`
- **Phase gate:** Full suite green antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/lib/__tests__/cadencia.test.ts` — testes unitários de `getNextCadenciaPoint()` (REQ CAD-01)
  - Cenários: lead terminal → null; sem interação há 0d → D1 daysUntil=1; sem interação há 1d → D1 daysUntil=0; interação há 3d → D3 daysUntil=0; interação há 4d → D5 daysUntil=1; interação há 11d → null
- [ ] `buildWhatsAppUrl` — se extraída para utils.ts, adicionar testes de formatação de número

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` conforme config.json.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (auth já implementada, sem mudança) |
| V3 Session Management | no | — (sem mudança de sessão) |
| V4 Access Control | no | — (sem novas rotas gated; `/cadencia` e `/mensagens` já existem com sessão auth) |
| V5 Input Validation | yes (parcial) | Telefone passado via URL → `replace(/\D/g, '')` no `buildWhatsAppUrl`; `encodeURIComponent` na montagem do URL |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| URL param injection via `telefone` | Tampering | `buildWhatsAppUrl` já sanitiza com `replace(/\D/g, '')`. Validar que apenas dígitos chegam ao wa.me link |
| wa.me open redirect (texto malicioso via lead.nome/empresa) | Spoofing | `encodeURIComponent` no body da mensagem. O texto é template gerado pelo sistema, não input livre do usuário neste fluxo |
| Clipboard API indisponível (HTTP não-local) | Availability | `navigator.clipboard` requer HTTPS. Vercel serve HTTPS — no problema em produção. Localmente pode falhar — adicionar `try/catch` |

**Nota de segurança sobre clipboard:** A implementação existente em `copyMessage()` (MensagensPage, linha 622-629) usa `await navigator.clipboard.writeText()` sem try/catch. O padrão para `copyWaLink` deve espelhar este comportamento (consistência), mas se a equipe quiser robustez extra, um try/catch com fallback `document.execCommand('copy')` é a solução padrão.

---

## Sources

### Primary (HIGH confidence)
- Codebase lido diretamente: `src/lib/cadencia.ts`, `src/pages/CadenciaPage.tsx`, `src/pages/MensagensPage.tsx`, `src/components/leads/LeadCard.tsx`, `src/pages/LeadDetailPage.tsx`, `src/types/index.ts`, `src/hooks/useInteracoes.ts`, `src/components/tarefas/TarefaStatusBadge.tsx`, `src/lib/constants.ts`, `vitest.config.ts`
- `.planning/phases/02-cadence-guide-whatsapp-quick-actions/02-CONTEXT.md` — decisões locked
- `.planning/REQUIREMENTS.md` — critérios de aceitação CAD-01..04, WA-01..03
- `.planning/config.json` — `nyquist_validation: true`, `security_enforcement: true`

### Secondary (MEDIUM confidence)
- Nenhuma — toda informação verificada diretamente no codebase.

### Tertiary (LOW confidence)
- Nenhuma.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero dependências novas, tudo verificado no codebase
- Architecture: HIGH — padrões idênticos a CadenciaPage/LeadCard existentes, lidos diretamente
- Pitfalls: HIGH — identificados por análise de código existente (DnD pattern, URL encoding)
- Tests: HIGH — vitest.config.ts lido, test pattern de icp-dinamico.test.ts referenciado

**Research date:** 2026-05-26
**Valid until:** 2026-07-26 (estável — stack não muda, sem dependências externas)
