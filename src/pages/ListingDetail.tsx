import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { BiomassRecord, AggregationGroup, RecordStatus } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { ArrowLeft, MapPin, Send, AlertTriangle, Lock } from 'lucide-react';
import { format } from 'date-fns';

export const ListingDetail: React.FC = () => {
  const { type, id } = useParams<{ type: 'record' | 'group'; id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    referenceData,
    aggregationMembers,
    getRecord,
    getSource,
    getLocation,
    getOrganization,
    getAggregationGroup,
    getAggregationMembers,
    addInquiry,
  } = useData();

  const [showInquiryForm, setShowInquiryForm] = useState(false);
  const [inquiryQty, setInquiryQty] = useState<number | ''>('');
  const [inquiryUse, setInquiryUse] = useState('');
  const [inquiryPeriod, setInquiryPeriod] = useState('');
  const [collectionDate, setCollectionDate] = useState('');
  const [pickupTime, setPickupTime] = useState('09:00');
  const [inquiryNotes, setInquiryNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user || !id || !type) return null;

  const record: BiomassRecord | undefined = type === 'record' ? getRecord(id) : undefined;
  const group: AggregationGroup | undefined = type === 'group' ? getAggregationGroup(id) : undefined;

  // Check if this individual record is consolidated into an active aggregation group
  const activeAggregationMembership =
    type === 'record' && record
      ? aggregationMembers.find((m) => m.biomassRecordId === record.id && m.isActive)
      : undefined;
  const parentAggregationGroup = activeAggregationMembership
    ? getAggregationGroup(activeAggregationMembership.groupId)
    : undefined;

  if (!record && !group) {
    return <div className="text-center py-10">Listing no longer available.</div>;
  }

  // Warning for stale records
  const isStale =
    (type === 'record' && record?.status === RecordStatus.STALE) ||
    (type === 'group' && group?.status === 'STALE');

  const handleSubmitInquiry = async () => {
    setFormError('');
    if (type === 'record' && parentAggregationGroup) {
      setFormError('This biomass record is consolidated into an aggregation group and cannot receive independent buyer inquiries.');
      return;
    }

    if (!inquiryQty || isNaN(Number(inquiryQty)) || Number(inquiryQty) <= 0) {
      setFormError('Please enter a valid requested quantity.');
      return;
    }

    const biomassTypeId = type === 'record' ? record!.biomassTypeId : group!.biomassTypeId;
    let requestedUnitId = 'ref-unit-1';
    if (type === 'record' && record) {
      requestedUnitId = record.originalUnit;
    } else if (type === 'group' && group) {
      const members = getAggregationMembers(group.id);
      const firstMemberRecord = members.length > 0 ? getRecord(members[0].biomassRecordId) : undefined;
      if (firstMemberRecord) {
        requestedUnitId = firstMemberRecord.originalUnit;
      }
    }

    const schedulingNote = collectionDate
      ? `[Preferred Collection Date: ${collectionDate}, Time: ${pickupTime || 'Flexible'}]`
      : '';
    const combinedRequirements = [schedulingNote, inquiryNotes.trim()].filter(Boolean).join('\n');

    setIsSubmitting(true);
    try {
      await addInquiry({
        targetType: type === 'record' ? 'RECORD' : 'GROUP',
        targetId: id,
        biomassTypeId,
        requestedQuantity: Number(inquiryQty),
        requestedUnit: requestedUnitId,
        intendedUse: inquiryUse.trim() || undefined,
        preferredAvailabilityPeriod: inquiryPeriod.trim() || undefined,
        preferredCollectionDate: collectionDate || undefined,
        preferredPickupTime: pickupTime || undefined,
        additionalRequirements: combinedRequirements || undefined,
      });
      navigate('/inquiries');
    } catch (err: any) {
      setFormError(err?.message || 'Failed to submit inquiry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBiomassInfo = () => {
    if (type === 'record' && record) {
      const typeLabel = referenceData.find((r) => r.id === record.biomassTypeId)?.label;
      const unit = referenceData.find((r) => r.id === record.originalUnit)?.label;
      const source = getSource(record.sourceId);
      const location = source ? getLocation(source.locationId) : getLocation(record.locationId);
      const coop = source?.cooperativeId ? getOrganization(source.cooperativeId) : undefined;
      const availQty = record.remainingQuantity !== undefined ? record.remainingQuantity : record.quantity;

      return (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Biomass Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Biomass Type</p>
                <p className="font-semibold">{typeLabel}</p>
              </div>
              <div>
                <p className="text-gray-500">Available Quantity</p>
                <p className="font-semibold text-agri-green-700">
                  {availQty.toLocaleString()} {unit}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Condition & Storage</p>
                <p className="font-medium">
                  {record.condition} ({record.storage})
                </p>
              </div>
              <div>
                <p className="text-gray-500">Current Use</p>
                <p className="font-medium">{record.currentUse}</p>
              </div>
              <div>
                <p className="text-gray-500">Availability Period</p>
                <p className="font-medium">
                  {record.availabilityPeriodStart && record.availabilityPeriodEnd
                    ? `${format(new Date(record.availabilityPeriodStart), 'MMM d, yyyy')} - ${format(new Date(record.availabilityPeriodEnd), 'MMM d, yyyy')}`
                    : record.availabilityPeriodStart
                    ? `From ${format(new Date(record.availabilityPeriodStart), 'MMM d, yyyy')} (Flexible)`
                    : 'Immediate & Flexible'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Validation Status</p>
                <div className="mt-1">
                  <StatusBadge status={record.status} />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold mb-1 text-gray-900">Biomass Source Location</h4>
                <p className="text-sm font-medium text-gray-800">
                  {source?.name} ({source?.type})
                </p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                  <MapPin size={13} className="text-agri-green-600 shrink-0" /> {location?.barangay}, {location?.city}
                </p>
                {record.accessLocationNotes && (
                  <p className="text-xs text-gray-500 mt-1 italic">
                    Access: {record.accessLocationNotes}
                  </p>
                )}
              </div>
              {coop && (
                <div>
                  <h4 className="text-sm font-semibold mb-1 text-gray-900">Cooperative / Hub Office</h4>
                  <p className="text-sm font-medium text-gray-800">{coop.name}</p>
                  {coop.officeAddress && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin size={13} className="text-blue-600 shrink-0" /> {coop.officeAddress}
                    </p>
                  )}
                  {coop.contactPhone && (
                    <p className="text-xs text-gray-500 mt-0.5">Phone: {coop.contactPhone}</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }

    if (type === 'group' && group) {
      const typeLabel = referenceData.find((r) => r.id === group.biomassTypeId)?.label;
      const hub = getOrganization(group.hubId);
      const members = getAggregationMembers(group.id);

      let total = 0;
      let unit = '';
      let isMixed = false;

      members.forEach((m) => {
        const r = getRecord(m.biomassRecordId);
        if (r && r.status === RecordStatus.VALIDATED) {
          const rUnit = referenceData.find((ref) => ref.id === r.originalUnit)?.label || '';
          if (!unit) unit = rUnit;
          else if (unit !== rUnit) isMixed = true;
          total += r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity;
        }
      });

      return (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Aggregation Group Information</CardTitle>
            <CardDescription>
              Aggregation indicates that compatible biomass records have been grouped in the system. It does not confirm
              that the materials have been physically collected or stored together.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Biomass Type</p>
                <p className="font-semibold">{typeLabel}</p>
              </div>
              <div>
                <p className="text-gray-500">Reported Group Quantity</p>
                <p className="font-semibold text-agri-green-700">
                  {isMixed ? 'Mixed Units' : `${total.toLocaleString()} ${unit}`}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Member Count</p>
                <p className="font-medium">{members.length} Sources</p>
              </div>
              <div>
                <p className="text-gray-500">Hub / Cooperative</p>
                <p className="font-medium">{hub?.name}</p>
              </div>
              <div>
                <p className="text-gray-500">Group Status</p>
                <p className="font-medium mt-1">
                  <span className="text-xs font-semibold px-2 py-1 bg-agri-green-100 text-agri-green-800 rounded">
                    {group.status}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto pb-10 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Listing Details</h2>
        </div>
      </div>

      {isStale && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex gap-3 text-purple-800 text-sm">
          <AlertTriangle className="shrink-0 mt-0.5 text-purple-600" size={18} />
          <p>
            <strong>STALE —</strong> Availability should be revalidated before relying on this information. The
            underlying record has not been updated recently.
          </p>
        </div>
      )}

      {parentAggregationGroup && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 text-sm shadow-sm">
          <div className="flex items-start gap-3">
            <Lock className="shrink-0 mt-0.5 text-amber-600" size={18} />
            <div>
              <p className="font-semibold text-amber-900">
                Consolidated into Aggregation Group: {parentAggregationGroup.name}
              </p>
              <p className="text-amber-700 text-xs mt-0.5">
                This biomass record has been consolidated into an active aggregation group and is no longer available as an independent listing.
                Individual buyer inquiries on this record are closed.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/listings/group/${parentAggregationGroup.id}`)}
            className="border-amber-400 text-amber-900 hover:bg-amber-100 shrink-0 font-medium"
          >
            View Group Listing
          </Button>
        </div>
      )}

      {renderBiomassInfo()}

      {parentAggregationGroup ? (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-600">
          Independent inquiries are disabled because this biomass record is part of{' '}
          <button
            onClick={() => navigate(`/listings/group/${parentAggregationGroup.id}`)}
            className="text-agri-green-700 font-semibold underline hover:text-agri-green-800"
          >
            {parentAggregationGroup.name}
          </button>. Please submit your inquiry through the group listing.
        </div>
      ) : !showInquiryForm ? (
        <div className="flex justify-end">
          <Button onClick={() => setShowInquiryForm(true)} icon={<Send size={16} />}>
            Submit Inquiry
          </Button>
        </div>
      ) : (
        <Card className="border-agri-green-200 shadow-md">
          <CardHeader className="bg-agri-green-50/50 border-b border-agri-green-100">
            <CardTitle>Submit Inquiry</CardTitle>
            <CardDescription className="text-agri-earth-600 font-medium">
              Non-binding market linkage coordination inquiry. This does not constitute a purchase, contract, payment,
              or delivery agreement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {formError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">{formError}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Requested Quantity *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  value={inquiryQty}
                  onChange={(e) => setInquiryQty(e.target.value ? Number(e.target.value) : '')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Intended Use (Optional)</label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  placeholder="e.g. Organic Fertilizer, Biomass Fuel, Biochar"
                  value={inquiryUse}
                  onChange={(e) => setInquiryUse(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred Collection Date (Optional)
                </label>
                <input
                  type="date"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred Pickup Time Window (Optional)
                </label>
                <input
                  type="time"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred Availability / Collection Timeline Notes (Optional)
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  placeholder="e.g. Within next 2 weeks, Weekdays morning only"
                  value={inquiryPeriod}
                  onChange={(e) => setInquiryPeriod(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Requirements</label>
                <textarea
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 h-20"
                  placeholder="Any logistics requirements, hauling vehicle specifications, or packaging needs..."
                  value={inquiryNotes}
                  onChange={(e) => setInquiryNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
              <strong>Notice:</strong> Preferred collection date and pickup time are <strong>scheduling preferences, not confirmed appointments</strong>. Submitting an inquiry does not automatically reserve stock, guarantee inventory, or create a binding commercial contract.
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setShowInquiryForm(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitInquiry} icon={<Send size={16} />} isLoading={isSubmitting}>
                Submit Inquiry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
