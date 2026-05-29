// Phase 8 Plan 04 Task 3 — Botao coordenador+ "Exportar PDF equipe" para
// AdocaoPage header (REP-04 + D-07 + D-08).
//
// Responsabilidades:
//   1. Compor o snapshot via calcularDesempenhoEquipe (Plan 04 Task 1)
//   2. Detector iOS/Android: se mobile && >=5 consultores -> toast.warning
//      com botao "Tentar mesmo assim" (Pattern 10 RESEARCH)
//   3. Criar AbortController + chamar gerarRelatorioEquipe
//   4. Renderizar DesempenhoTeamReport off-screen via state — varia entre
//      'capa' / 'consultor' / 'ranking' a cada mountAndCapture
//   5. ProgressModal aberto enquanto progress != null + Cancelar abort()
//   6. Catch AbortError -> toast 'Geracao cancelada' (sem error.toast)
//   7. Catch outros -> toast.error
//   8. Finally: cleanup progress + report state

import { useRef, useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DesempenhoTeamReport, type ConsultorReportData } from './DesempenhoTeamReport'
import { ProgressTeamReportModal } from './ProgressTeamReportModal'
import {
  gerarRelatorioEquipe,
  type ProgressInfo,
  type ConsultorComDados,
} from '@/lib/pdf-export'
import { calcularDesempenhoEquipe } from '@/lib/desempenho-team'
import { useLeads } from '@/hooks/useLeads'
import { useTarefas } from '@/hooks/useTarefas'
import { useClientes } from '@/hooks/useClientes'
import { useContratos } from '@/hooks/useContratos'
import { usePerfis } from '@/hooks/usePerfis'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import type { PeriodValue } from '@/lib/periods'
import { getPeriodRange, isInRange, formatPeriodLabel } from '@/lib/periods'
import type { DesempenhoMetricas, DesempenhoConsultorTeam } from '@/types'

interface Props {
  periodo: PeriodValue
}

// State interno do componente para guiar a renderizacao off-screen do
// TeamReport: variant atual + dados associados.
interface ReportState {
  variant: 'capa' | 'consultor' | 'ranking'
  totais?: DesempenhoMetricas
  consultor?: ConsultorReportData
  ranking?: DesempenhoConsultorTeam[]
}

/**
 * Detector mobile (iOS/Android). MSStream check exclui IE11 mobile
 * pre-historico mas mantemos para conformidade com a referencia
 * Pattern 10 RESEARCH (linhas 766-783).
 */
function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOSorAndroid = /iPad|iPhone|iPod|Android/.test(ua) && !('MSStream' in window)
  // iPad masquerading como desktop em iOS 13+: detecta via maxTouchPoints + Mac
  const isIPadDesktopUA =
    navigator.maxTouchPoints > 1 && /Mac/.test(ua)
  return isIOSorAndroid || isIPadDesktopUA
}

