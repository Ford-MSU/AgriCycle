import { BiomassRecord, RecordStatus, BiomassSource, Location, ReferenceData, AuditLog, SystemAction, ValidationRecord, Organization, AggregationGroup, AggregationMember, AggregationStatus, Inquiry, InquiryStatus } from '../types';

// Mock Organizations
export const MOCK_ORGANIZATIONS: Organization[] = [
  { id: 'org-1', name: 'Butuan Central Hub', type: 'HUB', locationId: 'loc-1' },
  { id: 'org-2', name: 'Agusan Farmers Cooperative', type: 'COOPERATIVE', locationId: 'loc-2' },
];

// Mock Locations
export const MOCK_LOCATIONS: Location[] = [
  { id: 'loc-1', barangay: 'Lumbocan', city: 'Butuan City', province: 'Agusan del Norte', coordinates: { lat: 8.9715, lng: 125.5097 } },
  { id: 'loc-2', barangay: 'Libertad', city: 'Butuan City', province: 'Agusan del Norte', coordinates: { lat: 8.9328, lng: 125.5342 } },
  { id: 'loc-3', barangay: 'Ampayon', city: 'Butuan City', province: 'Agusan del Norte', coordinates: { lat: 8.9564, lng: 125.5843 } },
  { id: 'loc-4', barangay: 'Bancasi', city: 'Butuan City', province: 'Agusan del Norte', coordinates: { lat: 8.9482, lng: 125.4746 } },
];

// Mock Sources
export const MOCK_SOURCES: BiomassSource[] = [
  { id: 'src-1', name: 'Lumbocan Lumber & Sawmill', type: 'Industrial', locationId: 'loc-1', contactPerson: 'Juan Dela Cruz', cooperativeId: 'org-1' },
  { id: 'src-2', name: 'Libertad Rice Farmers Coop', type: 'Agricultural Coop', locationId: 'loc-2', contactPerson: 'Maria Clara', cooperativeId: 'org-2' },
  { id: 'src-3', name: 'Ampayon Corn Growers', type: 'Agricultural Coop', locationId: 'loc-3', contactPerson: 'Pedro Penduko', cooperativeId: 'org-2' },
];

// Mock Reference Data
export const MOCK_REFERENCE_DATA: ReferenceData[] = [
  { id: 'ref-bio-1', category: 'BIOMASS_TYPE', code: 'RICE_HUSK', label: 'Rice Husk', isActive: true },
  { id: 'ref-bio-2', category: 'BIOMASS_TYPE', code: 'RICE_STRAW', label: 'Rice Straw', isActive: true },
  { id: 'ref-bio-3', category: 'BIOMASS_TYPE', code: 'CORN_COB', label: 'Corn Cob', isActive: true },
  { id: 'ref-bio-4', category: 'BIOMASS_TYPE', code: 'CORN_STALK', label: 'Corn Stalk/Residue', isActive: true },
  { id: 'ref-bio-5', category: 'BIOMASS_TYPE', code: 'COCONUT_SHELL', label: 'Coconut Shell', isActive: true },
  { id: 'ref-bio-6', category: 'BIOMASS_TYPE', code: 'COCONUT_HUSK', label: 'Coconut Husk', isActive: true },
  { id: 'ref-bio-7', category: 'BIOMASS_TYPE', code: 'WOOD_CHIPS', label: 'Wood Chips', isActive: true },
  
  { id: 'ref-unit-1', category: 'UNIT', code: 'KG', label: 'Kilograms (kg)', isActive: true },
  { id: 'ref-unit-2', category: 'UNIT', code: 'MT', label: 'Metric Tons (MT)', isActive: true },
  { id: 'ref-unit-3', category: 'UNIT', code: 'BAGS_50KG', label: 'Bags (50kg)', isActive: true },
  { id: 'ref-unit-4', category: 'UNIT', code: 'TRUCKLOADS', label: 'Truckloads', isActive: true },
];

