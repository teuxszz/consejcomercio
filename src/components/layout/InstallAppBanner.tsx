import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isStandalone } from '@/lib/pwa'

// `beforeinstallprompt` não está em todos os TS libs default (D-09, RESEARCH §7).
// Tipagem mínima alinhada com Web App Manifest spec.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'consej_install_banner_dismissed'

/**
 * Banner topo CRM convidando a instalar PWA (D-09).
 *
 * Lifecycle (Chrome desktop/Android):
 *  - Captura `beforeinstallprompt` e armazena `deferredPrompt`
 *  - Render só ocorre se: !installed && !dismissed && deferredPrompt presente
 *  - "Instalar" dispara `prompt()` nativo do browser
 *  - "Fechar" (X) persiste dismiss em localStorage (pattern consej_kanban_hint)
 *  - `appinstalled` event esconde banner imediatamente (Pitfall 9)
 *
 * iOS Safari não dispara `beforeinstallprompt` → banner naturalmente nunca aparece;
 * usuário é guiado pelo `InstalarAppCard` em /me/preferencias (Plan 04).
 *
 * macOS Safari install via Dock (Pitfall 10) também não dispara o evento — known limitation.
 */
export function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1'
  )
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Early return triple — banner inerte por padrão
  if (installed || dismissed || !deferredPrompt) return null

  async function handleInstallClick() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    // Independente de accepted/dismissed, descartar o prompt (Chrome só dispara 1x por sessão)
    setDeferredPrompt(null)
    // Se accepted → `appinstalled` listener seta installed=true automaticamente.
    // Se dismissed → não persistir dismiss extra: Chrome lembra na próxima sessão.
  }

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  return (
    <div
      role="region"
      aria-label="Instalação do app"
      className="flex items-center gap-3 rounded-lg border px-4 py-2 text-sm"
      style={{
        background: 'rgba(0,137,172,0.10)',
        borderColor: 'rgba(0,137,172,0.35)',
        color: 'var(--cyan-hi, #0089ac)',
      }}
    >
      <Download className="w-5 h-5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Instale o CONSEJ CRM como app</p>
        <p className="text-xs opacity-90">Receba notificações push e abra direto da home screen.</p>
      </div>
      <Button size="sm" onClick={handleInstallClick} style={{ backgroundColor: '#0089ac' }} className="h-8 text-xs">
        Instalar
      </Button>
      <button
        onClick={handleDismiss}
        aria-label="Fechar"
        className="p-1 opacity-70 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
