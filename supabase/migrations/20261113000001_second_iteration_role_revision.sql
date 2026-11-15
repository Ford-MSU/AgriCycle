-- ============================================================================
-- AgriCycle Migration: 20261113000001_second_iteration_role_revision.sql
-- Community-Based Biomass Information Management and Market Linkage System
-- ============================================================================
-- Purpose (2nd Iteration System Revision - November 13, 2026):
-- Incremental, non-destructive migration preserving all existing tables,
-- historical columns (`organizations`, `cooperative_id`, `hub_id`), and rows
-- while enforcing the revised four-role security model:
--
--   1. ADMINISTRATOR:
--      - Manages user accounts, roles, account active status, reference data,
--        approved system settings, and full audit logs.
--      - Must NOT validate/return/reject/edit biomass records, manage sources
--        or locations, create aggregation groups, or manage buyer inquiries.
--   2. COORDINATOR (LGU Biomass Information Coordinator):
--      - Primary operational biomass information manager AND sole validation
--        authority (all sources, records, GIS coordinates, information-based
--        aggregation groups, validation decisions with non-self-validation,
--        and buyer inquiry Accept/Decline decisions).
--      - No cooperative/hub silos; no cooperative/hub organization creation.
--   3. LGU (LGU/Institutional Planning User):
--      - Strictly VIEW-ONLY access to VALIDATED biomass records, GIS map
--        locations, aggregation summaries, and validated validation traceability.
--      - Explicitly denied: source/record creation/editing, validation decisions,
--        aggregation creation/updates, buyer inquiry viewing/updates, and
--        system/user administration.
--   4. BUYER (Buyer/Institutional Inquirer):
--      - Sole public self-registration role (`BUYER` only on signup).
--      - Browses eligible validated listings, submits non-binding inquiries
--        via `submit_buyer_inquiry()`, and withdraws own inquiries via
--        `update_inquiry_status_tx()`.
-- ============================================================================

-- ============================================================================
-- SECTION 1: Lock Public Self-Registration to BUYER & Harden Profile Security
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
BEGIN
  v_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- Public self-registration ALWAYS assigns the standard BUYER role.
  -- Privileged roles (ADMINISTRATOR, COORDINATOR, LGU) must be assigned
  -- explicitly by an Administrator via public.admin_assign_user_role().
  INSERT INTO public.profiles (
    id,
    name,
    email,
    role,
    organization_id,
    is_active
  )
  VALUES (
    NEW.id,
    v_name,
    NEW.email,
    'BUYER'::public.user_role,
    NULL,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      name = CASE
        WHEN public.profiles.name = split_part(public.profiles.email, '@', 1)
             AND EXCLUDED.name IS NOT NULL
        THEN EXCLUDED.name
        ELSE public.profiles.name
      END,
      updated_at = now();
      -- Existing profiles.role, organization_id, and is_active are preserved.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

-- Enforce profile role & active status security on direct table operations
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
  IF v_caller_uid IS NOT NULL THEN
    -- Allow trusted updates from admin_assign_user_role() or admin_set_user_active_status()
    IF (
      current_setting('agricycle.admin_role_assignment', true) = 'true'
      OR current_setting('agricycle.admin_active_status', true) = 'true'
    )
    AND current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
      RETURN NEW;
    END IF;

    v_caller_role := public.current_user_role();

    IF TG_OP = 'INSERT' THEN
      IF NEW.id IS DISTINCT FROM v_caller_uid THEN
        RAISE EXCEPTION 'Unauthorized: Cannot create a profile for another user.';
      END IF;
      IF v_caller_role IS DISTINCT FROM 'ADMINISTRATOR' THEN
        IF NEW.role IS DISTINCT FROM 'BUYER'::public.user_role THEN
          RAISE EXCEPTION 'Unauthorized: Public self-registration is restricted to Buyer/Institutional Inquirer accounts.';
        END IF;
        NEW.organization_id := NULL;
        NEW.is_active := true;
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
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

  IF v_jwt_role = 'anon' OR current_user IN ('anon', 'authenticated') OR session_user = 'anon' THEN
    RAISE EXCEPTION 'Unauthorized: Anonymous API callers cannot modify user profiles or roles.';
  END IF;

  IF (session_user = 'supabase_auth_admin' OR current_user = 'supabase_auth_admin') AND v_jwt_role = '' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IS DISTINCT FROM 'BUYER'::public.user_role THEN
        NEW.role := 'BUYER'::public.user_role;
      END IF;
      RETURN NEW;
    ELSIF TG_OP = 'UPDATE' AND (
      NEW.role IS DISTINCT FROM OLD.role
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Auth trigger cannot modify existing role, organization, or active status.';
    END IF;
    RETURN NEW;
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.enforce_profile_role_security() FROM PUBLIC, anon, authenticated;

-- Admin RPC: Activate or Deactivate a User Account (with Audit Log)
CREATE OR REPLACE FUNCTION public.admin_set_user_active_status(
  p_email TEXT,
  p_is_active BOOLEAN
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid UUID := auth.uid();
  v_caller_db_role TEXT := session_user;
  v_caller_jwt_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), ''),
    ''
  );
  v_old_profile public.profiles;
  v_profile public.profiles;
  v_actor_label TEXT;
