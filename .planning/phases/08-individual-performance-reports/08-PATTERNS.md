# Phase 8: Individual Performance Reports — Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 19 (13 NEW + 6 MODIFIED + 2 package files)
**Analogs found:** 17 / 19 (2 sem analog: `pdf-export.ts`, `csv-export.ts` — patterns vêm do RESEARCH §3-§5)

---

## File Classification

| File | New/Mod | Role | Data Flow | Closest Analog | Match |
|------|---------|------|-----------|----------------|-------|
| `src/lib/desempenho.ts` | NEW | lib (pure helper) | transform | `src/lib/icp-dinamico.ts` | exact |
| `src/lib/slug.ts` | NEW | lib (utility) | transform | inline `slugify` em `src/components/mensagens/BlocoEditorModal.tsx:32-40` | exact (extract) |
| `src/lib/pdf-export.ts` | NEW | lib (lazy-import orchestration) | file-I/O / event-driven | — (RESEARCH §3 §4) | no analog |
| `src/lib/csv-export.ts` | NEW | lib (lazy-import orchestration) | file-I/O | — (RESEARCH §5) | no analog |
| `src/lib/desempenho-period.ts` | NEW (small) | lib (localStorage hydration) | transform | `src/contexts/ThemeContext.tsx` (localStorage pattern) | role-match |
| `src/components/desempenho/DesempenhoReport.tsx` | NEW | component (off-screen renderer) | render | `src/pages/DashboardPage.tsx` (KPI grid + recharts) | role-match |
| `src/components/desempenho/DesempenhoTeamReport.tsx` | NEW | component (multi-page renderer) | render | `DesempenhoReport.tsx` (itself, repeated N times) | exact |
| `src/components/desempenho/KPICard.tsx` | NEW | component (UI primitive) | render | `KpiCard` inline em `src/pages/ReceitaPage.tsx:80-106` | exact |
| `src/components/desempenho/ExportarPDFButton.tsx` | NEW | component (button + spinner) | event-driven | `src/components/me/PerfilPanel.tsx::handleFileChange` (action + pending state + toast) | role-match |
| `src/components/desempenho/ExportarCSVButton.tsx` | NEW | component (button + spinner) | event-driven | mesmo | role-match |
| `src/components/desempenho/ExportarPDFEquipeButton.tsx` | NEW | component (button + modal progress + AbortController) | event-driven | RESEARCH §4 + shadcn Dialog pattern | partial |
| `src/pages/MeDesempenhoPage.tsx` | NEW | page (orchestrator) | request-response | `src/pages/ReceitaPage.tsx` (PeriodSelector + RequireRole + KPIs) | exact |
| `src/test/pdf-mocks.ts` | NEW | test infra | mock | `src/test/storage-mocks.ts` | exact (style) |
| `src/lib/__tests__/desempenho.test.ts` | NEW | test (unit) | request-response | `src/lib/__tests__/icp-dinamico.test.ts` | exact |
| `src/lib/__tests__/slug.test.ts` | NEW | test (unit) | request-response | `src/lib/__tests__/icp-dinamico.test.ts` (struct) | role-match |
| `src/lib/__tests__/csv-export.test.ts` | NEW | test (unit) | request-response | idem | role-match |
| `src/components/desempenho/__tests__/*.test.tsx` | NEW | test (component) | render | RTL pattern padrão do projeto | role-match |
| `src/types/index.ts` | MOD | types | — | já contém `Lead`, `Cliente`, `Contrato` (`src/types/index.ts:1-130`) | exact |
| `src/router.tsx` | MOD | route registry | — | `src/router.tsx:80-91` (rotas `/me/*` existentes) | exact |
| `src/pages/AdocaoPage.tsx` | MOD | page (add export button + drill) | event-driven | `src/pages/ReceitaPage.tsx` (button + navigate) | role-match |
| `src/components/me/PerfilPanel.tsx` | MOD | component (add link) | render | a si mesmo | exact |
| `src/components/layout/GlobalSearch.tsx` | MOD | component (add static page entry) | request-response | a si mesmo (estrutura `ResultItem` + `CATEGORY_META`) | exact |
| `src/components/mensagens/BlocoEditorModal.tsx` | MOD | component (refactor → import slug) | — | a si mesmo | exact (rename internal) |
| `package.json` + `package-lock.json` | MOD | manifest | — | — | n/a |

---

## Pattern Assignments

### 1. `src/lib/desempenho.ts` (lib pure helper)

**Analog:** `src/lib/icp-dinamico.ts` — única fonte de verdade para "pure helper determinístico filtrável por `PeriodValue`".

**Imports pattern** (`src/lib/icp-dinamico.ts:25-29`):
```typescript
import type { PeriodValue } from './periods'
import { getPeriodRange, isInRange } from './periods'

const WON_STATUSES      = ['ganho_assessoria', 'ganho_consultoria']
const TERMINAL_STATUSES = [...WON_STATUSES, 'perdido', 'cancelado']
```
**Para Phase 8:** trocar arrays inline por importar de `@/lib/constants` — `TERMINAL_WON_STAGES` (`src/lib/constants.ts:18`) e `TERMINAL_LOST_STAGES` (`src/lib/constants.ts:20`). Usar cast `(TERMINAL_WON_STAGES as readonly string[])` ao comparar com `lead.status: string`.

