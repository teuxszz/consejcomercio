import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useContratos, useUpdateContrato, useDeleteContrato } from '@/hooks/useContratos'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { ScopeToggle, type Scope } from '@/components/shared/ScopeToggle'
import { ResponsavelBadge } from '@/components/shared/ResponsavelBadge'
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CONTRACT_TYPES, PRICING_MODELS, RM_STATUS_OPTIONS } from '@/lib/constants'
import { formatDate, formatCurrency, getContractProgress, getDaysUntilExpiry } from '@/lib/utils'
import { Search, AlertCircle, X, Pencil, Save, FileText, Mail, Plus, Trash2, Send, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Contrato } from '@/types'
import { toast } from 'sonner'

function RelatorioContratoModal({ contrato, onClose }: { contrato: Contrato; onClose: () => void }) {
  const [emails, setEmails] = useState<string[]>(contrato.cliente?.email ? [contrato.cliente.email] : [''])

  function addEmail() { setEmails(prev => [...prev, '']) }
  function removeEmail(i: number) { setEmails(prev => prev.filter((_, idx) => idx !== i)) }
  function updateEmail(i: number, v: string) { setEmails(prev => prev.map((e, idx) => idx === i ? v : e)) }

  const validEmails = emails.filter(e => e.includes('@'))

  const tipoLabel    = CONTRACT_TYPES.find(t => t.value === contrato.tipo)?.label ?? contrato.tipo
  const modeloLabel  = PRICING_MODELS.find(m => m.value === contrato.modelo_precificacao)?.label ?? contrato.modelo_precificacao
  const areasLabel   = contrato.areas_direito?.map(a => a.replace(/_/g, ' ')).join(', ') || '—'
  const valorTotal   = contrato.valor_total ? formatCurrency(contrato.valor_total) : '—'
  const valorMensal  = contrato.valor_mensal ? formatCurrency(contrato.valor_mensal) : '—'

  const subject = encodeURIComponent(`Relatório de Contrato — ${contrato.cliente?.nome ?? 'Cliente'}`)
  const body = encodeURIComponent([
    `=== RELATÓRIO DE CONTRATO FECHADO ===`,
    ``,
    `CLIENTE`,
    `Nome: ${contrato.cliente?.nome ?? '—'}`,
    `Empresa: ${contrato.cliente?.empresa ?? '—'}`,
    ``,
    `CONTRATO`,
    `Tipo: ${tipoLabel}`,
    `Modelo de Precificação: ${modeloLabel}`,
    `Áreas do Direito: ${areasLabel}`,
    `Valor Total: ${valorTotal}`,
    `Valor Mensal: ${valorMensal}`,
    `Início: ${formatDate(contrato.data_inicio)}`,
    `Término: ${formatDate(contrato.data_fim)}`,
    contrato.notas ? `\nObservações: ${contrato.notas}` : '',
    ``,
    `Relatório gerado pelo CONSEJ CRM.`,
  ].filter(l => l !== undefined).join('\n'))

  const mailto = `mailto:${validEmails.join(',')}?subject=${subject}&body=${body}`

  function handleSend() {
    window.location.href = mailto
    toast.success('Relatório aberto no cliente de e-mail')
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground" />
            Enviar Relatório por E-mail
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Preview */}
          <div className="bg-background rounded-lg p-4 text-xs text-fg2 space-y-1 font-mono border max-h-52 overflow-y-auto">
            <p className="font-bold text-muted-foreground mb-2 not-italic font-sans text-[10px] uppercase tracking-wider">Prévia do relatório</p>
            <p className="font-semibold">Cliente: {contrato.cliente?.nome}</p>
            <p>Empresa: {contrato.cliente?.empresa}</p>
            <p className="mt-2 font-semibold">Contrato: {tipoLabel}</p>
            <p>Modelo: {modeloLabel}</p>
            <p>Áreas: {areasLabel}</p>
            <p>Valor Total: {valorTotal}</p>
            {contrato.valor_mensal ? <p>Valor Mensal: {valorMensal}</p> : null}
            <p>Vigência: {formatDate(contrato.data_inicio)} → {formatDate(contrato.data_fim)}</p>
            {contrato.notas && <p className="mt-1 text-muted-foreground">Obs: {contrato.notas}</p>}
          </div>

          {/* Email inputs */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-fg2">Destinatários</p>
            {emails.map((email, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  type="email"
                  placeholder="email@empresa.com"
                  value={email}
                  onChange={e => updateEmail(i, e.target.value)}
                  className="flex-1"
                />
                {emails.length > 1 && (
                  <button onClick={() => removeEmail(i)} className="p-1.5 text-fg4 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addEmail} className="flex items-center gap-1 text-xs text-fg4 hover:text-muted-foreground transition-colors">
              <Plus className="w-3 h-3" /> Adicionar destinatário
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSend}
            disabled={validEmails.length === 0}
            className="gap-1.5"
            style={{ backgroundColor: '#0089ac' }}
          >
            <Send className="w-3.5 h-3.5" />
            Abrir no E-mail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ContratoModal({ contrato, onClose }: { contrato: Contrato; onClose: () => void }) {
  const update = useUpdateContrato()
  const deleteContrato = useDeleteContrato()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showRelatorio, setShowRelatorio] = useState(false)
  const [tipo, setTipo] = useState(contrato.tipo)
  const [modelo, setModelo] = useState(contrato.modelo_precificacao)
  const [valorTotal, setValorTotal] = useState(String(contrato.valor_total ?? ''))
  const [valorMensal, setValorMensal] = useState(String(contrato.valor_mensal ?? ''))
  const [dataInicio, setDataInicio] = useState(contrato.data_inicio?.slice(0, 10) ?? '')
  const [dataFim, setDataFim] = useState(contrato.data_fim?.slice(0, 10) ?? '')
  const [rmStatus, setRmStatus] = useState(contrato.rm_status)
  const [notas, setNotas] = useState(contrato.notas ?? '')

  const daysLeft = getDaysUntilExpiry(contrato.data_fim)
  const progress = getContractProgress(contrato.data_inicio, contrato.data_fim)
  const rmInfo = RM_STATUS_OPTIONS.find(r => r.value === contrato.rm_status)

  async function handleSave() {
    try {
      await update.mutateAsync({
        id: contrato.id,
        tipo,
        modelo_precificacao: modelo,
        valor_total: valorTotal ? parseFloat(valorTotal) : undefined,
        valor_mensal: valorMensal ? parseFloat(valorMensal) : undefined,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        rm_status: rmStatus,
        notas: notas || undefined,
      })
      toast.success('Contrato atualizado!')
      setEditing(false)
    } catch { toast.error('Erro ao salvar') }
  }

  const field = (label: string, value: React.ReactNode) => (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value || '—'}</p>
    </div>
  )

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{contrato.cliente?.nome}</h2>
            <p className="text-sm text-muted-foreground">{contrato.cliente?.empresa}</p>
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <>
                <button onClick={() => setShowRelatorio(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm text-muted-foreground hover:bg-background">
                  <Mail className="w-3.5 h-3.5" />Relatório
                </button>
                <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm text-muted-foreground hover:bg-background">
                  <Pencil className="w-3.5 h-3.5" />Editar
                </button>
                <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded-lg border border-transparent hover:border-red-500/30 text-fg4 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button onClick={handleSave} disabled={update.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: '#0089ac' }}>
                <Save className="w-3.5 h-3.5" />{update.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--alpha-bg-xs)] text-fg4"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-fg4 mb-1.5">
              <span>{formatDate(contrato.data_inicio)}</span>
              <span className="font-medium text-muted-foreground">{progress}% concluído</span>
              <span>{formatDate(contrato.data_fim)}</span>
            </div>
            <Progress value={progress} className="h-2" />
            {daysLeft !== null && daysLeft <= 30 && (
              <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{daysLeft} dias para vencer
              </p>
            )}
          </div>

          {/* Info grid */}
          {!editing ? (
            <div className="grid grid-cols-2 gap-4">
              {field('Tipo', CONTRACT_TYPES.find(t => t.value === contrato.tipo)?.label)}
              {field('Modelo', PRICING_MODELS.find(m => m.value === contrato.modelo_precificacao)?.label)}
              {field('Valor Total', contrato.valor_total ? formatCurrency(contrato.valor_total) : null)}
              {field('Valor Mensal', contrato.valor_mensal ? formatCurrency(contrato.valor_mensal) : null)}
              {field('Início', formatDate(contrato.data_inicio))}
              {field('Término', formatDate(contrato.data_fim))}
              {field('Status RM', rmInfo?.label)}
              {field('Áreas', contrato.areas_direito?.join(', '))}
              {contrato.notas && <div className="col-span-2">{field('Notas', contrato.notas)}</div>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Tipo', value: tipo, setter: setTipo, options: CONTRACT_TYPES },
                { label: 'Modelo', value: modelo, setter: setModelo, options: PRICING_MODELS },
              ].map(({ label, value, setter, options }) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                  <select value={value} onChange={e => setter(e.target.value)}
                    className="form-control">
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
              {[
                { label: 'Valor Total (R$)', value: valorTotal, setter: setValorTotal },
                { label: 'Valor Mensal (R$)', value: valorMensal, setter: setValorMensal },
                { label: 'Data Início', value: dataInicio, setter: setDataInicio, type: 'date' },
                { label: 'Data Término', value: dataFim, setter: setDataFim, type: 'date' },
              ].map(({ label, value, setter, type }) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                  <input type={type ?? 'text'} value={value} onChange={e => setter(e.target.value)}
                    className="form-control" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Status RM</label>
                <select value={rmStatus} onChange={e => setRmStatus(e.target.value)}
                  className="form-control">
                  {RM_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notas</label>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
                  className="form-control resize-none" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    {showRelatorio && (
      <RelatorioContratoModal contrato={contrato} onClose={() => setShowRelatorio(false)} />
    )}
    <DeleteConfirmDialog
      open={confirmDelete}
      onClose={() => setConfirmDelete(false)}
      entidadeTipo="contrato"
      entidadeId={contrato.id}
      entidadeLabel={`Contrato — ${contrato.cliente?.nome ?? 'Cliente'} (${contrato.cliente?.empresa ?? ''})`}
      onConfirm={async () => {
        await deleteContrato.mutateAsync({ id: contrato.id, clienteId: contrato.cliente_id })
        setConfirmDelete(false)
        onClose()
      }}
    />
    </>
  )
}

type TipoFilter   = 'todos' | 'assessoria' | 'consultoria'
type StatusFilter = 'todos' | 'ativo' | 'encerrado'
type RMFilter     = 'todos' | string
type ContratoSort = 'padrao' | 'vencimento' | 'valor' | 'progresso'

const TIPO_TABS: { value: TipoFilter; label: string; activeColor: string }[] = [
  { value: 'todos',       label: 'Todos',       activeColor: '#0089ac' },
  { value: 'assessoria',  label: 'Assessoria',  activeColor: '#06b6d4' },
  { value: 'consultoria', label: 'Consultoria', activeColor: '#8b5cf6' },
]

const STATUS_CONTRACT_TABS: { value: StatusFilter; label: string; activeColor: string }[] = [
  { value: 'todos',     label: 'Todos',      activeColor: '#0089ac' },
  { value: 'ativo',     label: 'Ativos',     activeColor: '#10b981' },
  { value: 'encerrado', label: 'Encerrados', activeColor: '#6b7280' },
]

const SORT_OPTIONS: { value: ContratoSort; label: string }[] = [
  { value: 'padrao',     label: 'Padrão (mais recente)' },
  { value: 'vencimento', label: 'Vencimento (mais urgente)' },
  { value: 'valor',      label: 'Valor (maior → menor)' },
  { value: 'progresso',  label: 'Progresso (mais avançado)' },
]

export function ContratosPage() {
  const { data: contratos, isLoading } = useContratos()
  const { data: meuPerfil } = useMeuPerfil()
  const [scope, setScope]             = useState<Scope>('all')
  const [search, setSearch]           = useState('')
  const [tipoFilter, setTipoFilter]   = useState<TipoFilter>('todos')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [rmFilter, setRmFilter]       = useState<RMFilter>('todos')
  const [sortBy, setSortBy]           = useState<ContratoSort>('padrao')
  const [selected, setSelected]       = useState<Contrato | null>(null)
  const [searchParams]                = useSearchParams()

  // Drill-down de /receita: ?vencendo_em_dias=N filtra contratos com data_fim em [hoje, hoje+N].
  // Parse defensivo (ASVS V5): valores não-inteiros, negativos ou > 365 são ignorados silenciosamente.
  const vencendoEmDias = useMemo<number | null>(() => {
    const raw = searchParams.get('vencendo_em_dias')
    if (raw === null) return null
    const n = Number(raw)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 365) return null
    return n
  }, [searchParams])

  const mineCount = meuPerfil?.id ? (contratos?.filter(c => c.responsavel_id === meuPerfil.id).length ?? 0) : 0

  const filtered = useMemo(() => {
    let list = contratos ?? []
    if (scope === 'mine' && meuPerfil?.id)
      list = list.filter(c => c.responsavel_id === meuPerfil.id)
    if (search)
      list = list.filter(c => c.cliente?.nome?.toLowerCase().includes(search.toLowerCase()) || c.cliente?.empresa?.toLowerCase().includes(search.toLowerCase()))
    if (tipoFilter !== 'todos')
      list = list.filter(c => c.tipo === tipoFilter)
    if (statusFilter !== 'todos')
      list = list.filter(c => c.status === statusFilter)
    if (rmFilter !== 'todos')
      list = list.filter(c => c.rm_status === rmFilter)
    if (vencendoEmDias !== null)
      list = list.filter(c => {
        const d = getDaysUntilExpiry(c.data_fim)
        return d !== null && d >= 0 && d <= vencendoEmDias
      })

    list = [...list]
    if (sortBy === 'vencimento') {
      list.sort((a, b) => {
        const da = a.data_fim ? new Date(a.data_fim).getTime() : Infinity
        const db = b.data_fim ? new Date(b.data_fim).getTime() : Infinity
        return da - db
      })
    } else if (sortBy === 'valor') {
      list.sort((a, b) => (b.valor_total ?? 0) - (a.valor_total ?? 0))
    } else if (sortBy === 'progresso') {
      list.sort((a, b) => getContractProgress(b.data_inicio, b.data_fim) - getContractProgress(a.data_inicio, a.data_fim))
    }
    return list
  }, [contratos, scope, meuPerfil, search, tipoFilter, statusFilter, rmFilter, vencendoEmDias, sortBy])

  const expiringSoon = filtered.filter(c => {
    const d = getDaysUntilExpiry(c.data_fim)
    return d !== null && d <= 30 && d >= 0
  })

  return (
    <div>
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Contratos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Acompanhe contratos, prazos e status de Registro de Marca</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 mt-1">
          <ScopeToggle value={scope} onChange={setScope} mineCount={mineCount} allCount={contratos?.length ?? 0} />
          <Badge variant="secondary">{filtered.length} contrato{filtered.length !== 1 ? 's' : ''}</Badge>
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <div className="mb-4 p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: 'rgba(255,130,130,0.90)' }}>
            <strong>{expiringSoon.length} contrato(s)</strong> vence{expiringSoon.length === 1 ? '' : 'm'} nos próximos 30 dias.
          </p>
        </div>
      )}

      <div className="space-y-2 mb-5">
        {/* Row 1: search + tipo + status */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por cliente…" className="w-56" />

          {/* Tipo */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-fg4 mr-0.5">Tipo:</span>
            {TIPO_TABS.map(tab => {
              const count = tab.value === 'todos' ? (contratos?.length ?? 0) : (contratos?.filter(c => c.tipo === tab.value).length ?? 0)
              const isActive = tipoFilter === tab.value
              return (
                <button key={tab.value} onClick={() => setTipoFilter(tab.value)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border"
                  style={isActive ? { backgroundColor: `${tab.activeColor}22`, borderColor: `${tab.activeColor}55`, color: tab.activeColor } : { backgroundColor: 'transparent', borderColor: 'var(--alpha-bg-md)', color: 'var(--text-soft-a)' }}
                >
                  {tab.label} <span className="tabular-nums text-[10px]">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Status */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-fg4 mr-0.5">Status:</span>
            {STATUS_CONTRACT_TABS.map(tab => {
              const count = tab.value === 'todos' ? (contratos?.length ?? 0) : (contratos?.filter(c => c.status === tab.value).length ?? 0)
              const isActive = statusFilter === tab.value
              return (
                <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border"
                  style={isActive ? { backgroundColor: `${tab.activeColor}22`, borderColor: `${tab.activeColor}55`, color: tab.activeColor } : { backgroundColor: 'transparent', borderColor: 'var(--alpha-bg-md)', color: 'var(--text-soft-a)' }}
                >
                  {tab.label} <span className="tabular-nums text-[10px]">{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Row 2: RM filter + sort */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-fg4">RM:</span>
          {[{ value: 'todos', label: 'Todos', color: '#0089ac' }, ...RM_STATUS_OPTIONS.map(r => ({ value: r.value, label: r.label, color: '#0089ac' }))].map(tab => {
            const count = tab.value === 'todos' ? (contratos?.length ?? 0) : (contratos?.filter(c => c.rm_status === tab.value).length ?? 0)
            const isActive = rmFilter === tab.value
            const rmOpt = RM_STATUS_OPTIONS.find(r => r.value === tab.value)
            const accentColor = tab.value === 'possivel' ? '#10b981' : tab.value === 'em_andamento' ? '#f59e0b' : tab.value === 'registrado' ? '#3b82f6' : tab.value === 'verificar' ? '#ef4444' : tab.value === 'nao_aplicavel' ? '#64748b' : '#0089ac'
            return (
              <button key={tab.value} onClick={() => setRmFilter(tab.value)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border"
                style={isActive ? { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55`, color: accentColor } : { backgroundColor: 'transparent', borderColor: 'var(--alpha-bg-md)', color: 'var(--text-soft-a)' }}
              >
                {tab.label} <span className="tabular-nums text-[10px]">{count}</span>
              </button>
            )
          })}

          {/* Sort */}
          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-fg4" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as ContratoSort)}
              className="h-7 px-2.5 text-xs rounded-lg border focus:outline-none"
              style={{ background: 'var(--alpha-bg-xs)', borderColor: 'var(--alpha-border-md)', color: 'var(--text-soft-a)' }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl p-4 animate-pulse" style={{ border: '1px solid var(--alpha-border)' }}>
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-[var(--alpha-border)] rounded w-48" />
                  <div className="h-3 bg-[var(--alpha-bg-xs)] rounded w-64" />
                  <div className="h-2 bg-[var(--alpha-bg-xs)] rounded w-full mt-3" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-4 bg-[var(--alpha-border)] rounded w-20" />
                  <div className="h-3 bg-[var(--alpha-bg-xs)] rounded w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <EmptyState
              icon={FileText}
              title={search ? 'Nenhum contrato encontrado' : 'Nenhum contrato cadastrado'}
              description={
                search
                  ? `Não encontramos contratos para "${search}".`
                  : 'Os contratos criados a partir de oportunidades convertidas aparecerão aqui.'
              }
            />
          )}
          {filtered.map(contrato => {
            const daysLeft = getDaysUntilExpiry(contrato.data_fim)
            const progress = getContractProgress(contrato.data_inicio, contrato.data_fim)
            const isExpiring = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0
            const rmInfo = RM_STATUS_OPTIONS.find(r => r.value === contrato.rm_status)

            return (
              <Card key={contrato.id}
                className="cursor-pointer transition-all"
                style={isExpiring ? { borderColor: 'rgba(249,115,22,0.35)', background: 'rgba(249,115,22,0.04)' } : {}}
                onClick={() => setSelected(contrato)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-foreground">{contrato.cliente?.nome} — {contrato.cliente?.empresa}</p>
                        {isExpiring && (
                          <span className="text-xs text-orange-600 font-medium flex items-center gap-0.5">
                            <AlertCircle className="w-3 h-3" /> {daysLeft}d
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {CONTRACT_TYPES.find(t => t.value === contrato.tipo)?.label} · {PRICING_MODELS.find(m => m.value === contrato.modelo_precificacao)?.label}
                      </p>
                      <div className="mt-1.5">
                        <ResponsavelBadge perfilId={contrato.responsavel_id} size={20} />
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {contrato.areas_direito?.map(a => (
                          <span key={a} className="text-xs bg-[var(--alpha-bg-xs)] text-muted-foreground px-1.5 py-0.5 rounded">{a.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-fg4 mb-1">
                          <span>{formatDate(contrato.data_inicio)}</span>
                          <span>{formatDate(contrato.data_fim)}</span>
                        </div>
                        <Progress value={progress} className={cn('h-1.5', isExpiring && '[&>div]:bg-orange-500')} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {contrato.valor_total && <p className="font-bold text-foreground">{formatCurrency(contrato.valor_total)}</p>}
                      {rmInfo && <span className={cn('text-xs px-1.5 py-0.5 rounded border block mt-1', rmInfo.color)}>RM: {rmInfo.label}</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {selected && <ContratoModal contrato={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