BEGIN
  IF v_caller_uid IS NOT NULL THEN
    IF public.current_user_role() IS DISTINCT FROM 'ADMINISTRATOR' THEN
      RAISE EXCEPTION 'Unauthorized: Only an active Administrator can change account activation status.';
    END IF;
    v_actor_label := public.current_user_name();
  ELSE
    IF v_caller_jwt_role = 'anon' OR v_caller_db_role IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Unauthorized: Anonymous API callers cannot update account status.';
    END IF;
    IF v_caller_jwt_role <> 'service_role'
       AND NOT (v_caller_jwt_role = '' AND v_caller_db_role IN ('postgres', 'supabase_admin', 'service_role')) THEN
      RAISE EXCEPTION 'Unauthorized: Only an Administrator, service_role, or SQL Editor can update account status.';
    END IF;
    v_actor_label := 'SQL Editor (' || v_caller_db_role || ')';
  END IF;

  SELECT * INTO v_old_profile
  FROM public.profiles
  WHERE lower(email) = lower(btrim(p_email))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile with email % not found.', p_email;
  END IF;

  IF v_caller_uid IS NOT NULL AND v_old_profile.id = v_caller_uid AND p_is_active = false THEN
    RAISE EXCEPTION 'Administrators cannot deactivate their own active account.';
  END IF;

  PERFORM set_config('agricycle.admin_active_status', 'true', true);

  UPDATE public.profiles
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = v_old_profile.id
  RETURNING * INTO v_profile;

  INSERT INTO public.audit_logs (
    user_id,
    user_label,
    action,
    entity_type,
    entity_id,
    previous_state,
    new_state,
    details
  ) VALUES (
    v_caller_uid,
    v_actor_label,
    'UPDATE_STATUS',
    'User',
    v_profile.id::text,
    jsonb_build_object('isActive', v_old_profile.is_active),
    jsonb_build_object('isActive', v_profile.is_active),
    CASE WHEN p_is_active THEN 'Activated' ELSE 'Deactivated' END || ' account ' || v_profile.email
  );

  RETURN v_profile;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_active_status(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active_status(TEXT, BOOLEAN) TO authenticated, service_role;


-- ============================================================================
-- SECTION 2: Tighten RLS Policies for Profiles, Organizations, Locations, Sources
-- ============================================================================

-- 2.1 Profiles: Own profile, or Administrator / Coordinator traceability (LGU Planning User excluded from user enumeration)
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.current_user_role() IN ('ADMINISTRATOR', 'COORDINATOR')
  );

-- 2.2 Organizations: Remove Coordinator insert policy; Administrator manages reference organizations
DROP POLICY IF EXISTS "organizations_coordinator_insert" ON public.organizations;

-- 2.3 Locations: Only LGU Biomass Information Coordinator creates/updates GIS source locations
DROP POLICY IF EXISTS "locations_insert_staff" ON public.locations;
DROP POLICY IF EXISTS "locations_insert_coordinator" ON public.locations;
CREATE POLICY "locations_insert_coordinator" ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'COORDINATOR');

DROP POLICY IF EXISTS "locations_update_staff" ON public.locations;
DROP POLICY IF EXISTS "locations_update_coordinator" ON public.locations;
CREATE POLICY "locations_update_coordinator" ON public.locations
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'COORDINATOR')
  WITH CHECK (public.current_user_role() = 'COORDINATOR');

-- 2.4 Biomass Sources: Only Coordinator registers/updates sources (all agricultural/agro-industrial sources; no coop silo)
DROP POLICY IF EXISTS "sources_insert_coordinator_admin" ON public.biomass_sources;
DROP POLICY IF EXISTS "sources_insert_coordinator" ON public.biomass_sources;
CREATE POLICY "sources_insert_coordinator" ON public.biomass_sources
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'COORDINATOR'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "sources_update_coordinator_admin" ON public.biomass_sources;
DROP POLICY IF EXISTS "sources_update_coordinator" ON public.biomass_sources;
CREATE POLICY "sources_update_coordinator" ON public.biomass_sources
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'COORDINATOR')
  WITH CHECK (public.current_user_role() = 'COORDINATOR');


-- ============================================================================
-- SECTION 3: Tighten Biomass Records, Validation Records & Audit Triggers
-- ============================================================================

