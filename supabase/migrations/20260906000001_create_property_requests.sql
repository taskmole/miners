-- ===========================================
-- MIGRATION: property_requests
-- ===========================================
-- Franchisees ask for a property instead of assigning it to themselves.
-- A reviewer approves (which creates the assignment) or rejects with a reason.
--
-- Separate from property_assignments on purpose: that table has one row per
-- property, so a second person requesting the same property would overwrite
-- the first request. Requests are many-per-property by design.
-- ===========================================

-- ---------------------------------------------------------------------------
-- Helper: is_super_admin()
-- ---------------------------------------------------------------------------
-- Deliberately narrower than the existing is_admin() (super_admin +
-- head_office_exec). Only super admins decide property requests.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE public.property_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_place_id text NOT NULL,
  requested_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Snapshot of the listing as it looked when the request was made. Places are
  -- re-scraped constantly, so without a copy the review queue breaks (or shows
  -- the wrong address) when a listing changes or disappears.
  property_name text,
  property_address text,
  property_url text,

  -- Optional message from the requester.
  note text,

  decided_by uuid REFERENCES public.user_profiles(id),
  decided_at timestamptz,
  decision_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Nobody approves or rejects their own request.
  CONSTRAINT property_requests_no_self_review
    CHECK (decided_by IS NULL OR decided_by <> requested_by),

  -- A rejection always carries a reason.
  CONSTRAINT property_requests_rejection_needs_reason
    CHECK (
      status <> 'rejected'
      OR (decision_reason IS NOT NULL AND btrim(decision_reason) <> '')
    ),

  -- Pending rows carry no decision; decided rows always carry a full one.
  CONSTRAINT property_requests_decision_fields_match_status
    CHECK (
      (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
      OR (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    )
);

-- One pending request per person per property. Decided rows are excluded, so
-- someone rejected once can ask again later.
CREATE UNIQUE INDEX property_requests_one_pending_per_person
  ON public.property_requests (property_place_id, requested_by)
  WHERE status = 'pending';

CREATE INDEX idx_property_requests_place ON public.property_requests(property_place_id);
CREATE INDEX idx_property_requests_requested_by ON public.property_requests(requested_by);
CREATE INDEX idx_property_requests_status ON public.property_requests(status);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_property_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER property_requests_updated_at
  BEFORE UPDATE ON public.property_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_property_requests_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
ALTER TABLE public.property_requests ENABLE ROW LEVEL SECURITY;

-- Requesters see their own; dashboard roles see every request.
CREATE POLICY "Own requests or dashboard roles see all"
  ON public.property_requests
  FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.is_dashboard_role()
  );

-- You may only create a pending request for yourself.
CREATE POLICY "Create own pending requests"
  ON public.property_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'pending'
    AND decided_by IS NULL
    AND decided_at IS NULL
  );

-- Only super admins decide, only pending rows can be decided, and the decision
-- must be recorded against the person making it. USING (status = 'pending')
-- is what stops a decided request being flipped back or re-decided.
CREATE POLICY "Super admins decide pending requests"
  ON public.property_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    AND status = 'pending'
  )
  WITH CHECK (
    public.is_super_admin()
    AND status IN ('approved', 'rejected')
    AND decided_by = auth.uid()
  );

-- No DELETE policy: the decision history is never removed.

-- ---------------------------------------------------------------------------
-- Column privileges
-- ---------------------------------------------------------------------------
-- RLS says *which rows* you may touch; column grants say *which fields*.
-- Without this, a reviewer passing the row's RLS check could also rewrite the
-- requester, the property, or the snapshot. The REVOKE + column GRANT pair
-- replaces what would otherwise be a field-comparison trigger.
--
-- Granted explicitly rather than relying on Supabase's default privileges, so
-- the table behaves the same however the project is configured.
GRANT SELECT, INSERT ON public.property_requests TO authenticated;
REVOKE UPDATE, DELETE ON public.property_requests FROM authenticated;
GRANT UPDATE (status, decided_by, decided_at, decision_reason)
  ON public.property_requests TO authenticated;

-- Server-side jobs bypass RLS and need the whole table.
GRANT ALL ON public.property_requests TO service_role;

-- Nothing for signed-out visitors.
REVOKE ALL ON public.property_requests FROM anon;

-- ---------------------------------------------------------------------------
-- Helper: request_reviewer_emails()
-- ---------------------------------------------------------------------------
-- A franchisee cannot read other people's profiles under RLS, so it cannot
-- look up who to notify when it files a request. Same SECURITY DEFINER pattern
-- as team_member_emails(): the function exposes reviewer emails only, and only
-- to signed-in users.
CREATE OR REPLACE FUNCTION public.request_reviewer_emails()
RETURNS TABLE(user_id uuid, email text, display_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT up.id, up.email, up.display_name
  FROM public.user_profiles up
  WHERE up.role = 'super_admin'
    AND up.is_active
    AND up.email IS NOT NULL
    -- Signed-in callers only. Written out rather than calling
    -- public.is_authenticated(), which does not pin its own search_path.
    AND auth.uid() IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.request_reviewer_emails() TO authenticated;
