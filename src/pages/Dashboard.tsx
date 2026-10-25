import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { RecordStatus, Role } from '../types';
import {
  Tractor,
  FileText,
  CheckCircle,
  AlertTriangle,
  Users,
  Activity,
  MessageSquare,
  Scale,
  MapPin,
  Map as MapIcon,
  Building,
  Filter,
  Layers,
  ArrowRight,
  ExternalLink,
  Send,
  PlusCircle,
  Ban,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { hasPermission, Permission } from '../utils/rbac';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { calculateCoreMetrics, convertToMetricTonnes } from '../utils/analytics';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const {
    records,
    locations,
    sources,
    inquiries,
    referenceData,
    auditLogs,
    profiles,
    getRecord,
    getSource,
    getAggregationGroup,
  } = useData();

  const [selectedBiomassCategory, setSelectedBiomassCategory] = useState<string>('ALL');

  if (!user) return null;

  const accessibleRecords = useMemo(() => {
    if (user.role === Role.COORDINATOR) {
      return records.filter(
        (r) =>
          r.submitterId === user.id ||
          r.submitterId === user.name ||
          r.sourceId.includes('src-1') ||
          r.sourceId.includes('src-2') ||
          getSource(r.sourceId)?.cooperativeId === user.organizationId
      );
    }
    if (user.role === Role.BUYER) {
      return records.filter((r) => r.status === RecordStatus.VALIDATED);
    }
    return records;
  }, [user, records, getSource]);

  const accessibleInquiries = useMemo(() => {
    if (user.role === Role.BUYER) {
      return inquiries.filter((i) => i.buyerUserId === user.id || i.buyerUserId === user.name);
    }
    if (user.role === Role.COORDINATOR) {
      return inquiries.filter((i) => {
        if (i.targetType === 'RECORD') {
          const rec = getRecord(i.targetId);
          return rec && accessibleRecords.some((ar) => ar.id === rec.id);
        }
        const grp = getAggregationGroup(i.targetId);
        return grp && (grp.createdBy === user.id || grp.hubId === user.organizationId || grp.hubId === 'org-2');
      });
    }
    return inquiries;
  }, [user, inquiries, accessibleRecords, getRecord, getAggregationGroup]);

  // Derived metrics from persisted dataset using shared analytics
  const coreMetrics = useMemo(
    () => calculateCoreMetrics(accessibleRecords, referenceData),
    [accessibleRecords, referenceData]
  );

  // Category Slicer options
  const biomassCategories = useMemo(
    () => referenceData.filter((r) => r.category === 'BIOMASS_TYPE' && r.isActive),
    [referenceData]
  );

  // Detailed breakdown: Available to Others vs Internal Farm/Mill Use
  const utilizationStats = useMemo(() => {
    let availableTonnes = 0;
    let internalTonnes = 0;
    let reservedTonnes = 0;

    accessibleRecords.forEach((r) => {
      const totalT = convertToMetricTonnes(r.quantity, r.originalUnit, referenceData);
      const reservedT = r.reservedQuantity !== undefined
        ? convertToMetricTonnes(r.reservedQuantity, r.originalUnit, referenceData)
        : 0;

      let currentUseT = 0;
      if (r.currentUseQuantity !== undefined && r.currentUseQuantity > 0) {
        currentUseT = convertToMetricTonnes(r.currentUseQuantity, r.originalUnit, referenceData);
      } else if (r.externalAvailability === 'NOT_AVAILABLE') {
        currentUseT = totalT;
      } else if (
        r.currentUse &&
        !r.currentUse.toLowerCase().includes('available') &&
        !r.currentUse.toLowerCase().includes('not currently used') &&
        r.remainingQuantity !== undefined
      ) {
        currentUseT = Math.max(0, totalT - convertToMetricTonnes(r.remainingQuantity, r.originalUnit, referenceData) - reservedT);
      }

      const remainingT = r.remainingQuantity !== undefined
        ? convertToMetricTonnes(r.remainingQuantity, r.originalUnit, referenceData)
        : Math.max(0, totalT - currentUseT - reservedT);

      // If marked not available to others, the entire volume is considered internal
      if (r.externalAvailability === 'NOT_AVAILABLE') {
        internalTonnes += totalT;
      } else {
        internalTonnes += currentUseT;
        reservedTonnes += reservedT;
        if (r.status === RecordStatus.VALIDATED) {
          availableTonnes += remainingT;
        }
      }
    });

    const totalRecordedTonnes = Math.round((availableTonnes + internalTonnes + reservedTonnes) * 10) / 10;
    return {
      availableTonnes: Math.round(availableTonnes * 10) / 10,
      internalTonnes: Math.round(internalTonnes * 10) / 10,
      reservedTonnes: Math.round(reservedTonnes * 10) / 10,
      totalRecordedTonnes,
      availablePercent: totalRecordedTonnes > 0 ? Math.round((availableTonnes / totalRecordedTonnes) * 100) : 0,
      internalPercent: totalRecordedTonnes > 0 ? Math.round((internalTonnes / totalRecordedTonnes) * 100) : 0,
      reservedPercent: totalRecordedTonnes > 0 ? Math.round((reservedTonnes / totalRecordedTonnes) * 100) : 0,
    };
  }, [accessibleRecords, referenceData]);

  // Barangay Rankings filtered by category slicer
  const filteredBarangayRankings = useMemo(() => {
    const recordsToCount = selectedBiomassCategory === 'ALL'
      ? accessibleRecords
      : accessibleRecords.filter((r) => r.biomassTypeId === selectedBiomassCategory);

    const map = new Map<string, { barangay: string; totalTonnes: number; availableTonnes: number; internalTonnes: number; count: number }>();

    recordsToCount.forEach((r) => {
      const src = sources.find((s) => s.id === r.sourceId);
      const loc = locations.find((l) => l.id === (src?.locationId || r.locationId));
      const barangay = loc?.barangay || 'Other / Regional';

      const totalT = convertToMetricTonnes(r.quantity, r.originalUnit, referenceData);
      const availT = r.remainingQuantity !== undefined
        ? convertToMetricTonnes(r.remainingQuantity, r.originalUnit, referenceData)
        : totalT;

      if (!map.has(barangay)) {
        map.set(barangay, {
          barangay,
          totalTonnes: 0,
          availableTonnes: 0,
          internalTonnes: 0,
          count: 0,
        });
      }

      const item = map.get(barangay)!;
      item.count++;
      item.totalTonnes += totalT;
      if (r.status === RecordStatus.VALIDATED && r.externalAvailability !== 'NOT_AVAILABLE') {
        item.availableTonnes += availT;
      }
      item.internalTonnes += Math.max(0, totalT - availT);
    });

    return Array.from(map.values())
      .map((b: { barangay: string; totalTonnes: number; availableTonnes: number; internalTonnes: number; count: number }) => ({
        ...b,
        totalTonnes: Math.round(b.totalTonnes * 10) / 10,
        availableTonnes: Math.round(b.availableTonnes * 10) / 10,
        internalTonnes: Math.round(b.internalTonnes * 10) / 10,
      }))
      .sort((a, b) => b.totalTonnes - a.totalTonnes);
  }, [accessibleRecords, selectedBiomassCategory, locations, sources, referenceData]);

  // Mills, Companies & Farming Groups list
  const topMillsAndFarms = useMemo(() => {
    const map = new Map<string, { id: string; name: string; type: string; barangay: string; totalTonnes: number; recordCount: number }>();

    accessibleRecords.forEach((r) => {
      const src = sources.find((s) => s.id === r.sourceId);
      const srcId = src?.id || r.sourceId;
      const srcName = src?.name || 'Local Farm / Mill';
      const srcType = src?.type || 'Agricultural';
      const loc = locations.find((l) => l.id === (src?.locationId || r.locationId));
      const barangay = loc?.barangay || 'Butuan City';

      const totalT = convertToMetricTonnes(r.quantity, r.originalUnit, referenceData);

      if (!map.has(srcId)) {
        map.set(srcId, {
          id: srcId,
          name: srcName,
          type: srcType,
          barangay,
          totalTonnes: 0,
          recordCount: 0,
        });
      }

      const entry = map.get(srcId)!;
      entry.totalTonnes += totalT;
      entry.recordCount++;
    });

    return Array.from(map.values())
      .map((e: { id: string; name: string; type: string; barangay: string; totalTonnes: number; recordCount: number }) => ({ ...e, totalTonnes: Math.round(e.totalTonnes * 10) / 10 }))
      .sort((a, b) => b.totalTonnes - a.totalTonnes)
      .slice(0, 5);
  }, [accessibleRecords, sources, locations, referenceData]);

  const totalUsers = profiles.length > 0 ? profiles.length : 4;
  const totalSources = new Set(accessibleRecords.map((r) => r.sourceId)).size;
  const mySubmissions = records.filter((r) => r.submitterId === user.id || r.submitterId === user.name).length;
  const pendingValidation = records.filter((r) => r.status === RecordStatus.SUBMITTED).length;
  const validatedRecords = accessibleRecords.filter((r) => r.status === RecordStatus.VALIDATED).length;

  const recentRecords = [...accessibleRecords]
    .sort((a, b) => new Date(b.lastUpdatedDate).getTime() - new Date(a.lastUpdatedDate).getTime())
    .slice(0, 5);

  const recentLogs = [...auditLogs]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  const myRecentActions = useMemo(() => {
    const userMatches = (logUserId?: string) => {
      if (!logUserId) return false;
      const lowerLog = logUserId.toLowerCase();
      const lowerUid = (user.id || '').toLowerCase();
      const lowerName = (user.name || '').toLowerCase();
      const lowerEmail = (user.email || '').toLowerCase();

      if (lowerLog === lowerUid || lowerLog === lowerName || lowerLog === lowerEmail) return true;
      if (lowerLog.includes(lowerUid) || (lowerUid && lowerUid.includes(lowerLog))) return true;

      if (user.role === Role.COORDINATOR && (lowerLog.includes('coord') || lowerLog.includes('nitronford') || lowerLog.includes('clara'))) return true;
      if (user.role === Role.LGU && (lowerLog.includes('lgu') || lowerLog.includes('arvin'))) return true;
      if (user.role === Role.BUYER && (lowerLog.includes('buyer') || lowerLog.includes('carlos') || lowerLog.includes('roberto'))) return true;
      if (user.role === Role.ADMINISTRATOR && (lowerLog.includes('admin') || lowerLog.includes('juan'))) return true;

      return false;
    };

    const userLogs = auditLogs.filter((log) => userMatches(log.userId));
    return [...userLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 7);
  }, [auditLogs, user]);

  const getActionMeta = (log: typeof auditLogs[0]) => {
    let title = 'System Activity';
    let icon = <Activity size={15} className="text-gray-600" />;
    let badgeColor = 'bg-gray-100 text-gray-700 border-gray-200';
    let targetLink = '/dashboard';

    if (log.entityType === 'Inquiry') {
      targetLink = '/inquiries';
      if (log.details?.toLowerCase().includes('accepted')) {
        title = 'Accepted Inquiry';
        icon = <CheckCircle2 size={15} className="text-emerald-600" />;
        badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      } else if (log.details?.toLowerCase().includes('declined')) {
        title = 'Declined Inquiry';
        icon = <Ban size={15} className="text-rose-600" />;
        badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
      } else if (log.details?.toLowerCase().includes('withdrew') || log.details?.toLowerCase().includes('withdrawn')) {
        title = 'Withdrew Inquiry';
        icon = <AlertTriangle size={15} className="text-gray-600" />;
        badgeColor = 'bg-gray-100 text-gray-700 border-gray-200';
      } else if (log.details?.toLowerCase().includes('message')) {
        title = 'Sent Message';
        icon = <Send size={15} className="text-indigo-600" />;
        badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
      } else {
        title = 'Submitted Inquiry';
        icon = <MessageSquare size={15} className="text-blue-600" />;
        badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
      }
    } else if (log.entityType === 'BiomassRecord') {
      targetLink = '/biomass-records';
      if (log.details?.toLowerCase().includes('created') || log.action === 'CREATE') {
        title = 'Created Record';
        icon = <PlusCircle size={15} className="text-emerald-600" />;
        badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      } else if (log.details?.toLowerCase().includes('submitted') || log.action === 'SUBMIT') {
        title = 'Submitted Record';
        icon = <Send size={15} className="text-blue-600" />;
        badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
      } else {
        title = 'Updated Record';
        icon = <FileText size={15} className="text-slate-600" />;
        badgeColor = 'bg-slate-50 text-slate-700 border-slate-200';
      }
    } else if (log.entityType === 'ValidationRecord') {
      targetLink = '/biomass-records';
      if (log.details?.toLowerCase().includes('validated') || log.action === 'VALIDATE') {
        title = 'Validated Record';
        icon = <CheckCircle2 size={15} className="text-emerald-600" />;
        badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      } else if (log.details?.toLowerCase().includes('returned') || log.action === 'RETURN') {
        title = 'Returned for Correction';
        icon = <AlertTriangle size={15} className="text-amber-600" />;
        badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
      } else {
        title = 'Rejected Record';
        icon = <Ban size={15} className="text-rose-600" />;
        badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
      }
    } else if (log.entityType === 'AggregationGroup') {
      targetLink = '/aggregation';
      title = 'Aggregation Group';
      icon = <Layers size={15} className="text-purple-600" />;
      badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
    } else if (log.entityType === 'User') {
      targetLink = '/admin';
      title = 'User Administration';
      icon = <Users size={15} className="text-blue-600" />;
      badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
    }

    return { title, icon, badgeColor, targetLink };
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {hasPermission(user.role, Permission.VIEW_SYSTEM_WIDE_RECORDS) ? 'System Overview' : 'My Dashboard'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1 capitalize">
            {user.role.toLowerCase().replace(/_/g, ' ')} Portal &bull; Recorded Biomass Information
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-agri-green-200 bg-gradient-to-br from-white to-agri-green-50/20">
          <CardContent className="p-5 flex items-center">
            <div className="w-12 h-12 rounded-lg bg-agri-green-100 flex items-center justify-center text-agri-green-700 mr-4 shrink-0 shadow-sm">
              <Scale size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-agri-earth-600 uppercase tracking-wider">Available Biomass Volume</p>
              <p className="text-2xl font-extrabold text-agri-green-800 mt-0.5">
                {coreMetrics.availableVolumeTonnes.toLocaleString()} <span className="text-sm font-semibold text-agri-green-600">MT</span>
              </p>
              <p className="text-[11px] text-agri-earth-500 mt-0.5">
                {coreMetrics.validatedCount} validated records
              </p>
            </div>
          </CardContent>
        </Card>

        {hasPermission(user.role, Permission.VIEW_SYSTEM_WIDE_RECORDS) ? (
          <Card>
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-agri-green-100 flex items-center justify-center text-agri-green-600 mr-4">
                <Users size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-agri-earth-500">Registered Profiles</p>
                <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
                <p className="text-[11px] text-agri-earth-500 mt-0.5">Active directory</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 mr-4">
                <FileText size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-agri-earth-500">Total Recorded Volume</p>
                <p className="text-2xl font-bold text-gray-900">
                  {coreMetrics.totalVolumeTonnes.toLocaleString()} <span className="text-sm font-normal text-gray-500">MT</span>
                </p>
                <p className="text-[11px] text-agri-earth-500 mt-0.5">{coreMetrics.totalRecordsCount} records</p>
              </div>
            </CardContent>
          </Card>
        )}

        {hasPermission(user.role, Permission.VIEW_VALIDATION_QUEUE) && (
          <Card>
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600 mr-4">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-agri-earth-500">Pending Validation</p>
                <p className="text-2xl font-bold text-gray-900">{pendingValidation}</p>
                <p className="text-[11px] text-agri-earth-500 mt-0.5">Awaiting LGU evaluation</p>
              </div>
            </CardContent>
          </Card>
        )}

        {(user.role === Role.BUYER || user.role === Role.COORDINATOR || user.role === Role.LGU) && (
          <Card>
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 mr-4">
                <MessageSquare size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-agri-earth-500">Buyer Inquiries</p>
                <p className="text-2xl font-bold text-gray-900">{accessibleInquiries.length}</p>
                <p className="text-[11px] text-agri-earth-500 mt-0.5">Active commercial requests</p>
              </div>
            </CardContent>
          </Card>
        )}

        {user.role === Role.ADMINISTRATOR && (
          <Card>
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 mr-4">
                <Tractor size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-agri-earth-500">Recorded Sources</p>
                <p className="text-2xl font-bold text-gray-900">{totalSources}</p>
                <p className="text-[11px] text-agri-earth-500 mt-0.5">Farms & Agro-industrial</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Biomass Utilization & Availability Classification Visual */}
      {user.role !== Role.BUYER && (
        <Card className="border-agri-green-200">
          <CardHeader className="pb-3 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="text-agri-green-600" size={20} />
                Biomass Availability vs. Internal Utilization
              </CardTitle>
              <CardDescription>
                Live comparison of biomass available for external buyer inquiries versus internal farm/mill consumption.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="flex items-center gap-1.5 font-medium text-emerald-800">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shrink-0" /> Available to Others ({utilizationStats.availablePercent}%)
              </span>
              <span className="flex items-center gap-1.5 font-medium text-amber-800">
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shrink-0" /> Internal Farm Use ({utilizationStats.internalPercent}%)
              </span>
              <span className="flex items-center gap-1.5 font-medium text-blue-800">
                <span className="w-3 h-3 rounded-full bg-blue-600 inline-block shrink-0" /> Reserved / Committed ({utilizationStats.reservedPercent}%)
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {/* Visual ratio bar */}
            <div className="w-full bg-gray-100 h-4 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${utilizationStats.availablePercent}%` }}
                className="bg-emerald-500 transition-all duration-500 hover:opacity-90"
                title={`Available to Others: ${utilizationStats.availableTonnes} MT (${utilizationStats.availablePercent}%)`}
              />
              <div
                style={{ width: `${utilizationStats.internalPercent}%` }}
                className="bg-amber-500 transition-all duration-500 hover:opacity-90"
                title={`Internal Farm/Mill Use: ${utilizationStats.internalTonnes} MT (${utilizationStats.internalPercent}%)`}
              />
              <div
                style={{ width: `${utilizationStats.reservedPercent}%` }}
                className="bg-blue-600 transition-all duration-500 hover:opacity-90"
                title={`Reserved / Committed: ${utilizationStats.reservedTonnes} MT (${utilizationStats.reservedPercent}%)`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Available for Inquiries</p>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">{utilizationStats.availablePercent}%</span>
                </div>
                <p className="text-xl font-bold text-emerald-900 mt-1">
                  {utilizationStats.availableTonnes.toLocaleString()} <span className="text-xs text-emerald-700">MT</span>
                </p>
                <p className="text-[11px] text-emerald-700 mt-0.5">Validated & listed for potential buyers</p>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Internal Producer Use</p>
                  <span className="text-xs font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">{utilizationStats.internalPercent}%</span>
                </div>
                <p className="text-xl font-bold text-amber-900 mt-1">
                  {utilizationStats.internalTonnes.toLocaleString()} <span className="text-xs text-amber-700">MT</span>
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">Retained for boiler combustion, mulch, bedding</p>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Reserved / Committed</p>
                  <span className="text-xs font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">{utilizationStats.reservedPercent}%</span>
                </div>
                <p className="text-xl font-bold text-blue-900 mt-1">
                  {utilizationStats.reservedTonnes.toLocaleString()} <span className="text-xs text-blue-700">MT</span>
                </p>
                <p className="text-[11px] text-blue-700 mt-0.5">Earmarked under agreements</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Butuan City Geographic Distribution & Ranking with Category Slicer */}
      {user.role !== Role.BUYER && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Barangay Ranking with Slicer */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="text-agri-green-600" size={18} />
                  Butuan City Barangay Production Ranking
                </CardTitle>
                <CardDescription>
                  Biomass tonnage produced and available per barangay.
                </CardDescription>
              </div>
              {/* Category Slicer */}
              <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-lg border border-gray-200 text-xs">
                <Filter size={13} className="text-gray-500 ml-1" />
                <select
                  value={selectedBiomassCategory}
                  onChange={(e) => setSelectedBiomassCategory(e.target.value)}
                  className="bg-transparent border-none text-xs font-medium text-gray-800 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Biomass Categories</option>
                  {biomassCategories.map((bc) => (
                    <option key={bc.id} value={bc.id}>
                      {bc.label}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="pt-4 flex-1">
              {filteredBarangayRankings.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No records match the selected biomass category.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredBarangayRankings.slice(0, 5).map((b, idx) => (
                    <div
                      key={b.barangay}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 hover:bg-agri-green-50/40 transition-colors border border-gray-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-agri-green-100 text-agri-green-800 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{b.barangay}</p>
                          <p className="text-[11px] text-gray-500">
                            {b.count} records &bull; {b.internalTonnes} MT internal use
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-gray-900 text-sm">
                          {b.totalTonnes.toLocaleString()} MT
                        </span>
                        <span className="block text-[11px] text-emerald-700 font-semibold">
                          {b.availableTonnes.toLocaleString()} MT available
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Producing Mills, Companies & Farms */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building className="text-agri-green-600" size={18} />
                  Top Producing Mills & Farming Groups
                </CardTitle>
                <CardDescription>
                  Key agro-industrial suppliers and agricultural cooperatives in Butuan City.
                </CardDescription>
              </div>
              <Link
                to="/map"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-agri-green-50 hover:border-agri-green-300 text-xs font-semibold text-agri-green-700 hover:text-agri-green-800 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-agri-green-500 focus:ring-offset-1"
                aria-label="View Map of top producing mills and farming groups"
              >
                <MapIcon size={13} className="text-agri-green-600 shrink-0" aria-hidden="true" />
                <span>View Map</span>
              </Link>
            </CardHeader>
            <CardContent className="pt-4 flex-1">
              {topMillsAndFarms.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No producers registered yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topMillsAndFarms.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 hover:bg-blue-50/40 transition-colors border border-gray-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                          <Tractor size={16} />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{m.name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-gray-500">
                            <span className="bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded font-medium text-[10px]">
                              {m.type}
                            </span>
                            <span>&bull; {m.barangay}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-gray-900 text-sm">
                          {m.totalTonnes.toLocaleString()} MT
                        </span>
                        <span className="block text-[11px] text-gray-400">
                          {m.recordCount} records
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {user.role !== Role.BUYER && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {hasPermission(user.role, Permission.VIEW_SYSTEM_WIDE_RECORDS) ||
                hasPermission(user.role, Permission.VIEW_VALIDATION_QUEUE)
                  ? 'Recent Community Records'
                  : 'My Recent Records'}
              </CardTitle>
              <CardDescription>Latest biomass entries and their current statuses.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-agri-earth-500 uppercase bg-agri-cream-50 border-b border-agri-green-100">
                    <tr>
                      <th className="px-4 py-3 font-medium">Biomass Type</th>
                      <th className="px-4 py-3 font-medium">Reported Qty</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-agri-green-50">
                    {recentRecords.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                          No records found.
                        </td>
                      </tr>
                    ) : (
                      recentRecords.map((record) => {
                        const typeLabel = referenceData.find((r) => r.id === record.biomassTypeId)?.label;
                        const unitLabel = referenceData.find((r) => r.id === record.originalUnit)?.label;
                        const source = getSource(record.sourceId);

                        return (
                          <tr key={record.id} className="hover:bg-agri-green-50/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">{typeLabel}</td>
                            <td className="px-4 py-3 text-agri-earth-600">
                              {record.quantity.toLocaleString()} {unitLabel}
                            </td>
                            <td className="px-4 py-3 text-agri-earth-600">{source?.name}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={record.status} />
                            </td>
                            <td className="px-4 py-3 text-agri-earth-500">
                              {format(new Date(record.lastUpdatedDate), 'MMM d, yyyy')}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-center">
                <Link to="/biomass-records" className="text-sm font-medium text-agri-green-600 hover:text-agri-green-700">
                  View All Records &rarr;
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className={user.role === Role.BUYER ? 'lg:col-span-3' : ''}>
          <CardHeader className="pb-3 border-b border-gray-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity size={18} className="text-agri-green-600" />
                My Recent Actions
              </CardTitle>
              <CardDescription>Your logged interactions with the system.</CardDescription>
            </div>
            {hasPermission(user.role, Permission.VIEW_AUDIT_LOGS) && (
              <Link
                to="/audit-logs"
                className="text-xs font-semibold text-agri-green-600 hover:text-agri-green-700 flex items-center gap-1"
              >
                System Audit Trail <ExternalLink size={12} />
              </Link>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            {myRecentActions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity size={32} className="text-agri-green-200 mb-3" />
                <p className="text-sm font-medium text-gray-900">No Actions Recorded Yet</p>
                <p className="text-xs text-agri-earth-500 mt-1 max-w-[220px]">
                  Your submissions, validations, accepted inquiries, and messages will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {myRecentActions.map((log) => {
                  const meta = getActionMeta(log);
                  return (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-lg border border-gray-100 hover:bg-agri-green-50/40 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-md bg-white border border-gray-100 shadow-2xs mt-0.5 shrink-0">
                          {meta.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-gray-900">{meta.title}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${meta.badgeColor}`}>
                              {log.entityId}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                            {log.details || `${log.action} on ${log.entityType}`}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-1">
                            {format(new Date(log.timestamp), 'MMM d, yyyy • h:mm a')}
                          </p>
                        </div>
                      </div>
                      <Link
                        to={meta.targetLink}
                        className="shrink-0 text-[11px] font-semibold text-agri-green-600 hover:text-agri-green-800 flex items-center gap-0.5 mt-1"
                      >
                        View <ArrowRight size={11} />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
            {hasPermission(user.role, Permission.VIEW_AUDIT_LOGS) && (
              <div className="mt-4 text-center border-t border-gray-100 pt-3">
                <Link to="/audit-logs" className="text-xs font-semibold text-agri-green-600 hover:text-agri-green-700">
                  View Full System Audit Trail &rarr;
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
