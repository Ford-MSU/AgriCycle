import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Role, InquiryStatus, Inquiry, InquiryMessage } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { getRoleShortName, hasPermission, Permission } from '../utils/rbac';
import { formatLocationHierarchy } from '../utils/philippineLocations';
import {
  MessageSquare,
  Clock,
  AlertTriangle,
  Send,
  Building2,
  MapPin,
  CheckCircle2,
  User as UserIcon,
  Ban,
  AlertCircle,
  X,
  Info,
} from 'lucide-react';
import { format } from 'date-fns';

const StatusBadgeInquiry: React.FC<{ status: InquiryStatus }> = ({ status }) => {
  let label = status.replace(/_/g, ' ');
  let styles = 'bg-gray-100 text-gray-800 border border-gray-200';

  if (status === InquiryStatus.SUBMITTED) {
    label = 'Submitted';
    styles = 'bg-blue-50 text-blue-700 border border-blue-200';
  } else if (status === InquiryStatus.ACCEPTED) {
    label = 'Accepted';
    styles = 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold';
  } else if (status === InquiryStatus.DECLINED) {
    label = 'Declined';
    styles = 'bg-rose-50 text-rose-700 border border-rose-200';
  } else if (status === InquiryStatus.ACKNOWLEDGED || status === InquiryStatus.UNDER_REVIEW) {
    label = 'Acknowledged';
    styles = 'bg-amber-50 text-amber-800 border border-amber-200';
  } else if (
    status === InquiryStatus.IN_DISCUSSION ||
    status === InquiryStatus.RESPONDED ||
    status === InquiryStatus.FOLLOW_UP
  ) {
    label = 'Accepted (Legacy)';
    styles = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
  } else if (status === InquiryStatus.CLOSED) {
    label = 'Closed (Legacy)';
    styles = 'bg-gray-100 text-gray-600 border border-gray-200';
  } else if (status === InquiryStatus.WITHDRAWN) {
    label = 'Withdrawn';
    styles = 'bg-gray-100 text-gray-600 border border-gray-300';
  } else if (
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
    isLoading,
    getRecord,
    getSource,
    getLocation,
    getAggregationGroup,
    updateInquiryStatus,
    getInquiryMessages,
    addInquiryMessage,
  } = useData();

  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState('');
  const [activeTab, setActiveTab] = useState<'CHAT' | 'DETAILS'>('CHAT');

  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Scope visible inquiries: Buyers see own inquiries only; Coordinators see all relevant inquiries.
  const visibleInquiries = useMemo(() => {
    if (!user) return [];
    if (user.role === Role.BUYER) {
      return inquiries.filter((i) => i.buyerUserId === user.id || i.buyerUserId === user.name);
    }
    if (user.role === Role.COORDINATOR) {
      return inquiries;
    }
    return [];
  }, [user, inquiries]);

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

  useEffect(() => {
    if (activeTab === 'CHAT') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentMessages.length, selectedInquiryId, activeTab]);

  if (!user) return null;

  const canRespondToInquiries = hasPermission(user.role, Permission.RESPOND_TO_INQUIRIES);
  const isOwnerBuyer =
    user.role === Role.BUYER &&
    selectedInquiry &&
    (selectedInquiry.buyerUserId === user.id || selectedInquiry.buyerUserId === user.name);

  const isChatEnabled =
    selectedInquiry?.status === InquiryStatus.ACCEPTED ||
    selectedInquiry?.status === InquiryStatus.IN_DISCUSSION ||
    selectedInquiry?.status === InquiryStatus.ACKNOWLEDGED ||
    selectedInquiry?.status === InquiryStatus.RESPONDED ||
    selectedInquiry?.status === InquiryStatus.FOLLOW_UP;

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !selectedInquiry || !isChatEnabled) return;

    setIsSendingMessage(true);
    setActionError('');
    try {
      await addInquiryMessage(selectedInquiry.id, chatInput.trim());
      setChatInput('');
    } catch (err: any) {
      setActionError(err?.message || 'Failed to send note.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleAcceptInquiry = async () => {
    if (!selectedInquiry || !canRespondToInquiries) return;
    setIsUpdatingStatus(true);
    setActionError('');
    try {
      await updateInquiryStatus(
        selectedInquiry.id,
        InquiryStatus.ACCEPTED,
        `Non-binding inquiry accepted by ${user.name} (${getRoleShortName(user.role)}).`
      );
      setActiveTab('CHAT');
      setTimeout(() => {
        chatInputRef.current?.focus();
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to accept inquiry.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDeclineConfirm = async () => {
    if (!selectedInquiry || !canRespondToInquiries) return;
    setIsUpdatingStatus(true);
    setActionError('');
    try {
      await updateInquiryStatus(
        selectedInquiry.id,
        InquiryStatus.DECLINED,
        declineReason.trim() || 'Inquiry declined by LGU Biomass Information Coordinator.'
      );
      setIsDeclineModalOpen(false);
      setDeclineReason('');
    } catch (err: any) {
      setActionError(err?.message || 'Failed to decline inquiry.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleWithdrawConfirm = async () => {
    if (!selectedInquiry || !isOwnerBuyer) return;
    setIsUpdatingStatus(true);
    setActionError('');
    try {
      await updateInquiryStatus(
        selectedInquiry.id,
        InquiryStatus.WITHDRAWN,
        'Inquiry withdrawn by buyer.'
      );
      setIsWithdrawModalOpen(false);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to withdraw inquiry.');
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

  const targetRecord =
    selectedInquiry && selectedInquiry.targetType === 'RECORD'
      ? getRecord(selectedInquiry.targetId)
      : undefined;
  const targetSource = targetRecord ? getSource(targetRecord.sourceId) : undefined;
  const sourceLocation = targetSource
    ? getLocation(targetSource.locationId)
    : targetRecord
    ? getLocation(targetRecord.locationId)
    : undefined;

  const isTerminalStatus =
    selectedInquiry?.status === InquiryStatus.CLOSED ||
    selectedInquiry?.status === InquiryStatus.WITHDRAWN ||
    selectedInquiry?.status === InquiryStatus.DECLINED ||
    selectedInquiry?.status === InquiryStatus.NO_LONGER_AVAILABLE ||
    selectedInquiry?.status === InquiryStatus.EXPIRED;

  const canCoordinatorAct =
    canRespondToInquiries &&
    selectedInquiry &&
    (selectedInquiry.status === InquiryStatus.SUBMITTED ||
      selectedInquiry.status === InquiryStatus.UNDER_REVIEW);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {user.role === Role.BUYER ? 'My Inquiries' : 'Buyer Inquiries'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            {user.role === Role.BUYER
              ? 'Track non-binding biomass inquiries and withdraw pending requests.'
              : 'Review incoming buyer inquiries and accept or decline information linkage.'}
          </p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3.5 flex gap-3 text-blue-800 text-xs">
        <Info className="shrink-0 mt-0.5 text-blue-500" size={16} />
        <p>
          <strong>Non-Binding Coordination Only:</strong> Accepting an inquiry enables information coordination between the buyer and source contact. It does <em>not</em> deduct biomass quantities, reserve supply, schedule physical collection, or establish a commercial contract.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Inquiry List */}
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
                        Req:{' '}
                        <strong>
                          {inq.requestedQuantity.toLocaleString()} {unitLabel}
                        </strong>
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

        {/* Right: Active Inquiry Workspace */}
        <div className="lg:col-span-8">
          {!selectedInquiry ? (
            <Card className="h-[680px] flex items-center justify-center bg-gray-50/50 border-dashed">
              <div className="text-center p-6">
                <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                <h3 className="text-lg font-medium text-gray-900">Select an Inquiry</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Choose an inquiry to review details, status history, and coordination notes.
                </p>
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

                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadgeInquiry status={selectedInquiry.status} />

                    {/* Coordinator Accept / Decline ONLY */}
                    {canCoordinatorAct && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleAcceptInquiry}
                          isLoading={isUpdatingStatus}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center gap-1.5 shadow-sm"
                        >
                          <CheckCircle2 size={14} /> Accept Inquiry
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsDeclineModalOpen(true)}
                          disabled={isUpdatingStatus}
                          className="border-rose-200 text-rose-700 hover:bg-rose-50 text-xs flex items-center gap-1.5"
                        >
                          <Ban size={14} /> Decline
                        </Button>
                      </div>
                    )}

                    {/* Buyer Withdrawal Button */}
                    {isOwnerBuyer && !isTerminalStatus && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsWithdrawModalOpen(true)}
                        disabled={isUpdatingStatus}
                        className="text-xs text-rose-700 border-rose-300 hover:bg-rose-50 flex items-center gap-1.5"
                      >
                        <AlertCircle size={14} /> Withdraw Inquiry
                      </Button>
                    )}
                  </div>
                </div>

                {/* Sub-tabs */}
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
                    Coordination Notes ({currentMessages.length})
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
                    Inquiry Details & Source Info
                  </button>
                </div>

                {actionError && (
                  <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-lg flex items-center gap-2">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}
              </div>

              {/* TAB 1: COORDINATION NOTES */}
              {activeTab === 'CHAT' && (
                <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {!isChatEnabled && (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6">
                        {selectedInquiry.status === InquiryStatus.SUBMITTED ||
                        selectedInquiry.status === InquiryStatus.UNDER_REVIEW ? (
                          <div className="max-w-md bg-white border border-blue-200 rounded-xl p-6 shadow-sm flex flex-col items-center">
                            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                              <Clock size={24} />
                            </div>
                            <h4 className="text-sm font-bold text-gray-900">Awaiting Coordinator Decision</h4>
                            <p className="text-xs text-blue-800 bg-blue-50/80 px-3 py-2 rounded-lg border border-blue-200 mt-3 font-medium">
                              Direct coordination notes open once the LGU Biomass Information Coordinator accepts the inquiry.
                            </p>
                            <p className="text-[11px] text-gray-400 mt-2">
                              Submitted {format(new Date(selectedInquiry.submittedAt), 'MMMM d, yyyy h:mm a')}
                            </p>
                          </div>
                        ) : selectedInquiry.status === InquiryStatus.DECLINED ? (
                          <div className="max-w-md bg-white border border-rose-200 rounded-xl p-6 shadow-sm flex flex-col items-center">
                            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
                              <Ban size={24} />
                            </div>
                            <h4 className="text-sm font-bold text-gray-900">Inquiry Declined</h4>
                            <p className="text-xs text-rose-700 bg-rose-50 px-3 py-2 rounded-lg border border-rose-200 mt-3">
                              This inquiry was declined by the LGU Biomass Information Coordinator.
                            </p>
                          </div>
                        ) : selectedInquiry.status === InquiryStatus.WITHDRAWN ? (
                          <div className="max-w-md bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col items-center">
                            <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mb-3">
                              <AlertCircle size={24} />
                            </div>
                            <h4 className="text-sm font-bold text-gray-900">Inquiry Withdrawn</h4>
                            <p className="text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 mt-3">
                              This inquiry has been withdrawn by the buyer.
                            </p>
                          </div>
                        ) : (
                          <div className="max-w-md bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col items-center">
                            <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mb-3">
                              <CheckCircle2 size={24} />
                            </div>
                            <h4 className="text-sm font-bold text-gray-900">Inquiry Closed</h4>
                            <p className="text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 mt-3">
                              This inquiry has been closed.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {isChatEnabled && currentMessages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                        <MessageSquare className="h-10 w-10 mb-2 opacity-40 text-agri-green-600" />
                        <p className="text-sm font-medium text-gray-700">Inquiry accepted for information linkage</p>
                        <p className="text-xs text-gray-500 mt-1 max-w-sm">
                          Share information notes regarding biomass availability, condition, or source contact details.
                        </p>
                      </div>
                    )}

                    {currentMessages.map((msg) => {
                      const isSelf = msg.senderId === user.id || msg.senderRole === user.role;
                      return (
                        <div key={msg.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                          <div className="flex items-center gap-1.5 mb-1 text-[11px] text-gray-500">
                            <span className="font-semibold text-gray-700">{msg.senderName}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                msg.senderRole === Role.BUYER
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {getRoleShortName(msg.senderRole)}
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
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {isChatEnabled ? (
                    <form
                      onSubmit={handleSendMessage}
                      className="p-3 border-t border-gray-200 bg-white flex items-center gap-2"
                    >
                      <input
                        ref={chatInputRef}
                        type="text"
                        className="flex-1 px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                        placeholder="Type an information coordination note..."
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
                  ) : (
                    <div className="p-3 border-t border-gray-200 bg-gray-100 text-center text-xs text-gray-500">
                      {selectedInquiry.status === InquiryStatus.SUBMITTED ||
                      selectedInquiry.status === InquiryStatus.UNDER_REVIEW
                        ? 'Coordination notes open once the LGU Biomass Information Coordinator accepts the inquiry.'
                        : 'Coordination notes are closed for this inquiry status.'}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: DETAILS */}
              {activeTab === 'DETAILS' && (
                <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-white">
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
                      {selectedInquiry.preferredAvailabilityPeriod && (
                        <div>
                          <span className="text-xs text-gray-500 block">Preferred Period</span>
                          <span className="font-medium text-gray-800">
                            {selectedInquiry.preferredAvailabilityPeriod}
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
                        <span className="text-xs text-gray-500 block">Buyer Notes</span>
                        <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">
                          {selectedInquiry.additionalRequirements}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-agri-green-200 bg-agri-green-50/40 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-agri-green-800 font-semibold text-sm mb-2">
                        <MapPin size={16} className="text-agri-green-700" />
                        Biomass Source Location
                      </div>
                      <p className="text-sm font-bold text-gray-900">
                        {targetSource?.name || 'Consolidated Source Group'}
                      </p>
                      {sourceLocation && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          {formatLocationHierarchy(sourceLocation)}
                        </p>
                      )}
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

                    <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm mb-2">
                        <Building2 size={16} className="text-blue-700" />
                        LGU Biomass Information Coordination
                      </div>
                      <p className="text-sm font-bold text-gray-900">LGU Biomass Information Office</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        LGU Biomass Information Linkage Desk
                      </p>
                      <p className="text-xs text-blue-800 mt-2">
                        Coordinator role is limited to reviewing, accepting, or declining non-binding market inquiries.
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                      Inquiry Status History
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

                  {isOwnerBuyer && !isTerminalStatus && (
                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isUpdatingStatus}
                        onClick={() => setIsWithdrawModalOpen(true)}
                        className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 flex items-center gap-1.5"
                      >
                        <AlertCircle size={14} /> Withdraw Inquiry
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Buyer Withdraw Confirmation Modal */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Withdraw Inquiry</h3>
                <p className="text-xs text-gray-500">Inquiry {selectedInquiry?.id}</p>
              </div>
            </div>

            <p className="text-sm text-gray-700 py-2 font-medium">
              Are you sure to withdraw this inquiry?
            </p>

            <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsWithdrawModalOpen(false)}
                disabled={isUpdatingStatus}
                className="text-xs"
              >
                No, I want to keep the inquiry.
              </Button>
              <Button
                size="sm"
                onClick={handleWithdrawConfirm}
                isLoading={isUpdatingStatus}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
              >
                Yes, I want to withdraw.
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Coordinator Decline Modal */}
      {isDeclineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Ban size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Decline Inquiry</h3>
                  <p className="text-xs text-gray-500">Inquiry {selectedInquiry?.id}</p>
                </div>
              </div>
              <button onClick={() => setIsDeclineModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-600 mb-3">
              Please provide a reason for declining this inquiry. The buyer will be notified.
            </p>

            <div className="space-y-2 mb-4">
              <label className="text-xs font-semibold text-gray-700 block">Decline Reason</label>
              <textarea
                rows={3}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Currently committed to internal farm use / Insufficient reported remaining quantity..."
                className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:ring-agri-green-500 focus:border-agri-green-500"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'Volume committed to internal source use',
                  'Insufficient remaining reported quantity',
                  'Biomass no longer externally available',
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setDeclineReason(reason)}
                    className="text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeclineModalOpen(false)}
                disabled={isUpdatingStatus}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDeclineConfirm}
                isLoading={isUpdatingStatus}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
              >
                Decline Inquiry
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
