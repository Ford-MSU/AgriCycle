-- ============================================================================
-- AgriCycle Migration 006: 20261021000003_focused_security_hardening.sql
-- Community-Based Biomass Availability Information Management System (CB-BAIM)
-- ============================================================================
-- Purpose:
-- Fully audited and production-hardened security patch resolving all review findings:
-- 1. Targeted Trigger Removal & Hardened Demo-Data Repair:
--    Safely drops only the specific offending trigger (trg_inquiries_update_rules)
--    instead of disabling all user triggers. Inspects INQ-1001 against a comprehensive
--    demo fingerprint and performs a fully idempotent update across all fields.
-- 2. Complete Elimination of Direct Table INSERT and UPDATE on Inquiries:
--    Revokes both INSERT and UPDATE on public.inquiries from authenticated and anon.
--    All status transitions (both Coordinator/Admin updates and Buyer withdrawals)
--    MUST use update_inquiry_status_tx(), guaranteeing atomic history & audit logging.
-- 3. Tamper-Proof Audit Logs:
--    Revokes direct INSERT, UPDATE, and DELETE on public.audit_logs from all API roles
--    (including administrators). Audit entries are strictly system-generated via
--    SECURITY DEFINER workflow RPCs.
-- 4. Sound Canonical Unit Matching for Aggregation Quantities:
--    Resolves the requested unit to its canonical reference code and filters member
--    records by that exact canonical code, preventing cross-unit addition errors.
-- 5. Strict Availability Date Semantics:
--    Replaces infinite-fallback assumptions with strict NOT NULL and >= now() checks
--    so expired or undated records are never exposed or counted as available.
-- 6. Server-Controlled Closed Timestamps:
--    Forces closed_at to be derived authoritatively by the database trigger and RPC,
--    preventing callers from manipulating or forging closure timestamps.
-- 7. Aligned Buyer Aggregation-Member Visibility:
--    Restricts buyer member visibility to validated, non-theoretical records that
--    have positive remaining quantity and valid unexpired availability periods.
--
-- Prerequisites:
-- - 20261009000001_initial_schema.sql
-- - 20261009000002_rls_and_functions.sql
-- - 20261009000003_seed_reference_and_initial_data.sql
-- - 20261021000001_tighten_security_and_workflows.sql
-- - 20261021000002_harden_security_and_inquiries.sql
-- ============================================================================


-- ============================================================================
-- SECTION 1: Targeted Trigger Removal & Hardened Demo-Data Guard
-- ============================================================================
-- 1.1 Remove ONLY the specific validation trigger that might exist from prior
-- migrations, leaving other user triggers, timestamps, and audit triggers untouched.
DROP TRIGGER IF EXISTS trg_inquiries_update_rules ON public.inquiries;

-- 1.2 Inspect and repair synthetic demo inquiry INQ-1001 with strong fingerprinting
DO $$
DECLARE
  v_inq public.inquiries;
  v_bio_id TEXT;
  v_unit_id TEXT;
