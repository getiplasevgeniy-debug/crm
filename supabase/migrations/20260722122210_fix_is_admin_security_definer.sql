-- Fix: is_admin() queries auth.users but authenticated role has no SELECT on it,
-- so the function always returns false for real users, blocking all writes.
-- Make it SECURITY DEFINER owned by postgres so it can read auth.users.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_app_meta_data->>'role' = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
