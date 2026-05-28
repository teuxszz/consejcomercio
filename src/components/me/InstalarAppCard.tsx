import { useEffect, useState } from 'react'
import { Download, Smartphone, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isIOS, isStandalone } from '@/lib/pwa'

/**
 * Tipo do evento `beforeinstallprompt` (Chrome/Edge).
 * Não exposto pelos types do DOM lib até hoje, então declaramos aqui.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

/**
 * Card persistente em /me/preferencias (Phase 6 D-09) que oferece instalar
 * o CRM como PWA. Diferente do `InstallAppBanner` (topo do CRM, dismissable),
 * este card sempre está visível enquanto o app NÃO estiver instalado —
 * "porta sempre aberta" para o usuário decidir instalar quando quiser ativar push.
 *
 * 3 cenários (Pitfall 9):
 *  A. Chrome com beforeinstallprompt capturado → botão "Instalar app"
 *  B. iOS Safari não-standalone → instruções manuais "Compartilhar → Adicionar à Tela"
 *  C. Outros (Chrome sem deferredPrompt, Firefox, etc.) → instrução genérica do menu
 *
 * Early-return null quando isStandalone() === true (D-09).
 */
export function InstalarAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(() => isStandalone())

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    function onAppInstalled() {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  // Pitfall 9: NÃO renderiza nada quando já instalado (display-mode standalone)
  if (installed) return null

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setInstalled(true)
    }
    setDeferredPrompt(null)
  }

  const onIOSNotStandalone = isIOS() && !isStandalone()

  return (
    <div className="bg-card rounded-2xl border p-6 max-w-2xl">
      {/* Caso A: Chrome com deferredPrompt — botão direto */}
      {deferredPrompt && !onIOSNotStandalone && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: '#0089ac' }}
            >
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Instale o CRM como app</h2>
              <p className="text-xs text-muted-foreground">
                Receba notificações push e acesse direto da tela inicial.
              </p>
            </div>
          </div>
          <Button
            onClick={handleInstall}
            className="gap-2 mt-2"
            style={{ backgroundColor: '#0089ac', color: '#fff' }}
          >
            <Download className="w-4 h-4" />
            Instalar app
          </Button>
        </>
      )}

      {/* Caso B: iOS Safari não-standalone — instruções manuais */}
      {onIOSNotStandalone && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: '#0089ac' }}
            >
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Instale o CRM no seu iPhone</h2>
              <p className="text-xs text-muted-foreground">
                Para receber notificações push, é preciso instalar o app primeiro.
              </p>
            </div>
          </div>
          <ol className="space-y-2 mt-4 text-sm text-foreground">
            <li className="flex gap-2">
              <span className="font-semibold text-fg4 shrink-0">1.</span>
              <span>
                Toque no botão <strong>Compartilhar</strong>{' '}
                <Share2 className="w-3.5 h-3.5 inline-block align-text-bottom" /> na barra do Safari.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-fg4 shrink-0">2.</span>
              <span>
                Role e toque em <strong>Adicionar à Tela de Início</strong>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-fg4 shrink-0">3.</span>
              <span>
                Toque em <strong>Adicionar</strong> no canto superior direito.
              </span>
            </li>
          </ol>
          <p className="text-xs text-fg4 mt-4">
            Pronto! Abra o ícone CONSEJ da tela inicial para ativar notificações push.
          </p>
        </>
      )}

      {/* Caso C: Chrome sem deferredPrompt + não-iOS — instrução genérica */}
      {!deferredPrompt && !onIOSNotStandalone && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: '#0089ac' }}
            >
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Instale o CRM como app</h2>
              <p className="text-xs text-muted-foreground">
                Use o menu do seu navegador → <strong>Instalar app</strong> ou{' '}
                <strong>Adicionar à tela inicial</strong>.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
