-- ============================================================================
-- AgriCycle Migration 003: Standardized Reference Data & Initial Seed Records
-- ============================================================================
-- Note on User Attribution:
-- Sample seed records do NOT fabricate rows in auth.users or public.profiles.
-- Foreign key columns (submitter_id, validator_id, created_by, added_by,
-- buyer_user_id, changed_by, user_id) are left NULL for initial seed rows,
-- while human-readable display labels are stored in the *_label columns.
-- ============================================================================

-- 1. Seed Controlled Reference Data (Biomass Types, Units, Source Types)
-- Safe for databases that already contain matching categories and codes under different IDs:
-- Uses `ON CONFLICT (category, code) DO UPDATE` to keep labels, descriptions, and statuses in sync.
INSERT INTO public.reference_data (id, category, code, label, description, is_active) VALUES
  ('ref-bio-1', 'BIOMASS_TYPE', 'RICE_HUSK', 'Rice Husk', 'Outer covering of rice grains from milling operations', true),
  ('ref-bio-2', 'BIOMASS_TYPE', 'RICE_STRAW', 'Rice Straw', 'Post-harvest rice stalks and field residue', true),
  ('ref-bio-3', 'BIOMASS_TYPE', 'CORN_COB', 'Corn Cob', 'Central core of maize ears after shelling', true),
  ('ref-bio-4', 'BIOMASS_TYPE', 'CORN_STALK', 'Corn Stalk/Residue', 'Post-harvest maize stover and stalks', true),
  ('ref-bio-5', 'BIOMASS_TYPE', 'COCONUT_SHELL', 'Coconut Shell', 'Hard endocarp shell suitable for charcoal or bioenergy', true),
  ('ref-bio-6', 'BIOMASS_TYPE', 'COCONUT_HUSK', 'Coconut Husk', 'Fibrous mesocarp exocarp from coconut processing', true),
  ('ref-bio-7', 'BIOMASS_TYPE', 'WOOD_CHIPS', 'Wood Chips', 'Sawmill offcuts, wood shavings, and timber processing residue', true),
  ('ref-unit-1', 'UNIT', 'KG', 'Kilograms (kg)', 'Standard weight measurement in kilograms', true),
  ('ref-unit-2', 'UNIT', 'MT', 'Metric Tons (MT)', '1,000 kilograms metric weight unit', true),
  ('ref-unit-3', 'UNIT', 'BAGS_50KG', 'Bags (50kg)', 'Standard 50-kilogram woven polypropylene sacks', true),
  ('ref-unit-4', 'UNIT', 'TRUCKLOADS', 'Truckloads', 'Bulk volume by standard haulage truckload', true),
  ('ref-src-1', 'SOURCE_TYPE', 'AGRICULTURAL_COOP', 'Agricultural Coop', 'Registered farmer or producer cooperative', true),
  ('ref-src-2', 'SOURCE_TYPE', 'INDUSTRIAL', 'Industrial', 'Rice mill, sawmill, or agro-industrial processor', true),
  ('ref-src-3', 'SOURCE_TYPE', 'FARM', 'Farm', 'Individual or consolidated agricultural farm', true),
  ('ref-src-4', 'SOURCE_TYPE', 'LGU_FACILITY', 'LGU Facility', 'Municipal or barangay material recovery/collection site', true)
ON CONFLICT (category, code) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      is_active = EXCLUDED.is_active;

-- 2. Seed Butuan City Barangays & Coordinates
INSERT INTO public.locations (id, barangay, city, province, latitude, longitude) VALUES
  ('loc-1', 'Lumbocan', 'Butuan City', 'Agusan del Norte', 8.971500, 125.509700),
  ('loc-2', 'Libertad', 'Butuan City', 'Agusan del Norte', 8.932800, 125.534200),
  ('loc-3', 'Ampayon', 'Butuan City', 'Agusan del Norte', 8.956400, 125.584300),
  ('loc-4', 'Bancasi', 'Butuan City', 'Agusan del Norte', 8.948200, 125.474600),
  ('loc-5', 'Baan KM 3', 'Butuan City', 'Agusan del Norte', 8.951100, 125.562100),
  ('loc-6', 'Los Angeles', 'Butuan City', 'Agusan del Norte', 9.011200, 125.598400)
ON CONFLICT (barangay, city, province) DO NOTHING;

