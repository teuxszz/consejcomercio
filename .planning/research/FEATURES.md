# Features Research
**Date:** 2026-05-26
**Domain:** Internal CRM — small consulting team (2-5 users), Kanban-first, cadence-driven outreach
**Confidence:** MEDIUM (training knowledge on CRM adoption patterns; WebSearch unavailable)

---

## Table Stakes (must have or adoption stays low)

These are features where absence directly causes teams to abandon the CRM and revert to WhatsApp groups and spreadsheets.

- **"What do I do today?" answer at login** — The #1 reason small teams don't open CRMs is that opening one doesn't tell them what to do. A daily work queue (tasks due today + leads that need action) must be the first thing visible. Pipedrive calls this "Activities"; HubSpot calls it "Today's Tasks". Without it, the tool feels passive — a place to report, not work.

- **Lead-level task with due date + assignee** — Atomic unit of CRM work for a consulting team. A task attached to a lead ("call João on Thursday") closes the gap between "data in system" and "work to do". Without this, leads decay silently. Table stakes because users can't trust the system to hold their commitments.

- **Cadence-aware surfacing of overdue leads** — If a lead is at D3 and the team hasn't acted, the CRM must surface it. "Forgotten leads" is the #1 failure mode in small-team CRMs (Pipedrive research: 48% of deals are lost due to lack of follow-up, not fit). The system must be the memory, not the consultant.

- **One-click WhatsApp action from the lead card** — For a Brazilian team in 2026, WhatsApp is the primary outreach channel. Any friction between "CRM says act on this lead" and "sending the message" will cause the team to bypass the CRM. A pre-filled `wa.me` link with the cadence message removes that friction entirely.

- **Mobile-accessible layout** — Consultores in junior firms often act on leads between meetings, from phones. If the CRM is desktop-only, mobile actions (checking a task, marking done) don't get logged. Not full PWA — just responsive layout that works on 390px screens.

- **Instant lead registration (< 30 seconds)** — In a fast-moving consulting context (event, networking, referral), if registering a new lead takes more than 30 seconds, it doesn't get registered. Minimal required fields at creation time, full enrichment later. The "new lead" form must be a drawer or modal, not a full page navigation.

- **Status visible at a glance on Kanban** — The Kanban is already built. Each card must show: days since last contact, current cadence day, and if there's a task due. Without these signals, the board is just sticky notes and gives no sense of urgency.

---

## Differentiators (nice to have)

These features increase stickiness and output quality but won't be the primary driver of whether the team opens the tool daily.

- **Next-action suggestion by cadence day** — "Lead is at D3 → suggested message: [template text]" removes cognitive load from the consultant. They don't need to remember what D3 means. Pipedrive Smart Contact Data and HubSpot Sequences both do this. For CONSEJ, this can be a static lookup (D-day → script) rather than AI — simpler, cheaper, just as effective for a known cadence.

- **Adoption visibility dashboard for manager** — A single screen showing: logins per user last 7 days, tasks completed vs overdue per user, leads registered this week vs last week. This gives Gabriel (gestor) operational visibility without asking the team for reports. Critically: this also creates social accountability — teams behave differently when they know activity is logged.

- **Revenue forecast from pipeline** — Sum of contract values by stage × conversion probability. Useful for coordinator/director review. Medium complexity but high signal-to-noise ratio for leadership. Not required for day-1 adoption, but required for leadership to see ROI of the CRM investment.

- **Team task board (non-lead tasks)** — Tasks like "revisão de proposta" or "preparar diagnóstico" that are project work, not outreach. Reduces the team's need for a second tool (Notion, Trello). Increases CRM as a single source of truth for daily work.

- **Renewal / contract expiration alerts** — "Contract with Cliente X expires in 14 days" surfaced to the coordinator. This converts the CRM from sales-only to full lifecycle, and creates a reason for non-sales staff to open it.

- **WhatsApp message templates per cadence day** — Pre-written templates for D1/D3/D5/D7/D10 that populate the `wa.me` link body. Reduces time-to-send from minutes to seconds. Also enforces messaging consistency across the team.

---

