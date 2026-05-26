import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Toaster } from 'sonner'
import { ArrowLeft, Users, Gift } from 'lucide-react'

type Portal = 'crm' | 'cliente'
type Mode   = 'login' | 'forgot' | 'sent'

async function destinoParaPerfil(portal: Portal, userId: string): Promise<string> {
  const { data: perfil } = await supabase
    .from('perfis')
    .select('tipo')
    .eq('id', userId)
    .single()
  // Cliente nunca pode ver o CRM — sempre cai no portal.
  if (perfil?.tipo === 'cliente') return '/portal'
  // Interno respeita a escolha do seletor.
  return portal === 'cliente' ? '/portal' : '/dashboard'
}

export function LoginPage() {
  const navigate = useNavigate()
  const [portal,        setPortal]        = useState<Portal>('crm')
  const [mode,          setMode]          = useState<Mode>('login')
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [loading,       setLoading]       = useState(false)
  const [activeEmail,   setActiveEmail]   = useState<string | null>(null)
  const [switchingAcct, setSwitchingAcct] = useState(false)

  // Detecta sessão residual sem redirecionar — usuário pode querer trocar de conta
  // ou navegar pro outro portal manualmente.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user.email) setActiveEmail(session.user.email)
    })
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      toast.error('Email ou senha inválidos.')
      return
    }
    const destino = await destinoParaPerfil(portal, data.session.user.id)
    navigate(destino, { replace: true })
  }

  async function handleIrParaPortalAtivo() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setActiveEmail(null)
      return
    }
    const destino = await destinoParaPerfil(portal, session.user.id)
    navigate(destino, { replace: true })
  }

  async function handleTrocarConta() {
    setSwitchingAcct(true)
    await supabase.auth.signOut()
    setActiveEmail(null)
    setEmail('')
    setPassword('')
    setSwitchingAcct(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) {
      console.error('[resetPasswordForEmail]', error)
      const msg = error.message || ''
      if (/rate limit|too many|seconds/i.test(msg)) {
        toast.error('Muitas tentativas. Aguarde alguns minutos e tente novamente.')
      } else if (/redirect|url/i.test(msg)) {
        toast.error('URL de redirecionamento não autorizada no Supabase.')
      } else if (/smtp|email/i.test(msg)) {
        toast.error('Falha no envio do e-mail (SMTP). Verifique a configuração no Supabase.')
      } else {
        toast.error(`Erro ao enviar: ${msg || 'tente novamente em instantes.'}`)
      }
    } else {
      setMode('sent')
    }
  }

  const isCliente = portal === 'cliente'

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: '#00081d',
        backgroundImage:
          'linear-gradient(rgba(0,137,172,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(0,137,172,0.10) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Toaster richColors />

      {/* Vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 70% at 50% 50%, transparent 20%, #00081d 80%)', zIndex: 1, pointerEvents: 'none' }} />
      {/* Teal glow */}
      <div style={{ position: 'absolute', width: 600, height: 600, background: 'radial-gradient(circle, rgba(0,137,172,0.10) 0%, transparent 70%)', borderRadius: '50%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 760 }}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="CONSEJ" style={{ height: 52, width: 'auto', objectFit: 'contain', marginBottom: 6, filter: 'brightness(1.05)' }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: '#6bd0e7', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>
            Consultoria Jurídica Júnior
          </span>
        </div>

        {/* Selector de portal */}
        {mode === 'login' && (
          <div className="flex gap-2 justify-center mb-5">
            <button
              onClick={() => { setPortal('crm'); setEmail(''); setPassword('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: !isCliente ? 'rgba(0,137,172,0.25)' : 'transparent',
                border: !isCliente ? '1px solid rgba(0,137,172,0.6)' : '1px solid rgba(107,208,231,0.15)',
                color: !isCliente ? '#6bd0e7' : 'rgba(107,208,231,0.4)',
              }}
            >
              <Users style={{ width: 14, height: 14 }} />
              Equipe CONSEJ
            </button>
            <button
              onClick={() => { setPortal('cliente'); setEmail(''); setPassword('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: isCliente ? 'rgba(129,140,248,0.2)' : 'transparent',
                border: isCliente ? '1px solid rgba(129,140,248,0.6)' : '1px solid rgba(107,208,231,0.15)',
                color: isCliente ? '#a5b4fc' : 'rgba(107,208,231,0.4)',
              }}
            >
              <Gift style={{ width: 14, height: 14 }} />
              Portal de Indicações
            </button>
          </div>
        )}

        {/* Card */}
        <div
          style={{
            background: 'var(--alpha-bg-xs)',
            border: `1px solid ${isCliente ? 'rgba(129,140,248,0.25)' : 'rgba(107,208,231,0.18)'}`,
            borderRadius: 16,
            padding: '36px',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 0 0 1px rgba(0,137,172,0.06), 0 24px 64px rgba(0,0,0,0.5)',
            maxWidth: 400,
            margin: '0 auto',
          }}
        >
          {mode === 'login' && (
            <>
              {activeEmail && (
                <div
                  style={{
                    background: 'rgba(0,137,172,0.10)',
                    border: '1px solid rgba(0,137,172,0.25)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginBottom: 16,
                    fontSize: 12,
                    color: 'rgba(107,208,231,0.95)',
                    lineHeight: 1.5,
                  }}
                >
                  Você já está conectado como <strong style={{ color: '#fff' }}>{activeEmail}</strong>.
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={handleIrParaPortalAtivo}
                      style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,137,172,0.4)', border: '1px solid rgba(0,137,172,0.6)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                    >
                      Continuar como esta conta
                    </button>
                    <button
                      type="button"
                      onClick={handleTrocarConta}
                      disabled={switchingAcct}
                      style={{ fontSize: 11, color: 'rgba(107,208,231,0.85)', background: 'transparent', border: '1px solid rgba(107,208,231,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                    >
                      {switchingAcct ? 'Saindo...' : 'Sair e usar outra conta'}
                    </button>
                  </div>
                </div>
              )}

              {/* Cabeçalho do card */}
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: isCliente ? 'rgba(129,140,248,0.15)' : 'rgba(0,137,172,0.15)' }}>
                  {isCliente
                    ? <Gift style={{ width: 14, height: 14, color: '#a5b4fc' }} />
                    : <Users style={{ width: 14, height: 14, color: '#6bd0e7' }} />}
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong-a)' }}>
                  {isCliente ? 'Portal de Indicações' : 'Acesso da equipe'}
                </p>
              </div>
              <p style={{ fontSize: 12, color: isCliente ? 'rgba(165,180,252,0.7)' : 'var(--cyan-mid)', marginBottom: 24 }}>
                {isCliente
                  ? 'Acompanhe seus tokens e recompensas'
                  : 'Acesso restrito à equipe CONSEJ'}
              </p>

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <Label htmlFor="email" style={{ color: 'var(--text-dim-a)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Email
                  </Label>
                  <Input
                    id="email" type="email" placeholder="seu@email.com"
                    value={email} onChange={e => setEmail(e.target.value)} required
                    style={{ marginTop: 6, background: 'var(--alpha-bg-sm)', border: '1px solid var(--alpha-border-md)', color: 'var(--text-strong-a)' }}
                    className={`placeholder:text-[var(--text-dim-a)] ${isCliente ? 'focus:border-[rgba(129,140,248,0.5)]' : 'focus:border-[rgba(0,137,172,0.6)]'}`}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label htmlFor="password" style={{ color: 'var(--text-dim-a)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Senha
                    </Label>
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      style={{ fontSize: 11, color: 'var(--cyan-lo)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(107,208,231,0.9)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--cyan-lo)')}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <Input
                    id="password" type="password" placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} required
                    style={{ background: 'var(--alpha-bg-sm)', border: '1px solid var(--alpha-border-md)', color: 'var(--text-strong-a)' }}
                    className={`placeholder:text-[var(--text-dim-a)] ${isCliente ? 'focus:border-[rgba(129,140,248,0.5)]' : 'focus:border-[rgba(0,137,172,0.6)]'}`}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full text-white mt-1"
                  style={{
                    background: isCliente
                      ? 'linear-gradient(135deg, #7c3aed, #5b21b6)'
                      : 'linear-gradient(135deg, #0089ac, #006d88)',
                    boxShadow: isCliente
                      ? '0 4px 16px rgba(124,58,237,0.35)'
                      : '0 4px 16px rgba(0,137,172,0.35)',
                    border: 'none', height: 42, fontSize: 14, fontWeight: 600, letterSpacing: '0.02em',
                  }}
                  disabled={loading}
                >
                  {loading ? 'Entrando...' : isCliente ? 'Entrar no Portal →' : 'Entrar →'}
                </Button>
              </form>

              <p className="text-center mt-5" style={{ fontSize: 11, color: 'var(--text-dim-a)', lineHeight: 1.6 }}>
                {isCliente
                  ? <>Indique e ganhe tokens.<br />Convites enviados pela equipe CONSEJ.</>
                  : <>Acesso apenas para membros da equipe.<br />Contate o administrador para criar sua conta.</>}
              </p>
            </>
          )}

          {mode === 'forgot' && (
            <>
              <button
                type="button"
                onClick={() => setMode('login')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--cyan-lo)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 20 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(107,208,231,0.9)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--cyan-lo)')}
              >
                <ArrowLeft style={{ width: 13, height: 13 }} /> Voltar ao login
              </button>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong-a)', marginBottom: 4 }}>Recuperar senha</p>
              <p style={{ fontSize: 12, color: 'var(--cyan-mid)', marginBottom: 24 }}>Enviaremos um link de redefinição para seu e-mail</p>
              <form onSubmit={handleForgot} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <Label htmlFor="email-forgot" style={{ color: 'var(--text-dim-a)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Email
                  </Label>
                  <Input
                    id="email-forgot" type="email" placeholder="seu@email.com"
                    value={email} onChange={e => setEmail(e.target.value)} required
                    style={{ marginTop: 6, background: 'var(--alpha-bg-sm)', border: '1px solid var(--alpha-border-md)', color: 'var(--text-strong-a)' }}
                    className="focus:border-[rgba(0,137,172,0.6)] placeholder:text-[var(--text-dim-a)]"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full text-white mt-1"
                  style={{ background: 'linear-gradient(135deg, #0089ac, #006d88)', boxShadow: '0 4px 16px rgba(0,137,172,0.35)', border: 'none', height: 42, fontSize: 14, fontWeight: 600 }}
                  disabled={loading}
                >
                  {loading ? 'Enviando...' : 'Enviar link de recuperação →'}
                </Button>
              </form>
            </>
          )}

          {mode === 'sent' && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,137,172,0.15)', border: '1px solid rgba(0,137,172,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <span style={{ fontSize: 22 }}>✉</span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong-a)', marginBottom: 8 }}>E-mail enviado!</p>
              <p style={{ fontSize: 12, color: 'var(--cyan-mid)', lineHeight: 1.7, marginBottom: 24 }}>
                Verifique sua caixa de entrada em<br />
                <span style={{ color: 'rgba(107,208,231,0.9)', fontWeight: 500 }}>{email}</span><br />
                e clique no link para redefinir sua senha.
              </p>
              <button
                type="button"
                onClick={() => { setMode('login'); setEmail('') }}
                style={{ fontSize: 12, color: 'var(--cyan-lo)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Voltar ao login
              </button>
            </div>
          )}
        </div>
      </div>

      <span style={{ position: 'absolute', bottom: 24, right: 24, fontSize: 10, color: 'rgba(107,208,231,0.3)', letterSpacing: '0.08em', zIndex: 10 }}>
        CONSEJ CRM v2
      </span>
    </div>
  )
}
