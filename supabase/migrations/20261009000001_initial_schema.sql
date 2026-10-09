-- ============================================================================
-- AgriCycle Migration 001: Normalized PostgreSQL Relational Schema
-- Community-Based Biomass Availability Information Management System (CB-BAIM)
-- ============================================================================

-- 1. Custom Enumerated Types
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('ADMINISTRATOR', 'COORDINATOR', 'LGU', 'BUYER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.organization_type AS ENUM ('COOPERATIVE', 'HUB', 'LGU', 'BUYER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reference_category AS ENUM ('BIOMASS_TYPE', 'SOURCE_TYPE', 'UNIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.record_status AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'VALIDATED',
    'RETURNED',
    'REJECTED',
    'STALE',
    'UNAVAILABLE',
    'UNSUITABLE',
    'RESERVED',
    'ALREADY_USED',
    'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.aggregation_status AS ENUM (
    'DRAFT',
    'PROPOSED',
    'ACTIVE',
    'NEEDS_UPDATE',
    'STALE',
    'UNAVAILABLE',
    'CLOSED',
    'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inquiry_status AS ENUM (
    'SUBMITTED',
    'UNDER_REVIEW',
    'RESPONDED',
    'FOLLOW_UP',
    'CLOSED',
    'WITHDRAWN',
    'NO_LONGER_AVAILABLE',
    'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inquiry_target_type AS ENUM ('RECORD', 'GROUP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.system_action AS ENUM (
    'CREATE',
    'UPDATE',
    'SUBMIT',
    'REVIEW',
    'VALIDATE',
    'REJECT',
    'RETURN',
    'MARK_STALE',
    'MARK_UNAVAILABLE',
    'INQUIRE',
    'ARCHIVE',
    'CREATE_GROUP',
    'UPDATE_STATUS'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Sequences for Human-Readable Domain Identifiers
CREATE SEQUENCE IF NOT EXISTS public.location_seq START 10;
CREATE SEQUENCE IF NOT EXISTS public.organization_seq START 10;
CREATE SEQUENCE IF NOT EXISTS public.reference_data_seq START 20;
CREATE SEQUENCE IF NOT EXISTS public.biomass_source_seq START 10;
CREATE SEQUENCE IF NOT EXISTS public.biomass_record_seq START 1005;
CREATE SEQUENCE IF NOT EXISTS public.validation_record_seq START 10;
CREATE SEQUENCE IF NOT EXISTS public.aggregation_group_seq START 2;
CREATE SEQUENCE IF NOT EXISTS public.aggregation_member_seq START 10;
CREATE SEQUENCE IF NOT EXISTS public.inquiry_seq START 1002;
CREATE SEQUENCE IF NOT EXISTS public.inquiry_history_seq START 10;
CREATE SEQUENCE IF NOT EXISTS public.audit_log_seq START 10;

-- 3. Locations Table
CREATE TABLE IF NOT EXISTS public.locations (
  id TEXT PRIMARY KEY DEFAULT ('loc-' || nextval('public.location_seq')::text),
  barangay TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Butuan City',
  province TEXT NOT NULL DEFAULT 'Agusan del Norte',
  latitude NUMERIC(9, 6) CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude NUMERIC(9, 6) CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_locations_barangay_city_province UNIQUE (barangay, city, province)
);

-- 4. Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
  id TEXT PRIMARY KEY DEFAULT ('org-' || nextval('public.organization_seq')::text),
  name TEXT NOT NULL UNIQUE,
  type public.organization_type NOT NULL,
  location_id TEXT REFERENCES public.locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Profiles Table (Linked 1:1 with Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role public.user_role NOT NULL DEFAULT 'BUYER',
  organization_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Reference Data Table (Controlled Vocabulary for Biomass Types, Units, Source Types)
CREATE TABLE IF NOT EXISTS public.reference_data (
  id TEXT PRIMARY KEY DEFAULT ('ref-' || nextval('public.reference_data_seq')::text),
  category public.reference_category NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_reference_category_code UNIQUE (category, code)
);

-- 7. Biomass Sources Table
CREATE TABLE IF NOT EXISTS public.biomass_sources (
  id TEXT PRIMARY KEY DEFAULT ('src-' || nextval('public.biomass_source_seq')::text),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  contact_person TEXT NOT NULL,
  cooperative_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Biomass Records Table
-- Preserves distinction between theoretical biomass potential (is_theoretical_estimate = true)
-- and practically available biomass (is_theoretical_estimate = false).
-- Note: submitter_id is a nullable UUID FK to public.profiles(id) so initial seed records
-- do not require fabricated auth.users rows; submitter_label stores the display label.
CREATE TABLE IF NOT EXISTS public.biomass_records (
  id TEXT PRIMARY KEY DEFAULT ('REC-' || nextval('public.biomass_record_seq')::text),
  biomass_type_id TEXT NOT NULL REFERENCES public.reference_data(id) ON DELETE RESTRICT,
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  original_unit TEXT NOT NULL REFERENCES public.reference_data(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES public.biomass_sources(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  status public.record_status NOT NULL DEFAULT 'SUBMITTED',
  is_theoretical_estimate BOOLEAN NOT NULL DEFAULT false,
  availability_period_start TIMESTAMPTZ NOT NULL,
  availability_period_end TIMESTAMPTZ NOT NULL,
  current_use TEXT NOT NULL DEFAULT 'Not specified',
  reserved_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  remaining_quantity NUMERIC(12, 2) NOT NULL CHECK (remaining_quantity >= 0),
  condition TEXT NOT NULL DEFAULT 'Not specified',
  condition_note TEXT NOT NULL DEFAULT '',
  storage TEXT NOT NULL DEFAULT 'Not specified',
  access_location_notes TEXT NOT NULL DEFAULT 'Not specified',
  submitter_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submitter_label TEXT NOT NULL DEFAULT 'System',
  validation_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_biomass_availability_dates CHECK (availability_period_end >= availability_period_start),
  CONSTRAINT chk_biomass_reserved_le_quantity CHECK (reserved_quantity <= quantity),
  CONSTRAINT chk_biomass_remaining_le_available CHECK (remaining_quantity <= (quantity - reserved_quantity))
);

-- 9. Validation Records Table (Immutable evaluation history per biomass record)
CREATE TABLE IF NOT EXISTS public.validation_records (
  id TEXT PRIMARY KEY DEFAULT ('VAL-' || nextval('public.validation_record_seq')::text),
  biomass_record_id TEXT NOT NULL REFERENCES public.biomass_records(id) ON DELETE RESTRICT,
  validator_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  validator_label TEXT NOT NULL DEFAULT 'LGU Validator',
  decision public.record_status NOT NULL CHECK (decision IN ('VALIDATED', 'RETURNED', 'REJECTED', 'UNAVAILABLE', 'STALE')),
  validation_basis TEXT NOT NULL,
  validation_notes TEXT NOT NULL,
  validation_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Aggregation Groups Table (Information-level virtual pooling at hubs/cooperatives)
CREATE TABLE IF NOT EXISTS public.aggregation_groups (
  id TEXT PRIMARY KEY DEFAULT ('AG-' || lpad(nextval('public.aggregation_group_seq')::text, 3, '0')),
  name TEXT NOT NULL,
  biomass_type_id TEXT NOT NULL REFERENCES public.reference_data(id) ON DELETE RESTRICT,
  hub_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  status public.aggregation_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_by_label TEXT NOT NULL DEFAULT 'Coordinator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Aggregation Members Table
CREATE TABLE IF NOT EXISTS public.aggregation_members (
  id TEXT PRIMARY KEY DEFAULT ('agm-' || nextval('public.aggregation_member_seq')::text),
  group_id TEXT NOT NULL REFERENCES public.aggregation_groups(id) ON DELETE RESTRICT,
  biomass_record_id TEXT NOT NULL REFERENCES public.biomass_records(id) ON DELETE RESTRICT,
  added_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  added_by_label TEXT NOT NULL DEFAULT 'Coordinator',
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_group_biomass_record UNIQUE (group_id, biomass_record_id)
);

-- Partial unique index: A biomass record can belong to at most ONE active aggregation group at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_record_membership
  ON public.aggregation_members (biomass_record_id)
  WHERE is_active = true;

-- 12. Inquiries Table (Non-binding buyer market linkage inquiries)
CREATE TABLE IF NOT EXISTS public.inquiries (
  id TEXT PRIMARY KEY DEFAULT ('INQ-' || nextval('public.inquiry_seq')::text),
  buyer_user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  buyer_user_label TEXT NOT NULL DEFAULT 'Buyer',
  target_type public.inquiry_target_type NOT NULL,
  target_id TEXT NOT NULL,
  biomass_type_id TEXT NOT NULL REFERENCES public.reference_data(id) ON DELETE RESTRICT,
  requested_quantity NUMERIC(12, 2) NOT NULL CHECK (requested_quantity > 0),
  requested_unit TEXT NOT NULL REFERENCES public.reference_data(id) ON DELETE RESTRICT,
  intended_use TEXT,
  preferred_availability_period TEXT,
  additional_requirements TEXT,
  status public.inquiry_status NOT NULL DEFAULT 'SUBMITTED',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- 13. Inquiry History Table (Chronological status changes and notes)
CREATE TABLE IF NOT EXISTS public.inquiry_history (
  id TEXT PRIMARY KEY DEFAULT ('inqh-' || nextval('public.inquiry_history_seq')::text),
  inquiry_id TEXT NOT NULL REFERENCES public.inquiries(id) ON DELETE RESTRICT,
  previous_status public.inquiry_status,
  new_status public.inquiry_status NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  changed_by_label TEXT NOT NULL DEFAULT 'User',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- 14. Audit Logs Table (Append-only system activity record)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT ('log-' || nextval('public.audit_log_seq')::text),
  user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  user_label TEXT NOT NULL DEFAULT 'System',
  action public.system_action NOT NULL,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN (
      'BiomassRecord',
      'User',
      'Inquiry',
      'Listing',
      'AggregationGroup',
      'ValidationRecord',
      'BiomassSource',
      'Location',
      'ReferenceData',
      'Organization'
    )
  ),
  entity_id TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  notes TEXT,
  details TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_biomass_records_status ON public.biomass_records(status);
CREATE INDEX IF NOT EXISTS idx_biomass_records_type ON public.biomass_records(biomass_type_id);
CREATE INDEX IF NOT EXISTS idx_biomass_records_source ON public.biomass_records(source_id);
CREATE INDEX IF NOT EXISTS idx_biomass_records_location ON public.biomass_records(location_id);
CREATE INDEX IF NOT EXISTS idx_biomass_records_submitter ON public.biomass_records(submitter_id);
CREATE INDEX IF NOT EXISTS idx_validation_records_biomass ON public.validation_records(biomass_record_id);
CREATE INDEX IF NOT EXISTS idx_aggregation_groups_status ON public.aggregation_groups(status);
CREATE INDEX IF NOT EXISTS idx_aggregation_groups_hub ON public.aggregation_groups(hub_id);
CREATE INDEX IF NOT EXISTS idx_aggregation_members_group ON public.aggregation_members(group_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_buyer ON public.inquiries(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_target ON public.inquiries(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiry_history_inquiry ON public.inquiry_history(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- 16. Automatic Timestamp & Quantity Consistency Triggers (Hardened search_path)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_biomass_record_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.reserved_quantity IS NULL THEN
    NEW.reserved_quantity := 0;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.last_updated_date := COALESCE(NEW.last_updated_date, now());
    IF NEW.remaining_quantity IS NULL THEN
      NEW.remaining_quantity := NEW.quantity - NEW.reserved_quantity;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.last_updated_date := now();
    IF NEW.quantity <> OLD.quantity OR NEW.reserved_quantity <> OLD.reserved_quantity THEN
      IF NEW.remaining_quantity IS NULL OR NEW.remaining_quantity = OLD.remaining_quantity THEN
        NEW.remaining_quantity := NEW.quantity - NEW.reserved_quantity;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locations_updated_at ON public.locations;
CREATE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_reference_data_updated_at ON public.reference_data;
CREATE TRIGGER trg_reference_data_updated_at
  BEFORE UPDATE ON public.reference_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_biomass_sources_updated_at ON public.biomass_sources;
CREATE TRIGGER trg_biomass_sources_updated_at
  BEFORE UPDATE ON public.biomass_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_biomass_records_consistency ON public.biomass_records;
CREATE TRIGGER trg_biomass_records_consistency
  BEFORE INSERT OR UPDATE ON public.biomass_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_biomass_record_consistency();

DROP TRIGGER IF EXISTS trg_aggregation_groups_updated_at ON public.aggregation_groups;
CREATE TRIGGER trg_aggregation_groups_updated_at
  BEFORE UPDATE ON public.aggregation_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_inquiries_updated_at ON public.inquiries;
CREATE TRIGGER trg_inquiries_updated_at
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Prevent modification or deletion of audit logs, validation records, and inquiry history
CREATE OR REPLACE FUNCTION public.prevent_immutable_record_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only and rows cannot be modified or deleted.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_record_modification();

DROP TRIGGER IF EXISTS trg_validation_records_immutable ON public.validation_records;
CREATE TRIGGER trg_validation_records_immutable
  BEFORE UPDATE OR DELETE ON public.validation_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_record_modification();

DROP TRIGGER IF EXISTS trg_inquiry_history_immutable ON public.inquiry_history;
CREATE TRIGGER trg_inquiry_history_immutable
  BEFORE UPDATE OR DELETE ON public.inquiry_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_record_modification();

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_biomass_record_consistency() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_immutable_record_modification() FROM PUBLIC;

