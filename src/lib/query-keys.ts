export const QUERY_KEYS = {
  leads: {
    all: ['leads'] as const,
    byId: (id: string) => ['leads', id] as const,
    byStage: (stage: string) => ['leads', 'stage', stage] as const,
  },
  diagnosticos: {
    byLead: (leadId: string) => ['diagnosticos', 'lead', leadId] as const,
  },
  clientes: {
    all: ['clientes'] as const,
    byId: (id: string) => ['clientes', id] as const,
  },
  contratos: {
    all: ['contratos'] as const,
    byId: (id: string) => ['contratos', id] as const,
    byCliente: (clienteId: string) => ['contratos', 'cliente', clienteId] as const,
  },
  demandas: {
    all: ['demandas'] as const,
    byContrato: (contratoId: string) => ['demandas', 'contrato', contratoId] as const,
    byCliente: (clienteId: string) => ['demandas', 'cliente', clienteId] as const,
  },
  indicacoes: {
    all: ['indicacoes'] as const,
    byId: (id: string) => ['indicacoes', id] as const,
  },
  parceiros: {
    all: ['parceiros'] as const,
    byId: (id: string) => ['parceiros', id] as const,
  },
  oportunidades: {
    all: ['oportunidades'] as const,
    byCliente: (clienteId: string) => ['oportunidades', 'cliente', clienteId] as const,
  },
  audit_logs: {
    all: ['audit_logs'] as const,
    byEntity: (tabela: string, id: string) => ['audit_logs', tabela, id] as const,
  },
  interacoes: {
    all: ['interacoes'] as const,
    byLead: (leadId: string) => ['interacoes', 'lead', leadId] as const,
  },
  tarefas: {
    all: ['tarefas'] as const,
    mine: (userId: string) => ['tarefas', 'mine', userId] as const,
    byEntidade: (tipo: string, id: string) => ['tarefas', 'entidade', tipo, id] as const,
  },
  pos_juniors: {
    all: ['pos_juniors'] as const,
    byId: (id: string) => ['pos_juniors', id] as const,
  },
  objecoes: {
    all: ['objecoes'] as const,
    byId: (id: string) => ['objecoes', id] as const,
  },
  configuracoes: ['configuracoes'] as const,
  dashboard: ['dashboard'] as const,
}
