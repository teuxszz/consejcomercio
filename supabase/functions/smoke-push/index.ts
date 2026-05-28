// Edge Function: smoke-push
//
// R-L1 diagnostic gate — validates that `web-push@3.6.7` loads in Supabase
// Edge Runtime (Deno) and that core VAPID operations work end-to-end:
//   A) library import resolved (esm.sh polyfill of node:crypto succeeded)
//   B) webpush.setVapidDetails() does not throw with real VAPID env vars
//   C) webpush.generateVAPIDKeys() returns a base64url keypair with sane sizes
//
// Phase 6 D-06 locked the import to `https://esm.sh/web-push@3.6.7`. If the
// CDN-polyfilled ECDH path breaks (see Deno issue #18416), we fall back to
// `npm:web-push@3.6.7` and Plan 03 inherits that decision.
//
// NOTA: o plano referia-se a `_smoke-push`, mas Supabase rejeita nomes de
// função iniciados por underscore (regex `^[A-Za-z][A-Za-z0-9_-]*$`). Nome
// final em prod: `smoke-push`.
//
// smoke-push: mantido como diagnóstico R-L1 — redeploy on-demand se
// web-push esm.sh falhar (atualização do Deno runtime ou do web-push).
// Validado em 2026-05-28. NÃO deletar ao final da phase.
//
// Deploy:
//   supabase functions deploy smoke-push --no-verify-jwt
//
// Smoke (PowerShell):
//   curl -sS "https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/smoke-push" `
//        -H "apikey: $env:VITE_SUPABASE_ANON_KEY"
//
// @ts-nocheck (URL imports + Deno.env não resolvem no TS Node — Deno runtime resolve em prod)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import webpush from 'https://esm.sh/web-push@3.6.7'

interface SmokeResult {
  ok: boolean
  library_loaded: boolean
  set_vapid_details_ok: boolean
  generated_keys_ok: boolean
  public_key_length: number | null
  private_key_length: number | null
  errors: string[]
  variant: 'esm.sh' | 'npm:'
  checked_at: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async () => {
  const result: SmokeResult = {
    ok: false,
    library_loaded: false,
    set_vapid_details_ok: false,
    generated_keys_ok: false,
    public_key_length: null,
    private_key_length: null,
    errors: [],
    variant: 'esm.sh',
    checked_at: new Date().toISOString(),
  }

  // A) Library import resolved
  try {
    if (webpush && typeof webpush.setVapidDetails === 'function') {
      result.library_loaded = true
    } else {
      result.errors.push('A: webpush.setVapidDetails is not a function')
    }
  } catch (e) {
    result.errors.push(`A: import failed — ${(e as Error)?.message ?? String(e)}`)
  }

  // B) setVapidDetails with real env secrets (D-07)
  const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:comunicacao.consej@gmail.com'

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    result.errors.push('B: VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY missing from Supabase Secrets')
  } else if (result.library_loaded) {
    try {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
      result.set_vapid_details_ok = true
    } catch (e) {
      result.errors.push(`B: setVapidDetails threw — ${(e as Error)?.message ?? String(e)}`)
    }
  }

  // C) generateVAPIDKeys (exercises ECDH P-256 — Deno polyfill landmine)
  if (result.library_loaded) {
    try {
      const keys = webpush.generateVAPIDKeys()
      const pubLen = typeof keys?.publicKey === 'string' ? keys.publicKey.length : 0
      const privLen = typeof keys?.privateKey === 'string' ? keys.privateKey.length : 0
      result.public_key_length = pubLen
      result.private_key_length = privLen

      // Expected sizes for base64url-encoded P-256 keypair:
      //   public:  65 raw bytes → base64url ~87 chars (range 80–95 tolerates impl differences)
      //   private: 32 raw bytes → base64url ~43 chars (range 40–50)
      const pubOk = pubLen >= 80 && pubLen <= 95
      const privOk = privLen >= 40 && privLen <= 50

      if (pubOk && privOk) {
        result.generated_keys_ok = true
      } else {
        result.errors.push(
          `C: key lengths out of expected range — public=${pubLen} (want 80-95), private=${privLen} (want 40-50)`,
        )
      }
    } catch (e) {
      result.errors.push(`C: generateVAPIDKeys threw — ${(e as Error)?.message ?? String(e)}`)
    }
  }

  result.ok = result.library_loaded && result.set_vapid_details_ok && result.generated_keys_ok

  // Return 200 even on partial failure — we want the diagnostic shape, not a 500.
  return json(result, 200)
})
