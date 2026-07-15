import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Testes RLS para lead_sla (migration 041 — Phase 999.1 Plan 01).
//
// Valida:
//   - SLA-02: fase terminal/stand_by NÃO tem linha lead_sla (relógio pausado);
//     fase ativa TEM linha com deadline_at > entered_at.
//   - SLA-03: registrar interacoes_lead marca resolved_at na linha aberta.
//   - RLS: consultor (authenticated) não consegue INSERT/UPDATE direto em
//     lead_sla; só enxerga (SELECT) linhas de leads visíveis pelo seu escopo.
//
// Pré-requisito: .env.test com QA_*, VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY.
// Sem isso, suíte é PULADA (não falha).

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

const configurado = !!(URL && ANON && SERVICE && QA.diretorEmail && QA.diretorPass && QA.consultorEmail && QA.consultorPass)

async function login(email: string, password: string): Promise<{ client: SupabaseClient; uid: string }> {
  const client = createClient(URL!, ANON!, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`Login falhou para ${email}: ${error?.message}`)
  return { client, uid: data.user.id }
}

describe.skipIf(!configurado)('RLS — lead_sla (migration 041)', () => {
  let consultor: SupabaseClient
  let service: SupabaseClient
  let consultorUid: string

  // Fixtures criadas via service_role — tagueadas e nunca deletadas (DB
  // compartilhada; segue o pattern de rls-role-aware.test.ts /
  // notificacoes_envios.test.ts).
  const TAG = '[RLS-TEST-041]'

  async function criarLead(status: string): Promise<string> {
    const { data, error } = await service
      .from('leads')
      .insert({
        nome: `${TAG} lead`,
        empresa: `${TAG} empresa`,
        segmento: 'outro',
        telefone: '',
        origem: 'outro',
        status,
        responsavel_id: consultorUid,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`Falha ao criar lead fixture: ${error?.message}`)
    return data.id as string
  }

  beforeAll(async () => {
    const c = await login(QA.consultorEmail!, QA.consultorPass!)
    service = createClient(URL!, SERVICE!, { auth: { persistSession: false } })
    consultor = c.client
    consultorUid = c.uid
  })

  it('SLA-02: fase ativa (classificacao) tem linha lead_sla com deadline_at > entered_at', async () => {
    const leadId = await criarLead('classificacao')
    const { data, error } = await service
      .from('lead_sla')
      .select('lead_id, entered_at, deadline_at, resolved_at')
      .eq('lead_id', leadId)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(new Date(data!.deadline_at).getTime()).toBeGreaterThan(new Date(data!.entered_at).getTime())
    expect(data!.resolved_at).toBeNull()
  })

  it('SLA-02: mudar para stand_by apaga a linha lead_sla (relógio pausado)', async () => {
    const leadId = await criarLead('classificacao')
    // Garante que a linha existia antes da mudança
    const before = await service.from('lead_sla').select('lead_id').eq('lead_id', leadId).maybeSingle()
    expect(before.data).not.toBeNull()

    const { error: updateError } = await service.from('leads').update({ status: 'stand_by' }).eq('id', leadId)
    expect(updateError).toBeNull()

    const after = await service.from('lead_sla').select('lead_id').eq('lead_id', leadId).maybeSingle()
    expect(after.data).toBeNull()
  })

  it('SLA-02: mudar para fase terminal (ganho_assessoria) apaga a linha lead_sla', async () => {
    const leadId = await criarLead('classificacao')
    const before = await service.from('lead_sla').select('lead_id').eq('lead_id', leadId).maybeSingle()
    expect(before.data).not.toBeNull()

    const { error: updateError } = await service.from('leads').update({ status: 'ganho_assessoria' }).eq('id', leadId)
    expect(updateError).toBeNull()

    const after = await service.from('lead_sla').select('lead_id').eq('lead_id', leadId).maybeSingle()
    expect(after.data).toBeNull()
  })

  it('SLA-03: registrar interacoes_lead marca resolved_at na linha lead_sla aberta', async () => {
    const leadId = await criarLead('classificacao')
    const before = await service.from('lead_sla').select('resolved_at').eq('lead_id', leadId).maybeSingle()
    expect(before.data?.resolved_at).toBeNull()

    const { error: interacaoError } = await service.from('interacoes_lead').insert({
      lead_id: leadId,
      canal: 'whatsapp',
      stage_msg: 'followup',
      setor: 'geral',
      corpo: `${TAG} interacao de teste`,
    })
    expect(interacaoError).toBeNull()

    const after = await service.from('lead_sla').select('resolved_at').eq('lead_id', leadId).maybeSingle()
    expect(after.data?.resolved_at).not.toBeNull()
  })

  it('RLS: consultor (authenticated) não consegue INSERT direto em lead_sla', async () => {
    const leadId = await criarLead('classificacao')
    const { error, data } = await consultor
      .from('lead_sla')
      .insert({ lead_id: leadId, stage: 'classificacao', deadline_at: new Date().toISOString() })
      .select('lead_id')
    const blocked = error !== null || (data ?? []).length === 0
    expect(blocked, 'INSERT direto em lead_sla via authenticated deve ser bloqueado').toBe(true)
  })

  it('RLS: consultor (authenticated) não consegue UPDATE direto em lead_sla', async () => {
    const leadId = await criarLead('classificacao')
    const { error, data } = await consultor
      .from('lead_sla')
      .update({ resolved_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .select('lead_id')
    const blocked = error !== null || (data ?? []).length === 0
    expect(blocked, 'UPDATE direto em lead_sla via authenticated deve ser bloqueado').toBe(true)
  })

  it('RLS: consultor só enxerga (SELECT) linhas lead_sla de leads no seu escopo', async () => {
    const leadId = await criarLead('classificacao')
    const { data, error } = await consultor
      .from('lead_sla')
      .select('lead_id')
      .eq('lead_id', leadId)
    expect(error).toBeNull()
    // Lead foi criado com responsavel_id = consultorUid → deve enxergar
    expect((data ?? []).length).toBeGreaterThanOrEqual(1)
  })
})

describe.skipIf(configurado)('RLS — lead_sla — PULADO', () => {
  it('configure .env.test + SUPABASE_SERVICE_ROLE_KEY para rodar os testes de RLS', () => {
    expect(true).toBe(true)
  })
})
