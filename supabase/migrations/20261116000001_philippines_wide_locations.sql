-- ============================================================================
-- AgriCycle Migration: 20261116000001_philippines_wide_locations.sql
-- Community-Based Biomass Availability Information Management System (CB-BAIM)
-- ============================================================================
-- Purpose:
--   Generalize biomass source locations from Butuan City-only defaults to
--   Philippines-wide administrative hierarchies:
--     Region -> Province -> City/Municipality -> Barangay (+ Latitude/Longitude)
--
-- Safety & Compatibility:
--   - Preserves all existing location rows, IDs, foreign keys, biomass records,
--     and Coordinator-only write RLS policies from prior migrations.
--   - Preserves existing Butuan City / Agusan del Norte seed records and
--     backfills their administrative region to 'Caraga Region'.
--   - Removes hardcoded Butuan City / Agusan del Norte column defaults.
--   - Enforces hierarchy uniqueness across (region, province, city, barangay)
--     so identically named barangays in different cities/provinces are never merged.
-- ============================================================================

-- 1. Add Region and Optional Coordinate Precision Metadata Columns
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS region TEXT;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS coordinate_precision TEXT;

DO $$ BEGIN
  ALTER TABLE public.locations
    ADD CONSTRAINT chk_locations_coordinate_precision
    CHECK (coordinate_precision IS NULL OR coordinate_precision IN ('EXACT_SITE', 'BARANGAY_CENTROID'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Remove Hardcoded Butuan City / Agusan del Norte Column Defaults
ALTER TABLE public.locations
  ALTER COLUMN city DROP DEFAULT;

ALTER TABLE public.locations
  ALTER COLUMN province DROP DEFAULT;

-- 3. Backfill Region for Existing Seeded Caraga / Agusan del Norte Rows Only
UPDATE public.locations
SET region = 'Caraga Region',
    updated_at = now()
WHERE (region IS NULL OR btrim(region) = '')
  AND (
    lower(btrim(province)) IN ('agusan del norte', 'agusan del sur', 'surigao del norte', 'surigao del sur', 'dinagat islands')
    OR lower(btrim(city)) = 'butuan city'
  );

-- 4. Update Uniqueness Rules Across Full Administrative Hierarchy
-- Never treat barangay alone as globally unique. Preserve full hierarchy
-- (region, province, city, barangay) case-insensitively and whitespace-normalized.
ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS uq_locations_barangay_city_province;

DROP INDEX IF EXISTS public.uq_locations_hierarchy_ci;
CREATE UNIQUE INDEX uq_locations_hierarchy_ci
  ON public.locations (
    lower(btrim(COALESCE(region, ''))),
    lower(btrim(province)),
    lower(btrim(city)),
    lower(btrim(barangay))
  );

CREATE INDEX IF NOT EXISTS idx_locations_hierarchy_lookup
  ON public.locations (region, province, city, barangay);

-- 5. Coordinator-Only Find-or-Create Location RPC
-- Reuses existing matching location records across the full hierarchy without
-- risking duplicate creation or accidental cross-city barangay merging.
CREATE OR REPLACE FUNCTION public.find_or_create_location(
  p_region TEXT,
  p_province TEXT,
  p_city TEXT,
  p_barangay TEXT,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL,
  p_coordinate_precision TEXT DEFAULT NULL
)
RETURNS public.locations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_region TEXT := btrim(COALESCE(p_region, ''));
  v_province TEXT := btrim(COALESCE(p_province, ''));
  v_city TEXT := btrim(COALESCE(p_city, ''));
  v_barangay TEXT := btrim(COALESCE(p_barangay, ''));
  v_precision TEXT := NULLIF(btrim(COALESCE(p_coordinate_precision, '')), '');
  v_location public.locations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to register or update biomass locations.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'COORDINATOR' THEN
    RAISE EXCEPTION 'Unauthorized: Only LGU Biomass Information Coordinators may register or update biomass source locations.';
  END IF;

  IF v_region = '' OR v_province = '' OR v_city = '' OR v_barangay = '' THEN
    RAISE EXCEPTION 'Complete administrative hierarchy (Region, Province, City/Municipality, Barangay) is required.';
  END IF;

  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Both latitude and longitude must be provided together.';
  END IF;

  IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90) THEN
    RAISE EXCEPTION 'Latitude (%) is out of valid range [-90, 90].', p_latitude;
  END IF;

  IF p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180) THEN
    RAISE EXCEPTION 'Longitude (%) is out of valid range [-180, 180].', p_longitude;
  END IF;

  IF v_precision IS NOT NULL AND v_precision NOT IN ('EXACT_SITE', 'BARANGAY_CENTROID') THEN
    RAISE EXCEPTION 'Invalid coordinate_precision value: %.', v_precision;
  END IF;

  SELECT *
  INTO v_location
  FROM public.locations
  WHERE lower(btrim(COALESCE(region, ''))) = lower(v_region)
    AND lower(btrim(province)) = lower(v_province)
    AND lower(btrim(city)) = lower(v_city)
    AND lower(btrim(barangay)) = lower(v_barangay)
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL
       AND (v_location.latitude IS NULL OR v_location.longitude IS NULL) THEN
      UPDATE public.locations
      SET latitude = p_latitude,
          longitude = p_longitude,
          coordinate_precision = COALESCE(v_precision, v_location.coordinate_precision, 'EXACT_SITE'),
          updated_at = now()
      WHERE id = v_location.id
      RETURNING * INTO v_location;
    END IF;
    RETURN v_location;
  END IF;

  INSERT INTO public.locations (
    region,
    province,
    city,
    barangay,
    latitude,
    longitude,
    coordinate_precision
  )
  VALUES (
    v_region,
    v_province,
    v_city,
    v_barangay,
    p_latitude,
    p_longitude,
    CASE WHEN p_latitude IS NOT NULL THEN COALESCE(v_precision, 'EXACT_SITE') ELSE NULL END
  )
  RETURNING * INTO v_location;

  RETURN v_location;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_or_create_location(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_or_create_location(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;

-- ============================================================================
-- VERIFICATION QUERIES (Run manually in Supabase SQL Editor after migration)
-- ============================================================================
-- 1. Confirm schema columns and dropped Butuan defaults:
-- SELECT column_name, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'locations'
-- ORDER BY ordinal_position;
--
-- 2. Confirm existing Butuan locations preserved & backfilled with Caraga Region:
-- SELECT id, region, province, city, barangay, latitude, longitude, coordinate_precision
-- FROM public.locations
-- ORDER BY region, province, city, barangay;
--
-- 3. Confirm full-hierarchy unique index exists:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'locations';
