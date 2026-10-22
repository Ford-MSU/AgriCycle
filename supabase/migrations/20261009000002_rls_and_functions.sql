-- ============================================================================
-- AgriCycle Migration 002: Row Level Security (RLS), Auth Triggers & RPCs
-- ============================================================================

-- 1. Non-Recursive Authorization Helper Functions (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.current_user_name()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(name, email, 'User') FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Prevent Ordinary Users from Escalating Their Own Role
-- Declared SECURITY INVOKER so `current_user` reflects the actual role executing the DML
-- (or the owner of an outer SECURITY DEFINER function such as handle_new_auth_user or admin_assign_user_role),
-- rather than always evaluating to the trigger function's owner.
CREATE OR REPLACE FUNCTION public.enforce_profile_role_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid UUID := auth.uid();
  v_jwt_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), ''),
    ''
  );
  v_caller_role public.user_role;
BEGIN
  -- 1. If a Supabase user JWT is present (PostgREST authenticated request):
  IF v_caller_uid IS NOT NULL THEN
    -- Allow trusted update from admin_assign_user_role() after it verified ADMINISTRATOR status
    IF current_setting('agricycle.admin_role_assignment', true) = 'true'
       AND current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
      RETURN NEW;
    END IF;

    v_caller_role := public.current_user_role();

    IF TG_OP = 'INSERT' THEN
      -- Self-registered users can only create a profile for their own auth.uid() and default strictly to BUYER
      IF v_caller_role IS DISTINCT FROM 'ADMINISTRATOR' THEN
        IF NEW.id IS DISTINCT FROM v_caller_uid THEN
          RAISE EXCEPTION 'Unauthorized: Cannot create a profile for another user.';
        END IF;
        IF NEW.role <> 'BUYER' THEN
          NEW.role := 'BUYER';
        END IF;
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      -- Prevent non-administrators from changing id, role, organization_id, or is_active
      IF v_caller_role IS DISTINCT FROM 'ADMINISTRATOR' THEN
        IF NEW.id IS DISTINCT FROM OLD.id THEN
          RAISE EXCEPTION 'Unauthorized: Profile ID cannot be modified.';
        END IF;
        IF NEW.role IS DISTINCT FROM OLD.role THEN
          RAISE EXCEPTION 'Unauthorized: Only an Administrator can change user roles.';
        END IF;
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
          RAISE EXCEPTION 'Unauthorized: Only an Administrator can change organization assignments.';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
          RAISE EXCEPTION 'Unauthorized: Only an Administrator can change account active status.';
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- 2. When auth.uid() IS NULL (no authenticated user JWT):
  -- Explicitly reject anonymous PostgREST API callers
  IF v_jwt_role = 'anon' OR current_user IN ('anon', 'authenticated') OR session_user = 'anon' THEN
    RAISE EXCEPTION 'Unauthorized: Anonymous API callers cannot modify user profiles or roles.';
  END IF;

  -- Supabase GoTrue auth signup trigger (`on_auth_user_created` -> `handle_new_auth_user`):
  -- Only allow INSERT or email sync, and strictly enforce role = 'BUYER' on new signups
  IF (session_user = 'supabase_auth_admin' OR current_user = 'supabase_auth_admin') AND v_jwt_role = '' THEN
    IF TG_OP = 'INSERT' AND NEW.role <> 'BUYER' THEN
      NEW.role := 'BUYER';
    ELSIF TG_OP = 'UPDATE' AND (
      NEW.role IS DISTINCT FROM OLD.role
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Auth signup trigger cannot modify existing role, organization, or active status.';
    END IF;
    RETURN NEW;
  END IF;

  -- Allow service_role API requests or direct privileged database operations
  -- (SQL Editor as postgres/supabase_admin, or admin_assign_user_role)
  IF v_jwt_role = 'service_role'
     OR (
       v_jwt_role = ''
       AND current_user IN ('postgres', 'supabase_admin', 'service_role')
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Unauthorized: Unrecognized caller context cannot modify user profiles or roles.';
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_role_security ON public.profiles;
CREATE TRIGGER trg_profiles_role_security
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role_security();

-- 3. Automatic Profile Creation on Supabase Auth Signup
-- Note: New signups default strictly to 'BUYER'. Initial ADMINISTRATOR, LGU, and COORDINATOR
-- accounts are provisioned via controlled SQL seed / admin assignment.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    'BUYER'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 4. Enable Row Level Security on All Application Tables
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biomass_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biomass_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. Explicit RLS Policies
-- ============================================================================

-- 5.1 Reference Data: Authenticated users can view active reference data; only Admin manages
DROP POLICY IF EXISTS "ref_data_select_authenticated" ON public.reference_data;
CREATE POLICY "ref_data_select_authenticated" ON public.reference_data
  FOR SELECT TO authenticated
  USING (is_active = true OR public.current_user_role() = 'ADMINISTRATOR');

DROP POLICY IF EXISTS "ref_data_admin_insert" ON public.reference_data;
CREATE POLICY "ref_data_admin_insert" ON public.reference_data
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'ADMINISTRATOR');

DROP POLICY IF EXISTS "ref_data_admin_update" ON public.reference_data;
CREATE POLICY "ref_data_admin_update" ON public.reference_data
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'ADMINISTRATOR')
  WITH CHECK (public.current_user_role() = 'ADMINISTRATOR');

