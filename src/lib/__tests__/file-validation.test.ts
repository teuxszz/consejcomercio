import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — populado em Task 1b-5 deste mesmo plan (07-01b).
// Cobre D-05 file-validation: whitelist de extensão/MIME + size <= 10MB +
// tolerância a file.type vazio (Pitfall §2 do 07-RESEARCH).

describe('validateDoc', () => {
  it.todo('rejeita arquivo maior que 10 MB com code=SIZE')
  it.todo('rejeita extensão fora da whitelist (.exe) com code=EXTENSION')
  it.todo('aceita .pdf/.docx/.jpg legítimos retornando null')
  it.todo('tolera file.type vazio (não rejeita) — Pitfall §2')
  it.todo('rejeita arquivo vazio (size=0) com code=EMPTY')
  it.todo('rejeita MIME divergente da extensão com code=MIME')
})

describe('validateDocOrThrow', () => {
  it.todo('lança Error quando validateDoc retorna erro')
  it.todo('não lança quando file é válido')
})