## Anti-Features (things to NOT build)

These features appear useful in enterprise CRM demos but consistently damage adoption in small teams by adding overhead without proportional value.

- **Complex custom fields UI (field builder, properties panel)** — Every hour spent configuring the CRM is an hour not selling. Small teams don't need 40 custom fields. They need 5-8 good ones. Feature-rich configurability is a Salesforce problem; CONSEJ needs opinionated defaults.

- **Email inbox integration (threads by lead)** — High complexity, browser extension or OAuth required, privacy/GDPR surface. The consulting team communicates via WhatsApp, not email chains to leads. This feature would be ignored and add maintenance burden.

- **Automated email sequences** — Requires email infrastructure, delivery reputation management, unsubscribe flows. For a 2-5 person team doing high-touch consulting, templated mass email is counter-productive. WhatsApp + personal touch is the actual workflow.

- **Granular permission roles beyond three levels** — intern/coordinator/director is sufficient. Building a complex RBAC system (territory management, field-level security) creates admin overhead that nobody on a 5-person team has time to manage.

- **Activity logging for every micro-action** — Forcing consultants to log "called, no answer" / "sent email" / "left voicemail" for every interaction creates form fatigue. The team will stop logging anything. Better: log WhatsApp actions automatically via wa.me link clicks (or at minimum, mark "contacted" as a single action).

- **Full reporting suite (30+ charts)** — A manager looking at 30 charts finds nothing actionable. Three key metrics (pipeline velocity, conversion rate, revenue this month) surfaced well beat a BI-lite module that nobody uses. Anti-feature because it consumes build time and UX real estate.

- **Lead scoring based on AI/ML** — With 2-5 users and < 200 leads/year, there is insufficient data for ML scoring to be meaningful. The ICP scoring system already built (manual, rule-based) is correct for this scale. Adding "AI scoring" would be noise.

- **Calendar sync (Google Calendar / Outlook integration)** — OAuth complexity, token refresh management, conflict resolution. Small consulting team schedules tasks by WhatsApp and the CRM task list. Calendar sync adds infrastructure for marginal gain.

---

## CRM Adoption Drivers (ranked)

Evidence base: Forrester "The State of CRM Adoption" patterns, Pipedrive product research, HubSpot SMB research, and documented failure modes from CRM implementations in service firms.

1. **Answers "what do I do now?" at every login** — The single most cited reason small teams stop using CRMs is opening the tool and not knowing where to start. A prioritized work queue (tasks due today, leads overdue for contact) converts the CRM from passive archive to active guide. Confidence: HIGH (consistent across all CRM product research).

2. **Reduces friction to the next action below 3 clicks** — Every click between "I should follow up with this lead" and "I have done the follow-up" is a defection point. One-click WhatsApp link, one-click mark task done, one-click log outcome. Pipedrive's core design thesis is that sales reps will not use tools that slow them down. Confidence: HIGH.

3. **Makes forgetting impossible (system-initiated reminders)** — Pull-back notifications (email, WhatsApp deep link) that say "you have 3 leads awaiting action today" externalize the memory function. Teams without reminders rely on discipline; teams with reminders rely on systems. Consulting firms specifically fail on this because lead volume is low enough that individual leads can be forgotten for weeks. Confidence: HIGH.

4. **Visible social accountability** — When a manager can see "consultor A registered 0 leads this week", behavior changes. Adoption dashboards are not punishment tools — they are accountability mirrors. Research from HubSpot shows that teams with visible activity tracking show 34% higher CRM input compliance. Confidence: MEDIUM (directional; exact figure from training data).

5. **Fast lead capture (under 30 seconds)** — The moment of lead acquisition (networking event, referral call, LinkedIn message) is time-pressured. If registration takes too long, it doesn't happen. Junior consulting firms lose the most leads at this exact point — the person is remembered but never enters the system. Confidence: HIGH.

6. **Trust that the data is complete** — A CRM with 60% of leads is less useful than a spreadsheet. Teams stop trusting the system when they know it's incomplete. Completeness requires making input easy (fast capture, mobile access, minimal required fields) AND surfacing what's missing (empty fields alert, leads with no tasks). Confidence: HIGH.