-- 5.2 Locations: Authenticated users can read; Coordinators, LGU, Admin can insert/update
DROP POLICY IF EXISTS "locations_select_authenticated" ON public.locations;
CREATE POLICY "locations_select_authenticated" ON public.locations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "locations_insert_staff" ON public.locations;
CREATE POLICY "locations_insert_staff" ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('ADMINISTRATOR', 'COORDINATOR', 'LGU'));

DROP POLICY IF EXISTS "locations_update_staff" ON public.locations;
CREATE POLICY "locations_update_staff" ON public.locations
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('ADMINISTRATOR', 'LGU'))
  WITH CHECK (public.current_user_role() IN ('ADMINISTRATOR', 'LGU'));

-- 5.3 Organizations: Authenticated users can read; Admin manages
DROP POLICY IF EXISTS "organizations_select_authenticated" ON public.organizations;
CREATE POLICY "organizations_select_authenticated" ON public.organizations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "organizations_admin_write" ON public.organizations;
CREATE POLICY "organizations_admin_write" ON public.organizations
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMINISTRATOR')
  WITH CHECK (public.current_user_role() = 'ADMINISTRATOR');

-- 5.4 Profiles: Users can view/insert their own profile; Staff/Admin can view profiles for traceability
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.current_user_role() IN ('ADMINISTRATOR', 'LGU', 'COORDINATOR')
  );

DROP POLICY IF EXISTS "profiles_insert_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_insert_self_or_admin" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (id = auth.uid() AND role = 'BUYER')
    OR public.current_user_role() = 'ADMINISTRATOR'
  );

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.current_user_role() = 'ADMINISTRATOR')
  WITH CHECK (id = auth.uid() OR public.current_user_role() = 'ADMINISTRATOR');

-- 5.5 Biomass Sources: Authenticated can read; Coordinator and Admin can register/update sources
DROP POLICY IF EXISTS "sources_select_authenticated" ON public.biomass_sources;
CREATE POLICY "sources_select_authenticated" ON public.biomass_sources
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "sources_insert_coordinator_admin" ON public.biomass_sources;
CREATE POLICY "sources_insert_coordinator_admin" ON public.biomass_sources
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND created_by = auth.uid()
      AND (cooperative_id = public.current_user_org_id() OR cooperative_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "sources_update_coordinator_admin" ON public.biomass_sources;
CREATE POLICY "sources_update_coordinator_admin" ON public.biomass_sources
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND (
        created_by = auth.uid()
        OR (cooperative_id IS NOT NULL AND cooperative_id = public.current_user_org_id())
      )
    )
  )
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND (
        created_by = auth.uid()
        OR (cooperative_id IS NOT NULL AND cooperative_id = public.current_user_org_id())
      )
    )
  );

