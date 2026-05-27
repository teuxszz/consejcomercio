// HMAC SHA-256 verification + replay-window check para webhooks Resend (Svix).
//
// Per RESEARCH §Q2 — assinatura no formato "v1,<b64sig> [v1,<b64sig>]" sobre
// base string `${svixId}.${svixTimestamp}.${rawBody}`, com secret no formato
// `whsec_<base64>`. O segredo base64 é decoded ANTES de virar key HMAC — bug
// comum é usar o whsec_xxx string direto, o que falha silenciosamente.
//
// Suporta múltiplas assinaturas separadas por espaço (rotação de secret).
//
// constantTimeEquals impede timing-attack na comparação.
//
// @ts-nocheck (URL imports não resolvem no TS Node — Deno runtime resolve em prod)
import { decode as b64decode, encode as b64encode } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

/**
 * Verifica assinatura Svix/Resend de um webhook.
 * @param body raw request body (string)
 * @param svixId valor do header svix-id
 * @param svixTimestamp valor do header svix-timestamp
 * @param svixSignatureHeader valor do header svix-signature (pode conter múltiplas assinaturas)
 * @param secret formato whsec_<base64>
 * @returns true se PELO MENOS UMA assinatura `v1,...` válida bate
 */
export async function verifySvixSignature(
  body: string,
  svixId: string,
  svixTimestamp: string,
  svixSignatureHeader: string,
  secret: string,
): Promise<boolean> {
  if (!svixId || !svixTimestamp || !svixSignatureHeader || !secret) return false

  // Strip prefix whsec_ se presente e decode base64 do segredo
  const keyB64 = secret.replace(/^whsec_/, '')
  let keyBytes: Uint8Array
  try {
    keyBytes = b64decode(keyB64)
  } catch {
    return false
  }

  const signedContent = `${svixId}.${svixTimestamp}.${body}`
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const computed = b64encode(new Uint8Array(sig))

  // Header pode ter múltiplas assinaturas: "v1,sigA v1,sigB v2,...".
  // Suportamos apenas v1 (HMAC-SHA256). Pega o que está depois do "v1,".
  const provided = svixSignatureHeader
    .split(' ')
    .filter((s) => s.startsWith('v1,'))
    .map((s) => s.slice(3))

  return provided.some((p) => constantTimeEquals(computed, p))
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verifica que o timestamp do webhook está dentro de uma janela aceitável
 * (default 5 min). Protege contra replay de requisições antigas.
 */
export function isReplayValid(svixTimestamp: string, maxSkewSeconds = 300): boolean {
  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts)) return false
  const now = Math.floor(Date.now() / 1000)
  return Math.abs(now - ts) <= maxSkewSeconds
}
