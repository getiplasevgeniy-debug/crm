# Project memory

## Product intent & audience

- Expo-based client management/CRM mobile app with Russian-language UI.
- Integrates with a "second CRM" (external CRM system) for analytics and agent data.
- Core features: Clients page, Analytics dashboard, agent list loading, client creation flow, "Передано за сегодня" transfers card.

## Brand personality & voice

- Russian-language interface (Клиенты, Аналитика, Передано за сегодня).
- Operational/business tool tone — direct, technical, user-facing error messages.

## Visual design & UX direction

- Clients page and Analytics are primary navigation surfaces.
- "Передано за сегодня" card shows transfers for a selectable date: total count, status breakdown, and client list.
- Date picker (calendar) added to transfers card — user selects any day; header dynamically shows "Передано за сегодня" or "Передано за {date}".
- Refresh button reloads the currently selected day's data.
- Analytics has a month switcher/toggle at the top; only one selected month is displayed at a time.
- Error messaging pattern: show specific failure reason to the user rather than generic "check connection" text.
- Agents loaded from external CRM into the client-creation flow.
- Client notes/description fields accept unlimited text length — no truncation or character cap.

## Decisions, constraints & rationale

- Server-side date filtering for transfers uses Kyiv (Europe/Kyiv) timezone — rationale: fixes bug where late-evening transfers were attributed to the wrong day due to UTC/other-timezone boundary.
- Analytics and agent list share a single server-side function that connects to the second CRM.
- Secrets for CRM integration are configured and functions are deployed.
- Server function and Clients page surface real error cause instead of masking it — rationale: faster diagnosis of CRM connection failures.
- Month comparison feature was reverted/removed per user request; analytics loads only the single selected month.
- Removed server-side 500-character limit on client notes/description — rationale: long client descriptions were being rejected by CRM submission. Server function updated and deployed successfully.

## Open questions & assumptions

- User may want the month-comparison card re-added (current vs previous month stats); not yet confirmed.
- Whether the external CRM itself has its own upstream text-length limit is unconfirmed — if long descriptions still fail, error text from CRM is needed.
- Assumed the second CRM API key and access credentials are valid.
- User confirmed the "yesterday" transfer bug appeared resolved after the Kyiv-timezone fix, but ongoing correctness of date filtering across timezone transitions (e.g. DST) is not yet verified.