-- 3. Seed Organizations (Hubs, Cooperatives, LGU, Buyer Orgs)
INSERT INTO public.organizations (id, name, type, location_id) VALUES
  ('org-1', 'Butuan Central Hub', 'HUB', 'loc-1'),
  ('org-2', 'Agusan Farmers Cooperative', 'COOPERATIVE', 'loc-2'),
  ('org-3', 'Butuan City Agriculturist Office (LGU)', 'LGU', 'loc-2'),
  ('org-4', 'Caraga Green Energy & Biochar Corp.', 'BUYER', 'loc-5')
ON CONFLICT (name) DO NOTHING;

-- 4. Seed Biomass Sources (created_by is NULL because no auth.users are fabricated;
-- src-1 is an independent Industrial sawmill, so cooperative_id is NULL rather than HUB org-1)
INSERT INTO public.biomass_sources (id, name, type, location_id, contact_person, cooperative_id, created_by) VALUES
  ('src-1', 'Lumbocan Lumber & Sawmill', 'Industrial', 'loc-1', 'Juan Dela Cruz', NULL, NULL),
  ('src-2', 'Libertad Rice Farmers Coop', 'Agricultural Coop', 'loc-2', 'Maria Clara', 'org-2', NULL),
  ('src-3', 'Ampayon Corn Growers', 'Agricultural Coop', 'loc-3', 'Pedro Penduko', 'org-2', NULL)
ON CONFLICT (id) DO NOTHING;

-- 5. Seed Initial Biomass Records
-- Note on Demonstration Records:
-- - REC-1001: Actively available VALIDATED Rice Husk (500 bags reported, 450 remaining, period ending in +25 days).
-- - REC-1002: Lapsed / STALE Wood Chips (expired 10 days ago). Explicitly marked STALE to demonstrate automated
--   exclusion from active marketplace listings while preserving historical auditability.
-- - REC-1003: SUBMITTED Corn Stalk awaiting LGU field validation.
-- - REC-1004: UNDER_REVIEW Coconut Husk currently being evaluated by LGU.
-- Dynamic foreign-key lookup resolves the canonical reference IDs safely regardless of existing database sequences.
INSERT INTO public.biomass_records (
  id, biomass_type_id, quantity, original_unit, source_id, location_id,
  status, is_theoretical_estimate, availability_period_start, availability_period_end,
  current_use, reserved_quantity, remaining_quantity, condition, condition_note,
  storage, access_location_notes, submitter_id, submitter_label, created_at, last_updated_date, validation_date
) VALUES
  (
    'REC-1001',
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'BIOMASS_TYPE' AND code = 'RICE_HUSK' LIMIT 1), 'ref-bio-1'),
    500,
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'UNIT' AND code = 'BAGS_50KG' LIMIT 1), 'ref-unit-3'),
    'src-2', 'loc-2',
    'VALIDATED', false, now() - interval '5 days', now() + interval '25 days',
    'Available / not currently used', 50, 450, 'Dry', 'Stored in covered warehouse.',
    'Warehouse', 'Accessible by 6-wheeler truck', NULL, 'user-coord',
    now() - interval '10 days', now() - interval '8 days', now() - interval '8 days'
  ),
  (
    'REC-1002',
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'BIOMASS_TYPE' AND code = 'WOOD_CHIPS' LIMIT 1), 'ref-bio-7'),
    8000,
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'UNIT' AND code = 'KG' LIMIT 1), 'ref-unit-1'),
    'src-1', 'loc-1',
    'STALE', false, now() - interval '60 days', now() - interval '10 days',
    'Used as fuel', 0, 8000, 'Mixed', 'Availability window lapsed; kept for historical demonstration.',
    'Open yard', 'Accessible by 10-wheeler', NULL, 'user-coord',
    now() - interval '65 days', now() - interval '65 days', now() - interval '62 days'
  ),
  (
    'REC-1003',
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'BIOMASS_TYPE' AND code = 'CORN_STALK' LIMIT 1), 'ref-bio-4'),
    12,
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'UNIT' AND code = 'TRUCKLOADS' LIMIT 1), 'ref-unit-4'),
    'src-3', 'loc-3',
    'SUBMITTED', false, now() - interval '1 day', now() + interval '14 days',
    'Left in field / Available', 0, 12, 'Fresh/Wet', 'Needs harvesting assistance',
    'Field', 'Muddy access, needs tractor', NULL, 'user-coord-2',
    now() - interval '2 days', now() - interval '1 day', NULL
  ),
  (
    'REC-1004',
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'BIOMASS_TYPE' AND code = 'COCONUT_HUSK' LIMIT 1), 'ref-bio-6'),
    2000,
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'UNIT' AND code = 'KG' LIMIT 1), 'ref-unit-1'),
    'src-2', 'loc-2',
    'UNDER_REVIEW', false, now(), now() + interval '30 days',
    'Available', 0, 2000, 'Dry', '',
    'Covered Shed', 'Easy access', NULL, 'user-coord',
    now() - interval '1 day', now() - interval '1 day', NULL
  )
