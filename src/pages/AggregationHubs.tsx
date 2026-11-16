import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { RecordStatus, Role, AggregationGroup, AggregationStatus } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { hasPermission, Permission } from '../utils/rbac';
import { formatLocationHierarchy, formatShortLocation } from '../utils/philippineLocations';
import { Plus, Info, MapPin, ArrowLeft, AlertTriangle, Lock, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

const formatSafeShortDate = (iso?: string, fallback = 'Flexible') => {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : format(d, 'MMM d');
};

export const AggregationHubs: React.FC = () => {
  const { user } = useAuth();
  const {
    records,
    referenceData,
    aggregationGroups,
    aggregationMembers,
    isLoading,
    getBiomassTypes,
    getRecord,
    getSource,
    getLocation,
    getOrganization,
    getAggregationGroup,
    getAggregationMembers,
    addAggregationGroup,
  } = useData();

  const [view, setView] = useState<'LIST' | 'CREATE' | 'DETAIL'>('LIST');
  const [selectedGroup, setSelectedGroup] = useState<AggregationGroup | null>(null);

  // Form State
  const [formBiomassType, setFormBiomassType] = useState('');
  const [formName, setFormName] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const canCreateGroup = hasPermission(user.role, Permission.CREATE_AGGREGATION_GROUP);
  const isPlanningReadOnly = user.role === Role.LGU;

  // Coordinators and Planning Users view all information-based aggregation groups; Buyers only active ones.
  let visibleGroups = aggregationGroups;
  if (user.role === Role.BUYER) {
    visibleGroups = visibleGroups.filter((g) => g.status === AggregationStatus.ACTIVE);
  }

  const getGroupTotals = (groupId: string) => {
    const members = getAggregationMembers(groupId);
    let total = 0;
    let unit = '';
    let isMixed = false;
    let validCount = 0;

    members.forEach((m) => {
      const record = getRecord(m.biomassRecordId);
      if (record && record.status === RecordStatus.VALIDATED) {
        validCount++;
        const recordUnit = referenceData.find((r) => r.id === record.originalUnit)?.label || '';
        if (!unit) {
          unit = recordUnit;
        } else if (unit !== recordUnit) {
          isMixed = true;
        }
        total += record.remainingQuantity !== undefined ? record.remainingQuantity : record.quantity;
      }
    });

    return {
      total,
      unit: isMixed ? 'Mixed Units' : unit,
      isMixed,
      memberCount: members.length,
      validCount,
    };
  };

  const handleCreateSubmit = async () => {
    setFormError('');
    if (!canCreateGroup) {
      setFormError('Unauthorized: Only LGU Biomass Information Coordinators may create aggregation groups.');
      return;
    }

    if (!formBiomassType || !formName.trim() || selectedMembers.length === 0) {
      setFormError('Please complete Group Name, Biomass Type, and select at least one eligible member record.');
      return;
    }

    let unit = '';
    let isMixed = false;
    selectedMembers.forEach((id) => {
      const rec = getRecord(id);
      if (rec) {
        if (!unit) unit = rec.originalUnit;
        else if (unit !== rec.originalUnit) isMixed = true;
      }
    });

    if (isMixed) {
      setFormError('Cannot create group with mixed units. Please select records with identical units.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addAggregationGroup(
        formName.trim(),
        formBiomassType,
        undefined,
        selectedMembers,
        formNotes.trim() || undefined
      );
      setView('LIST');
      setFormBiomassType('');
      setFormName('');
      setFormNotes('');
      setSelectedMembers([]);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create aggregation group.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderList = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {isPlanningReadOnly ? 'Biomass Availability & Aggregation Summaries' : 'Biomass Aggregation'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Information-based coordination of compatible validated biomass records across sources.
          </p>
        </div>
        {canCreateGroup && (
          <Button icon={<Plus size={18} />} onClick={() => setView('CREATE')}>
            Create Aggregation Group
          </Button>
        )}
      </div>

      {isPlanningReadOnly && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 flex gap-3 text-blue-900 text-sm">
          <Eye className="shrink-0 mt-0.5 text-blue-700" size={18} />
          <p>
            <strong>Read-Only Planning View:</strong> Aggregation group creation and editing are managed exclusively by LGU Biomass Information Coordinators.
          </p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-blue-800 text-sm">
        <Info className="shrink-0 mt-0.5 text-blue-500" size={18} />
        <p>
          <strong>Information-Level Aggregation:</strong> Totals shown are aggregated from current eligible member
          records without double counting. This does <em>not</em> represent physically collected, transported, or
          warehoused biomass inventory.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading && visibleGroups.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 bg-gray-50 rounded-lg border border-gray-100">
            Loading aggregation groups...
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 bg-gray-50 rounded-lg border border-gray-100 border-dashed">
            No aggregation groups found.
          </div>
        ) : (
          visibleGroups.map((group) => {
            const biomassType = referenceData.find((r) => r.id === group.biomassTypeId)?.label;
            const legacyHub = group.hubId ? getOrganization(group.hubId)?.name : undefined;
            const totals = getGroupTotals(group.id);

            return (
              <Card key={group.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-600 rounded">
                      {group.id}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded ${
                        group.status === AggregationStatus.ACTIVE
                          ? 'bg-agri-green-100 text-agri-green-800'
                          : group.status === AggregationStatus.STALE
                          ? 'bg-purple-100 text-purple-800'
                          : group.status === AggregationStatus.NEEDS_UPDATE
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {group.status}
                    </span>
                  </div>

                  <h3 className="font-bold text-gray-900 text-lg mb-1">{group.name}</h3>
                  <p className="text-sm text-agri-earth-600 mb-4">
                    {biomassType} &bull; {legacyHub || 'Information-Based Consolidation'}
                  </p>

                  <div className="bg-gray-50 rounded-md p-3 mb-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Member Sources:</span>
                      <span className="font-medium text-gray-900">
                        {totals.memberCount} ({totals.validCount} Validated)
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Eligible Total:</span>
                      <span className="font-semibold text-agri-green-700">
                        {totals.isMixed ? 'Mixed Units' : `${totals.total.toLocaleString()} ${totals.unit}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center gap-2">
                    <p className="text-xs text-gray-400">Updated {format(new Date(group.updatedAt), 'MMM d')}</p>
                    <div className="flex gap-2">
                      <Link to={`/map?groupId=${group.id}`}>
                        <Button variant="outline" size="sm" icon={<MapPin size={14} />}>
                          Map
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedGroup(group);
                          setView('DETAIL');
                        }}
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );

  const renderCreate = () => {
    if (!canCreateGroup) {
      return renderList();
    }

    const activeMemberMap = new Map<string, { groupId: string; addedAt: string }>();
    aggregationMembers
      .filter((m) => m.isActive)
      .forEach((m) => {
        activeMemberMap.set(m.biomassRecordId, { groupId: m.groupId, addedAt: m.addedAt });
      });

    const eligibleRecords = records.filter(
      (r) =>
        r.status === RecordStatus.VALIDATED &&
        (!formBiomassType || r.biomassTypeId === formBiomassType) &&
        !activeMemberMap.has(r.id)
    );

    const aggregatedRecords = records.filter(
      (r) => (!formBiomassType || r.biomassTypeId === formBiomassType) && activeMemberMap.has(r.id)
    );

    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setView('LIST');
              setFormError('');
            }}
            className="p-2 -ml-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Create Information Aggregation Group</h2>
            <p className="text-sm text-agri-earth-500 mt-1">
              Consolidate compatible validated records into an information-based group without physical warehousing.
            </p>
          </div>
        </div>

        {formError && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm flex items-center gap-2 border border-red-200">
            <AlertTriangle size={18} /> {formError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>1. Grouping Criteria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  placeholder="e.g. Regional Rice Husk Consolidation Batch A"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Biomass Type (Filters eligible records) *
                </label>
                <select
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                  value={formBiomassType}
                  onChange={(e) => {
                    setFormBiomassType(e.target.value);
                    setSelectedMembers([]);
                  }}
                >
                  <option value="">Select Biomass Type...</option>
                  {getBiomassTypes().map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {bt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Coordination Notes (Optional)</label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  placeholder="e.g. Consolidated validated rice husk sources across participating barangays"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>2. Select Eligible Members</CardTitle>
                <CardDescription>
                  Only VALIDATED, unaggregated records matching the selected Biomass Type are selectable.
                </CardDescription>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 bg-agri-green-100 text-agri-green-800 rounded-full">
                {eligibleRecords.length} Available
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {!formBiomassType ? (
              <p className="text-sm text-gray-500 py-4 text-center">Please select a Biomass Type above.</p>
            ) : eligibleRecords.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                No unaggregated validated records found for this type.
              </p>
            ) : (
              <div className="space-y-2">
                {eligibleRecords.map((record) => {
                  const source = getSource(record.sourceId);
                  const location = source ? getLocation(source.locationId) : getLocation(record.locationId);
                  const unit = referenceData.find((u) => u.id === record.originalUnit)?.label;
                  const isSelected = selectedMembers.includes(record.id);
                  const availQty = record.remainingQuantity !== undefined ? record.remainingQuantity : record.quantity;

                  return (
                    <label
                      key={record.id}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'border-agri-green-500 bg-agri-green-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0 text-agri-green-600 focus:ring-agri-green-500"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedMembers([...selectedMembers, record.id]);
                          else setSelectedMembers(selectedMembers.filter((id) => id !== record.id));
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <p className="font-semibold text-gray-900">{source?.name}</p>
                          <p className="font-bold text-agri-green-700">
                            {availQty.toLocaleString()}{' '}
                            <span className="text-xs font-normal text-gray-500">{unit}</span>
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatShortLocation(location)} &bull; Avail:{' '}
                          {record.availabilityPeriodStart && record.availabilityPeriodEnd
                            ? `${formatSafeShortDate(record.availabilityPeriodStart)} - ${formatSafeShortDate(record.availabilityPeriodEnd)}`
                            : record.availabilityPeriodStart
                            ? `From ${formatSafeShortDate(record.availabilityPeriodStart)}`
                            : 'Flexible'}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-gray-50/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-gray-700 flex items-center gap-2">
                  <Lock size={16} className="text-gray-400" />
                  3. Already Aggregated Records (Not Selectable)
                </CardTitle>
                <CardDescription className="text-xs text-gray-500">
                  These records are already committed to an active aggregation group and cannot be added to another group.
                </CardDescription>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 bg-gray-200 text-gray-700 rounded-full">
                {aggregatedRecords.length} Consolidated
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {!formBiomassType ? (
              <p className="text-sm text-gray-400 py-3 text-center">
                Select a Biomass Type above to view already-aggregated records.
              </p>
            ) : aggregatedRecords.length === 0 ? (
              <p className="text-sm text-gray-500 py-3 text-center">
                No biomass records of this type are currently aggregated.
              </p>
            ) : (
              <div className="space-y-2">
                {aggregatedRecords.map((record) => {
                  const source = getSource(record.sourceId);
                  const location = source ? getLocation(source.locationId) : getLocation(record.locationId);
                  const unit = referenceData.find((u) => u.id === record.originalUnit)?.label;
                  const membership = activeMemberMap.get(record.id);
                  const parentGroup = membership ? getAggregationGroup(membership.groupId) : undefined;
                  const availQty = record.remainingQuantity !== undefined ? record.remainingQuantity : record.quantity;

                  return (
                    <div
                      key={record.id}
                      className="flex items-start gap-3 p-3 border border-gray-200 bg-white/90 rounded-lg select-none"
                    >
                      <div
                        className="mt-1 shrink-0 p-1 bg-gray-100 rounded text-gray-400"
                        title="Locked: already member of an active group"
                      >
                        <Lock size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-700 text-sm">{source?.name}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 bg-agri-green-100 text-agri-green-800 rounded border border-agri-green-200">
                              Aggregated &bull; {parentGroup?.name || `Group ${membership?.groupId}`}
                            </span>
                          </div>
                          <p className="font-bold text-gray-600 text-sm">
                            {availQty.toLocaleString()} <span className="text-xs font-normal text-gray-500">{unit}</span>
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-1">
                          <span>{formatShortLocation(location)}</span>
                          <span>&bull;</span>
                          <span>Record ID: {record.id}</span>
                          {membership?.addedAt && (
                            <>
                              <span>&bull;</span>
                              <span>Added {format(new Date(membership.addedAt), 'MMM d, yyyy')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => setView('LIST')}>
            Cancel
          </Button>
          <Button onClick={handleCreateSubmit} disabled={selectedMembers.length === 0} isLoading={isSubmitting}>
            Create Group
          </Button>
        </div>
      </div>
    );
  };

  const renderDetail = () => {
    if (!selectedGroup) return null;
    const totals = getGroupTotals(selectedGroup.id);
    const legacyHub = selectedGroup.hubId ? getOrganization(selectedGroup.hubId) : undefined;
    const type = referenceData.find((r) => r.id === selectedGroup.biomassTypeId);
    const members = getAggregationMembers(selectedGroup.id);

    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setView('LIST');
                setSelectedGroup(null);
              }}
              className="p-2 -ml-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{selectedGroup.name}</h2>
                <span className="text-xs font-semibold px-2 py-1 bg-agri-green-100 text-agri-green-800 rounded">
                  {selectedGroup.status}
                </span>
              </div>
              <p className="text-sm text-agri-earth-500 mt-1">
                {selectedGroup.id} &bull; {legacyHub?.name || 'Information-Based Consolidation'}
              </p>
            </div>
          </div>
          <Link to={`/map?groupId=${selectedGroup.id}`}>
            <Button variant="outline" icon={<MapPin size={18} />}>
              View on Map
            </Button>
          </Link>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3 text-yellow-800 text-sm">
          <Info className="shrink-0 mt-0.5 text-yellow-600" size={18} />
          <p>
            <strong>Disclaimer:</strong> This group total is derived dynamically from current eligible member records.
            It does not represent physically collected or stored biomass inventory.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1 border-none shadow-md bg-agri-green-600 text-white">
            <CardContent className="p-6">
              <p className="text-agri-green-100 text-sm font-medium mb-1">Current Eligible Reported Total</p>
              <p className="text-4xl font-bold mb-2">
                {totals.isMixed ? 'Mixed Units' : totals.total.toLocaleString()}
                {!totals.isMixed && <span className="text-lg font-normal ml-1 opacity-80">{totals.unit}</span>}
              </p>
              <div className="mt-6 space-y-2 text-sm text-agri-green-50">
                <p className="flex justify-between border-b border-agri-green-500 pb-1">
                  <span>Biomass Type</span> <span className="font-semibold text-white">{type?.label}</span>
                </p>
                <p className="flex justify-between border-b border-agri-green-500 pb-1">
                  <span>Member Sources</span> <span className="font-semibold text-white">{totals.memberCount}</span>
                </p>
                <p className="flex justify-between border-b border-agri-green-500 pb-1">
                  <span>Validated Status</span>{' '}
                  <span className="font-semibold text-white">
                    {totals.validCount} / {totals.memberCount} Valid
                  </span>
                </p>
                <p className="flex justify-between pt-1">
                  <span>Last Updated</span>{' '}
                  <span className="font-semibold text-white">
                    {format(new Date(selectedGroup.updatedAt), 'MMM d, yyyy')}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Member Records</CardTitle>
              <CardDescription>Original source quantities and validation statuses are preserved.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500">
                      <th className="pb-3 font-medium">Source / Location</th>
                      <th className="pb-3 font-medium">Available Qty</th>
                      <th className="pb-3 font-medium">Availability</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {members.map((m) => {
                      const record = getRecord(m.biomassRecordId);
                      if (!record) return null;
                      const source = getSource(record.sourceId);
                      const loc = source ? getLocation(source.locationId) : getLocation(record.locationId);
                      const unit = referenceData.find((u) => u.id === record.originalUnit)?.label;
                      const availQty =
                        record.remainingQuantity !== undefined ? record.remainingQuantity : record.quantity;
                      const isValidated = record.status === RecordStatus.VALIDATED;

                      return (
                        <tr key={m.id} className={isValidated ? '' : 'bg-red-50/50 opacity-75'}>
                          <td className="py-3">
                            <p className="font-medium text-gray-900">{source?.name}</p>
                            <p className="text-xs text-gray-500">{formatLocationHierarchy(loc)}</p>
                          </td>
                          <td className="py-3">
                            <span className="font-semibold text-gray-900">{availQty.toLocaleString()}</span>
                            <span className="text-xs text-gray-500 ml-1">{unit}</span>
                          </td>
                          <td className="py-3 text-xs text-gray-600">
                            {record.availabilityPeriodStart && record.availabilityPeriodEnd
                              ? `${formatSafeShortDate(record.availabilityPeriodStart)} - ${formatSafeShortDate(record.availabilityPeriodEnd)}`
                              : record.availabilityPeriodStart
                              ? `From ${formatSafeShortDate(record.availabilityPeriodStart)}`
                              : 'Flexible'}
                          </td>
                          <td className="py-3">
                            <StatusBadge status={record.status} />
                            {!isValidated && (
                              <p className="text-[10px] text-red-600 mt-1 font-medium max-w-[120px] leading-tight">
                                Member status changed. Group total impacted.
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-10">
      {view === 'LIST' && renderList()}
      {view === 'CREATE' && renderCreate()}
      {view === 'DETAIL' && renderDetail()}
    </div>
  );
};
