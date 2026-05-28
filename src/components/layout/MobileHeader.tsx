import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet'
import { Sidebar } from './Sidebar'

/**
 * Top bar exibido apenas em viewport < md (768px).
 * Esconde a Sidebar fixa e abre ela como Sheet drawer (esquerda).
 * Pareado com `AppLayout` que aplica `hidden md:flex` na Sidebar desktop.
 */
export function MobileHeader() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Fecha o drawer quando o usuário navega (defesa-em-profundidade — `onNavigate` no Sidebar também fecha)
  useEffect(() => { setOpen(false) }, [location.pathname])

  return (
    <header
      className="md:hidden sticky top-0 z-40 flex items-center gap-3 px-3 border-b"
      style={{
        backgroundColor: '#00081d',
        borderColor: '#000d32',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: '0.5rem',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 0.75rem)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
      }}
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            aria-label="Abrir menu"
            className="p-2 rounded-lg transition-colors active:bg-white/10"
            style={{ color: '#6bd0e7' }}
          >
            <Menu className="w-5 h-5" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="p-0 w-[280px] sm:w-[300px] border-r-0"
          style={{ backgroundColor: '#00081d' }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu de navegação</SheetTitle>
            <SheetDescription>Acesse todas as áreas do CRM CONSEJ</SheetDescription>
          </SheetHeader>
          <Sidebar
            className="w-full h-full border-0"
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <img src="/logo.png" alt="CONSEJ" className="h-7 w-auto" />

      <button
        onClick={() => {
          const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
          window.dispatchEvent(ev)
        }}
        aria-label="Buscar"
        className="ml-auto p-2 rounded-lg transition-colors active:bg-white/10"
        style={{ color: '#6bd0e7' }}
      >
        <Search className="w-5 h-5" />
      </button>
    </header>
  )
}