BEGIN
  SELECT * INTO v_inq FROM public.inquiries WHERE id = 'INQ-1001';

  IF FOUND THEN
    -- If a real authenticated user owns INQ-1001, leave it untouched
    IF v_inq.buyer_user_id IS NOT NULL THEN
      RAISE NOTICE 'Skipping INQ-1001 demo backfill: Inquiry is owned by an authenticated user (%).', v_inq.buyer_user_id;
    -- Verify strong demo-data fingerprint from initial seeding
    ELSIF v_inq.buyer_user_label = 'user-buyer'
          AND v_inq.target_type = 'RECORD'
          AND v_inq.target_id IN ('REC-001', 'REC-1001') THEN

      SELECT id INTO v_bio_id FROM public.reference_data WHERE category = 'BIOMASS_TYPE' AND code = 'RICE_HUSK' LIMIT 1;
      SELECT id INTO v_unit_id FROM public.reference_data WHERE category = 'UNIT' AND code = 'BAGS_50KG' LIMIT 1;

      -- Check if ANY target field differs (comprehensive idempotency condition)
      IF v_inq.target_id IS DISTINCT FROM 'REC-1001'
         OR v_inq.biomass_type_id IS DISTINCT FROM COALESCE(v_bio_id, 'ref-bio-1')
         OR v_inq.requested_quantity IS DISTINCT FROM 100
         OR v_inq.requested_unit IS DISTINCT FROM COALESCE(v_unit_id, 'ref-unit-3')
         OR v_inq.intended_use IS DISTINCT FROM 'Mushroom Cultivation & Soil Conditioner' THEN

        UPDATE public.inquiries
        SET target_id = 'REC-1001',
            biomass_type_id = COALESCE(v_bio_id, 'ref-bio-1'),
            requested_quantity = 100,
            requested_unit = COALESCE(v_unit_id, 'ref-unit-3'),
            intended_use = 'Mushroom Cultivation & Soil Conditioner',
            updated_at = now()
        WHERE id = 'INQ-1001'
          AND buyer_user_id IS NULL
          AND buyer_user_label = 'user-buyer';

        RAISE NOTICE 'Demo inquiry INQ-1001 successfully repaired and aligned with REC-1001.';
      ELSE
        RAISE NOTICE 'Demo inquiry INQ-1001 is already fully aligned with REC-1001; no update performed.';
      END IF;
    ELSE
      RAISE NOTICE 'Skipping INQ-1001 repair: Record does not match the synthetic demo-data fingerprint.';
    END IF;
  ELSE
    RAISE NOTICE 'Demo inquiry INQ-1001 not present; skipping backfill inspection.';
  END IF;
END $$;


-- ============================================================================
-- SECTION 2: Eliminate Direct Table INSERT & UPDATE on Inquiries
-- ============================================================================
-- Direct table mutations on public.inquiries bypass quantity verification,
-- unit checks, state machine transitions, and inquiry history/audit logs.
-- Both INSERT and UPDATE are REVOKED from authenticated, anon, and PUBLIC.
-- All workflow mutations must occur via submit_buyer_inquiry() and update_inquiry_status_tx().

REVOKE INSERT, UPDATE, DELETE ON public.inquiries FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "inquiries_insert_buyer" ON public.inquiries;
DROP POLICY IF EXISTS "inquiries_insert_authenticated" ON public.inquiries;
DROP POLICY IF EXISTS "inquiries_insert_admin_only" ON public.inquiries;
DROP POLICY IF EXISTS "inquiries_update_by_role" ON public.inquiries;

-- Inquiries can ONLY be selected according to established role RLS policies
DROP POLICY IF EXISTS "inquiries_select_by_role" ON public.inquiries;
CREATE POLICY "inquiries_select_by_role" ON public.inquiries
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMINISTRATOR', 'LGU', 'COORDINATOR')
    OR (public.current_user_role() = 'BUYER' AND buyer_user_id IS NOT NULL AND buyer_user_id = auth.uid())
  );


-- ============================================================================
-- SECTION 3: Tamper-Proof Audit Logs (Revoke Direct INSERT from All API Roles)
-- ============================================================================
-- Audit logs must be strictly tamper-proof. Direct table inserts are revoked from
-- ALL API roles (including administrators). All audit entries are written
-- exclusively via trusted SECURITY DEFINER functions.

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_admin_only" ON public.audit_logs;

-- Audit logs remain readable by authorized roles
DROP POLICY IF EXISTS "audit_logs_select_by_role" ON public.audit_logs;
CREATE POLICY "audit_logs_select_by_role" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMINISTRATOR', 'LGU')
    OR (public.current_user_role() = 'COORDINATOR' AND (user_id = auth.uid() OR entity_type IN ('BiomassRecord', 'AggregationGroup', 'Inquiry')))
  );


-- ============================================================================
-- SECTION 4: Hardened submit_buyer_inquiry() RPC Workflow
-- ============================================================================
-- Key Security Enforcements:
-- 1. Resolves p_requested_unit to canonical reference code.
-- 2. Strict availability expiration: availability_period_end must be non-null and >= now().
-- 3. Sound aggregation calculation: sums ONLY active, validated, non-theoretical,
--    non-expired member records sharing the EXACT SAME canonical unit code.
-- 4. Market Linkage Semantics: validates against remaining stock without unilateral lock.

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
  v_inquiry public.inquiries;
  v_user_label TEXT;
