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
  InquiryStatus,
  InquiryMessage,
  Role,
} from '../types';

// Legacy Organization records preserved for historical reference compatibility
export const MOCK_ORGANIZATIONS: Organization[] = [
  {
    id: 'org-1',
    name: 'Butuan City LGU Biomass Office',
    type: 'LGU',
    locationId: 'loc-1',
    officeAddress: 'City Hall Complex, Doongan, Butuan City',
    contactPhone: '+63 (085) 341-2890',
    contactEmail: 'biomass@butuan.gov.ph',
  },
  {
    id: 'org-2',
    name: 'Agusan Biomass Producer Association',
    type: 'COOPERATIVE',
    locationId: 'loc-2',
    officeAddress: 'Km. 3 Baan, Butuan City',
    contactPhone: '+63 (085) 815-4421',
    contactEmail: 'info@agusanbiomass.ph',
  },
];

// Mock Locations
export const MOCK_LOCATIONS: Location[] = [
  { id: 'loc-1', barangay: 'Lumbocan', city: 'Butuan City', province: 'Agusan del Norte', coordinates: { lat: 8.9715, lng: 125.5097 } },
  { id: 'loc-2', barangay: 'Libertad', city: 'Butuan City', province: 'Agusan del Norte', coordinates: { lat: 8.9328, lng: 125.5342 } },
  { id: 'loc-3', barangay: 'Ampayon', city: 'Butuan City', province: 'Agusan del Norte', coordinates: { lat: 8.9564, lng: 125.5843 } },
  { id: 'loc-4', barangay: 'Bancasi', city: 'Butuan City', province: 'Agusan del Norte' },
];

