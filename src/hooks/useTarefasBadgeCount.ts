import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useTarefasBadgeCount(userId: string | undefined): number {
  const [count, setCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (!userId) return
    const { count: c } = await supabase
      .from('tarefas')
      .select('id', { count: 'exact', head: true })
      .eq('atribuido_a_id', userId)
      .in('status', ['aberta', 'em_andamento'])
    setCount(c ?? 0)
  }, [userId])

  useEffect(() => {
    if (!userId) { setCount(0); return }
    fetchCount()
  }, [userId, fetchCount])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`tarefas-badge-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas', filter: `atribuido_a_id=eq.${userId}` }, () => {
        fetchCount()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchCount])

  return count
}
