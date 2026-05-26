---
phase: 02-cadence-guide-whatsapp-quick-actions
reviewed: 2026-05-26T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/lib/cadencia.ts
  - src/lib/__tests__/cadencia.test.ts
  - src/components/leads/LeadCard.tsx
  - src/pages/CadenciaPage.tsx
  - src/pages/LeadDetailPage.tsx
  - src/pages/MensagensPage.tsx
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-26
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

The Phase 2 implementation adds cadence tracking (`cadencia.ts`), a D-point badge in `LeadCard`, a contextual suggestion banner in `LeadDetailPage`, a skeleton/empty-state in `CadenciaPage`, and a copy-link button in `MensagensPage`.

The core cadence logic is sound, tests cover the main paths, and the DnD `onPointerDown` guard is applied correctly to all interactive buttons in `LeadCard`. However, three critical issues were found: (1) the test file constructs `InteracaoLead` objects using a field schema that has diverged from the canonical type definition, meaning the tests are not actually exercising the real data shape; (2) `getNextCadenciaPoint` is called in `LeadDetailPage` with a synthetic fallback object when `lead` is `undefined`, silently producing a result for a ghost lead; and (3) `buildWhatsAppUrl` is called in `openWhatsAppConfirm` (no-lead path) using `currentMsg?.body` instead of `effectiveBody`, discarding any in-editor modifications.

---

## Critical Issues

### CR-01: Test `InteracaoLead` shape is incompatible with the real type — tests silently pass on wrong objects

**File:** `src/lib/__tests__/cadencia.test.ts:25-38`

**Issue:** `makeInteracao()` builds objects with fields `stage`, `variacao`, `mensagem`, `perfil_id`, and `status_apos`. The canonical `InteracaoLead` interface (`src/types/index.ts:285-301`) defines `stage_msg`, `setor`, `variacao_idx`, `corpo`, `telefone_usado`, `pipeline_antes`, `pipeline_depois`, `enviada_por_id`, `enviada_por`. There is no `stage`, `variacao`, `mensagem`, `perfil_id`, or `status_apos` on the real type.

Because `cadencia.ts` only reads `enviada_em` from the interaction object, the tests still pass — but `makeInteracao` is typed `as InteracaoLead` against a stale shape. TypeScript will silently accept this because `tsconfig.app.json` disables `noUnusedLocals`/`noUnusedParameters`, and the surplus fields are simply ignored. The problem is structural: if someone adds logic to `cadencia.ts` that reads any real field (e.g. `stage_msg`, `setor`), the test helper will not cover that path, and the type assertion will hide the gap.

**Fix:**
```ts
function makeInteracao(daysAgo: number): InteracaoLead {
  return {
    id: 'i1',
    lead_id: 'test-lead',
    canal: 'whatsapp',
    stage_msg: 'primeiro_contato',
    setor: 'geral',
    variacao_idx: 0,
    corpo: '',
    assunto: null,
    telefone_usado: null,
    pipeline_antes: null,
    pipeline_depois: null,
    enviada_por_id: null,
    enviada_por: null,
    enviada_em: makeDate(daysAgo),
    created_at: makeDate(daysAgo),
  }
}
```

---

### CR-02: `getNextCadenciaPoint` called with a fake synthetic lead when `lead` is undefined in `LeadDetailPage`

**File:** `src/pages/LeadDetailPage.tsx:35-38`

**Issue:**
```ts
const nextCadencia = getNextCadenciaPoint(
  lead ?? { id: '', status: '', created_at: new Date().toISOString() },
  leadInteracoes,
)
```
When `lead` is `undefined` (e.g. the TanStack Query cache is still populating, or the `id` param is invalid), the fallback `{ id: '', status: '', created_at: new Date() }` is passed instead. `status: ''` is not a terminal stage, so the function proceeds as if the lead exists, computing `diasDesdeCriacao = 0` and returning `{ point: CADENCIA_DIAS[0], daysUntil: 1 }`. This causes the cadence suggestion banner (lines 102-133) to render a spurious "Dia 1 da cadência — amanhã" card on a page that already shows "Lead não encontrado." — an inconsistent UI state. The banner renders before the early-return guard at line 54, so it is visible for the full duration of the loading flash.

**Fix:** Move the `getNextCadenciaPoint` call to after the early-return guard, or make it conditional:
```ts
if (!lead) return <div className="text-muted-foreground">Lead não encontrado.</div>

const nextCadencia = lead
  ? getNextCadenciaPoint(lead, leadInteracoes)
  : null
```
Since hooks cannot be called after a conditional return in React, restructure to compute `nextCadencia` only when `lead` is defined:
```ts
// Before the early return:
const nextCadencia = lead
  ? getNextCadenciaPoint(lead, leadInteracoes)
  : null
```
This is safe because `lead` is derived from state, not a hook call itself.

---

### CR-03: `openWhatsAppConfirm` (no-lead path) uses `currentMsg?.body` instead of `effectiveBody`, discarding editor changes

**File:** `src/pages/MensagensPage.tsx:724`

