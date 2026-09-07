-- ===========================================
-- FIX: first login silently loses an invited user's assignments
-- ===========================================
-- Symptom: an admin invites someone and assigns them a property. That person
-- signs in for the first time. Login succeeds, but they see an empty app - no
-- assignments, no requests, no role. The admin still sees the assignment.
--
-- Cause: an invited profile is created with a placeholder id, because the
-- person's real auth id does not exist until they first sign in. On that first
-- sign-in, handle_new_user() claims the profile with
--
--     UPDATE public.user_profiles SET id = NEW.id WHERE id = <placeholder>
--
-- Seven foreign keys reference user_profiles(id), every one of them with the
-- default ON UPDATE NO ACTION. So any child row already pointing at the
-- placeholder id blocks that UPDATE with a foreign key violation.
--
-- The claim therefore fails for exactly the people it has to work for: those
-- who already had something assigned to them. handle_new_user()'s
-- EXCEPTION WHEN OTHERS guard then swallows the error - correctly, because a
-- failed profile claim must never block a login - and the person is left with
-- an auth account and no profile, with nothing on screen explaining why.
--
-- Confirmed on prod 2026-09-07: jzapletal1@gmail.com signed in at 11:57, had
-- 2 rows in property_assignments.assigned_to on the placeholder id, and the
-- claim failed silently.
--
-- Fix: ON UPDATE CASCADE on every foreign key that references
-- user_profiles(id), so child rows follow the profile when it is claimed.
-- Each ON DELETE rule below is reproduced exactly as it was; only ON UPDATE
-- changes. This alters behaviour solely when a profile's primary key is
-- updated, which happens only in this claim path.
--
-- Rollback: re-run these ALTERs without the ON UPDATE CASCADE clause.
-- ===========================================

BEGIN;

-- property_assignments -------------------------------------------------------
ALTER TABLE public.property_assignments
  DROP CONSTRAINT property_assignments_assigned_to_fkey,
  ADD  CONSTRAINT property_assignments_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.user_profiles(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.property_assignments
  DROP CONSTRAINT property_assignments_assigned_by_fkey,
  ADD  CONSTRAINT property_assignments_assigned_by_fkey
    FOREIGN KEY (assigned_by) REFERENCES public.user_profiles(id)
    ON UPDATE CASCADE;

-- property_requests ----------------------------------------------------------
ALTER TABLE public.property_requests
  DROP CONSTRAINT property_requests_requested_by_fkey,
  ADD  CONSTRAINT property_requests_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES public.user_profiles(id)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.property_requests
  DROP CONSTRAINT property_requests_decided_by_fkey,
  ADD  CONSTRAINT property_requests_decided_by_fkey
    FOREIGN KEY (decided_by) REFERENCES public.user_profiles(id)
    ON UPDATE CASCADE;

-- team_members ---------------------------------------------------------------
ALTER TABLE public.team_members
  DROP CONSTRAINT team_members_user_id_fkey,
  ADD  CONSTRAINT team_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.team_members
  DROP CONSTRAINT team_members_added_by_fkey,
  ADD  CONSTRAINT team_members_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES public.user_profiles(id)
    ON UPDATE CASCADE;

-- teams ----------------------------------------------------------------------
ALTER TABLE public.teams
  DROP CONSTRAINT teams_created_by_fkey,
  ADD  CONSTRAINT teams_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.user_profiles(id)
    ON UPDATE CASCADE;

COMMIT;