ON CONFLICT (id) DO NOTHING;

-- 6. Seed Validation Records (validator_id is NULL; validator_label stores sample label)
INSERT INTO public.validation_records (
  id, biomass_record_id, validator_id, validator_label, decision, validation_basis, validation_notes, validation_date
) VALUES
  (
    'val-1', 'REC-1001', NULL, 'user-lgu', 'VALIDATED', 'Field Inspection',
    'Confirmed bags in warehouse match reported count.', now() - interval '8 days'
  ),
  (
    'val-2', 'REC-1002', NULL, 'user-lgu', 'VALIDATED', 'Phone Verification',
    'Spoke with Juan Dela Cruz, confirmed availability.', now() - interval '62 days'
  )
ON CONFLICT (id) DO NOTHING;

-- 7. Seed Initial Aggregation Group & Member (created_by / added_by are NULL)
-- AG-001 uses 'org-1' (Butuan Central Hub, type = 'HUB') as its hub_id.
INSERT INTO public.aggregation_groups (
  id, name, biomass_type_id, hub_id, status, notes, created_by, created_by_label, created_at, updated_at
) VALUES
  (
    'AG-001', 'Rice Husk - Batch 1 (Libertad)',
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'BIOMASS_TYPE' AND code = 'RICE_HUSK' LIMIT 1), 'ref-bio-1'),
    'org-1', 'ACTIVE',
    'Information-level grouping of available rice husk.', NULL, 'user-coord',
    now() - interval '5 days', now() - interval '2 days'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.aggregation_members (
  id, group_id, biomass_record_id, added_by, added_by_label, added_at, is_active
) VALUES
  (
    'agm-1', 'AG-001', 'REC-1001', NULL, 'user-coord', now() - interval '5 days', true
  )
ON CONFLICT (group_id, biomass_record_id) DO NOTHING;

-- 8. Seed Initial Inquiry & History
-- INQ-1001 targets active, VALIDATED record REC-1001 (Rice Husk) matching biomass_type_id 'ref-bio-1'
-- and requested unit 'ref-unit-3' (Bags 50kg).
-- buyer_user_id and changed_by are NULL (no fabricated auth users).
-- Under tightened RLS, this inquiry is visible to Administrators, Coordinators, and LGU.
-- (To associate with a test buyer in local prototyping:
--  UPDATE public.inquiries SET buyer_user_id = '<buyer-auth-uuid>' WHERE id = 'INQ-1001';)
INSERT INTO public.inquiries (
  id, buyer_user_id, buyer_user_label, target_type, target_id, biomass_type_id,
  requested_quantity, requested_unit, intended_use, preferred_availability_period,
  status, submitted_at, updated_at
) VALUES
  (
    'INQ-1001', NULL, 'user-buyer', 'RECORD', 'REC-1001',
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'BIOMASS_TYPE' AND code = 'RICE_HUSK' LIMIT 1), 'ref-bio-1'),
    100,
    COALESCE((SELECT id FROM public.reference_data WHERE category = 'UNIT' AND code = 'BAGS_50KG' LIMIT 1), 'ref-unit-3'),
    'Mushroom Cultivation & Soil Conditioner', 'Immediate delivery',
    'UNDER_REVIEW', now() - interval '2 days', now() - interval '1 day'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.inquiry_history (
  id, inquiry_id, previous_status, new_status, changed_by, changed_by_label, changed_at, notes
) VALUES
  (
    'inqh-1', 'INQ-1001', NULL, 'SUBMITTED', NULL, 'user-buyer', now() - interval '2 days', 'Initial inquiry submitted for active Rice Husk'
  ),
  (
    'inqh-2', 'INQ-1001', 'SUBMITTED', 'UNDER_REVIEW', NULL, 'user-coord', now() - interval '1 day',
    'Checking exact warehouse pickup schedule with the cooperative.'
  )
