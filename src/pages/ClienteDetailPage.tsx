import { useParams, useNavigate } from 'react-router-dom'
import { useCliente, useUpdateCliente } from '@/hooks/useClientes'
import { useContratosByCliente, useDeleteContrato } from '@/hooks/useContratos'
import { useIndicacoes } from '@/hooks/useIndicacoes'
import { useOportunidades } from '@/hooks/useOportunidades'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Plus, AlertCircle, Trash2, Star, Shield, UserCheck, Pencil, X, Check, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useUpdateClienteNPS } from '@/hooks/useClientes'
import { useUpdateContrato } from '@/hooks/useContratos'
import {
  CONTRACT_TYPES, PRICING_MODELS, CLIENT_STATUS_OPTIONS, RM_STATUS_OPTIONS,
  OPORTUNIDADE_STATUS, SERVICE_AREAS, SEGMENTS, ESTADOS_BR,
} from '@/lib/constants'
import { formatDate, formatCurrency, getContractProgress, getDaysUntilExpiry } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { NewContratoModal } from '@/components/contratos/NewContratoModal'
import { ActivityTimeline } from '@/components/shared/ActivityTimeline'
import type { Cliente, TagDoc } from '@/types'
// ─── Phase 7 — Client Portal Expansion (Plan 07-03) ────────────────────────
import { useClienteDocs, useUploadClienteDoc } from '@/hooks/useClienteDocs'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { UploadDropzone } from '@/components/clientes/UploadDropzone'
import { ClienteDocsList } from '@/components/clientes/ClienteDocsList'
import { SubirNovaVersaoButton } from '@/components/clientes/SubirNovaVersaoButton'
import { DocVersionTimeline } from '@/components/clientes/DocVersionTimeline'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

const CONTRACT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ativo:     { label: 'Ativo',     color: 'text-emerald-400 bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.25)]' },
  encerrado: { label: 'Encerrado', color: 'text-muted-foreground bg-[var(--alpha-bg-xs)]' },
  suspenso:  { label: 'Suspenso',  color: 'text-amber-400 bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.25)]' },
}

// ─── Edit form ────────────────────────────────────────────────────────────────

