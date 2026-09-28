import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { InquiryStatus, BiomassRecord, AggregationGroup, RecordStatus, Inquiry } from '../types';
import { db } from '../store/mockDb';
import { useAuth } from '../store/AuthContext';
import { ArrowLeft, Info, MapPin, Send, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export const ListingDetail: React.FC = () => {
  const { type, id } = useParams<{ type: 'record' | 'group', id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [showInquiryForm, setShowInquiryForm] = useState(false);
  const [inquiryQty, setInquiryQty] = useState<number | ''>('');
  const [inquiryUse, setInquiryUse] = useState('');
  const [inquiryNotes, setInquiryNotes] = useState('');
  const [formError, setFormError] = useState('');

  if (!user || !id || !type) return null;

  const record: BiomassRecord | undefined = type === 'record' ? db.getRecord(id) : undefined;
  const group: AggregationGroup | undefined = type === 'group' ? db.getAggregationGroup(id) : undefined;

  if (!record && !group) {
    return <div className="text-center py-10">Listing no longer available.</div>;
  }

  // Warning for stale records
  const isStale = (type === 'record' && record?.status === RecordStatus.STALE) || 
                  (type === 'group' && group?.status === 'STALE');

  const handleSubmitInquiry = () => {
    if (!inquiryQty || isNaN(Number(inquiryQty)) || Number(inquiryQty) <= 0) {
      setFormError('Please enter a valid requested quantity.');
      return;
    }

    const biomassTypeId = type === 'record' ? record!.biomassTypeId : group!.biomassTypeId;
    const requestedUnitId = type === 'record' ? record!.originalUnit : 'ref-unit-1'; // Simplified for group

    const newInquiry: Inquiry = {
      id: `INQ-${Math.floor(Math.random() * 10000)}`,
      buyerUserId: user.id,
      targetType: type === 'record' ? 'RECORD' : 'GROUP',
      targetId: id,
      biomassTypeId,
      requestedQuantity: Number(inquiryQty),
      requestedUnit: requestedUnitId,
      intendedUse: inquiryUse,
      additionalRequirements: inquiryNotes,
      status: InquiryStatus.SUBMITTED,
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [
        {
          id: `inqh-${Date.now()}`,
          inquiryId: '', // Will be updated on creation if needed, but it's generated here
          newStatus: InquiryStatus.SUBMITTED,
          changedBy: user.id,
          changedAt: new Date().toISOString()
        }
      ]
    };
    newInquiry.history[0].inquiryId = newInquiry.id;

    db.addInquiry(newInquiry, user.id);
    navigate('/inquiries');
  };

  const renderBiomassInfo = () => {
    if (type === 'record' && record) {
      const typeLabel = db.referenceData.find(r => r.id === record.biomassTypeId)?.label;
      const unit = db.referenceData.find(r => r.id === record.originalUnit)?.label;
      const source = db.getSource(record.sourceId);
      const location = source ? db.getLocation(source.locationId) : null;

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
                <p className="text-gray-500">Reported Quantity</p>
                <p className="font-semibold text-agri-green-700">{record.quantity.toLocaleString()} {unit}</p>
              </div>
              <div>
                <p className="text-gray-500">Condition</p>
                <p className="font-medium">{record.condition}</p>
              </div>
              <div>
                <p className="text-gray-500">Current Use</p>
                <p className="font-medium">{record.currentUse}</p>
              </div>
              <div>
                <p className="text-gray-500">Availability Period</p>
                <p className="font-medium">
                  {format(new Date(record.availabilityPeriodStart), 'MMM d, yyyy')} - {format(new Date(record.availabilityPeriodEnd), 'MMM d, yyyy')}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Validation Status</p>
                <div className="mt-1"><StatusBadge status={record.status} /></div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-gray-100 mt-4">
              <h4 className="text-sm font-semibold mb-2">Source Information</h4>
              <p className="text-sm">{source?.name} ({source?.type})</p>
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin size={14} /> {location?.barangay}, {location?.city}
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (type === 'group' && group) {
      const typeLabel = db.referenceData.find(r => r.id === group.biomassTypeId)?.label;
      const hub = db.getOrganization(group.hubId);
      const members = db.getAggregationMembers(group.id);
      
      let total = 0;
      let unit = '';
      let isMixed = false;

      members.forEach(m => {
        const r = db.getRecord(m.biomassRecordId);
        if (r && r.status === RecordStatus.VALIDATED) {
          const rUnit = db.referenceData.find(ref => ref.id === r.originalUnit)?.label || '';
          if (!unit) unit = rUnit;
          else if (unit !== rUnit) isMixed = true;
          total += r.quantity;
        }
      });

      return (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Aggregation Group Information</CardTitle>
            <CardDescription>
              Aggregation indicates that compatible biomass records have been grouped in the system. 
              It does not confirm that the materials have been physically collected or stored together.
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
            <strong>STALE —</strong> Availability should be revalidated before relying on this information. 
            The underlying record has not been updated recently.
          </p>
        </div>
      )}

      {renderBiomassInfo()}

      {!showInquiryForm ? (
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
              Your inquiry has been submitted. This does not constitute a purchase, contract, payment, or delivery agreement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {formError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{formError}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Requested Quantity</label>
                <input
                  type="number"
                  min="1"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  value={inquiryQty}
                  onChange={e => setInquiryQty(e.target.value ? Number(e.target.value) : '')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Intended Use (Optional)</label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  placeholder="e.g. Fertilizer, Fuel"
                  value={inquiryUse}
                  onChange={e => setInquiryUse(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                <textarea
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 h-24"
                  placeholder="Any specific requirements or preferred collection timeline..."
                  value={inquiryNotes}
                  onChange={e => setInquiryNotes(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setShowInquiryForm(false)}>Cancel</Button>
              <Button onClick={handleSubmitInquiry} icon={<Send size={16} />}>
                Submit Non-Binding Inquiry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
};