export function ExportarPDFEquipeButton({ periodo }: Props) {
  const { data: perfis = [] } = usePerfis()
  const { data: leads = [] } = useLeads()
  const { data: tarefas = [] } = useTarefas()
  const { data: clientes = [] } = useClientes()
  const { data: contratos = [] } = useContratos()
  const { data: config } = useConfiguracoes()

  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [report, setReport] = useState<ReportState | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  function buildSnapshot() {
    return calcularDesempenhoEquipe({
      perfis,
      leads,
      tarefas,
      clientes,
      contratos,
      periodo,
      servicosConfig: config?.servicos ?? [],
    })
  }

  function handleClick() {
    const snapshot = buildSnapshot()
    if (snapshot.consultores.length === 0) {
      toast.error('Nenhum consultor ativo no período selecionado.')
      return
    }
    if (isMobile() && snapshot.consultores.length >= 5) {
      toast.warning(
        'Relatório da equipe é pesado em mobile. Recomendamos usar desktop.',
        {
          duration: 6000,
          action: {
            label: 'Tentar mesmo assim',
            onClick: () => prosseguir(snapshot),
          },
        },
      )
      return
    }
    prosseguir(snapshot)
  }

  async function prosseguir(snapshot: ReturnType<typeof calcularDesempenhoEquipe>) {
    const controller = new AbortController()
    controllerRef.current = controller

    // Anexar leads + tarefas filtrados (perfil + periodo) a cada consultor
    // -> formato esperado por gerarRelatorioEquipe (ConsultorComDados).
    const range = getPeriodRange(periodo)
    const consultoresAtivos: ConsultorComDados[] = snapshot.consultores.map(c => ({
      ...c,
      leads: leads.filter(
        l => l.responsavel_id === c.perfilId && isInRange(l.created_at, range),
      ),
      tarefas: tarefas.filter(
        t => t.atribuido_a_id === c.perfilId && isInRange(t.created_at, range),
      ),
    }))

    // ranking sorted desc por convertidos (helper Plan 04 Task 1).
    // calcularDesempenhoEquipe nao ordena por default, entao reusamos
    // rankConsultores via simple sort here (lib helper esta tambem disponivel).
    const ranking: DesempenhoConsultorTeam[] = [...snapshot.consultores].sort(
      (a, b) => b.metricas.convertidos - a.metricas.convertidos,
    )

    setProgress({ current: 0, total: consultoresAtivos.length, consultorNome: '' })

    /**
     * mountAndCapture orquestra: setReport({variant, data}) -> aguarda
     * React commit (RAF) -> recupera DOM root [data-pdf-root] -> retorna.
     */
    async function mountAndCapture(
      variant: 'capa' | 'consultor' | 'ranking',
      data: {
        totais?: DesempenhoMetricas
        consultor?: ConsultorComDados
        ranking?: DesempenhoConsultorTeam[]
      },
    ): Promise<HTMLElement> {
      setReport({
        variant,
        totais: data.totais,
        consultor: data.consultor as ConsultorReportData | undefined,
        ranking: data.ranking,
      })
      // 2 RAFs para garantir React commit + paint (recharts precisa de ambos)
      await new Promise(r => requestAnimationFrame(() => r(null)))
      await new Promise(r => requestAnimationFrame(() => r(null)))
      const root = document.querySelector<HTMLElement>('[data-pdf-root]')
      if (!root) throw new Error('TeamReport nao montou')
      return root
    }

    try {
      await gerarRelatorioEquipe({
        totais: snapshot.totais,
        consultoresAtivos,
        ranking,
        periodoLabel: formatPeriodLabel(periodo),
        periodoSlug: `${periodo.year}-${periodo.granularity}`,
        mountAndCapture,
        onProgress: info => setProgress(info),
        signal: controller.signal,
      })
      toast.success('PDF da equipe gerado')
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        toast('Geração cancelada')
      } else {
        toast.error(e instanceof Error ? e.message : 'Erro ao gerar PDF da equipe')
      }
    } finally {
      setProgress(null)
      setReport(null)
      controllerRef.current = null
    }
  }

  function handleCancel() {
    controllerRef.current?.abort()
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={!!progress}
        aria-label="Exportar PDF da equipe"
      >
        {progress ? (
          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
        ) : (
          <FileDown className="w-4 h-4 mr-1.5" />
        )}
        Exportar PDF equipe
      </Button>

      <ProgressTeamReportModal
        open={!!progress}
        current={progress?.current ?? 0}
        total={progress?.total ?? 0}
        consultorNome={progress?.consultorNome ?? ''}
        onCancel={handleCancel}
      />

      {report && (
        <DesempenhoTeamReport
          variant={report.variant}
          totais={report.totais}
          consultor={report.consultor}
          ranking={report.ranking}
          periodoLabel={formatPeriodLabel(periodo)}
          geradoEm={new Date()}
        />
      )}
    </>
  )
}
