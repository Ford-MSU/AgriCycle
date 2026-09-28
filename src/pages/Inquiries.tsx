import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Role, InquiryStatus, Inquiry } from '../types';
import { db } from '../store/mockDb';
import { useAuth } from '../store/AuthContext';
import { Search, Filter, MessageSquare, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

const StatusBadgeInquiry: React.FC<{ status: InquiryStatus }> = ({ status }) => {
  let styles = 'bg-gray-100 text-gray-800';
  if (status === InquiryStatus.SUBMITTED) styles = 'bg-blue-100 text-blue-800';
  if (status === InquiryStatus.UNDER_REVIEW) styles = 'bg-yellow-100 text-yellow-800';
  if (status === InquiryStatus.RESPONDED || status === InquiryStatus.FOLLOW_UP) styles = 'bg-agri-green-100 text-agri-green-800';
  if (status === InquiryStatus.CLOSED) styles = 'bg-gray-200 text-gray-600';
  if (status === InquiryStatus.WITHDRAWN || status === InquiryStatus.NO_LONGER_AVAILABLE || status === InquiryStatus.EXPIRED) styles = 'bg-red-100 text-red-800';

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles} uppercase tracking-wider`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export const Inquiries: React.FC = () => {
  const { user } = useAuth();
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [responseNote, setResponseNote] = useState('');
  const [newStatus, setNewStatus] = useState<InquiryStatus | ''>('');

  if (!user) return null;

  // Retrieve inquiries based on role
  let visibleInquiries = db.inquiries;
  if (user.role === Role.BUYER) {
    visibleInquiries = visibleInquiries.filter(i => i.buyerUserId === user.id);
  } else if (user.role === Role.COORDINATOR) {
    // Basic mock logic: Coordinator sees inquiries for records they submitted or their hub's groups
    visibleInquiries = visibleInquiries.filter(i => {
      if (i.targetType === 'RECORD') {
        const rec = db.getRecord(i.targetId);
        return rec?.submitterId === user.id || rec?.sourceId.includes('coop');
      } else {
        const group = db.getAggregationGroup(i.targetId);
        return group?.createdBy === user.id || group?.hubId === 'org-2';
      }
    });
  }

  const handleUpdateStatus = () => {
    if (!selectedInquiry || !newStatus) return;
    db.updateInquiryStatus(selectedInquiry.id, newStatus as InquiryStatus, user.id, responseNote);
    setResponseNote('');
    setNewStatus('');
    // Refresh selected inquiry ref
    setSelectedInquiry(db.inquiries.find(i => i.id === selectedInquiry.id) || null);
  };

  const getTargetTitle = (inq: Inquiry) => {
    const typeLabel = db.referenceData.find(r => r.id === inq.biomassTypeId)?.label;
    if (inq.targetType === 'RECORD') {
      const rec = db.getRecord(inq.targetId);
      const source = rec ? db.getSource(rec.sourceId) : null;
      return `${typeLabel} - ${source?.name || 'Unknown Source'}`;
    } else {
      const group = db.getAggregationGroup(inq.targetId);
      return `${typeLabel} - ${group?.name || 'Unknown Group'}`;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {user.role === Role.BUYER ? 'My Inquiries' : 'Manage Inquiries'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Track and manage market linkage communication.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 border border-gray-200 bg-white rounded-xl overflow-hidden h-[600px] flex flex-col">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-semibold text-gray-900">Inquiry List</h3>
          </div>
          <div className="overflow-y-auto flex-1">
            {visibleInquiries.length === 0 ? (
              <p className="text-sm text-gray-500 p-6 text-center">No inquiries found.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visibleInquiries.map(inq => (
                  <li 
                    key={inq.id} 
                    className={`p-4 cursor-pointer hover:bg-agri-green-50/50 transition-colors ${selectedInquiry?.id === inq.id ? 'bg-agri-green-50 border-l-4 border-agri-green-500' : 'border-l-4 border-transparent'}`}
                    onClick={() => setSelectedInquiry(inq)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-semibold text-gray-500">{inq.id}</span>
                      <StatusBadgeInquiry status={inq.status} />
                    </div>
                    <p className="font-medium text-sm text-gray-900 line-clamp-1">{getTargetTitle(inq)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Req: {inq.requestedQuantity.toLocaleString()} {db.referenceData.find(r => r.id === inq.requestedUnit)?.label}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                      <Clock size={10} /> {format(new Date(inq.updatedAt), 'MMM d, yyyy')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {!selectedInquiry ? (
            <Card className="h-[600px] flex items-center justify-center bg-gray-50/50 border-dashed">
              <div className="text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                <h3 className="text-lg font-medium text-gray-900">Select an Inquiry</h3>
                <p className="text-sm text-gray-500">Choose an inquiry from the list to view details and history.</p>
              </div>
            </Card>
          ) : (
            <Card className="h-auto min-h-[600px] flex flex-col">
              <CardHeader className="border-b border-gray-100 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {selectedInquiry.id} 
                      <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        Target: {selectedInquiry.targetType}
                      </span>
                    </CardTitle>
                    <CardDescription className="text-base text-gray-900 font-medium mt-2">
                      {getTargetTitle(selectedInquiry)}
                    </CardDescription>
                  </div>
                  <StatusBadgeInquiry status={selectedInquiry.status} />
                </div>
                
                {(() => {
                  let warning = null;
                  if (selectedInquiry.targetType === 'RECORD') {
                    const rec = db.getRecord(selectedInquiry.targetId);
                    if (rec && (rec.status === 'UNAVAILABLE' || rec.status === 'STALE')) {
                      warning = `Notice: The linked biomass record is currently marked as ${rec.status}. This material may no longer be available.`;
                    }
                  } else if (selectedInquiry.targetType === 'GROUP') {
                    const group = db.getAggregationGroup(selectedInquiry.targetId);
                    if (group && (group.status === 'UNAVAILABLE' || group.status === 'STALE')) {
                       warning = `Notice: The linked aggregation group is currently marked as ${group.status}. This material may no longer be available.`;
                    }
                  }
                  
                  if (warning) {
                    return (
                      <div className="mt-4 bg-orange-50 border border-orange-200 text-orange-800 text-sm p-3 rounded-md flex items-start gap-2">
                         <span className="font-bold">⚠️</span> {warning}
                      </div>
                    );
                  }
                  return null;
                })()}
              </CardHeader>
              
              <CardContent className="p-0 flex-1 flex flex-col">
                <div className="p-5 grid grid-cols-2 gap-y-4 gap-x-6 text-sm border-b border-gray-100">
                  <div>
                    <span className="text-gray-500 block text-xs">Requested Quantity</span>
                    <span className="font-semibold">
                      {selectedInquiry.requestedQuantity.toLocaleString()} {db.referenceData.find(r => r.id === selectedInquiry.requestedUnit)?.label}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Submitted At</span>
                    <span>{format(new Date(selectedInquiry.submittedAt), 'MMM d, yyyy HH:mm')}</span>
                  </div>
                  {selectedInquiry.intendedUse && (
                    <div className="col-span-2">
                      <span className="text-gray-500 block text-xs">Intended Use</span>
                      <span>{selectedInquiry.intendedUse}</span>
                    </div>
                  )}
                  {selectedInquiry.additionalRequirements && (
                    <div className="col-span-2">
                      <span className="text-gray-500 block text-xs">Notes/Requirements</span>
                      <p className="whitespace-pre-wrap mt-1 text-gray-700 bg-gray-50 p-3 rounded-md">{selectedInquiry.additionalRequirements}</p>
                    </div>
                  )}
                </div>

                <div className="flex-1 p-5 overflow-y-auto bg-gray-50">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4">Timeline & Updates</h4>
                  <div className="space-y-6">
                    {selectedInquiry.history.map((hist, idx) => (
                      <div key={hist.id} className="relative pl-6">
                        {idx !== selectedInquiry.history.length - 1 && (
                          <div className="absolute left-2.5 top-5 bottom-[-24px] w-px bg-gray-200" />
                        )}
                        <div className="absolute left-1 top-1 w-3 h-3 rounded-full bg-agri-green-500 ring-4 ring-gray-50" />
                        <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-xs font-semibold text-gray-900">
                              Status changed to <span className="text-agri-green-700">{hist.newStatus.replace(/_/g, ' ')}</span>
                            </p>
                            <span className="text-[10px] text-gray-400">{format(new Date(hist.changedAt), 'MMM d, HH:mm')}</span>
                          </div>
                          {hist.notes && (
                            <p className="text-sm text-gray-700 mt-2 bg-gray-50 p-2 rounded">{hist.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {user.role === Role.COORDINATOR && (
                  <div className="p-5 border-t border-gray-100 bg-white">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Update Inquiry</h4>
                    <div className="space-y-3">
                      <div>
                        <select
                          className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                          value={newStatus}
                          onChange={e => setNewStatus(e.target.value as InquiryStatus)}
                        >
                          <option value="">Select new status...</option>
                          <option value={InquiryStatus.UNDER_REVIEW}>Under Review</option>
                          <option value={InquiryStatus.RESPONDED}>Responded</option>
                          <option value={InquiryStatus.CLOSED}>Closed</option>
                          <option value={InquiryStatus.NO_LONGER_AVAILABLE}>No Longer Available (Biomass Gone)</option>
                        </select>
                      </div>
                      <textarea
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 h-20"
                        placeholder="Add response or internal note..."
                        value={responseNote}
                        onChange={e => setResponseNote(e.target.value)}
                      />
                      <div className="flex justify-end">
                        <Button onClick={handleUpdateStatus} disabled={!newStatus}>
                          Update Status
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {user.role === Role.BUYER && selectedInquiry.status !== InquiryStatus.CLOSED && selectedInquiry.status !== InquiryStatus.WITHDRAWN && selectedInquiry.status !== InquiryStatus.NO_LONGER_AVAILABLE && (
                   <div className="p-5 border-t border-gray-100 bg-white flex justify-end">
                      <Button variant="outline" onClick={() => {
                        setNewStatus(InquiryStatus.WITHDRAWN);
                        setResponseNote('Buyer withdrew inquiry.');
                        handleUpdateStatus();
                      }}>
                        Withdraw Inquiry
                      </Button>
                   </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