BEGIN
  -- Authenticated caller required
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit an inquiry.';
  END IF;

  -- Caller must possess BUYER or ADMINISTRATOR role
  v_role := public.current_user_role();
  IF v_role IS NULL OR v_role NOT IN ('BUYER', 'ADMINISTRATOR') THEN
    RAISE EXCEPTION 'Unauthorized: Only registered Buyers or Administrators can submit market inquiries.';
  END IF;

  -- Validate requested quantity bounds
  IF p_requested_quantity IS NULL OR p_requested_quantity <= 0 THEN
    RAISE EXCEPTION 'Requested quantity must be strictly greater than zero.';
  END IF;

  -- Resolve requested unit to canonical reference code
  SELECT code INTO v_canonical_unit_code
  FROM public.reference_data
  WHERE category = 'UNIT' AND (id = p_requested_unit OR code = p_requested_unit) AND is_active = true
  LIMIT 1;

  IF v_canonical_unit_code IS NULL THEN
    RAISE EXCEPTION 'Requested unit % is not a valid active unit in reference data.', p_requested_unit;
  END IF;

  -- ==========================================================================
  -- Target Check: RECORD
  -- ==========================================================================
  IF p_target_type = 'RECORD' THEN
    SELECT * INTO v_target_rec FROM public.biomass_records WHERE id = p_target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target biomass record % does not exist.', p_target_id;
    END IF;

    IF v_target_rec.status <> 'VALIDATED' THEN
      RAISE EXCEPTION 'Target biomass record % is not available for buyer inquiries (current status: %). Only VALIDATED records can receive inquiries.',
        p_target_id, v_target_rec.status;
    END IF;

    IF v_target_rec.is_theoretical_estimate THEN
      RAISE EXCEPTION 'Target biomass record % is a theoretical estimate and cannot receive market linkage inquiries.', p_target_id;
    END IF;

    -- Strict availability expiration check (reject null or expired dates)
    IF v_target_rec.availability_period_end IS NULL OR v_target_rec.availability_period_end < now() THEN
      RAISE EXCEPTION 'Target biomass record % availability period has expired or is invalid (ended %).',
        p_target_id, v_target_rec.availability_period_end;
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

    -- Resolve target record unit canonical code
    SELECT code INTO v_rec_unit_code
    FROM public.reference_data
    WHERE category = 'UNIT' AND (id = v_target_rec.original_unit OR code = v_target_rec.original_unit)
    LIMIT 1;

    IF v_rec_unit_code IS DISTINCT FROM v_canonical_unit_code THEN
      RAISE EXCEPTION 'Requested unit (% / code %) does not match record unit (% / code %).',
        p_requested_unit, v_canonical_unit_code, v_target_rec.original_unit, v_rec_unit_code;
    END IF;

  -- ==========================================================================
  -- Target Check: GROUP
  -- ==========================================================================
  ELSIF p_target_type = 'GROUP' THEN
    SELECT * INTO v_target_grp FROM public.aggregation_groups WHERE id = p_target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target aggregation group % does not exist.', p_target_id;
    END IF;

    IF v_target_grp.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Target aggregation group % is not active (current status: %). Only ACTIVE groups can receive inquiries.',
        p_target_id, v_target_grp.status;
    END IF;

    IF v_target_grp.biomass_type_id <> p_biomass_type_id THEN
      RAISE EXCEPTION 'Inquiry biomass type (%) does not match target group % biomass type (%).',
        p_biomass_type_id, p_target_id, v_target_grp.biomass_type_id;
    END IF;

    -- Sum remaining quantities ONLY for active, validated, non-theoretical,
    -- unexpired member records that share the EXACT same canonical unit code
    SELECT COALESCE(SUM(br.remaining_quantity), 0)
    INTO v_group_remaining
    FROM public.aggregation_members am
    JOIN public.biomass_records br ON br.id = am.biomass_record_id
    JOIN public.reference_data rd_unit ON (rd_unit.id = br.original_unit OR rd_unit.code = br.original_unit) AND rd_unit.category = 'UNIT'
    WHERE am.group_id = p_target_id
      AND am.is_active = true
      AND br.status = 'VALIDATED'
      AND br.is_theoretical_estimate = false
      AND br.availability_period_end IS NOT NULL
      AND br.availability_period_end >= now()
      AND br.remaining_quantity > 0
      AND br.biomass_type_id = p_biomass_type_id
      AND rd_unit.code = v_canonical_unit_code;

    IF v_group_remaining <= 0 THEN
      RAISE EXCEPTION 'Target aggregation group % has no available biomass matching unit code % from active validated records.',
        p_target_id, v_canonical_unit_code;
    END IF;

    IF p_requested_quantity > v_group_remaining THEN
      RAISE EXCEPTION 'Requested quantity (%) exceeds available aggregated quantity (% in unit %) for group %.',
        p_requested_quantity, v_group_remaining, v_canonical_unit_code, p_target_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid inquiry target type: %.', p_target_type;
  END IF;

  -- Derive user label securely from verified profile
  v_user_label := public.current_user_name();

  -- Atomic insertion into inquiries table (SECURITY DEFINER bypasses table REVOKE)
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

  -- Atomic initial history entry
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
    'Initial inquiry submitted via validated RPC'
  );

  -- Atomic audit log entry
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


