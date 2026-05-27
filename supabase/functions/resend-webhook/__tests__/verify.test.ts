import { describe, it, expect, vi } from 'vitest'

// Mock URL imports do Deno antes do `import` do verify.ts.
// std/encoding/base64 exporta encode/decode com a mesma semântica do btoa/atob
// para Uint8Array — implementamos com Buffer/string nativo do Node.
vi.mock('https://deno.land/std@0.224.0/encoding/base64.ts', () => ({
  encode: (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)),
  decode: (s: string): Uint8Array => {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  },
}))

import { verifySvixSignature, isReplayValid } from '../verify.ts'

// Secret padrão para gerar fixtures. Bytes: "secret-bytes-32-chars-padding-aa"
// base64-encoded = "c2VjcmV0LWJ5dGVzLTMyLWNoYXJzLXBhZGRpbmctYWE="
const SECRET_BYTES = new TextEncoder().encode('secret-bytes-32-chars-padding-aa')
const SECRET_B64 = btoa(String.fromCharCode(...SECRET_BYTES))
const SECRET = `whsec_${SECRET_B64}`

async function makeValidSig(body: string, svixId: string, svixTs: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    SECRET_BYTES,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = `${svixId}.${svixTs}.${body}`
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return `v1,${sigB64}`
}

describe('verifySvixSignature', () => {
  const body = '{"type":"email.delivered","data":{"email_id":"r1"}}'
  const svixId = 'evt_test_1'
  const svixTs = String(Math.floor(Date.now() / 1000))

  it('aceita assinatura válida', async () => {
    const sig = await makeValidSig(body, svixId, svixTs)
    const ok = await verifySvixSignature(body, svixId, svixTs, sig, SECRET)
    expect(ok).toBe(true)
  })

  it('rejeita assinatura inválida (byte alterado)', async () => {
    const valid = await makeValidSig(body, svixId, svixTs)
    // muda 1 caractere no meio da assinatura
    const tampered = valid.slice(0, 8) + (valid[8] === 'a' ? 'b' : 'a') + valid.slice(9)
    const ok = await verifySvixSignature(body, svixId, svixTs, tampered, SECRET)
    expect(ok).toBe(false)
  })

  it('aceita header com múltiplas assinaturas se PELO MENOS UMA é válida (rotação)', async () => {
    const valid = await makeValidSig(body, svixId, svixTs)
    const wrong = 'v1,d3JvbmdfYmFzZTY0X3NpZ25hdHVyZQ=='
    const header = `${wrong} ${valid}`
    const ok = await verifySvixSignature(body, svixId, svixTs, header, SECRET)
    expect(ok).toBe(true)
  })

  it('rejeita header sem entradas v1,', async () => {
    const header = 'v2,dGVzdA== v3,dGVzdA=='
    const ok = await verifySvixSignature(body, svixId, svixTs, header, SECRET)
    expect(ok).toBe(false)
  })

  it('rejeita headers vazios', async () => {
    expect(await verifySvixSignature(body, '', svixTs, 'v1,x', SECRET)).toBe(false)
    expect(await verifySvixSignature(body, svixId, '', 'v1,x', SECRET)).toBe(false)
    expect(await verifySvixSignature(body, svixId, svixTs, '', SECRET)).toBe(false)
    expect(await verifySvixSignature(body, svixId, svixTs, 'v1,x', '')).toBe(false)
  })

  it('aceita secret sem prefix whsec_', async () => {
    const sig = await makeValidSig(body, svixId, svixTs)
    const ok = await verifySvixSignature(body, svixId, svixTs, sig, SECRET_B64)
    expect(ok).toBe(true)
  })
})

describe('isReplayValid', () => {
  it('aceita timestamp dentro da janela default (5 min)', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(isReplayValid(String(now))).toBe(true)
    expect(isReplayValid(String(now - 100))).toBe(true)
    expect(isReplayValid(String(now + 100))).toBe(true)
  })

  it('rejeita timestamp mais antigo que 5 min', () => {
    const old = Math.floor(Date.now() / 1000) - 400
    expect(isReplayValid(String(old))).toBe(false)
  })

  it('rejeita timestamp futuro mais que 5 min', () => {
    const future = Math.floor(Date.now() / 1000) + 400
    expect(isReplayValid(String(future))).toBe(false)
  })

  it('rejeita timestamp não-numérico', () => {
    expect(isReplayValid('abc')).toBe(false)
    expect(isReplayValid('')).toBe(false)
  })

  it('permite override da janela', () => {
    const old = Math.floor(Date.now() / 1000) - 1000
    expect(isReplayValid(String(old), 2000)).toBe(true)
    expect(isReplayValid(String(old), 500)).toBe(false)
  })
})
