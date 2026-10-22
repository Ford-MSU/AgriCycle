import { supabase, isSupabaseConfigured, getSupabaseClient } from '../lib/supabaseClient';
import {
  BiomassRecord,
  RecordStatus,
  BiomassSource,
  Location,
  ReferenceData,
  AuditLog,
  SystemAction,
  ValidationRecord,
  Organization,
  AggregationGroup,
  AggregationMember,
  AggregationStatus,
  Inquiry,
  InquiryHistory,
  InquiryStatus,
  User,
  Role,
} from '../types';

// ============================================================================
// Database Row Mappers (PostgreSQL snake_case -> TypeScript camelCase)
// ============================================================================

export function mapLocationRow(row: any): Location {
  return {
    id: row.id,
    barangay: row.barangay,
    city: row.city,
    province: row.province,
    coordinates:
      row.latitude !== null && row.latitude !== undefined && row.longitude !== null && row.longitude !== undefined
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : undefined,
  };
}

export function mapOrganizationRow(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    locationId: row.location_id || undefined,
  };
}

export function mapProfileRow(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    organizationId: row.organization_id || undefined,
  };
}

export function mapReferenceDataRow(row: any): ReferenceData {
  return {
    id: row.id,
    category: row.category,
    code: row.code,
    label: row.label,
    description: row.description || undefined,
    isActive: Boolean(row.is_active),
  };
}

export function mapBiomassSourceRow(row: any): BiomassSource {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    locationId: row.location_id,
    contactPerson: row.contact_person,
    cooperativeId: row.cooperative_id || undefined,
  };
}

export function mapBiomassRecordRow(row: any): BiomassRecord {
  const qty = Number(row.quantity);
  const reserved = row.reserved_quantity !== null && row.reserved_quantity !== undefined ? Number(row.reserved_quantity) : 0;
  const remaining =
    row.remaining_quantity !== null && row.remaining_quantity !== undefined
      ? Number(row.remaining_quantity)
      : Math.max(0, qty - reserved);

  return {
    id: row.id,
    biomassTypeId: row.biomass_type_id,
    quantity: qty,
    originalUnit: row.original_unit,
    sourceId: row.source_id,
    locationId: row.location_id,
    status: row.status as RecordStatus,
    isTheoreticalEstimate: Boolean(row.is_theoretical_estimate),
    availabilityPeriodStart: row.availability_period_start,
    availabilityPeriodEnd: row.availability_period_end,
    currentUse: row.current_use || 'Not specified',
    reservedQuantity: reserved,
    remainingQuantity: remaining,
    condition: row.condition || 'Not specified',
    conditionNote: row.condition_note || '',
    storage: row.storage || 'Not specified',
    accessLocationNotes: row.access_location_notes || 'Not specified',
    submitterId: row.submitter_id || row.submitter_label || 'System',
    createdAt: row.created_at,
    lastUpdatedDate: row.last_updated_date || row.created_at,
    validationDate: row.validation_date || undefined,
  };
}

export function mapValidationRecordRow(row: any): ValidationRecord {
  return {
    id: row.id,
    biomassRecordId: row.biomass_record_id,
    validatorId: row.validator_id || row.validator_label || 'LGU Validator',
    decision: row.decision as RecordStatus,
    validationBasis: row.validation_basis,
    validationNotes: row.validation_notes,
    validationDate: row.validation_date,
  };
}