-- 3.1 Biomass Records SELECT:
-- - COORDINATOR & ADMINISTRATOR: all records (Admin has read-only summary visibility)
-- - LGU (Planning User): strictly VALIDATED records ONLY
-- - BUYER: actively eligible VALIDATED non-theoretical records + own inquired records
DROP POLICY IF EXISTS "records_select_by_role" ON public.biomass_records;
CREATE POLICY "records_select_by_role" ON public.biomass_records
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMINISTRATOR', 'COORDINATOR')
    OR (
      public.current_user_role() = 'LGU'
      AND status = 'VALIDATED'
    )
    OR (
      public.current_user_role() = 'BUYER'
      AND (
        (
          status = 'VALIDATED'
          AND is_theoretical_estimate = false
          AND COALESCE(external_availability, 'AVAILABLE_TO_OTHERS') <> 'NOT_AVAILABLE'
          AND availability_period_end IS NOT NULL
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
  );

-- 3.2 Biomass Records INSERT/UPDATE: Coordinator ONLY (Administrator & LGU Planning User denied)
DROP POLICY IF EXISTS "records_insert_coordinator" ON public.biomass_records;
CREATE POLICY "records_insert_coordinator" ON public.biomass_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'COORDINATOR'
    AND submitter_id = auth.uid()
    AND status IN ('DRAFT', 'SUBMITTED')
  );

DROP POLICY IF EXISTS "records_update_by_role" ON public.biomass_records;
DROP POLICY IF EXISTS "records_update_coordinator" ON public.biomass_records;
CREATE POLICY "records_update_coordinator" ON public.biomass_records
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'COORDINATOR')
  WITH CHECK (
    public.current_user_role() = 'COORDINATOR'
    AND status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'STALE', 'UNAVAILABLE', 'ARCHIVED', 'VALIDATED', 'RETURNED', 'REJECTED')
  );

-- 3.3 Workflow Trigger: Prevent bypassing submit_validation_decision() to set VALIDATED/RETURNED/REJECTED directly
CREATE OR REPLACE FUNCTION public.enforce_biomass_record_workflow_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid UUID := auth.uid();
  v_role public.user_role;
  v_from_validation_rpc BOOLEAN := current_setting('agricycle.validation_rpc', true) = 'true';
BEGIN
  IF v_caller_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'COORDINATOR' THEN
    RAISE EXCEPTION 'Unauthorized: Only active LGU Biomass Information Coordinators may create or modify biomass records.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('DRAFT', 'SUBMITTED') THEN
      RAISE EXCEPTION 'Invalid initial status %: New biomass records must start as DRAFT or SUBMITTED.', NEW.status;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT v_from_validation_rpc AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status IN ('VALIDATED', 'RETURNED', 'REJECTED') THEN
        RAISE EXCEPTION 'Workflow enforcement: Validation decisions (VALIDATED, RETURNED, REJECTED) must be recorded via submit_validation_decision().';
      END IF;
    END IF;

    -- Preserve submitter_id on validation updates or non-admin edits
    IF NEW.submitter_id IS DISTINCT FROM OLD.submitter_id AND OLD.submitter_id IS NOT NULL THEN
      RAISE EXCEPTION 'Unauthorized: Original submitter_id cannot be reassigned.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_biomass_records_workflow_rules ON public.biomass_records;
CREATE TRIGGER trg_biomass_records_workflow_rules
  BEFORE INSERT OR UPDATE ON public.biomass_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_biomass_record_workflow_rules();

REVOKE EXECUTE ON FUNCTION public.enforce_biomass_record_workflow_rules() FROM PUBLIC, anon, authenticated;

