// Shared helper: constant-time auth header check for webhook secrets.
// Extraído de notify-tarefa:40-49 — usado por todas as edge functions
// (notify-*, slack-commands, resend-webhook futuro) para validar header
// Authorization sem vazar timing.
//
// Imports via URL são resolvidos pelo Deno runtime no Edge (Supabase). Em
// tempo de teste Node/Vitest, este arquivo NÃO é carregado diretamente —
// callers do _shared/ são mockados via vi.mock para isolar a unidade.
//
// @ts-nocheck (URL imports não resolvem no TS Node — Deno runtime resolve em prod)
import { timingSafeEqual } from 'https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts'

export function constantTimeAuthCheck(received: string, expectedSecret: string): boolean {
  const enc = new TextEncoder()
  const expected = enc.encode(`Bearer ${expectedSecret}`)
  const got = enc.encode(received)
  if (got.length !== expected.length) {
    // compara contra si mesmo para manter tempo constante mesmo no caminho de erro
    timingSafeEqual(expected, expected)
    return false
  }
  return timingSafeEqual(got, expected)
}
