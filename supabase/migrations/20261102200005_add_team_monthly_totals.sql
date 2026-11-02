/*
# Add team monthly totals for managers

1. New function
- `team_monthly_totals(p_start, p_end)` returns every manager's id, name and the sum of transactions they entered between `p_start` and `p_end`.
- The function returns ONLY these three values. Salary percentage, contact details and payouts are never exposed.

2. Security
- The function runs with the owner's rights (SECURITY DEFINER) so that managers can see colleague totals without being able to read other managers' rows directly.
- It returns nothing unless the caller is a signed-in manager or an admin.
- EXECUTE is revoked from PUBLIC and anon and granted only to authenticated users.

3. Important notes
- Existing row level security on managers, transactions and salary tables is unchanged.
- The function uses a fixed search path to prevent hijacking through other schemas.
*/

CREATE OR REPLACE FUNCTION public.team_monthly_totals(p_start timestamptz, p_end timestamptz)
RETURNS TABLE (manager_id uuid, manager_name text, total_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.name,
    COALESCE(SUM(t.amount), 0)::numeric
  FROM public.managers m
  LEFT JOIN public.transactions t
    ON t.manager_id = m.id
   AND t.created_at >= p_start
   AND t.created_at < p_end
  WHERE public.current_manager_id() IS NOT NULL OR public.is_admin()
  GROUP BY m.id, m.name
  ORDER BY COALESCE(SUM(t.amount), 0) DESC, m.name;
$$;

REVOKE EXECUTE ON FUNCTION public.team_monthly_totals(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_monthly_totals(timestamptz, timestamptz) TO authenticated;