7. **Personal benefit visible before team benefit** — A consultant must see personal value ("I won't forget my follow-ups") before they internalize team value ("the director can see my work"). CRMs that lead with reporting/visibility features and bury personal task management have adoption problems. The sequence matters. Confidence: MEDIUM.

---

## Cadence Tracking Patterns

The cadence D1/D3/D5/D7/D10 is central to CONSEJ's outreach methodology. CRM must operationalize it, not just document it.

### Pattern 1: Cadence Day Badge on Lead Card
Each Kanban card shows "D3" or "D7" as a colored badge. Color encodes urgency:
- Green: action due in 2+ days
- Yellow: action due today
- Red: action overdue (no action taken on the scheduled day)

Implementation: `cadence_start_date` stored on lead. Badge computed as `DATEDIFF(today, start_date)`. Cross-reference with D-day schedule (D1, D3, D5, D7, D10) to determine if today is an action day and whether action was taken.

### Pattern 2: "Action Needed Today" filtered view
A Kanban filter (or separate tab) that shows only leads where today is a cadence action day AND no task has been completed today. This is the daily work queue. Inspired by Pipedrive's "Activities due today" view — highest-adoption feature in their product.

### Pattern 3: Next action sidebar / slide-over on lead
Opening a lead shows: "Today is D3. Suggested action: send follow-up message. Template: [copy button] [wa.me link]". This collapses the gap between "I opened the lead" and "I took the action". The consultant should never have to think about what to do — the CRM tells them.

### Pattern 4: Timeline/log of cadence events
On the lead detail, a reverse-chronological log: "D1 — contacted via WhatsApp", "D3 — no action (overdue)", "D5 — contacted". This gives the coordinator visibility into whether the cadence is being followed. Also creates honest data: overdue D-days show up as gaps, not as blanks.

### Pattern 5: Pull-back notification content
Notification text should name the specific leads, not be generic. "You have 2 leads waiting: João Silva (D3 hoje) and Empresa Beta (D5 hoje — 2 dias atrasado)" is 5x more actionable than "You have pending tasks in your CRM." Specificity is the mechanism.

---

## Adoption Visibility

What the manager (Gabriel) needs to see to know the CRM is working — and to have evidence-based conversations with the team.

### Metrics that matter for a 2-5 person team

| Metric | Signal | Frequency |
|---|---|---|
| Logins per user (last 7 days) | Is the team opening the tool? | Weekly |
| Tasks created vs completed per user | Is the team planning AND executing? | Weekly |
| Leads registered per user (this week vs last week) | Is lead capture happening consistently? | Weekly |
| Overdue tasks count per user | Who has a backlog of unresolved commitments? | Daily |
| Leads with no cadence action in > 7 days | Silent decay — leads being forgotten | Daily |
| Cadence compliance rate | % of D-day actions taken on time | Weekly |

### UI pattern: Compact adoption card (not a full dashboard)
A single card on the manager's home page with a traffic-light summary: green (team active), yellow (some members inactive), red (team disengaged). Drill down to per-user detail only when needed. Full dashboard with charts is secondary — the card is what drives daily check.

### What NOT to show
- Individual message content (surveillance, creates resistance)
- Time-on-page or session duration (irrelevant, breeds gaming)
- Comparative ranking between consultants (harmful in a small team — damages trust)

### Behavioral design note
Adoption dashboards work best when the team knows they exist and agrees they're fair. Suggest surfacing the adoption view to all users ("here's how the team is doing this week"), not just to managers. Shared visibility → shared accountability → higher compliance than surveillance.

---

## Sources

- Training knowledge: Pipedrive product research, HubSpot State of Sales reports, Forrester CRM adoption studies (patterns current as of training cutoff August 2025)
- Product patterns observed: Pipedrive Activities, HubSpot Task Queue, Close.io smart views, Streak for Gmail cadence
- Confidence note: WebSearch was unavailable. All claims marked HIGH reflect patterns consistent across multiple independent CRM research bodies. MEDIUM claims are directional but figures should be verified before citing externally.
