# Phase 5 — UI Review

**Audited:** 2026-05-27
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md — Phase 5 ran in `--skip-ui` MVP mode)
**Anchors:** project design tokens (`src/index.css` HSL vars + `--alpha-*`/`--fg*`), shadcn primitives já em uso, paleta inline do Portal (`#00081d` + `#6bd0e7`), cor primary CONSEJ `#0089ac`
**Screenshots:** not captured (no dev server on 5173/3000/8080); UAT (`05-UAT.md` 7/7 pass) já confirmou render correto via screenshots para NotificacoesPanel + PortalPreferenciasPage
**Mode:** MVP — esperado polish parcial; pillars são auditados contra coerência mínima, não excelência absoluta

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | PT-BR consistente, microcopy explicativa em todos os estados (smart default, dropdown coord+, fallback, "Em breve" no portal); zero label genérico (Submit/OK/Cancel) |
| 2. Visuals | 3/4 | Hierarquia clara em NotificacoesPanel e Histórico; matriz 4×2 + ícones canal por linha; aria-labels onde devidos; falta um vazio mais convidativo no histórico e o status badge "fallback diretor" pode confundir end-user |
| 3. Color | 3/4 | Brand `#0089ac` hardcoded em 4 callsites (Panel + MeEspaco + 4 templates) em vez de `bg-primary` / token CSS — desvio consciente do design system mas spread o suficiente pra valer rebaixamento; QuotaResendBanner usa amber rgba inline em vez de `--amber-*` tokens já no tema |
| 4. Typography | 4/4 | Escala enxuta: 4 sizes (`xs`/`sm`/`lg`/`xl`) e 2 weights (`medium`/`semibold`/`bold`) por arquivo; dentro do budget de 4/2 do auditor |
| 5. Spacing | 3/4 | NotificacoesPanel e Histórico ficam dentro da escala Tailwind padrão; **PortalPreferenciasPage usa 26 `style={{}}` inline** com pixel/letter-spacing arbitrários — pattern reconhecido em PATTERNS.md mas dificulta consistência futura e impede a11y dark/light |
| 6. Experience Design | 3/4 | Loading + empty + disabled + optimistic update + RLS-aware gating tudo presente; faltam (a) confirmação ao reenviar (one-click sem undo dispara quota), (b) error state visível na página de histórico se a query falha, (c) skeleton em vez de "Carregando..." |

**Overall: 20/24**

---

## Top 5 Priority Fixes

1. **Substituir `#0089ac` hardcoded por `bg-primary`/`text-primary`** — afeta NotificacoesPanel (linhas 76 + 141) e o avatar de MeEspacoPage (linha 77). Impede tema light de inverter o primary corretamente e fragmenta o design system. Fix: usar `className="bg-primary text-primary-foreground"` (token já no `tailwind.config.js`) e remover `style={{ backgroundColor: '#0089ac' }}`. WARNING.
2. **Adicionar confirmação ao botão "Reenviar"** (`NotificacoesHistoricoPage.tsx:174-184`) — clique único dispara nova quota Resend (100/dia) sem rollback. Usuário coord+ pode acidentalmente reenviar várias linhas. Fix: usar `DeleteConfirmDialog`-like (já existe `src/components/shared/DeleteConfirmDialog.tsx`) com texto "Reenviar para X@email.com? Isso consome 1 e-mail da quota diária." BLOCKER em produção real.
3. **Trocar "Carregando..." por skeleton em 2 lugares** — `NotificacoesPanel.tsx:65` e `NotificacoesHistoricoPage.tsx:142`. CRM já tem pattern de skeleton em outras páginas (verificar `MeEspacoPage` siblings). Layout shift atual é perceptível; skeleton mantém viewport estável. WARNING.
4. **Banner de quota: trocar rgba hardcoded por `--amber-*` tokens** — `QuotaResendBanner.tsx:30-33`. O tema já expõe `--amber-hi/mid/lo` (CLAUDE.md confirma "Custom alphas + brand semantic alphas"). Fix: `className="bg-[var(--alpha-bg-md)] border-[var(--amber-mid)] text-[var(--amber-hi)]"`. WARNING.
5. **Empty state do histórico mais convidativo** — `NotificacoesHistoricoPage.tsx:144` mostra só "Sem envios nos últimos 30 dias.". Usar `<EmptyState>` (já em `src/components/ui/empty-state.tsx` per CLAUDE.md inventory) com ícone + título + sub-copy "Quando alguém te atribuir uma tarefa ou um contrato chegar perto da renovação, os envios aparecerão aqui." WARNING.