-- 5.6 Biomass Records:
-- - BUYER: Can ONLY view records that are actively available on the marketplace:
--   status = 'VALIDATED', is_theoretical_estimate = false, availability_period_end >= now(),
--   and remaining_quantity > 0.
--   Exception: Context access is preserved for records targeted by the buyer's own submitted inquiries.
-- - COORDINATOR: Can view records they submitted, records from their organization's sources, or validated records
-- - LGU & ADMINISTRATOR: Can view all records system-wide
DROP POLICY IF EXISTS "records_select_by_role" ON public.biomass_records;
CREATE POLICY "records_select_by_role" ON public.biomass_records
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMINISTRATOR', 'LGU')
    OR (
      public.current_user_role() = 'BUYER'
      AND (
        (
          status = 'VALIDATED'
          AND is_theoretical_estimate = false
          AND availability_period_end >= now()
          AND remaining_quantity > 0
        )
        OR EXISTS (
          SELECT 1 FROM public.inquiries inq
          WHERE inq.buyer_user_id = auth.uid()
            AND inq.target_type = 'RECORD'
            AND inq.target_id = biomass_records.id
        )
      )
    )
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND (
        submitter_id = auth.uid()
        OR submitter_id IS NULL
        OR status = 'VALIDATED'
        OR EXISTS (
          SELECT 1 FROM public.biomass_sources s
          WHERE s.id = biomass_records.source_id
            AND (s.cooperative_id = public.current_user_org_id() OR public.current_user_org_id() IS NULL)
        )
      )
    )
  );

DROP POLICY IF EXISTS "records_insert_coordinator" ON public.biomass_records;
CREATE POLICY "records_insert_coordinator" ON public.biomass_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND submitter_id = auth.uid()
      AND status IN ('DRAFT', 'SUBMITTED')
    )
  );

DROP POLICY IF EXISTS "records_update_by_role" ON public.biomass_records;
CREATE POLICY "records_update_by_role" ON public.biomass_records
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND (
        submitter_id = auth.uid()
        OR (
          submitter_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.biomass_sources s
            WHERE s.id = biomass_records.source_id
              AND s.cooperative_id IS NOT NULL
              AND s.cooperative_id = public.current_user_org_id()
          )
        )
      )
    )
    OR (
      public.current_user_role() = 'LGU'
      AND (submitter_id IS DISTINCT FROM auth.uid()) -- Prevent self-validation
    )
  )
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND (
        submitter_id = auth.uid()
        OR (
          submitter_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.biomass_sources s
            WHERE s.id = biomass_records.source_id
              AND s.cooperative_id IS NOT NULL
              AND s.cooperative_id = public.current_user_org_id()
          )
        )
      )
      AND status IN ('DRAFT', 'SUBMITTED', 'UNAVAILABLE', 'ARCHIVED')
    )
    OR (
      public.current_user_role() = 'LGU'
      AND (submitter_id IS DISTINCT FROM auth.uid())
      AND status IN ('UNDER_REVIEW', 'VALIDATED', 'RETURNED', 'REJECTED', 'STALE', 'UNAVAILABLE')
    )
  );

-- 5.7 Validation Records: Only LGU and Admin can insert; authenticated users can view
DROP POLICY IF EXISTS "validation_select_authenticated" ON public.validation_records;
CREATE POLICY "validation_select_authenticated" ON public.validation_records
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "validation_insert_lgu_admin" ON public.validation_records;
CREATE POLICY "validation_insert_lgu_admin" ON public.validation_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'LGU'
      AND validator_id = auth.uid()
    )
  );

-- 5.8 Aggregation Groups & Members:
DROP POLICY IF EXISTS "agg_groups_select_by_role" ON public.aggregation_groups;
CREATE POLICY "agg_groups_select_by_role" ON public.aggregation_groups
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMINISTRATOR', 'LGU', 'COORDINATOR')
    OR (
      public.current_user_role() = 'BUYER'
      AND (
        status = 'ACTIVE'
        OR EXISTS (
          SELECT 1 FROM public.inquiries inq
          WHERE inq.buyer_user_id = auth.uid()
            AND inq.target_type = 'GROUP'
            AND inq.target_id = aggregation_groups.id
        )
      )
    )
  );

DROP POLICY IF EXISTS "agg_groups_insert_coordinator" ON public.aggregation_groups;
CREATE POLICY "agg_groups_insert_coordinator" ON public.aggregation_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "agg_groups_update_coordinator" ON public.aggregation_groups;
CREATE POLICY "agg_groups_update_coordinator" ON public.aggregation_groups
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND (
        created_by = auth.uid()
        OR (hub_id = public.current_user_org_id())
      )
    )
  )
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND (
        created_by = auth.uid()
        OR (hub_id = public.current_user_org_id())
      )
    )
  );