ON CONFLICT (id) DO NOTHING;

-- 9. Seed Initial Audit Logs (user_id is explicitly NULL)
INSERT INTO public.audit_logs (
  id, user_id, user_label, action, entity_type, entity_id, timestamp, details
) VALUES
  ('log-1', NULL, 'user-coord', 'CREATE', 'BiomassRecord', 'REC-1001', now() - interval '10 days', 'Initial record created'),
  ('log-2', NULL, 'user-coord', 'SUBMIT', 'BiomassRecord', 'REC-1001', now() - interval '10 days', 'Submitted for LGU validation'),
  ('log-3', NULL, 'user-lgu', 'VALIDATE', 'ValidationRecord', 'val-1', now() - interval '8 days', 'Validated REC-1001 via Field Inspection')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 10. Hardened Administrator & Role Provisioning Helper
-- ============================================================================
-- SECURITY NOTE:
-- 1. Never relies on `auth.uid() IS NULL` alone (which is true for anonymous API requests!).
-- 2. Execution is revoked from PUBLIC and anon; only authenticated Administrators,
--    service_role, or the Supabase SQL Editor (postgres/supabase_admin) can assign roles.
-- 3. Every role change is automatically recorded in public.audit_logs.
--
-- Example usage in Supabase SQL Editor after registering users via Auth:
--   SELECT public.admin_assign_user_role('admin@test.com', 'ADMINISTRATOR', NULL);
--   SELECT public.admin_assign_user_role('coordinator@test.com', 'COORDINATOR', 'org-2');
--   SELECT public.admin_assign_user_role('lgu@test.com', 'LGU', 'org-3');
--   SELECT public.admin_assign_user_role('buyer@test.com', 'BUYER', 'org-4');

CREATE OR REPLACE FUNCTION public.admin_assign_user_role(
  p_email TEXT,
  p_role public.user_role,
  p_organization_id TEXT DEFAULT NULL
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
    -- Authenticated API caller: must be an active ADMINISTRATOR in public.profiles
    IF public.current_user_role() IS DISTINCT FROM 'ADMINISTRATOR' THEN
      RAISE EXCEPTION 'Unauthorized: Only an active Administrator can assign user roles.';
    END IF;
    v_actor_label := public.current_user_name();
  ELSE
    -- No user JWT present: explicitly reject anonymous/authenticated PostgREST callers
    IF v_caller_jwt_role = 'anon' OR v_caller_db_role IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Unauthorized: Anonymous API callers cannot assign user roles.';
    END IF;

    -- Strictly require direct SQL Editor superuser (with no PostgREST JWT) or service_role
    IF v_caller_jwt_role <> 'service_role'
       AND NOT (v_caller_jwt_role = '' AND v_caller_db_role IN ('postgres', 'supabase_admin', 'service_role')) THEN
      RAISE EXCEPTION 'Unauthorized: Only an Administrator, service_role, or SQL Editor can assign user roles.';
    END IF;
    v_actor_label := 'SQL Editor (' || v_caller_db_role || ')';
  END IF;

  SELECT * INTO v_old_profile
  FROM public.profiles
  WHERE lower(email) = lower(btrim(p_email))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile with email % not found. Register the user via Supabase Authentication first.', p_email;
  END IF;

  PERFORM set_config('agricycle.admin_role_assignment', 'true', true);

  UPDATE public.profiles
  SET role = p_role,
      organization_id = COALESCE(p_organization_id, organization_id),
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
    'UPDATE',
    'User',
    v_profile.id::text,
    jsonb_build_object('role', v_old_profile.role, 'organizationId', v_old_profile.organization_id),
    jsonb_build_object('role', v_profile.role, 'organizationId', v_profile.organization_id),
    'Assigned role ' || p_role::text || ' to ' || v_profile.email
  );

  RETURN v_profile;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_assign_user_role(TEXT, public.user_role, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_user_role(TEXT, public.user_role, TEXT) TO authenticated, service_role;