-- 3.4 Automatic Audit Triggers for Biomass Sources and Biomass Records
CREATE OR REPLACE FUNCTION public.audit_biomass_source_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_label TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_label := COALESCE(public.current_user_name(), 'Coordinator');

  INSERT INTO public.audit_logs (
    user_id,
    user_label,
    action,
    entity_type,
    entity_id,
    previous_state,
    new_state,
    details
  ) VALUES (
    v_uid,
    v_label,
    CASE WHEN TG_OP = 'INSERT' THEN 'CREATE'::public.system_action ELSE 'UPDATE'::public.system_action END,
    'BiomassSource',
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('name', OLD.name, 'type', OLD.type) ELSE NULL END,
    jsonb_build_object('name', NEW.name, 'type', NEW.type, 'locationId', NEW.location_id),
    CASE WHEN TG_OP = 'INSERT' THEN 'Registered biomass source ' || NEW.name ELSE 'Updated biomass source ' || NEW.name END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_biomass_sources ON public.biomass_sources;
CREATE TRIGGER trg_audit_biomass_sources
  AFTER INSERT OR UPDATE ON public.biomass_sources
  FOR EACH ROW EXECUTE FUNCTION public.audit_biomass_source_changes();

REVOKE EXECUTE ON FUNCTION public.audit_biomass_source_changes() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_biomass_record_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_label TEXT;
  v_action public.system_action;
BEGIN
  IF v_uid IS NULL OR current_setting('agricycle.validation_rpc', true) = 'true' THEN
    RETURN NEW;
  END IF;

  v_label := COALESCE(public.current_user_name(), 'Coordinator');

  IF TG_OP = 'INSERT' THEN
    v_action := CASE WHEN NEW.status = 'SUBMITTED' THEN 'SUBMIT'::public.system_action ELSE 'CREATE'::public.system_action END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE
      WHEN NEW.status = 'SUBMITTED' THEN 'SUBMIT'::public.system_action
      WHEN NEW.status = 'UNDER_REVIEW' THEN 'REVIEW'::public.system_action
      WHEN NEW.status = 'STALE' THEN 'MARK_STALE'::public.system_action
      WHEN NEW.status = 'UNAVAILABLE' THEN 'MARK_UNAVAILABLE'::public.system_action
      WHEN NEW.status = 'ARCHIVED' THEN 'ARCHIVE'::public.system_action
      ELSE 'UPDATE_STATUS'::public.system_action
    END;
  ELSE
    v_action := 'UPDATE'::public.system_action;
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    user_label,
    action,
    entity_type,
    entity_id,
    previous_state,
    new_state,
    details
  ) VALUES (
    v_uid,
    v_label,
    v_action,
    'BiomassRecord',
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('status', OLD.status, 'remainingQuantity', OLD.remaining_quantity) ELSE NULL END,
    jsonb_build_object('status', NEW.status, 'remainingQuantity', NEW.remaining_quantity),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'Created biomass record ' || NEW.id || ' (' || NEW.status::text || ')'
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'Updated biomass record ' || NEW.id || ' status from ' || OLD.status::text || ' to ' || NEW.status::text
      ELSE 'Updated biomass record ' || NEW.id
    END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_biomass_records ON public.biomass_records;
CREATE TRIGGER trg_audit_biomass_records
  AFTER INSERT OR UPDATE ON public.biomass_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_biomass_record_changes();

REVOKE EXECUTE ON FUNCTION public.audit_biomass_record_changes() FROM PUBLIC, anon, authenticated;

-- 3.5 Validation Records SELECT:
-- - ADMINISTRATOR & COORDINATOR: full visibility
-- - LGU (Planning User): ONLY validation records linked to VALIDATED biomass records
-- - BUYER: no access
DROP POLICY IF EXISTS "validation_select_authenticated" ON public.validation_records;
DROP POLICY IF EXISTS "validation_insert_lgu_admin" ON public.validation_records;
DROP POLICY IF EXISTS "validation_records_select_by_role" ON public.validation_records;
CREATE POLICY "validation_records_select_by_role" ON public.validation_records
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMINISTRATOR', 'COORDINATOR')
    OR (
      public.current_user_role() = 'LGU'
      AND EXISTS (
        SELECT 1 FROM public.biomass_records br
        WHERE br.id = validation_records.biomass_record_id
          AND br.status = 'VALIDATED'
      )
    )
  );

-- 3.6 Validation RPC: Coordinator ONLY (sole validation authority) + Non-Self-Validation
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
  IF v_role IS DISTINCT FROM 'COORDINATOR' THEN
    RAISE EXCEPTION 'Unauthorized: Only LGU Biomass Information Coordinators are authorized to validate, return, or reject biomass records.';
  END IF;

  IF p_decision NOT IN ('VALIDATED', 'RETURNED', 'REJECTED', 'UNAVAILABLE', 'STALE') THEN
    RAISE EXCEPTION 'Invalid validation decision: %.', p_decision;
  END IF;

  SELECT * INTO v_record FROM public.biomass_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Biomass record % not found.', p_record_id;
  END IF;

  IF v_record.submitter_id = auth.uid() THEN
    RAISE EXCEPTION 'Self-validation denied: You cannot validate, return, or reject a biomass record you submitted.';
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

  PERFORM set_config('agricycle.validation_rpc', 'true', true);

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

REVOKE EXECUTE ON FUNCTION public.submit_validation_decision(TEXT, public.record_status, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_validation_decision(TEXT, public.record_status, TEXT, TEXT) TO authenticated, service_role;


-- ============================================================================
-- SECTION 4: Information-Based Aggregation Policies & Coordinator-Only RPC
-- ============================================================================

DROP POLICY IF EXISTS "agg_groups_insert_coordinator" ON public.aggregation_groups;
CREATE POLICY "agg_groups_insert_coordinator" ON public.aggregation_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'COORDINATOR'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "agg_groups_update_coordinator" ON public.aggregation_groups;
CREATE POLICY "agg_groups_update_coordinator" ON public.aggregation_groups
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'COORDINATOR')
  WITH CHECK (public.current_user_role() = 'COORDINATOR');