DROP POLICY IF EXISTS "agg_members_select_authenticated" ON public.aggregation_members;
CREATE POLICY "agg_members_select_authenticated" ON public.aggregation_members
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "agg_members_insert_coordinator" ON public.aggregation_members;
CREATE POLICY "agg_members_insert_coordinator" ON public.aggregation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND added_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.aggregation_groups g
        WHERE g.id = aggregation_members.group_id
          AND (g.created_by = auth.uid() OR g.hub_id = public.current_user_org_id())
      )
    )
  );

DROP POLICY IF EXISTS "agg_members_update_coordinator" ON public.aggregation_members;
CREATE POLICY "agg_members_update_coordinator" ON public.aggregation_members
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND (
        added_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.aggregation_groups g
          WHERE g.id = aggregation_members.group_id
            AND (g.created_by = auth.uid() OR g.hub_id = public.current_user_org_id())
        )
      )
    )
  )
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND (
        added_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.aggregation_groups g
          WHERE g.id = aggregation_members.group_id
            AND (g.created_by = auth.uid() OR g.hub_id = public.current_user_org_id())
        )
      )
    )
  );

-- 5.9 Inquiries & Inquiry History:
-- - Buyers can ONLY read and withdraw their own inquiries (buyer_user_id = auth.uid()).
--   Null buyer ownership NEVER grants access to any buyer account.
-- - Coordinators, LGU, and Administrators can inspect inquiries for operational coordination and auditing.
-- - Direct buyer updates are strictly constrained to WITHDRAWN status transitions; other fields cannot be modified.

CREATE OR REPLACE FUNCTION public.enforce_inquiry_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.current_user_role();

  IF v_role = 'BUYER' THEN
    -- A buyer can only modify their own inquiry
    IF OLD.buyer_user_id IS NULL OR OLD.buyer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: You may only modify inquiries submitted under your own account.';
    END IF;

    -- Buyers can only transition status to WITHDRAWN
    IF NEW.status <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Unauthorized: Buyers are only permitted to withdraw their inquiries.';
    END IF;

    -- Strict immutability of inquiry terms on buyer withdrawal
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.buyer_user_id IS DISTINCT FROM OLD.buyer_user_id
       OR NEW.buyer_user_label IS DISTINCT FROM OLD.buyer_user_label
       OR NEW.target_type IS DISTINCT FROM OLD.target_type
       OR NEW.target_id IS DISTINCT FROM OLD.target_id
       OR NEW.biomass_type_id IS DISTINCT FROM OLD.biomass_type_id
       OR NEW.requested_quantity IS DISTINCT FROM OLD.requested_quantity
       OR NEW.requested_unit IS DISTINCT FROM OLD.requested_unit
       OR NEW.intended_use IS DISTINCT FROM OLD.intended_use
       OR NEW.preferred_availability_period IS DISTINCT FROM OLD.preferred_availability_period
       OR NEW.additional_requirements IS DISTINCT FROM OLD.additional_requirements
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Unauthorized: Inquiry terms cannot be modified during withdrawal.';
    END IF;

    NEW.closed_at := COALESCE(NEW.closed_at, now());
    NEW.updated_at := now();
  ELSIF v_role NOT IN ('COORDINATOR', 'ADMINISTRATOR') THEN
    RAISE EXCEPTION 'Unauthorized: Only Coordinators or Administrators can manage inquiries.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiries_update_rules ON public.inquiries;
CREATE TRIGGER trg_inquiries_update_rules
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_inquiry_update_rules();

DROP POLICY IF EXISTS "inquiries_select_by_role" ON public.inquiries;
CREATE POLICY "inquiries_select_by_role" ON public.inquiries
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMINISTRATOR', 'LGU', 'COORDINATOR')
    OR (public.current_user_role() = 'BUYER' AND buyer_user_id IS NOT NULL AND buyer_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "inquiries_insert_buyer" ON public.inquiries;
CREATE POLICY "inquiries_insert_buyer" ON public.inquiries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'BUYER'
      AND buyer_user_id = auth.uid()
      AND status = 'SUBMITTED'
    )
  );

