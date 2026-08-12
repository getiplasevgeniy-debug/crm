/*
# CRM Manager Accounting Schema

1. New Tables
- `managers` — справочник менеджеров (имя, телефон, процент зарплаты от транзакций)
- `transactions` — пополнения/транзакции менеджеров (сумма, описание, дата)
- `bonuses` — бонусы менеджерам (сумма, описание, дата)
- `salary_payments` — выплаты зарплаты менеджерам (сумма, период, дата)

2. Relationships
- transactions.manager_id → managers.id (CASCADE)
- bonuses.manager_id → managers.id (CASCADE)
- salary_payments.manager_id → managers.id (CASCADE)

3. Security
- RLS enabled on all tables.
- Single-tenant (no auth): policies allow anon + authenticated full CRUD.

4. Notes
- salary_percentage хранится как numeric (0..100) — процент от суммы транзакций, который составляет зарплату менеджера.
- Зарплата = SUM(transactions.amount) * percentage/100 + SUM(bonuses.amount) - SUM(salary_payments.amount).
*/

CREATE TABLE IF NOT EXISTS managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  salary_percentage numeric(5,2) NOT NULL DEFAULT 0 CHECK (salary_percentage >= 0 AND salary_percentage <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_managers" ON managers;
CREATE POLICY "anon_select_managers" ON managers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_managers" ON managers;
CREATE POLICY "anon_insert_managers" ON managers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_managers" ON managers;
CREATE POLICY "anon_update_managers" ON managers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_managers" ON managers;
CREATE POLICY "anon_delete_managers" ON managers FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions" ON transactions FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bonuses" ON bonuses;
CREATE POLICY "anon_select_bonuses" ON bonuses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_bonuses" ON bonuses;
CREATE POLICY "anon_insert_bonuses" ON bonuses FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_bonuses" ON bonuses;
CREATE POLICY "anon_update_bonuses" ON bonuses FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_bonuses" ON bonuses;
CREATE POLICY "anon_delete_bonuses" ON bonuses FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  period_start timestamptz,
  period_end timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_salary_payments" ON salary_payments;
CREATE POLICY "anon_select_salary_payments" ON salary_payments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_salary_payments" ON salary_payments;
CREATE POLICY "anon_insert_salary_payments" ON salary_payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_salary_payments" ON salary_payments;
CREATE POLICY "anon_update_salary_payments" ON salary_payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_salary_payments" ON salary_payments;
CREATE POLICY "anon_delete_salary_payments" ON salary_payments FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_transactions_manager_id ON transactions(manager_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bonuses_manager_id ON bonuses(manager_id);
CREATE INDEX IF NOT EXISTS idx_bonuses_created_at ON bonuses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_salary_payments_manager_id ON salary_payments(manager_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_created_at ON salary_payments(created_at DESC);
