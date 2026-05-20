import { useParams, useNavigate } from 'react-router-dom'
import { useLeads, useUpdateLead, useDeleteLead } from '@/hooks/useLeads'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STAGE_COLORS, LEAD_SOURCE_LABELS, SEGMENTS, PIPELINE_STAGES, ESTADOS_BR } from '@/lib/constants'
import { usePerfis } from '@/hooks/usePerfis'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import { formatDate, getUFFromPhone } from '@/lib/utils'
import { ArrowLeft, Stethoscope, Trash2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import type { Lead } from '@/types'
import { cn } from '@/lib/utils'
import { DiagnosticForm } from '@/components/diagnostico/DiagnosticForm'
import { DiagnosticPreview } from '@/components/diagnostico/DiagnosticPreview'
import { ActivityTimeline } from '@/components/shared/ActivityTimeline'
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog'

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: leads } = useLeads()
  const updateLead = useUpdateLead()
  const deleteLead = useDeleteLead()
  const { data: perfis = [] } = usePerfis()
  const { data: config } = useConfiguracoes()
  const lead = leads?.find(l => l.id === id)

  const [editing, setEditing] = useState<Partial<Lead>>({})
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (lead) setEditing(lead)
  }, [lead])

  if (!lead) return <div className="text-muted-foreground">Lead não encontrado.</div>

  function handleSave() {
    if (!lead) return
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { diagnostico, id: _id, ...fields } = editing as Lead
    updateLead.mutate({ id: lead.id, ...fields })
  }

  async function handleConfirmDelete() {
    if (!lead) return
    try {
      await deleteLead.mutateAsync(lead.id)
      navigate('/leads')
    } catch {
      // erro já exibido via toast pelo hook; mantém o usuário na página
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm mb-5">
        <button onClick={() => navigate('/leads')} className="text-fg4 hover:text-fg2 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Leads
        </button>
        <span className="text-fg4">/</span>
        <span className="text-fg2 font-medium truncate">{lead.nome}</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">{lead.nome}</h1>
          <p className="text-sm text-muted-foreground">{lead.empresa}</p>
        </div>
        <span className={cn('ml-auto text-xs font-medium px-2.5 py-1 rounded-full border', STAGE_COLORS[lead.status])}>
          {PIPELINE_STAGES.find(s => s.id === lead.status)?.label}
        </span>
        <Button
          variant="ghost"
          onClick={() => setDeleteOpen(true)}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5"
        >
          <Trash2 className="w-4 h-4" /> Excluir lead
        </Button>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="mb-4">
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
          <TabsTrigger value="proposta">Proposta</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader><CardTitle className="text-base">Dados do Lead</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={editing.nome || ''} onChange={e => setEditing(p => ({ ...p, nome: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input
                    value={editing.telefone || ''}
                    onChange={e => {
                      const tel = e.target.value
                      const uf = getUFFromPhone(tel)
                      setEditing(p => ({ ...p, telefone: tel, ...(uf && !p.estado ? { estado: uf } : {}) }))
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Empresa</Label>
                  <Input value={editing.empresa || ''} onChange={e => setEditing(p => ({ ...p, empresa: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={editing.email || ''} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Segmento</Label>
                  <Select value={editing.segmento || ''} onValueChange={v => setEditing(p => ({ ...p, segmento: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEGMENTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Origem</Label>
                  <Input value={LEAD_SOURCE_LABELS[lead.origem] || lead.origem} disabled className="bg-background" />
                </div>
                <div className="space-y-1.5">
                  <Label>Estado (UF)</Label>
                  <Select value={editing.estado || ''} onValueChange={v => setEditing(p => ({ ...p, estado: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_BR.map(s => <SelectItem key={s.uf} value={s.uf}>{s.uf} — {s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Responsável</Label>
                  <Select
                    value={editing.responsavel_id || '__none__'}
                    onValueChange={v => {
                      const realId = v === '__none__' ? '' : v
                      const p = perfis.find(p => p.id === realId)
                      setEditing(prev => ({ ...prev, responsavel_id: realId || null, responsavel: p?.nome ?? null }))
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Membro da equipe" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem responsável</SelectItem>
                      {perfis.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}{p.cargo ? ` — ${p.cargo}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data do Diagnóstico</Label>
                  <Input type="datetime-local" value={editing.data_diagnostico ? editing.data_diagnostico.slice(0, 16) : ''} onChange={e => setEditing(p => ({ ...p, data_diagnostico: e.target.value }))} />
                </div>
              </div>
              {/* Serviços de interesse — multi-select do catálogo */}
              {(config?.servicos ?? []).filter(s => s.ativo !== false).length > 0 && (
                <div className="space-y-1.5">
                  <Label>Serviços de Interesse</Label>
                  <div className="grid grid-cols-2 gap-1.5 p-3 rounded-lg" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border)' }}>
                    {(config?.servicos ?? []).filter(s => s.ativo !== false).map(s => {
                      const selected = (editing.servicos_interesse ?? []).includes(s.id)
                      return (
                        <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {
                              const current = editing.servicos_interesse ?? []
                              setEditing(p => ({
                                ...p,
                                servicos_interesse: selected
                                  ? current.filter(v => v !== s.id)
                                  : [...current, s.id],
                              }))
                            }}
                            className="rounded accent-primary"
                          />
                          <span className="text-xs text-fg2 group-hover:text-foreground transition-colors">{s.nome}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea value={editing.notas || ''} onChange={e => setEditing(p => ({ ...p, notas: e.target.value }))} rows={3} />
              </div>
              {lead.motivo_perda && (
                <div className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--red-hi)' }}>Motivo da perda:</p>
                  <p className="text-sm mt-0.5" style={{ color: 'rgba(248,113,113,0.75)' }}>{lead.motivo_perda}</p>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={updateLead.isPending} className="bg-primary hover:bg-primary/90">
                  {updateLead.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostico">
          {lead.diagnostico?.completed_at ? (
            <DiagnosticPreview diagnostico={lead.diagnostico} onRedo={() => {}} />
          ) : (
            <DiagnosticForm leadId={lead.id} existingAnswers={lead.diagnostico} />
          )}
        </TabsContent>

        <TabsContent value="proposta">
          <Card>
            <CardHeader><CardTitle className="text-base">Proposta</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label>Valor de Investimento Estimado</Label>
                <Input
                  value={editing.investimento_estimado || ''}
                  onChange={e => setEditing(p => ({ ...p, investimento_estimado: e.target.value }))}
                  placeholder="Ex: R$ 2.000 - R$ 5.000"
                />
              </div>
              <div className="space-y-1.5 mt-4">
                <Label>Observações da proposta</Label>
                <Textarea
                  value={editing.notas || ''}
                  onChange={e => setEditing(p => ({ ...p, notas: e.target.value }))}
                  placeholder="Detalhes da proposta enviada..."
                  rows={5}
                />
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={handleSave} disabled={updateLead.isPending} className="bg-primary hover:bg-primary/90">
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardContent className="p-5">
              <ActivityTimeline tabela="leads" registroId={id!} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        entidadeTipo="lead"
        entidadeId={lead?.id ?? null}
        entidadeLabel={lead ? `${lead.nome} (${lead.empresa})` : ''}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
