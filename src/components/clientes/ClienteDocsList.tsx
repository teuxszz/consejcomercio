import { useMemo, useState, type ReactNode } from 'react'
import {
  FileText, Download, ChevronDown, ChevronUp, FileImage, File as FileIcon,
} from 'lucide-react'
import { useClienteDocs, useDownloadDoc } from '@/hooks/useClienteDocs'
import { groupByRoot, type DocRootGroup } from '@/lib/doc-grouping'
import { EmptyState } from '@/components/ui/empty-state'
import type { ClienteDoc, StatusDoc, TagDoc } from '@/types'
import { cn } from '@/lib/utils'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const dia = 86_400_000
  if (diff < dia) return 'hoje'
  if (diff < 2 * dia) return 'ontem'
  if (diff < 7 * dia) return `${Math.floor(diff / dia)} dias atrás`
  return d.toLocaleDateString('pt-BR')
}

const TAG_LABELS: Record<TagDoc, string> = {
  proposta: 'Proposta',
  contrato: 'Contrato',
  relatorio: 'Relatório',
  outro: 'Outro',
}

const STATUS_LABELS: Record<Exclude<StatusDoc, null>, { label: string; cls: string }> = {
  pending:               { label: 'Aguardando',  cls: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
  aprovado:              { label: 'Aprovado',    cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' },
  revisao_solicitada:    { label: 'Revisão',     cls: 'text-orange-400 bg-orange-400/10 border-orange-400/30' },
  superseded:            { label: 'Substituído', cls: 'text-muted-foreground bg-muted/10 border-muted/30' },
}

function iconForMime(mime: string) {
  if (mime.startsWith('image/')) return FileImage
  if (mime === 'application/pdf') return FileText
  return FileIcon
}

// ─── Component ──────────────────────────────────────────────────────────────

export interface ClienteDocsListProps {
  clienteId: string
  mode?: 'portal' | 'crm'
  /** Slot Slice 4: pluga AprovacaoButtons / SubirNovaVersaoButton por doc. */
  actionsSlot?: (doc: ClienteDoc) => ReactNode
}

export function ClienteDocsList({ clienteId, mode = 'crm', actionsSlot }: ClienteDocsListProps) {
  const { data: docs = [], isLoading } = useClienteDocs(clienteId)
  const downloadDoc = useDownloadDoc()
  const roots = useMemo(() => groupByRoot(docs), [docs])

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className={cn(
              'h-16 rounded-xl animate-pulse',
              mode === 'portal' ? 'bg-white/5' : 'bg-muted/40',
            )}
          />
        ))}
      </div>
    )
  }

  if (roots.length === 0) {
    if (mode === 'portal') {
      return (
        <div
          className="rounded-xl border p-8 text-center"
          style={{
            background: 'rgba(0,137,172,0.08)',
            borderColor: 'rgba(0,137,172,0.2)',
            color: 'rgba(107,208,231,0.7)',
            fontSize: 13,
          }}
        >
          Nenhum documento ainda
        </div>
      )
    }
    return (
      <EmptyState
        icon={FileText}
        title="Nenhum documento ainda"
        description="Quando algum doc for enviado por você ou pelo cliente, ele aparece aqui."
      />
    )
  }

  return (
    <ul className="space-y-2">
      {roots.map(group => (
        <DocCard
          key={group.current.id}
          group={group}
          mode={mode}
          onDownload={d => downloadDoc.mutate(d)}
          actionsSlot={actionsSlot}
        />
      ))}
    </ul>
  )
}

// ─── DocCard ────────────────────────────────────────────────────────────────

interface DocCardProps {
  group: DocRootGroup
  mode: 'portal' | 'crm'
  onDownload: (doc: ClienteDoc) => void
  actionsSlot?: (doc: ClienteDoc) => ReactNode
}

