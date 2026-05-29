import { useBucketUsage } from '@/hooks/useBucketUsage'
import { AlertTriangle } from 'lucide-react'

// Phase 7 — Plan 04b — Banner uso de bucket cliente-docs (D-06).
//
// Mostra X MB / 1024 MB; warning visual (vermelho + AlertTriangle) quando
// > 80% (ratio > 0.8). Componente sempre deve ser envolto por
// <RequireRole atLeast="coordenador"> pelo caller (T-07-13 mitigation).
// A RPC bucket_usage_bytes é callable por authenticated; o ponto de gate é
// puramente visual no client.

const QUOTA_BYTES = 1_073_741_824 // 1 GB free tier (configurável p/ paid)
const WARN_RATIO = 0.8

export function BucketUsageBanner() {
  const { data: bytes = 0, isLoading } = useBucketUsage('cliente-docs')
  if (isLoading) return null

  const mb = Math.round(bytes / (1024 * 1024))
  const totalMb = Math.round(QUOTA_BYTES / (1024 * 1024))
  const ratio = bytes / QUOTA_BYTES
  const isWarning = ratio > WARN_RATIO

  return (
    <div
      className="p-4 rounded-xl border flex items-center gap-3"
      style={{
        background: isWarning ? 'rgba(239,68,68,0.1)' : 'var(--alpha-bg-sm)',
        borderColor: isWarning ? 'rgba(239,68,68,0.3)' : 'var(--alpha-border)',
      }}
    >
      {isWarning && <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          Uso do bucket cliente-docs: <strong>{mb} MB</strong> / {totalMb} MB ({Math.round(ratio * 100)}%)
        </p>
        {isWarning && (
          <p className="text-xs text-destructive mt-1">
            Acima de 80% — considerar limpeza de docs antigos ou upgrade de plano.
          </p>
        )}
      </div>
    </div>
  )
}
