-- ============================================================================
-- AgriCycle Migration: 20261120000001_public_validated_dashboard_rpc.sql
-- Community-Based Biomass Availability Information Management System (CB-BAIM)
-- ============================================================================
-- Purpose:
--   Provide a strictly scoped, read-only public overview RPC for the redesigned
--   Public LGU / Institutional Planning Dashboard without weakening table RLS
--   policies or exposing private records, contact persons, validation notes,
--   inquiries, user profiles, or audit logs.
--
-- Security Guarantees:
--   - Returns ONLY biomass_records with status = 'VALIDATED'.
--   - Excludes submitter_id and submitter_label from biomass_records.
--   - Returns ONLY biomass_sources linked to those validated records, with
--     contact_person and created_by omitted/redacted.
--   - Returns ONLY locations linked to those validated records/sources.
--   - Returns ONLY ACTIVE aggregation_groups and active aggregation_members
--     pointing to VALIDATED records.
--   - Does NOT expose pending/submitted/under_review/returned/rejected/draft
--     records, validation_records, profiles, inquiries, or audit_logs.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_public_validated_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_records JSONB;
  v_sources JSONB;
  v_locations JSONB;
  v_reference_data JSONB;
  v_agg_groups JSONB;
  v_agg_members JSONB;
BEGIN
  -- 1. Strictly VALIDATED biomass records (public planning fields only)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'biomass_type_id', r.biomass_type_id,
        'quantity', r.quantity,
        'original_unit', r.original_unit,
        'source_id', r.source_id,
        'location_id', r.location_id,
        'status', r.status,
        'is_theoretical_estimate', r.is_theoretical_estimate,
        'availability_period_start', r.availability_period_start,
        'availability_period_end', r.availability_period_end,
        'current_use', r.current_use,
        'reserved_quantity', r.reserved_quantity,
        'remaining_quantity', r.remaining_quantity,
        'condition', r.condition,
        'condition_note', r.condition_note,
        'storage', r.storage,
        'access_location_notes', r.access_location_notes,
        'created_at', r.created_at,
        'last_updated_date', r.last_updated_date,
        'validation_date', r.validation_date
      )
      ORDER BY r.last_updated_date DESC
    ),
    '[]'::jsonb
  )
  INTO v_records
  FROM public.biomass_records r
  WHERE r.status = 'VALIDATED';

  -- 2. Sanitized biomass sources linked to validated records (contact_person redacted)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'type', s.type,
        'location_id', s.location_id,
        'cooperative_id', s.cooperative_id
      )
      ORDER BY s.name ASC
    ),
    '[]'::jsonb
  )
  INTO v_sources
  FROM public.biomass_sources s
  WHERE EXISTS (
    SELECT 1
    FROM public.biomass_records r
    WHERE r.source_id = s.id
      AND r.status = 'VALIDATED'
  );

  -- 3. Locations linked to validated records or their sources
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'region', l.region,
        'province', l.province,
        'city', l.city,
        'barangay', l.barangay,
        'latitude', l.latitude,
        'longitude', l.longitude,
        'coordinate_precision', l.coordinate_precision
      )
      ORDER BY l.region NULLS LAST, l.province, l.city, l.barangay
    ),
    '[]'::jsonb
  )
  INTO v_locations
  FROM public.locations l
  WHERE EXISTS (
    SELECT 1
    FROM public.biomass_records r
    LEFT JOIN public.biomass_sources s ON s.id = r.source_id
    WHERE r.status = 'VALIDATED'
      AND (r.location_id = l.id OR s.location_id = l.id)
  );

  -- 4. Reference data (controlled vocabulary for biomass types & units)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ref.id,
        'category', ref.category,
        'code', ref.code,
        'label', ref.label,
        'description', ref.description,
        'is_active', ref.is_active
      )
      ORDER BY ref.category, ref.label
    ),
    '[]'::jsonb
  )
  INTO v_reference_data
  FROM public.reference_data ref;

  -- 5. Active information-based aggregation groups
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'biomass_type_id', g.biomass_type_id,
        'hub_id', g.hub_id,
        'status', g.status,
        'notes', g.notes,
        'created_at', g.created_at,
        'updated_at', g.updated_at
      )
      ORDER BY g.updated_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_agg_groups
  FROM public.aggregation_groups g
  WHERE g.status = 'ACTIVE';

  -- 6. Active aggregation memberships pointing to VALIDATED records & ACTIVE groups
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'group_id', m.group_id,
        'biomass_record_id', m.biomass_record_id,
        'added_at', m.added_at,
        'is_active', m.is_active
      )
      ORDER BY m.added_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_agg_members
  FROM public.aggregation_members m
  INNER JOIN public.aggregation_groups g ON g.id = m.group_id
  INNER JOIN public.biomass_records r ON r.id = m.biomass_record_id
  WHERE m.is_active = true
    AND g.status = 'ACTIVE'
    AND r.status = 'VALIDATED';

  RETURN jsonb_build_object(
    'records', v_records,
    'sources', v_sources,
    'locations', v_locations,
    'referenceData', v_reference_data,
    'aggregationGroups', v_agg_groups,
    'aggregationMembers', v_agg_members
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_validated_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_validated_overview() TO anon, authenticated, service_role;