function DocCard({ group, mode, onDownload, actionsSlot }: DocCardProps) {
  const { current, history } = group
  const [showHistory, setShowHistory] = useState(false)
  const Icon = iconForMime(current.mime_type)
  const hasHistory = history.length > 0

  if (mode === 'portal') {
    return (
      <li
        className="rounded-xl p-4"
        style={{
          background: 'rgba(0,137,172,0.08)',
          border: '1px solid rgba(0,137,172,0.2)',
        }}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(0,137,172,0.15)' }}>
            <Icon className="w-4 h-4" style={{ color: '#6bd0e7' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate" style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>
              {current.nome_arquivo}
              {hasHistory && (
                <span style={{ fontSize: 11, color: '#6bd0e7', marginLeft: 8, fontWeight: 600 }}>
                  v{current.versao} (atual)
                </span>
              )}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span style={{ fontSize: 10, color: 'rgba(107,208,231,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {TAG_LABELS[current.tag]}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>•</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                {current.autor_tipo === 'cliente' ? 'Cliente' : 'CONSEJ'}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>•</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                {formatBytes(current.tamanho_bytes)}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>•</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                {formatRelative(current.created_at)}
              </span>
              {current.status && current.status !== 'superseded' && (
                <>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>•</span>
                  <StatusBadge status={current.status} />
                </>
              )}
            </div>
            {hasHistory && (
              <button
                type="button"
                onClick={() => setShowHistory(s => !s)}
                className="mt-2 flex items-center gap-1"
                style={{ fontSize: 11, color: '#6bd0e7' }}
              >
                {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showHistory ? 'Ocultar versões anteriores' : `Ver ${history.length} versão${history.length > 1 ? 'es' : ''} anterior${history.length > 1 ? 'es' : ''}`}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDownload(current)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors shrink-0"
            style={{
              background: 'rgba(0,137,172,0.2)',
              color: '#6bd0e7',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <Download className="w-3.5 h-3.5" /> Baixar
          </button>
        </div>
        {actionsSlot && <div className="mt-3">{actionsSlot(current)}</div>}
        {showHistory && hasHistory && (
          <ul className="mt-3 pl-12 space-y-1.5">
            {history.map(old => (
              <li key={old.id} className="flex items-center gap-2" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                <span style={{ color: '#6bd0e7' }}>v{old.versao}</span>
                <span className="truncate flex-1">{old.nome_arquivo}</span>
                <span>{formatRelative(old.created_at)}</span>
                <button
                  type="button"
                  onClick={() => onDownload(old)}
                  className="flex items-center gap-1"
                  style={{ color: '#6bd0e7' }}
                >
                  <Download className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  // ─── CRM mode (Tailwind tokens) ─────────────────────────────────────────
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {current.nome_arquivo}
            {hasHistory && (
              <span className="text-xs text-primary ml-2 font-semibold">v{current.versao} (atual)</span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
            <span className="uppercase tracking-wide text-[10px]">{TAG_LABELS[current.tag]}</span>
            <span>•</span>
            <span>{current.autor_tipo === 'cliente' ? 'Cliente' : 'CONSEJ'}</span>
            <span>•</span>
            <span>{formatBytes(current.tamanho_bytes)}</span>
            <span>•</span>
            <span>{formatRelative(current.created_at)}</span>
            {current.status && current.status !== 'superseded' && (
              <>
                <span>•</span>
                <StatusBadge status={current.status} />
              </>
            )}
          </div>
          {hasHistory && (
            <button
              type="button"
              onClick={() => setShowHistory(s => !s)}
              className="mt-2 flex items-center gap-1 text-xs text-primary hover:text-primary/80"
            >
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showHistory ? 'Ocultar versões anteriores' : `Ver ${history.length} versão${history.length > 1 ? 'es' : ''} anterior${history.length > 1 ? 'es' : ''}`}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDownload(current)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium shrink-0"
        >
          <Download className="w-3.5 h-3.5" /> Baixar
        </button>
      </div>
      {actionsSlot && <div className="mt-3">{actionsSlot(current)}</div>}
      {showHistory && hasHistory && (
        <ul className="mt-3 pl-12 space-y-1.5">
          {history.map(old => (
            <li key={old.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-primary font-semibold">v{old.versao}</span>
              <span className="truncate flex-1">{old.nome_arquivo}</span>
              <span>{formatRelative(old.created_at)}</span>
              <button
                type="button"
                onClick={() => onDownload(old)}
                className="text-primary hover:text-primary/80"
              >
                <Download className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// ─── StatusBadge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Exclude<StatusDoc, null> }) {
  const cfg = STATUS_LABELS[status]
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium border', cfg.cls)}>
      {cfg.label}
    </span>
  )
}
