-- ============================================================================
-- AgriCycle Migration: 20261024000001_biomass_dates_and_inquiry_workflow.sql
-- Community-Based Biomass Availability Information Management System (CB-BAIM)
-- ============================================================================
-- Purpose:
-- 1. Conditional Biomass Availability Dates:
--    Drop NOT NULL on availability_period_start and availability_period_end
--    allowing records with 0 remaining quantity or internal-only usage to omit dates.
-- 2. Internal Producer Use Column:
--    Add current_use_quantity column to biomass_records if not present.
-- 3. Coordinator Accept / Decline Inquiry Workflow:
--    Add 'ACCEPTED', 'DECLINED', 'IN_DISCUSSION', 'ACKNOWLEDGED' to inquiry_status enum.
-- 4. Inquiry Update Rule Trigger Update:
--    Support explicit Accept and Decline workflows in enforce_inquiry_update_rules().
-- ============================================================================

-- 1. Make availability dates nullable on biomass_records
ALTER TABLE public.biomass_records ALTER COLUMN availability_period_start DROP NOT NULL;
ALTER TABLE public.biomass_records ALTER COLUMN availability_period_end DROP NOT NULL;

-- 2. Add current_use_quantity and external_availability if not existing
ALTER TABLE public.biomass_records ADD COLUMN IF NOT EXISTS current_use_quantity NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.biomass_records ADD COLUMN IF NOT EXISTS external_availability TEXT DEFAULT 'AVAILABLE_TO_OTHERS';

-- 3. Extend inquiry_status enum with ACCEPTED, DECLINED, IN_DISCUSSION, ACKNOWLEDGED
DO $$ BEGIN
  ALTER TYPE public.inquiry_status ADD VALUE 'ACCEPTED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.inquiry_status ADD VALUE 'DECLINED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.inquiry_status ADD VALUE 'IN_DISCUSSION';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.inquiry_status ADD VALUE 'ACKNOWLEDGED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Update the trigger enforce_inquiry_update_rules
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

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Caller role cannot be verified or active user profile is missing.';
  END IF;

  -- 4.1 Immutability of Inquiry Terms
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

  -- 4.2 Terminal States
  IF OLD.status::text = 'WITHDRAWN' AND NEW.status::text <> 'WITHDRAWN' THEN
    RAISE EXCEPTION 'Invalid transition: Withdrawn inquiry % cannot be reactivated.', OLD.id;
  END IF;

  IF OLD.status::text = 'CLOSED' AND NEW.status::text <> 'CLOSED' THEN
    RAISE EXCEPTION 'Invalid transition: Closed inquiry % cannot be reopened.', OLD.id;
  END IF;

  -- 4.3 BUYER Rules: Ownership & Withdrawal
  IF v_role = 'BUYER' THEN
    IF OLD.buyer_user_id IS NULL OR OLD.buyer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: You may only modify inquiries submitted under your own account.';
    END IF;

    IF NEW.status::text <> 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Unauthorized: Buyers are only permitted to withdraw their inquiries.';
    END IF;

    IF OLD.status::text = 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Inquiry % has already been withdrawn.', OLD.id;
    END IF;

    IF OLD.status::text IN ('CLOSED', 'NO_LONGER_AVAILABLE', 'EXPIRED', 'DECLINED') THEN
      RAISE EXCEPTION 'Cannot withdraw inquiry % because it is already %.', OLD.id, OLD.status;
    END IF;

    -- Allowed to withdraw from active/pending states
    IF OLD.status::text NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'IN_DISCUSSION', 'ACKNOWLEDGED', 'RESPONDED', 'FOLLOW_UP') THEN
      RAISE EXCEPTION 'Inquiry % with status % cannot be withdrawn.', OLD.id, OLD.status;
    END IF;

  -- 4.4 COORDINATOR and ADMINISTRATOR Rules
  ELSIF v_role IN ('COORDINATOR', 'ADMINISTRATOR') THEN
    IF OLD.status::text <> 'WITHDRAWN' AND NEW.status::text = 'WITHDRAWN' THEN
      RAISE EXCEPTION 'Invalid transition: Only the buyer can withdraw their inquiry.';
    END IF;

    IF OLD.status = NEW.status THEN
      v_valid_transition := true;
    ELSE
      CASE OLD.status::text
        WHEN 'SUBMITTED' THEN
          v_valid_transition := NEW.status::text IN ('ACCEPTED', 'DECLINED', 'UNDER_REVIEW', 'ACKNOWLEDGED', 'RESPONDED', 'IN_DISCUSSION', 'NO_LONGER_AVAILABLE', 'EXPIRED', 'CLOSED');
        WHEN 'UNDER_REVIEW' THEN
          v_valid_transition := NEW.status::text IN ('ACCEPTED', 'DECLINED', 'RESPONDED', 'IN_DISCUSSION', 'FOLLOW_UP', 'NO_LONGER_AVAILABLE', 'EXPIRED', 'CLOSED');
        WHEN 'ACCEPTED' THEN
          v_valid_transition := NEW.status::text IN ('IN_DISCUSSION', 'RESPONDED', 'FOLLOW_UP', 'CLOSED', 'DECLINED', 'NO_LONGER_AVAILABLE', 'EXPIRED');
        WHEN 'ACKNOWLEDGED' THEN
          v_valid_transition := NEW.status::text IN ('ACCEPTED', 'IN_DISCUSSION', 'RESPONDED', 'CLOSED', 'DECLINED', 'NO_LONGER_AVAILABLE', 'EXPIRED');
        WHEN 'IN_DISCUSSION' THEN
          v_valid_transition := NEW.status::text IN ('RESPONDED', 'FOLLOW_UP', 'CLOSED', 'DECLINED', 'NO_LONGER_AVAILABLE', 'EXPIRED');
        WHEN 'RESPONDED' THEN
          v_valid_transition := NEW.status::text IN ('ACCEPTED', 'IN_DISCUSSION', 'FOLLOW_UP', 'CLOSED', 'DECLINED', 'NO_LONGER_AVAILABLE', 'EXPIRED');
        WHEN 'FOLLOW_UP' THEN
          v_valid_transition := NEW.status::text IN ('ACCEPTED', 'IN_DISCUSSION', 'RESPONDED', 'CLOSED', 'DECLINED', 'NO_LONGER_AVAILABLE', 'EXPIRED');
        WHEN 'DECLINED' THEN
          v_valid_transition := NEW.status::text = 'CLOSED';
        WHEN 'NO_LONGER_AVAILABLE' THEN
          v_valid_transition := NEW.status::text = 'CLOSED';
        WHEN 'EXPIRED' THEN
          v_valid_transition := NEW.status::text = 'CLOSED';
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

  -- 4.5 Server-Controlled closed_at and updated_at
  IF NEW.status::text IN ('CLOSED', 'WITHDRAWN', 'NO_LONGER_AVAILABLE', 'EXPIRED', 'DECLINED') THEN
    NEW.closed_at := COALESCE(OLD.closed_at, now());
  ELSE
    NEW.closed_at := NULL;
  END IF;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;
