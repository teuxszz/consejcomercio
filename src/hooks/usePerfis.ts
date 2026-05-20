import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type RoleConsej = 'diretor' | 'gerente' | 'coordenador' | 'consultor'
export type TipoPerfil = 'interno' | 'cliente'

export interface Perfil {
  id: string
  nome: string
  cargo?: string
  bio?: string
  foto_url?: string
  email?: string
  tipo?: TipoPerfil
  role?: RoleConsej | null
  gestor_id?: string | null
  slack_user_id?: string | null
  created_at: string
}

export function usePerfis() {
  return useQuery<Perfil[]>({
    queryKey: ['perfis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perfis')
        .select('*')
        .order('nome')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useMeuPerfil() {
  return useQuery<Perfil | null>({
    // staleTime:0 + gcTime:0 ensures no cross-session cache bleed:
    // each mount fetches fresh data for whoever is currently logged in.
    queryKey: ['perfil-meu'],
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data } = await supabase.from('perfis').select('*').eq('id', user.id).maybeSingle()
      if (data) return data

      // No profile row yet (new user, trigger not fired or backfill pending).
      // Auto-create a minimal row so every user always has their own profile.
      const emailPrefix = (user.email ?? 'usuario').split('@')[0]
      const defaultName = emailPrefix.replace(/[._-]/g, ' ')
      const { data: created } = await supabase
        .from('perfis')
        .insert({ id: user.id, email: user.email ?? '', nome: defaultName })
        .select()
        .single()
      return created ?? null
    },
  })
}

export function useSalvarPerfil() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (perfil: Partial<Perfil> & { id: string }) => {
      const { data, error } = await supabase
        .from('perfis')
        .upsert([perfil], { onConflict: 'id' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfis'] })
      qc.invalidateQueries({ queryKey: ['perfil-meu'] })
    },
  })
}

export function useUploadAvatar() {
  return useMutation({
    mutationFn: async ({ userId, file }: { userId: string; file: File }) => {
      const ext = file.name.split('.').pop()
      const path = `${userId}/avatar.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      return data.publicUrl
    },
  })
}
