import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  User,
  Role,
  SystemNotification,
} from '../types';
import { db } from './mockDb';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import {
  fetchAllDataFromSupabase,
  createLocationInSupabase,
  createSourceInSupabase,
  createBiomassRecordInSupabase,
  updateBiomassRecordInSupabase,
  submitValidationInSupabase,
  createAggregationGroupInSupabase,
  submitInquiryInSupabase,
  updateInquiryStatusInSupabase,
} from '../services/agriCycleService';

interface DataContextType {
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
  inquiryMessages: InquiryMessage[];
  profiles: User[];
  notifications: SystemNotification[];
  isLoading: boolean;
  error: string | null;
  isUsingSupabase: boolean;
  refreshData: () => Promise<void>;

  // Notification actions
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addNotification: (notification: Omit<SystemNotification, 'id' | 'createdAt' | 'isRead'>) => void;

  // Helpers
  getBiomassTypes: () => ReferenceData[];
  getUnits: () => ReferenceData[];
  getRecord: (id: string) => BiomassRecord | undefined;
  getSource: (id: string) => BiomassSource | undefined;
  getLocation: (id: string) => Location | undefined;
  getOrganization: (id: string) => Organization | undefined;
  getAggregationGroup: (id: string) => AggregationGroup | undefined;
  getAggregationMembers: (groupId: string) => AggregationMember[];
  getInquiryMessages: (inquiryId: string) => InquiryMessage[];

  // Async Mutations (PostgreSQL backed when Supabase is configured)
  addLocation: (location: Omit<Location, 'id'> & { id?: string }) => Promise<Location>;
  addSource: (source: Omit<BiomassSource, 'id'> & { id?: string }) => Promise<BiomassSource>;
  addOrganization: (orgInput: { name: string; type: 'COOPERATIVE' | 'HUB' | 'LGU' | 'BUYER' | 'ADMIN'; locationId?: string }) => Promise<Organization>;
  addRecord: (record: Omit<BiomassRecord, 'id' | 'createdAt' | 'lastUpdatedDate'> & { id?: string }) => Promise<BiomassRecord>;
  updateRecord: (id: string, updates: Partial<BiomassRecord>, action?: SystemAction) => Promise<void>;
  addValidation: (
    recordId: string,
    decision: RecordStatus,
    validationBasis: string,
    validationNotes: string
  ) => Promise<ValidationRecord>;
  addAggregationGroup: (
    name: string,
    biomassTypeId: string,
    hubId: string | undefined,
    memberRecordIds: string[],
    notes?: string
  ) => Promise<AggregationGroup>;
  addInquiry: (input: {
    targetType: 'RECORD' | 'GROUP';
    targetId: string;
    biomassTypeId: string;
    requestedQuantity: number;
    requestedUnit: string;
    intendedUse?: string;
    preferredAvailabilityPeriod?: string;
    preferredCollectionDate?: string;
    preferredPickupTime?: string;
    additionalRequirements?: string;
  }) => Promise<Inquiry>;
  updateInquiryStatus: (inquiryId: string, newStatus: InquiryStatus, notes?: string) => Promise<void>;
  addInquiryMessage: (inquiryId: string, message: string) => Promise<InquiryMessage>;
}

const DEFAULT_PROFILES: User[] = [
  {
    id: 'user-admin',
    name: 'Juan Dela Cruz',
    email: 'admin@agricycle.ph',
    role: Role.ADMINISTRATOR,
  },
  {
    id: 'user-coord',
    name: 'Nitronford Beatingo',
    email: 'nitronford.beatingo@g.msuiit.edu.ph',
    role: Role.COORDINATOR,
    organizationId: 'org-2',
  },
  {
    id: 'user-lgu',
    name: 'Engr. Arvin Jimenez',
    email: 'arvin.jimenez@g.msuiit.edu.ph',
    role: Role.LGU,
    organizationId: 'org-1',
  },
  {
    id: 'user-buyer',
    name: 'Carlos Santos',
    email: 'buyer@biopower.ph',
    role: Role.BUYER,
    organizationId: 'org-1',
  },
  {
    id: 'user-coord-2',
    name: 'Maria Clara',
    email: 'maria.clara@agusanfarmers.org',
    role: Role.COORDINATOR,
    organizationId: 'org-2',
  },
  {
    id: 'user-buyer-2',
    name: 'Roberto Tan',
    email: 'roberto@greenfuel.ph',
    role: Role.BUYER,
  },
];