**Pure-helper interface pattern** (`src/lib/icp-dinamico.ts:31-63`):
```typescript
export type Conviccao = 'alta' | 'preliminar' | 'insuficiente'

export interface IcpObservadoServico {
  servicoId: string
  total: number
  // ...
}

interface LeadLike {
  status: string
  updated_at: string
  segmento?: string | null
  // ...
}
```
**Para Phase 8:** definir `DesempenhoMetricas` em `src/types/index.ts` (D-10) e re-exportar tipos de input via interface local `CalcularDesempenhoInput` (NÃO duplicar `Lead`/`Tarefa`/`Cliente` — anti-pattern do CLAUDE.md). Skeleton completo em RESEARCH §Pattern 1 lines 297-379.

**Filter-by-period pattern** (`src/lib/icp-dinamico.ts:131-137`):
```typescript
const range = getPeriodRange(period)
const terminaisGlobal = leads.filter(
  l => TERMINAL_STATUSES.includes(l.status) && isInRange(l.updated_at, range)
)
```
**Para Phase 8:** usar `isInRange(l.created_at, range)` para `leads_criados`, `l.updated_at` para `convertidos/perdidos` (terminal moment), `t.data_conclusao` para tarefas.

**Null-handling pattern** (helper retorna `null` quando não há denominador):
- Phase 8 segue o mesmo padrão — `ciclo_medio_dias`, `icp_fit_medio`, `nps_medio` ficam `null` quando set é vazio (Pitfall 6 / RESEARCH `## Open Questions`).

**Comment style** (header do helper — `src/lib/icp-dinamico.ts:1-23`): comentário explicativo no topo do arquivo descrevendo regras de negócio. Phase 8 replica: documentar "Ciclo médio = (updated_at - created_at) apenas para leads em TERMINAL_WON_STAGES" e "NPS via clientes.responsavel_id" (resolver Open Question 1 antes de codar).

---

### 2. `src/lib/slug.ts` (lib utility — extract)

**Analog:** `src/components/mensagens/BlocoEditorModal.tsx:32-40` (função privada `slugify`).

**Extract source** (`src/components/mensagens/BlocoEditorModal.tsx:32-40`):
```typescript
function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')          // ← range literal de combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}
```

**Para Phase 8** (RESEARCH §Pattern 7 — CRITICAL fix):
- Reescrever o range como `̀-ͯ` (escape hex) — o range literal `̀-ͯ` quebra em editors sem suporte UTF-8 e é frágil em diffs/git.
- Tornar `maxLen` parâmetro opcional (default 48) — filename PDF precisa mais espaço que ID de bloco.
- Exportar `named` (CLAUDE.md: named exports apenas em `src/`).
- Após extrair, refactor `BlocoEditorModal.tsx` para `import { slugify } from '@/lib/slug'`.

```typescript
// Target shape
export function slugify(input: string, maxLen = 48): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
}
```

---

### 3. `src/lib/pdf-export.ts` (lazy-import orchestration)

**Analog:** none in codebase. Patterns vêm de RESEARCH §Pattern 3 (individual) + §Pattern 4 (team).

**Reference skeletons:** RESEARCH lines 451-503 (individual) e 510-568 (team). Replicar:
- **Lazy import:** `const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')])` (RESEARCH §Pattern 11 — Vite gera chunks automáticos).
- **Theme toggle:** `try { html.classList.remove('dark'); html.classList.add('light') } finally { restore }` (RESEARCH §Pattern 6 + Pitfall 5).
- **Per-page capture loop:** `html2canvas(pageEl, { scale: 2, backgroundColor: '#fff', useCORS: true, logging: false })` → `pdf.addImage(dataURL, 'PNG', 0, 0, 210, 297, undefined, 'FAST')`.
- **Memory release iOS:** `canvas.width = 0; canvas.height = 0` entre páginas (RESEARCH §Pattern 3 line 492).
- **Filename:** `desempenho_${slugify(metrics.perfilNome)}_${formatPeriodLabel(metrics.periodo).replace(/\s+/g, '')}.pdf` (consome `slug.ts` + `periods.ts::formatPeriodLabel`).

**Conventions a respeitar:**
- 2-space indent, single quotes, no semicolons (codebase style).
- Named exports: `export async function gerarRelatorioIndividual(...)`, `export async function gerarRelatorioEquipe(...)`.
- `ProgressInfo` interface exportada (consumida por modal — RESEARCH §Pattern 4 line 511).

---

### 4. `src/lib/csv-export.ts` (papaparse + jszip)

**Analog:** none. Skeleton em RESEARCH §Pattern 5 lines 614-694.

**Key patterns to copy:**
- **UTF-8 BOM constant** (line 618): `const UTF8_BOM = '﻿'` — usar escape em vez do BOM literal (legibilidade).
- **Lazy import**: `const [{ default: Papa }, { default: JSZip }] = await Promise.all([import('papaparse'), import('jszip')])`.
- **Quote-everything**: `Papa.unparse(rows, { quotes: true })` — Pitfall 8 RESEARCH.
- **CSV injection sanitizer** (`sanitizeCell`, RESEARCH lines 687-694) — OWASP T-08-03; obrigatório para `titulo`, `notas`, `cliente_nome`.
- **Download trigger pattern**: `URL.createObjectURL(blob)` → `<a download>` → `URL.revokeObjectURL(url)` (RESEARCH §Pattern 5 + Pitfall 8).

