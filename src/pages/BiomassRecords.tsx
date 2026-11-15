import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { RecordStatus, Role, BiomassRecord, SystemAction } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { getRoleDisplayName, hasPermission, Permission } from '../utils/rbac';
import {
  Search,
  Filter,
  Plus,
  AlertTriangle,
  ArrowLeft,
  ShieldCheck,
  Layers,
  Eye,
  Building2,
  Edit3,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams, Link } from 'react-router-dom';
import { CreateRecordForm } from '../components/CreateRecordForm';
import { ValidationForm } from '../components/ValidationForm';

const formatSafeDate = (iso?: string, fallback = 'Flexible') => {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : format(d, 'MMM d, yyyy');
};

export const BiomassRecords: React.FC = () => {
  const { user } = useAuth();
  const {
    records,
    sources,
    referenceData,
    validationRecords,
    aggregationGroups,
    aggregationMembers,
    profiles,
    isLoading,
    getSource,
    getLocation,
    getRecord,
    updateRecord,
    updateSource,
  } = useData();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const isValidationTab = tabParam === 'validation';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(isValidationTab ? 'VALIDATION_QUEUE' : 'ALL');
  const [isCreating, setIsCreating] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Source Directory / Edit Modal for Coordinators
  const [showSourcesModal, setShowSourcesModal] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editSourceName, setEditSourceName] = useState('');
  const [editSourceType, setEditSourceType] = useState('Farm');
  const [editSourceContact, setEditSourceContact] = useState('');
  const [sourceSaveError, setSourceSaveError] = useState('');
  const [isSavingSource, setIsSavingSource] = useState(false);

  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(searchParams.get('recordId'));

  useEffect(() => {
    if (isValidationTab) {
      setStatusFilter('VALIDATION_QUEUE');
    } else if (statusFilter === 'VALIDATION_QUEUE') {
      setStatusFilter('ALL');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValidationTab]);

  useEffect(() => {
    const nextParams: Record<string, string> = {};
    if (tabParam) nextParams.tab = tabParam;
    if (selectedRecordId) nextParams.recordId = selectedRecordId;
    setSearchParams(nextParams, { replace: true });
  }, [selectedRecordId, tabParam, setSearchParams]);

  if (!user) return null;

  const isPlanningReadOnly = user.role === Role.LGU;
  const canManageRecords = hasPermission(user.role, Permission.MANAGE_BIOMASS_RECORDS);
  const canRegisterSources = hasPermission(user.role, Permission.REGISTER_BIOMASS_SOURCE);
  const canValidate = hasPermission(user.role, Permission.VALIDATE_BIOMASS_RECORD);

  if (isCreating && canManageRecords) {
    return (
      <CreateRecordForm
        onCancel={() => setIsCreating(false)}
        onSuccess={(newId) => {
          setIsCreating(false);
          setSelectedRecordId(newId);
        }}
      />
    );
  }

  if (editingRecordId && canManageRecords) {
    const recordToEdit = getRecord(editingRecordId);
    return (
      <CreateRecordForm
        initialRecord={recordToEdit}
        onCancel={() => setEditingRecordId(null)}
        onSuccess={(id) => {
          setEditingRecordId(null);
          setSelectedRecordId(id);
        }}
      />
    );
  }

  const openEditSource = (srcId: string) => {
    const src = getSource(srcId);
    if (!src) return;
    setEditingSourceId(src.id);
    setEditSourceName(src.name);
    setEditSourceType(src.type);
    setEditSourceContact(src.contactPerson || '');
    setSourceSaveError('');
    setShowSourcesModal(true);
  };

  const handleSaveSourceEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSourceId || !editSourceName.trim()) {
      setSourceSaveError('Source name is required.');
      return;
    }
    setIsSavingSource(true);
    setSourceSaveError('');
    try {
      await updateSource(editingSourceId, {
        name: editSourceName.trim(),
        type: editSourceType,
        contactPerson: editSourceContact.trim() || 'Source Contact',
      });
      setEditingSourceId(null);
    } catch (err: any) {
      setSourceSaveError(err?.message || 'Failed to update source.');
    } finally {
      setIsSavingSource(false);
    }
  };

  // Detail View
  if (selectedRecordId) {
    const record = getRecord(selectedRecordId);
    const isRestrictedForPlanning = isPlanningReadOnly && record && record.status !== RecordStatus.VALIDATED;

    if (!record || isRestrictedForPlanning) {
      return (
        <div className="max-w-4xl mx-auto py-10 text-center space-y-4">
          <p className="text-gray-600">
            {isRestrictedForPlanning
              ? 'Planning users have read-only access to validated biomass records only.'
              : 'Record not found or not accessible.'}
          </p>
          <Button variant="outline" onClick={() => setSelectedRecordId(null)}>
            Back to Records
          </Button>
        </div>
      );
    }

    const type = referenceData.find((r) => r.id === record.biomassTypeId)?.label;
    const source = getSource(record.sourceId);
    const location = source ? getLocation(source.locationId) : getLocation(record.locationId);
    const unit = referenceData.find((r) => r.id === record.originalUnit)?.label;
    const recordValidations = validationRecords.filter((v) => v.biomassRecordId === record.id);

    const isSubmitter = record.submitterId === user.id || record.submitterId === user.name;
    const showValidationControls =
      canValidate && (record.status === RecordStatus.SUBMITTED || record.status === RecordStatus.UNDER_REVIEW);
    const canSubmit =
      canManageRecords &&
      (record.status === RecordStatus.DRAFT || record.status === RecordStatus.RETURNED);

    const handleStatusChange = async (newStatus: RecordStatus, action: SystemAction) => {
      setActionError('');
      setIsUpdating(true);
      try {
        await updateRecord(record.id, { status: newStatus }, action);
      } catch (err: any) {
        setActionError(err?.message || 'Failed to update record status.');
      } finally {
        setIsUpdating(false);
      }
    };

    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedRecordId(null);
                setActionError('');
              }}
              className="p-2"
            >
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Record Details</h2>
              <p className="text-sm text-agri-earth-500 mt-1">
                Detailed view, validation audit trail, and availability classification.
              </p>
            </div>
          </div>

          {canManageRecords && record.status !== RecordStatus.ARCHIVED && (
            <Button
              variant="outline"
              onClick={() => setEditingRecordId(record.id)}
              className="border-agri-green-600 text-agri-green-700 hover:bg-agri-green-50"
            >
              Edit Record
            </Button>
          )}
        </div>

        {isPlanningReadOnly && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-sm text-blue-900 flex items-center gap-2.5">
            <Eye size={18} className="text-blue-700 shrink-0" />
            <span>
              <strong>Read-Only Planning View:</strong> You are viewing a validated biomass record for regional planning and assessment.
            </span>
          </div>
        )}

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {record.status === RecordStatus.RETURNED && canManageRecords && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-900 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-amber-800 mb-1">
              <AlertTriangle size={18} /> Returned for Correction
            </div>
            <p className="text-sm text-amber-800">
              <strong>Validation Notes / Instructions:</strong>{' '}
              {recordValidations[0]?.validationNotes ||
                record.returnReason ||
                'Please review and correct source and quantity information before resubmitting.'}
            </p>
            <div className="mt-3">
              <Button
                size="sm"
                onClick={() => setEditingRecordId(record.id)}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
              >
                Edit and Fix Record
              </Button>
            </div>
          </div>
        )}

        {record.status === RecordStatus.REJECTED && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-red-900 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-red-800 mb-1">
              <AlertTriangle size={18} /> Record Rejected during Validation
            </div>
            <p className="text-sm text-red-800">
              <strong>Official Rejection Basis:</strong>{' '}
              {recordValidations[0]?.validationNotes ||
                record.rejectionReason ||
                'Record did not satisfy regional biomass reporting standards.'}
            </p>
          </div>
        )}

        {(() => {
          const activeMembership = aggregationMembers.find(
            (m) => m.biomassRecordId === record.id && m.isActive
          );
          const parentGroup = activeMembership
            ? aggregationGroups.find((g) => g.id === activeMembership.groupId)
            : undefined;

          if (!parentGroup) return null;

          return (
            <div className="bg-agri-green-50 border border-agri-green-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-agri-green-900 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="p-1.5 bg-agri-green-100 text-agri-green-800 rounded mt-0.5">
                  <Layers size={18} />
                </span>
                <div>
                  <p className="font-semibold text-agri-green-900">
                    Consolidated into Aggregation Group: {parentGroup.name}
                  </p>
                  <p className="text-agri-green-700 text-xs mt-0.5">
                    This biomass record is actively aggregated and cannot be added to another group. Independent buyer listing is suppressed to prevent double counting.
                  </p>
                </div>
              </div>
              <Link
                to="/aggregation-hubs"
                className="text-xs font-semibold px-3 py-1.5 bg-white border border-agri-green-300 rounded-lg text-agri-green-800 hover:bg-agri-green-100 transition-colors shrink-0 text-center"
              >
                View Aggregation
              </Link>
            </div>
          );
        })()}

        <Card>
          <CardHeader className="flex flex-row justify-between items-start border-b border-gray-100 pb-4">
            <div>
              <CardTitle className="text-xl">{type}</CardTitle>
              <CardDescription className="mt-1">ID: {record.id}</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <StatusBadge status={record.status} />
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                  record.externalAvailability === 'NOT_AVAILABLE'
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
              >
                {record.externalAvailability === 'NOT_AVAILABLE' ? 'Internal Only' : 'Available to Others'}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-10 text-sm">
            <div>
              <p className="text-gray-500 font-medium mb-1">Reported Total Quantity</p>
              <p className="font-semibold text-gray-900 text-lg">
                {record.quantity.toLocaleString()} {unit}
              </p>
              <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-100 space-y-1">
                <div className="flex justify-between">
                  <span>Current Internal Use:</span>
                  <span className="font-medium">
                    {(record.currentUseQuantity || 0).toLocaleString()} {unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Reserved / Committed:</span>
                  <span className="font-medium">
                    {(record.reservedQuantity || 0).toLocaleString()} {unit}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-gray-200">
                  <span className="font-semibold text-agri-green-900">Remaining Available:</span>
                  <span className="font-bold text-agri-green-700">
                    {(record.remainingQuantity !== undefined ? record.remainingQuantity : record.quantity).toLocaleString()}{' '}
                    {unit}
                  </span>
                </div>
              </div>
              {record.isTheoreticalEstimate && (
                <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded mt-2">
                  Theoretical Estimate — Not Current Supply
                </span>
              )}
            </div>
            <div>
              <p className="text-gray-500 font-medium mb-1">Availability Window</p>
              <p className="text-gray-900 font-medium">
                {record.availabilityPeriodStart && record.availabilityPeriodEnd
                  ? `${formatSafeDate(record.availabilityPeriodStart)} to ${formatSafeDate(record.availabilityPeriodEnd)}`
                  : record.availabilityPeriodStart
                  ? `From ${formatSafeDate(record.availabilityPeriodStart)} (Flexible / Ongoing)`
                  : record.availabilityPeriodEnd
                  ? `Until ${formatSafeDate(record.availabilityPeriodEnd)}`
                  : 'Immediate & Flexible Availability'}
              </p>
              <p className="text-gray-500 font-medium mb-1 mt-3">Present Internal Use</p>
              <p className="text-gray-900">{record.currentUse || 'None specified'}</p>
              <p className="text-gray-500 font-medium mb-1 mt-3">Market Listing Eligibility</p>
              <p className="text-xs font-medium">
                {record.status === RecordStatus.VALIDATED && record.externalAvailability !== 'NOT_AVAILABLE' ? (
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    ✓ Eligible for Buyer Discovery
                  </span>
                ) : (
                  <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    Not Publicly Listed (
                    {record.status !== RecordStatus.VALIDATED ? 'Awaiting Validation' : 'Marked Internal Only'})
                  </span>
                )}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-gray-500 font-medium mb-1">Source Information</p>
                {canRegisterSources && source && (
                  <button
                    type="button"
                    onClick={() => openEditSource(source.id)}
                    className="text-xs font-semibold text-agri-green-700 hover:text-agri-green-800 flex items-center gap-1"
                  >
                    <Edit3 size={12} /> Edit Source
                  </button>
                )}
              </div>
              <p className="text-gray-900 font-semibold">{source?.name}</p>
              <p className="text-gray-600 text-xs">
                {source?.type} • {location?.barangay}, {location?.city}
              </p>
              {source?.contactPerson && (
                <p className="text-gray-500 text-xs mt-0.5">Contact: {source.contactPerson}</p>
              )}
              <p className="text-gray-500 font-medium mb-1 mt-3">Condition & Source Site Storage</p>
              <p className="text-gray-900">
                {record.condition}{' '}
                {record.conditionNote && <span className="text-gray-500 text-xs">({record.conditionNote})</span>}
              </p>
              <p className="text-gray-600 text-xs mt-1">Storage Condition: {record.storage}</p>
            </div>
            <div>
              <p className="text-gray-500 font-medium mb-1">Traceability & Access</p>
              {(() => {
                const submitterUser = profiles.find(
                  (p) => p.id === record.submitterId || p.email === record.submitterId
                );
                const submitterDisplay = submitterUser
                  ? `${submitterUser.name} — ${getRoleDisplayName(submitterUser.role)}`
                  : record.submitterId === 'user-coord'
                  ? `Nitronford Beatingo — ${getRoleDisplayName(Role.COORDINATOR)}`
                  : record.submitterId === 'user-coord-2'
                  ? `Maria Clara — ${getRoleDisplayName(Role.COORDINATOR)}`
                  : record.submitterId;

                return (
                  <p className="text-gray-900 font-medium">
                    Submitted by: <span className="font-semibold text-agri-green-900">{submitterDisplay}</span>
                  </p>
                );
              })()}
              <p className="text-gray-600 text-xs mt-1">
                Last Updated: {format(new Date(record.lastUpdatedDate), 'MMM d, yyyy HH:mm')}
              </p>
              {record.validationDate && (
                <p className="text-gray-600 text-xs mt-0.5">
                  Last Validated: {format(new Date(record.validationDate), 'MMM d, yyyy HH:mm')}
                </p>
              )}
              {record.accessLocationNotes && (
                <p className="text-gray-600 text-xs mt-2">Access Notes: {record.accessLocationNotes}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {recordValidations.length > 0 && (
          <Card>
            <CardHeader className="pb-3 border-b border-gray-100">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck size={18} className="text-agri-green-600" /> Validation History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {recordValidations.map((val) => {
                const validatorUser = profiles.find(
                  (p) => p.id === val.validatorId || p.email === val.validatorId
                );
                const validatorName = validatorUser
                  ? `${validatorUser.name} (${getRoleDisplayName(validatorUser.role)})`
                  : val.validatorId;
                return (
                  <div key={val.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-gray-900">
                        {val.decision} &bull; <span className="font-normal text-gray-600">{val.validationBasis}</span>
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(val.validationDate), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Validator: <span className="font-semibold text-gray-900">{validatorName}</span>
                    </p>
                    {val.validationNotes && <p className="text-gray-700 mt-1 font-medium">{val.validationNotes}</p>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Coordinator Action & Validation Controls (Hidden for Read-Only Planning User) */}
        <div className="flex flex-col gap-3">
          {canSubmit && (
            <Card className="border-agri-green-200 bg-agri-green-50/30">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">Submit for Validation</p>
                  <p className="text-xs text-gray-500">
                    Send this record for LGU Biomass Information Coordinator validation.
                  </p>
                </div>
                <Button
                  isLoading={isUpdating}
                  onClick={() => handleStatusChange(RecordStatus.SUBMITTED, SystemAction.SUBMIT)}
                >
                  Submit Record
                </Button>
              </CardContent>
            </Card>
          )}

          {showValidationControls && (
            <Card className={isSubmitter ? 'border-red-200 bg-red-50/30' : 'border-yellow-200 bg-yellow-50/30'}>
              <CardContent className="p-4">
                {isSubmitter ? (
                  <div className="text-red-700 text-sm flex items-center gap-2 font-medium p-4">
                    <AlertTriangle size={16} /> Self-validation is not permitted. Another LGU Biomass Information Coordinator must validate records you submitted.
                  </div>
                ) : (
                  <ValidationForm recordId={record.id} currentStatus={record.status} onComplete={() => {}} />
                )}
              </CardContent>
            </Card>
          )}

          {canManageRecords && record.status === RecordStatus.VALIDATED && (
            <Card className="border-gray-200 bg-gray-50/50">
              <CardContent className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <p className="font-medium text-gray-900">Data Freshness</p>
                  <p className="text-xs text-gray-500">
                    Mark as stale or unavailable if the availability period has passed or source availability changed.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={isUpdating}
                    onClick={() => handleStatusChange(RecordStatus.UNAVAILABLE, SystemAction.MARK_UNAVAILABLE)}
                  >
                    Mark Unavailable
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isUpdating}
                    className="text-yellow-600 border-yellow-200 hover:bg-yellow-50"
                    onClick={() => handleStatusChange(RecordStatus.STALE, SystemAction.MARK_STALE)}
                  >
                    Flag as Stale
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Filter records strictly by role
  let visibleRecords = records;

  if (isPlanningReadOnly) {
    visibleRecords = records.filter((r) => r.status === RecordStatus.VALIDATED);
  } else if (user.role === Role.BUYER) {
    visibleRecords = records.filter((r) => r.status === RecordStatus.VALIDATED);
  }

  // Search & Status filters
  if (statusFilter === 'VALIDATION_QUEUE') {
    visibleRecords = visibleRecords.filter(
      (r) => r.status === RecordStatus.SUBMITTED || r.status === RecordStatus.UNDER_REVIEW
    );
  } else if (statusFilter !== 'ALL') {
    visibleRecords = visibleRecords.filter((r) => r.status === statusFilter);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    visibleRecords = visibleRecords.filter((r) => {
      const type = referenceData.find((ref) => ref.id === r.biomassTypeId)?.label?.toLowerCase() || '';
      const source = getSource(r.sourceId)?.name?.toLowerCase() || '';
      return type.includes(term) || source.includes(term) || r.id.toLowerCase().includes(term);
    });
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {isValidationTab && canValidate
              ? 'Biomass Validation Queue'
              : isPlanningReadOnly
              ? 'Validated Biomass Information'
              : 'Biomass Sources & Records'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            {isValidationTab && canValidate
              ? 'Review, validate, return, or reject submitted biomass records (excluding your own submissions).'
              : isPlanningReadOnly
              ? 'Read-only directory of formally validated community biomass records.'
              : 'Manage registered biomass sources and reported practical availability records.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canRegisterSources && (
            <Button
              variant="outline"
              icon={<Building2 size={16} />}
              onClick={() => {
                setEditingSourceId(null);
                setShowSourcesModal(true);
              }}
            >
              Manage Sources ({sources.length})
            </Button>
          )}
          {canManageRecords && (
            <Button icon={<Plus size={18} />} onClick={() => setIsCreating(true)}>
              Add New Record
            </Button>
          )}
        </div>
      </div>

      {isPlanningReadOnly && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 flex items-center gap-3">
          <Eye size={18} className="text-blue-700 shrink-0" />
          <div>
            <strong>LGU/Institutional Planning View (Read-Only):</strong> Only validated biomass records are displayed here. Editing, record intake, and validation actions are restricted to LGU Biomass Information Coordinators.
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 items-center bg-gray-50/50">
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by biomass type, source, or record ID..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {!isPlanningReadOnly && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter size={18} className="text-gray-400" />
                <select
                  className="block w-full sm:w-52 pl-3 pr-10 py-2 text-sm border-gray-200 focus:outline-none focus:ring-agri-green-500 focus:border-agri-green-500 rounded-lg"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="VALIDATION_QUEUE">Validation Queue (Submitted / Under Review)</option>
                  <option value={RecordStatus.SUBMITTED}>Submitted</option>
                  <option value={RecordStatus.UNDER_REVIEW}>Under Review</option>
                  <option value={RecordStatus.VALIDATED}>Validated</option>
                  <option value={RecordStatus.RETURNED}>Returned</option>
                  <option value={RecordStatus.REJECTED}>Rejected</option>
                  <option value={RecordStatus.STALE}>Stale</option>
                  <option value={RecordStatus.UNAVAILABLE}>Unavailable</option>
                </select>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-agri-earth-500 font-semibold tracking-wider">
                  <th className="px-5 py-4">Biomass Source & Type</th>
                  <th className="px-5 py-4">Quantity</th>
                  <th className="px-5 py-4">Availability</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Last Updated</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {isLoading && visibleRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                      Loading biomass records...
                    </td>
                  </tr>
                ) : visibleRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                      No records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  visibleRecords.map((record) => {
                    const type = referenceData.find((r) => r.id === record.biomassTypeId)?.label;
                    const source = getSource(record.sourceId);
                    const location = source ? getLocation(source.locationId) : getLocation(record.locationId);
                    const unit = referenceData.find((r) => r.id === record.originalUnit)?.label;

                    return (
                      <tr
                        key={record.id}
                        className="hover:bg-agri-green-50/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedRecordId(record.id)}
                      >
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-900">{type}</p>
                          <p className="text-xs text-agri-earth-500 mt-0.5">{source?.name}</p>
                          {location && <p className="text-xs text-agri-earth-400">{location.barangay}</p>}
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-semibold text-gray-900">{record.quantity.toLocaleString()}</span>
                          <span className="text-xs text-agri-earth-500 ml-1">{unit}</span>
                          {record.isTheoreticalEstimate && (
                            <span className="block text-[10px] text-yellow-600 font-medium uppercase mt-1">
                              Theoretical Est.
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-agri-earth-600 text-xs">
                          {record.availabilityPeriodStart && record.availabilityPeriodEnd
                            ? `${formatSafeDate(record.availabilityPeriodStart)} – ${formatSafeDate(record.availabilityPeriodEnd)}`
                            : record.availabilityPeriodStart
                            ? `From ${formatSafeDate(record.availabilityPeriodStart)}`
                            : record.availabilityPeriodEnd
                            ? `Until ${formatSafeDate(record.availabilityPeriodEnd)}`
                            : 'Immediate / Flexible'}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={record.status} />
                          {(() => {
                            const activeMember = aggregationMembers.find(
                              (m) => m.biomassRecordId === record.id && m.isActive
                            );
                            if (!activeMember) return null;
                            const group = aggregationGroups.find((g) => g.id === activeMember.groupId);
                            return (
                              <span
                                className="block mt-1 text-[10px] font-semibold text-agri-green-800 bg-agri-green-50 border border-agri-green-200 px-1.5 py-0.5 rounded truncate max-w-[150px]"
                                title={`Aggregated in: ${group?.name || activeMember.groupId}`}
                              >
                                Aggregated &bull; {group?.name || activeMember.groupId}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-4 text-agri-earth-500 text-xs">
                          {formatSafeDate(record.lastUpdatedDate)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecordId(record.id);
                            }}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Coordinator Source Management Modal */}
      {showSourcesModal && canRegisterSources && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl shadow-xl bg-white max-h-[85vh] flex flex-col">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg">Registered Biomass Sources</CardTitle>
                <CardDescription>
                  View or update farm, mill, and processor profiles managed by Coordinators.
                </CardDescription>
              </div>
              <button
                onClick={() => {
                  setShowSourcesModal(false);
                  setEditingSourceId(null);
                }}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </CardHeader>
            <CardContent className="p-5 overflow-y-auto space-y-4">
              {editingSourceId ? (
                <form onSubmit={handleSaveSourceEdit} className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <h4 className="font-semibold text-sm text-gray-900">Edit Source Profile</h4>
                  {sourceSaveError && (
                    <div className="text-xs text-red-700 bg-red-50 p-2.5 rounded border border-red-200">
                      {sourceSaveError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Source Name *</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                        value={editSourceName}
                        onChange={(e) => setEditSourceName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Source Type *</label>
                      <select
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                        value={editSourceType}
                        onChange={(e) => setEditSourceType(e.target.value)}
                      >
                        <option value="Farm">Farm</option>
                        <option value="Rice Mill">Rice Mill</option>
                        <option value="Coconut Processor">Coconut Processor</option>
                        <option value="Wood-based Establishment">Wood-based Establishment</option>
                        <option value="Agricultural Processor">Agricultural Processor</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Contact Person</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                        value={editSourceContact}
                        onChange={(e) => setEditSourceContact(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingSourceId(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" isLoading={isSavingSource}>
                      Save Source
                    </Button>
                  </div>
                </form>
              ) : null}

              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {sources.map((src) => {
                  const loc = getLocation(src.locationId);
                  return (
                    <div key={src.id} className="p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{src.name}</p>
                        <p className="text-xs text-gray-500">
                          {src.type} &bull; Brgy. {loc?.barangay || 'Unknown'} &bull; Contact: {src.contactPerson}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Edit3 size={13} />}
                        onClick={() => openEditSource(src.id)}
                      >
                        Edit
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