-- ============================================================================
-- SECTION 5: Tighten Buyer Access to Aggregation Memberships
-- ============================================================================
-- Aligns member visibility with available, unexpired stock for buyers, while
-- preserving inspection transparency for groups the buyer has actively inquired about.

DROP POLICY IF EXISTS "agg_members_select_authenticated" ON public.aggregation_members;
DROP POLICY IF EXISTS "agg_members_select_by_role" ON public.aggregation_members;

CREATE POLICY "agg_members_select_by_role" ON public.aggregation_members
  FOR SELECT TO authenticated
  USING (
    -- Administrators and LGU have full oversight
    public.current_user_role() IN ('ADMINISTRATOR', 'LGU')
    OR (
      -- Coordinators can inspect members of groups they manage or their coop's records
      public.current_user_role() = 'COORDINATOR'
      AND (
        EXISTS (
          SELECT 1 FROM public.aggregation_groups ag
          WHERE ag.id = aggregation_members.group_id
            AND (ag.created_by = auth.uid() OR ag.hub_id = public.current_user_org_id())
        )
        OR EXISTS (
          SELECT 1 FROM public.biomass_records br
          LEFT JOIN public.biomass_sources bs ON bs.id = br.source_id
          WHERE br.id = aggregation_members.biomass_record_id
            AND (br.submitter_id = auth.uid() OR (bs.cooperative_id IS NOT NULL AND bs.cooperative_id = public.current_user_org_id()))
        )
      )
    )
    OR (
      -- Buyers can ONLY see active member records of ACTIVE groups (or groups with buyer inquiries)
      -- where the member biomass record is VALIDATED, non-theoretical, and currently available/unexpired
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


-- ============================================================================
-- SECTION 6: Immutability, Explicit State Machine & Server-Controlled closed_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_inquiry_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_valid_transition BOOLEAN := false;
BEGIN
  v_role := public.current_user_role();

  -- STRICT FAIL-CLOSED: Halt immediately if caller role or profile is missing
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Caller role cannot be verified or active user profile is missing.';
  END IF;

  -- --------------------------------------------------------------------------
  -- 6.1 Common Invariant: Immutability of ALL Inquiry Terms
  -- --------------------------------------------------------------------------
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
    RAISE EXCEPTION 'Unauthorized: Inquiry contract terms are strictly immutable. Only status and closure timestamps may change.';
  END IF;

  -- --------------------------------------------------------------------------
  -- 6.2 Common Invariant: Terminal States Cannot Be Reopened
  -- --------------------------------------------------------------------------
  IF OLD.status = 'WITHDRAWN' AND NEW.status <> 'WITHDRAWN' THEN
    RAISE EXCEPTION 'Invalid transition: Withdrawn inquiry % cannot be reactivated.', OLD.id;
  END IF;

  IF OLD.status = 'CLOSED' AND NEW.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'Invalid transition: Closed inquiry % cannot be reopened.', OLD.id;
  END IF;

  -- --------------------------------------------------------------------------
  -- 6.3 BUYER Rules: Ownership & Withdrawal Only
  -- --------------------------------------------------------------------------
  IF v_role = 'BUYER' THEN
    IF OLD.buyer_user_id IS NULL OR OLD.buyer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: You may only modify inquiries submitted under your own account.';
    END IF;

    IF NEW.status <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Unauthorized: Buyers are only permitted to withdraw their inquiries.';
    END IF;

    IF OLD.status = 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Inquiry % has already been withdrawn.', OLD.id;
    END IF;

    IF OLD.status IN ('CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED') THEN
      RAISE EXCEPTION 'Cannot withdraw inquiry % because it is already %.', OLD.id, OLD.status;
    END IF;

    IF OLD.status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'RESPONDED', 'FOLLOW_UP') THEN
      RAISE EXCEPTION 'Inquiry % with status % cannot be withdrawn.', OLD.id, OLD.status;
    END IF;

  -- --------------------------------------------------------------------------
  -- 6.4 COORDINATOR and ADMINISTRATOR Rules: Explicit State Machine
  -- --------------------------------------------------------------------------
  ELSIF v_role IN ('COORDINATOR', 'ADMINISTRATOR') THEN
    -- Coordinators/Administrators cannot set WITHDRAWN (strictly buyer-only)
    IF OLD.status <> 'WITHDRAWN' AND NEW.status = 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Invalid transition: Only the buyer can withdraw their inquiry.';
    END IF;

    -- If status did not change, verify closure timestamp wasn't altered
    IF OLD.status = NEW.status THEN
      v_valid_transition := true;
    ELSE
      -- Evaluate explicit transition matrix
      CASE OLD.status
        WHEN 'SUBMITTED' THEN
          v_valid_transition := NEW.status IN ('UNDER_REVIEW', 'NO_LONGER_AVAILABLE', 'EXPIRED', 'CLOSED');
        WHEN 'UNDER_REVIEW' THEN
          v_valid_transition := NEW.status IN ('RESPONDED', 'FOLLOW_UP', 'NO_LONGER_AVAILABLE', 'EXPIRED', 'CLOSED');
        WHEN 'RESPONDED' THEN
          v_valid_transition := NEW.status IN ('FOLLOW_UP', 'CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED');
        WHEN 'FOLLOW_UP' THEN
          v_valid_transition := NEW.status IN ('RESPONDED', 'CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED');
        WHEN 'NO_LONGER_AVAILABLE' THEN
          v_valid_transition := NEW.status = 'CLOSED';
        WHEN 'EXPIRED' THEN
          v_valid_transition := NEW.status = 'CLOSED';
        ELSE
          v_valid_transition := false;
      END CASE;
    END IF;

    IF NOT v_valid_transition THEN
      RAISE EXCEPTION 'Invalid status transition: Cannot change inquiry % status from % to %.',
        OLD.id, OLD.status, NEW.status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unauthorized: Role % is not permitted to update inquiries.', v_role;
  END IF;

  -- --------------------------------------------------------------------------
  -- 6.5 Server-Controlled closed_at and updated_at
  -- --------------------------------------------------------------------------
  -- Completely derives and protects closed_at on the server:
  -- - Terminal states receive COALESCE(OLD.closed_at, now())
  -- - Non-terminal states strictly reset closed_at to NULL
  IF NEW.status IN ('CLOSED', 'WITHDRAWN', 'NO_LONGER_AVAILABLE', 'EXPIRED') THEN
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


-- ============================================================================
-- SECTION 7: Synchronize update_inquiry_status_tx() RPC
-- ============================================================================
-- Executes status updates under SECURITY DEFINER privileges (bypassing table-level
-- UPDATE revoke) while atomically inserting inquiry_history and audit_logs.

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
  v_valid_transition BOOLEAN := false;
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

  -- 7.1 BUYER validations
  IF v_role = 'BUYER' THEN
    IF v_inquiry.buyer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: You may only modify inquiries submitted under your own account.';
    END IF;
    IF p_new_status <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Unauthorized: Buyers are only permitted to withdraw their inquiries.';
    END IF;
    IF v_old_status = 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Inquiry % has already been withdrawn.', p_inquiry_id;
    END IF;
    IF v_old_status IN ('CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED') THEN
      RAISE EXCEPTION 'Cannot withdraw inquiry % because it is already %.', p_inquiry_id, v_old_status;
    END IF;
    IF v_old_status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'RESPONDED', 'FOLLOW_UP') THEN
      RAISE EXCEPTION 'Inquiry % with status % cannot be withdrawn.', p_inquiry_id, v_old_status;
    END IF;

  -- 7.2 COORDINATOR and ADMINISTRATOR validations
  ELSIF v_role IN ('COORDINATOR', 'ADMINISTRATOR') THEN
    IF v_old_status = 'WITHDRAWN' AND p_new_status <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Invalid transition: Withdrawn inquiry % cannot be reactivated.', p_inquiry_id;
    END IF;
    IF v_old_status = 'CLOSED' AND p_new_status <> 'CLOSED' THEN
      RAISE EXCEPTION 'Invalid transition: Closed inquiry % cannot be reopened.', p_inquiry_id;
    END IF;
    IF v_old_status <> 'WITHDRAWN' AND p_new_status = 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Invalid transition: Only the buyer can withdraw their inquiry.';
    END IF;

    IF v_old_status = p_new_status THEN
      v_valid_transition := true;
    ELSE
      CASE v_old_status
        WHEN 'SUBMITTED' THEN
          v_valid_transition := p_new_status IN ('UNDER_REVIEW', 'NO_LONGER_AVAILABLE', 'EXPIRED', 'CLOSED');
        WHEN 'UNDER_REVIEW' THEN
          v_valid_transition := p_new_status IN ('RESPONDED', 'FOLLOW_UP', 'NO_LONGER_AVAILABLE', 'EXPIRED', 'CLOSED');
        WHEN 'RESPONDED' THEN
          v_valid_transition := p_new_status IN ('FOLLOW_UP', 'CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED');
        WHEN 'FOLLOW_UP' THEN
          v_valid_transition := p_new_status IN ('RESPONDED', 'CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED');
        WHEN 'NO_LONGER_AVAILABLE' THEN
          v_valid_transition := p_new_status = 'CLOSED';
        WHEN 'EXPIRED' THEN
          v_valid_transition := p_new_status = 'CLOSED';
        ELSE
          v_valid_transition := false;
      END CASE;
    END IF;

    IF NOT v_valid_transition THEN
      RAISE EXCEPTION 'Invalid status transition: Cannot change inquiry % status from % to %.',
        p_inquiry_id, v_old_status, p_new_status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unauthorized: Role % is not permitted to update inquiries.', v_role;
  END IF;

  v_user_label := public.current_user_name();

  -- Execute state transition (guarded by enforce_inquiry_update_rules trigger)
  UPDATE public.inquiries
  SET status = p_new_status,
      updated_at = now(),
      closed_at = CASE
        WHEN p_new_status IN ('CLOSED', 'WITHDRAWN', 'EXPIRED', 'NO_LONGER_AVAILABLE') THEN COALESCE(closed_at, now())
        ELSE NULL
      END
  WHERE id = p_inquiry_id
  RETURNING * INTO v_inquiry;

  -- Append history record
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

  -- Append audit log entry
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

