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
import { hasPermission, Permission } from '../utils/rbac';
import {
  fetchAllDataFromSupabase,
  createLocationInSupabase,
  updateLocationCoordinatesInSupabase,
  createOrganizationInSupabase,
  createSourceInSupabase,
  updateSourceInSupabase,
  createBiomassRecordInSupabase,
  updateBiomassRecordInSupabase,
  submitValidationInSupabase,
  createAggregationGroupInSupabase,
  submitInquiryInSupabase,
  updateInquiryStatusInSupabase,
  updateUserRoleInSupabase,
  setUserActiveStatusInSupabase,
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
  updateLocationCoordinates: (locationId: string, lat?: number, lng?: number) => Promise<void>;
  addSource: (source: Omit<BiomassSource, 'id'> & { id?: string }) => Promise<BiomassSource>;
  updateSource: (id: string, updates: Partial<BiomassSource>) => Promise<void>;
  addOrganization: (orgInput: {
    name: string;
    type: 'COOPERATIVE' | 'HUB' | 'LGU' | 'BUYER' | 'ADMIN';
    locationId?: string;
  }) => Promise<Organization>;
  addRecord: (
    record: Omit<BiomassRecord, 'id' | 'createdAt' | 'lastUpdatedDate'> & { id?: string }
  ) => Promise<BiomassRecord>;
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
  updateUserRole: (email: string, newRole: Role, organizationId?: string) => Promise<User>;
  toggleUserActiveStatus: (email: string, isActive: boolean) => Promise<User>;
  recordUserAction: (entry: {
    userId?: string;
    action: SystemAction;
    entityType: 'BiomassRecord' | 'User' | 'Inquiry' | 'Listing' | 'AggregationGroup' | 'ValidationRecord';
    entityId: string;
    details: string;
  }) => void;
}

const DEFAULT_PROFILES: User[] = [
  {
    id: 'user-admin',
    name: 'Juan Dela Cruz',
    email: 'admin@agricycle.ph',
    role: Role.ADMINISTRATOR,
    isActive: true,
  },
  {
    id: 'user-coord',
    name: 'Nitronford Beatingo',
    email: 'nitronford.beatingo@g.msuiit.edu.ph',
    role: Role.COORDINATOR,
    isActive: true,
  },
  {
    id: 'user-lgu',
    name: 'Engr. Arvin Jimenez',
    email: 'arvin.jimenez@g.msuiit.edu.ph',
    role: Role.LGU,
    isActive: true,
  },
  {
    id: 'user-buyer',
    name: 'Carlos Santos',
    email: 'buyer@biopower.ph',
    role: Role.BUYER,
    isActive: true,
  },
  {
    id: 'user-coord-2',
    name: 'Maria Clara',
    email: 'maria.clara@butuan.gov.ph',
    role: Role.COORDINATOR,
    isActive: true,
  },
  {
    id: 'user-buyer-2',
    name: 'Roberto Tan',
    email: 'roberto@greenfuel.ph',
    role: Role.BUYER,
    isActive: true,
  },
];