**Columns per RESEARCH §Pattern 9** (PT-BR headers, ISO dates):
- `leads.csv` — `nome, empresa, segmento, status, investimento_estimado, created_at, updated_at, motivo_perda, icp_fit`
- `tarefas.csv` — `titulo, status, prioridade, data_vencimento, criado_em, concluida_em`
- `contratos.csv` — `cliente_nome, modelo_precificacao, valor_total, valor_mensal, status, data_inicio, data_fim`

---

### 5. `src/lib/desempenho-period.ts` (localStorage hydration)

**Analog:** `src/contexts/ThemeContext.tsx` — único pattern de "load/save preference em localStorage" no codebase (referenciado em CLAUDE.md `## Architecture / State`).

**Pattern (de ThemeContext)**: try/catch ao ler+JSON.parse, fallback para default, ignorar quota errors no save.

**Para Phase 8** (RESEARCH §Pattern 8 lines 722-741):
```typescript
const KEY = 'consej_desempenho_period'

export function loadPeriod(): PeriodValue {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { year: getCurrentYear(), granularity: 'total' }
    const parsed = JSON.parse(raw) as PeriodValue
    if (typeof parsed.year === 'number' && typeof parsed.granularity === 'string') return parsed
  } catch { /* fall through */ }
  return { year: getCurrentYear(), granularity: 'total' }
}
export function savePeriod(v: PeriodValue): void {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* ignore quota */ }
}
```

Validação `typeof` é obrigatória (T-08-07 — localStorage tampering).

---

### 6. `src/components/desempenho/DesempenhoReport.tsx` (off-screen renderer)

**Analog:** `src/pages/DashboardPage.tsx` (KPI grid 4×2 + recharts BarChart/PieChart inline).

**KPI grid 4×2 pattern** (`src/pages/DashboardPage.tsx:249-268`):
```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  {[
    { label: 'Leads Ativos', value: activeLeads, icon: Users, iconBg: 'rgba(99,102,241,0.15)', iconColor: '#a5b4fc' },
    { label: 'Clientes Ativos', value: activeClientes, icon: Briefcase, ... },
    // 8 items para Phase 8 (em 4×2 grid)
  ].map(({ label, value, icon: Icon, iconBg, iconColor }) => (
    <Card key={label}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm" style={{ color: 'var(--text-soft-a)' }}>{label}</p>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: iconBg }}>
            <Icon className="w-4 h-4" style={{ color: iconColor }} />
          </div>
        </div>
        <p className="text-2xl font-bold" style={{ color: 'var(--text-strong-a)' }}>{value}</p>
      </CardContent>
    </Card>
  ))}
</div>
```

**BarChart funil pattern** (`src/pages/DashboardPage.tsx:395-407`):
```tsx
<ResponsiveContainer width="100%" height={220}>
  <BarChart data={funnelData} layout="vertical">
    <XAxis type="number" tick={{ fontSize: 10, fill: 'rgba(150,165,180,0.60)' }} />
    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'rgba(150,165,180,0.60)' }} width={90} />
    <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid var(--alpha-border-md)', color: 'rgba(220,230,240,0.90)', borderRadius: 8 }} />
    <Bar dataKey="value" fill="#0089ac" radius={[0, 4, 4, 0]} />
  </BarChart>
</ResponsiveContainer>
```

**Timeline LineChart pattern** — usar `src/pages/ReceitaPage.tsx:323-331`:
```tsx
<Line
  type="monotone"
  dataKey="mrr"
  stroke="#0089ac"
  strokeWidth={2}
  dot={{ r: 3, fill: '#0089ac' }}
  connectNulls
  isAnimationActive={false}  // ← CRITICAL Phase 8 — Pitfall 1
/>
```

**CRITICAL — Phase 8 deltas vs analogs:**
1. Componente é renderizado via **portal off-screen** (RESEARCH §Pattern 2 lines 402-441) — NÃO é uma página visível.
2. Container raiz `<div data-pdf-root style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '794px', pointerEvents: 'none', background: 'white', color: '#0d1929' }}>`.
3. **Forçar fundo branco** explicitamente — `background: 'white'` + `color: '#0d1929'` (página é capturada em light theme).
4. **`isAnimationActive={false}` em TODOS os charts** (LineChart, BarChart, Pie) — Pitfall 1. Não usar default true.
5. 3 sub-divs com `data-pdf-page="1|2|3"` para captura individual (RESEARCH §Pattern 2 lines 428-436).
6. Layout per D-11: página 1 (header + KPI 4×2 + footer), página 2 (funil + timeline), página 3 (tarefas + ICP fit + NPS).

---

### 7. `src/components/desempenho/DesempenhoTeamReport.tsx`

**Analog:** `DesempenhoReport.tsx` itself, repeated.

**Pattern:** Capa (totais) + N consultor pages + sumário ranqueado. Receber prop `consultor: DesempenhoConsultorTeam | null` — quando `null`, renderiza capa; quando preenchido, renderiza página individual; sumário tem variant próprio.

**Iteração externa** vive em `pdf-export.ts::gerarRelatorioEquipe` (RESEARCH §Pattern 4 lines 538-545). Para cada consultor, o callback `renderEm(metrics)` monta este componente, espera 1 RAF para garantir paint, captura, desmonta.

---

### 8. `src/components/desempenho/KPICard.tsx`

