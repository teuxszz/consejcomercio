// Shared helper: lookups em `perfis` consumidos pelas edge functions notify-*.
//
// Funções puras que recebem o cliente Supabase injetado — facilita o teste
// com supabase-mock e evita carregar URL imports do Deno em Node/Vitest.
//
// @ts-nocheck (URL imports não resolvem no TS Node — Deno runtime resolve em prod)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface PreferenciasTipo {
  slack: boolean
  email: boolean
  push: boolean // push adicionado Phase 6 D-16 — D-04 default false
}

export interface PreferenciasNotif {
  tarefa:     PreferenciasTipo
  cadencia:   PreferenciasTipo
  renovacao:  PreferenciasTipo
  indicacao:  PreferenciasTipo
  // Phase 7 D-16 — aprovação/revisão de cliente_docs
  documentos: PreferenciasTipo
}

export interface Diretor {
  id: string
  email: string
}

/** Retorna o slack_user_id do perfil ou null. */
export async function findSlackUserId(
  supabase: SupabaseClient,
  perfilId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('perfis')
    .select('slack_user_id')
    .eq('id', perfilId)
    .maybeSingle<{ slack_user_id: string | null }>()
  return data?.slack_user_id ?? null
}

/** Retorna o nome do perfil ou 'Sistema' (para criado_por NULL) / 'Alguém' fallback. */
export async function findPerfilNome(
  supabase: SupabaseClient,
  perfilId: string | null,
): Promise<string> {
  if (!perfilId) return 'Sistema'
  const { data } = await supabase
    .from('perfis')
    .select('nome')
    .eq('id', perfilId)
    .maybeSingle<{ nome: string }>()
  return data?.nome ?? 'Alguém'
}

/**
 * Lê preferencias_notif do perfil. Retorna null se perfil não existe (caller
 * decide se trata como "todos OFF" ou aborta).
 */
export async function loadPrefs(
  supabase: SupabaseClient,
  perfilId: string,
): Promise<PreferenciasNotif | null> {
  const { data } = await supabase
    .from('perfis')
    .select('preferencias_notif')
    .eq('id', perfilId)
    .maybeSingle<{ preferencias_notif: PreferenciasNotif | null }>()
  return data?.preferencias_notif ?? null
}

/**
 * Lista todos os perfis com role='diretor' (id + email) — usado como fallback
 * quando o destinatário per-user é NULL (D-05).
 */
export async function findDiretores(
  supabase: SupabaseClient,
): Promise<Diretor[]> {
  const { data } = await supabase
    .from('perfis')
    .select('id, email')
    .eq('role', 'diretor')
  return (data ?? []).filter((d): d is Diretor => !!d?.id && !!d?.email)
}