// Generate dates safely
const today = new Date();
const daysAgo = (days: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString();
};
const daysFromNow = (days: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export const MOCK_RECORDS: BiomassRecord[] = [
  {
    id: 'REC-1001',
    biomassTypeId: 'ref-bio-1', // Rice Husk
    quantity: 500,
    originalUnit: 'ref-unit-3', // Bags
    sourceId: 'src-2', // Libertad
    locationId: 'loc-2',
    status: RecordStatus.VALIDATED,
    isTheoreticalEstimate: false,
    availabilityPeriodStart: daysAgo(5),
    availabilityPeriodEnd: daysFromNow(25),
    currentUse: 'Available / not currently used',
    reservedQuantity: 50,
    remainingQuantity: 450,
    condition: 'Dry',
    conditionNote: 'Stored in covered warehouse.',
    storage: 'Warehouse',
    accessLocationNotes: 'Accessible by 6-wheeler truck',
    submitterId: 'user-coord',
    createdAt: daysAgo(10),
    lastUpdatedDate: daysAgo(8),
    validationDate: daysAgo(8)
  },
  {
    id: 'REC-1002',
    biomassTypeId: 'ref-bio-7', // Wood Chips
    quantity: 8000,
    originalUnit: 'ref-unit-1', // KG
    sourceId: 'src-1', // Lumbocan
    locationId: 'loc-1',
    status: RecordStatus.STALE, // Example of stale record
    isTheoreticalEstimate: false,
    availabilityPeriodStart: daysAgo(60),
    availabilityPeriodEnd: daysAgo(10), // Expired
    currentUse: 'Used as fuel',
    condition: 'Mixed',
    storage: 'Open yard',
    accessLocationNotes: 'Accessible by 10-wheeler',
    submitterId: 'user-coord',
    createdAt: daysAgo(65),
    lastUpdatedDate: daysAgo(65),
    validationDate: daysAgo(62)
  },
  {
    id: 'REC-1003',
    biomassTypeId: 'ref-bio-4', // Corn Stalk
    quantity: 12,
    originalUnit: 'ref-unit-4', // Truckloads
    sourceId: 'src-3', // Ampayon
    locationId: 'loc-3',
    status: RecordStatus.SUBMITTED, // Needs validation
    isTheoreticalEstimate: false,
    availabilityPeriodStart: daysAgo(1),
    availabilityPeriodEnd: daysFromNow(14),
    currentUse: 'Left in field / Available',
    condition: 'Fresh/Wet',
    conditionNote: 'Needs harvesting assistance',
    storage: 'Field',
    accessLocationNotes: 'Muddy access, needs tractor',
    submitterId: 'user-coord-2',
    createdAt: daysAgo(2),
    lastUpdatedDate: daysAgo(1)
  },
  {
    id: 'REC-1004',
    biomassTypeId: 'ref-bio-6', // Coconut husk
    quantity: 2000,
    originalUnit: 'ref-unit-1', // KG
    sourceId: 'src-2', // Libertad
    locationId: 'loc-2',
    status: RecordStatus.UNDER_REVIEW, // Under review
    isTheoreticalEstimate: false,
    availabilityPeriodStart: daysAgo(0),
    availabilityPeriodEnd: daysFromNow(30),
    currentUse: 'Available',
    condition: 'Dry',
    storage: 'Covered Shed',
    accessLocationNotes: 'Easy access',
    submitterId: 'user-coord',
    createdAt: daysAgo(1),
    lastUpdatedDate: daysAgo(1)
  }
];

export const MOCK_VALIDATION_RECORDS: ValidationRecord[] = [
  {
    id: 'val-1',
    biomassRecordId: 'REC-1001',
    validatorId: 'user-lgu',
    decision: RecordStatus.VALIDATED,
    validationBasis: 'Field Inspection',
    validationNotes: 'Confirmed bags in warehouse match reported count.',
    validationDate: daysAgo(8)
  },
  {
    id: 'val-2',
    biomassRecordId: 'REC-1002',
    validatorId: 'user-lgu',
    decision: RecordStatus.VALIDATED,
    validationBasis: 'Phone Verification',
    validationNotes: 'Spoke with Juan Dela Cruz, confirmed availability.',
    validationDate: daysAgo(62)
  }
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    userId: 'user-coord',
    action: SystemAction.CREATE,
    entityType: 'BiomassRecord',
    entityId: 'REC-1001',
    timestamp: daysAgo(10)
  },
  {
    id: 'log-2',
    userId: 'user-coord',
    action: SystemAction.SUBMIT,
    entityType: 'BiomassRecord',
    entityId: 'REC-1001',
    timestamp: daysAgo(10)
  },
  {
    id: 'log-3',
    userId: 'user-lgu',
    action: SystemAction.VALIDATE,
    entityType: 'ValidationRecord',
    entityId: 'val-1',
    timestamp: daysAgo(8)
  }
];