DROP POLICY IF EXISTS "inquiries_update_by_role" ON public.inquiries;
CREATE POLICY "inquiries_update_by_role" ON public.inquiries
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('COORDINATOR', 'ADMINISTRATOR')
    OR (public.current_user_role() = 'BUYER' AND buyer_user_id IS NOT NULL AND buyer_user_id = auth.uid())
  )
  WITH CHECK (
    public.current_user_role() IN ('COORDINATOR', 'ADMINISTRATOR')
    OR (public.current_user_role() = 'BUYER' AND buyer_user_id IS NOT NULL AND buyer_user_id = auth.uid() AND status = 'WITHDRAWN')
  );

DROP POLICY IF EXISTS "inquiry_history_select_by_role" ON public.inquiry_history;
CREATE POLICY "inquiry_history_select_by_role" ON public.inquiry_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_history.inquiry_id
        AND (
          public.current_user_role() IN ('ADMINISTRATOR', 'LGU', 'COORDINATOR')
          OR (i.buyer_user_id IS NOT NULL AND i.buyer_user_id = auth.uid())
        )
    )
  );

-- 5.10 Audit Logs:
-- - ADMINISTRATOR has full system audit visibility.
-- - LGU has regulatory compliance visibility into BiomassRecord and ValidationRecord audit entries.
-- - Users can only view audit logs where user_id matches their own auth.uid().
-- - Logs with user_id IS NULL (system/automated triggers) are NEVER accessible to general users.
-- - Direct INSERT requires user_id = auth.uid(); UPDATE/DELETE are strictly forbidden.
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (public.current_user_role() = 'LGU' AND entity_type IN ('BiomassRecord', 'ValidationRecord'))
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());

-- ============================================================================
-- 6. Transactional RPC Functions for Multi-Table Workflows
-- ============================================================================

-- 6.1 Submit Validation Decision (Atomic Validation + Record Update + Audit Log)
CREATE OR REPLACE FUNCTION public.submit_validation_decision(
  p_record_id TEXT,
  p_decision public.record_status,
  p_basis TEXT,
  p_notes TEXT
)
RETURNS public.validation_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_record public.biomass_records;
  v_validation public.validation_records;
  v_user_label TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit a validation decision.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS NULL OR v_role NOT IN ('LGU', 'ADMINISTRATOR') THEN
    RAISE EXCEPTION 'Unauthorized: Only LGU validators or Administrators can validate biomass records.';
  END IF;

  IF p_decision NOT IN ('VALIDATED', 'RETURNED', 'REJECTED', 'UNAVAILABLE', 'STALE') THEN
    RAISE EXCEPTION 'Invalid validation decision: %.', p_decision;
  END IF;

  SELECT * INTO v_record FROM public.biomass_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Biomass record % not found.', p_record_id;
  END IF;

  IF v_record.submitter_id = auth.uid() THEN
    RAISE EXCEPTION 'Self-validation denied: You cannot validate a record you submitted.';
  END IF;

  IF p_decision = 'VALIDATED' AND (p_basis IS NULL OR btrim(p_basis) = '') THEN
    RAISE EXCEPTION 'Validation basis is required when approving a record.';
  END IF;

  IF p_decision IN ('RETURNED', 'REJECTED') AND (p_notes IS NULL OR btrim(p_notes) = '') THEN
    RAISE EXCEPTION 'Validation notes are required when returning or rejecting a record.';
  END IF;

  v_user_label := public.current_user_name();

  INSERT INTO public.validation_records (
    biomass_record_id,
    validator_id,
    validator_label,
    decision,
    validation_basis,
    validation_notes,
    validation_date
  ) VALUES (
    p_record_id,
    auth.uid(),
    v_user_label,
    p_decision,
    COALESCE(NULLIF(btrim(p_basis), ''), 'Not provided'),
    COALESCE(NULLIF(btrim(p_notes), ''), 'None'),
    now()
  )
  RETURNING * INTO v_validation;

  UPDATE public.biomass_records
  SET status = p_decision,
      validation_date = CASE WHEN p_decision = 'VALIDATED' THEN now() ELSE validation_date END,
      last_updated_date = now()
  WHERE id = p_record_id;

  INSERT INTO public.audit_logs (
    user_id,
    user_label,
    action,
    entity_type,
    entity_id,
    previous_state,
    new_state,
    notes,
    details
  ) VALUES (
    auth.uid(),
    v_user_label,
    CASE
      WHEN p_decision = 'VALIDATED' THEN 'VALIDATE'::public.system_action
      WHEN p_decision = 'RETURNED' THEN 'RETURN'::public.system_action
      WHEN p_decision = 'STALE' THEN 'MARK_STALE'::public.system_action
      WHEN p_decision = 'UNAVAILABLE' THEN 'MARK_UNAVAILABLE'::public.system_action
      ELSE 'REJECT'::public.system_action
    END,
    'ValidationRecord',
    v_validation.id,
    jsonb_build_object('status', v_record.status),
    jsonb_build_object('status', p_decision, 'recordId', p_record_id),
    p_notes,
    'Validation decision (' || p_decision::text || ') recorded for ' || p_record_id
  );

  RETURN v_validation;