export function mapAggregationGroupRow(row: any): AggregationGroup {
  return {
    id: row.id,
    name: row.name,
    biomassTypeId: row.biomass_type_id,
    hubId: row.hub_id,
    status: row.status as AggregationStatus,
    notes: row.notes || undefined,
    createdBy: row.created_by || row.created_by_label || 'Coordinator',
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

export function mapAggregationMemberRow(row: any): AggregationMember {
  return {
    id: row.id,
    groupId: row.group_id,
    biomassRecordId: row.biomass_record_id,
    addedBy: row.added_by || row.added_by_label || 'Coordinator',
    addedAt: row.added_at,
    isActive: Boolean(row.is_active),
  };
}

export function mapInquiryHistoryRow(row: any): InquiryHistory {
  return {
    id: row.id,
    inquiryId: row.inquiry_id,
    previousStatus: row.previous_status ? (row.previous_status as InquiryStatus) : undefined,
    newStatus: row.new_status as InquiryStatus,
    changedBy: row.changed_by || row.changed_by_label || 'User',
    changedAt: row.changed_at,
    notes: row.notes || undefined,
  };
}

export function mapInquiryRow(row: any, historyRows: InquiryHistory[] = []): Inquiry {
  const sortedHistory = [...historyRows].sort(
    (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
  );

  return {
    id: row.id,
    buyerUserId: row.buyer_user_id || row.buyer_user_label || 'Buyer',
    targetType: row.target_type as 'RECORD' | 'GROUP',
    targetId: row.target_id,
    biomassTypeId: row.biomass_type_id,
    requestedQuantity: Number(row.requested_quantity),
    requestedUnit: row.requested_unit,
    intendedUse: row.intended_use || undefined,
    preferredAvailabilityPeriod: row.preferred_availability_period || undefined,
    additionalRequirements: row.additional_requirements || undefined,
    status: row.status as InquiryStatus,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at || row.submitted_at,
    closedAt: row.closed_at || undefined,
    history: sortedHistory,
  };
}

export function mapAuditLogRow(row: any): AuditLog {
  return {
    id: row.id,
    userId: row.user_label || row.user_id || 'System',
    action: row.action as SystemAction,
    entityType: row.entity_type,
    entityId: row.entity_id,
    previousState: row.previous_state || undefined,
    newState: row.new_state || undefined,
    notes: row.notes || undefined,
    details: row.details || undefined,
    timestamp: row.timestamp,
  };
}

function isValidUuid(value?: string): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ============================================================================
// Data Access Layer Functions
// ============================================================================

export interface AgriCycleDataset {
  locations: Location[];
  organizations: Organization[];
  referenceData: ReferenceData[];
  sources: BiomassSource[];
  records: BiomassRecord[];
  validationRecords: ValidationRecord[];
  aggregationGroups: AggregationGroup[];
  aggregationMembers: AggregationMember[];
  inquiries: Inquiry[];
  auditLogs: AuditLog[];
  profiles: User[];
}

export async function fetchAllDataFromSupabase(): Promise<AgriCycleDataset> {
  const client = getSupabaseClient();

  const [
    locRes,
    orgRes,
    refRes,
    srcRes,
    recRes,
    valRes,
    grpRes,
    memRes,
    inqRes,
    histRes,
    logRes,
    profRes,
  ] = await Promise.all([
    client.from('locations').select('*').order('barangay', { ascending: true }),
    client.from('organizations').select('*').order('name', { ascending: true }),
    client.from('reference_data').select('*').order('category', { ascending: true }).order('label', { ascending: true }),
    client.from('biomass_sources').select('*').order('name', { ascending: true }),
    client.from('biomass_records').select('*').order('last_updated_date', { ascending: false }),
    client.from('validation_records').select('*').order('validation_date', { ascending: false }),
    client.from('aggregation_groups').select('*').order('updated_at', { ascending: false }),
    client.from('aggregation_members').select('*').order('added_at', { ascending: false }),
    client.from('inquiries').select('*').order('updated_at', { ascending: false }),
    client.from('inquiry_history').select('*').order('changed_at', { ascending: false }),
    client.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(200),
    client.from('profiles').select('*').order('created_at', { ascending: false }),
  ]);

  if (locRes.error) throw new Error(`Failed to load locations: ${locRes.error.message}`);
  if (orgRes.error) throw new Error(`Failed to load organizations: ${orgRes.error.message}`);
  if (refRes.error) throw new Error(`Failed to load reference data: ${refRes.error.message}`);
  if (srcRes.error) throw new Error(`Failed to load biomass sources: ${srcRes.error.message}`);
  if (recRes.error) throw new Error(`Failed to load biomass records: ${recRes.error.message}`);
  if (valRes.error) throw new Error(`Failed to load validation records: ${valRes.error.message}`);
  if (grpRes.error) throw new Error(`Failed to load aggregation groups: ${grpRes.error.message}`);
  if (memRes.error) throw new Error(`Failed to load aggregation members: ${memRes.error.message}`);
  if (inqRes.error) throw new Error(`Failed to load inquiries: ${inqRes.error.message}`);

  const historyByInquiry = new Map<string, InquiryHistory[]>();
  (histRes.data || []).forEach((row) => {
    const mapped = mapInquiryHistoryRow(row);
    const list = historyByInquiry.get(mapped.inquiryId) || [];
    list.push(mapped);
    historyByInquiry.set(mapped.inquiryId, list);
  });

  return {
    locations: (locRes.data || []).map(mapLocationRow),
    organizations: (orgRes.data || []).map(mapOrganizationRow),
    referenceData: (refRes.data || []).map(mapReferenceDataRow),
    sources: (srcRes.data || []).map(mapBiomassSourceRow),
    records: (recRes.data || []).map(mapBiomassRecordRow),
    validationRecords: (valRes.data || []).map(mapValidationRecordRow),
    aggregationGroups: (grpRes.data || []).map(mapAggregationGroupRow),
    aggregationMembers: (memRes.data || []).map(mapAggregationMemberRow),
    inquiries: (inqRes.data || []).map((row) => mapInquiryRow(row, historyByInquiry.get(row.id) || [])),
    auditLogs: (logRes.data || []).map(mapAuditLogRow),
    profiles: (profRes.data || []).map(mapProfileRow),
  };
}

export async function fetchUserProfileFromSupabase(
  userId: string,
  email?: string,
  fallbackRole: Role = Role.BUYER
): Promise<User | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile:', error.message);
    throw new Error(`Could not load user profile: ${error.message}`);
  }

  if (data) {
    return mapProfileRow(data);
  }

  // If profile trigger hasn't created the row yet, create initial profile
  if (email) {
    const defaultName = email.split('@')[0];
    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        name: defaultName,
        email,
        role: fallbackRole,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Error creating initial profile:', insertError.message);
      return null;
    }
    return mapProfileRow(inserted);
  }

  return null;
}

