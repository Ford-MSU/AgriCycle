-- ============================================================================
-- AgriCycle Migration 004 (Incremental Patch): 20261021000001_tighten_security_and_workflows.sql
-- Community-Based Biomass Information Management and Market Linkage System
-- ============================================================================
-- Purpose:
-- Applies targeted security hardening, workflow enforcement, quantity clarifications,
-- and RLS tightening to databases where Migrations 001, 002, and 003 have already run.
-- Safe, non-destructive, and idempotent (no tables dropped, no data deleted).
-- ============================================================================

-- 1. Tighten Inquiry RLS & Add Withdrawal-Only Enforcement Trigger
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
    IF OLD.buyer_user_id IS NULL OR OLD.buyer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: You may only modify inquiries submitted under your own account.';
    END IF;

    IF NEW.status <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Unauthorized: Buyers are only permitted to withdraw their inquiries.';
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

REVOKE EXECUTE ON FUNCTION public.enforce_inquiry_update_rules() FROM PUBLIC, anon, authenticated;

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

DROP POLICY IF EXISTS "inquiry_history_insert_authenticated" ON public.inquiry_history;

-- 2. Prevent Stale, Expired, or Zero-Quantity Records from Appearing as Available to Buyers
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

-- 3. Update submit_buyer_inquiry to Validate Record Availability and Expiration
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

-- 4. Tighten Audit Log Access and Direct Grants
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

-- Revoke direct INSERT on validation_records and inquiry_history to prevent workflow bypass
REVOKE INSERT ON public.validation_records FROM authenticated;
REVOKE INSERT ON public.inquiry_history FROM authenticated;
GRANT SELECT ON public.validation_records TO authenticated;
GRANT SELECT ON public.inquiry_history TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- 5. Data Backfill & Alignment of Demonstration Inquiry INQ-1001 (if present)
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