export const MOCK_AGGREGATION_GROUPS: AggregationGroup[] = [
  {
    id: 'AG-001',
    name: 'Rice Husk - Batch 1 (Libertad)',
    biomassTypeId: 'ref-bio-1',
    hubId: 'org-2',
    status: AggregationStatus.ACTIVE,
    notes: 'Information-level grouping of available rice husk.',
    createdBy: 'user-coord',
    createdAt: daysAgo(5),
    updatedAt: daysAgo(2)
  }
];

export const MOCK_AGGREGATION_MEMBERS: AggregationMember[] = [
  {
    id: 'agm-1',
    groupId: 'AG-001',
    biomassRecordId: 'REC-1001',
    addedBy: 'user-coord',
    addedAt: daysAgo(5),
    isActive: true
  }
];

export const MOCK_INQUIRIES: Inquiry[] = [
  {
    id: 'INQ-1001',
    buyerUserId: 'user-buyer',
    targetType: 'RECORD',
    targetId: 'REC-1002', // A validated record
    biomassTypeId: 'ref-bio-2', // Rice Straw
    requestedQuantity: 200,
    requestedUnit: 'ref-unit-1', // kg
    intendedUse: 'Livestock Bedding',
    preferredAvailabilityPeriod: 'Mid-September',
    status: InquiryStatus.UNDER_REVIEW,
    submittedAt: daysAgo(2),
    updatedAt: daysAgo(1),
    history: [
      {
        id: 'inqh-1',
        inquiryId: 'INQ-1001',
        newStatus: InquiryStatus.SUBMITTED,
        changedBy: 'user-buyer',
        changedAt: daysAgo(2)
      },
      {
        id: 'inqh-2',
        inquiryId: 'INQ-1001',
        previousStatus: InquiryStatus.SUBMITTED,
        newStatus: InquiryStatus.UNDER_REVIEW,
        changedBy: 'user-coord',
        changedAt: daysAgo(1),
        notes: 'Checking exact availability with the source.'
      }
    ]
  }
];

// Simple in-memory "database" singleton for the prototype
class MockDatabase {
  records: BiomassRecord[] = [...MOCK_RECORDS];
  locations: Location[] = [...MOCK_LOCATIONS];
  sources: BiomassSource[] = [...MOCK_SOURCES];
  referenceData: ReferenceData[] = [...MOCK_REFERENCE_DATA];
  validationRecords: ValidationRecord[] = [...MOCK_VALIDATION_RECORDS];
  auditLogs: AuditLog[] = [...MOCK_AUDIT_LOGS];
  organizations: Organization[] = [...MOCK_ORGANIZATIONS];
  aggregationGroups: AggregationGroup[] = [...MOCK_AGGREGATION_GROUPS];
  aggregationMembers: AggregationMember[] = [...MOCK_AGGREGATION_MEMBERS];
  inquiries: Inquiry[] = [...MOCK_INQUIRIES];

  getBiomassTypes() {
    return this.referenceData.filter(r => r.category === 'BIOMASS_TYPE' && r.isActive);
  }

  getUnits() {
    return this.referenceData.filter(r => r.category === 'UNIT' && r.isActive);
  }

  getRecord(id: string) {
    return this.records.find(r => r.id === id);
  }
  
  getSource(id: string) {
    return this.sources.find(s => s.id === id);
  }

  getLocation(id: string) {
    return this.locations.find(l => l.id === id);
  }

  getOrganization(id: string) {
    return this.organizations.find(o => o.id === id);
  }

  getAggregationGroup(id: string) {
    return this.aggregationGroups.find(g => g.id === id);
  }

  getAggregationMembers(groupId: string) {
    return this.aggregationMembers.filter(m => m.groupId === groupId && m.isActive);
  }

