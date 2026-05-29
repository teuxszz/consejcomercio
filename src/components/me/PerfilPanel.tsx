import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Camera, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMeuPerfil, useSalvarPerfil, useUploadAvatar } from '@/hooks/usePerfis'
import { toast } from 'sonner'

export function PerfilPanel() {
  const { data: perfil, isLoading } = useMeuPerfil()
  const salvar = useSalvarPerfil()
  const uploadAvatar = useUploadAvatar()
  const fileRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string>('')
  const [nome, setNome] = useState('')
  const [cargo, setCargo] = useState('')
  const [bio, setBio] = useState('')
  const [fotoUrl, setFotoUrl] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        setUserEmail(user.email ?? '')
      }
    })
  }, [])

  useEffect(() => {
    if (perfil) {
      setNome(perfil.nome ?? '')
      setCargo(perfil.cargo ?? '')
      setBio(perfil.bio ?? '')
      setFotoUrl(perfil.foto_url ?? '')
    }
  }, [perfil])

  async function handleSave() {
    if (!userId) return
    if (!nome.trim()) { toast.error('Nome é obrigatório'); return }
    try {
      await salvar.mutateAsync({ id: userId, nome, cargo, bio, foto_url: fotoUrl, email: userEmail })
      toast.success('Perfil salvo!')
    } catch {
      toast.error('Erro ao salvar perfil')
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Foto muito grande. Limite: 5 MB.')
      return
    }
    try {
      const url = await uploadAvatar.mutateAsync({ userId, file })
      setFotoUrl(url)
      await salvar.mutateAsync({ id: userId, nome, cargo, bio, foto_url: url, email: userEmail })
      toast.success('Foto atualizada!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Bucket not found') || msg.includes('bucket')) {
        toast.error('Bucket de storage não encontrado. Execute a migration 009 no Supabase.')
      } else {
        toast.error('Erro ao enviar foto. Tente novamente.')
      }
    }
  }

  if (isLoading) return <div className="text-center py-16 text-fg4">Carregando...</div>

  const initials = nome ? nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : '?'

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-card rounded-2xl border p-6">
        <div className="flex items-center gap-6 mb-6">
          <div className="relative">
            <div
              className="w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center text-white text-2xl font-bold cursor-pointer select-none"
              style={{ backgroundColor: '#0089ac' }}
              onClick={() => !uploadAvatar.isPending && fileRef.current?.click()}
            >
              {uploadAvatar.isPending ? (
                <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : fotoUrl ? (
                <img src={fotoUrl} alt={nome} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <button
              onClick={() => !uploadAvatar.isPending && fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center border-2 bg-card border-background hover:bg-muted transition-colors"
              title="Alterar foto"
            >
              <Camera className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          <div>
            <p className="text-xl font-semibold text-foreground">{nome || 'Sem nome'}</p>
            <p className="text-muted-foreground text-sm">{cargo || 'Sem cargo'}</p>
            <p className="text-fg4 text-xs mt-0.5">{userEmail}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg2 mb-1">Nome *</label>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome completo" className="form-control" />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg2 mb-1">Cargo</label>
              <input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ex: Assessor Jurídico" className="form-control" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg2 mb-1">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Uma breve descrição sobre você..." className="form-control resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg2 mb-1">E-mail</label>
            <input value={userEmail} disabled className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-fg4 cursor-not-allowed" />
          </div>

          <button
            onClick={handleSave}
            disabled={salvar.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: '#0089ac' }}
          >
            <Save className="w-4 h-4" />
            {salvar.isPending ? 'Salvando...' : 'Salvar perfil'}
          </button>

          <Link
            to="/me/desempenho"
            className="inline-flex items-center gap-2 text-sm text-cyan-500 hover:text-cyan-400 mt-4"
          >
            <BarChart3 className="w-4 h-4" />
            Ver meu desempenho →
          </Link>
        </div>
      </div>
    </div>
  )
}
