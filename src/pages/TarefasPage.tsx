import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, CheckCircle2 } from 'lucide-react'
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
} from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScopeToggle } from '@/components/shared/ScopeToggle'
import { TarefaCard } from '@/components/tarefas/TarefaCard'
import { TarefaModal } from '@/components/tarefas/TarefaModal'
import { useTarefas, useMinhasTarefas, useConcluirTarefa, useDeleteTarefa } from '@/hooks/useTarefas'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import type { Tarefa } from '@/types'

type StatusFilter = 'todas' | 'aberta' | 'em_andamento' | 'concluida'
type DataFilter   = 'qualquer' | 'hoje' | 'semana' | 'atrasadas'

export function TarefasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [scope, setScope]               = useState<'mine' | 'all'>('mine')
  const [modalOpen, setModalOpen]       = useState(false)
  const [editingTarefa, setEditingTarefa] = useState<Tarefa | null>(null)

  const statusFilter = (searchParams.get('status') ?? 'todas') as StatusFilter
  const dataFilter   = (searchParams.get('data')   ?? 'qualquer') as DataFilter

  function setFilter(key: 'status' | 'data', value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set(key, value)
      return next
    })
  }

  const { data: meuPerfil } = useMeuPerfil()
  const { isCoordenadorOrAcima } = useCurrentRole()

  const { data: minhasTarefas = [] } = useMinhasTarefas(scope === 'mine' ? meuPerfil?.id : undefined)
  const { data: todasTarefas  = [] } = useTarefas()
  const concluir = useConcluirTarefa()
  const remover  = useDeleteTarefa()

  const tarefas = scope === 'all' && isCoordenadorOrAcima ? todasTarefas : minhasTarefas

  const filtradas = useMemo(() => {
    const now = new Date()
    return tarefas.filter(t => {
      if (statusFilter !== 'todas' && t.status !== statusFilter) return false
      if (dataFilter === 'hoje') {
        if (!t.data_vencimento) return false
        const d = new Date(t.data_vencimento)
        return d >= startOfDay(now) && d <= endOfDay(now)
      }
      if (dataFilter === 'semana') {
        if (!t.data_vencimento) return false
        const d = new Date(t.data_vencimento)
        return d >= startOfWeek(now, { weekStartsOn: 1 }) && d <= endOfWeek(now, { weekStartsOn: 1 })
      }
      if (dataFilter === 'atrasadas') {
        if (!t.data_vencimento) return false
        return new Date(t.data_vencimento) < now
      }
      return true
    })
  }, [tarefas, statusFilter, dataFilter])

  const semFiltro    = tarefas.length === 0
  const semResultado = !semFiltro && filtradas.length === 0

  function handleConcluir(id: string) { concluir.mutate(id) }
  function handleRemover(id: string)  { remover.mutate(id)  }
  function handleEditar(t: Tarefa)    { setEditingTarefa(t); setModalOpen(true) }

  function openModal() { setEditingTarefa(null); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditingTarefa(null) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Tarefas</h1>
        <Button
          size="sm"
          onClick={openModal}
          style={{ backgroundColor: '#0089ac' }}
          className="h-8 gap-1.5 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova tarefa
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {isCoordenadorOrAcima && (
          <ScopeToggle
            value={scope}
            onChange={setScope}
            mineCount={minhasTarefas.length}
            allCount={todasTarefas.length}
          />
        )}
        <Select value={statusFilter} onValueChange={v => setFilter('status', v)}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos os status</SelectItem>
            <SelectItem value="aberta">Abertas</SelectItem>
            <SelectItem value="em_andamento">Em andamento</SelectItem>
            <SelectItem value="concluida">Concluídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dataFilter} onValueChange={v => setFilter('data', v)}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="Data" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="qualquer">Qualquer data</SelectItem>
            <SelectItem value="hoje">Vencendo hoje</SelectItem>
            <SelectItem value="semana">Esta semana</SelectItem>
            <SelectItem value="atrasadas">Atrasadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {semFiltro ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3" style={{ background: 'rgba(16,185,129,0.15)' }}>
              <CheckCircle2 className="w-5 h-5" style={{ color: '#6ee7b7' }} />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhuma tarefa pendente</p>
            <p className="text-xs text-muted-foreground mt-1">Você está em dia! Crie uma nova tarefa ou aguarde atribuições.</p>
          </CardContent>
        </Card>
      ) : semResultado ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium text-foreground">Nenhuma tarefa com esses filtros</p>
            <p className="text-xs text-muted-foreground mt-1">Tente remover alguns filtros para ver mais tarefas.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y" style={{ borderColor: 'var(--alpha-border)' }}>
              {filtradas.map(t => (
                <TarefaCard
                  key={t.id}
                  tarefa={t}
                  userId={meuPerfil?.id ?? ''}
                  onConcluir={handleConcluir}
                  onEditar={handleEditar}
                  onRemover={handleRemover}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <TarefaModal
        open={modalOpen}
        onClose={closeModal}
        mode={editingTarefa ? 'edit' : 'create'}
        tarefa={editingTarefa ?? undefined}
      />
    </div>
  )
}
