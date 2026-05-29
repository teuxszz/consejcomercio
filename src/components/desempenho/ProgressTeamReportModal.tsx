// Phase 8 Plan 04 — Dialog de progresso para gerarRelatorioEquipe (REP-04).
//
// Exibe barra X/N + nome do consultor sendo capturado + botao Cancelar
// que aciona AbortController.abort() no parent. Sem auto-close: o caller
// controla via `open` prop (close quando finally roda).

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  current: number
  total: number
  consultorNome: string
  onCancel: () => void
}

export function ProgressTeamReportModal({ open, current, total, consultorNome, onCancel }: Props) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md">
        <DialogTitle>Gerando relatório da equipe</DialogTitle>
        <DialogDescription>
          {current} / {total} consultores · {consultorNome || 'preparando…'}
        </DialogDescription>
        <Progress value={percent} />
        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
