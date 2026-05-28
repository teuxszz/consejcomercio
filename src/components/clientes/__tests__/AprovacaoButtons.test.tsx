import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — Plan 04a popula (BLOCKER #5 + WARNING #3).
// AprovacaoButtons: par de botões "Aprovar" + "Solicitar revisão" exibido
// no Portal do cliente quando doc.requer_aprovacao=true E doc.status='pending'.
// Hidden no CRM mode.

describe('AprovacaoButtons', () => {
  it.todo('renderiza apenas para mode=portal + status=pending + requer_aprovacao=true')
  it.todo('click "Aprovar" dispara useAprovarDoc({ docId })')
  it.todo('click "Solicitar revisão" abre SolicitarRevisaoModal')
  it.todo('hidden quando mode=crm (consultor não aprova doc próprio)')
})