// Mock Sources (Aligned to approved non-cooperative source types)
export const MOCK_SOURCES: BiomassSource[] = [
  { id: 'src-1', name: 'Lumbocan Wood Processing Mill', type: 'Wood-based Establishment', locationId: 'loc-1', contactPerson: 'Juan Dela Cruz' },
  { id: 'src-2', name: 'Libertad Community Rice Mill', type: 'Rice Mill', locationId: 'loc-2', contactPerson: 'Maria Clara' },
  { id: 'src-3', name: 'Ampayon Corn & Copra Farm', type: 'Farm', locationId: 'loc-3', contactPerson: 'Pedro Penduko' },
  { id: 'src-4', name: 'Bancasi Coconut Husk Processor', type: 'Coconut Processor', locationId: 'loc-4', contactPerson: 'Elena Reyes' },
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
  { id: 'ref-unit-2', category: 'UNIT', code: 'MT', label: 'Metric tonnes (t)', isActive: true },
  { id: 'ref-unit-3', category: 'UNIT', code: 'BAGS_50KG', label: 'Bags (50kg) [Legacy]', isActive: false },
  { id: 'ref-unit-4', category: 'UNIT', code: 'TRUCKLOADS', label: 'Truckloads [Legacy Transport]', isActive: false },
];

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
    originalUnit: 'ref-unit-3',
    sourceId: 'src-2', // Libertad Community Rice Mill
    locationId: 'loc-2',
    status: RecordStatus.VALIDATED,
    isTheoreticalEstimate: false,
    availabilityPeriodStart: daysAgo(5),
    availabilityPeriodEnd: daysFromNow(25),
    currentUse: 'Available / not currently used',
    reservedQuantity: 50,
    remainingQuantity: 450,
    externalAvailability: 'AVAILABLE_TO_OTHERS',
    condition: 'Dry',
    conditionNote: 'Stored in covered on-site shed at rice mill.',
    storage: 'Covered Shed (Source Site)',
    accessLocationNotes: 'Accessible by 6-wheeler truck along Libertad feeder road',
    submitterId: 'user-coord',
    createdAt: daysAgo(10),
    lastUpdatedDate: daysAgo(8),
    validationDate: daysAgo(8),
  },
  {
    id: 'REC-1002',
    biomassTypeId: 'ref-bio-7', // Wood Chips
    quantity: 8000,
    originalUnit: 'ref-unit-1',
    sourceId: 'src-1', // Lumbocan Wood Processing Mill
    locationId: 'loc-1',
    status: RecordStatus.VALIDATED,
    isTheoreticalEstimate: false,
    availabilityPeriodStart: daysAgo(5),
    availabilityPeriodEnd: daysFromNow(20),
    currentUse: 'Used as fuel for boiler & drying',
    currentUseQuantity: 4500,
    reservedQuantity: 500,
    remainingQuantity: 3000,
    externalAvailability: 'AVAILABLE_TO_OTHERS',
    condition: 'Mixed',
    storage: 'Covered shed',
    accessLocationNotes: 'Accessible by 10-wheeler',
    submitterId: 'user-coord',
    createdAt: daysAgo(15),
    lastUpdatedDate: daysAgo(2),
    validationDate: daysAgo(10),
  },
  {
    id: 'REC-1003',
    biomassTypeId: 'ref-bio-4', // Corn Stalk
    quantity: 12,
    originalUnit: 'ref-unit-4',
    sourceId: 'src-3', // Ampayon
    locationId: 'loc-3',
    status: RecordStatus.SUBMITTED,
    isTheoreticalEstimate: false,
    availabilityPeriodStart: daysAgo(1),
    availabilityPeriodEnd: daysFromNow(14),
    currentUse: 'Left in field / Available',
    currentUseQuantity: 0,
    reservedQuantity: 0,
    remainingQuantity: 12,
    externalAvailability: 'AVAILABLE_TO_OTHERS',
    condition: 'Fresh/Wet',
    conditionNote: 'Awaiting Coordinator validation check',
    storage: 'Open Field Pile',
    accessLocationNotes: 'Unpaved farm road, dry weather access recommended',
    submitterId: 'user-coord-2',
    createdAt: daysAgo(2),
    lastUpdatedDate: daysAgo(1),
  },
  {
    id: 'REC-1004',
    biomassTypeId: 'ref-bio-6', // Coconut husk
    quantity: 2000,
    originalUnit: 'ref-unit-1',
    sourceId: 'src-4', // Bancasi Coconut Husk Processor (missing coords example)
    locationId: 'loc-4',
    status: RecordStatus.UNDER_REVIEW,
    isTheoreticalEstimate: false,
    availabilityPeriodStart: daysAgo(0),
    availabilityPeriodEnd: daysFromNow(30),
    currentUse: 'Retained for copra drying fuel & mulch',
    currentUseQuantity: 600,
    reservedQuantity: 0,
    remainingQuantity: 1400,
    externalAvailability: 'AVAILABLE_TO_OTHERS',
    condition: 'Dry',
    storage: 'Covered Shed (Source Site)',
    accessLocationNotes: 'Located near Bancasi highway junction',
    submitterId: 'user-coord',
    createdAt: daysAgo(1),
    lastUpdatedDate: daysAgo(1),
  },
];