END;
$$;

-- 6.2 Create Aggregation Group with Members (Atomic Group + Members + Validation Check + Audit Log)
CREATE OR REPLACE FUNCTION public.create_aggregation_group_with_members(
  p_name TEXT,
  p_biomass_type_id TEXT,
  p_hub_id TEXT,
  p_member_record_ids TEXT[],
  p_notes TEXT DEFAULT NULL
)
RETURNS public.aggregation_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_group public.aggregation_groups;
  v_rec public.biomass_records;
  v_rec_id TEXT;
  v_expected_unit TEXT := NULL;
  v_user_label TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create an aggregation group.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS NULL OR v_role NOT IN ('COORDINATOR', 'ADMINISTRATOR') THEN
    RAISE EXCEPTION 'Unauthorized: Only Coordinators or Administrators can create aggregation groups.';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Aggregation group name is required.';
  END IF;

  IF array_length(p_member_record_ids, 1) IS NULL OR array_length(p_member_record_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one eligible member record must be selected.';
  END IF;

  -- Verify all member records are VALIDATED, match biomass type, have identical unit, and are not already active in another group
  FOREACH v_rec_id IN ARRAY p_member_record_ids LOOP
    SELECT * INTO v_rec FROM public.biomass_records WHERE id = v_rec_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Member record % does not exist.', v_rec_id;
    END IF;
    IF v_rec.status <> 'VALIDATED' THEN
      RAISE EXCEPTION 'Record % is not VALIDATED and cannot be added to an aggregation group.', v_rec_id;
    END IF;
    IF v_rec.biomass_type_id <> p_biomass_type_id THEN
      RAISE EXCEPTION 'Record % biomass type does not match group biomass type.', v_rec_id;
    END IF;
    IF v_expected_unit IS NULL THEN
      v_expected_unit := v_rec.original_unit;
    ELSIF v_expected_unit <> v_rec.original_unit THEN
      RAISE EXCEPTION 'Cannot create group with mixed units. All member records must share the same unit.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.aggregation_members am
      WHERE am.biomass_record_id = v_rec_id AND am.is_active = true
    ) THEN
      RAISE EXCEPTION 'Record % is already an active member of another aggregation group.', v_rec_id;
    END IF;
  END LOOP;

  v_user_label := public.current_user_name();

  INSERT INTO public.aggregation_groups (
    name,
    biomass_type_id,
    hub_id,
    status,
    notes,
    created_by,
    created_by_label
  ) VALUES (
    btrim(p_name),
    p_biomass_type_id,
    p_hub_id,
    'ACTIVE',
    p_notes,
    auth.uid(),
    v_user_label
  )
  RETURNING * INTO v_group;

  FOREACH v_rec_id IN ARRAY p_member_record_ids LOOP
    INSERT INTO public.aggregation_members (
      group_id,
      biomass_record_id,
      added_by,
      added_by_label,
      is_active
    ) VALUES (
      v_group.id,
      v_rec_id,
      auth.uid(),
      v_user_label,
      true
    );
  END LOOP;

  INSERT INTO public.audit_logs (
    user_id,
    user_label,
    action,
    entity_type,
    entity_id,
    new_state,
    details
  ) VALUES (
    auth.uid(),
    v_user_label,
    'CREATE_GROUP',
    'AggregationGroup',
    v_group.id,
    jsonb_build_object('name', v_group.name, 'members', p_member_record_ids),
    'Created aggregation group ' || v_group.id || ' with ' || array_length(p_member_record_ids, 1) || ' member records'
  );

  RETURN v_group;
END;
$$;

