/*
# Add web push subscriptions

1. New table
- `push_subscriptions` stores a browser's Web Push endpoint and encryption keys for one signed-in user.
- `user_id` links the subscription to the authenticated Supabase account.
- `endpoint`, `p256dh`, and `auth` are required Web Push delivery data.
- `created_at` and `updated_at` track subscription registration.

2. Security
- Row Level Security is enabled.
- Authenticated users may only read, create, update, or delete their own subscriptions.
- The service role used by the notification function can deliver messages without exposing subscriptions to other users.

3. Important notes
- Multiple devices are supported because one user may have several endpoints.
- The endpoint is unique so refreshing or re-registering a device does not create duplicates.
*/

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

DROP POLICY IF EXISTS "users_select_own_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "users_select_own_push_subscriptions" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "users_insert_own_push_subscriptions" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "users_update_own_push_subscriptions" ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "users_delete_own_push_subscriptions" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);