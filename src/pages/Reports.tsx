import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { Role, RecordStatus, AggregationStatus } from '../types';
import { hasPermission, Permission, getRoleDisplayName } from '../utils/rbac';
import { Button } from '../components/ui/Button';
import {
  AlertTriangle,
  Activity,
  Layers,
  Download,
  Scale,
  MapPin,
  Users,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import {
  calculateCoreMetrics,
  calculateCategoryBreakdown,
  calculateBarangayRankings,
  convertToMetricTonnes,
} from '../utils/analytics';

const COLORS = ['#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#64748b', '#06b6d4'];

const safeLocaleDate = (value?: string): string => {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString();
};

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const {
    records,
    locations,
    sources,
    inquiries,
    aggregationGroups,
    aggregationMembers,
    profiles,
    auditLogs,
    referenceData,
  } = useData();

  const canGeneratePlanningReports = hasPermission(user?.role, Permission.GENERATE_REPORTS);
  const canViewAdminReports = hasPermission(user?.role, Permission.VIEW_ADMIN_REPORTS);
  const canViewInquiries = hasPermission(user?.role, Permission.VIEW_INQUIRIES);

  // Role-based record visibility:
  // - LGU/Institutional Planning User: strictly VALIDATED records only (view-only)
  // - LGU Biomass Information Coordinator & Administrator: system-wide records
  const accessibleRecords = useMemo(() => {
    if (!user) return [];
    if (user.role === Role.LGU) {
      return records.filter((r) => r.status === RecordStatus.VALIDATED);
    }
    return records;
  }, [user, records]);

  const accessibleInquiries = useMemo(() => {
    if (!user || !canViewInquiries) return [];
    return inquiries;
  }, [user, canViewInquiries, inquiries]);

  const coreMetrics = useMemo(
    () => calculateCoreMetrics(accessibleRecords, referenceData),
    [accessibleRecords, referenceData]
  );

  const categoryBreakdown = useMemo(
    () => calculateCategoryBreakdown(accessibleRecords, referenceData),
    [accessibleRecords, referenceData]
  );

  const barangayRankings = useMemo(
    () => calculateBarangayRankings(accessibleRecords, locations, sources, referenceData),
    [accessibleRecords, locations, sources, referenceData]
  );

  const aggregationSummary = useMemo(() => {
    const activeGroups = aggregationGroups.filter((g) => g.status === AggregationStatus.ACTIVE);
    const seenRecordIds = new Set<string>();
    let totalConsolidatedTonnes = 0;

    const groupRows = activeGroups.map((group) => {
      const members = aggregationMembers.filter((m) => m.groupId === group.id && m.isActive);
      let groupTonnes = 0;
      let validCount = 0;

      members.forEach((m) => {
        const rec = records.find((r) => r.id === m.biomassRecordId);
        if (!rec || rec.status !== RecordStatus.VALIDATED) return;
        const t = convertToMetricTonnes(
          rec.remainingQuantity ?? rec.quantity,
          rec.originalUnit,
          referenceData
        );
        groupTonnes += t;
        validCount++;
        if (!seenRecordIds.has(rec.id)) {
          seenRecordIds.add(rec.id);
          totalConsolidatedTonnes += t;
        }
      });

      return {
        id: group.id,
        name: group.name,
        biomassType:
          referenceData.find((r) => r.id === group.biomassTypeId)?.label || 'Biomass',
        memberCount: validCount,
        totalTonnes: Math.round(groupTonnes * 10) / 10,
      };
    });

    return {
      groupCount: activeGroups.length,
      totalConsolidatedTonnes: Math.round(totalConsolidatedTonnes * 10) / 10,
      groupRows,
    };
  }, [aggregationGroups, aggregationMembers, records, referenceData]);

  const statusDistribution = useMemo(() => {
    const counts = accessibleRecords.reduce((acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [accessibleRecords]);

  const inquiryDistribution = useMemo(() => {
    const counts = accessibleInquiries.reduce((acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [accessibleInquiries]);

  if (!user || (!canGeneratePlanningReports && !canViewAdminReports)) {
    return <div className="text-center py-10">Unauthorized access.</div>;
  }

  const staleRecords = accessibleRecords.filter((r) => r.status === RecordStatus.STALE);

  const exportPlanningCSV = () => {
    if (user.role === Role.LGU) {
      const headers = [
        'Record ID',
        'Biomass Type',
        'Available Quantity',
        'Unit',
        'Availability Window End',
        'Last Updated',
      ];
      const rows = accessibleRecords.map((r) => [
        r.id,
        `"${(referenceData.find((ref) => ref.id === r.biomassTypeId)?.label || 'Unknown').replace(/"/g, '""')}"`,
        String(r.remainingQuantity ?? r.quantity),
        `"${(referenceData.find((ref) => ref.id === r.originalUnit)?.label || r.originalUnit).replace(/"/g, '""')}"`,
        safeLocaleDate(r.availabilityPeriodEnd),
        safeLocaleDate(r.lastUpdatedDate),
      ]);
      const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `agricycle_validated_planning_report_${new Date().toISOString().split('T')[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const headers = ['Record ID', 'Biomass Type', 'Status', 'Availability Window', 'Last Updated'];
    const rows = staleRecords.map((r) => [
      r.id,
      `"${(referenceData.find((ref) => ref.id === r.biomassTypeId)?.label || 'Unknown').replace(/"/g, '""')}"`,
      r.status,
      safeLocaleDate(r.availabilityPeriodEnd),
      safeLocaleDate(r.lastUpdatedDate),
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `agricycle_stale_records_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {user.role === Role.ADMINISTRATOR
              ? 'Administrative System Reports'
              : user.role === Role.LGU
              ? 'LGU / Institutional Planning Reports'
              : 'Monitoring & Analytics Reports'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            {getRoleDisplayName(user.role)} &bull; Summaries derived strictly from recorded system data.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
            Report Generated: {new Date().toLocaleDateString()}
          </div>
          {user.role !== Role.ADMINISTRATOR && (
            <Button onClick={exportPlanningCSV} variant="outline" size="sm" icon={<Download size={14} />}>
              {user.role === Role.LGU ? 'Export Validated CSV' : 'Export Freshness'}
            </Button>
          )}
        </div>
      </div>

      {user.role === Role.LGU && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 text-sm text-blue-900">
          <Eye size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">View-Only Planning Scope</p>
            <p className="text-xs text-blue-800 mt-0.5">
              Planning reports reflect strictly validated biomass records and information-based aggregation summaries. Buyer inquiries, unvalidated drafts, and account administration data are excluded.
            </p>
          </div>
        </div>
      )}

      {user.role === Role.ADMINISTRATOR && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3 text-sm text-purple-900">
          <ShieldCheck size={18} className="text-purple-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Administrative Summary Scope</p>
            <p className="text-xs text-purple-800 mt-0.5">
              Provides system-level account, audit, and aggregate biomass metrics. Operational validation queues and buyer inquiry management remain strictly separated under the LGU Biomass Information Coordinator role.
            </p>
          </div>
        </div>
      )}

      {/* Core Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-agri-green-200 bg-gradient-to-br from-white to-agri-green-50/30">
          <CardContent className="p-5 flex items-center">
            <div className="w-12 h-12 rounded-xl bg-agri-green-100 flex items-center justify-center text-agri-green-700 mr-4 shrink-0 shadow-sm">
              <Scale size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-agri-earth-600 uppercase tracking-wider">
                Validated Available Volume
              </p>
              <p className="text-2xl font-extrabold text-agri-green-800 mt-0.5">
                {coreMetrics.availableVolumeTonnes.toLocaleString()}{' '}
                <span className="text-sm font-semibold text-agri-green-600">MT</span>
              </p>
              <p className="text-[11px] text-agri-earth-500 mt-0.5">
                {coreMetrics.validatedCount} validated records
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20">
          <CardContent className="p-5 flex items-center">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 mr-4 shrink-0 shadow-sm">
              <Layers size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">
                {user.role === Role.LGU ? 'Validated Gross Volume' : 'Total Recorded Volume'}
              </p>
              <p className="text-2xl font-extrabold text-gray-900 mt-0.5">
                {coreMetrics.totalVolumeTonnes.toLocaleString()}{' '}
                <span className="text-sm font-semibold text-gray-500">MT</span>
              </p>
              <p className="text-[11px] text-agri-earth-500 mt-0.5">
                Across {coreMetrics.totalRecordsCount} records
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-100 bg-gradient-to-br from-white to-amber-50/20">
          <CardContent className="p-5 flex items-center">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 mr-4 shrink-0 shadow-sm">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                Internal / Committed Use
              </p>
              <p className="text-2xl font-extrabold text-gray-900 mt-0.5">
                {coreMetrics.usedOrCommittedVolumeTonnes.toLocaleString()}{' '}
                <span className="text-sm font-semibold text-gray-500">MT</span>
              </p>
              <p className="text-[11px] text-agri-earth-500 mt-0.5">
                Internal utilization &amp; reserved
              </p>
            </div>
          </CardContent>
        </Card>

        {user.role === Role.ADMINISTRATOR ? (
          <Card className="border-purple-100 bg-gradient-to-br from-white to-purple-50/20">
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 mr-4 shrink-0 shadow-sm">
                <Users size={24} />
              </div>
              <div>
                <p className="text-xs font-semibold text-purple-800 uppercase tracking-wider">
                  Accounts &amp; Audit Events
                </p>
                <p className="text-2xl font-extrabold text-gray-900 mt-0.5">
                  {profiles.length}{' '}
                  <span className="text-xs font-medium text-gray-500">accounts</span>
                </p>
                <p className="text-[11px] text-agri-earth-500 mt-0.5">
                  {auditLogs.length} logged audit events
                </p>
              </div>
            </CardContent>
          </Card>
        ) : user.role === Role.LGU ? (
          <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/20">
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 mr-4 shrink-0 shadow-sm">
                <Layers size={24} />
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">
                  Active Aggregation Groups
                </p>
                <p className="text-2xl font-extrabold text-gray-900 mt-0.5">
                  {aggregationSummary.groupCount}{' '}
                  <span className="text-xs font-medium text-gray-500">groups</span>
                </p>
                <p className="text-[11px] text-agri-earth-500 mt-0.5">
                  {aggregationSummary.totalConsolidatedTonnes.toLocaleString()} MT consolidated
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-purple-100 bg-gradient-to-br from-white to-purple-50/20">
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 mr-4 shrink-0 shadow-sm">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-xs font-semibold text-purple-800 uppercase tracking-wider">
                  Pending Review &amp; Stale
                </p>
                <p className="text-2xl font-extrabold text-gray-900 mt-0.5">
                  {coreMetrics.pendingValidationCount}{' '}
                  <span className="text-xs font-medium text-gray-500">pending</span>
                </p>
                <p className="text-[11px] text-agri-earth-500 mt-0.5">
                  {coreMetrics.staleCount} records need revalidation
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Biomass Volume by Category (Metric Tonnes)</CardTitle>
            <CardDescription>
              Recorded volume vs. validated available volume by feedstock category.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
            {categoryBreakdown.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                No biomass records available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryBreakdown} margin={{ top: 20, right: 30, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="categoryName"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    unit=" t"
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => [
                      `${Number(value).toLocaleString()} MT`,
                      name === 'totalQuantityTonnes' ? 'Total Volume' : 'Available Volume',
                    ]}
                  />
                  <Bar
                    dataKey="totalQuantityTonnes"
                    name="totalQuantityTonnes"
                    fill="#94a3b8"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="availableQuantityTonnes"
                    name="availableQuantityTonnes"
                    fill="#16a34a"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {user.role !== Role.LGU ? (
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Record Status Distribution</CardTitle>
              <CardDescription>
                Validation and freshness state across system biomass records.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px]">
              {statusDistribution.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                  No records available yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                    >
                      {statusDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #f1f5f9',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin size={18} className="text-agri-green-600" />
                Butuan City Barangay Concentration
              </CardTitle>
              <CardDescription>
                Validated biomass availability ranked by barangay for LGU planning.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              {barangayRankings.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No validated location data available yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {barangayRankings.slice(0, 5).map((b, idx) => (
                    <div
                      key={b.barangay}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 hover:bg-agri-green-50/40 transition-colors border border-gray-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-agri-green-100 text-agri-green-800 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{b.barangay}</div>
                          <div className="text-xs text-agri-earth-500">{b.recordCount} validated records</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-900 text-sm">
                          {b.totalVolumeTonnes.toLocaleString()} MT
                        </div>
                        <div className="text-[11px] text-agri-green-700 font-medium">
                          {b.availableVolumeTonnes.toLocaleString()} MT avail.
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {canViewInquiries && (
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Inquiry Status Distribution</CardTitle>
              <CardDescription>
                Monitoring buyer inquiries received and coordinated by LGU Biomass Information Coordinators.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px]">
              {inquiryDistribution.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                  No inquiries available yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={inquiryDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                    >
                      {inquiryDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #f1f5f9',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {user.role !== Role.LGU && (
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin size={18} className="text-agri-green-600" />
                Butuan City Barangay Concentration
              </CardTitle>
              <CardDescription>
                Geographic rankings by recorded biomass tonnage and verified availability.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              {barangayRankings.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No location data recorded yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {barangayRankings.slice(0, 5).map((b, idx) => (
                    <div
                      key={b.barangay}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 hover:bg-agri-green-50/40 transition-colors border border-gray-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-agri-green-100 text-agri-green-800 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{b.barangay}</div>
                          <div className="text-xs text-agri-earth-500">{b.recordCount} records</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-900 text-sm">
                          {b.totalVolumeTonnes.toLocaleString()} MT
                        </div>
                        <div className="text-[11px] text-agri-green-700 font-medium">
                          {b.availableVolumeTonnes.toLocaleString()} MT avail.
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Information-Based Aggregation Summary (Non-double-counting) */}
      {(user.role === Role.COORDINATOR || user.role === Role.LGU) && (
        <Card>
          <CardHeader>
            <CardTitle>Information-Based Biomass Aggregation Summary</CardTitle>
            <CardDescription>
              Consolidated validated volumes grouped by biomass type without physical hub warehousing or double-counting ({aggregationSummary.totalConsolidatedTonnes.toLocaleString()} MT unique consolidated volume).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-agri-earth-500 font-semibold tracking-wider">
                    <th className="px-5 py-3">Group ID</th>
                    <th className="px-5 py-3">Aggregation Name</th>
                    <th className="px-5 py-3">Biomass Type</th>
                    <th className="px-5 py-3">Validated Member Records</th>
                    <th className="px-5 py-3 text-right">Consolidated Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {aggregationSummary.groupRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-6 text-center text-gray-500">
                        No active aggregation groups recorded.
                      </td>
                    </tr>
                  ) : (
                    aggregationSummary.groupRows.map((g) => (
                      <tr key={g.id} className="hover:bg-agri-green-50/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">{g.id}</td>
                        <td className="px-5 py-3 font-medium text-gray-900">{g.name}</td>
                        <td className="px-5 py-3 text-agri-earth-600">{g.biomassType}</td>
                        <td className="px-5 py-3 text-gray-700">{g.memberCount}</td>
                        <td className="px-5 py-3 text-right font-semibold text-agri-green-800">
                          {g.totalTonnes.toLocaleString()} MT
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Freshness Queue for Coordinator */}
      {user.role === Role.COORDINATOR && (
        <Card>
          <CardHeader>
            <CardTitle>Data Freshness &amp; Revalidation Queue</CardTitle>
            <CardDescription>
              Records identified as stale or nearing expiration that require Coordinator update.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-agri-earth-500 font-semibold tracking-wider">
                    <th className="px-5 py-4">Record ID</th>
                    <th className="px-5 py-4">Biomass Type</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Availability Window</th>
                    <th className="px-5 py-4 text-right">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {staleRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                        No records currently require freshness review.
                      </td>
                    </tr>
                  ) : (
                    staleRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-red-50/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">{r.id}</td>
                        <td className="px-5 py-3 font-medium text-gray-900">
                          {referenceData.find((ref) => ref.id === r.biomassTypeId)?.label}
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs bg-red-100 text-red-800 font-semibold px-2 py-1 rounded uppercase">
                            {r.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-agri-earth-600 text-xs">
                          {safeLocaleDate(r.availabilityPeriodEnd)}
                        </td>
                        <td className="px-5 py-3 text-right text-agri-earth-500 text-xs">
                          {safeLocaleDate(r.lastUpdatedDate)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