export async function createLocationInSupabase(
  location: Omit<Location, 'id'> & { id?: string }
): Promise<Location> {
  const client = getSupabaseClient();
  const payload: Record<string, any> = {
    barangay: location.barangay,
    city: location.city,
    province: location.province,
    latitude: location.coordinates?.lat ?? null,
    longitude: location.coordinates?.lng ?? null,
  };
  if (location.id) payload.id = location.id;

  const { data, error } = await client.from('locations').insert(payload).select('*').single();
  if (error) throw new Error(`Failed to create location: ${error.message}`);
  return mapLocationRow(data);
}

export async function createSourceInSupabase(
  source: Omit<BiomassSource, 'id'> & { id?: string },
  user: User
): Promise<BiomassSource> {
  const client = getSupabaseClient();
  const payload: Record<string, any> = {
    name: source.name,
    type: source.type,
    location_id: source.locationId,
    contact_person: source.contactPerson,
    cooperative_id: source.cooperativeId || user.organizationId || null,
    created_by: isValidUuid(user.id) ? user.id : null,
  };
  if (source.id) payload.id = source.id;

  const { data, error } = await client.from('biomass_sources').insert(payload).select('*').single();
  if (error) throw new Error(`Failed to register biomass source: ${error.message}`);
  return mapBiomassSourceRow(data);
}

export async function createBiomassRecordInSupabase(
  record: Omit<BiomassRecord, 'id' | 'createdAt' | 'lastUpdatedDate'> & { id?: string },
  user: User
): Promise<BiomassRecord> {
  const client = getSupabaseClient();
  const reserved = record.reservedQuantity ?? 0;
  const remaining =
    record.remainingQuantity !== undefined ? record.remainingQuantity : Math.max(0, record.quantity - reserved);

  const payload: Record<string, any> = {
    biomass_type_id: record.biomassTypeId,
    quantity: record.quantity,
    original_unit: record.originalUnit,
    source_id: record.sourceId,
    location_id: record.locationId,
    status: record.status,
    is_theoretical_estimate: record.isTheoreticalEstimate,
    availability_period_start: record.availabilityPeriodStart,
    availability_period_end: record.availabilityPeriodEnd,
    current_use: record.currentUse,
    reserved_quantity: reserved,
    remaining_quantity: remaining,
    condition: record.condition,
    condition_note: record.conditionNote || '',
    storage: record.storage,
    access_location_notes: record.accessLocationNotes,
    submitter_id: isValidUuid(user.id) ? user.id : null,
    submitter_label: user.name || user.email || user.id,
  };

  const { data, error } = await client.from('biomass_records').insert(payload).select('*').single();
  if (error) throw new Error(`Failed to create biomass record: ${error.message}`);

  const created = mapBiomassRecordRow(data);

  // Record audit log entry (gracefully handled if direct inserts are restricted to administrators)
  if (isValidUuid(user.id)) {
    try {
      await client.from('audit_logs').insert({
        user_id: user.id,
        user_label: user.name || user.email,
        action: SystemAction.CREATE,
        entity_type: 'BiomassRecord',
        entity_id: created.id,
        new_state: { status: created.status, quantity: created.quantity },
        details: `Created biomass record ${created.id}`,
      });
    } catch {
      // Direct audit logging restricted to admin/server RPCs; client continues gracefully
    }
  }

  return created;
}

