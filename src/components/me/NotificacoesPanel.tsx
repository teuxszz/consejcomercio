import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Save, History } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { usePreferenciasNotif, useSalvarPrefs } from '@/hooks/usePreferenciasNotif'
import {
  usePushSubscriptions,
  useSubscribePush,
} from '@/hooks/usePushSubscriptions'
import { canSubscribePush } from '@/lib/pwa'
import type { PreferenciasNotif, TipoNotif } from '@/types'

const TIPOS: { id: TipoNotif; label: string; descricao: string }[] = [
  { id: 'tarefa',    label: 'Tarefas',    descricao: 'Quando alguém te atribuir uma tarefa' },
  { id: 'cadencia',  label: 'Cadência',   descricao: 'Lembretes diários do seu pipeline' },
  { id: 'renovacao', label: 'Renovação',  descricao: 'Contratos próximos do vencimento' },
  { id: 'indicacao', label: 'Indicação',  descricao: 'Nova indicação atribuída a você' },
]

const DEFAULT_PREFS: PreferenciasNotif = {
  // push: false (Phase 6 D-04 smart default — usuário liga manualmente após instalar PWA)
  tarefa:    { slack: false, email: true, push: false },
  cadencia:  { slack: false, email: true, push: false },
  renovacao: { slack: false, email: true, push: false },
  indicacao: { slack: false, email: true, push: false },
}

function prefsEqual(a: PreferenciasNotif, b: PreferenciasNotif): boolean {
  for (const t of TIPOS) {
    if (a[t.id].slack !== b[t.id].slack) return false
    if (a[t.id].email !== b[t.id].email) return false
    if (a[t.id].push !== b[t.id].push) return false
  }
  return true
}

function pushDisabledMessage(reason: 'ios-not-standalone' | 'unsupported' | 'denied'): string {
  if (reason === 'ios-not-standalone') {
    return 'Instale o app primeiro: toque em Compartilhar → Adicionar à Tela na barra do Safari.'
  }
  if (reason === 'denied') {
    return 'Você bloqueou notificações. Reative em Configurações do navegador → Notificações.'
  }
  return 'Seu navegador não suporta notificações push.'
}

