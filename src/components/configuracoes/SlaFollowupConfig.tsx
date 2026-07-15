import { useState, useEffect } from 'react'
import { useConfiguracoes, useUpdateConfiguracoes } from '@/hooks/useConfiguracoes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequireRole } from '@/components/shared/RequireRole'
import { toast } from 'sonner'
import { PIPELINE_STAGES } from '@/lib/constants'
import { SLA_EXCLUDED_STAGES } from '@/lib/sla-followup'
import type { MetasConfig } from '@/types'

// Phase 999.1 — Plan 06 — UI para D-02 (SLA de follow-up por fase, configurável).
//
// Gerente+ ajusta `configuracoes.metas.sla_followup_horas_por_stage` (Record
// stageId -> horas) e `sla_followup_horas_default` (fallback global) —
// exatamente as chaves que o trigger SQL `upsert_lead_sla` (Plan 01, migration
// 041) lê ao calcular `deadline_at` em `lead_sla`. Fases terminais e stand_by
// (SLA_EXCLUDED_STAGES) não têm SLA e não aparecem aqui.
//
// RLS de configuracoes só permite UPDATE a gerente+ (policy
// gerente_update_configuracoes, migration 040) — a fronteira real é a RLS,
// não o RequireRole abaixo; o gating de UI só evita renderizar um formulário
// que falharia ao salvar (T-999.1-17).

const STAGES_CONFIGURAVEIS = PIPELINE_STAGES.filter(
  s => !(SLA_EXCLUDED_STAGES as readonly string[]).includes(s.id),
)

const HORAS_DEFAULT_FALLBACK = 24

export function SlaFollowupConfig() {
  const { data: configs } = useConfiguracoes()
  const updateConfigs = useUpdateConfiguracoes()
  const [horasPorStage, setHorasPorStage] = useState<Record<string, number>>({})
  const [horasDefault, setHorasDefault] = useState<number>(HORAS_DEFAULT_FALLBACK)

  useEffect(() => {
    const metas = configs?.metas
    setHorasPorStage(metas?.sla_followup_horas_por_stage ?? {})
    setHorasDefault(metas?.sla_followup_horas_default ?? HORAS_DEFAULT_FALLBACK)
  }, [configs])

  const handleChangeStage = (stageId: string, value: string) => {
    const num = Number(value)
    setHorasPorStage(prev => ({ ...prev, [stageId]: num }))
  }

  const handleSave = async () => {
    const valores = [horasDefault, ...Object.values(horasPorStage)]
    if (valores.some(v => !Number.isFinite(v) || v <= 0)) {
      toast.error('Use valores de horas maiores que zero')
      return
    }
    try {
      const newMetas: MetasConfig = {
        ...(configs?.metas ?? ({} as MetasConfig)),
        sla_followup_horas_por_stage: horasPorStage,
        sla_followup_horas_default: horasDefault,
      }
      await updateConfigs.mutateAsync({ metas: newMetas })
      // toast.success já é disparado pelo hook (useUpdateConfiguracoes)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    }
  }

  return (
    <RequireRole atLeast="gerente" fallback={null}>
      <div className="p-4 rounded-xl border border-border bg-card space-y-4">
        <div>
          <Label className="text-sm font-semibold">SLA de follow-up por fase</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Prazo (em horas) até o próximo contato obrigatório em cada fase do funil.
            Fases terminais (ganho/perdido/cancelado) e Stand By não têm SLA.
          </p>
        </div>

        <div className="space-y-2">
          {STAGES_CONFIGURAVEIS.map(stage => (
            <div key={stage.id} className="flex items-center gap-3">
              <span className="text-sm text-foreground w-48 shrink-0">{stage.label}</span>
              <Input
                type="number"
                min={1}
                value={horasPorStage[stage.id] ?? ''}
                placeholder={String(horasDefault)}
                onChange={e => handleChangeStage(stage.id, e.target.value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">horas</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <span className="text-sm font-medium text-foreground w-48 shrink-0">Default global</span>
          <Input
            type="number"
            min={1}
            value={horasDefault}
            onChange={e => setHorasDefault(Number(e.target.value))}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">horas</span>
        </div>

        <div>
          <Button size="sm" onClick={handleSave} disabled={updateConfigs.isPending}>
            {updateConfigs.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </RequireRole>
  )
}
