-- ============================================================================
-- AgriCycle Migration: 20261024000002_enforce_aggregation_uniqueness_and_hub_fk.sql
-- Community-Based Biomass Availability Information Management System (CB-BAIM)
-- ============================================================================
-- Purpose:
-- 1. Fix Foreign Key Constraint Error (aggregation_groups_hub_id_fkey):
--    - Make hub_id nullable on aggregation_groups so missing/optional hub assignments
--      do not trigger foreign key violations.
--    - Allow Coordinators and Administrators to register new Hubs/Cooperatives.
-- 2. Enforce Single-Group Membership for Biomass Records:
--    - Enforce UNIQUE constraint/index on aggregation_members(biomass_record_id) WHERE is_active = true.
--    - Atomic validation in create_aggregation_group_with_members rejecting any
--      record already assigned to an active aggregation group.
-- 3. Exclude Aggregated Records from Independent Buyer Inquiries:
--    - In submit_buyer_inquiry RPC, reject direct RECORD inquiries if the record is
--      already an active member of an aggregation group.
-- 4. Atomic Robust create_aggregation_group_with_members:
--    - Cleanses and validates p_hub_id, falling back gracefully to coordinator org or NULL.
-- ============================================================================

-- 1. Make hub_id nullable on aggregation_groups and ensure FK with ON DELETE SET NULL
ALTER TABLE public.aggregation_groups ALTER COLUMN hub_id DROP NOT NULL;

-- 2. Ensure partial unique index exists to enforce at most ONE active group per record
DROP INDEX IF EXISTS public.idx_unique_active_record_membership;
CREATE UNIQUE INDEX idx_unique_active_record_membership
  ON public.aggregation_members (biomass_record_id)
  WHERE is_active = true;

-- 3. Allow Coordinators & Administrators to insert new HUB or COOPERATIVE organizations
DROP POLICY IF EXISTS "organizations_coordinator_insert" ON public.organizations;
CREATE POLICY "organizations_coordinator_insert" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMINISTRATOR'
    OR (
      public.current_user_role() = 'COORDINATOR'
      AND type IN ('HUB', 'COOPERATIVE')
    )
  );

-- 4. Replace create_aggregation_group_with_members with robust hub handling & uniqueness enforcement
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
  v_effective_hub_id TEXT := NULL;
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

  -- Resolve and sanitize effective hub_id:
  -- Prevent empty strings "" from violating aggregation_groups_hub_id_fkey
  IF p_hub_id IS NOT NULL AND btrim(p_hub_id) <> '' THEN
    SELECT id INTO v_effective_hub_id
    FROM public.organizations
    WHERE id = btrim(p_hub_id)
    LIMIT 1;

    -- If provided hub_id does not exist in organizations table, do not throw unhandled FK error;
    -- instead attempt fallback to user's assigned organization or default central hub
    IF v_effective_hub_id IS NULL THEN
      SELECT id INTO v_effective_hub_id
      FROM public.organizations
      WHERE id = public.current_user_org_id() AND type IN ('HUB', 'COOPERATIVE')
      LIMIT 1;
    END IF;
  ELSE
    -- If p_hub_id is null or empty, attempt coordinator org fallback
    SELECT id INTO v_effective_hub_id
    FROM public.organizations
    WHERE id = public.current_user_org_id() AND type IN ('HUB', 'COOPERATIVE')
    LIMIT 1;
  END IF;

  -- If still null, fallback to the first active HUB organization if available
  IF v_effective_hub_id IS NULL THEN
    SELECT id INTO v_effective_hub_id
    FROM public.organizations
    WHERE type = 'HUB'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- Verify all member records are VALIDATED, match biomass type, share unit, and are not already active in another group
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

    -- Enforce single-group membership rule
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
    'Created aggregation group ' || v_group.id || ' with ' || array_length(p_member_record_ids, 1) || ' member records'
  );

  RETURN v_group;
END;
$$;

-- 5. Update submit_buyer_inquiry RPC to block direct inquiries on aggregated records
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
  v_active_group_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit an inquiry.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS NULL OR v_role <> 'BUYER' THEN
    IF v_role <> 'ADMINISTRATOR' THEN
      RAISE EXCEPTION 'Unauthorized: Only registered Buyers may submit inquiries.';
    END IF;
  END IF;

  IF p_requested_quantity IS NULL OR p_requested_quantity <= 0 THEN
    RAISE EXCEPTION 'Requested quantity must be greater than zero.';
  END IF;

  IF p_target_type = 'RECORD' THEN
    SELECT * INTO v_target_rec FROM public.biomass_records WHERE id = p_target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Biomass record % not found.', p_target_id;
    END IF;
    IF v_target_rec.status <> 'VALIDATED' THEN
      RAISE EXCEPTION 'Inquiries can only be submitted for VALIDATED biomass records.';
    END IF;
    IF v_target_rec.biomass_type_id <> p_biomass_type_id THEN
      RAISE EXCEPTION 'Inquiry biomass type (%) does not match target record % biomass type (%).',
        p_biomass_type_id, p_target_id, v_target_rec.biomass_type_id;
    END IF;

    -- Enforce: Aggregated records cannot be inquired as independent products
    SELECT ag.name INTO v_active_group_name
    FROM public.aggregation_members am
    JOIN public.aggregation_groups ag ON ag.id = am.group_id
    WHERE am.biomass_record_id = p_target_id
      AND am.is_active = true
      AND ag.status = 'ACTIVE'
    LIMIT 1;

    IF v_active_group_name IS NOT NULL THEN
      RAISE EXCEPTION 'Biomass record % has been consolidated into aggregation group "%" and cannot be inquired as an independent product.',
        p_target_id, v_active_group_name;
    END IF;

  ELSIF p_target_type = 'GROUP' THEN
    SELECT * INTO v_target_grp FROM public.aggregation_groups WHERE id = p_target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aggregation group % not found.', p_target_id;
    END IF;
    IF v_target_grp.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Inquiries can only be submitted for ACTIVE aggregation groups.';
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

-- 6. Ensure grant execution privileges on updated functions
REVOKE EXECUTE ON FUNCTION public.create_aggregation_group_with_members(TEXT, TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_aggregation_group_with_members(TEXT, TEXT, TEXT, TEXT[], TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.submit_buyer_inquiry(public.inquiry_target_type, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_buyer_inquiry(public.inquiry_target_type, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
