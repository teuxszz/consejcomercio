// Phase 8 (Plan 03 Task 3) — Botao "Exportar PDF" para /me/desempenho.
//
// Pattern: click → setExportando(true) → renderiza DesempenhoReport
// off-screen via portal (Plan 02) → 1 RAF wait para paint → captura via
// gerarRelatorioIndividual (Plan 03 Task 1) → desmonta → toast.
//
// Por que mount inline aqui (em vez de receber rootEl como prop)?
//   - DesempenhoReport precisa de leads + tarefas + metrics filtrados pelo
//     parent; centralizar a logica aqui evita o parent ter que gerenciar
//     mount lifecycle so para export.
//   - O componente permanece desmontado fora do export — sem custo extra de
//     render no DOM principal.

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DesempenhoReport } from './DesempenhoReport'
import { gerarRelatorioIndividual } from '@/lib/pdf-export'
import type { DesempenhoMetricas, Lead, Tarefa } from '@/types'

interface Props {
  metrics: DesempenhoMetricas
  leads: Lead[]
  tarefas: Tarefa[]
  perfilNome: string
}

export function ExportarPDFButton({ metrics, leads, tarefas, perfilNome }: Props) {
  const [exportando, setExportando] = useState(false)
  const [mountReport, setMountReport] = useState(false)

  async function handleExport() {
    setExportando(true)
    setMountReport(true)
    try {
      // 1 RAF wait — garante que o portal foi commitado no DOM
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)))

      const rootEl = document.querySelector<HTMLElement>('[data-pdf-root]')
      if (!rootEl) throw new Error('DesempenhoReport nao montou')

      await gerarRelatorioIndividual(rootEl, metrics, new Date())
      toast.success('PDF gerado')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar PDF')
    } finally {
      setMountReport(false)
      setExportando(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleExport}
        disabled={exportando}
        aria-label="Exportar PDF"
      >
        {exportando ? (
          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
        ) : (
          <FileDown className="w-4 h-4 mr-1.5" />
        )}
        Exportar PDF
      </Button>
      {mountReport && (
        <DesempenhoReport
          metrics={metrics}
          perfilNome={perfilNome}
          leads={leads}
          tarefas={tarefas}
          geradoEm={new Date()}
        />
      )}
    </>
  )
}