const INITIAL_NOTIFICATIONS: SystemNotification[] = [
  {
    id: 'notif-1',
    recipientRole: Role.LGU,
    title: 'New Biomass Record Awaiting Review',
    message: 'REC-1002 from Libertad Rice Farmers Coop submitted for LGU validation.',
    link: '/biomass-records',
    isRead: false,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    type: 'RECORD_SUBMITTED',
  },
  {
    id: 'notif-2',
    recipientRole: Role.COORDINATOR,
    title: 'Inquiry Received from BioPower Mindanao',
    message: 'New inquiry for 50 Metric Tons of Rice Husk in Butuan City.',
    link: '/inquiries',
    isRead: false,
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    type: 'INQUIRY_SUBMITTED',
  },
  {
    id: 'notif-3',
    recipientRole: Role.COORDINATOR,
    title: 'Biomass Record Returned for Correction',
    message: 'REC-1003 requires updated moisture content details before approval.',
    link: '/biomass-records',
    isRead: false,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    type: 'RECORD_RETURNED',
  },
  {
    id: 'notif-4',
    recipientRole: Role.ADMINISTRATOR,
    title: 'System Audit Check Completed',
    message: 'Automated integrity validation passed across 86 Butuan City barangay zones.',
    link: '/audit-logs',
    isRead: true,
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    type: 'SYSTEM',
  },
];

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [records, setRecords] = useState<BiomassRecord[]>(db.records);
  const [locations, setLocations] = useState<Location[]>(db.locations);
  const [sources, setSources] = useState<BiomassSource[]>(db.sources);
  const [referenceData, setReferenceData] = useState<ReferenceData[]>(db.referenceData);
  const [validationRecords, setValidationRecords] = useState<ValidationRecord[]>(db.validationRecords);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(db.auditLogs);
  const [organizations, setOrganizations] = useState<Organization[]>(db.organizations);
  const [aggregationGroups, setAggregationGroups] = useState<AggregationGroup[]>(db.aggregationGroups);
  const [aggregationMembers, setAggregationMembers] = useState<AggregationMember[]>(db.aggregationMembers);
  const [inquiries, setInquiries] = useState<Inquiry[]>(db.inquiries);
  const [inquiryMessages, setInquiryMessages] = useState<InquiryMessage[]>(() => {
    try {
      const saved = localStorage.getItem('agricycle_inquiry_messages');
      return saved ? JSON.parse(saved) : db.inquiryMessages;
    } catch {
      return db.inquiryMessages;
    }
  });
  const [profiles, setProfiles] = useState<User[]>(DEFAULT_PROFILES);
  const [notifications, setNotifications] = useState<SystemNotification[]>(() => {
    try {
      const saved = localStorage.getItem('agricycle_notifications');
      return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
    } catch {
      return INITIAL_NOTIFICATIONS;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('agricycle_inquiry_messages', JSON.stringify(inquiryMessages));
    } catch (e) {
      console.error('Failed to save inquiry messages to localStorage', e);
    }
  }, [inquiryMessages]);

  useEffect(() => {
    try {
      localStorage.setItem('agricycle_notifications', JSON.stringify(notifications));
    } catch (e) {
      console.error('Failed to save notifications to localStorage', e);
    }
  }, [notifications]);

  const addNotification = useCallback((notif: Omit<SystemNotification, 'id' | 'createdAt' | 'isRead'>) => {
    const newNotif: SystemNotification = {
      ...notif,
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const syncLocalStateFromMock = useCallback(() => {
    setRecords([...db.records]);
    setLocations([...db.locations]);
    setSources([...db.sources]);
    setReferenceData([...db.referenceData]);
    setValidationRecords([...db.validationRecords]);
    setAuditLogs([...db.auditLogs]);
    setOrganizations([...db.organizations]);
    setAggregationGroups([...db.aggregationGroups]);
    setAggregationMembers([...db.aggregationMembers]);
    setInquiries([...db.inquiries]);
    if (profiles.length === 0) {
      setProfiles(DEFAULT_PROFILES);
    }
  }, [profiles.length]);

  const refreshData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      syncLocalStateFromMock();
      return;
    }

    if (!user) return;

    setIsLoading(true);
    setError(null);
    try {
      const dataset = await fetchAllDataFromSupabase();
      db.syncFromDataset(dataset);
      setRecords(dataset.records);
      setLocations(dataset.locations);
      setSources(dataset.sources);
      setReferenceData(dataset.referenceData);
      setValidationRecords(dataset.validationRecords);
      setAuditLogs(dataset.auditLogs);
      setOrganizations(dataset.organizations);
      setAggregationGroups(dataset.aggregationGroups);
      setAggregationMembers(dataset.aggregationMembers);
      setInquiries(dataset.inquiries);
      setProfiles(dataset.profiles.length > 0 ? dataset.profiles : DEFAULT_PROFILES);
    } catch (err: any) {
      console.error('Supabase data fetch error:', err);
      setError(err?.message || 'Failed to load data from Supabase.');
    } finally {
      setIsLoading(false);
    }
  }, [user, syncLocalStateFromMock]);

  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user, refreshData]);

  const getBiomassTypes = useCallback(
    () => referenceData.filter((r) => r.category === 'BIOMASS_TYPE' && r.isActive),
    [referenceData]
  );

  const getUnits = useCallback(
    () => referenceData.filter((r) => r.category === 'UNIT' && r.isActive),
    [referenceData]
  );

  const getRecord = useCallback((id: string) => records.find((r) => r.id === id), [records]);
  const getSource = useCallback((id: string) => sources.find((s) => s.id === id), [sources]);
  const getLocation = useCallback((id: string) => locations.find((l) => l.id === id), [locations]);
  const getOrganization = useCallback((id: string) => organizations.find((o) => o.id === id), [organizations]);
  const getAggregationGroup = useCallback(
    (id: string) => aggregationGroups.find((g) => g.id === id),
    [aggregationGroups]
  );
  const getAggregationMembers = useCallback(
    (groupId: string) => aggregationMembers.filter((m) => m.groupId === groupId && m.isActive),
    [aggregationMembers]
  );

  const addLocation = async (locationInput: Omit<Location, 'id'> & { id?: string }): Promise<Location> => {
    if (isSupabaseConfigured && user) {
      const created = await createLocationInSupabase(locationInput);
      await refreshData();
      return created;
    }

    const newLoc: Location = {
      id: locationInput.id || `loc-${Date.now()}`,
      ...locationInput,
    };
    db.addLocation(newLoc);
    syncLocalStateFromMock();
    return newLoc;
  };

  const addSource = async (sourceInput: Omit<BiomassSource, 'id'> & { id?: string }): Promise<BiomassSource> => {
    if (!user) throw new Error('You must be signed in to register a source.');

    if (isSupabaseConfigured) {
      const created = await createSourceInSupabase(sourceInput, user);
      await refreshData();
      return created;
    }

    const newSource: BiomassSource = {
      id: sourceInput.id || `src-${Date.now()}`,
      ...sourceInput,
    };
    db.addSource(newSource);
    syncLocalStateFromMock();
    return newSource;
  };

  const addOrganization = async (orgInput: {
    name: string;
    type: 'COOPERATIVE' | 'HUB' | 'LGU' | 'BUYER' | 'ADMIN';
    locationId?: string;
  }): Promise<Organization> => {
    const newOrg: Organization = {
      id: `org-${Date.now()}`,
      ...orgInput,
    };
    db.addOrganization(newOrg);
    setOrganizations((prev) => [...prev, newOrg]);
    return newOrg;
  };

  const addRecord = async (
    recordInput: Omit<BiomassRecord, 'id' | 'createdAt' | 'lastUpdatedDate'> & { id?: string }
  ): Promise<BiomassRecord> => {
    if (!user) throw new Error('You must be signed in to create a biomass record.');

    let createdRecord: BiomassRecord;
    if (isSupabaseConfigured) {
      createdRecord = await createBiomassRecordInSupabase(recordInput, user);
      await refreshData();
    } else {
      const newRecord: BiomassRecord = {
        ...recordInput,
        id: recordInput.id || `REC-${Math.floor(1000 + Math.random() * 9000)}`,
        createdAt: new Date().toISOString(),
        lastUpdatedDate: new Date().toISOString(),
      };
      db.addRecord(newRecord, user.id);
      syncLocalStateFromMock();
      createdRecord = newRecord;
    }

    // Dispatch notification to LGU officers for review
    addNotification({
      recipientRole: Role.LGU,
      title: 'New Biomass Record Awaiting Validation',
      message: `Record ${createdRecord.id} was submitted by ${user.name} and requires validation.`,
      link: '/biomass-records',
      type: 'RECORD_SUBMITTED',
    });

    return createdRecord;
  };

  const updateRecord = async (
    id: string,
    updates: Partial<BiomassRecord>,
    action: SystemAction = SystemAction.UPDATE
  ): Promise<void> => {
    if (!user) throw new Error('You must be signed in to update a record.');

    if (isSupabaseConfigured) {
      await updateBiomassRecordInSupabase(id, updates, user, action);
      await refreshData();
    } else {
      db.updateRecord(id, updates, user.id, action);
      syncLocalStateFromMock();
    }

    if (updates.status === RecordStatus.SUBMITTED) {
      addNotification({
        recipientRole: Role.LGU,
        title: 'Biomass Record Re-submitted',
        message: `Record ${id} was corrected and resubmitted for review.`,
        link: '/biomass-records',
        type: 'RECORD_SUBMITTED',
      });
    }
  };

  const addValidation = async (
    recordId: string,
    decision: RecordStatus,
    validationBasis: string,
    validationNotes: string
  ): Promise<ValidationRecord> => {
    if (!user) throw new Error('You must be signed in to validate a record.');

    let createdVal: ValidationRecord;
    if (isSupabaseConfigured) {
      createdVal = await submitValidationInSupabase(recordId, decision, validationBasis, validationNotes, user);
      await refreshData();
    } else {
      const validation: ValidationRecord = {
        id: `VAL-${Date.now()}`,
        biomassRecordId: recordId,
        validatorId: user.id,
        decision,
        validationBasis: validationBasis || 'Not provided',
        validationNotes: validationNotes || 'None',
        validationDate: new Date().toISOString(),
      };
      db.addValidation(validation, user.id);
      syncLocalStateFromMock();
      createdVal = validation;
    }

    // Auto-dispatch notification based on decision
    if (decision === RecordStatus.VALIDATED) {
      addNotification({
        recipientRole: Role.COORDINATOR,
        title: `Record ${recordId} Approved & Validated`,
        message: `LGU Officer ${user.name} validated record ${recordId}. It is now eligible for aggregation and buyer listing.`,
        link: '/biomass-records',
        type: 'RECORD_VALIDATED',
      });
    } else if (decision === RecordStatus.RETURNED) {
      addNotification({
        recipientRole: Role.COORDINATOR,
        title: `Record ${recordId} Returned for Correction`,
        message: `Correction requested: "${validationNotes}". Please edit and resubmit.`,
        link: '/biomass-records',
        type: 'RECORD_RETURNED',
      });
    } else if (decision === RecordStatus.REJECTED) {
      addNotification({
        recipientRole: Role.COORDINATOR,
        title: `Record ${recordId} Rejected`,
        message: `LGU rejection reason: "${validationNotes}".`,
        link: '/biomass-records',
        type: 'RECORD_REJECTED',
      });
    }

    return createdVal;
  };

  const addAggregationGroup = async (
    name: string,
    biomassTypeId: string,
    hubId: string | undefined,
    memberRecordIds: string[] = [],
    notes?: string
  ): Promise<AggregationGroup> => {
    if (!user) throw new Error('You must be signed in to create an aggregation group.');

    if (isSupabaseConfigured) {
      const created = await createAggregationGroupInSupabase(name, biomassTypeId, hubId || '', memberRecordIds, user, notes);
      await refreshData();
      return created;
    }

    const newGroup: AggregationGroup = {
      id: `AG-${Math.floor(100 + Math.random() * 900)}`,
      name,
      biomassTypeId,
      hubId: hubId || undefined,
      status: AggregationStatus.ACTIVE,
      notes,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.addAggregationGroup(newGroup, memberRecordIds, user.id);
    syncLocalStateFromMock();
    return newGroup;
  };

  const getInquiryMessages = useCallback((inquiryId: string) => {
    return inquiryMessages.filter((m) => m.inquiryId === inquiryId);
  }, [inquiryMessages]);

  const addInquiryMessage = async (inquiryId: string, message: string): Promise<InquiryMessage> => {
    if (!user) throw new Error('You must be signed in to send a message.');
    const newMsg: InquiryMessage = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      inquiryId,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      message: message.trim(),
      createdAt: new Date().toISOString(),
    };
    db.addInquiryMessage(newMsg);
    setInquiryMessages((prev) => [...prev, newMsg]);

    // Automatically transition SUBMITTED or ACKNOWLEDGED to IN_DISCUSSION if active discussion begins
    const inq = inquiries.find((i) => i.id === inquiryId);
    if (inq && (inq.status === InquiryStatus.SUBMITTED || inq.status === InquiryStatus.ACKNOWLEDGED)) {
      await updateInquiryStatus(inquiryId, InquiryStatus.IN_DISCUSSION, `Discussion message from ${user.name}`);
    }

    return newMsg;
  };

  const addInquiry = async (input: {
    targetType: 'RECORD' | 'GROUP';
    targetId: string;
    biomassTypeId: string;
    requestedQuantity: number;
    requestedUnit: string;
    intendedUse?: string;
    preferredAvailabilityPeriod?: string;
    preferredCollectionDate?: string;
    preferredPickupTime?: string;
    additionalRequirements?: string;
  }): Promise<Inquiry> => {
    if (!user) throw new Error('You must be signed in to submit an inquiry.');

    let createdInq: Inquiry;
    if (isSupabaseConfigured) {
      createdInq = await submitInquiryInSupabase(input, user);
      await refreshData();
    } else {
      const inqId = `INQ-${Math.floor(1000 + Math.random() * 9000)}`;
      const newInquiry: Inquiry = {
        id: inqId,
        buyerUserId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        biomassTypeId: input.biomassTypeId,
        requestedQuantity: input.requestedQuantity,
        requestedUnit: input.requestedUnit,
        intendedUse: input.intendedUse,
        preferredAvailabilityPeriod: input.preferredAvailabilityPeriod,
        preferredCollectionDate: input.preferredCollectionDate,
        preferredPickupTime: input.preferredPickupTime,
        additionalRequirements: input.additionalRequirements,
        status: InquiryStatus.SUBMITTED,
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: [
          {
            id: `inqh-${Date.now()}`,
            inquiryId: inqId,
            newStatus: InquiryStatus.SUBMITTED,
            changedBy: user.id,
            changedAt: new Date().toISOString(),
          },
        ],
      };
      db.addInquiry(newInquiry, user.id);
      syncLocalStateFromMock();
      createdInq = newInquiry;
    }

    // Auto-dispatch notification to Coordinators & Admin
    addNotification({
      recipientRole: Role.COORDINATOR,
      title: 'New Biomass Buyer Inquiry Received',
      message: `${user.name} submitted an inquiry for ${input.requestedQuantity} ${input.requestedUnit} (${input.targetType} ${input.targetId}).`,
      link: '/inquiries',
      type: 'INQUIRY_SUBMITTED',
    });

    return createdInq;
  };

  const updateInquiryStatus = async (
    inquiryId: string,
    newStatus: InquiryStatus,
    notes?: string
  ): Promise<void> => {
    if (!user) throw new Error('You must be signed in to update an inquiry.');

    if (isSupabaseConfigured) {
      await updateInquiryStatusInSupabase(inquiryId, newStatus, user, notes);
      await refreshData();
    } else {
      db.updateInquiryStatus(inquiryId, newStatus, user.id, notes);
      syncLocalStateFromMock();
    }

    addNotification({
      recipientRole: Role.BUYER,
      title: `Inquiry ${inquiryId} Status: ${newStatus.replace(/_/g, ' ')}`,
      message: `Your inquiry has been updated to ${newStatus.replace(/_/g, ' ')}.${notes ? ` Note: "${notes}"` : ''}`,
      link: '/inquiries',
      type: 'INQUIRY_STATUS_CHANGED',
    });
  };

  return (
    <DataContext.Provider
      value={{
        records,
        locations,
        sources,
        referenceData,
        validationRecords,
        auditLogs,
        organizations,
        aggregationGroups,
        aggregationMembers,
        inquiries,
        inquiryMessages,
        profiles,
        notifications,
        isLoading,
        error,
        isUsingSupabase: isSupabaseConfigured,
        refreshData,
        markNotificationRead,
        markAllNotificationsRead,
        addNotification,
        getBiomassTypes,
        getUnits,
        getRecord,
        getSource,
        getLocation,
        getOrganization,
        getAggregationGroup,
        getAggregationMembers,
        getInquiryMessages,
        addInquiryMessage,
        addLocation,
        addSource,
        addOrganization,
        addRecord,
        updateRecord,
        addValidation,
        addAggregationGroup,
        addInquiry,
        updateInquiryStatus,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
