/*
# Add manager auth account link and role-based RLS

1. Schema changes
- `managers.auth_user_id` (uuid, nullable, references auth.users ON DELETE SET NULL) — links a manager to their login account.
- `managers.email` (text, nullable) — stores the login email for the manager (for display in admin UI).

2. Security changes — role-based RLS
- Admin users (raw_app_meta_data.role = 'admin') get full CRUD on all tables.
- Manager users (raw_app_meta_data.role = 'manager') get:
  - SELECT on their own manager row + child rows (transactions, bonuses, salary_payments) where manager_id matches their manager record.
  - No INSERT / UPDATE / DELETE on any table (read-only).
- Helper function `is_admin()` checks raw_app_meta_data for role='admin'.
- Helper function `current_manager_id()` returns the manager row id linked to auth.uid().

3. Important notes
- The admin user (admin@gmail.com) must be tagged with role='admin' in raw_app_meta_data (done separately).
- Manager auth accounts are created via edge function which also sets role='manager' in raw_app_meta_data.
- All existing policies are dropped and replaced.
*/

-- Add columns to managers
ALTER TABLE managers ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE managers ADD COLUMN IF NOT EXISTS email text;

-- Helper: is current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin',
    false
  );
$$;

-- Helper: get the manager id linked to current auth user
CREATE OR REPLACE FUNCTION public.current_manager_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT m.id FROM public.managers m WHERE m.auth_user_id = auth.uid();
$$;

-- ============ managers ============
DROP POLICY IF EXISTS "auth_select_managers" ON managers;
DROP POLICY IF EXISTS "auth_insert_managers" ON managers;
DROP POLICY IF EXISTS "auth_update_managers" ON managers;
DROP POLICY IF EXISTS "auth_delete_managers" ON managers;

-- Admin: full CRUD on managers
CREATE POLICY "admin_all_managers" ON managers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Manager: can SELECT only their own row
CREATE POLICY "manager_select_own" ON managers
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- ============ transactions ============
DROP POLICY IF EXISTS "auth_select_transactions" ON transactions;
DROP POLICY IF EXISTS "auth_insert_transactions" ON transactions;
DROP POLICY IF EXISTS "auth_update_transactions" ON transactions;
DROP POLICY IF EXISTS "auth_delete_transactions" ON transactions;

-- Admin: full CRUD
CREATE POLICY "admin_all_transactions" ON transactions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Manager: read only own
CREATE POLICY "manager_select_own_transactions" ON transactions
  FOR SELECT TO authenticated
  USING (manager_id = public.current_manager_id());

-- ============ bonuses ============
DROP POLICY IF EXISTS "auth_select_bonuses" ON bonuses;
DROP POLICY IF EXISTS "auth_insert_bonuses" ON bonuses;
DROP POLICY IF EXISTS "auth_update_bonuses" ON bonuses;
DROP POLICY IF EXISTS "auth_delete_bonuses" ON bonuses;

-- Admin: full CRUD
CREATE POLICY "admin_all_bonuses" ON bonuses
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Manager: read only own
CREATE POLICY "manager_select_own_bonuses" ON bonuses
  FOR SELECT TO authenticated
  USING (manager_id = public.current_manager_id());

-- ============ salary_payments ============
DROP POLICY IF EXISTS "auth_select_salary_payments" ON salary_payments;
DROP POLICY IF EXISTS "auth_insert_salary_payments" ON salary_payments;
DROP POLICY IF EXISTS "auth_update_salary_payments" ON salary_payments;
DROP POLICY IF EXISTS "auth_delete_salary_payments" ON salary_payments;

-- Admin: full CRUD
CREATE POLICY "admin_all_salary_payments" ON salary_payments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Manager: read only own
CREATE POLICY "manager_select_own_salary_payments" ON salary_payments
  FOR SELECT TO authenticated
  USING (manager_id = public.current_manager_id());

-- Index for manager lookups by auth_user_id
CREATE INDEX IF NOT EXISTS idx_managers_auth_user_id ON managers(auth_user_id);