function EditDadosForm({
  cliente,
  onCancel,
}: {
  cliente: Cliente
  onCancel: () => void
}) {
  const updateCliente = useUpdateCliente()
  const [nome, setNome]         = useState(cliente.nome ?? '')
  const [empresa, setEmpresa]   = useState(cliente.empresa ?? '')
  const [segmento, setSegmento] = useState(cliente.segmento ?? '')
  const [telefone, setTelefone] = useState(cliente.telefone ?? '')
  const [email, setEmail]       = useState(cliente.email ?? '')
  const [status, setStatus]     = useState(cliente.status ?? 'ativo')
  const [estado, setEstado]     = useState(cliente.estado ?? '')
  const [notas, setNotas]       = useState(cliente.notas ?? '')

  function handleSave() {
    if (!nome.trim() || !empresa.trim()) return
    updateCliente.mutate(
      {
        id: cliente.id, nome, empresa, segmento,
        telefone: telefone || null, email: email || null,
        status, estado: estado || null, notas: notas || null,
      },
      { onSuccess: onCancel },
    )
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-foreground">Editar dados do cliente</p>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nome *</label>
            <input value={nome} onChange={e => setNome(e.target.value)} className="form-control" placeholder="Nome do responsável" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Empresa *</label>
            <input value={empresa} onChange={e => setEmpresa(e.target.value)} className="form-control" placeholder="Nome da empresa" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Telefone</label>
            <input value={telefone} onChange={e => setTelefone(e.target.value)} className="form-control" placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">E-mail</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="form-control" placeholder="email@empresa.com" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="form-control">
              {CLIENT_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Segmento</label>
            <select value={segmento} onChange={e => setSegmento(e.target.value)} className="form-control">
              <option value="">Selecione</option>
              {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Estado (UF)</label>
            <select value={estado} onChange={e => setEstado(e.target.value)} className="form-control">
              <option value="">Selecione</option>
              {ESTADOS_BR.map(e => <option key={e.uf} value={e.uf}>{e.uf} — {e.nome}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Observações</label>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={3}
            className="form-control resize-none"
            placeholder="Notas internas sobre o cliente…"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!nome.trim() || !empresa.trim() || updateCliente.isPending}
            className="bg-primary hover:bg-primary/90 gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            {updateCliente.isPending ? 'Salvando…' : 'Salvar alterações'}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: cliente } = useCliente(id!)
  const { data: contratos } = useContratosByCliente(id!)
  const { data: todasIndicacoes } = useIndicacoes()
  const { data: todasOportunidades } = useOportunidades()
  // Phase 7 — Client Portal Expansion: contador na tab "Documentos"
  const { data: docs } = useClienteDocs(id ?? null)
  const [showNewContrato, setShowNewContrato] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingNps, setEditingNps] = useState(false)
  const [npsInput, setNpsInput] = useState<number>(cliente?.nps_score ?? 0)
  const [editingDados, setEditingDados] = useState(false)
  const deleteContrato = useDeleteContrato()
  const updateNps = useUpdateClienteNPS()
  const updateContrato = useUpdateContrato()

  useEffect(() => { setEditingDados(false) }, [id])

  const indicacoes = todasIndicacoes?.filter(i => i.indicante_cliente_id === id) || []

  async function handleConvidarPortal() {
    if (!cliente?.email) {
      toast.error('Cliente sem e-mail cadastrado. Adicione um e-mail antes de convidar.')
      return
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: cliente.email,
      options: {
        emailRedirectTo: `${window.location.origin}/portal`,
        data: { tipo: 'cliente', cliente_id: cliente.id },
      },
    })
    if (error) toast.error('Erro ao enviar convite. Tente novamente.')
    else toast.success(`Convite enviado para ${cliente.email}`)
  }
  const oportunidades = todasOportunidades?.filter(o => o.cliente_id === id) || []

  if (!cliente) return <div className="text-muted-foreground">Cliente não encontrado.</div>

  const statusInfo = CLIENT_STATUS_OPTIONS.find(s => s.value === cliente.status)

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm mb-5">
        <button onClick={() => navigate('/clientes')} className="text-fg4 hover:text-fg2 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Clientes
        </button>
        <span className="text-fg4">/</span>
        <span className="text-fg2 font-medium truncate">{cliente.nome}</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">{cliente.nome}</h1>
          <p className="text-sm text-muted-foreground">{cliente.empresa}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {statusInfo && (
            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', statusInfo.color)}>
              {statusInfo.label}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleConvidarPortal}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Convidar cliente para o Portal de Indicações"
          >
            <Mail className="w-3.5 h-3.5" />
            Convidar para Portal
          </Button>
        </div>
      </div>

      <Tabs defaultValue="contratos">
        <TabsList className="mb-4">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="contratos">Contratos ({contratos?.length || 0})</TabsTrigger>
          <TabsTrigger value="indicacoes">Indicações ({indicacoes.length})</TabsTrigger>
          <TabsTrigger value="oportunidades">Oportunidades ({oportunidades.length})</TabsTrigger>
          {/* ─── Phase 7 — Client Portal Expansion (Plan 07-03) ──────────── */}
          <TabsTrigger value="documentos">Documentos ({docs?.length || 0})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ── Dados ── */}
        <TabsContent value="dados">
          <div className="space-y-3">
            {editingDados ? (
              <EditDadosForm cliente={cliente} onCancel={() => setEditingDados(false)} />
            ) : (
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informações</p>
                    <button
                      onClick={() => setEditingDados(true)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Telefone', value: cliente.telefone },
                      { label: 'Email', value: cliente.email },
                      { label: 'Segmento', value: SEGMENTS.find(s => s.value === cliente.segmento)?.label ?? cliente.segmento?.replace(/_/g, ' ') },
                      { label: 'Estado', value: cliente.estado ?? null },
                      { label: 'Status', value: statusInfo?.label },
                      { label: 'Cliente desde', value: formatDate(cliente.created_at) },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium text-foreground">{value || '—'}</p>
                      </div>
                    ))}
                    {cliente.indicado_por_cliente && (
                      <div>
                        <p className="text-xs text-muted-foreground">Indicado por</p>
                        <p className="text-sm font-medium text-violet-400 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          {cliente.indicado_por_cliente.nome}
                          <span className="text-fg4 font-normal text-xs">· {cliente.indicado_por_cliente.empresa}</span>
                        </p>
                      </div>
                    )}
                    {cliente.notas && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Observações</p>
                        <p className="text-sm text-fg2 mt-0.5 whitespace-pre-line">{cliente.notas}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* NPS Widget */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400" />
                    <p className="text-sm font-semibold text-fg2">NPS do Cliente</p>
                  </div>
                  {!editingNps ? (
                    <button onClick={() => { setNpsInput(cliente.nps_score ?? 0); setEditingNps(true) }} className="text-xs text-fg4 hover:text-muted-foreground">
                      {cliente.nps_score !== null && cliente.nps_score !== undefined ? 'Atualizar' : 'Registrar'}
                    </button>
                  ) : (
                    <div className="flex gap-1.5">
                      <button onClick={() => { updateNps.mutate({ id: id!, nps_score: npsInput }); setEditingNps(false) }} className="text-xs px-2 py-1 rounded bg-primary text-white">Salvar</button>
                      <button onClick={() => setEditingNps(false)} className="text-xs px-2 py-1 rounded border text-muted-foreground">Cancelar</button>
                    </div>
                  )}
                </div>
                {editingNps ? (
                  <div className="flex gap-1.5 flex-wrap">
                    {Array.from({ length: 11 }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setNpsInput(i)}
                        className={cn(
                          'w-9 h-9 rounded-lg text-sm font-bold border transition-all',
                          npsInput === i
                            ? (i >= 9 ? 'bg-emerald-600 border-emerald-500 text-white' : i >= 7 ? 'bg-amber-500 border-amber-400 text-white' : 'bg-red-600 border-red-500 text-white')
                            : 'border text-muted-foreground hover:border-primary/50'
                        )}
                      >{i}</button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {cliente.nps_score !== null && cliente.nps_score !== undefined ? (
                      <>
                        <span className={cn('text-4xl font-bold', cliente.nps_score >= 9 ? 'text-emerald-400' : cliente.nps_score >= 7 ? 'text-amber-400' : 'text-red-400')}>{cliente.nps_score}</span>
                        <div>
                          <p className={cn('text-sm font-semibold', cliente.nps_score >= 9 ? 'text-emerald-400' : cliente.nps_score >= 7 ? 'text-amber-400' : 'text-red-400')}>
                            {cliente.nps_score >= 9 ? 'Promotor — convidar para indicar' : cliente.nps_score >= 7 ? 'Neutro — aprofundar relacionamento' : 'Detrator — check-in urgente'}
                          </p>
                          {cliente.nps_updated_at && <p className="text-xs text-fg4">Atualizado em {formatDate(cliente.nps_updated_at)}</p>}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-fg4">Nenhum NPS registrado ainda. Clique em "Registrar" para avaliar.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Contratos ── */}
        <TabsContent value="contratos">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setShowNewContrato(true)} className="bg-primary hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5 mr-1" /> Novo Contrato
            </Button>
          </div>
          <div className="space-y-3">
            {contratos?.map(contrato => {
              const daysLeft = getDaysUntilExpiry(contrato.data_fim)
              const progress = getContractProgress(contrato.data_inicio, contrato.data_fim)
              const isExpiring = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0
              const rmInfo = RM_STATUS_OPTIONS.find(r => r.value === contrato.rm_status)
              const statusInfo = CONTRACT_STATUS_LABELS[contrato.status] ?? CONTRACT_STATUS_LABELS['ativo']

              return (
                <Card key={contrato.id} style={isExpiring ? { borderColor: 'rgba(249,115,22,0.35)' } : {}}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">
                            {CONTRACT_TYPES.find(t => t.value === contrato.tipo)?.label} — {PRICING_MODELS.find(m => m.value === contrato.modelo_precificacao)?.label}
                          </p>
                          {contrato.caso_manifesto && (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                              <Shield className="w-3 h-3" /> Caso Manifesto
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {contrato.areas_direito?.map(a => (
                            <span key={a} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full border">
                              {SERVICE_AREAS.find(s => s.value === a)?.label ?? a.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs px-1.5 py-0.5 rounded border', statusInfo.color)}>{statusInfo.label}</span>
                          {deletingId === contrato.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { deleteContrato.mutate({ id: contrato.id, clienteId: contrato.cliente_id }); setDeletingId(null) }}
                                className="text-xs text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 transition-colors"
                                disabled={deleteContrato.isPending}
                              >Confirmar</button>
                              <button onClick={() => setDeletingId(null)} className="text-xs text-muted-foreground px-1">Cancelar</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => updateContrato.mutate({ id: contrato.id, caso_manifesto: !contrato.caso_manifesto })}
                                className={cn('transition-colors p-0.5 rounded', contrato.caso_manifesto ? 'text-amber-400' : 'text-fg4 hover:text-amber-400')}
                                title={contrato.caso_manifesto ? 'Remover Caso Manifesto' : 'Marcar como Caso Manifesto'}
                              >
                                <Shield className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingId(contrato.id)}
                                className="text-fg4 hover:text-red-400 transition-colors p-0.5 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        {rmInfo && <span className={cn('text-xs px-1.5 py-0.5 rounded border', rmInfo.color)}>RM: {rmInfo.label}</span>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Valor Total</p>
                        <p className="text-sm font-bold text-foreground">{contrato.valor_total ? formatCurrency(contrato.valor_total) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Valor Mensal</p>
                        <p className="text-sm font-medium text-fg2">{contrato.valor_mensal ? formatCurrency(contrato.valor_mensal) : '—'}</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatDate(contrato.data_inicio)} → {formatDate(contrato.data_fim)}</span>
                        {isExpiring && (
                          <span className="text-orange-500 font-medium flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {daysLeft}d restantes
                          </span>
                        )}
                        {daysLeft !== null && daysLeft < 0 && (
                          <span className="text-red-500 font-medium text-xs">Expirado</span>
                        )}
                      </div>
                      <Progress value={progress} className={cn('h-1.5', isExpiring && '[&>div]:bg-orange-500')} />
                    </div>

                    {(contrato.observacoes_demanda || contrato.observacoes_vp || contrato.notas) && (
                      <div className="pt-2 border-t space-y-2">
                        {contrato.observacoes_demanda && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Obs. Demandas</p>
                            <p className="text-sm text-fg2 leading-relaxed">{contrato.observacoes_demanda}</p>
                          </div>
                        )}
                        {contrato.observacoes_vp && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Obs. Vice-Presidência</p>
                            <p className="text-sm text-fg2 leading-relaxed">{contrato.observacoes_vp}</p>
                          </div>
                        )}
                        {!contrato.observacoes_demanda && !contrato.observacoes_vp && contrato.notas && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Observações</p>
                            <p className="text-sm text-fg2 leading-relaxed whitespace-pre-line">{contrato.notas}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
            {!contratos?.length && <div className="text-center text-fg4 py-8">Nenhum contrato cadastrado.</div>}
          </div>
          {showNewContrato && (
            <NewContratoModal clienteId={id!} open={showNewContrato} onClose={() => setShowNewContrato(false)} />
          )}
        </TabsContent>

        {/* ── Indicações ── */}
        <TabsContent value="indicacoes">
          <div className="space-y-2">
            {indicacoes.map(ind => (
              <Card key={ind.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{ind.indicado_nome}</p>
                      <p className="text-sm text-muted-foreground">{ind.indicado_empresa || '—'}</p>
                    </div>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full', ind.recompensa_entregue ? 'bg-[rgba(16,185,129,0.15)] text-[#34d399]' : 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]')}>
                      {ind.recompensa_entregue ? 'Recompensa entregue' : 'Recompensa pendente'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {!indicacoes.length && <div className="text-center text-fg4 py-8">Nenhuma indicação feita.</div>}
          </div>
        </TabsContent>

        {/* ── Oportunidades ── */}
        <TabsContent value="oportunidades">
          <div className="space-y-2">
            {oportunidades.map(op => {
              const statusInfo = OPORTUNIDADE_STATUS.find(s => s.value === op.status)
              return (
                <Card key={op.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{op.titulo}</p>
                        <p className="text-xs text-muted-foreground capitalize">{op.tipo.replace('_', '-sell')} · {op.servico_alvo.replace(/_/g, ' ')}</p>
                      </div>
                      {statusInfo && (
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusInfo.color)}>
                          {statusInfo.label}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {!oportunidades.length && <div className="text-center text-fg4 py-8">Nenhuma oportunidade identificada.</div>}
          </div>
        </TabsContent>

        {/* ── Documentos (Phase 7 — Plan 07-03) ── */}
        <TabsContent value="documentos">
          <DocsTabConsultor clienteId={id!} />
        </TabsContent>

        {/* ── Histórico ── */}
        <TabsContent value="historico">
          <Card>
            <CardContent className="p-5">
              <ActivityTimeline tabela="clientes" registroId={id!} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Phase 7 — Client Portal Expansion (Plan 07-03) ─────────────────────────
//
// Tab "Documentos" do consultor. Permite upload com tag + checkbox
// "Pedir aprovação do cliente". D-01/D-03: consultor escolhe; cliente NÃO
// escolhe (UI do portal nem mostra o checkbox e o hook força requer_aprovacao=false).

function DocsTabConsultor({ clienteId }: { clienteId: string }) {
  const { data: perfil } = useMeuPerfil()
  const upload = useUploadClienteDoc()
  const [tag, setTag] = useState<TagDoc>('proposta')
  const [requerAprovacao, setRequerAprovacao] = useState(true)

  if (!perfil) return null

  function handleFiles(files: File[]) {
    files.forEach(file => {
      upload.mutate({
        clienteId,
        file,
        tag,
        // D-01: consultor decide se exige aprovação; cliente nunca (forçado em useUploadClienteDoc)
        requerAprovacao,
        autorId: perfil!.id,
        autorTipo: 'interno',
      })
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Tag</Label>
          <Select value={tag} onValueChange={v => setTag(v as TagDoc)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="proposta">Proposta</SelectItem>
              <SelectItem value="contrato">Contrato</SelectItem>
              <SelectItem value="relatorio">Relatório</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={requerAprovacao}
            onChange={e => setRequerAprovacao(e.target.checked)}
            className="rounded border-input accent-primary"
          />
          Pedir aprovação do cliente
        </label>
      </div>

      <UploadDropzone onFiles={handleFiles} disabled={upload.isPending} />

      <ClienteDocsList
        clienteId={clienteId}
        mode="crm"
        actionsSlot={doc => <SubirNovaVersaoButton doc={doc} mode="crm" />}
        historySlot={history => <DocVersionTimeline history={history} />}
      />
    </div>
  )
}
