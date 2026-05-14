import { usePerfis, type Perfil } from '@/hooks/usePerfis'
import { cn } from '@/lib/utils'

const AVATAR_PALETTE = [
  { bg: 'rgba(139,92,246,0.28)', fg: '#c4b5fd' },
  { bg: 'rgba(59,130,246,0.28)', fg: '#93c5fd' },
  { bg: 'rgba(16,185,129,0.28)', fg: '#6ee7b7' },
  { bg: 'rgba(245,158,11,0.28)', fg: '#fbbf24' },
  { bg: 'rgba(6,182,212,0.28)',  fg: '#67e8f9' },
  { bg: 'rgba(236,72,153,0.28)', fg: '#f9a8d4' },
  { bg: 'rgba(239,68,68,0.28)',  fg: '#fca5a5' },
]

function getInitials(nome: string): string {
  const parts = nome.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return nome.slice(0, 2).toUpperCase()
}

function avatarColor(nome: string) {
  let h = 0
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

interface AvatarProps {
  perfil: Perfil
  size?: number
}

function ResponsavelAvatar({ perfil, size = 22 }: AvatarProps) {
  const col = avatarColor(perfil.nome)
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center shrink-0 font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: perfil.foto_url ? undefined : col.bg,
        color: perfil.foto_url ? undefined : col.fg,
      }}
    >
      {perfil.foto_url
        ? <img src={perfil.foto_url} alt={perfil.nome} className="w-full h-full object-cover" />
        : getInitials(perfil.nome)
      }
    </div>
  )
}

interface BadgeProps {
  perfilId: string | null | undefined
  size?: number
  showName?: boolean
  className?: string
  emptyLabel?: string
}

export function ResponsavelBadge({
  perfilId,
  size = 22,
  showName = true,
  className,
  emptyLabel = 'Sem responsável',
}: BadgeProps) {
  const { data: perfis = [] } = usePerfis()
  const perfil = perfilId ? perfis.find(p => p.id === perfilId) : null

  if (!perfil) {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}
        title={emptyLabel}
      >
        <div
          className="rounded-full border border-dashed border-[var(--alpha-border-md)]"
          style={{ width: size, height: size }}
        />
        {showName && <span>{emptyLabel}</span>}
      </span>
    )
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      title={perfil.cargo ? `${perfil.nome} · ${perfil.cargo}` : perfil.nome}
    >
      <ResponsavelAvatar perfil={perfil} size={size} />
      {showName && (
        <span className="text-xs text-fg2 truncate max-w-[10rem]">{perfil.nome}</span>
      )}
    </span>
  )
}