// Coordinator (user-coord-2) performed validation on records submitted by user-coord (preserving self-validation guard)
export const MOCK_VALIDATION_RECORDS: ValidationRecord[] = [
  {
    id: 'val-1',
    biomassRecordId: 'REC-1001',
    validatorId: 'user-coord-2',
    decision: RecordStatus.VALIDATED,
    validationBasis: 'Field Inspection',
    validationNotes: 'Confirmed reported quantity and dry condition at Libertad Community Rice Mill.',
    validationDate: daysAgo(8),
  },
  {
    id: 'val-2',
    biomassRecordId: 'REC-1002',
    validatorId: 'user-coord-2',
    decision: RecordStatus.VALIDATED,
    validationBasis: 'Phone Verification',
    validationNotes: 'Verified surplus wood chips availability with Juan Dela Cruz at Lumbocan Mill.',
    validationDate: daysAgo(10),
  },
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-coord-1',
    userId: 'user-coord',
    action: SystemAction.CREATE_GROUP,
    entityType: 'AggregationGroup',
    entityId: 'AG-001',
    details: 'Created information-based aggregation group "Rice Husk - Libertad Information Group"',
    timestamp: daysAgo(3),
  },
  {
    id: 'log-coord-2',
    userId: 'user-coord',
    action: SystemAction.SUBMIT,
    entityType: 'BiomassRecord',
    entityId: 'REC-1001',
    details: 'Submitted biomass record REC-1001 (Rice Husk) for Coordinator validation',
    timestamp: daysAgo(9),
  },
  {
    id: 'log-coord-3',
    userId: 'user-coord',
    action: SystemAction.CREATE,
    entityType: 'BiomassRecord',
    entityId: 'REC-1002',
    details: 'Created biomass record REC-1002 (Wood Chips, 8,000 kg)',
    timestamp: daysAgo(15),
  },
  {
    id: 'log-coord-4',
    userId: 'user-coord-2',
    action: SystemAction.VALIDATE,
    entityType: 'ValidationRecord',
    entityId: 'REC-1001',
    details: 'Validated biomass record REC-1001 via Field Inspection',
    timestamp: daysAgo(8),
  },
  {
    id: 'log-coord-5',
    userId: 'user-coord-2',
    action: SystemAction.VALIDATE,
    entityType: 'ValidationRecord',
    entityId: 'REC-1002',
    details: 'Validated biomass record REC-1002 via Phone Verification',
    timestamp: daysAgo(10),
  },
  {
    id: 'log-buyer-1',
    userId: 'user-buyer',
    action: SystemAction.INQUIRE,
    entityType: 'Inquiry',
    entityId: 'INQ-1001',
    details: 'Submitted non-binding market inquiry INQ-1001 for 100 Bags Rice Husk',
    timestamp: daysAgo(2),
  },
  {
    id: 'log-admin-1',
    userId: 'user-admin',
    action: SystemAction.UPDATE,
    entityType: 'User',
    entityId: 'user-lgu',
    details: 'Assigned LGU/Institutional Planning User read-only access to Engr. Arvin Jimenez',
    timestamp: daysAgo(1),
  },
  {
    id: 'log-admin-2',
    userId: 'user-admin',
    action: SystemAction.UPDATE,
    entityType: 'User',
    entityId: 'user-coord',
    details: 'Assigned LGU Biomass Information Coordinator role to Nitronford Beatingo',
    timestamp: daysAgo(4),
  },
];

export const MOCK_AGGREGATION_GROUPS: AggregationGroup[] = [
  {
    id: 'AG-001',
    name: 'Rice Husk - Libertad Information Group',
    biomassTypeId: 'ref-bio-1',
    status: AggregationStatus.ACTIVE,
    notes: 'Information-level grouping of validated rice husk records in Libertad.',
    createdBy: 'user-coord',
    createdAt: daysAgo(5),
    updatedAt: daysAgo(2),
  },
];

export const MOCK_AGGREGATION_MEMBERS: AggregationMember[] = [
  {
    id: 'agm-1',
    groupId: 'AG-001',
    biomassRecordId: 'REC-1001',
    addedBy: 'user-coord',
    addedAt: daysAgo(5),
    isActive: true,
  },
];

export const MOCK_INQUIRIES: Inquiry[] = [
  {
    id: 'INQ-1001',
    buyerUserId: 'user-buyer',
    targetType: 'RECORD',
    targetId: 'REC-1001',
    biomassTypeId: 'ref-bio-1',
    requestedQuantity: 100,
    requestedUnit: 'ref-unit-3',
    intendedUse: 'Mushroom Cultivation & Soil Conditioner',
    preferredAvailabilityPeriod: 'Q4 2026 availability window',
    status: InquiryStatus.SUBMITTED,
    submittedAt: daysAgo(2),
    updatedAt: daysAgo(2),
    history: [
      {
        id: 'inqh-1',
        inquiryId: 'INQ-1001',
        newStatus: InquiryStatus.SUBMITTED,
        changedBy: 'user-buyer',
        changedAt: daysAgo(2),
        notes: 'Initial non-binding inquiry submitted for Rice Husk availability',
      },
    ],
  },
];

