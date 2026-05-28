import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { PIPELINE_STAGES, TERMINAL_STAGES, TERMINAL_WON_STAGES, TERMINAL_LOST_STAGES } from '@/lib/constants'
import { KanbanColumn } from './KanbanColumn'
import { LeadCard } from './LeadCard'
import { LostReasonModal } from './LostReasonModal'
import { ConvertToClientModal } from './ConvertToClientModal'
import { NewLeadModal } from './NewLeadModal'
import { useUpdateLeadStatus } from '@/hooks/useLeads'
import { usePerfis } from '@/hooks/usePerfis'
import { Button } from '@/components/ui/button'
import { Plus, Eye, EyeOff, X } from 'lucide-react'
import type { Lead } from '@/types'

type Props = { leads: Lead[] }

export function KanbanBoard({ leads }: Props) {
  const { data: perfis = [] } = usePerfis()
  const [activeCard, setActiveCard] = useState<Lead | null>(null)
  const [showNewLead, setShowNewLead] = useState(false)
  const [lostLead, setLostLead] = useState<{ id: string; status: string } | null>(null)
  const [convertLead, setConvertLead] = useState<{ lead: Lead; stage: string } | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [showDragHint, setShowDragHint] = useState(() => !localStorage.getItem('consej_kanban_hint'))
  const updateStatus = useUpdateLeadStatus()

  const visibleStages = showClosed
    ? PIPELINE_STAGES
    : PIPELINE_STAGES.filter(s => !(TERMINAL_STAGES as readonly string[]).includes(s.id))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Group leads by stage
  const leadsByStage: Record<string, Lead[]> = {}
  for (const stage of PIPELINE_STAGES) {
    leadsByStage[stage.id] = leads.filter(l => l.status === stage.id)
  }

  function handleDragStart(event: DragStartEvent) {
    const found = leads.find(l => l.id === event.active.id)
    if (found) setActiveCard(found)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = event
    if (!over) return

    const leadId = active.id as string
    const overId = over.id as string

    // over.id can be a stage column OR another card — resolve to stage
    const isStage = PIPELINE_STAGES.some(s => s.id === overId)
    const newStage = isStage ? overId : (leads.find(l => l.id === overId)?.status ?? '')
    if (!newStage) return

    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.status === newStage) return

    if ((TERMINAL_LOST_STAGES as readonly string[]).includes(newStage)) {
      setLostLead({ id: leadId, status: newStage })
      return
    }
    if ((TERMINAL_WON_STAGES as readonly string[]).includes(newStage)) {
      setConvertLead({ lead, stage: newStage })
      return
    }

    updateStatus.mutate({ id: leadId, status: newStage })
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <button
          onClick={() => setShowClosed(v => !v)}
          className="flex items-center gap-1.5 text-xs text-fg4 hover:text-muted-foreground transition-colors"
        >
          {showClosed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showClosed ? 'Ocultar encerrados' : 'Ver encerrados'}
        </button>
        <Button size="sm" onClick={() => setShowNewLead(true)} className="text-white" style={{ backgroundColor: '#0089ac' }}>
          <Plus className="w-4 h-4 mr-1" /> Novo Lead
        </Button>
      </div>

      {/* Drag hint — shown once, dismissible */}
      {showDragHint && (
        <div className="flex items-center justify-between rounded-xl px-4 py-2.5 mb-3" style={{ background: 'rgba(0,137,172,0.06)', border: '1px solid rgba(0,137,172,0.20)' }}>
          <span className="text-xs" style={{ color: 'var(--cyan-hi)' }}>💡 Arraste os cards para mover um lead entre as etapas do pipeline</span>
          <button
            onClick={() => { setShowDragHint(false); localStorage.setItem('consej_kanban_hint', '1') }}
            className="p-0.5 ml-3 shrink-0" style={{ color: 'var(--cyan-lo)' }}
            aria-label="Fechar dica"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 h-full snap-x snap-mandatory md:snap-none scroll-px-3">
          {visibleStages.map(stage => (
            <KanbanColumn
              key={stage.id}
              stageId={stage.id}
              label={stage.label}
              leads={leadsByStage[stage.id] || []}
              perfis={perfis}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard && <LeadCard lead={activeCard} isDragging perfis={perfis} />}
        </DragOverlay>
      </DndContext>

      {showNewLead && <NewLeadModal open={showNewLead} onClose={() => setShowNewLead(false)} />}

      {lostLead && (
        <LostReasonModal
          open={!!lostLead}
          onConfirm={(motivo) => {
            updateStatus.mutate({ id: lostLead.id, status: lostLead.status, motivo_perda: motivo })
            setLostLead(null)
          }}
          onCancel={() => setLostLead(null)}
        />
      )}

      {convertLead && (
        <ConvertToClientModal
          lead={convertLead.lead}
          targetStage={convertLead.stage}
          open={!!convertLead}
          onClose={() => setConvertLead(null)}
        />
      )}
    </>
  )
}