DROP POLICY IF EXISTS "agg_members_select_authenticated" ON public.aggregation_members;
DROP POLICY IF EXISTS "agg_members_select_by_role" ON public.aggregation_members;
CREATE POLICY "agg_members_select_by_role" ON public.aggregation_members
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMINISTRATOR', 'LGU', 'COORDINATOR')
    OR (
      public.current_user_role() = 'BUYER'
      AND is_active = true
      AND EXISTS (
        SELECT 1 FROM public.aggregation_groups ag
        WHERE ag.id = aggregation_members.group_id
          AND (
            ag.status = 'ACTIVE'
            OR EXISTS (
              SELECT 1 FROM public.inquiries inq
              WHERE inq.buyer_user_id = auth.uid()
                AND inq.target_type = 'GROUP'
                AND inq.target_id = ag.id
            )
          )
      )
      AND EXISTS (
        SELECT 1 FROM public.biomass_records br
        WHERE br.id = aggregation_members.biomass_record_id
          AND br.status = 'VALIDATED'
          AND br.is_theoretical_estimate = false
          AND COALESCE(br.external_availability, 'AVAILABLE_TO_OTHERS') <> 'NOT_AVAILABLE'
          AND (
            (br.remaining_quantity > 0 AND br.availability_period_end IS NOT NULL AND br.availability_period_end >= now())
            OR EXISTS (
              SELECT 1 FROM public.inquiries inq
              WHERE inq.buyer_user_id = auth.uid()
                AND inq.target_type = 'GROUP'
                AND inq.target_id = aggregation_members.group_id
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS "agg_members_insert_coordinator" ON public.aggregation_members;
CREATE POLICY "agg_members_insert_coordinator" ON public.aggregation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'COORDINATOR'
    AND added_by = auth.uid()
  );

DROP POLICY IF EXISTS "agg_members_update_coordinator" ON public.aggregation_members;
CREATE POLICY "agg_members_update_coordinator" ON public.aggregation_members
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'COORDINATOR')
  WITH CHECK (public.current_user_role() = 'COORDINATOR');

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
  v_expected_unit_code TEXT := NULL;
  v_rec_unit_code TEXT := NULL;
  v_user_label TEXT;
  v_effective_hub_id TEXT := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create an aggregation group.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'COORDINATOR' THEN
    RAISE EXCEPTION 'Unauthorized: Only LGU Biomass Information Coordinators can create aggregation groups.';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Aggregation group name is required.';
  END IF;

  IF array_length(p_member_record_ids, 1) IS NULL OR array_length(p_member_record_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one eligible member record must be selected.';
  END IF;

  -- Preserve historical optional hub_id ONLY when explicitly provided and valid; otherwise NULL
  -- (Information-based consolidation does not require a physical hub or cooperative)
  IF p_hub_id IS NOT NULL AND btrim(p_hub_id) <> '' THEN
    SELECT id INTO v_effective_hub_id
    FROM public.organizations
    WHERE id = btrim(p_hub_id)
    LIMIT 1;
  END IF;

  FOREACH v_rec_id IN ARRAY p_member_record_ids LOOP
    SELECT * INTO v_rec FROM public.biomass_records WHERE id = v_rec_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Member record % does not exist.', v_rec_id;
    END IF;
    IF v_rec.status <> 'VALIDATED' THEN
      RAISE EXCEPTION 'Record % is not VALIDATED and cannot be added to an aggregation group.', v_rec_id;
    END IF;
    IF v_rec.is_theoretical_estimate THEN
      RAISE EXCEPTION 'Record % is a theoretical estimate and cannot be aggregated for buyer linkage.', v_rec_id;
    END IF;
    IF COALESCE(v_rec.external_availability, 'AVAILABLE_TO_OTHERS') = 'NOT_AVAILABLE' THEN
      RAISE EXCEPTION 'Record % is marked not available to external buyers.', v_rec_id;
    END IF;
    IF v_rec.remaining_quantity <= 0 THEN
      RAISE EXCEPTION 'Record % has no remaining quantity available.', v_rec_id;
    END IF;
    IF v_rec.availability_period_end IS NOT NULL AND v_rec.availability_period_end < now() THEN
      RAISE EXCEPTION 'Record % availability window has expired.', v_rec_id;
    END IF;
    IF v_rec.biomass_type_id <> p_biomass_type_id THEN
      RAISE EXCEPTION 'Record % biomass type does not match group biomass type.', v_rec_id;
    END IF;

    SELECT COALESCE(rd.code, v_rec.original_unit) INTO v_rec_unit_code
    FROM public.reference_data rd
    WHERE rd.category = 'UNIT' AND (rd.id = v_rec.original_unit OR rd.code = v_rec.original_unit)
    LIMIT 1;

    IF v_expected_unit_code IS NULL THEN
      v_expected_unit_code := COALESCE(v_rec_unit_code, v_rec.original_unit);
    ELSIF COALESCE(v_rec_unit_code, v_rec.original_unit) <> v_expected_unit_code THEN
      RAISE EXCEPTION 'Cannot create group with mixed units. All member records must share the same canonical unit.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.aggregation_members am
      WHERE am.biomass_record_id = v_rec_id AND am.is_active = true
    ) THEN
      RAISE EXCEPTION 'Record % is already an active member of another aggregation group and cannot be re-aggregated.', v_rec_id;
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
    v_effective_hub_id,
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
    jsonb_build_object(
      'name', v_group.name,
      'hubId', v_effective_hub_id,
      'members', p_member_record_ids
    ),
    'Created information-based aggregation group ' || v_group.id || ' with ' || array_length(p_member_record_ids, 1) || ' member records'
  );

  RETURN v_group;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_aggregation_group_with_members(TEXT, TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_aggregation_group_with_members(TEXT, TEXT, TEXT, TEXT[], TEXT) TO authenticated, service_role;


-- ============================================================================
-- SECTION 5: Buyer Inquiries (Coordinator View/Accept/Decline; Buyer Submit/Withdraw)
-- ============================================================================

-- 5.1 Inquiry SELECT RLS: Coordinator (all) & Buyer (own only). LGU Planning User & Administrator excluded.
DROP POLICY IF EXISTS "inquiries_select_by_role" ON public.inquiries;
CREATE POLICY "inquiries_select_by_role" ON public.inquiries
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'COORDINATOR'
    OR (public.current_user_role() = 'BUYER' AND buyer_user_id IS NOT NULL AND buyer_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "inquiry_history_select_by_role" ON public.inquiry_history;
CREATE POLICY "inquiry_history_select_by_role" ON public.inquiry_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_history.inquiry_id
        AND (
          public.current_user_role() = 'COORDINATOR'
          OR (public.current_user_role() = 'BUYER' AND i.buyer_user_id IS NOT NULL AND i.buyer_user_id = auth.uid())
        )
    )
  );

-- 5.2 Hardened submit_buyer_inquiry() (BUYER ONLY, combining all validation, unit, expiration, and non-aggregation checks)
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
  v_canonical_unit_code TEXT;
  v_rec_unit_code TEXT;
  v_group_remaining NUMERIC;
  v_active_group_name TEXT;
  v_inquiry public.inquiries;
  v_user_label TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit an inquiry.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'BUYER' THEN
    RAISE EXCEPTION 'Unauthorized: Only Buyer/Institutional Inquirer accounts can submit market inquiries.';
  END IF;

  IF p_requested_quantity IS NULL OR p_requested_quantity <= 0 THEN
    RAISE EXCEPTION 'Requested quantity must be strictly greater than zero.';
  END IF;

  SELECT code INTO v_canonical_unit_code
  FROM public.reference_data
  WHERE category = 'UNIT' AND (id = p_requested_unit OR code = p_requested_unit) AND is_active = true
  LIMIT 1;

  IF v_canonical_unit_code IS NULL THEN
    RAISE EXCEPTION 'Requested unit % is not a valid active unit in reference data.', p_requested_unit;
  END IF;

  IF p_target_type = 'RECORD' THEN
    SELECT * INTO v_target_rec FROM public.biomass_records WHERE id = p_target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target biomass record % does not exist.', p_target_id;
    END IF;

    IF v_target_rec.status <> 'VALIDATED' THEN
      RAISE EXCEPTION 'Target biomass record % is not available for buyer inquiries (status: %).', p_target_id, v_target_rec.status;
    END IF;

    IF v_target_rec.is_theoretical_estimate THEN
      RAISE EXCEPTION 'Target biomass record % is a theoretical estimate and cannot receive inquiries.', p_target_id;
    END IF;

    IF COALESCE(v_target_rec.external_availability, 'AVAILABLE_TO_OTHERS') = 'NOT_AVAILABLE' THEN
      RAISE EXCEPTION 'Target biomass record % is not available to external buyers.', p_target_id;
    END IF;

    IF v_target_rec.availability_period_end IS NULL OR v_target_rec.availability_period_end < now() THEN
      RAISE EXCEPTION 'Target biomass record % availability period has expired or is invalid.', p_target_id;
    END IF;

    IF v_target_rec.remaining_quantity <= 0 THEN
      RAISE EXCEPTION 'Target biomass record % has no remaining quantity available.', p_target_id;
    END IF;

    IF p_requested_quantity > v_target_rec.remaining_quantity THEN
      RAISE EXCEPTION 'Requested quantity (%) exceeds remaining available quantity (%) for record %.',
        p_requested_quantity, v_target_rec.remaining_quantity, p_target_id;
    END IF;

    IF v_target_rec.biomass_type_id <> p_biomass_type_id THEN
      RAISE EXCEPTION 'Inquiry biomass type (%) does not match target record % biomass type (%).',
        p_biomass_type_id, p_target_id, v_target_rec.biomass_type_id;
    END IF;

    SELECT code INTO v_rec_unit_code
    FROM public.reference_data
    WHERE category = 'UNIT' AND (id = v_target_rec.original_unit OR code = v_target_rec.original_unit)
    LIMIT 1;

    IF v_rec_unit_code IS DISTINCT FROM v_canonical_unit_code THEN
      RAISE EXCEPTION 'Requested unit (% / code %) does not match record unit (% / code %).',
        p_requested_unit, v_canonical_unit_code, v_target_rec.original_unit, v_rec_unit_code;
    END IF;

    SELECT ag.name INTO v_active_group_name
    FROM public.aggregation_members am
    JOIN public.aggregation_groups ag ON ag.id = am.group_id
    WHERE am.biomass_record_id = p_target_id
      AND am.is_active = true
      AND ag.status = 'ACTIVE'
    LIMIT 1;

    IF v_active_group_name IS NOT NULL THEN
      RAISE EXCEPTION 'Biomass record % is consolidated into aggregation group "%" and must be inquired through the group listing.',
        p_target_id, v_active_group_name;
    END IF;

  ELSIF p_target_type = 'GROUP' THEN
    SELECT * INTO v_target_grp FROM public.aggregation_groups WHERE id = p_target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target aggregation group % does not exist.', p_target_id;
    END IF;

    IF v_target_grp.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Target aggregation group % is not active (status: %).', p_target_id, v_target_grp.status;
    END IF;

    IF v_target_grp.biomass_type_id <> p_biomass_type_id THEN
      RAISE EXCEPTION 'Inquiry biomass type (%) does not match target group % biomass type (%).',
        p_biomass_type_id, p_target_id, v_target_grp.biomass_type_id;
    END IF;

    SELECT COALESCE(SUM(br.remaining_quantity), 0)
    INTO v_group_remaining
    FROM public.aggregation_members am
    JOIN public.biomass_records br ON br.id = am.biomass_record_id
    JOIN public.reference_data rd_unit ON (rd_unit.id = br.original_unit OR rd_unit.code = br.original_unit) AND rd_unit.category = 'UNIT'
    WHERE am.group_id = p_target_id
      AND am.is_active = true
      AND br.status = 'VALIDATED'
      AND br.is_theoretical_estimate = false
      AND COALESCE(br.external_availability, 'AVAILABLE_TO_OTHERS') <> 'NOT_AVAILABLE'
      AND br.availability_period_end IS NOT NULL
      AND br.availability_period_end >= now()
      AND br.remaining_quantity > 0
      AND br.biomass_type_id = p_biomass_type_id
      AND rd_unit.code = v_canonical_unit_code;

    IF v_group_remaining <= 0 THEN
      RAISE EXCEPTION 'Target aggregation group % has no available biomass matching unit code %.',
        p_target_id, v_canonical_unit_code;
    END IF;

    IF p_requested_quantity > v_group_remaining THEN
      RAISE EXCEPTION 'Requested quantity (%) exceeds available aggregated quantity (% in unit %) for group %.',
        p_requested_quantity, v_group_remaining, v_canonical_unit_code, p_target_id;
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
    'Initial non-binding inquiry submitted'
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
    jsonb_build_object(
      'targetType', p_target_type,
      'targetId', p_target_id,
      'requestedQuantity', p_requested_quantity,
      'requestedUnit', p_requested_unit,
      'canonicalUnitCode', v_canonical_unit_code
    ),
    'Inquiry ' || v_inquiry.id || ' submitted for ' || p_target_type::text || ' ' || p_target_id
  );

  RETURN v_inquiry;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_buyer_inquiry(public.inquiry_target_type, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_buyer_inquiry(public.inquiry_target_type, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 5.3 Inquiry Update Trigger & RPC:
-- - COORDINATOR ONLY for Accept / Decline (only ACCEPTED or DECLINED transitions)
-- - BUYER ONLY for Withdrawing own active inquiry (WITHDRAWN only)
-- - ADMINISTRATOR and LGU rejected
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

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Caller role cannot be verified or active user profile is missing.';
  END IF;

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
    RAISE EXCEPTION 'Unauthorized: Inquiry details are strictly immutable. Only status and closure timestamps may change.';
  END IF;

  IF OLD.status::text IN ('WITHDRAWN', 'DECLINED', 'CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED')
     AND NEW.status::text <> OLD.status::text THEN
    RAISE EXCEPTION 'Invalid transition: Inquiry % is already in terminal state %.', OLD.id, OLD.status;
  END IF;

  IF v_role = 'BUYER' THEN
    IF OLD.buyer_user_id IS NULL OR OLD.buyer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: You may only withdraw inquiries submitted under your own account.';
    END IF;
    IF NEW.status::text <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Unauthorized: Buyers may only withdraw their own inquiries.';
    END IF;
    IF OLD.status::text NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'IN_DISCUSSION', 'ACKNOWLEDGED', 'RESPONDED', 'FOLLOW_UP') THEN
      RAISE EXCEPTION 'Inquiry % with status % cannot be withdrawn.', OLD.id, OLD.status;
    END IF;

  ELSIF v_role = 'COORDINATOR' THEN
    IF NEW.status::text NOT IN ('ACCEPTED', 'DECLINED') THEN
      RAISE EXCEPTION 'Invalid transition: LGU Biomass Information Coordinators may only accept (ACCEPTED) or decline (DECLINED) buyer inquiries.';
    END IF;
    IF OLD.status::text NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'ACKNOWLEDGED', 'IN_DISCUSSION', 'RESPONDED', 'FOLLOW_UP', 'ACCEPTED') THEN
      RAISE EXCEPTION 'Invalid status transition: Cannot change inquiry % status from % to %.', OLD.id, OLD.status, NEW.status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unauthorized: Role % is not permitted to update buyer inquiries.', v_role;
  END IF;

  IF NEW.status::text IN ('CLOSED', 'WITHDRAWN', 'NO_LONGER_AVAILABLE', 'EXPIRED', 'DECLINED') THEN
    NEW.closed_at := COALESCE(OLD.closed_at, now());
  ELSE
    NEW.closed_at := NULL;
  END IF;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiries_update_rules ON public.inquiries;