export const MOCK_INQUIRY_MESSAGES: InquiryMessage[] = [
  {
    id: 'msg-1',
    inquiryId: 'INQ-1001',
    senderId: 'user-buyer',
    senderName: 'Carlos Santos (BioEnergy Solutions)',
    senderRole: Role.BUYER,
    message: 'Hello, we are interested in the availability of 100 bags of rice husk in Libertad for substrate use. Can you confirm road access notes?',
    createdAt: daysAgo(2),
  },
  {
    id: 'msg-2',
    inquiryId: 'INQ-1001',
    senderId: 'user-coord',
    senderName: 'Nitronford Beatingo (LGU Biomass Information Coordinator)',
    senderRole: Role.COORDINATOR,
    message: 'Noted. The source site in Libertad has paved road access suitable for 6-wheeler vehicles. Please await formal acceptance status update.',
    createdAt: daysAgo(1),
  },
];

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
  inquiryMessages: InquiryMessage[] = [...MOCK_INQUIRY_MESSAGES];

  syncFromDataset(dataset: {
    records: BiomassRecord[];
    locations: Location[];
    sources: BiomassSource[];
    referenceData: ReferenceData[];
    validationRecords: ValidationRecord[];
    auditLogs: AuditLog[];
    organizations: Organization[];
    aggregationGroups: AggregationGroup[];
    aggregationMembers: AggregationMember[];
    inquiries: Inquiry[];
  }) {
    this.records = dataset.records;
    this.locations = dataset.locations;
    this.sources = dataset.sources;
    this.referenceData = dataset.referenceData;
    this.validationRecords = dataset.validationRecords;
    this.auditLogs = dataset.auditLogs;
    this.organizations = dataset.organizations;
    this.aggregationGroups = dataset.aggregationGroups;
    this.aggregationMembers = dataset.aggregationMembers;
    this.inquiries = dataset.inquiries;
  }

  getBiomassTypes() {
    return this.referenceData.filter((r) => r.category === 'BIOMASS_TYPE' && r.isActive);
  }

  getUnits() {
    return this.referenceData.filter((r) => r.category === 'UNIT' && r.isActive);
  }

  getRecord(id: string) {
    return this.records.find((r) => r.id === id);
  }

  getSource(id: string) {
    return this.sources.find((s) => s.id === id);
  }

  getLocation(id: string) {
    return this.locations.find((l) => l.id === id);
  }

  getOrganization(id: string) {
    return this.organizations.find((o) => o.id === id);
  }

  getAggregationGroup(id: string) {
    return this.aggregationGroups.find((g) => g.id === id);
  }

  getAggregationMembers(groupId: string) {
    return this.aggregationMembers.filter((m) => m.groupId === groupId && m.isActive);
  }

  addAggregationGroup(group: AggregationGroup, memberRecordIds: string[], userId: string) {
    const activeMemberIds = new Set(
      this.aggregationMembers.filter((m) => m.isActive).map((m) => m.biomassRecordId)
    );
    for (const recordId of memberRecordIds) {
      if (activeMemberIds.has(recordId)) {
        throw new Error(`Biomass record ${recordId} is already assigned to an active aggregation group.`);
      }
    }

    this.aggregationGroups.push(group);

    memberRecordIds.forEach((recordId) => {
      this.aggregationMembers.push({
        id: `agm-${Date.now()}-${Math.random()}`,
        groupId: group.id,
        biomassRecordId: recordId,
        addedBy: userId,
        addedAt: new Date().toISOString(),
        isActive: true,
      });
    });

    this.auditLogs.push({
      id: `log-${Date.now()}`,
      userId,
      action: SystemAction.CREATE_GROUP,
      entityType: 'AggregationGroup',
      entityId: group.id,
      timestamp: new Date().toISOString(),
    });
  }

  addInquiry(inquiry: Inquiry, userId: string) {
    if (inquiry.targetType === 'RECORD') {
      const activeMember = this.aggregationMembers.find(
        (m) => m.biomassRecordId === inquiry.targetId && m.isActive
      );
      if (activeMember) {
        throw new Error(
          `Biomass record ${inquiry.targetId} is consolidated into an aggregation group and cannot receive independent buyer inquiries.`
        );
      }
    }

    this.inquiries.push(inquiry);

    this.auditLogs.push({
      id: `log-${Date.now()}`,
      userId,
      action: SystemAction.INQUIRE,
      entityType: 'Inquiry',
      entityId: inquiry.id,
      timestamp: new Date().toISOString(),
      details: 'Non-binding buyer inquiry submitted',
    });
  }

  updateInquiryStatus(inquiryId: string, newStatus: InquiryStatus, userId: string, notes?: string) {
    const inquiry = this.inquiries.find((i) => i.id === inquiryId);
    if (!inquiry) return;

    const previousStatus = inquiry.status;
    inquiry.status = newStatus;
    inquiry.updatedAt = new Date().toISOString();

    if (
      newStatus === InquiryStatus.DECLINED ||
      newStatus === InquiryStatus.CLOSED ||
      newStatus === InquiryStatus.WITHDRAWN ||
      newStatus === InquiryStatus.EXPIRED ||
      newStatus === InquiryStatus.NO_LONGER_AVAILABLE
    ) {
      inquiry.closedAt = new Date().toISOString();
    }

    inquiry.history.unshift({
      id: `inqh-${Date.now()}`,
      inquiryId,
      previousStatus,
      newStatus,
      changedBy: userId,
      changedAt: new Date().toISOString(),
      notes,
    });

    this.auditLogs.push({
      id: `log-${Date.now()}`,
      userId,
      action: SystemAction.UPDATE_STATUS,
      entityType: 'Inquiry',
      entityId: inquiry.id,
      timestamp: new Date().toISOString(),
      details: `Inquiry status changed to ${newStatus}`,
    });
  }

  getInquiryMessages(inquiryId: string): InquiryMessage[] {
    return this.inquiryMessages.filter((m) => m.inquiryId === inquiryId);
  }

  addInquiryMessage(message: InquiryMessage) {
    this.inquiryMessages.push(message);
  }

  addLocation(location: Location) {
    // Preserve exact provided coordinates; never fabricate fake coordinates when missing.
    this.locations.push(location);
  }

  updateLocationCoordinates(locationId: string, lat: number | undefined, lng: number | undefined) {
    const loc = this.locations.find((l) => l.id === locationId);
    if (loc) {
      loc.coordinates = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    }
  }

  addSource(source: BiomassSource) {
    this.sources.push(source);
  }

  updateSource(id: string, updates: Partial<BiomassSource>) {
    const idx = this.sources.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.sources[idx] = { ...this.sources[idx], ...updates };
    }
  }

  addOrganization(org: Organization) {
    this.organizations.push(org);
  }

  addRecord(record: BiomassRecord, userId: string) {
    this.records.push(record);
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      userId,
      action: SystemAction.CREATE,
      entityType: 'BiomassRecord',
      entityId: record.id,
      timestamp: new Date().toISOString(),
    });
  }

  updateRecord(
    id: string,
    updates: Partial<BiomassRecord>,
    userId: string,
    action: SystemAction = SystemAction.UPDATE
  ) {
    const idx = this.records.findIndex((r) => r.id === id);
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
        timestamp: new Date().toISOString(),
      });
    }
  }

  addValidation(validation: ValidationRecord, userId: string) {
    this.validationRecords.push(validation);
    this.updateRecord(
      validation.biomassRecordId,
      {
        status: validation.decision,
        validationDate: validation.validationDate,
      },
      userId,
      SystemAction.VALIDATE
    );

    this.auditLogs.push({
      id: `log-${Date.now()}`,
      userId,
      action:
        validation.decision === RecordStatus.VALIDATED
          ? SystemAction.VALIDATE
          : validation.decision === RecordStatus.RETURNED
          ? SystemAction.RETURN
          : SystemAction.REJECT,
      entityType: 'ValidationRecord',
      entityId: validation.id,
      timestamp: validation.validationDate,
    });
  }
}

export const db = new MockDatabase();