Minor / nice-to-have:
- `NotificacoesHistoricoPage:115-116` força `role="combobox"` no SelectTrigger Radix — duplicado (Radix já anuncia). Remover.
- Header colorido do NotificacoesPanel (`Bell` em `#0089ac`) duplica padrão do header de MeEspaco. Considerar tirar pra não competir visualmente.
- "fallback diretor" como status label visível para consultor confunde — coordenador+ entende mas consultor pode ler como erro. Considerar `title=""` explicando.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

Auditoria de strings genéricas: **zero match** para `Submit / Click Here / OK / Cancel / Save / try again / error occurred` nos arquivos novos da Phase 5.

Microcopy explícita verificada:
- `NotificacoesPanel.tsx:88-90` — explica smart default em uma frase ("Smart default: Email ligado para todos; Slack só ativo se você tem usuário Slack configurado")
- `NotificacoesPanel.tsx:12-15` — cada tipo tem `descricao` em PT-BR ("Quando alguém te atribuir uma tarefa", "Lembretes diários do seu pipeline", etc.)
- `NotificacoesHistoricoPage.tsx:98-101` — comportamento role-aware explicado in-context ("Como coordenador+, você pode filtrar por qualquer membro do time" vs "Você vê apenas os seus envios")
- `QuotaResendBanner.tsx:41-42` — explica o que dropped_quota significa em linguagem operacional ("novos e-mails podem ser dropados … Slack DM continua disparando normal")
- `PortalPreferenciasPage.tsx:31-39` + `54-62` — copy preparatório de Phase 7 em duas camadas: subtítulo + info card, sem prometer entrega imediata

Subjects de e-mail (templates): `Nova tarefa — CONSEJ`, `Renovação aproximando — CONSEJ`, `Bom dia, {nome}!`, `Nova indicação` — todos curtos, PT-BR, evitam click-bait.

**Pontos finos:** "Sem envios nos últimos 30 dias." é factual mas oco — ver Top Fix #5.

### Pillar 2: Visuals (3/4)

**Hierarquia OK:**
- NotificacoesPanel: header com ícone tinto + título + subtítulo, depois descrição auxiliar, depois cabeçalho de tabela em uppercase tracking-wider, depois 4 linhas — escada visual clara
- Histórico: voltar → H1 → subheader explicativo → filtro (condicional) → Card com lista divide-y — pattern espelha AuditoriaPage
- Switches têm `aria-label` por célula (`Tarefas via Slack`, `Tarefas via E-mail`) — testável + a11y
- Ícones canal (`Mail`/`MessageSquare`) com `aria-label` em `NotificacoesHistoricoPage:41-42`

