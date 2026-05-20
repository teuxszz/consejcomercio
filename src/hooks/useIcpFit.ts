import { useMemo } from 'react'
import { useLeads } from '@/hooks/useLeads'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import {
  calcularIcpDinamico,
  buildIcpFitContext,
  isLeadIcpFit,
  type IcpFitContext,
} from '@/lib/icp-dinamico'
import { getCurrentYear, type PeriodValue } from '@/lib/periods'

const CURRENT_YEAR_TOTAL: PeriodValue = { year: getCurrentYear(), granularity: 'total' }

/**
 * Hook compartilhado para checar se um lead é ICP-fit.
 *
 * O contexto é montado a partir do ICP observado no ano corrente (quando há
 * convicção suficiente) ou cai pro ICP estático configurado. O cálculo é
 * memoizado — `isFit` é O(1) por chamada.
 */
export function useIcpFit(): { ctx: IcpFitContext; isFit: (lead: { segmento?: string | null; investimento_estimado?: string | null }) => boolean } {
  const { data: leads = [] } = useLeads()
  const { data: config }     = useConfiguracoes()

  return useMemo(() => {
    const servicosAtivos = (config?.servicos ?? []).filter(s => s.ativo !== false)
    const observados = calcularIcpDinamico(leads, CURRENT_YEAR_TOTAL, servicosAtivos.map(s => s.id))
    const ctx = buildIcpFitContext(observados, servicosAtivos)
    return { ctx, isFit: (lead) => isLeadIcpFit(lead, ctx) }
  }, [leads, config])
}
