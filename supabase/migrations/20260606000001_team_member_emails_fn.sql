-- ===========================================
-- MIGRATION: team_member_emails() helper
-- ===========================================
-- Returns the email + name of every member of a team, but only when the
-- caller is a member of that team or holds a dashboard role. SECURITY DEFINER
-- so server-side notification code can resolve recipient emails despite the
-- own-or-admin RLS on user_profiles. The access restriction lives in the
-- WHERE clause (is_team_member / is_dashboard_role, both already defined).
-- ===========================================

create or replace function public.team_member_emails(team_uuid uuid)
returns table(user_id uuid, email text, display_name text)
language sql
security definer
stable
set search_path = ''
as $$
  select tm.user_id, up.email, up.display_name
  from public.team_members tm
  join public.user_profiles up on up.id = tm.user_id
  where tm.team_id = team_uuid
    and (public.is_team_member(team_uuid) or public.is_dashboard_role());
$$;

grant execute on function public.team_member_emails(uuid) to authenticated;