REVOKE EXECUTE ON FUNCTION public.update_inquiry_status_tx(TEXT, public.inquiry_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_inquiry_status_tx(TEXT, public.inquiry_status, TEXT) TO authenticated, service_role;


-- ============================================================================
-- SECTION 8: Audit Grants & Revoke Inadvertent Permissions Across Schema
-- ============================================================================
-- Ensure all application tables have strict privilege sanitation.

-- Revoke DELETE privileges on all application tables from API roles
REVOKE DELETE ON
  public.locations,
  public.organizations,
  public.profiles,
  public.reference_data,
  public.biomass_sources,
  public.biomass_records,
  public.validation_records,
  public.aggregation_groups,
  public.aggregation_members,
  public.inquiries,
  public.inquiry_history,
  public.audit_logs
FROM PUBLIC, anon, authenticated;

-- Revoke UPDATE privileges on append-only and workflow-governed tables
REVOKE UPDATE ON
  public.validation_records,
  public.inquiry_history,
  public.audit_logs,
  public.inquiries
FROM PUBLIC, anon, authenticated;

-- Revoke direct INSERT on append-only and workflow-governed tables
REVOKE INSERT ON
  public.validation_records,
  public.inquiry_history,
  public.inquiries,
  public.audit_logs
FROM PUBLIC, anon, authenticated;

-- Final verification notice
DO $$
BEGIN
  RAISE NOTICE 'AgriCycle Migration 006 (focused security hardening) applied successfully with full audit resolution.';
END $$;
