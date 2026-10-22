-- ============================================================================
-- AgriCycle Migration 005: 20261021000002_harden_security_and_inquiries.sql
-- Community-Based Biomass Information Management and Market Linkage System
-- ============================================================================
-- Purpose:
-- Resolves remaining security vulnerabilities and workflow bypasses:
-- 1. Enforces submit_buyer_inquiry() RPC workflow and revokes direct buyer INSERTs.
-- 2. Validates requested quantities against remaining available stock.
-- 3. Restricts public.validation_records and public.aggregation_members SELECT policies.
-- 4. Converts enforce_inquiry_update_rules() into a strictly fail-closed trigger,
--    enforcing inquiry status state machines and blocking duplicate withdrawals.
-- 5. Hardens update_inquiry_status_tx() to mirror trigger rules.
-- 6. Safely guards demonstration inquiry data backfills against user data overwrites.
--
-- Prerequisites:
-- - 20261009000001_initial_schema.sql
-- - 20261009000002_rls_and_functions.sql
-- - 20261009000003_seed_reference_and_initial_data.sql
-- - 20261021000001_tighten_security_and_workflows.sql (Migration 004)
-- ============================================================================

-- ============================================================================
-- 1. Step 1: Require Inquiry RPC Instead of Direct Buyer INSERTs
-- ============================================================================

-- 1.1 Revoke direct table INSERT from authenticated to stop API bypasses
REVOKE INSERT ON public.inquiries FROM authenticated;

-- 1.2 Drop legacy buyer direct insert policy
DROP POLICY IF EXISTS "inquiries_insert_buyer" ON public.inquiries;
DROP POLICY IF EXISTS "inquiries_insert_admin_only" ON public.inquiries;

-- 1.3 Maintain an Administrator-only direct INSERT policy for emergency admin tools
CREATE POLICY "inquiries_insert_admin_only" ON public.inquiries
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'ADMINISTRATOR');

