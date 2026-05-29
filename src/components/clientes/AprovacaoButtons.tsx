import { useState } from 'react'
import { CheckCircle2, MessageSquareWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAprovarDoc } from '@/hooks/useClienteDocs'
import type { ClienteDoc } from '@/types'
import { SolicitarRevisaoModal } from './SolicitarRevisaoModal'

interface Props {
  doc: ClienteDoc
  /** 'portal' = cliente decide; 'crm' = read-only (D-01 enforcement). */
  mode: 'portal' | 'crm'
}

/**
 * Botões "Aprovar" + "Solicitar revisão" exibidos apenas no Portal do cliente
 * quando o doc é do interno + requer_aprovacao=true + status='pending' (D-01).
 *
 * Threat T-07-09 mitigado por RLS WITH CHECK em cliente_docs_update
 * (Plan 01a migration 037) — a UI é só a 1ª linha; mesmo que vaze, o banco
 * rejeita UPDATE de cliente em doc que não bate cliente_id ou status fora
 * do allow-list ['aprovado','revisao_solicitada'].
 */
export function AprovacaoButtons({ doc, mode }: Props) {
  const aprovar = useAprovarDoc()
  const [revisaoOpen, setRevisaoOpen] = useState(false)

  // D-01 + D-03: só Portal + doc do interno + requer_aprovacao + pending
  if (mode !== 'portal') return null
  if (
    doc.autor_tipo !== 'interno' ||
    !doc.requer_aprovacao ||
    doc.status !== 'pending'
  ) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() =>
          aprovar.mutate({ docId: doc.id, clienteId: doc.cliente_id })
        }
        disabled={aprovar.isPending}
        style={{
          background: 'rgba(34,197,94,0.15)',
          color: '#86efac',
          border: '1px solid rgba(34,197,94,0.3)',
        }}
      >
        <CheckCircle2 className="w-4 h-4 mr-1" />
        Aprovar
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setRevisaoOpen(true)}
        style={{
          borderColor: 'rgba(245,158,11,0.4)',
          color: '#fcd34d',
          background: 'transparent',
        }}
      >
        <MessageSquareWarning className="w-4 h-4 mr-1" />
        Solicitar revisão
      </Button>

      {revisaoOpen && (
        <SolicitarRevisaoModal
          doc={doc}
          onClose={() => setRevisaoOpen(false)}
        />
      )}
    </div>
  )
}
