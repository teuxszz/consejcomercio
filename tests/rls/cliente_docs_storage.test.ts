import { describe, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Testes RLS para o bucket privado `cliente-docs` (storage.objects).
//
// Wave 0 scaffold (RED) — Plan 02 implementa as policies usando
// storage.foldername(name)[1] para extrair o `cliente_id` do path
// `{cliente_id}/{doc_id}.{ext}` (T-07-01 mitigação).
//
// Bootstrap idêntico ao tests/rls/cliente_docs.test.ts.

const envPath = resolve(__dirname, '../../.env.test')
const env: Record<string, string> = {}
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const QA = {
  diretorEmail: env.QA_DIRETOR_EMAIL,
  diretorPass: env.QA_DIRETOR_PASSWORD,
  consultorEmail: env.QA_CONSULTOR_EMAIL,
  consultorPass: env.QA_CONSULTOR_PASSWORD,
}

const configurado = !!(
  URL && ANON && SERVICE && QA.diretorEmail && QA.diretorPass && QA.consultorEmail && QA.consultorPass
)

async function login(email: string, password: string): Promise<{ client: SupabaseClient; uid: string }> {
  const client = createClient(URL!, ANON!, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`Login falhou para ${email}: ${error?.message}`)
  return { client, uid: data.user.id }
}

const TAG = '[RLS-STORAGE-037]'

describe.skipIf(!configurado)('RLS — storage.objects cliente-docs (migration 037)', () => {
  it.todo(`${TAG} cliente upload em pasta própria {cliente_id}/... OK via storage.foldername`)
  it.todo(`${TAG} cliente upload em pasta de OUTRO cliente_id é REJEITADO`)
  it.todo(`${TAG} cliente SELECT (listObjects) enumera só do próprio cliente_id`)
  it.todo(`${TAG} consultor SELECT enumera só clientes onde é responsavel_id`)
})