-- 1.4 Hardened submit_buyer_inquiry RPC
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

  -- Target validation & quantity headroom checks
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

    IF v_target_rec.availability_period_end < now() THEN
      RAISE EXCEPTION 'Target biomass record % availability period has expired (ended %).',
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

    -- Calculate total remaining quantity among active validated non-expired member records
    SELECT COALESCE(SUM(br.remaining_quantity), 0)
    INTO v_group_remaining
    FROM public.aggregation_members am
    JOIN public.biomass_records br ON br.id = am.biomass_record_id
    WHERE am.group_id = p_target_id
      AND am.is_active = true
      AND br.status = 'VALIDATED'
      AND br.is_theoretical_estimate = false
      AND br.availability_period_end >= now();

    IF v_group_remaining <= 0 THEN
      RAISE EXCEPTION 'Target aggregation group % has no available biomass quantity from validated active records.', p_target_id;
    END IF;

    IF p_requested_quantity > v_group_remaining THEN
      RAISE EXCEPTION 'Requested quantity (%) exceeds available aggregated quantity (%) for group %.',
        p_requested_quantity, v_group_remaining, p_target_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid inquiry target type: %.', p_target_type;
  END IF;

  -- Derive user label securely from verified profile
  v_user_label := public.current_user_name();

  -- Atomic insertion into inquiries
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

  -- Atomic history entry
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

  -- Atomic audit log
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
      'requestedUnit', p_requested_unit
    ),
    'Inquiry ' || v_inquiry.id || ' submitted for ' || p_target_type::text || ' ' || p_target_id
  );

  RETURN v_inquiry;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_buyer_inquiry(public.inquiry_target_type, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_buyer_inquiry(public.inquiry_target_type, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- ============================================================================
-- 2. Step 2: Tighten SELECT Policies for validation_records and aggregation_members
-- ============================================================================

-- 2.1 validation_records: Revoke broad SELECT and enforce role separation
DROP POLICY IF EXISTS "validation_select_authenticated" ON public.validation_records;
DROP POLICY IF EXISTS "validation_records_select_by_role" ON public.validation_records;

CREATE POLICY "validation_records_select_by_role" ON public.validation_records
  FOR SELECT TO authenticated
  USING (
    -- Administrators and LGU validators have complete visibility
    public.current_user_role() IN ('ADMINISTRATOR', 'LGU')
    OR (
      -- Coordinators can only inspect validation records for records belonging to their cooperative or submitted by them
      public.current_user_role() = 'COORDINATOR'
      AND EXISTS (
        SELECT 1 FROM public.biomass_records br
        LEFT JOIN public.biomass_sources bs ON bs.id = br.source_id
        WHERE br.id = validation_records.biomass_record_id
          AND (
            br.submitter_id = auth.uid()
            OR (bs.cooperative_id IS NOT NULL AND bs.cooperative_id = public.current_user_org_id())
          )
      )
    )
    -- BUYER role explicitly receives NO SELECT access to internal validation records
  );

-- 2.2 aggregation_members: Drop permissive USING (true) policy and scope by role
DROP POLICY IF EXISTS "agg_members_select_authenticated" ON public.aggregation_members;
DROP POLICY IF EXISTS "agg_members_select_by_role" ON public.aggregation_members;

CREATE POLICY "agg_members_select_by_role" ON public.aggregation_members
  FOR SELECT TO authenticated
  USING (
    -- Administrators and LGU have oversight visibility
    public.current_user_role() IN ('ADMINISTRATOR', 'LGU')
    OR (
      -- Coordinators can see members of groups they created, hub-linked groups, or their cooperative's records
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
      -- Buyers can ONLY see active member records of ACTIVE aggregation groups
      public.current_user_role() = 'BUYER'
      AND is_active = true
      AND EXISTS (
        SELECT 1 FROM public.aggregation_groups ag
        WHERE ag.id = aggregation_members.group_id
          AND ag.status = 'ACTIVE'
      )
    )
  );


-- ============================================================================
-- 3. Step 3: Fail-Closed Inquiry Update Trigger & Lifecycle State Machine
-- ============================================================================

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

  -- STRICT FAIL-CLOSED: Halt immediately if role cannot be determined or caller profile is missing
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Caller role cannot be verified or active user profile is missing.';
  END IF;

  -- 3.1 Rules for BUYER
  IF v_role = 'BUYER' THEN
    -- Verify ownership
    IF OLD.buyer_user_id IS NULL OR OLD.buyer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: You may only modify inquiries submitted under your own account.';
    END IF;

    -- Block duplicate withdrawal
    IF OLD.status = 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Inquiry % has already been withdrawn.', OLD.id;
    END IF;

    -- Block withdrawal of terminal/expired inquiries
    IF OLD.status IN ('CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED') THEN
      RAISE EXCEPTION 'Cannot withdraw inquiry % because it is already %.', OLD.id, OLD.status;
    END IF;

    -- Only active states can transition to WITHDRAWN
    IF OLD.status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'RESPONDED', 'FOLLOW_UP') THEN
      RAISE EXCEPTION 'Inquiry % with status % cannot be withdrawn.', OLD.id, OLD.status;
    END IF;

    -- Buyers are ONLY permitted to withdraw
    IF NEW.status <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Unauthorized: Buyers are only permitted to withdraw their inquiries.';
    END IF;

    -- Strict immutability of inquiry terms
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

    NEW.closed_at := COALESCE(OLD.closed_at, now());
    NEW.updated_at := now();

  -- 3.2 Rules for COORDINATOR and ADMINISTRATOR
  ELSIF v_role IN ('COORDINATOR', 'ADMINISTRATOR') THEN
    -- Prevent reopening or transitioning terminal statuses
    IF OLD.status = 'WITHDRAWN' AND NEW.status <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Invalid transition: Withdrawn inquiry % cannot be reactivated.', OLD.id;
    END IF;

    IF OLD.status = 'CLOSED' AND NEW.status <> 'CLOSED' THEN
      RAISE EXCEPTION 'Invalid transition: Closed inquiry % cannot be reopened.', OLD.id;
    END IF;

    IF OLD.status = 'NO_LONGER_AVAILABLE' AND NEW.status NOT IN ('NO_LONGER_AVAILABLE', 'CLOSED') THEN
      RAISE EXCEPTION 'Invalid transition: Unavailable inquiry % cannot be reactivated.', OLD.id;
    END IF;

    IF OLD.status = 'EXPIRED' AND NEW.status NOT IN ('EXPIRED', 'CLOSED') THEN
      RAISE EXCEPTION 'Invalid transition: Expired inquiry % cannot be reactivated.', OLD.id;
    END IF;

    -- Enforce immutability of original buyer inquiry identity and target terms
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.buyer_user_id IS DISTINCT FROM OLD.buyer_user_id
       OR NEW.target_type IS DISTINCT FROM OLD.target_type
       OR NEW.target_id IS DISTINCT FROM OLD.target_id
       OR NEW.biomass_type_id IS DISTINCT FROM OLD.biomass_type_id
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Unauthorized: Core inquiry terms (target, buyer, biomass type) cannot be modified.';
    END IF;

    IF NEW.status IN ('CLOSED', 'WITHDRAWN', 'NO_LONGER_AVAILABLE', 'EXPIRED') THEN
      NEW.closed_at := COALESCE(OLD.closed_at, now());
    END IF;
    NEW.updated_at := now();

  ELSE
    RAISE EXCEPTION 'Unauthorized: Role % is not permitted to update inquiries.', v_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiries_update_rules ON public.inquiries;
CREATE TRIGGER trg_inquiries_update_rules
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_inquiry_update_rules();

REVOKE EXECUTE ON FUNCTION public.enforce_inquiry_update_rules() FROM PUBLIC, anon, authenticated;


-- 3.3 Synchronize update_inquiry_status_tx RPC
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

  IF v_role = 'BUYER' THEN
    IF v_inquiry.buyer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: You may only modify inquiries submitted under your own account.';
    END IF;
    IF p_new_status <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Unauthorized: Buyers are only permitted to withdraw their inquiries.';
    END IF;
    IF v_inquiry.status = 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Inquiry % has already been withdrawn.', p_inquiry_id;
    END IF;
    IF v_inquiry.status IN ('CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED') THEN
      RAISE EXCEPTION 'Cannot withdraw inquiry % because it is already %.', p_inquiry_id, v_inquiry.status;
    END IF;
    IF v_inquiry.status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'RESPONDED', 'FOLLOW_UP') THEN
      RAISE EXCEPTION 'Inquiry % with status % cannot be withdrawn.', p_inquiry_id, v_inquiry.status;
    END IF;
  ELSIF v_role IN ('COORDINATOR', 'ADMINISTRATOR') THEN
    IF v_inquiry.status = 'WITHDRAWN' AND p_new_status <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Invalid transition: Withdrawn inquiry % cannot be reactivated.', p_inquiry_id;
    END IF;
    IF v_inquiry.status = 'CLOSED' AND p_new_status <> 'CLOSED' THEN
      RAISE EXCEPTION 'Invalid transition: Closed inquiry % cannot be reopened.', p_inquiry_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Role % is not permitted to update inquiries.', v_role;
  END IF;

  v_old_status := v_inquiry.status;
  v_user_label := public.current_user_name();

  UPDATE public.inquiries
  SET status = p_new_status,
      updated_at = now(),
      closed_at = CASE
        WHEN p_new_status IN ('CLOSED', 'WITHDRAWN', 'EXPIRED', 'NO_LONGER_AVAILABLE') THEN COALESCE(closed_at, now())
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

