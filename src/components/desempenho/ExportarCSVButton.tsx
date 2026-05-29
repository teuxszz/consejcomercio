// Phase 8 (Plan 03 Task 3) — Botao "Exportar CSV" para /me/desempenho.
//
// Pattern: click → setExportando(true) → gerarZipCSV (lazy papaparse+jszip
// + sanitizeCell + UTF-8 BOM + revoke Blob URL) → toast. Nao precisa
// mount/unmount de DOM (CSV nao depende de captura visual).

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { gerarZipCSV } from '@/lib/csv-export'
import type { Lead, Tarefa, Contrato } from '@/types'

interface Props {
  perfilNome: string
  periodoLabel: string
  leads: Lead[]
  tarefas: Tarefa[]
  contratos: Array<Contrato & { cliente_nome?: string }>
}

export function ExportarCSVButton({ perfilNome, periodoLabel, leads, tarefas, contratos }: Props) {
  const [exportando, setExportando] = useState(false)

  async function handleExport() {
    setExportando(true)
    try {
      await gerarZipCSV({ perfilNome, periodoLabel, leads, tarefas, contratos })
      toast.success('CSV gerado')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar CSV')
    } finally {
      setExportando(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleExport}
      disabled={exportando}
      aria-label="Exportar CSV"
    >
      {exportando ? (
        <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
      ) : (
        <Download className="w-4 h-4 mr-1.5" />
      )}
      Exportar CSV
    </Button>
  )
}
