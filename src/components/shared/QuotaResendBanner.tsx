import { AlertTriangle } from 'lucide-react'
import { useQuotaResend } from '@/hooks/useQuotaResend'

const QUOTA_HOJE_LIMITE = 100
const QUOTA_MES_LIMITE = 3000
const THRESHOLD = 0.8 // D-15: 80% warning

/**
 * Banner de aviso de quota Resend (D-15).
 * Renderiza apenas quando max(hoje/100, mes/3000) > 0.8.
 *
 * NÃO inclui RequireRole interno — o caller decide o gate de role
 * (em AdocaoPage / ConfiguracoesPage envolver com `RequireRole atLeast="coordenador"`).
 */
export function QuotaResendBanner() {
  const { data: quota } = useQuotaResend()
  if (!quota) return null

  const pctHoje = quota.hoje / QUOTA_HOJE_LIMITE
  const pctMes = quota.mes / QUOTA_MES_LIMITE
  const pctMax = Math.max(pctHoje, pctMes)

  if (pctMax <= THRESHOLD) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border p-3 text-sm"
      style={{
        background: 'rgba(245,158,11,0.10)',
        borderColor: 'rgba(245,158,11,0.35)',
        color: 'var(--amber-hi, #fbbf24)',
      }}
    >
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="space-y-0.5">
        <p className="font-medium">
          Quota Resend: {quota.hoje}/{QUOTA_HOJE_LIMITE} hoje · {quota.mes}/{QUOTA_MES_LIMITE} mês
        </p>
        <p className="text-xs opacity-90">
          Aproximando do limite — novos e-mails podem ser dropados (status <code>dropped_quota</code>). Slack DM continua disparando normal.
        </p>
      </div>
    </div>
  )
}