const INITIAL_NOTIFICATIONS: SystemNotification[] = [
  {
    id: 'notif-1',
    recipientRole: Role.COORDINATOR,
    title: 'New Biomass Record Awaiting Validation',
    message: 'REC-1003 from Ampayon Corn & Copra Farm is queued for Coordinator validation.',
    link: '/biomass-records?tab=validation',
    isRead: false,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    type: 'RECORD_SUBMITTED',
  },
  {
    id: 'notif-2',
    recipientRole: Role.COORDINATOR,
    title: 'Buyer Inquiry Received',
    message: 'New non-binding inquiry INQ-1001 submitted for Rice Husk availability in Libertad.',
    link: '/inquiries',
    isRead: false,
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    type: 'INQUIRY_SUBMITTED',
  },
  {
    id: 'notif-3',
    recipientRole: Role.ADMINISTRATOR,
    title: 'System Audit Check Completed',
    message: 'Automated integrity validation passed across Butuan City barangay records.',
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
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    try {
      const saved = localStorage.getItem('agricycle_audit_logs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const savedIds = new Set(parsed.map((l: AuditLog) => l.id));
          return [...parsed, ...db.auditLogs.filter((l) => !savedIds.has(l.id))];
        }
      }
      return db.auditLogs;
    } catch {
      return db.auditLogs;
    }
  });
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
      const saved = localStorage.getItem('agricycle_notifications_v2');
      return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
    } catch {
      return INITIAL_NOTIFICATIONS;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('agricycle_audit_logs', JSON.stringify(auditLogs));
    } catch (e) {
      console.error('Failed to save audit logs to localStorage', e);
    }
  }, [auditLogs]);

  useEffect(() => {
    try {
      localStorage.setItem('agricycle_inquiry_messages', JSON.stringify(inquiryMessages));
    } catch (e) {
      console.error('Failed to save inquiry messages to localStorage', e);
    }
  }, [inquiryMessages]);

  useEffect(() => {
    try {
      localStorage.setItem('agricycle_notifications_v2', JSON.stringify(notifications));
    } catch (e) {
      console.error('Failed to save notifications to localStorage', e);
    }
  }, [notifications]);

  const recordUserAction = useCallback(
    (entry: {
      userId?: string;
      action: SystemAction;
      entityType: 'BiomassRecord' | 'User' | 'Inquiry' | 'Listing' | 'AggregationGroup' | 'ValidationRecord';
      entityId: string;
      details: string;
    }) => {
      const actorId = entry.userId || user?.id || 'System';
      const newLog: AuditLog = {
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId: actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: entry.details,
        timestamp: new Date().toISOString(),
      };
      db.auditLogs.unshift(newLog);
      setAuditLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id)]);
    },
    [user]
  );

  const addNotification = useCallback(
    (notif: Omit<SystemNotification, 'id' | 'createdAt' | 'isRead'>) => {
      const newNotif: SystemNotification = {
        ...notif,
        id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      setNotifications((prev) => [newNotif, ...prev]);
    },
    []
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
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
    if (!user) throw new Error('You must be signed in to add a location.');
    if (
      !hasPermission(user.role, Permission.MANAGE_BIOMASS_RECORDS) &&
      !hasPermission(user.role, Permission.MANAGE_MAP_INFO)
    ) {
      throw new Error('Unauthorized: Only LGU Biomass Information Coordinators may register source locations.');
    }

    if (isSupabaseConfigured) {
      const created = await createLocationInSupabase(locationInput, user);
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

  const updateLocationCoordinates = async (
    locationId: string,
    lat?: number,
    lng?: number
  ): Promise<void> => {
    if (!user) throw new Error('You must be signed in to update coordinates.');
    if (!hasPermission(user.role, Permission.MANAGE_MAP_INFO)) {
      throw new Error('Unauthorized: Only LGU Biomass Information Coordinators may update GIS source coordinates.');
    }

    if (isSupabaseConfigured) {
      await updateLocationCoordinatesInSupabase(locationId, lat ?? null, lng ?? null, user);
      await refreshData();
    } else {
      db.updateLocationCoordinates(locationId, lat, lng);
      syncLocalStateFromMock();
    }

    recordUserAction({
      userId: user.id,
      action: SystemAction.UPDATE,
      entityType: 'BiomassRecord',
      entityId: locationId,
      details:
        lat !== undefined && lng !== undefined
          ? `Updated GIS coordinates for location ${locationId} (${lat}, ${lng})`
          : `Cleared GIS coordinates for location ${locationId}`,
    });
  };

  const addSource = async (sourceInput: Omit<BiomassSource, 'id'> & { id?: string }): Promise<BiomassSource> => {
    if (!user) throw new Error('You must be signed in to register a source.');
    if (!hasPermission(user.role, Permission.REGISTER_BIOMASS_SOURCE)) {
      throw new Error('Unauthorized: Only LGU Biomass Information Coordinators may register biomass sources.');
    }

    if (isSupabaseConfigured) {
      const created = await createSourceInSupabase(sourceInput, user);
      await refreshData();
      return created;
    }

    const newSource: BiomassSource = {
      id: sourceInput.id || `src-${Date.now()}`,
      ...sourceInput,
      cooperativeId: undefined,
    };
    db.addSource(newSource);
    syncLocalStateFromMock();
    return newSource;
  };

  const updateSource = async (id: string, updates: Partial<BiomassSource>): Promise<void> => {
    if (!user) throw new Error('You must be signed in to update a source.');
    if (!hasPermission(user.role, Permission.REGISTER_BIOMASS_SOURCE)) {
      throw new Error('Unauthorized: Only LGU Biomass Information Coordinators may update biomass sources.');
    }

    if (isSupabaseConfigured) {
      await updateSourceInSupabase(id, updates, user);
      await refreshData();
    } else {
      db.updateSource(id, updates);
      syncLocalStateFromMock();
    }

    recordUserAction({
      userId: user.id,
      action: SystemAction.UPDATE,
      entityType: 'BiomassRecord',
      entityId: id,
      details: `Updated biomass source details for ${updates.name || id}`,
    });
  };

  const addOrganization = async (orgInput: {
    name: string;
    type: 'COOPERATIVE' | 'HUB' | 'LGU' | 'BUYER' | 'ADMIN';
    locationId?: string;
  }): Promise<Organization> => {
    if (!user || !hasPermission(user.role, Permission.MANAGE_SYSTEM_SETTINGS)) {
      throw new Error('Unauthorized: Only Administrators may manage organizations.');
    }

    if (isSupabaseConfigured) {
      const created = await createOrganizationInSupabase(orgInput, user);
      await refreshData();
      return created;
    }

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
    if (!hasPermission(user.role, Permission.MANAGE_BIOMASS_RECORDS)) {
      throw new Error('Unauthorized: Only LGU Biomass Information Coordinators may create biomass records.');
    }

    const sanitizedStatus =
      recordInput.status === RecordStatus.DRAFT ? RecordStatus.DRAFT : RecordStatus.SUBMITTED;

    let createdRecord: BiomassRecord;
    if (isSupabaseConfigured) {
      createdRecord = await createBiomassRecordInSupabase({ ...recordInput, status: sanitizedStatus }, user);
      await refreshData();
    } else {
      const newRecord: BiomassRecord = {
        ...recordInput,
        status: sanitizedStatus,
        id: recordInput.id || `REC-${Math.floor(1000 + Math.random() * 9000)}`,
        createdAt: new Date().toISOString(),
        lastUpdatedDate: new Date().toISOString(),
      };
      db.addRecord(newRecord, user.id);
      syncLocalStateFromMock();
      createdRecord = newRecord;
    }

    if (sanitizedStatus === RecordStatus.SUBMITTED) {
      addNotification({
        recipientRole: Role.COORDINATOR,
        title: 'New Biomass Record Awaiting Validation',
        message: `Record ${createdRecord.id} was submitted by ${user.name} for Coordinator validation.`,
        link: '/biomass-records?tab=validation',
        type: 'RECORD_SUBMITTED',
      });
    }

    recordUserAction({
      userId: user.id,
      action: SystemAction.CREATE,
      entityType: 'BiomassRecord',
      entityId: createdRecord.id,
      details: `Created biomass record ${createdRecord.id}`,
    });

    if (sanitizedStatus === RecordStatus.SUBMITTED) {
      recordUserAction({
        userId: user.id,
        action: SystemAction.SUBMIT,
        entityType: 'BiomassRecord',
        entityId: createdRecord.id,
        details: `Submitted record ${createdRecord.id} for validation`,
      });
    }

    return createdRecord;
  };

  const updateRecord = async (
    id: string,
    updates: Partial<BiomassRecord>,
    action: SystemAction = SystemAction.UPDATE
  ): Promise<void> => {
    if (!user) throw new Error('You must be signed in to update a record.');
    if (!hasPermission(user.role, Permission.MANAGE_BIOMASS_RECORDS)) {
      throw new Error('Unauthorized: Only LGU Biomass Information Coordinators may edit biomass records.');
    }

    if (
      updates.status &&
      [RecordStatus.VALIDATED, RecordStatus.RETURNED, RecordStatus.REJECTED].includes(updates.status)
    ) {
      throw new Error('Validation decisions must be submitted through the formal validation workflow.');
    }

    if (isSupabaseConfigured) {
      await updateBiomassRecordInSupabase(id, updates, user, action);
      await refreshData();
    } else {
      db.updateRecord(id, updates, user.id, action);
      syncLocalStateFromMock();
    }

    recordUserAction({
      userId: user.id,
      action,
      entityType: 'BiomassRecord',
      entityId: id,
      details:
        updates.status === RecordStatus.SUBMITTED
          ? `Resubmitted record ${id} for validation`
          : `Updated biomass record ${id}`,
    });

    if (updates.status === RecordStatus.SUBMITTED) {
      addNotification({
        recipientRole: Role.COORDINATOR,
        title: 'Biomass Record Re-submitted',
        message: `Record ${id} was updated and resubmitted for Coordinator validation.`,
        link: '/biomass-records?tab=validation',
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
    if (!hasPermission(user.role, Permission.VALIDATE_BIOMASS_RECORD)) {
      throw new Error('Unauthorized: Only LGU Biomass Information Coordinators may validate biomass records.');
    }

    const targetRecord = records.find((r) => r.id === recordId);
    if (targetRecord && targetRecord.submitterId === user.id) {
      throw new Error('Self-validation is prohibited: a different Coordinator must validate records you submitted.');
    }

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

    recordUserAction({
      userId: user.id,
      action:
        decision === RecordStatus.VALIDATED
          ? SystemAction.VALIDATE
          : decision === RecordStatus.RETURNED
          ? SystemAction.RETURN
          : SystemAction.REJECT,
      entityType: 'ValidationRecord',
      entityId: recordId,
      details: `${
        decision === RecordStatus.VALIDATED
          ? 'Validated'
          : decision === RecordStatus.RETURNED
          ? 'Returned'
          : 'Rejected'
      } record ${recordId}: ${validationBasis}`,
    });

    const recipientTarget = targetRecord?.submitterId
      ? { recipientUserId: targetRecord.submitterId }
      : { recipientRole: Role.COORDINATOR };

    if (decision === RecordStatus.VALIDATED) {
      addNotification({
        ...recipientTarget,
        title: `Record ${recordId} Approved & Validated`,
        message: `Coordinator ${user.name} validated record ${recordId}. It is now eligible for aggregation and buyer listing.`,
        link: '/biomass-records',
        type: 'RECORD_VALIDATED',
      });
    } else if (decision === RecordStatus.RETURNED) {
      addNotification({
        ...recipientTarget,
        title: `Record ${recordId} Returned for Correction`,
        message: `Correction requested: "${validationNotes}". Please edit and resubmit.`,
        link: '/biomass-records',
        type: 'RECORD_RETURNED',
      });
    } else if (decision === RecordStatus.REJECTED) {
      addNotification({
        ...recipientTarget,
        title: `Record ${recordId} Rejected`,
        message: `Validation rejection reason: "${validationNotes}".`,
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
    if (!hasPermission(user.role, Permission.CREATE_AGGREGATION_GROUP)) {
      throw new Error('Unauthorized: Only LGU Biomass Information Coordinators may create aggregation groups.');
    }

    const activeMemberRecordIds = new Set(
      aggregationMembers.filter((m) => m.isActive).map((m) => m.biomassRecordId)
    );
    const conflictingRecord = memberRecordIds.find((id) => activeMemberRecordIds.has(id));
    if (conflictingRecord) {
      throw new Error(
        `Biomass record ${conflictingRecord} is already assigned to an active aggregation group and cannot be re-aggregated.`
      );
    }

    const cleanHubId = hubId && hubId.trim().length > 0 ? hubId.trim() : undefined;

    let createdGroup: AggregationGroup;
    if (isSupabaseConfigured) {
      createdGroup = await createAggregationGroupInSupabase(name, biomassTypeId, cleanHubId, memberRecordIds, user, notes);
      await refreshData();
    } else {
      const newGroup: AggregationGroup = {
        id: `AG-${Math.floor(100 + Math.random() * 900)}`,
        name,
        biomassTypeId,
        hubId: cleanHubId,
        status: AggregationStatus.ACTIVE,
        notes,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.addAggregationGroup(newGroup, memberRecordIds, user.id);
      syncLocalStateFromMock();
      createdGroup = newGroup;
    }

    recordUserAction({
      userId: user.id,
      action: SystemAction.CREATE_GROUP,
      entityType: 'AggregationGroup',
      entityId: createdGroup.id,
      details: `Created information-based aggregation group "${name}"`,
    });

    return createdGroup;
  };

  const getInquiryMessages = useCallback(
    (inquiryId: string) => {
      return inquiryMessages.filter((m) => m.inquiryId === inquiryId);
    },
    [inquiryMessages]
  );

  const addInquiryMessage = async (inquiryId: string, message: string): Promise<InquiryMessage> => {
    if (!user) throw new Error('You must be signed in to send a message.');
    if (user.role !== Role.COORDINATOR && user.role !== Role.BUYER) {
      throw new Error('Unauthorized: Only the inquiring Buyer and Coordinator may communicate on inquiries.');
    }

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

    recordUserAction({
      userId: user.id,
      action: SystemAction.UPDATE,
      entityType: 'Inquiry',
      entityId: inquiryId,
      details: `Added coordination note to inquiry ${inquiryId}`,
    });

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
    if (!hasPermission(user.role, Permission.SUBMIT_INQUIRY)) {
      throw new Error('Unauthorized: Only Buyer/Institutional Inquirer accounts may submit inquiries.');
    }

    if (input.targetType === 'RECORD') {
      const activeMember = aggregationMembers.find((m) => m.biomassRecordId === input.targetId && m.isActive);
      if (activeMember) {
        const parentGroup = aggregationGroups.find((g) => g.id === activeMember.groupId);
        const groupName = parentGroup ? `"${parentGroup.name}"` : 'an aggregation group';
        throw new Error(
          `Biomass record ${input.targetId} is consolidated into ${groupName} and cannot receive independent buyer inquiries. Please inquire through the aggregation group listing.`
        );
      }
    }

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

    recordUserAction({
      userId: user.id,
      action: SystemAction.INQUIRE,
      entityType: 'Inquiry',
      entityId: createdInq.id,
      details: `Submitted non-binding inquiry ${createdInq.id} for ${input.requestedQuantity} ${input.requestedUnit}`,
    });

    addNotification({
      recipientRole: Role.COORDINATOR,
      title: 'New Buyer Inquiry Received',
      message: `${user.name} submitted a non-binding inquiry for ${input.requestedQuantity} ${input.requestedUnit} (${input.targetType} ${input.targetId}).`,
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

    const targetInquiry = inquiries.find((i) => i.id === inquiryId);

    if (newStatus === InquiryStatus.WITHDRAWN) {
      if (!hasPermission(user.role, Permission.VIEW_OWN_INQUIRIES)) {
        throw new Error('Unauthorized: Only the inquiring Buyer may withdraw an inquiry.');
      }
      if (targetInquiry && targetInquiry.buyerUserId !== user.id) {
        throw new Error('Unauthorized: You may only withdraw inquiries submitted under your own account.');
      }
    } else if (newStatus === InquiryStatus.ACCEPTED || newStatus === InquiryStatus.DECLINED) {
      if (!hasPermission(user.role, Permission.RESPOND_TO_INQUIRIES)) {
        throw new Error('Unauthorized: Only LGU Biomass Information Coordinators may accept or decline buyer inquiries.');
      }
    } else {
      throw new Error(`Unsupported inquiry status action: ${newStatus}`);
    }

    if (isSupabaseConfigured) {
      await updateInquiryStatusInSupabase(inquiryId, newStatus, user, notes);
      await refreshData();
    } else {
      db.updateInquiryStatus(inquiryId, newStatus, user.id, notes);
      syncLocalStateFromMock();
    }

    const actionText =
      newStatus === InquiryStatus.ACCEPTED
        ? `Accepted non-binding inquiry ${inquiryId}`
        : newStatus === InquiryStatus.DECLINED
        ? `Declined inquiry ${inquiryId}`
        : `Withdrew inquiry ${inquiryId}`;

    recordUserAction({
      userId: user.id,
      action: SystemAction.UPDATE_STATUS,
      entityType: 'Inquiry',
      entityId: inquiryId,
      details: actionText,
    });

    if (newStatus === InquiryStatus.WITHDRAWN) {
      addNotification({
        recipientRole: Role.COORDINATOR,
        title: `Inquiry ${inquiryId} Withdrawn`,
        message: `${user.name} withdrew buyer inquiry ${inquiryId}.`,
        link: '/inquiries',
        type: 'INQUIRY_STATUS_CHANGED',
      });
    } else if (targetInquiry?.buyerUserId) {
      addNotification({
        recipientUserId: targetInquiry.buyerUserId,
        title: `Inquiry ${inquiryId} ${newStatus === InquiryStatus.ACCEPTED ? 'Accepted' : 'Declined'}`,
        message: `Your inquiry ${inquiryId} was ${newStatus.toLowerCase()} by the LGU Biomass Information Coordinator.${notes ? ` Note: "${notes}"` : ''}`,
        link: '/inquiries',
        type: 'INQUIRY_STATUS_CHANGED',
      });
    }
  };

  const updateUserRole = async (
    email: string,
    newRole: Role,
    organizationId?: string
  ): Promise<User> => {
    if (!user || !hasPermission(user.role, Permission.MANAGE_USERS)) {
      throw new Error('Unauthorized: Only Administrators may assign or update user roles.');
    }

    let updated: User;
    if (isSupabaseConfigured) {
      updated = await updateUserRoleInSupabase(email, newRole, organizationId, user);
      await refreshData();
    } else {
      const target = profiles.find((p) => p.email.toLowerCase() === email.toLowerCase());
      if (!target) {
        throw new Error(`User profile with email ${email} was not found.`);
      }
      updated = { ...target, role: newRole, organizationId: organizationId || undefined };
      setProfiles((prev) => prev.map((p) => (p.id === target.id ? updated : p)));
    }

    recordUserAction({
      userId: user.id,
      action: SystemAction.UPDATE,
      entityType: 'User',
      entityId: updated.id,
      details: `Assigned role ${newRole} to ${updated.email}`,
    });

    return updated;
  };

  const toggleUserActiveStatus = async (email: string, isActive: boolean): Promise<User> => {
    if (!user || !hasPermission(user.role, Permission.MANAGE_USERS)) {
      throw new Error('Unauthorized: Only Administrators may activate or deactivate user accounts.');
    }
    if (user.email.toLowerCase() === email.toLowerCase() && !isActive) {
      throw new Error('Administrators cannot deactivate their own active account.');
    }

    let updated: User;
    if (isSupabaseConfigured) {
      updated = await setUserActiveStatusInSupabase(email, isActive, user);
      await refreshData();
    } else {
      const target = profiles.find((p) => p.email.toLowerCase() === email.toLowerCase());
      if (!target) {
        throw new Error(`User profile with email ${email} was not found.`);
      }
      updated = { ...target, isActive };
      setProfiles((prev) => prev.map((p) => (p.id === target.id ? updated : p)));
    }

    recordUserAction({
      userId: user.id,
      action: SystemAction.UPDATE_STATUS,
      entityType: 'User',
      entityId: updated.id,
      details: `${isActive ? 'Activated' : 'Deactivated'} user account ${updated.email}`,
    });

    return updated;
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
        updateLocationCoordinates,
        addSource,
        updateSource,
        addOrganization,
        addRecord,
        updateRecord,
        addValidation,
        addAggregationGroup,
        addInquiry,
        updateInquiryStatus,
        updateUserRole,
        toggleUserActiveStatus,
        recordUserAction,
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
