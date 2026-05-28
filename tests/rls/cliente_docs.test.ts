import { describe, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Testes RLS para cliente_docs (migration 037, Phase 7 D-08).
//
// Wave 0 scaffold (RED) — Plan 02 implementa a migration; Plan 03/04a implementa
// hooks. Casos cobrem threat register §T-07-01..06:
//
//   - cliente vê SELECT só dos próprios docs (perfis.cliente_id_associado = cliente_id)
//   - consultor vê SELECT só dos clientes onde é responsavel_id
//   - coord+ vê SELECT de tudo via is_at_least('coordenador')
//   - INSERT com cliente_id != perfil.cliente_id bloqueado
//   - DELETE rejeita anon (auth.uid() IS NULL)
//   - UPDATE de status só por cliente (aprovar/solicitar revisão) ou consultor
//     responsável (upload nova versão)
//
// Bootstrap copiado de tests/rls/push_subscriptions.test.ts (Phase 6 analog).
// Pré-requisito: .env.test com QA_*, VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY.
// Sem isso, suíte é PULADA via describe.skipIf.

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

// Tag para isolar fixtures desta suíte
const TAG = '[RLS-TEST-037]'

describe.skipIf(!configurado)('RLS — cliente_docs (migration 037)', () => {
  it.todo(`${TAG} cliente SELECT vê apenas docs do próprio cliente_id_associado`)
  it.todo(`${TAG} consultor SELECT vê apenas docs de clientes onde é responsavel_id`)
  it.todo(`${TAG} coord+ SELECT vê todos via is_at_least('coordenador')`)
  it.todo(`${TAG} cliente INSERT com cliente_id != próprio é rejeitado`)
  it.todo(`${TAG} DELETE rejeita anon (auth.uid IS NULL)`)
  it.todo(`${TAG} cliente UPDATE status=aprovado em doc requer_aprovacao=true OK`)
  it.todo(`${TAG} consultor UPDATE de doc próprio (upload nova versão) OK`)
})
