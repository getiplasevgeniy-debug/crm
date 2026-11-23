/*
# Add manager crypto wallet for salary payouts

1. New columns
- `managers.crypto_wallet` — optional crypto wallet address entered by the linked manager.

2. Security
- Managers can update only their own wallet through `update_my_crypto_wallet`.
- The function derives the manager from `auth.uid()` and does not accept a manager id from the client.
- Anonymous callers cannot execute the function.
- Existing administrator and manager read policies remain unchanged, so administrators can see all wallet addresses and managers can see only their own manager row.

3. Important notes
- No existing records are deleted or changed.
- Wallet addresses are stored as text because the supported coin/network is not fixed by the current product requirements.
- Empty input clears the manager's wallet address.
*/

ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS crypto_wallet text;

CREATE OR REPLACE FUNCTION public.update_my_crypto_wallet(p_wallet text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_wallet text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_wallet IS NOT NULL AND length(btrim(p_wallet)) > 200 THEN
    RAISE EXCEPTION 'Wallet address is too long';
  END IF;

  UPDATE public.managers
  SET crypto_wallet = NULLIF(btrim(p_wallet), '')
  WHERE auth_user_id = auth.uid()
  RETURNING crypto_wallet INTO updated_wallet;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manager account not found';
  END IF;

  RETURN updated_wallet;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_my_crypto_wallet(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_crypto_wallet(text) TO authenticated;