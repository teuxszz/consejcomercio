import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — Plan 03/04a popula com mocks Supabase reais.
// Cobre as 4 mutations + 1 query do hook useClienteDocs (D-02/D-05/D-08).

describe('useClienteDocs (query)', () => {
  it.todo('lista docs por cliente filtrando deleted_at IS NULL')
  it.todo('respeita versão (apenas a mais recente quando hideOldVersions=true)')
})

describe('useUploadClienteDoc (mutation)', () => {
  it.todo('upload bem-sucedido: chama storage.upload + insert cliente_docs')
  it.todo('rollback: se insert falha após upload OK, deleta o object no storage')
  it.todo('validação client-side: rejeita file inválido antes do upload')
  it.todo('parentDocId presente: incrementa versao e marca parent como superseded')
})

describe('useAprovarDoc (mutation)', () => {
  it.todo('atualiza status=aprovado + dispara sendNotificacaoAprovacao')
})

describe('useSolicitarRevisaoDoc (mutation)', () => {
  it.todo('atualiza status=revisao_solicitada + grava comentario_cliente')
})
