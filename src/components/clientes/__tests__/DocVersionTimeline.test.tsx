import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — Plan 04a popula (BLOCKER #5 + WARNING #3).
// DocVersionTimeline: lista versões (parent + filhas via parent_doc_id) em
// ordem cronológica reversa com ícone por status.

describe('DocVersionTimeline', () => {
  it.todo('renderiza histórico em ordem cronológica reversa (mais nova primeiro)')
  it.todo('mapeia status para ícone (pending/aprovado/revisao_solicitada/superseded)')
  it.todo('toggle "Ver mais" expande/colapsa versões anteriores à v1')
})
