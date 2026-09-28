export enum Role {
  ADMINISTRATOR = 'ADMINISTRATOR',
  COORDINATOR = 'COORDINATOR', // Cooperative / Hub Coordinator
  LGU = 'LGU', // LGU / Institutional User
  BUYER = 'BUYER', // Buyer / Institutional Inquirer
}

export enum AggregationStatus {
  DRAFT = 'DRAFT',
  PROPOSED = 'PROPOSED',
  ACTIVE = 'ACTIVE',
  NEEDS_UPDATE = 'NEEDS_UPDATE',
  STALE = 'STALE',
  UNAVAILABLE = 'UNAVAILABLE',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
}

export enum InquiryStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESPONDED = 'RESPONDED',
  FOLLOW_UP = 'FOLLOW_UP',
  CLOSED = 'CLOSED',
  WITHDRAWN = 'WITHDRAWN',
  NO_LONGER_AVAILABLE = 'NO_LONGER_AVAILABLE',
  EXPIRED = 'EXPIRED',
}

export enum RecordStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  VALIDATED = 'VALIDATED',
  RETURNED = 'RETURNED',
  REJECTED = 'REJECTED',
  STALE = 'STALE',
  UNAVAILABLE = 'UNAVAILABLE',
  UNSUITABLE = 'UNSUITABLE',
  RESERVED = 'RESERVED',
  ALREADY_USED = 'ALREADY_USED',
  ARCHIVED = 'ARCHIVED',
}

export enum SystemAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  SUBMIT = 'SUBMIT',
  REVIEW = 'REVIEW',
  VALIDATE = 'VALIDATE',
  REJECT = 'REJECT',
  RETURN = 'RETURN',
  MARK_STALE = 'MARK_STALE',
  MARK_UNAVAILABLE = 'MARK_UNAVAILABLE',
  INQUIRE = 'INQUIRE',
  ARCHIVE = 'ARCHIVE',
  CREATE_GROUP = 'CREATE_GROUP',
  UPDATE_STATUS = 'UPDATE_STATUS',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId?: string;
}

export interface Location {
  id: string;
  barangay: string;
  city: string;
  province: string;
  coordinates?: { lat: number; lng: number };
}

export interface BiomassSource {
  id: string;
  name: string;
  type: string;
  locationId: string;
  contactPerson: string;
  cooperativeId?: string;
}

export interface Organization {
  id: string;
  name: string;
  type: 'COOPERATIVE' | 'HUB' | 'LGU' | 'BUYER' | 'ADMIN';
  locationId?: string;
}

export interface ReferenceData {
  id: string;
  category: 'BIOMASS_TYPE' | 'SOURCE_TYPE' | 'UNIT';
  code: string;
  label: string;
  description?: string;
  isActive: boolean;
}

export interface AggregationGroup {
  id: string;
  name: string;
  biomassTypeId: string;
  hubId: string;
  status: AggregationStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AggregationMember {
  id: string;
  groupId: string;
  biomassRecordId: string;
  addedBy: string;
  addedAt: string;
  isActive: boolean;
}

export interface InquiryHistory {
  id: string;
  inquiryId: string;
  previousStatus?: InquiryStatus;
  newStatus: InquiryStatus;
  changedBy: string;
  changedAt: string;
  notes?: string;
}

export interface Inquiry {
  id: string;
  buyerUserId: string;
  targetType: 'RECORD' | 'GROUP';
  targetId: string;
  biomassTypeId: string;
  requestedQuantity: number;
  requestedUnit: string;
  intendedUse?: string;
  preferredAvailabilityPeriod?: string;
  additionalRequirements?: string;
  status: InquiryStatus;
  submittedAt: string;
  updatedAt: string;
  closedAt?: string;
  history: InquiryHistory[];
}

export interface BiomassRecord {
  id: string;
  biomassTypeId: string;
  quantity: number;
  originalUnit: string;
  sourceId: string;
  locationId: string;
  
  // Status and tracing
  status: RecordStatus;
  isTheoreticalEstimate: boolean; // MUST distinguish theoretical vs reported practical availability
  
  // Practical details
  availabilityPeriodStart: string; // ISO date
  availabilityPeriodEnd: string; // ISO date
  currentUse: string;
  reservedQuantity?: number;
  remainingQuantity?: number;
  condition: string;
  conditionNote?: string;
  storage: string;
  accessLocationNotes: string;
  
  // Audit stamps
  submitterId: string;
  createdAt: string; // ISO date
  lastUpdatedDate: string; // ISO date
  validationDate?: string; // ISO date
}

export interface ValidationRecord {
  id: string;
  biomassRecordId: string;
  validatorId: string;
  decision: RecordStatus; // VALIDATED, RETURNED, REJECTED, UNAVAILABLE
  validationBasis: string;
  validationNotes: string;
  validationDate: string; // ISO date
}

export interface AuditLog {
  id: string;
  userId: string;
  action: SystemAction;
  entityType: 'BiomassRecord' | 'User' | 'Inquiry' | 'Listing' | 'AggregationGroup' | 'ValidationRecord';
  entityId: string;
  previousState?: any;
  newState?: any;
  notes?: string;
  details?: string;
  timestamp: string; // ISO date
}




