-- Step 6 of the per-city permissions migration, database half.
--
-- An Approver may invite new people into their own cities, at Contribute
-- level, and nothing else. They cannot set anyone to Approve, cannot touch
-- another city, cannot edit somebody who already exists, and cannot see the
-- Super Admin switch.
--
-- WHY A FUNCTION AND NOT A POLICY. The grants table is locked to super
-- admins for writes. The alternative to this function is loosening that
-- policy, which means writing an RLS rule that has to express "insert, only
-- Contribute, only in cities I approve in, only for a person who does not
-- exist yet, and never for myself". That is four conditions with three
-- tables in scope, evaluated on every row, and it is exactly the shape of
-- thing that grows a self-promotion hole the first time somebody edits it.
-- One SECURITY DEFINER function with the checks written out in order is
-- easier to read and impossible to partially satisfy. Same pattern as
-- request_reviewer_emails().
--
-- Undo:
--   DROP FUNCTION public.invite_contributor(text, text, text);

CREATE OR REPLACE FUNCTION public.invite_contributor(
  p_email        text,
  p_city_id      text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_email  text := lower(trim(p_email));
  v_id     uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501';
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'An email address is required.' USING ERRCODE = '22023';
  END IF;

  -- The caller must approve in the city they are inviting into. A super
  -- admin passes this too, via has_city_level().
  IF NOT public.has_city_level(p_city_id, 'approve') THEN
    RAISE EXCEPTION 'You can only invite people into cities you approve in.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cities WHERE id = p_city_id) THEN
    RAISE EXCEPTION 'There is no city called %.', p_city_id USING ERRCODE = '23503';
  END IF;

  -- Brand new people only. Without this, "invite" becomes a way to hand
  -- yourself a grant in somebody else's city by inviting an address that
  -- already has a profile, and the existing profile's access would be
  -- quietly widened.
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Somebody with that email already exists. Ask a super admin to change their access.'
      USING ERRCODE = '23505';
  END IF;

  v_id := gen_random_uuid();

  -- Active immediately: an Approver inviting a franchisee into their own city
  -- is the whole point, and making them chase a super admin to switch the
  -- account on would defeat it. A SUPER ADMIN creating somebody from the
  -- users screen gets the opposite default, no cities and inactive, because
  -- that path is for people whose access is not decided yet.
  INSERT INTO public.user_profiles (id, role, display_name, email, is_active, is_super_admin, city_ids)
  VALUES (v_id, 'franchisee', nullif(trim(coalesce(p_display_name, '')), ''), v_email, true, false, ARRAY[p_city_id]);

  INSERT INTO public.user_city_grants (user_id, city_id, level, can_see_financials, receives_alerts)
  VALUES (v_id, p_city_id, 'contribute', false, false);

  RETURN v_id;
END;
$function$;

-- Callable by signed-in users; the function decides whether they may. anon
-- has no business here at all, and the first line would reject it anyway.
REVOKE EXECUTE ON FUNCTION public.invite_contributor(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_contributor(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.invite_contributor(text, text, text) IS
  'Lets an Approver create a Contribute-level profile in one of their own '
  'cities. The only write path to user_city_grants that is not super admin.';
