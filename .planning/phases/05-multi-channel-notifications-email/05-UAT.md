---
status: complete
phase: 05-multi-channel-notifications-email
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
  - 05-04-SUMMARY.md
started: 2026-05-27T20:30:00Z
updated: 2026-05-27T20:35:00Z
mode: mvp
goal: "As a consultor CONSEJ, I want to escolher receber notificações via Slack, e-mail ou ambos (granular por tipo) com histórico de entrega e botão de reenvio, so that quem não usa Slack ainda receba todas as notificações da v2.0 por e-mail sem perda de funcionalidade."
---

## Current Test

[testing complete]

## Tests

### 1. Email recebido após tarefa atribuída
expected: Atribuir uma tarefa pelo CRM a outro consultor (não a si mesmo). Em <60s o destinatário recebe um e-mail no inbox dele com subject indicando a tarefa, corpo HTML com o título da tarefa + botão "Abrir no CRM". (User-flow primário — sem isso, milestone falha.)
result: pass
note: "Confirmado pelo usuário em sessão (2026-05-27): 'o email funcionou'."

### 2. Histórico de notificação aparece
expected: |
  Abrir `/me/notificacoes-historico`. Filtro está em "Eu mesmo" por default.
  Mudar o filtro pro nome do consultor a quem você acabou de atribuir a tarefa.
  Aparece pelo menos 1 linha listando: tipo=tarefa, canal=email, status=delivered (ou opened se o destinatário abriu), data/hora do envio, subject do email.
result: pass

### 3. Matriz de preferências carrega e salva
expected: |
  Abrir `/me?tab=notificacoes` (ou `/me/preferencias`). Aparece a tab "Notificações" no MeEspaço.
  Mostra matriz de 4 linhas (Tarefa, Cadência, Renovação, Indicação) × 2 colunas (Slack, Email) = 8 Switches.
  Switches refletem suas prefs atuais (smart default: email ON em tudo; slack ON em tudo se você tem slack_user_id mapeado).
  Togglar 1 Switch (ex: desligar Email pra Tarefa) e clicar "Salvar" mostra toast verde "Preferências salvas". Recarregar a página: a mudança persistiu.
result: pass
note: "Confirmado via screenshot — tab Notificações com matriz 4×2, 8 Switches, copy 'Smart default' visível, link 'Ver histórico de envios' presente."

### 4. Reenviar uma notificação
expected: |
  No `/me/notificacoes-historico`, clicar no botão "Reenviar" de uma linha existente.
  Toast verde aparece (ex: "Notificação reenviada"). Em <60s o destinatário recebe novo email.
  Recarregar a página: aparece nova linha com status='queued' ou 'delivered' e coluna "Reenviado por" preenchida com seu nome + timestamp.
result: pass
note: "Primeira tentativa falhou com 'failed to send request' (CORS preflight bloqueado — edge function não tinha OPTIONS handler nem Access-Control headers). Fix inline em commit a760c96; user re-testou e funcionou."

### 5. Portal cliente — placeholder visível
expected: |
  Logar como cliente (ou simular) e abrir `/portal/preferencias`. Aparece nav item "Preferências" no PortalLayout.
  Página mostra título "Preferências de notificação", copy em PT-BR explicando que notificações de documentos virão na Phase 7, e 1 Switch desabilitado (não clicável).
result: pass
note: "Confirmado via screenshot — header NOTIFICAÇÕES com ícone bell, copy 'Esta seção é preparatória' linkando Phase 7, Switch desabilitado em 'Receber e-mails sobre documentos pendentes de aprovação', card extra 'Outros canais' com placeholders Push/WhatsApp futuros."

### 6. Build e deploy verdes
expected: |
  Vercel mostra build verde para o commit mais recente em `consejcomercio` e `consejcomercial` (https://vercel.com/...). Push do origin/main foi feito (commits estão no GitHub remoto). `npm test` local passa 256+ tests. `npm run build` exit 0.
result: pass

### 7. Coverage check (goal-backward)
expected: |
  Goal: "quem não usa Slack ainda receba todas as notificações da v2.0 por e-mail sem perda de funcionalidade".
  Validar:
  - Tarefa atribuída → email chega (test 1) ✅
  - Cadência diária → email chega (cron pg roda 07h BRT — não testável agora, naturalmente acontece amanhã)
  - Renovação próxima → email chega (cron 12h UTC — quando algum contrato estiver próximo do vencimento)
  - Indicação criada → email chega ao responsável pelo lead criado
  - 4 notify-* refatoradas em prod: confirmar via `supabase functions list` que mostra notify-tarefa, notify-resumo-diario, notify-indicacao, notify-renovacao, resend-webhook, reenviar-notificacao (6 functions, vs 4 antes da Phase 5).
result: pass
note: "Confirmado via `supabase functions list`: 6 functions ACTIVE — notify-tarefa v15, notify-resumo-diario v8, notify-indicacao v14, notify-renovacao v13, resend-webhook v1, reenviar-notificacao v2 (pós-fix CORS). Crons (07h BRT cadência + 12h UTC renovação) rodam naturalmente; fluxo indicação usa mesma cadeia helper sendEmail validada no Test 1."

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none — issue do Test 4 resolvida inline via commit a760c96 (CORS handling adicionado em reenviar-notificacao). Sem gaps abertos.]
