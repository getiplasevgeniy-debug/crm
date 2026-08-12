/*
# Fix is_admin() to query auth.users directly instead of relying on JWT

1. Security changes
- Replace `is_admin()` function to query `auth.users.raw_app_meta_data` directly
  instead of reading from `auth.jwt()`. The JWT may not always contain
  `raw_app_meta_data`, causing the admin to see no managers.
- The new implementation uses `SECURITY DEFINER` to access `auth.users` table.

2. Important notes
- This is a non-destructive change: only the function definition changes.
- All existing RLS policies that call `is_admin()` remain unchanged.
- The admin user (admin@gmail.com) has `raw_app_meta_data.role = 'admin'`.
*/

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_app_meta_data->>'role' = 'admin'
  );
$$;