CREATE TRIGGER trg_inquiries_update_rules
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_inquiry_update_rules();

REVOKE EXECUTE ON FUNCTION public.enforce_inquiry_update_rules() FROM PUBLIC, anon, authenticated;

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
    RAISE EXCEPTION 'Unauthorized: Caller role cannot be verified or active user profile is missing.';
  END IF;

  SELECT * INTO v_inquiry FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inquiry % not found.', p_inquiry_id;
  END IF;

  v_old_status := v_inquiry.status;

  IF v_old_status::text IN ('WITHDRAWN', 'DECLINED', 'CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED') THEN
    RAISE EXCEPTION 'Invalid transition: Inquiry % is already in terminal state %.', p_inquiry_id, v_old_status;
  END IF;

  IF v_role = 'BUYER' THEN
    IF v_inquiry.buyer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: You may only withdraw inquiries submitted under your own account.';
    END IF;
    IF p_new_status::text <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Unauthorized: Buyers may only withdraw their own inquiries.';
    END IF;
    IF v_old_status::text NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'IN_DISCUSSION', 'ACKNOWLEDGED', 'RESPONDED', 'FOLLOW_UP') THEN
      RAISE EXCEPTION 'Inquiry % with status % cannot be withdrawn.', p_inquiry_id, v_old_status;
    END IF;

  ELSIF v_role = 'COORDINATOR' THEN
    IF p_new_status::text NOT IN ('ACCEPTED', 'DECLINED') THEN
      RAISE EXCEPTION 'Invalid transition: Coordinators may only accept (ACCEPTED) or decline (DECLINED) inquiries.';
    END IF;
    IF v_old_status::text NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'ACKNOWLEDGED', 'IN_DISCUSSION', 'RESPONDED', 'FOLLOW_UP', 'ACCEPTED') THEN
      RAISE EXCEPTION 'Invalid status transition: Cannot change inquiry % status from % to %.', p_inquiry_id, v_old_status, p_new_status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unauthorized: Role % is not permitted to update buyer inquiries.', v_role;
  END IF;

  v_user_label := public.current_user_name();

  UPDATE public.inquiries
  SET status = p_new_status,
      updated_at = now(),
      closed_at = CASE
        WHEN p_new_status::text IN ('CLOSED', 'WITHDRAWN', 'EXPIRED', 'NO_LONGER_AVAILABLE', 'DECLINED')
        THEN COALESCE(closed_at, now())
        ELSE NULL
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
    'Inquiry ' || p_inquiry_id || ' status changed from ' || v_old_status::text || ' to ' || p_new_status::text
  );

  RETURN v_inquiry;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_inquiry_status_tx(TEXT, public.inquiry_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_inquiry_status_tx(TEXT, public.inquiry_status, TEXT) TO authenticated, service_role;


-- ============================================================================
-- SECTION 6: Tighten Audit Log Access
-- ============================================================================
-- Full audit trail visibility is strictly restricted to ADMINISTRATOR.
-- Individual authenticated users may also inspect their own logged actions
-- (user_id = auth.uid()) for personal activity summaries; system/other-user
-- logs remain hidden from COORDINATOR, LGU Planning User, and BUYER.

DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select_by_role" ON public.audit_logs;
CREATE POLICY "audit_logs_select_by_role" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );


-- ============================================================================
-- SECTION 7: Verification Queries (Run in SQL Editor after applying migration)
-- ============================================================================
/*
-- 1. Verify RLS Policies across core tables:
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 2. Verify direct INSERT/UPDATE/DELETE grants remain revoked on append-only & inquiry tables:
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('inquiries', 'inquiry_history', 'validation_records', 'audit_logs')
ORDER BY table_name, grantee, privilege_type;

-- 3. Verify RPC execute grants:
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'admin_assign_user_role',
    'admin_set_user_active_status',
    'submit_validation_decision',
    'create_aggregation_group_with_members',
    'submit_buyer_inquiry',
    'update_inquiry_status_tx'
  )
ORDER BY routine_name, grantee;

-- 4. Verify active aggregation uniqueness index:
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'aggregation_members';
*/
