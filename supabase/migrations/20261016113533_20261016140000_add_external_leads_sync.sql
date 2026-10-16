/*
# Add external lead intake and synchronization tracking

1. New columns
- `managers.external_agent_id` — UUID агента из подключённой CRM, used when assigning a new lead.

2. New Tables
- `lead_submissions` — locally recorded lead intake requests and their synchronization state.
- `name` — full client name.
- `email` — optional client email.
- `phone` — optional client phone.
- `lost_with` — optional answer to “с кем потерял”.
- `application_date` — date the lead request was submitted.
- `assigned_manager_id` — local manager selected by the administrator.
- `external_agent_id` — target CRM agent ID captured at submission time.
- `external_contact_id` — target CRM contact ID after successful sync.
- `sync_status` — pending, synced, or failed.
- `sync_error` — internal synchronization error text for administrator troubleshooting.
- `created_at`, `updated_at` — audit timestamps.

3. Security
- RLS is enabled on `lead_submissions`.
- Only authenticated administrators can read and mutate submissions.
- Anonymous access is revoked from the new table.

4. Important notes
- Existing manager and lead data is preserved.
- The target CRM is not modified by this migration; external synchronization is handled by a server function.
*/

ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS external_agent_id uuid;

CREATE TABLE IF NOT EXISTS public.lead_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  lost_with text,
  application_date timestamptz NOT NULL DEFAULT now(),
  assigned_manager_id uuid REFERENCES public.managers(id) ON DELETE SET NULL,
  external_agent_id uuid,
  external_contact_id uuid,
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed')),
  sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lead_submissions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_submissions TO authenticated;

DROP POLICY IF EXISTS "admin_select_lead_submissions" ON public.lead_submissions;
CREATE POLICY "admin_select_lead_submissions" ON public.lead_submissions
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_lead_submissions" ON public.lead_submissions;
CREATE POLICY "admin_insert_lead_submissions" ON public.lead_submissions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_lead_submissions" ON public.lead_submissions;
CREATE POLICY "admin_update_lead_submissions" ON public.lead_submissions
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_lead_submissions" ON public.lead_submissions;
CREATE POLICY "admin_delete_lead_submissions" ON public.lead_submissions
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_lead_submissions_manager_id
  ON public.lead_submissions(assigned_manager_id);
CREATE INDEX IF NOT EXISTS idx_lead_submissions_sync_status
  ON public.lead_submissions(sync_status);
CREATE INDEX IF NOT EXISTS idx_lead_submissions_application_date
  ON public.lead_submissions(application_date DESC);