  addAggregationGroup(group: AggregationGroup, memberRecordIds: string[], userId: string) {
    this.aggregationGroups.push(group);
    
    memberRecordIds.forEach(recordId => {
      this.aggregationMembers.push({
        id: `agm-${Date.now()}-${Math.random()}`,
        groupId: group.id,
        biomassRecordId: recordId,
        addedBy: userId,
        addedAt: new Date().toISOString(),
        isActive: true
      });
    });

    this.auditLogs.push({
      id: `log-${Date.now()}`,
      userId,
      action: SystemAction.CREATE_GROUP,
      entityType: 'AggregationGroup',
      entityId: group.id,
      timestamp: new Date().toISOString()
    });
  }

  // Inquiries
  addInquiry(inquiry: Inquiry, userId: string) {
    this.inquiries.push(inquiry);
    
    // Add to history already handled during creation, just log to audit
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      userId,
      action: SystemAction.UPDATE_STATUS, // Reuse or create a new action if needed
      entityType: 'Inquiry',
      entityId: inquiry.id,
      timestamp: new Date().toISOString(),
      details: 'Inquiry submitted'
    });
  }

  updateInquiryStatus(inquiryId: string, newStatus: InquiryStatus, userId: string, notes?: string) {
    const inquiry = this.inquiries.find(i => i.id === inquiryId);
    if (!inquiry) return;

    const previousStatus = inquiry.status;
    inquiry.status = newStatus;
    inquiry.updatedAt = new Date().toISOString();
    
    if (newStatus === InquiryStatus.CLOSED || newStatus === InquiryStatus.WITHDRAWN || newStatus === InquiryStatus.EXPIRED || newStatus === InquiryStatus.NO_LONGER_AVAILABLE) {
      inquiry.closedAt = new Date().toISOString();
    }

    inquiry.history.unshift({
      id: `inqh-${Date.now()}`,
      inquiryId,
      previousStatus,
      newStatus,
      changedBy: userId,
      changedAt: new Date().toISOString(),
      notes
    });

    this.auditLogs.push({
      id: `log-${Date.now()}`,
      userId,
      action: SystemAction.UPDATE_STATUS,
      entityType: 'Inquiry',
      entityId: inquiry.id,
      timestamp: new Date().toISOString(),
      details: `Status changed to ${newStatus}`
    });
  }

  addLocation(location: Location) {
    this.locations.push(location);
  }

  addSource(source: BiomassSource) {
    this.sources.push(source);
    // Since we don't have SystemAction.CREATE_SOURCE, we just do a generic log or skip if it's fine
    // Or we could add SystemAction.CREATE_SOURCE if types allow
  }

  // Adding a new record
  addRecord(record: BiomassRecord, userId: string) {
    this.records.push(record);
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      userId,
      action: SystemAction.CREATE,
      entityType: 'BiomassRecord',
      entityId: record.id,
      timestamp: new Date().toISOString()
    });
  }

  updateRecord(id: string, updates: Partial<BiomassRecord>, userId: string, action: SystemAction = SystemAction.UPDATE) {
    const idx = this.records.findIndex(r => r.id === id);
    if (idx !== -1) {
      const old = { ...this.records[idx] };
      this.records[idx] = { ...this.records[idx], ...updates, lastUpdatedDate: new Date().toISOString() };
      
      this.auditLogs.push({
        id: `log-${Date.now()}`,
        userId,
        action,
        entityType: 'BiomassRecord',
        entityId: id,
        previousState: { status: old.status },
        newState: { status: this.records[idx].status },
        timestamp: new Date().toISOString()
      });
    }
  }

  addValidation(validation: ValidationRecord, userId: string) {
    this.validationRecords.push(validation);
    this.updateRecord(validation.biomassRecordId, { 
      status: validation.decision, 
      validationDate: validation.validationDate 
    }, userId, SystemAction.VALIDATE);
    
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      userId,
      action: validation.decision === RecordStatus.VALIDATED ? SystemAction.VALIDATE : SystemAction.REJECT,
      entityType: 'ValidationRecord',
      entityId: validation.id,
      timestamp: validation.validationDate
    });
  }
}

export const db = new MockDatabase();
