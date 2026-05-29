import { useState, useEffect } from 'react'
import { useConfiguracoes, useUpdateConfiguracoes } from '@/hooks/useConfiguracoes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequireRole } from '@/components/shared/RequireRole'
import { toast } from 'sonner'
import type { MetasConfig } from '@/types'

// Phase 7 — Plan 04b — UI para D-13 (WARNING #2 revision iter 2).
//
// Coord+ ajusta `configuracoes.metas.dias_para_aprovacao_pendente` (default=5),
// usado pelo cron `disparar-aprovacoes-stale` (Plan 02 migration 038) para
// determinar quando notificar consultor sobre docs parados.
//
// Faixa válida 1..60 dias. RLS de configuracoes garante que só coord+
// pode UPDATE — mas envolvemos com RequireRole atLeast='coordenador' para
// nem renderizar o componente para quem não pode salvar (T-07-15 mitigation).

interface MetasComDias extends MetasConfig {
  dias_para_aprovacao_pendente?: number
}

export function ConfigDiasAprovacao() {
  const { data: configs } = useConfiguracoes()
  const updateConfigs = useUpdateConfiguracoes()
  const [dias, setDias] = useState<number>(5)

  useEffect(() => {
    const current = (configs?.metas as MetasComDias | undefined)?.dias_para_aprovacao_pendente
    if (typeof current === 'number') setDias(current)
  }, [configs])

  const handleSave = async () => {
    if (!Number.isFinite(dias) || dias < 1 || dias > 60) {
      toast.error('Use um valor entre 1 e 60 dias')
      return
    }
    try {
      const newMetas: MetasComDias = {
        ...(configs?.metas ?? ({} as MetasConfig)),
        dias_para_aprovacao_pendente: dias,
      }
      await updateConfigs.mutateAsync({ metas: newMetas })
      // toast.success já é disparado pelo hook (useUpdateConfiguracoes)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    }
  }

  return (
    <RequireRole atLeast="coordenador" fallback={null}>
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div>
          <Label className="text-sm font-semibold">Dias para considerar aprovação parada</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Depois desse prazo sem resposta do cliente, dispara notificação automática
            ao consultor responsável (D-13).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={60}
            value={dias}
            onChange={e => setDias(Number(e.target.value))}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">dias</span>
          <Button size="sm" onClick={handleSave} disabled={updateConfigs.isPending}>
            {updateConfigs.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </RequireRole>
  )
}
