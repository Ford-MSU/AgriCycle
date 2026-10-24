import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Role, InquiryStatus, Inquiry, InquiryMessage } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import {
  MessageSquare,
  Clock,
  AlertTriangle,
  Send,
  Building2,
  MapPin,
  CheckCircle2,
  User as UserIcon,
  Phone,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';

const StatusBadgeInquiry: React.FC<{ status: InquiryStatus }> = ({ status }) => {
  let label = status.replace(/_/g, ' ');
  let styles = 'bg-gray-100 text-gray-800 border border-gray-200';

  if (status === InquiryStatus.SUBMITTED) {
    label = 'Submitted';
    styles = 'bg-blue-50 text-blue-700 border border-blue-200';
  } else if (status === InquiryStatus.ACKNOWLEDGED || status === InquiryStatus.UNDER_REVIEW) {
    label = 'Acknowledged';
    styles = 'bg-amber-50 text-amber-800 border border-amber-200';
  } else if (
    status === InquiryStatus.IN_DISCUSSION ||
    status === InquiryStatus.RESPONDED ||
    status === InquiryStatus.FOLLOW_UP
  ) {
    label = 'In Discussion';
    styles = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
  } else if (status === InquiryStatus.CLOSED) {
    label = 'Closed';
    styles = 'bg-gray-100 text-gray-600 border border-gray-200';
  } else if (
    status === InquiryStatus.WITHDRAWN ||
    status === InquiryStatus.NO_LONGER_AVAILABLE ||
    status === InquiryStatus.EXPIRED
  ) {
    label = status.replace(/_/g, ' ');
    styles = 'bg-red-50 text-red-700 border border-red-200';
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles} uppercase tracking-wider`}>
      {label}
    </span>
  );
};

export const Inquiries: React.FC = () => {
  const { user } = useAuth();
  const {
    inquiries,
    referenceData,
    profiles,
    isLoading,
    getRecord,
    getSource,
    getLocation,
    getOrganization,
    getAggregationGroup,
    updateInquiryStatus,
    getInquiryMessages,
    addInquiryMessage,
  } = useData();

  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [newStatus, setNewStatus] = useState<InquiryStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState('');
  const [activeTab, setActiveTab] = useState<'CHAT' | 'DETAILS'>('CHAT');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  if (!user) return null;

  // Retrieve inquiries based on role
  let visibleInquiries = inquiries;
  if (user.role === Role.BUYER) {
    visibleInquiries = inquiries.filter((i) => i.buyerUserId === user.id || i.buyerUserId === user.name);
  } else if (user.role === Role.COORDINATOR) {
    visibleInquiries = inquiries.filter((i) => {
      if (i.targetType === 'RECORD') {
        const rec = getRecord(i.targetId);
        return (
          rec?.submitterId === user.id ||
          rec?.submitterId === user.name ||
          rec?.sourceId.includes('src-1') ||
          rec?.sourceId.includes('src-2') ||
          getSource(rec?.sourceId || '')?.cooperativeId === user.organizationId
        );
      } else {
        const group = getAggregationGroup(i.targetId);
        return (
          group?.createdBy === user.id ||
          group?.createdBy === user.name ||
          group?.hubId === user.organizationId ||
          group?.hubId === 'org-2'
        );
      }
    });
  }

  // Set default selection if none selected
  useEffect(() => {
    if (!selectedInquiryId && visibleInquiries.length > 0) {
      setSelectedInquiryId(visibleInquiries[0].id);
    }
  }, [visibleInquiries, selectedInquiryId]);

  const selectedInquiry: Inquiry | null =
    visibleInquiries.find((i) => i.id === selectedInquiryId) || null;

  const currentMessages: InquiryMessage[] = selectedInquiry
    ? getInquiryMessages(selectedInquiry.id)
    : [];

  useEffect(() => {
    setActionError('');
  }, [selectedInquiryId]);

  // Auto scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (activeTab === 'CHAT') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentMessages.length, selectedInquiryId, activeTab]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !selectedInquiry) return;

    setIsSendingMessage(true);
    setActionError('');
    try {
      await addInquiryMessage(selectedInquiry.id, chatInput.trim());
      setChatInput('');
    } catch (err: any) {
      setActionError(err?.message || 'Failed to send message.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!selectedInquiry) return;
    setIsUpdatingStatus(true);
    setActionError('');
    try {
      await updateInquiryStatus(
        selectedInquiry.id,
        InquiryStatus.ACKNOWLEDGED,
        `Inquiry acknowledged by ${user.name} (${user.role}). Available for discussion.`
      );
    } catch (err: any) {
      setActionError(err?.message || 'Failed to acknowledge inquiry.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleStatusChange = async (statusToApply: InquiryStatus, notesToApply?: string) => {
    if (!selectedInquiry) return;
    setActionError('');
    setIsUpdatingStatus(true);
    try {
      await updateInquiryStatus(selectedInquiry.id, statusToApply, notesToApply);
      setStatusNote('');
      setNewStatus('');
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update inquiry status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getTargetTitle = (inq: Inquiry) => {
    const typeLabel = referenceData.find((r) => r.id === inq.biomassTypeId)?.label;
    if (inq.targetType === 'RECORD') {
      const rec = getRecord(inq.targetId);
      const source = rec ? getSource(rec.sourceId) : null;
      return `${typeLabel || 'Biomass'} — ${source?.name || inq.targetId}`;
    } else {
      const group = getAggregationGroup(inq.targetId);
      return `${typeLabel || 'Biomass'} Group — ${group?.name || inq.targetId}`;
    }
  };

  // Helper info for selected inquiry
  const targetRecord = selectedInquiry && selectedInquiry.targetType === 'RECORD'
    ? getRecord(selectedInquiry.targetId)
    : undefined;
  const targetSource = targetRecord ? getSource(targetRecord.sourceId) : undefined;
  const sourceLocation = targetSource
    ? getLocation(targetSource.locationId)
    : targetRecord
    ? getLocation(targetRecord.locationId)
    : undefined;
  const targetCoop = targetSource?.cooperativeId ? getOrganization(targetSource.cooperativeId) : undefined;

  const buyerProfile = selectedInquiry
    ? profiles.find((p) => p.id === selectedInquiry.buyerUserId || p.email === selectedInquiry.buyerUserId)
    : undefined;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {user.role === Role.BUYER ? 'My Inquiries & Conversations' : 'Buyer Inquiries & Communication'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Direct communication, coordinator acknowledgment, and logistics coordination.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Inquiry List (4 cols) */}
        <div className="lg:col-span-4 border border-gray-200 bg-white rounded-xl overflow-hidden h-[680px] flex flex-col shadow-sm">
          <div className="p-4 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <MessageSquare size={16} className="text-agri-green-600" />
              Inquiries ({visibleInquiries.length})
            </h3>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
            {isLoading && visibleInquiries.length === 0 ? (
              <p className="text-sm text-gray-500 p-6 text-center">Loading inquiries...</p>
            ) : visibleInquiries.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No inquiries found.</p>
              </div>
            ) : (
              visibleInquiries.map((inq) => {
                const isSelected = selectedInquiry?.id === inq.id;
                const unitLabel = referenceData.find((r) => r.id === inq.requestedUnit)?.label || '';
                return (
                  <div
                    key={inq.id}
                    onClick={() => setSelectedInquiryId(inq.id)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-agri-green-50/70 border-l-4 border-agri-green-600'
                        : 'hover:bg-gray-50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-500">{inq.id}</span>
                      <StatusBadgeInquiry status={inq.status} />
                    </div>
                    <p className="font-semibold text-sm text-gray-900 line-clamp-1">{getTargetTitle(inq)}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
                      <span>
                        Req: <strong>{inq.requestedQuantity.toLocaleString()} {unitLabel}</strong>
                      </span>
                      <span className="text-[11px] text-gray-400 flex items-center gap-1">
                        <Clock size={11} /> {format(new Date(inq.updatedAt), 'MMM d')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Inquiry Workspace (8 cols) */}
        <div className="lg:col-span-8">
          {!selectedInquiry ? (
            <Card className="h-[680px] flex items-center justify-center bg-gray-50/50 border-dashed">
              <div className="text-center p-6">
                <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                <h3 className="text-lg font-medium text-gray-900">Select an Inquiry</h3>
                <p className="text-sm text-gray-500 mt-1">Choose an inquiry to open direct messaging and review details.</p>
              </div>
            </Card>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden h-[680px] flex flex-col shadow-sm">
              {/* Header */}
              <div className="p-4 border-b border-gray-100 bg-white">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {selectedInquiry.id}
                      </span>
                      <span className="text-xs text-gray-400">&bull;</span>
                      <span className="text-xs text-gray-600 font-medium">
                        Target: {selectedInquiry.targetType === 'RECORD' ? 'Biomass Record' : 'Aggregation Group'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900 mt-0.5">
                      {getTargetTitle(selectedInquiry)}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadgeInquiry status={selectedInquiry.status} />

                    {/* Coordinator Quick Acknowledge Button */}
                    {(user.role === Role.COORDINATOR || user.role === Role.ADMINISTRATOR) &&
                      selectedInquiry.status === InquiryStatus.SUBMITTED && (
                        <Button
                          size="sm"
                          onClick={handleAcknowledge}
                          isLoading={isUpdatingStatus}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs flex items-center gap-1.5"
                        >
                          <CheckCircle2 size={14} /> Acknowledge Inquiry
                        </Button>
                      )}
                  </div>
                </div>

                {/* Sub-tabs: Chat vs Detailed Information */}
                <div className="flex items-center gap-2 mt-4 border-b border-gray-100 pb-1">
                  <button
                    onClick={() => setActiveTab('CHAT')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                      activeTab === 'CHAT'
                        ? 'bg-agri-green-100 text-agri-green-900'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <MessageSquare size={13} />
                    Conversation ({currentMessages.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('DETAILS')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                      activeTab === 'DETAILS'
                        ? 'bg-agri-green-100 text-agri-green-900'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Building2 size={13} />
                    Inquiry Details & Locations
                  </button>
                </div>

                {actionError && (
                  <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-lg flex items-center gap-2">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}
              </div>

              {/* TAB 1: CHAT / CONVERSATION PANEL */}
              {activeTab === 'CHAT' && (
                <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50">
                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {currentMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                        <MessageSquare className="h-10 w-10 mb-2 opacity-40 text-agri-green-600" />
                        <p className="text-sm font-medium text-gray-700">No messages exchanged yet</p>
                        <p className="text-xs text-gray-500 mt-1 max-w-sm">
                          Send a message to discuss logistics, pickup timing, scale weighing, or price coordination.
                        </p>
                      </div>
                    ) : (
                      currentMessages.map((msg) => {
                        const isSelf = msg.senderId === user.id || msg.senderRole === user.role;
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                          >
                            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-gray-500">
                              <span className="font-semibold text-gray-700">{msg.senderName}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                msg.senderRole === Role.BUYER
                                  ? 'bg-blue-100 text-blue-800'
                                  : msg.senderRole === Role.COORDINATOR
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}>
                                {msg.senderRole}
                              </span>
                              <span>&bull;</span>
                              <span>{format(new Date(msg.createdAt), 'MMM d, h:mm a')}</span>
                            </div>

                            <div
                              className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                isSelf
                                  ? 'bg-agri-green-700 text-white rounded-br-none'
                                  : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{msg.message}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Chat Input Bar */}
                  <form
                    onSubmit={handleSendMessage}
                    className="p-3 border-t border-gray-200 bg-white flex items-center gap-2"
                  >
                    <input
                      type="text"
                      className="flex-1 px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                      placeholder="Type a message to coordinate availability, pickup, or terms..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={isSendingMessage}
                    />
                    <Button
                      type="submit"
                      disabled={!chatInput.trim() || isSendingMessage}
                      isLoading={isSendingMessage}
                      className="shrink-0 bg-agri-green-600 hover:bg-agri-green-700 text-white px-4"
                    >
                      <Send size={15} />
                    </Button>
                  </form>
                </div>
              )}

              {/* TAB 2: DETAILED INQUIRY & LOCATION AUDIT */}
              {activeTab === 'DETAILS' && (
                <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-white">
                  {/* Biomass Request Summary */}
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                      Requested Biomass Parameters
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-gray-500 block">Requested Quantity</span>
                        <span className="font-bold text-gray-900 text-base">
                          {selectedInquiry.requestedQuantity.toLocaleString()}{' '}
                          {referenceData.find((r) => r.id === selectedInquiry.requestedUnit)?.label}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Date Submitted</span>
                        <span className="font-medium text-gray-800">
                          {format(new Date(selectedInquiry.submittedAt), 'MMM d, yyyy HH:mm')}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Current Status</span>
                        <span className="font-semibold text-agri-green-700">
                          {selectedInquiry.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {selectedInquiry.preferredCollectionDate && (
                        <div>
                          <span className="text-xs text-gray-500 block">Preferred Collection Date</span>
                          <span className="font-medium text-gray-800">
                            {selectedInquiry.preferredCollectionDate}
                          </span>
                        </div>
                      )}
                      {selectedInquiry.preferredPickupTime && (
                        <div>
                          <span className="text-xs text-gray-500 block">Preferred Pickup Time</span>
                          <span className="font-medium text-gray-800">
                            {selectedInquiry.preferredPickupTime}
                          </span>
                        </div>
                      )}
                      {selectedInquiry.intendedUse && (
                        <div>
                          <span className="text-xs text-gray-500 block">Intended Use</span>
                          <span className="font-medium text-gray-800">{selectedInquiry.intendedUse}</span>
                        </div>
                      )}
                    </div>

                    {selectedInquiry.additionalRequirements && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <span className="text-xs text-gray-500 block">Buyer Requirements & Notes</span>
                        <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">
                          {selectedInquiry.additionalRequirements}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Distinct Locations Comparison: Source vs Coordinator Office */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Source Physical Location */}
                    <div className="border border-agri-green-200 bg-agri-green-50/40 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-agri-green-800 font-semibold text-sm mb-2">
                        <MapPin size={16} className="text-agri-green-700" />
                        Biomass Source Location (Farm / Mill)
                      </div>
                      <p className="text-sm font-bold text-gray-900">
                        {targetSource?.name || 'Local Farm/Mill'}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {sourceLocation?.barangay}, {sourceLocation?.city}, {sourceLocation?.province}
                      </p>
                      {targetSource?.contactPerson && (
                        <p className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                          <UserIcon size={12} className="text-gray-400" /> Contact: {targetSource.contactPerson}
                        </p>
                      )}
                      {targetRecord?.accessLocationNotes && (
                        <p className="text-xs text-gray-500 mt-2 italic bg-white/80 p-2 rounded border border-agri-green-100">
                          Access Note: {targetRecord.accessLocationNotes}
                        </p>
                      )}
                    </div>

                    {/* Coordinator Office Location */}
                    <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm mb-2">
                        <Building2 size={16} className="text-blue-700" />
                        Coordinator / Cooperative Office
                      </div>
                      <p className="text-sm font-bold text-gray-900">
                        {targetCoop?.name || 'Agusan Biomass Coordination Hub'}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {targetCoop?.officeAddress || 'Km. 3 Baan Highway, Butuan City'}
                      </p>
                      <div className="mt-2 space-y-1 text-xs text-gray-600">
                        {targetCoop?.contactPhone && (
                          <p className="flex items-center gap-1">
                            <Phone size={12} className="text-gray-400" /> Phone: {targetCoop.contactPhone}
                          </p>
                        )}
                        {targetCoop?.contactEmail && (
                          <p className="flex items-center gap-1">
                            <Mail size={12} className="text-gray-400" /> Email: {targetCoop.contactEmail}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Timeline */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                      Lifecycle Audit History
                    </h4>
                    <div className="space-y-3">
                      {selectedInquiry.history.map((hist) => (
                        <div key={hist.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-gray-900">
                              Status: <span className="text-agri-green-700">{hist.newStatus.replace(/_/g, ' ')}</span>
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {format(new Date(hist.changedAt), 'MMM d, yyyy HH:mm')}
                            </span>
                          </div>
                          {hist.notes && <p className="text-gray-600 mt-1">{hist.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Coordinator Status Transitions */}
                  {(user.role === Role.COORDINATOR || user.role === Role.ADMINISTRATOR) && (
                    <div className="pt-4 border-t border-gray-100">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                        Update Inquiry Status
                      </h4>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          className="p-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-agri-green-500 focus:border-agri-green-500 flex-1"
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as InquiryStatus)}
                        >
                          <option value="">Choose new status...</option>
                          <option value={InquiryStatus.ACKNOWLEDGED}>Acknowledged</option>
                          <option value={InquiryStatus.IN_DISCUSSION}>In Discussion</option>
                          <option value={InquiryStatus.CLOSED}>Closed</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Optional note for status change..."
                          value={statusNote}
                          onChange={(e) => setStatusNote(e.target.value)}
                          className="p-2 border border-gray-200 rounded-lg text-xs flex-1 focus:ring-agri-green-500 focus:border-agri-green-500"
                        />
                        <Button
                          size="sm"
                          disabled={!newStatus || isUpdatingStatus}
                          isLoading={isUpdatingStatus}
                          onClick={() => newStatus && handleStatusChange(newStatus, statusNote)}
                        >
                          Update Status
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Buyer Withdrawal */}
                  {user.role === Role.BUYER && selectedInquiry.status !== InquiryStatus.CLOSED && (
                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        isLoading={isUpdatingStatus}
                        onClick={() => handleStatusChange(InquiryStatus.CLOSED, 'Buyer closed the inquiry.')}
                        className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                      >
                        Close / Withdraw Inquiry
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