REVOKE EXECUTE ON FUNCTION public.update_inquiry_status_tx(TEXT, public.inquiry_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_inquiry_status_tx(TEXT, public.inquiry_status, TEXT) TO authenticated, service_role;


-- ============================================================================
-- 4. Step 4: Guard Demo Inquiry Backfill (Safe & Idempotent)
-- ============================================================================
-- Strictly guards demonstration data fix so it only modifies the seeded demo row
-- with buyer_user_id IS NULL and buyer_user_label = 'user-buyer'.
-- Never modifies or overwrites real user inquiries.

UPDATE public.inquiries
SET target_id = 'REC-1001',
    biomass_type_id = COALESCE((SELECT id FROM public.reference_data WHERE category = 'BIOMASS_TYPE' AND code = 'RICE_HUSK' LIMIT 1), 'ref-bio-1'),
    requested_quantity = 100,
    requested_unit = COALESCE((SELECT id FROM public.reference_data WHERE category = 'UNIT' AND code = 'BAGS_50KG' LIMIT 1), 'ref-unit-3'),
    intended_use = 'Mushroom Cultivation & Soil Conditioner'
WHERE id = 'INQ-1001'
  AND target_id = 'REC-1002'
  AND buyer_user_id IS NULL
  AND buyer_user_label = 'user-buyer';
