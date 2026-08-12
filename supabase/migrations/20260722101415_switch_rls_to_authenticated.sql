/*
# Switch RLS policies from anon to authenticated

1. Security changes
- All four tables (managers, transactions, bonuses, salary_payments) now require an authenticated session.
- anon role is removed from all policies; only authenticated users can CRUD.
- This enforces that the app requires login (admin@gmail.com) before any data is accessible.

2. Notes
- Tables and columns are unchanged.
- Policies are dropped and recreated with TO authenticated.
*/

-- managers
DROP POLICY IF EXISTS "anon_select_managers" ON managers;
DROP POLICY IF EXISTS "anon_insert_managers" ON managers;
DROP POLICY IF EXISTS "anon_update_managers" ON managers;
DROP POLICY IF EXISTS "anon_delete_managers" ON managers;

DROP POLICY IF EXISTS "auth_select_managers" ON managers;
CREATE POLICY "auth_select_managers" ON managers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_managers" ON managers;
CREATE POLICY "auth_insert_managers" ON managers FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_managers" ON managers;
CREATE POLICY "auth_update_managers" ON managers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_managers" ON managers;
CREATE POLICY "auth_delete_managers" ON managers FOR DELETE
  TO authenticated USING (true);

-- transactions
DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;

DROP POLICY IF EXISTS "auth_select_transactions" ON transactions;
CREATE POLICY "auth_select_transactions" ON transactions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_transactions" ON transactions;
CREATE POLICY "auth_insert_transactions" ON transactions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_transactions" ON transactions;
CREATE POLICY "auth_update_transactions" ON transactions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_transactions" ON transactions;
CREATE POLICY "auth_delete_transactions" ON transactions FOR DELETE
  TO authenticated USING (true);

-- bonuses
DROP POLICY IF EXISTS "anon_select_bonuses" ON bonuses;
DROP POLICY IF EXISTS "anon_insert_bonuses" ON bonuses;
DROP POLICY IF EXISTS "anon_update_bonuses" ON bonuses;
DROP POLICY IF EXISTS "anon_delete_bonuses" ON bonuses;

DROP POLICY IF EXISTS "auth_select_bonuses" ON bonuses;
CREATE POLICY "auth_select_bonuses" ON bonuses FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_bonuses" ON bonuses;
CREATE POLICY "auth_insert_bonuses" ON bonuses FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_bonuses" ON bonuses;
CREATE POLICY "auth_update_bonuses" ON bonuses FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_bonuses" ON bonuses;
CREATE POLICY "auth_delete_bonuses" ON bonuses FOR DELETE
  TO authenticated USING (true);

-- salary_payments
DROP POLICY IF EXISTS "anon_select_salary_payments" ON salary_payments;
DROP POLICY IF EXISTS "anon_insert_salary_payments" ON salary_payments;
DROP POLICY IF EXISTS "anon_update_salary_payments" ON salary_payments;
DROP POLICY IF EXISTS "anon_delete_salary_payments" ON salary_payments;

DROP POLICY IF EXISTS "auth_select_salary_payments" ON salary_payments;
CREATE POLICY "auth_select_salary_payments" ON salary_payments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_salary_payments" ON salary_payments;
CREATE POLICY "auth_insert_salary_payments" ON salary_payments FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_salary_payments" ON salary_payments;
CREATE POLICY "auth_update_salary_payments" ON salary_payments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_salary_payments" ON salary_payments;
CREATE POLICY "auth_delete_salary_payments" ON salary_payments FOR DELETE
  TO authenticated USING (true);