**Issue:**
```ts
function openWhatsAppConfirm() {
  if (!selectedLead) {
    const url = buildWhatsAppUrl(telefone, currentMsg?.body ?? '')  // BUG
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  ...
}
```
`effectiveBody` is the correct source of truth (`editMode ? workingBody : currentMsg?.body`). When the user edits the message and then clicks "Abrir no WhatsApp" without a lead selected, the URL is built from the unedited template, silently discarding the customization. `copyWaLink()` (line 636) correctly uses `effectiveBody` — this is an inconsistency between the two WhatsApp action paths.

**Fix:**
```ts
function openWhatsAppConfirm() {
  if (!selectedLead) {
    const url = buildWhatsAppUrl(telefone, effectiveBody)  // was currentMsg?.body
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  ...
}
```

---

## Warnings

### WR-01: `getNextCadenciaPoint` — overdue D-points (negative `daysUntil`) shown with "hoje" label instead of indicating delay

**File:** `src/components/leads/LeadCard.tsx:345-349`

**Issue:**
```ts
{`D${nextCadencia.point.dia} · ${
  nextCadencia.daysUntil <= 0 ? 'hoje'
  : nextCadencia.daysUntil === 1 ? 'amanhã'
  : `${nextCadencia.daysUntil}d`
}`}
```
`getNextCadenciaPoint` can return `daysUntil < 0` (overdue). For example, if the last interaction was 6 days ago, `diasDesdeUltima = 6`, `proximo = D7`, `daysUntil = 7 - 6 = 1`. But if the last interaction was 8 days ago, `proximo = D10`, `daysUntil = 10 - 8 = 2` — still non-negative. However, upon first call (no interactions, lead created 0 days ago), `daysUntil = 1 - 0 = 1`. The `daysUntil: 0` case is "due today" and the chip correctly shows "hoje". The `daysUntil < 0` path is theoretically impossible for valid input under the current CADENCIA_DIAS set, BUT the function's JSDoc explicitly documents `negative = overdue` as a valid return, suggesting future extension. The UI collapses all `<= 0` values into "hoje" — if overdue logic is ever added, this will silently display incorrect info. More immediately, `cadenciaTiming` in `LeadDetailPage.tsx:43-48` handles `daysUntil < 0` correctly ("`X`d atrasado") but the chip in `LeadCard` does not.

**Fix:** Match the `LeadDetailPage` logic in `LeadCard`:
```ts
nextCadencia.daysUntil < 0 ? `${Math.abs(nextCadencia.daysUntil)}d atrasado`
: nextCadencia.daysUntil === 0 ? 'hoje'
: nextCadencia.daysUntil === 1 ? 'amanhã'
: `${nextCadencia.daysUntil}d`
```

---

### WR-02: Duplicate WhatsApp button in `LeadCard` footer — same action, same URL, confusing UX and test surface

**File:** `src/components/leads/LeadCard.tsx:399-430`

**Issue:** The footer contains two buttons that navigate to the same `msgUrl`:
1. **"mensagem"** button (line 400) — `MessageCircle` icon, always shown.
2. **WhatsApp shortcut** button (line 421-429) — `MessageCircle` icon (same!), shown only when `lead.telefone && !isTerminal`.

Both navigate to `navigate(msgUrl)`. The WhatsApp button uses a green color (`#25D366`) but the same icon, making it appear as a second "message" button rather than a distinct WhatsApp action. For leads with a phone number, clicking either button does the exact same thing. This is likely a placeholder that should open WhatsApp directly (via `window.open(buildWhatsAppUrl(...))`) rather than navigate to `/mensagens`, but as implemented it duplicates the first button. Any future intent divergence (e.g. making the second button open WA directly) would require careful refactoring.

**Fix:** Either remove the second button (it is redundant), or differentiate: use a `ExternalLink`/`Send` icon and make it `window.open(buildWhatsAppUrl(lead.telefone, ''), '_blank', 'noopener,noreferrer')` to match user expectations.

---

### WR-03: `useInteracoes()` fetches up to 2000 rows globally in `LeadCard` — each card filters on the client

**File:** `src/components/leads/LeadCard.tsx:129` and `src/hooks/useInteracoes.ts:15`

**Issue:**
```ts
const { data: allInteracoes = [] } = useInteracoes()
const leadInteracoes = allInteracoes.filter(i => i.lead_id === lead.id)
```
`useInteracoes` fetches all interactions (hard-capped at 2000). Every `LeadCard` component mounts this hook independently. Because TanStack Query deduplicates by query key, only one network request fires — but the returned 2000-row array is held in memory and filtered on every render of every card. With 50 cards visible in the kanban, this is 50 independent `.filter()` calls per re-render. While strictly a performance issue (out of v1 scope), the real bug risk is the 2000-row hard cap: if there are more than 2000 interactions in the database, the oldest records are silently truncated and `getNextCadenciaPoint` will compute `diasDesdeUltima` from the wrong "last" interaction, producing incorrect cadence advice.

**Fix (correctness):** The `.limit(2000)` in `useInteracoes` should either be removed (and proper pagination/filtering applied) or documented as a known limitation. For cadence correctness, prefer `useInteracoesByLead(lead.id)` which fetches only the interactions for that specific lead, always ordered correctly, with no cap.

