# Project memory

## Product intent & audience

- Expo-based client management/CRM mobile app with Russian-language UI.
- Integrates with a "second CRM" (external CRM system) for analytics and agent data.
- Core features: Clients page, Analytics dashboard, agent list loading.

## Brand personality & voice

- Russian-language interface (Клиенты, Аналитика).
- Operational/business tool tone — direct, technical, user-facing error messages.

## Visual design & UX direction

- Clients page and Analytics are primary navigation surfaces.
- Error messaging pattern: show specific failure reason to the user rather than generic "check connection" text.
- Agents loaded from external CRM into the client-creation flow.

## Decisions, constraints & rationale

- Analytics and agent list share a single server-side function that connects to the second CRM.
- Secrets for CRM integration are configured and function is deployed.
- Changed server function and Clients page to surface real error cause instead of masking it — rationale: faster diagnosis of CRM connection failures.
- Likely failure causes identified: access denied, expired CRM API key, or temporary CRM unavailability.

## Open questions & assumptions

- Exact root cause of second CRM connection failure is unknown — waiting for user to report specific error text after the fix.
- Assumed the second CRM API key and access credentials are valid; not yet confirmed.
- Analytics failure assumed to stem from the same CRM connection issue as agent loading.