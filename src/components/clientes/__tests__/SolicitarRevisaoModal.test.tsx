import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — Plan 04a popula (BLOCKER #5 + WARNING #3).
// SolicitarRevisaoModal: form com textarea comentario_cliente (zod.min(5))
// + submit chama useSolicitarRevisaoDoc, fecha no success.

describe('SolicitarRevisaoModal', () => {
  it.todo('valida comentário com zod min(5) — exibe erro inline')
  it.todo('submit válido chama useSolicitarRevisaoDoc({ docId, comentario })')
  it.todo('fecha modal automaticamente no onSuccess da mutation')
})