**Analog:** `KpiCard` inline em `src/pages/ReceitaPage.tsx:80-106`.

**Excerpt completo** (`src/pages/ReceitaPage.tsx:80-106`):
```tsx
interface KpiCardProps {
  title: string
  value: string
  icon: React.FC<{ className?: string }>
  onClick: () => void
  emphasis?: 'destructive' | 'default'
}

function KpiCard({ title, value, icon: Icon, onClick, emphasis = 'default' }: KpiCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'cursor-pointer transition-all hover:border-cyan-600/60 hover:shadow-md',
        emphasis === 'destructive' && 'border-destructive/40',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</span>
          <Icon className={cn('w-4 h-4', emphasis === 'destructive' ? 'text-destructive' : 'text-cyan-500')} />
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
```

**Para Phase 8 — extrair como componente shared:**
- Sub-pasta `src/components/desempenho/` (não `/shared/` — uso restrito a Phase 8).
- Adicionar prop opcional `onClick?: () => void` (KPI no PDF é estático — sem onClick; KPI na página visível pode drill).
- Adicionar prop `null-safe value`: se `value === null` → render `—` (fallback NPS undefined, Claude's Discretion).
- Para PDF: `value` tipo `string | number`; component formata internamente.

---

### 9. `src/components/desempenho/ExportarPDFButton.tsx` / `ExportarCSVButton.tsx`

**Analog:** `src/components/me/PerfilPanel.tsx::handleFileChange` (lines 49-69) — pattern "click → setLoading → try/await/toast → finally setLoading false".

**Excerpt PerfilPanel pattern** (`src/components/me/PerfilPanel.tsx:38-69`):
```typescript
async function handleSave() {
  if (!userId) return
  if (!nome.trim()) { toast.error('Nome é obrigatório'); return }
  try {
    await salvar.mutateAsync({ id: userId, nome, cargo, bio, foto_url: fotoUrl, email: userEmail })
    toast.success('Perfil salvo!')
  } catch {
    toast.error('Erro ao salvar perfil')
  }
}
```

**Para Phase 8:**
- `const [exportando, setExportando] = useState(false)`.
- Button disabled durante `exportando` + spinner inline (`<Loader2 className="w-3.5 h-3.5 animate-spin" />` ou pattern de `PerfilPanel` line 85-86 spinner div).
- `try` → `await gerarRelatorioIndividual(...)` → `toast.success('PDF gerado')`.
- `catch (e: unknown)` → `toast.error(e instanceof Error ? e.message : 'Erro ao gerar PDF')` (CLAUDE.md `## Error Handling` — RPC error pattern).
- `finally` → `setExportando(false)`.

---

### 10. `src/components/desempenho/ExportarPDFEquipeButton.tsx` (modal + AbortController)

**Analog parcial:** RESEARCH §Pattern 4 lines 573-608 (skeleton do modal); shadcn `Dialog` em `src/components/ui/dialog.tsx`; `Progress` em `src/components/ui/progress.tsx`.

**Skeleton from RESEARCH:**
```tsx
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

export function ProgressTeamReportModal({ open, current, total, consultorNome, onCancel }: Props) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md">
        <DialogTitle>Gerando relatório da equipe</DialogTitle>
        <Progress value={(current / total) * 100} />
        <p className="text-sm text-muted-foreground">{current} / {total} consultores · {consultorNome}</p>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </DialogContent>
    </Dialog>
  )
}
```

**AbortController pattern** (RESEARCH §Pattern 4 lines 597-608):
```typescript
const controllerRef = useRef<AbortController | null>(null)
async function handleExportTeam() {
  const controller = new AbortController()
  controllerRef.current = controller
  try {
    await gerarRelatorioEquipe(consultoresAtivos, totaisEquipe, renderEm, setProgress, controller.signal)
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') toast('Geração cancelada')
    else toast.error('Erro ao gerar PDF da equipe')
  }
}
function handleCancel() { controllerRef.current?.abort() }
```

**iOS warn** — Pattern 10 RESEARCH lines 770-783 (toast.warning com action "Tentar mesmo assim").

---

### 11. `src/pages/MeDesempenhoPage.tsx`

**Analog:** `src/pages/ReceitaPage.tsx` — exatamente a estrutura "PeriodSelector no header + KPIs + charts + RequireRole na borda".

**Page-with-content-split pattern** (`src/pages/ReceitaPage.tsx:172-476`):
```tsx
function ReceitaPageContent() {
  // ... toda a lógica
}

export function ReceitaPage() {
  return (
    <RequireRole atLeast="coordenador">
      <ReceitaPageContent />
    </RequireRole>
  )
}
```

**Para Phase 8 — diferença crítica:**
- `/me/desempenho` (sem param) NÃO precisa de `RequireRole` na borda — qualquer auth user vê o próprio.
- `/me/desempenho/:perfilId` precisa de RequireRole `atLeast="coordenador"` SOMENTE quando `params.perfilId !== meuPerfil.id` (Pitfall 4 — RESEARCH lines 863-867).
- Skeleton em RESEARCH §Code Examples lines 906-967.

**PeriodSelector + header pattern** (`src/pages/ReceitaPage.tsx:211-220`):
```tsx
<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
  <div>
    <h1 className="text-xl font-bold text-foreground">Receita</h1>
    <p className="text-xs text-muted-foreground mt-1">...</p>
  </div>
  <PeriodSelector value={period} onChange={setPeriod} derivedYearsFrom={contratos} />
</div>
```

**Para Phase 8:**
```tsx
<PeriodSelector value={period} onChange={setPeriod} derivedYearsFrom={leads} />
```
Importar `loadPeriod` e `savePeriod` de `@/lib/desempenho-period` para localStorage hydration (D-06).

**Conditional RequireRole pattern (Phase 8 specific):**
```tsx
const content = (/* ... main page JSX ... */)
return isViewingOther
  ? <RequireRole atLeast="coordenador">{content}</RequireRole>
  : content
```

---

### 12. `src/test/pdf-mocks.ts`

**Analog:** `src/test/storage-mocks.ts` (Phase 7 — exact pattern para test infra).

**Style pattern** (`src/test/storage-mocks.ts:1-19` comentário + factory pattern):
```typescript
import { vi } from 'vitest'

// Mock helpers para Supabase Storage usados em Phase 7 (cliente_docs).
// Cada helper instala stubs em locais relevantes... Style espelhado de
// `src/test/push-mocks.ts` — factory functions vi.fn-based, sem efeitos colaterais
// até o helper ser chamado por um teste.

type Restore = () => void

export interface MockUploadOptions { /* ... */ }
export interface MockUploadResult {
  uploadFn: ReturnType<typeof vi.fn>
  fromFn: ReturnType<typeof vi.fn>
  restore: Restore
}

export function mockSupabaseStorageUpload(opts: MockUploadOptions = {}): MockUploadResult {
  const uploadFn = vi.fn(() => Promise.resolve({ data: { path }, error: null }))
  // ... build mock graph
  const restore: Restore = () => { uploadFn.mockReset(); /* ... */ }
  return { uploadFn, fromFn, restore }
}
```

**Para Phase 8:**
- Header comment menciona "Mock helpers para PDF/CSV export usados em Phase 8" + "style espelhado de storage-mocks.ts".
- `mockJsPdf({ shouldFail?, instanceMethods? })` retorna `{ jsPDFClass, savedFiles[], restore }`.
- `mockHtml2canvas({ canvas? })` retorna `{ html2canvasFn, restore }`.
- `mockJSZip({ shouldFail? })` retorna `{ JSZipClass, addedFiles[], generatedBlob, restore }`.
- `mockPapaparse({ unparseImpl? })` retorna `{ Papa, restore }`.
- Helper genérico `mockBlobUrlAndAnchor()` instala `URL.createObjectURL` / `revokeObjectURL` (jsdom não tem).

**Critical (RESEARCH `### Test Framework`):** jsdom não suporta `<canvas>` real — todos esses mocks são obrigatórios. PDF generation em si é manual UAT only (REP-02 não tem teste automatizado).

---

### 13. `src/lib/__tests__/desempenho.test.ts`

**Analog:** `src/lib/__tests__/icp-dinamico.test.ts` — exact match (pure helper unit tests, fixture builder pattern).

**Excerpt pattern** (`src/lib/__tests__/icp-dinamico.test.ts:1-27`):
```typescript
import { describe, it, expect } from 'vitest'
import { calcularIcpDinamico, /* ... */ } from '../icp-dinamico'
import type { PeriodValue } from '../periods'

const PERIODO_2025: PeriodValue = { year: 2025, granularity: 'total' }
const SVC = 'assessoria_societaria'

function lead(
  status: string,
  segmento: string,
  investimento: string,
  servicos: string[] = [SVC],
  updated_at = '2025-06-15T12:00:00Z',
) {
  return { status, updated_at, segmento, investimento_estimado: investimento, servicos_interesse: servicos }
}

const ganho = (seg: string, inv: string, servicos: string[] = [SVC]) =>
  lead('ganho_assessoria', seg, inv, servicos)
const perda = (seg: string, inv: string, servicos: string[] = [SVC]) =>
  lead('perdido', seg, inv, servicos)
```

**Para Phase 8 — replicar:**
- Builder helpers `leadFix({...overrides})`, `tarefaFix({...})`, `clienteFix({...})` no topo.
- Constantes `PERFIL_ID = 'p1'`, `PERIODO_2026: PeriodValue = { year: 2026, granularity: 'total' }`.
- `describe('calcularDesempenho')` com 4+ casos:
  - "lista vazia → todas métricas zero/null"
  - "filtra por responsavel_id"
  - "win_rate = ganhos / (ganhos + perdidos)"
  - "fora do período → ignora"
  - "nenhum cliente com NPS → nps_medio === null"
  - "ciclo_medio_dias === null quando sem ganhos"

---

### 14. `src/lib/__tests__/slug.test.ts`

**Analog estrutural:** `icp-dinamico.test.ts`.

**Casos para Phase 8:**
```typescript
describe('slugify', () => {
  it('strips acentos pt-BR', () => expect(slugify('Conceição')).toBe('conceicao'))
  it('replaces spaces with dashes', () => expect(slugify('João Silva')).toBe('joao-silva'))
  it('lowercases', () => expect(slugify('GABRIEL ARAUJO')).toBe('gabriel-araujo'))
  it('strips special chars', () => expect(slugify('Maria, & "Eduarda"!')).toBe('maria-eduarda'))
  it('truncates to maxLen', () => expect(slugify('a'.repeat(100), 10)).toHaveLength(10))
  it('removes leading/trailing dashes', () => expect(slugify('-foo-')).toBe('foo'))
})
```

---

### 15. `src/lib/__tests__/csv-export.test.ts`

**Analog estrutural:** `icp-dinamico.test.ts` + mocks de `pdf-mocks.ts` (Papa + JSZip).

**Casos para Phase 8:**
- "UTF-8 BOM presente no início de cada CSV"
- "papaparse chamado com `quotes: true`"
- "sanitizeCell prefixa `=` `+` `-` `@` com apóstrofo" (T-08-03 RESEARCH)
- "3 entries no ZIP: leads.csv, tarefas.csv, contratos.csv"
- "URL.createObjectURL chamado + revokeObjectURL chamado após click" (T-08-08)

---

### 16. `src/types/index.ts` (MODIFIED)

**Analog:** o próprio arquivo (`src/types/index.ts:1-130`) já contém interfaces de domínio (`Lead`, `Cliente`, `Contrato`, etc.).

**Existing pattern** (line 1, 52, 72): `export interface X { ... }`.

**Para Phase 8 — adicionar (D-10):**
```typescript
export interface DesempenhoMetricas {
  perfilId: string
  perfilNome: string
  periodo: PeriodValue            // import type { PeriodValue } from '@/lib/periods'
  leads_criados: number
  convertidos: number
  perdidos: number
  ciclo_medio_dias: number | null
  win_rate: number                // 0-100
  icp_fit_medio: number | null
  tarefas_concluidas: number
  nps_medio: number | null
}

export interface DesempenhoConsultorTeam {
  perfilId: string
  perfilNome: string
  metricas: DesempenhoMetricas
}
```

**Importação cruzada** (CLAUDE.md `## TypeScript`): `import type { PeriodValue } from '@/lib/periods'` — alias `@/*` obrigatório.

---

### 17. `src/router.tsx` (MODIFIED)

**Analog:** o próprio `src/router.tsx:80-91` — grupo de rotas `/me/*` já existente.

**Existing pattern** (`src/router.tsx:80-91`):
```tsx
{ path: 'me', element: <MeEspacoPage /> },
{ path: 'me/notificacoes-historico', element: <NotificacoesHistoricoPage /> },
{ path: 'me/preferencias', element: <Navigate to="/me?tab=notificacoes" replace /> },
// ...
```

**Para Phase 8 — adicionar dentro dos children de `AppLayout`** (após linha 91):
```tsx
{ path: 'me/desempenho', element: <MeDesempenhoPage /> },
{ path: 'me/desempenho/:perfilId', element: <MeDesempenhoPage /> },
```
Importar `MeDesempenhoPage` no topo do arquivo (linha ~19 perto do `MeEspacoPage` import).

**NOTA Phase 8:** RequireRole é aplicado **dentro** da página (Pitfall 4 — gate condicional baseado em `params.perfilId !== meuPerfil.id`), NÃO no router. Razão: rota base `/me/desempenho` é livre; `/me/desempenho/:perfilId` é gated quando perfil ≠ self.

---

### 18. `src/pages/AdocaoPage.tsx` (MODIFIED)

**Analog:** a si mesma para drill (`hover:bg-[var(--alpha-bg-xs)]` já existe nas rows) + `src/pages/ReceitaPage.tsx` para botão+navigate.

**Existing row pattern** (`src/pages/AdocaoPage.tsx:53`):
```tsx
<tr key={p.id} className="hover:bg-[var(--alpha-bg-xs)] transition-colors">
```

**Para Phase 8 — modificar para clickable** (D-08):
```tsx
<tr
  key={p.id}
  className="hover:bg-[var(--alpha-bg-xs)] cursor-pointer transition-colors"
  onClick={() => navigate(`/me/desempenho/${p.id}`)}
>
```
Adicionar `import { useNavigate } from 'react-router-dom'` + `const navigate = useNavigate()` em `AdocaoContent()`.

**Adicionar botão "Exportar PDF equipe"** (D-07) no header, à direita do título:
```tsx
<div className="flex items-center justify-between">
  <h1 className="text-xl font-bold text-foreground">Adoção</h1>
  <RequireRole atLeast="coordenador" fallback={null}>
    <ExportarPDFEquipeButton />
  </RequireRole>
</div>
```
A `AdocaoContent` já está wrapped em `RequireRole atLeast="coordenador"` na linha 104 — o button interno pode ou não duplicar; pelo CLAUDE.md `## Auth & Role Gating`, defesa em camadas é OK.

---

### 19. `src/components/me/PerfilPanel.tsx` (MODIFIED)

**Analog:** o próprio arquivo (`src/components/me/PerfilPanel.tsx`).

**Para Phase 8** — adicionar bloco "Ver desempenho" no fim do form (após o botão "Salvar perfil" line 132-140):
```tsx
import { Link } from 'react-router-dom'  // novo import
// ...

<Link
  to="/me/desempenho"
  className="inline-flex items-center gap-2 text-sm text-cyan-500 hover:text-cyan-400 mt-4"
>
  <BarChart3 className="w-4 h-4" />
  Ver meu desempenho →
</Link>
```
Importar `BarChart3` de `lucide-react` (já usado no `DashboardPage.tsx:15`).

Discovery sem nav pollution (D-09).

---

### 20. `src/components/layout/GlobalSearch.tsx` (MODIFIED)

**Analog:** o próprio arquivo.

**Existing `ResultItem` + `CATEGORY_META` pattern** (`src/components/layout/GlobalSearch.tsx:14-31`):
```typescript
interface ResultItem {
  id: string
  label: string
  sublabel?: string
  path: string
  category: string
}

const CATEGORY_META: Record<string, { icon: React.FC<{ className?: string }>; color: string; bgStyle: string }> = {
  Leads: { icon: KanbanSquare, color: 'text-indigo-400', bgStyle: 'rgba(99,102,241,0.15)' },
  // ...
}
```

**Para Phase 8 — adicionar:**
```typescript
const STATIC_PAGES: ResultItem[] = [
  { id: 'page-desempenho', label: 'Desempenho', sublabel: 'Meu relatório de performance', path: '/me/desempenho', category: 'Páginas' },
]
// Add 'Páginas' to CATEGORY_META:
'Páginas': { icon: LayoutDashboard, color: 'text-cyan-400', bgStyle: 'rgba(6,182,212,0.15)' },
```

**E no compose** (linha 86-119):
```typescript
const results: ResultItem[] = q
  ? [
      ...STATIC_PAGES.filter(p => p.label.toLowerCase().includes(q) || p.sublabel?.toLowerCase().includes(q)),
      ...leads.filter(/* ... existente ... */),
      // ...
    ]
  : []
```

---

### 21. `package.json` + `package-lock.json` (MODIFIED)

Sem analog — adicionar:
```bash
npm install jspdf@^2.5 html2canvas@^1.4 papaparse@^5.4 jszip@^3.10
npm install -D @types/papaparse
```

`@types/jszip` NÃO necessário (RESEARCH `### Installation`); jspdf e html2canvas shipam types embutidos.

`.npmrc` (já existe `legacy-peer-deps=true`) cobre React 19 vs peers React 18.

---

### 22. `src/components/mensagens/BlocoEditorModal.tsx` (MODIFIED — refactor)

**Mudança trivial** — após criar `src/lib/slug.ts`:
1. Remover lines 32-40 (função privada `slugify`).
2. Adicionar `import { slugify } from '@/lib/slug'` no topo (perto dos outros `@/lib/*` imports).
3. Verificar que call sites internos continuam usando `slugify(...)` (signature compatível — mas `maxLen` agora default 48 em vez de 32; passar `slugify(input, 32)` para preservar comportamento exato).

---

## Shared Patterns

### Auth & Role Gating

**Source:** `src/components/shared/RequireRole.tsx` + `src/hooks/useCurrentRole.ts` (referenciado em CLAUDE.md).

**Apply to:** Phase 8 — `MeDesempenhoPage` (condicional), `ExportarPDFEquipeButton` em `AdocaoPage` (`atLeast="coordenador"`).

```tsx
<RequireRole atLeast="coordenador" fallback={null}>
  <ExportarPDFEquipeButton />
</RequireRole>
```

`useCurrentRole` expõe `meetsMin(atLeast)` para guarda imperativa (CLAUDE.md `## Key Abstractions / Role gating`).

---

### Error Handling

**Source:** CLAUDE.md `## Error Handling` + `src/components/me/PerfilPanel.tsx:60-68` (try/catch + toast PT-BR).

**Apply to:** todos os botões de export.

```typescript
try {
  await gerarRelatorioIndividual(rootEl, metrics)
  toast.success('PDF gerado')
} catch (e: unknown) {
  toast.error(e instanceof Error ? e.message : 'Erro ao gerar PDF')
}
```

**Padrão para AbortError** (RESEARCH §Pattern 4):
```typescript
if ((e as DOMException).name === 'AbortError') toast('Geração cancelada')
else toast.error('Erro ao gerar PDF da equipe')
```

---

### Theme Toggle During Capture

**Source:** `src/contexts/ThemeContext.tsx` aplica classes `light`/`dark` ao `<html>`. **NÃO** observa mutações externas — toggle externo é safe.

**Apply to:** `pdf-export.ts::gerarRelatorioIndividual` + `gerarRelatorioEquipe`.

```typescript
const html = document.documentElement
const wasDark = html.classList.contains('dark')
if (wasDark) { html.classList.remove('dark'); html.classList.add('light') }
try {
  // capture loop
} finally {
  if (wasDark) { html.classList.remove('light'); html.classList.add('dark') }
}
```

**CRITICAL:** `finally` obrigatório — Pitfall 5 RESEARCH (cancel mid-export deixa app em light permanente).

---

### Lazy Import (Vite Code Splitting)

**Source:** RESEARCH §Pattern 11 (não há precedente local — Phase 8 introduz).

**Apply to:** `pdf-export.ts`, `csv-export.ts`.

```typescript
const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
  import('jspdf'),
  import('html2canvas'),
])
```

**Verificação:** após implementação, rodar `npm run build` e confirmar que `dist/assets/` tem chunks `jspdf-*.js`, `html2canvas-*.js`, `papaparse-*.js`, `jszip-*.js` separados. Bundle inicial NÃO deve crescer ~180KB.

---

### Recharts Animations Off (PDF capture)

**Source:** `src/pages/ReceitaPage.tsx:312,320,330` — usa `isAnimationActive={false}` em produção para evitar reflow distractings. Em PDF é CRITICAL (Pitfall 1 RESEARCH).

**Apply to:** Todos os charts dentro de `DesempenhoReport.tsx` e `DesempenhoTeamReport.tsx`.

```tsx
<Line isAnimationActive={false} ... />
<Bar isAnimationActive={false} ... />
<Pie isAnimationActive={false} ... />
```

---

### Test Mocks Style

**Source:** `src/test/storage-mocks.ts` (Phase 7) — define o style canônico de Phase 8.

**Apply to:** `src/test/pdf-mocks.ts`.

Pattern:
- Header comment explica o propósito + referencia ao predecessor.
- `type Restore = () => void`.
- Interface `MockXOptions` + interface `MockXResult` + função `mockX(opts)`.
- Cada `vi.fn()` exposto em `.fn` properties no result para spy em testes.
- `restore` invoca `mockReset()` em cada fn.

---

## No Analog Found

| File | Reason |
|------|--------|
| `src/lib/pdf-export.ts` | Primeiro fluxo PDF do projeto. Skeleton vem inteiramente de RESEARCH §Pattern 3 + §Pattern 4 (lines 451-568). |
| `src/lib/csv-export.ts` | Primeiro fluxo CSV+ZIP do projeto. Skeleton de RESEARCH §Pattern 5 (lines 614-694). |

Para esses, o planner DEVE colar quase verbatim o skeleton do RESEARCH ajustando 2-space indent e single quotes para alinhar com CODE STYLE (CLAUDE.md `## Code Style`).

---

## Open Questions Inherited from RESEARCH

Estas questões NÃO são resolvidas em PATTERNS — apenas marcadas para o planner endereçar antes de codar:

1. **Como derivar "clientes do consultor"?** (RESEARCH OQ-1 / A1) — `Cliente.responsavel_id` não existe; provável via `Contrato.responsavel_id`. Decisão impacta `calcularDesempenho` signature.
2. **Versão final do jspdf** (RESEARCH OQ-2 / A2) — usar `^2.5.2` (CONTEXT D-01 literal) ou bump para `^4.2`?
3. **Charts no PDF página 3** (RESEARCH OQ-3) — ICP fit como sparkline ou KPI grande?
4. **Sumário ranqueado team report** (RESEARCH OQ-5) — colunas exatas.
5. **Mobile UX team report** (RESEARCH OQ-6) — Android também warn?

Planner deve resolver antes do Plan 1 ou registrar como assumed defaults.

---

## Metadata

**Analog search scope:**
- `src/lib/**` (helpers + tests)
- `src/components/**` (UI patterns)
- `src/pages/**` (page composition)
- `src/test/**` (mock infra)
- `src/types/**` (type definitions)
- `src/router.tsx`, `src/contexts/ThemeContext.tsx`

**Files scanned (Read):** 12 (icp-dinamico.ts, icp-dinamico.test.ts, ReceitaPage.tsx, DashboardPage.tsx, RequireRole.tsx, PeriodSelector.tsx, periods.ts, router.tsx, AdocaoPage.tsx, GlobalSearch.tsx, BlocoEditorModal.tsx, storage-mocks.ts, PerfilPanel.tsx, types/index.ts, constants.ts).

**Files scanned (Grep):** ~30 (slugify, TERMINAL_WON_STAGES, mocks, components/me).

**Pattern extraction date:** 2026-05-29

---

## PATTERN MAPPING COMPLETE

**Phase:** 8 — Individual Performance Reports
**Files classified:** 22 (13 NEW + 7 MODIFIED + 2 package files)
**Analogs found:** 20 / 22

### Coverage
- Files with exact analog: 14
- Files with role-match analog: 6
- Files with no analog: 2 (`pdf-export.ts`, `csv-export.ts` — patterns vêm de RESEARCH §3-§5)

### Key Patterns Identified
- **Pure helper testável:** `calcularDesempenho` segue exatamente o style de `calcularIcpDinamico` — header comment com regras de negócio, interfaces locais `XxxLike`, `getPeriodRange` + `isInRange` para filtragem, retorno `null` quando denominador é zero.
- **Off-screen portal render:** novo no projeto — `<div data-pdf-root style={{ position: 'fixed', top: '-9999px', width: '794px', background: 'white' }}>` + 3 sub-divs `data-pdf-page="1|2|3"`; obrigatório `isAnimationActive={false}` em recharts.
- **Lazy import + theme toggle:** `await Promise.all([import('jspdf'), import('html2canvas')])` para Vite code splitting + try/finally restaura tema dark após captura.
- **Conditional RequireRole** (Pitfall 4): `/me/desempenho/:perfilId` wrappa em `RequireRole atLeast="coordenador"` SOMENTE quando perfil viewed ≠ self.
- **Test mocks pattern**: `src/test/pdf-mocks.ts` segue style exato de `storage-mocks.ts` (factory + interface MockX + Restore type).
- **Slug extraction**: lift `slugify` privado de `BlocoEditorModal.tsx:32-40` para `src/lib/slug.ts` com escape hex `̀-ͯ` (fix RESEARCH §Pattern 7).

### File Created
`c:\Users\Gabriel\OneDrive\Área de Trabalho\projeto 1\consej-crm-v2\.planning\phases\08-individual-performance-reports\08-PATTERNS.md`

### Ready for Planning
Pattern mapping completo. Planner pode agora referenciar analogs concretos (com line numbers) em cada PLAN.md.
