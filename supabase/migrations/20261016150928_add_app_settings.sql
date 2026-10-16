CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_settings" ON app_settings FOR SELECT
  TO authenticated USING (public.is_admin());

CREATE POLICY "admin_insert_settings" ON app_settings FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_settings" ON app_settings FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_settings" ON app_settings FOR DELETE
  TO authenticated USING (public.is_admin());

INSERT INTO app_settings (key, value) VALUES ('monthly_budget', '0') ON CONFLICT DO NOTHING;