**Pontos fracos:**
- Header colorido no NotificacoesPanel (linha 73-79) cria um segundo "olho" forte na página dentro de uma tab que já tem header de MeEspaco com o mesmo `#0089ac` avatar — competição visual menor
- Status `fallback_diretor` mostra label "fallback diretor" para qualquer user; sem tooltip explicando que é normal quando responsável é NULL — leitura ambígua
- Empty state minimal (Top Fix #5)
- PortalPreferenciasPage tem composição bem feita (ícone + uppercase eyebrow + título + paragrafo + info card + card desabilitado + footer "outros canais"), mas o `opacity: 0.55` do switch desabilitado torna o texto borderline a11y (contraste)

### Pillar 3: Color (3/4)

**Cor primary CONSEJ `#0089ac` hardcoded em vez de token:**
- `NotificacoesPanel.tsx:76` (avatar) e `141` (botão Salvar) → `style={{ backgroundColor: '#0089ac' }}`
- `MeEspacoPage.tsx:77` (avatar header) → idem
- 4 templates HTML (`tarefa.html.ts`, `cadencia.html.ts`, `renovacao.html.ts`, `indicacao.html.ts`) — header + CTA + footer link
- PortalPreferenciasPage usa `rgba(0,137,172,0.08)` / `0.2` / `0.35` — mesma cor com alphas diferentes inline

Templates HTML são contexto **out-of-app** (e-mail clients não rodam Tailwind) — aceitar `#0089ac` ali é correto. Mas nos `.tsx` o token `bg-primary` (mapeia para `hsl(var(--primary))`) é o esperado pelo design system.

**QuotaResendBanner** (`QuotaResendBanner.tsx:30-33`) usa `rgba(245,158,11,...)` inline em vez dos `--amber-hi/mid/lo` que o tema já expõe (CLAUDE.md confirma). Inconsistência com o resto do CRM que usa tokens.

**Histórico** (`STATUS_COLORS` map em `NotificacoesHistoricoPage.tsx:27-37`) — 9 entradas com rgba hex inline. Pattern já existe na AuditoriaPage (analog citado em PATTERNS.md) — aceito como mirror, mas o todo é "muito rgba pra uma file". Consideração: extrair para `src/lib/notif-status-colors.ts` (DRY + permite mudar paleta sem tocar UI).

**Portal:** `PortalPreferenciasPage` está alinhado com `PortalWalletPage` (paleta inline `#00081d` + `#6bd0e7`) — PATTERNS.md formaliza essa divergência intencional do Portal (dark theme fixo, separado de shadcn tokens). Não rebaixa o score do Portal individualmente — rebaixamento vem do CRM interno.

60/30/10 não é mensurável sem screenshots a frio, mas o uso da cor primary está dentro do esperado (eyebrow + CTA + avatar header). Sem accent overuse.

### Pillar 4: Typography (4/4)

**NotificacoesPanel** — escala (file-level):
- Sizes: `text-xs` (×3), `text-sm` (×2), `text-lg` (×1) → 3 sizes
- Weights: `font-medium`, `font-semibold` (×2) → 2 weights

**NotificacoesHistoricoPage** — escala:
- Sizes: `text-xs` (×2), `text-sm` (×5), `text-xl` (×1) → 3 sizes
- Weights: `font-medium` (×2), `font-bold` (×1) → 2 weights

**PortalPreferenciasPage** — usa `fontSize: 11/12/13/14/24` (5 valores) e `fontWeight: 500/600/700` (3 valores) — bate o budget do auditor mas via inline, não classes Tailwind. Aceito porque o Portal é seu próprio sub-design-system com tipografia controlada por px.

Nenhum arquivo passou o budget de 4 sizes / 2 weights. Tracking-wider para uppercase header da matriz é uma boa escolha (separação visual sem aumentar peso).

### Pillar 5: Spacing (3/4)

**CRM interno (NotificacoesPanel, Histórico):** scale Tailwind padrão — `p-6`, `space-y-6`, `gap-3/6`, `py-3`, `mt-6`, `px-3`. Tudo dentro de múltiplos de 4. Zero match para `[\d+px]`/`[\d+rem]` arbitrário nessas 2 files.

**PortalPreferenciasPage:** **26 ocorrências de `style={{}}` inline** com px (`fontSize: 11`, `padding: 32px`, `letterSpacing: '0.1em'`, etc.). Reconhecido pelo PATTERNS.md como espelho de `PortalWalletPage` mas vale o rebaixamento porque:
- impede tematização dinâmica
- duplica o que Tailwind já faz (`text-xs` = `font-size: 12px`)
- mistura `className` + `style` na mesma JSX line é fonte conhecida de bugs (cascata + specificity)

Recomendação minor: extrair tokens repetidos em `src/pages/portal/portal-tokens.ts` (e.g. `export const PORTAL_BG = '#00081d'`) — não muda a divergência intencional mas torna refactor futuro factível.

**Templates HTML** (out-of-app): inline obrigatório por compat com Gmail/Outlook — não auditado.

### Pillar 6: Experience Design (3/4)

**Cobertura de estados — CHECK:**
- ✅ Loading: `NotificacoesPanel:64-66`, `NotificacoesHistoricoPage:141-142`
- ✅ Empty: `NotificacoesHistoricoPage:143-144`
- ✅ Disabled: botão Salvar (`!dirty || salvar.isPending`), Reenviar (`!canReenv || reenviar.isPending`)
- ✅ Optimistic update + rollback: `useSalvarPrefs` (Plan 3 SUMMARY confirma)
- ✅ RLS-aware UI gating: dropdown coord+ só aparece se `isCoordenadorOrAcima`
- ✅ Toast feedback em sucesso/erro (sonner)
- ✅ Aria-labels em switches, ícones canal, Select trigger
- ✅ Keyboard nav implícito via Radix primitives (Switch + Select + Tabs)

**Gaps:**
- ❌ **Sem confirmação no Reenviar** (Top Fix #2) — destructive-ish (consome quota, dispara e-mail real) sem confirm dialog. Pattern do projeto pra destrutivas é `DeleteConfirmDialog`; deveria ter analog "ResendConfirmDialog".
- ❌ **Sem error state visível na lista** — se `useNotificacoesEnvios` falha, página fica em "Carregando..." infinito (não há `isError`/`error` consultado em `NotificacoesHistoricoPage`). React Query default retry=1 ajuda mas não imuniza.
- ⚠️ **Loading sem skeleton** — apenas texto centralizado; layout-shift quando lista chega.
- ⚠️ **PortalPreferenciasPage** não tem botão "Salvar" porque Switch é disabled — copy "Disponível na próxima fase" funciona, mas usuário ainda vê switch e instintivamente clica. Adicionar `cursor: 'not-allowed'` explícito reduz fricção.

Sem registry-flag (componentes de fontes terceiras: nenhum — `components.json` shadcn nativo, Switch criado manualmente espelhando upstream).

---

## Files Audited

**Componentes criados (Phase 5):**
- `src/components/ui/switch.tsx` (27 linhas, shadcn Radix wrap)
- `src/components/me/NotificacoesPanel.tsx` (150 linhas, matriz 4×2)
- `src/components/shared/QuotaResendBanner.tsx` (47 linhas)
- `src/pages/NotificacoesHistoricoPage.tsx` (195 linhas, lista + filtro + reenvio)
- `src/pages/portal/PortalPreferenciasPage.tsx` (140 linhas, placeholder Phase 7)

**Componentes modificados:**
- `src/pages/MeEspacoPage.tsx` (+ tab Notificações entre agenda e perfil)
- `src/pages/portal/PortalLayout.tsx` (+ nav item Preferências)

**Templates HTML (e-mail, out-of-app design system):**
- `supabase/functions/_shared/templates/tarefa.html.ts`
- `supabase/functions/_shared/templates/renovacao.html.ts`
- (3 outros: cadencia, indicacao seguem mesmo layout — confirmado via 05-02 SUMMARY)

**Documentos de contexto consultados:**
- `.planning/phases/05-multi-channel-notifications-email/05-CONTEXT.md` (decisões D-01..D-24)
- `.planning/phases/05-multi-channel-notifications-email/05-{01,02,03,04}-SUMMARY.md`
- `.planning/phases/05-multi-channel-notifications-email/05-PATTERNS.md`
- `.planning/phases/05-multi-channel-notifications-email/05-UAT.md` (7/7 pass, ground truth visual)

**Registry audit:** N/A — `components.json` presente mas Phase 5 não introduziu blocos shadcn de terceiros (Switch foi criado manualmente espelhando upstream oficial).
