import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — Plan 04a popula (BLOCKER #2 D-02 versionamento + WARNING #3).
// SubirNovaVersaoButton: aparece para autor_tipo='interno' + status='revisao_solicitada'
// + visível para consultor responsável OR coord+. Click abre dropzone e dispara
// useUploadClienteDoc com parentDocId=doc.id (incrementa versao + marca parent superseded).

describe('SubirNovaVersaoButton', () => {
  it.todo('só renderiza para autor_tipo=interno + status=revisao_solicitada')
  it.todo('visível para consultor responsável OR coord+ — hidden p/ outros')
  it.todo('click dispara useUploadClienteDoc({ parentDocId: doc.id })')
})
