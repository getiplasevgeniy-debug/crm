/*
# Таблица напоминаний для админа

1. Что делает
   - Добавляет таблицу `admin_reminders` — личный список задач администратора
     (название задачи + дата, когда её нужно сделать).

2. Новая таблица `admin_reminders`
   - `id` (uuid, первичный ключ)
   - `title` (text, название задачи, обязательно, до 300 символов)
   - `due_date` (date, дата, когда нужно сделать задачу, обязательно)
   - `created_at` (timestamp, когда задача добавлена)

3. Безопасность (RLS)
   - RLS включён.
   - Все операции разрешены только роли `authenticated` с проверкой
     `is_admin() = true` — то есть только администратору.
   - Выданы привилегии только на нужные операции (SELECT, INSERT, DELETE)
     роли `authenticated`.
*/

CREATE TABLE IF NOT EXISTS public.admin_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  due_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_reminders ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.admin_reminders TO authenticated;

DROP POLICY IF EXISTS "admin_select_reminders" ON public.admin_reminders;
CREATE POLICY "admin_select_reminders"
ON public.admin_reminders FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_reminders" ON public.admin_reminders;
CREATE POLICY "admin_insert_reminders"
ON public.admin_reminders FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_reminders" ON public.admin_reminders;
CREATE POLICY "admin_delete_reminders"
ON public.admin_reminders FOR DELETE
TO authenticated
USING (public.is_admin());
