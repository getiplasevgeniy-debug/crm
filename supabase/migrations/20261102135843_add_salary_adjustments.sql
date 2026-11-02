/*
# Add salary adjustments (extra payouts)

1. New table
- `salary_adjustments` stores extra money the admin adds to a manager's payout for a given month.
- `manager_id` links the entry to a manager (deleted together with the manager).
- `amount` is the positive sum added to the amount owed.
- `note` is an optional comment, `created_at` sets the date the entry belongs to (used for monthly totals).

2. Security
- Row Level Security is enabled.
- Admins (raw_app_meta_data.role = 'admin') can read, create, update and delete adjustments.
- Managers can only read adjustments that belong to their own manager record.
- Access is granted to the `authenticated` role only, matching the other salary tables.

3. Important notes
- Adjustments are NOT transactions and NOT bonuses: they do not change the transaction total, the percentage-based salary, or the bonuses total.
- They only increase the "to pay" amount for the manager in the chosen month.
*/

CREATE TABLE IF NOT EXISTS public.salary_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES public.managers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_adjustments_manager_id ON public.salary_adjustments(manager_id);

ALTER TABLE public.salary_adjustments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.salary_adjustments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_adjustments TO authenticated;

DROP POLICY IF EXISTS "admin_select_salary_adjustments" ON public.salary_adjustments;
CREATE POLICY "admin_select_salary_adjustments" ON public.salary_adjustments
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_salary_adjustments" ON public.salary_adjustments;
CREATE POLICY "admin_insert_salary_adjustments" ON public.salary_adjustments
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_salary_adjustments" ON public.salary_adjustments;
CREATE POLICY "admin_update_salary_adjustments" ON public.salary_adjustments
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_salary_adjustments" ON public.salary_adjustments;
CREATE POLICY "admin_delete_salary_adjustments" ON public.salary_adjustments
  FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "manager_select_own_salary_adjustments" ON public.salary_adjustments;
CREATE POLICY "manager_select_own_salary_adjustments" ON public.salary_adjustments
  FOR SELECT TO authenticated USING (manager_id = public.current_manager_id());
