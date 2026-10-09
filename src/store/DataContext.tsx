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
  User,
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
  profiles: User[];
  isLoading: boolean;
  error: string | null;
  isUsingSupabase: boolean;
  refreshData: () => Promise<void>;

  // Helpers
  getBiomassTypes: () => ReferenceData[];
  getUnits: () => ReferenceData[];
  getRecord: (id: string) => BiomassRecord | undefined;
  getSource: (id: string) => BiomassSource | undefined;
  getLocation: (id: string) => Location | undefined;
  getOrganization: (id: string) => Organization | undefined;
  getAggregationGroup: (id: string) => AggregationGroup | undefined;
  getAggregationMembers: (groupId: string) => AggregationMember[];

  // Async Mutations (PostgreSQL backed when Supabase is configured)
  addLocation: (location: Omit<Location, 'id'> & { id?: string }) => Promise<Location>;
  addSource: (source: Omit<BiomassSource, 'id'> & { id?: string }) => Promise<BiomassSource>;
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
    hubId: string,
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
    additionalRequirements?: string;
  }) => Promise<Inquiry>;
  updateInquiryStatus: (inquiryId: string, newStatus: InquiryStatus, notes?: string) => Promise<void>;
}

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
  const [profiles, setProfiles] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

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
      setProfiles(dataset.profiles);
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

  const addRecord = async (
    recordInput: Omit<BiomassRecord, 'id' | 'createdAt' | 'lastUpdatedDate'> & { id?: string }
  ): Promise<BiomassRecord> => {
    if (!user) throw new Error('You must be signed in to create a biomass record.');

    if (isSupabaseConfigured) {
      const created = await createBiomassRecordInSupabase(recordInput, user);
      await refreshData();
      return created;
    }

    const newRecord: BiomassRecord = {
      ...recordInput,
      id: recordInput.id || `REC-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: new Date().toISOString(),
      lastUpdatedDate: new Date().toISOString(),
    };
    db.addRecord(newRecord, user.id);
    syncLocalStateFromMock();
    return newRecord;
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
      return;
    }

    db.updateRecord(id, updates, user.id, action);
    syncLocalStateFromMock();
  };

  const addValidation = async (
    recordId: string,
    decision: RecordStatus,
    validationBasis: string,
    validationNotes: string
  ): Promise<ValidationRecord> => {
    if (!user) throw new Error('You must be signed in to validate a record.');

    if (isSupabaseConfigured) {
      const created = await submitValidationInSupabase(recordId, decision, validationBasis, validationNotes, user);
      await refreshData();
      return created;
    }

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
    return validation;
  };

  const addAggregationGroup = async (
    name: string,
    biomassTypeId: string,
    hubId: string,
    memberRecordIds: string[],
    notes?: string
  ): Promise<AggregationGroup> => {
    if (!user) throw new Error('You must be signed in to create an aggregation group.');

    if (isSupabaseConfigured) {
      const created = await createAggregationGroupInSupabase(name, biomassTypeId, hubId, memberRecordIds, user, notes);
      await refreshData();
      return created;
    }

    const newGroup: AggregationGroup = {
      id: `AG-${Math.floor(100 + Math.random() * 900)}`,
      name,
      biomassTypeId,
      hubId,
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

  const addInquiry = async (input: {
    targetType: 'RECORD' | 'GROUP';
    targetId: string;
    biomassTypeId: string;
    requestedQuantity: number;
    requestedUnit: string;
    intendedUse?: string;
    preferredAvailabilityPeriod?: string;
    additionalRequirements?: string;
  }): Promise<Inquiry> => {
    if (!user) throw new Error('You must be signed in to submit an inquiry.');

    if (isSupabaseConfigured) {
      const created = await submitInquiryInSupabase(input, user);
      await refreshData();
      return created;
    }

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
    return newInquiry;
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
      return;
    }

    db.updateInquiryStatus(inquiryId, newStatus, user.id, notes);
    syncLocalStateFromMock();
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
        profiles,
        isLoading,
        error,
        isUsingSupabase: isSupabaseConfigured,
        refreshData,
        getBiomassTypes,
        getUnits,
        getRecord,
        getSource,
        getLocation,
        getOrganization,
        getAggregationGroup,
        getAggregationMembers,
        addLocation,
        addSource,
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