-- 6.3 Submit Buyer Inquiry (Atomic Inquiry + Target Consistency Check + History + Audit Log)
CREATE OR REPLACE FUNCTION public.submit_buyer_inquiry(
  p_target_type public.inquiry_target_type,
  p_target_id TEXT,
  p_biomass_type_id TEXT,
  p_requested_quantity NUMERIC,
  p_requested_unit TEXT,
  p_intended_use TEXT DEFAULT NULL,
  p_preferred_period TEXT DEFAULT NULL,
  p_additional_requirements TEXT DEFAULT NULL
)
RETURNS public.inquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_target_rec public.biomass_records;
  v_target_grp public.aggregation_groups;
  v_inquiry public.inquiries;
  v_user_label TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit an inquiry.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS NULL OR v_role NOT IN ('BUYER', 'ADMINISTRATOR') THEN
    RAISE EXCEPTION 'Unauthorized: Only Buyers or Administrators can submit market inquiries.';
  END IF;

  IF p_requested_quantity IS NULL OR p_requested_quantity <= 0 THEN
    RAISE EXCEPTION 'Requested quantity must be greater than zero.';
  END IF;

  -- Enforce target existence, eligibility, availability window, and biomass_type_id consistency
  IF p_target_type = 'RECORD' THEN
    SELECT * INTO v_target_rec FROM public.biomass_records WHERE id = p_target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target biomass record % does not exist.', p_target_id;
    END IF;
    IF v_target_rec.status <> 'VALIDATED' THEN
      RAISE EXCEPTION 'Target biomass record % is not available for buyer inquiry (status: %). Only VALIDATED records can receive inquiries.', p_target_id, v_target_rec.status;
    END IF;
    IF v_target_rec.is_theoretical_estimate THEN
      RAISE EXCEPTION 'Target biomass record % is a theoretical estimate and cannot receive market linkage inquiries.', p_target_id;
    END IF;
    IF v_target_rec.availability_period_end < now() THEN
      RAISE EXCEPTION 'Target biomass record % availability period has expired (ended %).', p_target_id, v_target_rec.availability_period_end;
    END IF;
    IF v_target_rec.remaining_quantity <= 0 THEN
      RAISE EXCEPTION 'Target biomass record % has no remaining quantity available.', p_target_id;
    END IF;
    IF v_target_rec.biomass_type_id <> p_biomass_type_id THEN
      RAISE EXCEPTION 'Inquiry biomass type (%) does not match target record % biomass type (%).',
        p_biomass_type_id, p_target_id, v_target_rec.biomass_type_id;
    END IF;
  ELSIF p_target_type = 'GROUP' THEN
    SELECT * INTO v_target_grp FROM public.aggregation_groups WHERE id = p_target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target aggregation group % does not exist.', p_target_id;
    END IF;
    IF v_target_grp.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Target aggregation group % is not active (status: %). Only ACTIVE groups can receive inquiries.', p_target_id, v_target_grp.status;
    END IF;
    IF v_target_grp.biomass_type_id <> p_biomass_type_id THEN
      RAISE EXCEPTION 'Inquiry biomass type (%) does not match target group % biomass type (%).',
        p_biomass_type_id, p_target_id, v_target_grp.biomass_type_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid inquiry target type: %.', p_target_type;
  END IF;

  v_user_label := public.current_user_name();

  INSERT INTO public.inquiries (
    buyer_user_id,
    buyer_user_label,
    target_type,
    target_id,
    biomass_type_id,
    requested_quantity,
    requested_unit,
    intended_use,
    preferred_availability_period,
    additional_requirements,
    status
  ) VALUES (
    auth.uid(),
    v_user_label,
    p_target_type,
    p_target_id,
    p_biomass_type_id,
    p_requested_quantity,
    p_requested_unit,
    p_intended_use,
    p_preferred_period,
    p_additional_requirements,
    'SUBMITTED'
  )
  RETURNING * INTO v_inquiry;

  INSERT INTO public.inquiry_history (
    inquiry_id,
    new_status,
    changed_by,
    changed_by_label,
    notes
  ) VALUES (
    v_inquiry.id,
    'SUBMITTED',
    auth.uid(),
    v_user_label,
    'Initial inquiry submitted'
  );

  INSERT INTO public.audit_logs (
    user_id,
    user_label,
    action,
    entity_type,
    entity_id,
    new_state,
    details
  ) VALUES (
    auth.uid(),
    v_user_label,
    'INQUIRE',
    'Inquiry',
    v_inquiry.id,
    jsonb_build_object('targetType', p_target_type, 'targetId', p_target_id, 'requestedQuantity', p_requested_quantity),
    'Inquiry submitted for ' || p_target_type::text || ' ' || p_target_id
  );

  RETURN v_inquiry;
