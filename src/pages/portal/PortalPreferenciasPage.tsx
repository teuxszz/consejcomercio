// Phase 5 (Plan 4): UI placeholder. Phase 7 (Portal Docs) habilitará:
//  - Migration 036 adiciona chave 'documentos' em perfis.preferencias_notif
//  - Switch passa a ser controlado via usePreferenciasNotif + useSalvarPrefs
//    (mesmo pattern de src/components/me/NotificacoesPanel.tsx)
//  - Edge function notify-cliente-aprovacao ativa o disparo real do e-mail
//  - Decisão D-10 (Plan 4): placeholder Switch desabilitado — sem mutation
//    nem persistência local, pois nenhuma notif real ao cliente é disparada
//    em Phase 5 (Open Question 3 RESEARCH confirma).
import { BellRing, Mail, MessageCircle, Smartphone, Info } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

export function PortalPreferenciasPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BellRing className="w-4 h-4" style={{ color: '#6bd0e7' }} />
          <span style={{
            fontSize: 11,
            color: 'rgba(107,208,231,0.6)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            Notificações
          </span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
          Preferências de notificação
        </h1>
        <p style={{
          fontSize: 13,
          color: 'rgba(107,208,231,0.65)',
          marginTop: 6,
          lineHeight: 1.6,
        }}>
          Em breve você poderá escolher como receber notificações sobre documentos
          enviados, propostas para aprovar e atualizações do seu projeto.
        </p>
      </div>

      {/* Info card — Phase 7 explainer */}
      <div className="rounded-xl p-4 flex gap-3 items-start" style={{
        background: 'rgba(0,137,172,0.08)',
        border: '1px solid rgba(0,137,172,0.2)',
      }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{
          background: 'rgba(0,137,172,0.2)',
          border: '1px solid rgba(0,137,172,0.35)',
        }}>
          <Info className="w-4 h-4" style={{ color: '#6bd0e7' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
            Esta seção é preparatória
          </p>
          <p style={{ fontSize: 12, color: 'rgba(107,208,231,0.7)', lineHeight: 1.6 }}>
            As notificações para clientes serão ativadas na <strong style={{ color: '#6bd0e7' }}>Phase 7
            (Portal do Cliente — Documentos)</strong>. Quando ligada, você receberá um e-mail
            sempre que houver um documento pendente da sua aprovação.
          </p>
        </div>
      </div>

      {/* Documentos × email Switch (disabled placeholder) */}
      <div className="rounded-xl overflow-hidden" style={{
        background: 'rgba(0,8,29,0.5)',
        border: '1px solid rgba(107,208,231,0.1)',
      }}>
        <div className="px-4 py-3" style={{
          borderBottom: '1px solid rgba(107,208,231,0.08)',
          background: 'rgba(0,137,172,0.04)',
        }}>
          <p style={{
            fontSize: 11,
            color: 'rgba(107,208,231,0.55)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
          }}>
            Documentos
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-4" style={{ opacity: 0.55 }}>
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{
              background: 'rgba(107,208,231,0.06)',
              border: '1px solid rgba(107,208,231,0.1)',
            }}>
              <Mail className="w-4 h-4" style={{ color: 'rgba(107,208,231,0.5)' }} />
            </div>
            <div className="min-w-0">
              <p style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>
                Receber e-mails sobre documentos pendentes de aprovação
              </p>
              <p style={{ fontSize: 11, color: 'rgba(107,208,231,0.5)', marginTop: 4 }}>
                Disponível na próxima fase.
              </p>
            </div>
          </div>
          <Switch disabled checked={false} aria-label="Notificações de documentos por e-mail (em breve)" />
        </div>
      </div>

      {/* Footer note — outros canais */}
      <div className="rounded-xl p-4" style={{
        background: 'rgba(0,8,29,0.4)',
        border: '1px solid rgba(107,208,231,0.08)',
      }}>
        <p style={{
          fontSize: 11,
          color: 'rgba(107,208,231,0.45)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          marginBottom: 8,
        }}>
          Outros canais
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{
            background: 'rgba(107,208,231,0.05)',
            border: '1px solid rgba(107,208,231,0.1)',
          }}>
            <Smartphone className="w-3.5 h-3.5" style={{ color: 'rgba(107,208,231,0.5)' }} />
            <span style={{ fontSize: 12, color: 'rgba(107,208,231,0.55)' }}>Push — em fases futuras</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{
            background: 'rgba(107,208,231,0.05)',
            border: '1px solid rgba(107,208,231,0.1)',
          }}>
            <MessageCircle className="w-3.5 h-3.5" style={{ color: 'rgba(107,208,231,0.5)' }} />
            <span style={{ fontSize: 12, color: 'rgba(107,208,231,0.55)' }}>WhatsApp — em fases futuras</span>
          </div>
        </div>
      </div>
    </div>
  )
}
