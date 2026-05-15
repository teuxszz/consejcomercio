import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type EntidadeTipo = 'lead' | 'cliente' | 'contrato' | 'parceiro' | 'oportunidade' | 'reuniao' | 'indicacao'

interface Props {
  open: boolean
  onClose: () => void
  entidadeTipo: EntidadeTipo
  entidadeId: string | null
  entidadeLabel: string
  onConfirm: () => Promise<void> | void
}

const LABEL_MAP: Record<string, string> = {
  tarefas_excluidas: 'tarefas serão removidas',
  diagnosticos_excluidos: 'diagnósticos serão removidos',
  interacoes_excluidas: 'interações serão removidas',
  indicacoes_desvinculadas: 'indicações ficarão sem este referrer',
  indicacoes_bloqueadoras: 'indicações dependem APENAS deste referrer (bloqueio)',
  clientes_desvinculados: 'clientes perderão o lead de origem',
  reunioes_desvinculadas: 'reuniões serão desvinculadas',
  contratos_excluidos: 'contratos serão excluídos (apaga histórico)',
  oportunidades_excluidas: 'oportunidades serão excluídas',
  oportunidades_desvinculadas: 'oportunidades ficarão sem contrato',
  demandas_excluidas: 'demandas serão excluídas',
}

export function DeleteConfirmDialog({
  open,
  onClose,
  entidadeTipo,
  entidadeId,
  entidadeLabel,
  onConfirm,
}: Props) {
  const [impacto, setImpacto] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !entidadeId) {
      setImpacto(null)
      setErro(null)
      return
    }
    setLoading(true)
    setErro(null)
    // `await` em vez de .finally — o builder do Supabase é PromiseLike,
    // não Promise completa (não garante .finally).
    void (async () => {
      const { data, error } = await supabase
        .rpc('inspecionar_exclusao', { p_entidade_tipo: entidadeTipo, p_id: entidadeId })
      if (error) setErro(error.message)
      else setImpacto(data as Record<string, number>)
      setLoading(false)
    })()
  }, [open, entidadeId, entidadeTipo])

  const bloqueado = (impacto?.indicacoes_bloqueadoras ?? 0) > 0
  const itens = impacto
    ? Object.entries(impacto).filter(([, v]) => (v as number) > 0)
    : []

  async function handleConfirm() {
    if (bloqueado) return
    setConfirming(true)
    try {
      await onConfirm()
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !confirming) onClose() }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Confirmar exclusão
          </DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir <span className="font-semibold">{entidadeLabel}</span>? Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {loading && <p className="text-muted-foreground">Verificando impactos…</p>}
          {erro && (
            <div className="rounded-md p-3 text-xs" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
              Não foi possível verificar os impactos: {erro}
            </div>
          )}

          {!loading && impacto && itens.length === 0 && (
            <p className="text-muted-foreground">Nenhum registro vinculado.</p>
          )}

          {!loading && itens.length > 0 && (
            <div className="rounded-lg p-3" style={{ background: 'var(--alpha-bg-xs)', border: '1px solid var(--alpha-border-md)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-fg4 mb-2">Impacto</p>
              <ul className="space-y-1">
                {itens.map(([key, count]) => {
                  const isBlock = key === 'indicacoes_bloqueadoras'
                  return (
                    <li
                      key={key}
                      className={isBlock ? 'text-red-400 font-medium' : 'text-fg2'}
                    >
                      <span className="font-semibold">{count}</span>{' '}
                      <span className="text-xs">{LABEL_MAP[key] ?? key}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {bloqueado && (
            <p className="text-xs text-red-400 leading-relaxed">
              Exclusão bloqueada — atribua outro referrer às indicações antes de excluir esta entidade.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={confirming}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={confirming || loading || bloqueado}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {confirming ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
