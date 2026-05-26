import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from 'react-router-dom'
import { differenceInDays } from 'date-fns'
import type { Lead } from '@/types'
import type { Perfil } from '@/hooks/usePerfis'
import { LEAD_SOURCE_LABELS, TERMINAL_STAGES } from '@/lib/constants'
import { formatRelative } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Calendar, MessageCircle, Clock, UserRoundPlus, Check, Send, Target } from 'lucide-react'
import { useUpdateLead } from '@/hooks/useLeads'
import { useInteracoes } from '@/hooks/useInteracoes'
import { useIcpFit } from '@/hooks/useIcpFit'
import { getNextCadenciaPoint } from '@/lib/cadencia'

const SEGMENT_COLORS: Record<string, { bg: string; color: string }> = {
  empresa_junior:        { bg: 'rgba(139,92,246,0.15)',  color: '#c4b5fd' },
  empresa_senior:        { bg: 'rgba(59,130,246,0.15)',  color: '#93c5fd' },
  startup:               { bg: 'rgba(16,185,129,0.15)',  color: '#6ee7b7' },
  escritorio_arquitetura:{ bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24' },
  empresa_design:        { bg: 'rgba(236,72,153,0.15)',  color: '#f9a8d4' },
  empresa_gestao:        { bg: 'rgba(6,182,212,0.15)',   color: '#67e8f9' },
  outro:                 { bg: 'var(--alpha-border)', color: 'var(--text-soft-a)' },
}

// Map pipeline stage → mensagens page stage
const STAGE_TO_MSG: Record<string, string> = {
  classificacao:             'primeiro_contato',
  levantamento_oportunidade: 'diagnostico',
  educar_lead:               'followup',
  proposta_comercial:        'proposta',
  negociacao:                'negociacao',
  stand_by:                  'followup',
}

// Left border color per pipeline stage
const STAGE_ACCENT: Record<string, string> = {
  classificacao:             'rgba(56,189,248,0.85)',
  levantamento_oportunidade: 'rgba(99,130,246,0.85)',
  educar_lead:               'rgba(139,92,246,0.85)',
  proposta_comercial:        'rgba(245,158,11,0.85)',
  negociacao:                'rgba(249,115,22,0.85)',
  stand_by:                  'rgba(148,163,184,0.70)',
  ganho_assessoria:          'rgba(34,197,94,0.85)',
  ganho_consultoria:         'rgba(16,185,129,0.85)',
  perdido:                   'rgba(239,68,68,0.85)',
  cancelado:                 'rgba(244,63,94,0.85)',
}

// Subtle card background tint per stage
const STAGE_TINT: Record<string, string> = {
  classificacao:             'rgba(56,189,248,0.04)',
  levantamento_oportunidade: 'rgba(99,130,246,0.04)',
  educar_lead:               'rgba(139,92,246,0.05)',
  proposta_comercial:        'rgba(245,158,11,0.04)',
  negociacao:                'rgba(249,115,22,0.04)',
  stand_by:                  'var(--alpha-bg-xs)',
  ganho_assessoria:          'rgba(34,197,94,0.05)',
  ganho_consultoria:         'rgba(16,185,129,0.05)',
  perdido:                   'rgba(239,68,68,0.04)',
  cancelado:                 'rgba(244,63,94,0.04)',
}

// Stagnant thresholds in days per stage
const STAGNANT_DAYS: Record<string, number> = {
  classificacao:             3,
  levantamento_oportunidade: 5,
  educar_lead:               7,
  proposta_comercial:        7,
  negociacao:                10,
  stand_by:                  14,
}

// ─── Avatar helpers ────────────────────────────────────────────────────────────

function getInitials(nome: string): string {
  const parts = nome.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return nome.slice(0, 2).toUpperCase()
}

const AVATAR_PALETTE = [
  { bg: 'rgba(139,92,246,0.28)', fg: '#c4b5fd' },
  { bg: 'rgba(59,130,246,0.28)',  fg: '#93c5fd' },
  { bg: 'rgba(16,185,129,0.28)', fg: '#6ee7b7' },
  { bg: 'rgba(245,158,11,0.28)', fg: '#fbbf24' },
  { bg: 'rgba(6,182,212,0.28)',   fg: '#67e8f9' },
  { bg: 'rgba(236,72,153,0.28)', fg: '#f9a8d4' },
  { bg: 'rgba(239,68,68,0.28)',   fg: '#fca5a5' },
]

function avatarColor(nome: string) {
  let h = 0
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

// ─── Shared mini avatar ────────────────────────────────────────────────────────

function MemberAvatar({ perfil, size = 22 }: { perfil: Perfil; size?: number }) {
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

// ─── Component ────────────────────────────────────────────────────────────────

type Props = { lead: Lead; isDragging?: boolean; stageId?: string; perfis?: Perfil[] }

export function LeadCard({ lead, isDragging = false, stageId, perfis = [] }: Props) {
  const navigate    = useNavigate()
  const updateLead  = useUpdateLead()
  const { data: allInteracoes = [] } = useInteracoes()
  const { isFit }   = useIcpFit()
  const icpFit      = isFit(lead)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } =
    useSortable({ id: lead.id })

  const style = { transform: CSS.Transform.toString(transform), transition }

  // Stagnant check
  const daysInStage = differenceInDays(new Date(), new Date(lead.updated_at))
  const threshold   = STAGNANT_DAYS[lead.status] ?? 7
  const isStagnant  = daysInStage >= threshold &&
    !(lead.status in { ganho_assessoria: 1, ganho_consultoria: 1, perdido: 1, cancelado: 1 })

  // Cadência check
  const leadInteracoes = allInteracoes.filter(i => i.lead_id === lead.id)
  const nextCadencia   = getNextCadenciaPoint(lead, leadInteracoes)
  const isTerminal     = (TERMINAL_STAGES as readonly string[]).includes(lead.status)

  // Message shortcut URL — includes telefone for MensagensPage pre-fill (WA-02)
  const msgUrl = '/mensagens?' + new URLSearchParams({
    nome:     lead.nome,
    empresa:  lead.empresa ?? '',
    stage:    nextCadencia?.point.stage ?? (STAGE_TO_MSG[lead.status] ?? 'primeiro_contato'),
    leadId:   lead.id,
    telefone: lead.telefone ?? '',
  }).toString()

  // Cadência chip style by urgency (D-08)
  function cadenciaChipStyle(daysUntil: number): { background: string; color: string; borderColor: string } {
    if (daysUntil <= 0) return { background: 'rgba(239,68,68,0.18)', color: 'var(--red-hi, #f87171)', borderColor: 'rgba(239,68,68,0.30)' }
    if (daysUntil === 1) return { background: 'rgba(251,191,36,0.18)', color: 'var(--amber-hi, #fbbf24)', borderColor: 'rgba(251,191,36,0.30)' }
    return { background: 'rgba(37,211,102,0.18)', color: '#4ade80', borderColor: 'rgba(37,211,102,0.30)' }
  }

  const accentColor = isStagnant
    ? 'rgba(249,115,22,0.90)'
    : (STAGE_ACCENT[stageId ?? lead.status] ?? 'var(--alpha-bg-lg)')
  const tintBg = isStagnant
    ? 'rgba(249,115,22,0.06)'
    : (STAGE_TINT[stageId ?? lead.status] ?? 'var(--alpha-bg-sm)')

  const assignedPerfil = perfis.find(p => p.id === lead.responsavel_id) ?? null

  function handleAssign(perfil: Perfil) {
    updateLead.mutate({ id: lead.id, responsavel_id: perfil.id, responsavel: perfil.nome })
  }
  function handleUnassign() {
    updateLead.mutate({ id: lead.id, responsavel_id: null, responsavel: null })
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: tintBg,
        border: '1px solid var(--alpha-border)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 8,
      }}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-lg p-3 mb-2 cursor-grab active:cursor-grabbing select-none transition-all',
        (isSortDragging || isDragging) && 'opacity-50 rotate-1',
      )}
      onClick={(e) => {
        if (!isSortDragging) {
          e.stopPropagation()
          navigate(`/leads/${lead.id}`)
        }
      }}
    >
      {/* ── Header row: name / company + avatar + stagnant badge ── */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight truncate">{lead.nome}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{lead.empresa}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {/* ── Assignee avatar / picker ── */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                title={assignedPerfil
                  ? `Responsável: ${assignedPerfil.nome} — clique para trocar`
                  : 'Atribuir responsável'}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                className="rounded-full focus:outline-none hover:opacity-80 transition-opacity"
              >
                {assignedPerfil
                  ? <MemberAvatar perfil={assignedPerfil} size={22} />
                  : (
                    <div
                      className="rounded-full flex items-center justify-center"
                      style={{
                        width: 22, height: 22,
                        background: 'var(--alpha-bg-sm)',
                        border: '1.5px dashed var(--alpha-border-md)',
                      }}
                    >
                      <UserRoundPlus style={{ width: 11, height: 11, color: 'var(--text-dim-a)' }} />
                    </div>
                  )
                }
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={5}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                style={{
                  zIndex: 9999,
                  minWidth: 210,
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 10,
                  padding: '4px',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.40)',
                }}
              >
                <div
                  className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--text-soft-a)' }}
                >
                  Responsável pelo lead
                </div>

                {perfis.length === 0 && (
                  <div className="px-2.5 py-2 text-xs" style={{ color: 'var(--text-dim-a)' }}>
                    Nenhum consultor cadastrado
                  </div>
                )}

                {perfis.map(p => {
                  const isActive = lead.responsavel_id === p.id
                  return (
                    <DropdownMenu.Item
                      key={p.id}
                      onSelect={() => handleAssign(p)}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer text-sm outline-none"
                      style={{ color: 'hsl(var(--foreground))' }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'hsl(var(--secondary))'
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = ''
                      }}
                    >
                      <MemberAvatar perfil={p} size={26} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">{p.nome}</p>
                        {p.cargo && (
                          <p className="text-[10px] leading-tight truncate" style={{ color: 'var(--text-soft-a)' }}>
                            {p.cargo}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <Check style={{ width: 13, height: 13, color: '#6bd0e7', flexShrink: 0 }} />
                      )}
                    </DropdownMenu.Item>
                  )
                })}

                {lead.responsavel_id && (
                  <>
                    <div style={{ height: 1, background: 'hsl(var(--border))', margin: '4px 0' }} />
                    <DropdownMenu.Item
                      onSelect={handleUnassign}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-xs outline-none"
                      style={{ color: 'var(--text-soft-a)' }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'hsl(var(--secondary))'
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = ''
                      }}
                    >
                      Remover responsável
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* Stagnant badge */}
          {isStagnant && (
            <div
              title={`Parado há ${daysInStage} dias`}
              className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium"
              style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}
            >
              <Clock className="w-2.5 h-2.5" />
              {daysInStage}d
            </div>
          )}

          {/* Cadência badge — D-point colorido por urgência (D-03, D-04, D-07, D-08) */}
          {nextCadencia && !isStagnant && (
            <button
              title={`${nextCadencia.point.label} — ${nextCadencia.point.descricao}`}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); navigate(msgUrl) }}
              className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 border"
              style={cadenciaChipStyle(nextCadencia.daysUntil)}
            >
              <Send className="w-2.5 h-2.5" />
              {`D${nextCadencia.point.dia} · ${
                nextCadencia.daysUntil <= 0 ? 'hoje'
                : nextCadencia.daysUntil === 1 ? 'amanhã'
                : `${nextCadencia.daysUntil}d`
              }`}
            </button>
          )}
        </div>
      </div>

      {/* ── Tags row ── */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span
          className="text-xs px-1.5 py-0.5 rounded-full font-medium"
          style={SEGMENT_COLORS[lead.segmento]
            ? { background: SEGMENT_COLORS[lead.segmento].bg, color: SEGMENT_COLORS[lead.segmento].color }
            : { background: 'var(--alpha-border)', color: 'var(--text-soft-a)' }
          }
        >
          {lead.segmento.replace(/_/g, ' ')}
        </span>
        {icpFit && (
          <span
            title="Perfil bate com o ICP observado / configurado — alta probabilidade de fechar"
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold border"
            style={{
              background: 'rgba(34,197,94,0.12)',
              borderColor: 'rgba(34,197,94,0.35)',
              color: '#4ade80',
            }}
          >
            <Target className="w-2.5 h-2.5" />
            ICP
          </span>
        )}
        <span className="text-xs text-fg4">
          {LEAD_SOURCE_LABELS[lead.origem] || lead.origem}
        </span>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <p className="text-xs text-fg4">{formatRelative(lead.created_at)}</p>
          {lead.data_diagnostico && (
            <div className="flex items-center gap-1 text-xs" style={{ color: '#a78bfa' }}>
              <Calendar className="w-3 h-3" />
              <span>{new Date(lead.data_diagnostico).toLocaleDateString('pt-BR')}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {/* Quick message button */}
          <button
            title="Gerar mensagem de abordagem"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); navigate(msgUrl) }}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors"
            style={{ color: 'var(--text-soft-a)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = '#6bd0e7'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(0,137,172,0.12)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-soft-a)'
              ;(e.currentTarget as HTMLElement).style.background = ''
            }}
          >
            <MessageCircle className="w-3 h-3" />
            mensagem
          </button>

          {/* WhatsApp shortcut — só quando tem telefone e não é terminal (WA-01) */}
          {lead.telefone && !isTerminal && (
            <button
              title="Abrir mensagem WhatsApp"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); navigate(msgUrl) }}
              className="p-1 rounded hover:bg-[var(--alpha-bg-sm)] transition-colors"
              style={{ color: '#25D366' }}
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