---

### WR-04: `stage` URL parameter not validated against `Stage` union in `MensagensPage`

**File:** `src/pages/MensagensPage.tsx:467`

**Issue:**
```ts
const [stage, setStage] = useState<Stage>((searchParams.get('stage') as Stage) || prefs.stage || 'primeiro_contato')
```
`searchParams.get('stage')` is an unchecked string cast to `Stage`. If `LeadCard` or any other caller passes an invalid value (e.g. a pipeline status that has no mapping, or a typo), `stage` will hold an invalid `Stage` value. `STAGES.find(s => s.id === stage)!` on line 600 uses a non-null assertion — with an invalid stage it returns `undefined`, and subsequent access to `stageInfo.bgVal` / `stageInfo.colorVal` on lines 985-986 will throw a runtime `TypeError: Cannot read properties of undefined`.

**Fix:** Validate the URL param:
```ts
const VALID_STAGES = new Set<Stage>(['primeiro_contato', 'followup', 'diagnostico', 'proposta', 'negociacao', 'pos_fechamento', 'reativacao'])

const rawStage = searchParams.get('stage')
const [stage, setStage] = useState<Stage>(
  rawStage && VALID_STAGES.has(rawStage as Stage)
    ? (rawStage as Stage)
    : prefs.stage ?? 'primeiro_contato'
)
```

---

### WR-05: `copyMessage()` has no error handling — clipboard failures are silent

**File:** `src/pages/MensagensPage.tsx:624-631`

**Issue:**
```ts
async function copyMessage() {
  const text = ...
  await navigator.clipboard.writeText(text)  // no try/catch
  setCopied(true)
  setTimeout(() => setCopied(false), 2000)
}
```
`copyWaLink()` (line 634-643) correctly wraps in `try/catch` and shows a `toast.error`. `copyMessage()` does not — an unhandled promise rejection will propagate silently. In some browser contexts (non-HTTPS, or when clipboard permission is denied), this will fail with no user feedback. The function is also called from `openCopyConfirm` (no-lead path, line 735), making the error doubly invisible.

**Fix:**
```ts
async function copyMessage() {
  try {
    const text = channel === 'email' && effectiveSubject
      ? `Assunto: ${effectiveSubject}\n\n${effectiveBody}`
      : effectiveBody
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  } catch {
    toast.error('Não foi possível copiar. Tente selecionar e copiar manualmente.')
  }
}
```

---

## Info

### IN-01: `fill()` and `fillBrackets()` are named similarly but serve different syntaxes — the comment separating them is wrong

**File:** `src/pages/MensagensPage.tsx:67-80`

**Issue:** Lines 66 and 71 both read `// ─── Template helper(s) ───`. The `fill()` function handles `{{variable}}` mustache syntax; `fillBrackets()` handles `[variable]` bracket syntax. The two comment headers are identical and the proximity makes it easy to confuse the two. Additionally, `fillBrackets()` is called before `fill()` in `getMessages()` (line 420-421), but if a `[assinatura]` value itself contained `{{...}}` tokens, the inner tokens would be expanded by `fill()` in a subsequent pass — which could be a source of unexpected variable injection from operator-controlled configuration values stored in Supabase (`configuracoes.mensagens.defaults`).

**Fix (info):** Rename `fillBrackets` to `fillDefaults` or `fillConfigVars` for clarity. Note the secondary concern: validate that `configuracoes.mensagens.defaults` values do not contain `{{...}}` before storing them, to prevent operator-injected template expansion.

---

### IN-02: `CadenciaPage` — non-null assertion on `CADENCIA_DIAS.find()` result

**File:** `src/pages/CadenciaPage.tsx:180`

**Issue:**
```ts
const point = CADENCIA_DIAS.find(p => p.dia === dia)!
```
`dia` comes from iterating `grouped`, which is derived from `dueRows`, which only contains `point.dia` values that exist in `CADENCIA_DIAS`. In practice this find always succeeds. However, the non-null assertion `!` suppresses the type guard without communicating the invariant. If `CADENCIA_DIAS` is ever modified, this silently becomes unsafe.

**Fix:** Add a fallback or an explicit check:
```ts
const point = CADENCIA_DIAS.find(p => p.dia === dia)
if (!point) return null  // unreachable but safe
```

---

### IN-03: `LeadDetailPage` — `registroId={id!}` uses non-null assertion on a possibly-undefined route param

**File:** `src/pages/LeadDetailPage.tsx:310`

**Issue:**
```ts
<ActivityTimeline tabela="leads" registroId={id!} />
```
`id` is typed as `string | undefined` by `useParams`. The non-null assertion suppresses the type error. At this point in the component tree the early-return guard at line 54 has fired if `!lead`, but `id` could still be `undefined` if the route param is not populated for some reason. This is a minor type-safety issue: passing `undefined!` to `ActivityTimeline` will send the string `"undefined"` to the Supabase query if the component does not guard internally.

**Fix:** Use `id ?? ''` or `id ?? lead.id` and let the `ActivityTimeline` component handle an empty string gracefully.

---

_Reviewed: 2026-05-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