export function NotificacoesPanel() {
  const { data: perfil, isLoading: loadingPerfil } = useMeuPerfil()
  const { data: prefs, isLoading: loadingPrefs } = usePreferenciasNotif(perfil?.id ?? null)
  const salvar = useSalvarPrefs()

  // ── Phase 6 — Push (D-12, D-13, R-L5) ──────────────────────────────────────
  const pushGate = useMemo(() => canSubscribePush(), [])
  const subs = usePushSubscriptions(perfil?.id ?? null)
  const subscribeMutation = useSubscribePush()

  const [draft, setDraft] = useState<PreferenciasNotif | null>(null)

  // Dep estável: usa perfil?.id (string) em vez do objeto perfil para evitar
  // resets espúrios quando o objeto perfil é re-criado entre re-renders.
  useEffect(() => {
    if (prefs) setDraft(prefs)
    else if (!loadingPrefs && perfil?.id) setDraft(DEFAULT_PREFS)
  }, [prefs, loadingPrefs, perfil?.id])

  function toggle(tipo: TipoNotif, canal: 'slack' | 'email', value: boolean) {
    setDraft(d => d
      ? { ...d, [tipo]: { ...d[tipo], [canal]: value } }
      : d,
    )
  }

  /**
   * Permission flow inline (D-12, R-L5):
   *  - OFF: só atualiza draft (rows em push_subscriptions ficam — D-03)
   *  - ON 1ª vez (permission=default): requestPermission → se granted, subscribe + draft ON; se denied, rollback + toast
   *  - ON com permission=granted: subscribe se ainda não tem sub no DB; draft ON
   */
  async function handlePushToggle(tipo: TipoNotif, next: boolean) {
    if (!perfil?.id) return

    // Caso A: desligar — não precisa permission, só atualiza draft
    if (!next) {
      setDraft(prev => prev
        ? { ...prev, [tipo]: { ...prev[tipo], push: false } }
        : prev,
      )
      return
    }

    // Sanity: se o gate está bloqueado, nem chega aqui (Switch disabled),
    // mas guard defensivo extra
    if (!pushGate.ok) {
      toast.error(pushDisabledMessage(pushGate.reason ?? 'unsupported'))
      return
    }

    // Caso B: ligar pela 1ª vez — permission=default
    if (Notification.permission === 'default') {
      // optimistic
      setDraft(prev => prev
        ? { ...prev, [tipo]: { ...prev[tipo], push: true } }
        : prev,
      )
      try {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') {
          toast.error('Permissão negada')
          // rollback (R-L5)
          setDraft(prev => prev
            ? { ...prev, [tipo]: { ...prev[tipo], push: false } }
            : prev,
          )
          return
        }
        // permission granted — persiste subscription no DB
        await subscribeMutation.mutateAsync({ perfilId: perfil.id })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao ativar push')
        // rollback (R-L5)
        setDraft(prev => prev
          ? { ...prev, [tipo]: { ...prev[tipo], push: false } }
          : prev,
        )
      }
      return
    }

    // Caso C: permission já granted — só atualiza draft; se ainda não tem sub no DB, cria
    if (Notification.permission === 'granted') {
      if (subs.data && subs.data.length === 0) {
        try {
          await subscribeMutation.mutateAsync({ perfilId: perfil.id })
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Erro ao ativar push')
          return
        }
      }
      setDraft(prev => prev
        ? { ...prev, [tipo]: { ...prev[tipo], push: true } }
        : prev,
      )
    }
    // Caso D: permission='denied' → pushGate.ok=false já barrou acima
  }

  async function handleSave() {
    if (!perfil?.id || !draft) return
    try {
      await salvar.mutateAsync({ perfilId: perfil.id, prefs: draft })
      toast.success('Preferências salvas!')
    } catch {
      // toast.error já é chamado pelo hook em onError
    }
  }

  if (loadingPerfil || loadingPrefs || !draft) {
    return <div className="text-center py-16 text-fg4">Carregando...</div>
  }

  const dirty = prefs ? !prefsEqual(draft, prefs) : true
  const pushBlocked = !pushGate.ok
  const pushBlockMsg = pushBlocked
    ? pushDisabledMessage(pushGate.reason ?? 'unsupported')
    : null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-2xl space-y-6">
        <div className="bg-card rounded-2xl border p-6">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: '#0089ac' }}
            >
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Notificações</h2>
              <p className="text-xs text-muted-foreground">
                Escolha onde receber cada tipo de notificação.
              </p>
            </div>
          </div>

          <p className="text-xs text-fg4 mb-5 mt-3">
            Smart default: <strong>Email</strong> ligado para todos os tipos; <strong>Slack</strong> só ativo se você tem usuário Slack configurado no perfil; <strong>Push</strong> precisa instalar o app primeiro.
          </p>

          {/* Matriz 4×3 (Phase 6 D-12, D-13) */}
          <div className="space-y-1">
            {/* Cabeçalho */}
            <div
              className="grid grid-cols-[1fr_auto_auto_auto] gap-6 items-center px-3 py-2 text-xs font-semibold text-fg4 uppercase tracking-wider border-b"
              style={{ borderColor: 'var(--alpha-border)' }}
            >
              <span>Tipo</span>
              <span className="w-14 text-center">Slack</span>
              <span className="w-14 text-center">E-mail</span>
              <span className="w-14 text-center">Push</span>
            </div>

            {TIPOS.map(t => (
              <div
                key={t.id}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-6 items-center px-3 py-3 rounded-lg hover:bg-[var(--alpha-bg-xs)] transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{t.label}</p>
                  <p className="text-xs text-fg4 mt-0.5">{t.descricao}</p>
                </div>
                <div className="w-14 flex justify-center">
                  <Switch
                    checked={draft[t.id].slack}
                    onCheckedChange={v => toggle(t.id, 'slack', v)}
                    aria-label={`${t.label} via Slack`}
                  />
                </div>
                <div className="w-14 flex justify-center">
                  <Switch
                    checked={draft[t.id].email}
                    onCheckedChange={v => toggle(t.id, 'email', v)}
                    aria-label={`${t.label} via E-mail`}
                  />
                </div>
                <div className="w-14 flex justify-center">
                  {pushBlocked ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {/* span wrapper para que Tooltip funcione mesmo com Switch disabled */}
                        <span className="inline-flex">
                          <Switch
                            checked={false}
                            disabled
                            aria-label={`${t.label} via Push (indisponível)`}
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent role="tooltip" className="max-w-xs">
                        {pushBlockMsg}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Switch
                      checked={draft[t.id].push}
                      onCheckedChange={v => handlePushToggle(t.id, v)}
                      aria-label={`${t.label} via Push`}
                      disabled={subscribeMutation.isPending}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer: salvar + link histórico */}
          <div
            className="flex items-center justify-between mt-6 pt-5 border-t"
            style={{ borderColor: 'var(--alpha-border)' }}
          >
            <Link
              to="/me/notificacoes-historico"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <History className="w-4 h-4" />
              Ver histórico de envios
            </Link>
            <Button
              onClick={handleSave}
              disabled={!dirty || salvar.isPending}
              className="gap-2"
              style={{ backgroundColor: '#0089ac', color: '#fff' }}
            >
              <Save className="w-4 h-4" />
              {salvar.isPending ? 'Salvando...' : 'Salvar preferências'}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
