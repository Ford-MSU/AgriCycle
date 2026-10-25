-- ============================================================================
-- AgriCycle Migration: 20261025000001_fix_registration_roles_and_profile_triggers.sql
-- Community-Based Biomass Availability Information Management System (CB-BAIM)
-- ============================================================================
-- Purpose:
-- 1. Preserve Selected Registration Roles (including Administrator):
--    - When a user registers as Administrator, Coordinator, LGU, or Buyer,
--      record their selected role directly into public.profiles.
--    - Replaces previous hardcoded 'BUYER' assignment in handle_new_auth_user().
-- 2. Profile Security & Integrity:
--    - Users can create their own profile matching auth.uid() with their selected role.
--    - Non-administrators cannot modify profiles belonging to other users or change
--      existing roles, organization assignments, or active status on update.
--    - Existing Administrators can provision or reassign user roles via admin_assign_user_role().
-- 3. Maintain Role Consistency on Confirmation, Login, and Session Restoration:
--    - Email confirmation does not touch or overwrite existing user roles.
--    - On conflict in handle_new_auth_user(), preserve existing profiles.role.
-- ============================================================================

-- 1. Replace enforce_profile_role_security() with role-preserving security checks
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
  -- A. Authenticated API caller (PostgREST user JWT present):
  IF v_caller_uid IS NOT NULL THEN
    -- Allow trusted update from admin_assign_user_role()
    IF current_setting('agricycle.admin_role_assignment', true) = 'true'
       AND current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
      RETURN NEW;
    END IF;

    v_caller_role := public.current_user_role();

    IF TG_OP = 'INSERT' THEN
      -- Self-registered users can only create a profile matching their own auth.uid()
      IF NEW.id IS DISTINCT FROM v_caller_uid THEN
        RAISE EXCEPTION 'Unauthorized: Cannot create a profile for another user.';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      -- Non-administrators cannot change role, id, organization_id, or is_active
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

  -- B. No authenticated user JWT (auth.uid() IS NULL):
  -- Reject anonymous PostgREST callers attempting direct profile modifications
  IF v_jwt_role = 'anon' OR current_user IN ('anon', 'authenticated') OR session_user = 'anon' THEN
    RAISE EXCEPTION 'Unauthorized: Anonymous API callers cannot modify user profiles or roles.';
  END IF;

  -- C. Supabase GoTrue Auth Trigger context (on_auth_user_created -> handle_new_auth_user):
  IF (session_user = 'supabase_auth_admin' OR current_user = 'supabase_auth_admin') AND v_jwt_role = '' THEN
    IF TG_OP = 'INSERT' THEN
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

  -- D. Privileged callers: service_role or database superuser (SQL Editor)
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

-- 2. Replace handle_new_auth_user() to preserve user-selected registration role
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw_role TEXT;
  v_assigned_role public.user_role;
  v_name TEXT;
  v_org_id TEXT;
BEGIN
  -- Extract requested role from raw_user_meta_data
  v_raw_role := upper(btrim(COALESCE(
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'requested_role',
    'BUYER'
  )));

  -- Validate and assign role:
  -- Allowed self-registration roles: ADMINISTRATOR, COORDINATOR, LGU, BUYER
  IF v_raw_role = 'ADMINISTRATOR' THEN
    v_assigned_role := 'ADMINISTRATOR'::public.user_role;
  ELSIF v_raw_role = 'COORDINATOR' THEN
    v_assigned_role := 'COORDINATOR'::public.user_role;
  ELSIF v_raw_role = 'LGU' THEN
    v_assigned_role := 'LGU'::public.user_role;
  ELSE
    v_assigned_role := 'BUYER'::public.user_role;
  END IF;

  -- Extract user display name
  v_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- Extract optional organization association if valid
  v_org_id := NULLIF(btrim(NEW.raw_user_meta_data->>'organization_id'), '');
  IF v_org_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org_id) THEN
      v_org_id := NULL;
    END IF;
  END IF;

  -- Insert profile with the validated registration role
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
    v_assigned_role,
    v_org_id,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      name = CASE
        WHEN public.profiles.name = split_part(public.profiles.email, '@', 1) AND EXCLUDED.name IS NOT NULL
        THEN EXCLUDED.name
        ELSE public.profiles.name
      END,
      updated_at = now();
      -- Note: profiles.role is NOT overwritten on conflict to preserve approved roles.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 3. Restrict execute permissions
REVOKE EXECUTE ON FUNCTION public.enforce_profile_role_security() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