END;
$$;

-- 6.4 Update Inquiry Status (Atomic Status Update + History Entry + Audit Log)
CREATE OR REPLACE FUNCTION public.update_inquiry_status_tx(
  p_inquiry_id TEXT,
  p_new_status public.inquiry_status,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.inquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_inquiry public.inquiries;
  v_old_status public.inquiry_status;
  v_user_label TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to update inquiry status.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Active user profile required.';
  END IF;

  SELECT * INTO v_inquiry FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inquiry % not found.', p_inquiry_id;
  END IF;

  -- Buyers can only withdraw their own inquiries; Coordinators/Admin can update status
  IF v_role = 'BUYER' THEN
    IF v_inquiry.buyer_user_id IS DISTINCT FROM auth.uid() OR p_new_status <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Unauthorized: Buyers may only withdraw their own inquiries.';
    END IF;
  ELSIF v_role NOT IN ('COORDINATOR', 'ADMINISTRATOR') THEN
    RAISE EXCEPTION 'Unauthorized: Only Coordinators or Administrators can manage inquiry status.';
  END IF;

  v_old_status := v_inquiry.status;
  v_user_label := public.current_user_name();

  UPDATE public.inquiries
  SET status = p_new_status,
      updated_at = now(),
      closed_at = CASE
        WHEN p_new_status IN ('CLOSED', 'WITHDRAWN', 'EXPIRED', 'NO_LONGER_AVAILABLE') THEN now()
        ELSE closed_at
      END
  WHERE id = p_inquiry_id
  RETURNING * INTO v_inquiry;

  INSERT INTO public.inquiry_history (
    inquiry_id,
    previous_status,
    new_status,
    changed_by,
    changed_by_label,
    notes
  ) VALUES (
    p_inquiry_id,
    v_old_status,
    p_new_status,
    auth.uid(),
    v_user_label,
    p_notes
  );

  INSERT INTO public.audit_logs (
    user_id,
    user_label,
    action,
    entity_type,
    entity_id,
    previous_state,
    new_state,
    notes,
    details
  ) VALUES (
    auth.uid(),
    v_user_label,
    'UPDATE_STATUS',
    'Inquiry',
    p_inquiry_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status),
    p_notes,
    'Status changed from ' || v_old_status::text || ' to ' || p_new_status::text
  );

  RETURN v_inquiry;
END;
$$;

-- ============================================================================
-- 7. Explicit Table, Sequence, and Function Grants
-- ============================================================================

-- 7.1 Revoke all table & sequence privileges from anonymous ('anon') callers
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- 7.2 Grant least-privilege table access to 'authenticated' (enforced by RLS & immutable triggers)
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON
  public.locations,
  public.organizations,
  public.profiles,
  public.reference_data,
  public.biomass_sources,
  public.biomass_records,
  public.aggregation_groups,
  public.aggregation_members,
  public.inquiries
TO authenticated;

-- Append-only tables:
-- - validation_records: SELECT only for authenticated (INSERT must flow through submit_validation_decision RPC)
-- - inquiry_history: SELECT only for authenticated (INSERT must flow through inquiry workflow RPCs/triggers)
-- - audit_logs: SELECT and INSERT for authenticated (INSERT strictly enforced by user_id = auth.uid())
GRANT SELECT ON public.validation_records TO authenticated;
GRANT SELECT ON public.inquiry_history TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 7.3 Harden Function Execution Privileges
-- Trigger functions do not require direct EXECUTE privileges from API roles
REVOKE EXECUTE ON FUNCTION public.enforce_profile_role_security() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_inquiry_update_rules() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.current_user_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.current_user_name() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_name() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.submit_validation_decision(TEXT, public.record_status, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_validation_decision(TEXT, public.record_status, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_aggregation_group_with_members(TEXT, TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_aggregation_group_with_members(TEXT, TEXT, TEXT, TEXT[], TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.submit_buyer_inquiry(public.inquiry_target_type, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_buyer_inquiry(public.inquiry_target_type, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_inquiry_status_tx(TEXT, public.inquiry_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_inquiry_status_tx(TEXT, public.inquiry_status, TEXT) TO authenticated, service_role;