export async function updateBiomassRecordInSupabase(
  id: string,
  updates: Partial<BiomassRecord>,
  user: User,
  action: SystemAction = SystemAction.UPDATE
): Promise<BiomassRecord> {
  const client = getSupabaseClient();

  const dbUpdates: Record<string, any> = {
    last_updated_date: new Date().toISOString(),
  };

  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;
  if (updates.reservedQuantity !== undefined) dbUpdates.reserved_quantity = updates.reservedQuantity;
  if (updates.remainingQuantity !== undefined) dbUpdates.remaining_quantity = updates.remainingQuantity;
  if (updates.condition !== undefined) dbUpdates.condition = updates.condition;
  if (updates.conditionNote !== undefined) dbUpdates.condition_note = updates.conditionNote;
  if (updates.storage !== undefined) dbUpdates.storage = updates.storage;
  if (updates.currentUse !== undefined) dbUpdates.current_use = updates.currentUse;
  if (updates.accessLocationNotes !== undefined) dbUpdates.access_location_notes = updates.accessLocationNotes;
  if (updates.validationDate !== undefined) dbUpdates.validation_date = updates.validationDate;
  if (updates.isTheoreticalEstimate !== undefined) dbUpdates.is_theoretical_estimate = updates.isTheoreticalEstimate;

  const { data, error } = await client
    .from('biomass_records')
    .update(dbUpdates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update biomass record: ${error.message}`);

  const updated = mapBiomassRecordRow(data);

  if (isValidUuid(user.id)) {
    try {
      await client.from('audit_logs').insert({
        user_id: user.id,
        user_label: user.name || user.email,
        action,
        entity_type: 'BiomassRecord',
        entity_id: id,
        new_state: { status: updated.status },
        details: `Updated record ${id} via ${action}`,
      });
    } catch {
      // Direct audit logging restricted to admin/server RPCs; client continues gracefully
    }
  }

  return updated;
}

export async function submitValidationInSupabase(
  recordId: string,
  decision: RecordStatus,
  validationBasis: string,
  validationNotes: string,
  user: User
): Promise<ValidationRecord> {
  const client = getSupabaseClient();

  // Prefer atomic PostgreSQL RPC function defined in migration 002
  const { data, error } = await client.rpc('submit_validation_decision', {
    p_record_id: recordId,
    p_decision: decision,
    p_basis: validationBasis,
    p_notes: validationNotes,
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit validation decision.');
  }

  return mapValidationRecordRow(data);
}

export async function createAggregationGroupInSupabase(
  name: string,
  biomassTypeId: string,
  hubId: string,
  memberRecordIds: string[],
  user: User,
  notes?: string
): Promise<AggregationGroup> {
  const client = getSupabaseClient();

  const { data, error } = await client.rpc('create_aggregation_group_with_members', {
    p_name: name,
    p_biomass_type_id: biomassTypeId,
    p_hub_id: hubId,
    p_member_record_ids: memberRecordIds,
    p_notes: notes || null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to create aggregation group.');
  }

  return mapAggregationGroupRow(data);
}

export async function submitInquiryInSupabase(
  input: {
    targetType: 'RECORD' | 'GROUP';
    targetId: string;
    biomassTypeId: string;
    requestedQuantity: number;
    requestedUnit: string;
    intendedUse?: string;
    preferredAvailabilityPeriod?: string;
    additionalRequirements?: string;
  },
  user: User
): Promise<Inquiry> {
  const client = getSupabaseClient();

  const { data, error } = await client.rpc('submit_buyer_inquiry', {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_biomass_type_id: input.biomassTypeId,
    p_requested_quantity: input.requestedQuantity,
    p_requested_unit: input.requestedUnit,
    p_intended_use: input.intendedUse || null,
    p_preferred_period: input.preferredAvailabilityPeriod || null,
    p_additional_requirements: input.additionalRequirements || null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit buyer inquiry.');
  }

  const initialHistory: InquiryHistory = {
    id: `inqh-${Date.now()}`,
    inquiryId: data.id,
    newStatus: InquiryStatus.SUBMITTED,
    changedBy: user.name || user.id,
    changedAt: data.submitted_at || new Date().toISOString(),
    notes: 'Initial inquiry submitted',
  };

  return mapInquiryRow(data, [initialHistory]);
}

export async function updateInquiryStatusInSupabase(
  inquiryId: string,
  newStatus: InquiryStatus,
  user: User,
  notes?: string
): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client.rpc('update_inquiry_status_tx', {
    p_inquiry_id: inquiryId,
    p_new_status: newStatus,
    p_notes: notes || null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to update inquiry status.');
  }
}

export async function updateUserRoleInSupabase(
  email: string,
  newRole: Role,
  organizationId?: string
): Promise<User> {
  const client = getSupabaseClient();

  const { data, error } = await client.rpc('admin_assign_user_role', {
    p_email: email,
    p_role: newRole,
    p_organization_id: organizationId || null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to update user role.');
  }

  return mapProfileRow(data);
}
