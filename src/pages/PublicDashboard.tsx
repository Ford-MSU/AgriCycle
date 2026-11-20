import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Scale,
  FileCheck2,
  Tractor,
  MapPin,
  Search,
  Layers,
  Download,
  Info,
  ChevronLeft,
  ChevronRight,
  Building2,
  ArrowDown,
  BarChart3,
} from 'lucide-react';
import { AggregationStatus, Location, RecordStatus, Role } from '../types';
import { useData } from '../store/DataContext';
import {
  calculateBarangayRankings,
  calculateCategoryBreakdown,
  calculateCoreMetrics,
  convertToMetricTonnes,
} from '../utils/analytics';
import {
  formatLocationHierarchy,
  normalizeRegionName,
  resolveLocationRegion,
} from '../utils/philippineLocations';
import { PublicHeader } from '../components/PublicHeader';
import { PublicBiomassMap } from '../components/PublicBiomassMap';
import { AccessWorkspace } from '../components/AccessWorkspace';
import { BrandLogo } from '../components/BrandLogo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { LocationFilterSelects } from '../components/LocationSelector';

const safeFormatDate = (value?: string, fmt = 'MMM d, yyyy'): string => {
  if (!value) return 'Flexible';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Flexible' : format(d, fmt);
};

interface PublicDashboardProps {
  scrollToLoginOnMount?: boolean;
  initialPortal?: Role.COORDINATOR | Role.BUYER | null;
}

const PAGE_SIZE = 8;

export const PublicDashboard: React.FC<PublicDashboardProps> = ({
  scrollToLoginOnMount = false,
  initialPortal = null,
}) => {
  const { publicDataset, isPublicLoading, publicError } = useData();

  const [activeSection, setActiveSection] = useState<string>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState({
    region: 'ALL',
    province: 'ALL',
    city: 'ALL',
    barangay: 'ALL',
  });
  const [currentPage, setCurrentPage] = useState(1);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    if (scrollToLoginOnMount) {
      const timer = setTimeout(() => {
        scrollToSection('access-workspace');
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [scrollToLoginOnMount]);

  const {
    records,
    sources,
    locations,
    referenceData,
    aggregationGroups,
    aggregationMembers,
  } = publicDataset;

  // Strictly enforce VALIDATED-only invariant
  const validatedRecords = useMemo(
    () => records.filter((r) => r.status === RecordStatus.VALIDATED),
    [records]
  );

  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const refMap = useMemo(() => new Map(referenceData.map((r) => [r.id, r])), [referenceData]);

  const biomassTypes = useMemo(
    () => referenceData.filter((r) => r.category === 'BIOMASS_TYPE' && r.isActive),
    [referenceData]
  );

  const coreMetrics = useMemo(
    () => calculateCoreMetrics(validatedRecords, referenceData),
    [validatedRecords, referenceData]
  );

  const validatedSourceCount = useMemo(
    () => new Set(validatedRecords.map((r) => r.sourceId)).size,
    [validatedRecords]
  );

  const utilizationStats = useMemo(() => {
    let availableTonnes = 0;
    let internalTonnes = 0;
    let reservedTonnes = 0;

    validatedRecords.forEach((r) => {
      const totalT = convertToMetricTonnes(r.quantity, r.originalUnit, referenceData);
      const reservedT =
        r.reservedQuantity !== undefined
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
        currentUseT = Math.max(
          0,
          totalT - convertToMetricTonnes(r.remainingQuantity, r.originalUnit, referenceData) - reservedT
        );
      }

      const remainingT =
        r.remainingQuantity !== undefined
          ? convertToMetricTonnes(r.remainingQuantity, r.originalUnit, referenceData)
          : Math.max(0, totalT - currentUseT - reservedT);

      if (r.externalAvailability === 'NOT_AVAILABLE') {
        internalTonnes += totalT;
      } else {
        internalTonnes += currentUseT;
        reservedTonnes += reservedT;
        availableTonnes += remainingT;
      }
    });

    const totalT = Math.round((availableTonnes + internalTonnes + reservedTonnes) * 10) / 10;
    return {
      availableTonnes: Math.round(availableTonnes * 10) / 10,
      internalTonnes: Math.round(internalTonnes * 10) / 10,
      reservedTonnes: Math.round(reservedTonnes * 10) / 10,
      totalT,
      availablePercent: totalT > 0 ? Math.round((availableTonnes / totalT) * 100) : 0,
      internalPercent: totalT > 0 ? Math.round((internalTonnes / totalT) * 100) : 0,
      reservedPercent: totalT > 0 ? Math.round((reservedTonnes / totalT) * 100) : 0,
    };
  }, [validatedRecords, referenceData]);

  const categoryBreakdown = useMemo(
    () => calculateCategoryBreakdown(validatedRecords, referenceData),
    [validatedRecords, referenceData]
  );

  const aggregationSummary = useMemo(() => {
    const activeGroups = aggregationGroups.filter((g) => g.status === AggregationStatus.ACTIVE);
    const seenRecordIds = new Set<string>();
    let uniqueTotalTonnes = 0;

    const groupRows = activeGroups.map((group) => {
      const members = aggregationMembers.filter((m) => m.groupId === group.id && m.isActive);
      let totalOrig = 0;
      let unitLabel = '';
      let isMixed = false;
      let groupTonnes = 0;
      let validCount = 0;

      members.forEach((m) => {
        const rec = validatedRecords.find((r) => r.id === m.biomassRecordId);
        if (!rec) return;
        validCount++;
        const qty = rec.remainingQuantity ?? rec.quantity;
        const uLabel = refMap.get(rec.originalUnit)?.label || '';
        if (!unitLabel) unitLabel = uLabel;
        else if (unitLabel !== uLabel) isMixed = true;
        totalOrig += qty;

        const t = convertToMetricTonnes(qty, rec.originalUnit, referenceData);
        groupTonnes += t;
        if (!seenRecordIds.has(rec.id)) {
          seenRecordIds.add(rec.id);
          uniqueTotalTonnes += t;
        }
      });

      return {
        id: group.id,
        name: group.name,
        biomassType: refMap.get(group.biomassTypeId)?.label || 'Biomass',
        memberCount: validCount,
        displayTotal: isMixed
          ? `${(Math.round(groupTonnes * 10) / 10).toLocaleString()} MT`
          : `${totalOrig.toLocaleString()} ${unitLabel}`,
        totalTonnes: Math.round(groupTonnes * 10) / 10,
        updatedAt: group.updatedAt,
      };
    });

    return {
      groupCount: activeGroups.length,
      uniqueTotalTonnes: Math.round(uniqueTotalTonnes * 10) / 10,
      groupRows,
    };
  }, [aggregationGroups, aggregationMembers, validatedRecords, refMap, referenceData]);

  const barangayRankings = useMemo(
    () => calculateBarangayRankings(validatedRecords, locations, sources, referenceData),
    [validatedRecords, locations, sources, referenceData]
  );

  const availableFilterLocations = useMemo(() => {
    const map = new Map<string, Location>();
    validatedRecords.forEach((rec) => {
      const src = sourceMap.get(rec.sourceId);
      const loc = locationMap.get(src?.locationId || rec.locationId);
      if (loc) map.set(loc.id, loc);
    });
    return Array.from(map.values());
  }, [validatedRecords, sourceMap, locationMap]);

  const filteredTableRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return validatedRecords
      .map((record) => {
        const typeLabel = refMap.get(record.biomassTypeId)?.label || 'Biomass';
        const unitLabel = refMap.get(record.originalUnit)?.label || '';
        const source = sourceMap.get(record.sourceId);
        const location = locationMap.get(source?.locationId || record.locationId);
        return { record, typeLabel, unitLabel, source, location };
      })
      .filter(({ typeLabel, source, location, record }) => {
        if (typeFilter !== 'ALL' && record.biomassTypeId !== typeFilter) return false;

        const hasLocFilter =
          locationFilter.region !== 'ALL' ||
          locationFilter.province !== 'ALL' ||
          locationFilter.city !== 'ALL' ||
          locationFilter.barangay !== 'ALL';
        if (hasLocFilter) {
          if (!location) return false;
          if (locationFilter.region !== 'ALL' && normalizeRegionName(location.region) !== locationFilter.region) {
            return false;
          }
          if (locationFilter.province !== 'ALL' && location.province !== locationFilter.province) {
            return false;
          }
          if (locationFilter.city !== 'ALL' && location.city !== locationFilter.city) {
            return false;
          }
          if (locationFilter.barangay !== 'ALL' && location.barangay !== locationFilter.barangay) {
            return false;
          }
        }

        if (!query) return true;
        const locStr = formatLocationHierarchy(location).toLowerCase();
        return (
          typeLabel.toLowerCase().includes(query) ||
          (source?.name || '').toLowerCase().includes(query) ||
          (source?.type || '').toLowerCase().includes(query) ||
          locStr.includes(query)
        );
      });
  }, [validatedRecords, refMap, sourceMap, locationMap, typeFilter, locationFilter, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, locationFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTableRecords.length / PAGE_SIZE));
  const paginatedRecords = filteredTableRecords.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const exportPlanningCSV = () => {
    const headers = [
      'Biomass Type',
      'Biomass Source',
      'Source Category',
      'Barangay',
      'City/Municipality',
      'Province',
      'Region',
      'Available Quantity',
      'Unit',
      'Availability Start',
      'Availability End',
      'Validation Status',
    ];
    const rows = filteredTableRecords.map(({ record, typeLabel, unitLabel, source, location }) => [
      `"${typeLabel.replace(/"/g, '""')}"`,
      `"${(source?.name || 'Validated Source').replace(/"/g, '""')}"`,
      `"${(source?.type || '').replace(/"/g, '""')}"`,
      `"${(location?.barangay || '').replace(/"/g, '""')}"`,
      `"${(location?.city || '').replace(/"/g, '""')}"`,
      `"${(location?.province || '').replace(/"/g, '""')}"`,
      `"${(location ? resolveLocationRegion(location) : '').replace(/"/g, '""')}"`,
      String(record.remainingQuantity ?? record.quantity),
      `"${unitLabel.replace(/"/g, '""')}"`,
      safeFormatDate(record.availabilityPeriodStart),
      safeFormatDate(record.availabilityPeriodEnd),
      'VALIDATED',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `agricycle_validated_biomass_overview_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#F7FAF7] text-[#1E3328] flex flex-col">
      <PublicHeader onNavigateSection={scrollToSection} activeSection={activeSection} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {/* SECTION 1 — Dashboard Introduction */}
        <section id="overview" className="scroll-mt-24">
          <div className="bg-white border border-[#E2EAE3] rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
              <div className="space-y-4 max-w-3xl">
                <div className="flex flex-wrap items-center gap-4">
                  <BrandLogo size="lg" />
                  <div className="border-l border-[#E2EAE3] pl-4">
                    <p className="text-xl font-bold text-[#1E3328] tracking-tight">
                      Agri<span className="text-[#48A818]">Cycle</span>
                    </p>
                    <p className="text-xs font-medium text-[#64756A]">
                      Community-Based Biomass Information Management &amp; Market Linkage System
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#EAF4EC] border border-[#C3DFC8] text-xs font-semibold text-[#006B45]">
                  <MapPin size={14} className="shrink-0" />
                  <span>Study Location: Butuan City, Philippines</span>
                </div>

                <div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1E3328] tracking-tight">
                    Biomass Information Overview
                  </h1>
                  <p className="text-base text-[#64756A] mt-3 leading-relaxed">
                    Explore validated agricultural biomass information, availability, and geographic distribution to support local planning and waste-to-value opportunities.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="button"
                    onClick={() => scrollToSection('gis-map')}
                    icon={<MapPin size={16} />}
                  >
                    Explore GIS Map
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => scrollToSection('validated-records')}
                  >
                    Browse Validated Records
                  </Button>
                  <button
                    type="button"
                    onClick={() => scrollToSection('access-workspace')}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#006B45] hover:text-[#00452C] px-2 py-1.5 cursor-pointer"
                  >
                    <span>Workspace Login</span>
                    <ArrowDown size={15} />
                  </button>
                </div>
              </div>

              {/* Compact Study Context Highlight Box */}
              <div className="lg:w-80 shrink-0 bg-[#F7FAF7] border border-[#E2EAE3] rounded-xl p-5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#006B45]">
                  LGU Planning Scope
                </p>
                <p className="text-sm font-semibold text-[#1E3328]">
                  Validated Public Information
                </p>
                <p className="text-xs text-[#64756A] leading-relaxed">
                  All volumes, locations, and aggregation summaries displayed on this dashboard reflect coordinator-validated records only. Private contact details, pending submissions, and system logs are excluded.
                </p>
                <div className="pt-2 border-t border-[#E2EAE3] flex items-center justify-between text-xs">
                  <span className="text-[#64756A]">Data Standard</span>
                  <span className="font-semibold text-[#006B45]">Metric Tonnes (MT)</span>
                </div>
              </div>
            </div>
          </div>

          {publicError && (
            <div className="mt-4 bg-[#FFF7E2] border border-[#F5DA8A] text-[#8F6500] px-4 py-3 rounded-xl text-sm flex items-start gap-2.5">
              <Info size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Public Planning Overview Notice</p>
                <p className="text-xs mt-0.5">{publicError}</p>
              </div>
            </div>
          )}
        </section>

        {/* SECTION 2 — Biomass Volume and Key Indicators */}
        <section aria-label="Validated Biomass Key Indicators">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <Card className="border-[#C3DFC8] bg-white">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#EAF4EC] text-[#006B45] flex items-center justify-center shrink-0">
                  <Scale size={24} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#64756A]">
                    Validated Available Volume
                  </p>
                  <p className="text-2xl font-extrabold text-[#006B45] mt-1 tabular-nums">
                    {isPublicLoading ? '—' : coreMetrics.availableVolumeTonnes.toLocaleString()}{' '}
                    <span className="text-sm font-semibold text-[#48A818]">MT</span>
                  </p>
                  <p className="text-xs text-[#64756A] mt-0.5">
                    Ready for planning &amp; inquiries
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#EAF4EC] text-[#008838] flex items-center justify-center shrink-0">
                  <Layers size={24} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#64756A]">
                    Total Validated Volume
                  </p>
                  <p className="text-2xl font-extrabold text-[#1E3328] mt-1 tabular-nums">
                    {isPublicLoading ? '—' : coreMetrics.totalVolumeTonnes.toLocaleString()}{' '}
                    <span className="text-sm font-semibold text-[#64756A]">MT</span>
                  </p>
                  <p className="text-xs text-[#64756A] mt-0.5">
                    Gross validated biomass reported
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#FFF7E2] text-[#9C6E00] flex items-center justify-center shrink-0">
                  <FileCheck2 size={24} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#64756A]">
                    Validated Biomass Records
                  </p>
                  <p className="text-2xl font-extrabold text-[#1E3328] mt-1 tabular-nums">
                    {isPublicLoading ? '—' : coreMetrics.validatedCount.toLocaleString()}
                  </p>
                  <p className="text-xs text-[#64756A] mt-0.5">
                    Verified by LGU Coordinators
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#EAF4EC] text-[#48A818] flex items-center justify-center shrink-0">
                  <Tractor size={24} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#64756A]">
                    Validated Biomass Sources
                  </p>
                  <p className="text-2xl font-extrabold text-[#1E3328] mt-1 tabular-nums">
                    {isPublicLoading ? '—' : validatedSourceCount.toLocaleString()}
                  </p>
                  <p className="text-xs text-[#64756A] mt-0.5">
                    Registered farms &amp; mills
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* SECTION 3 — GIS Biomass Distribution Map */}
        <section id="gis-map" className="scroll-mt-24">
          <PublicBiomassMap
            records={validatedRecords}
            sources={sources}
            locations={locations}
            referenceData={referenceData}
          />
        </section>

        {/* SECTION 4 — Validated Biomass Records (Read-Only) */}
        <section id="validated-records" className="scroll-mt-24">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-[#E2EAE3] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Validated Biomass Records</CardTitle>
                <CardDescription className="mt-1">
                  Read-only directory of coordinator-validated biomass availability across participating barangays.
                </CardDescription>
              </div>
              <span className="text-xs font-semibold text-[#006B45] bg-[#EAF4EC] border border-[#C3DFC8] px-3 py-1 rounded-md tabular-nums self-start sm:self-auto">
                {filteredTableRecords.length} Validated{' '}
                {filteredTableRecords.length === 1 ? 'Record' : 'Records'}
              </span>
            </CardHeader>

            <CardContent className="p-0">
              {/* Search & Filter Toolbar */}
              <div className="p-4 sm:p-5 bg-[#F7FAF7]/70 border-b border-[#E2EAE3] space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="relative md:col-span-2">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64756A]"
                    />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search biomass type, source name, barangay, or city..."
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#E2EAE3] bg-white text-sm text-[#1E3328] placeholder:text-[#64756A]/70 focus:outline-none focus:ring-2 focus:ring-[#006B45]"
                    />
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="h-10 px-3 rounded-lg border border-[#E2EAE3] bg-white text-sm text-[#1E3328] focus:outline-none focus:ring-2 focus:ring-[#006B45]"
                  >
                    <option value="ALL">All Biomass Types</option>
                    {biomassTypes.map((bt) => (
                      <option key={bt.id} value={bt.id}>
                        {bt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {availableFilterLocations.length > 0 && (
                  <LocationFilterSelects
                    locations={availableFilterLocations}
                    value={locationFilter}
                    onChange={setLocationFilter}
                    compact
                  />
                )}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#F7FAF7] border-b border-[#E2EAE3] text-xs font-semibold uppercase tracking-wider text-[#64756A]">
                      <th className="px-5 py-3.5">Biomass Type</th>
                      <th className="px-5 py-3.5">Biomass Source</th>
                      <th className="px-5 py-3.5">Barangay &amp; City</th>
                      <th className="px-5 py-3.5 text-right">Available Qty</th>
                      <th className="px-5 py-3.5">Availability Period</th>
                      <th className="px-5 py-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2EAE3]">
                    {isPublicLoading && paginatedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-[#64756A]">
                          Loading validated biomass records...
                        </td>
                      </tr>
                    ) : paginatedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-[#64756A]">
                          No validated biomass records match your current filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedRecords.map(({ record, typeLabel, unitLabel, source, location }) => {
                        const availQty = record.remainingQuantity ?? record.quantity;
                        const periodText =
                          record.availabilityPeriodStart && record.availabilityPeriodEnd
                            ? `${safeFormatDate(record.availabilityPeriodStart, 'MMM d')} – ${safeFormatDate(
                                record.availabilityPeriodEnd,
                                'MMM d, yyyy'
                              )}`
                            : record.availabilityPeriodStart
                            ? `From ${safeFormatDate(record.availabilityPeriodStart)}`
                            : 'Flexible / Ongoing';

                        return (
                          <tr
                            key={record.id}
                            className="hover:bg-[#EAF4EC]/35 transition-colors"
                          >
                            <td className="px-5 py-3.5 font-semibold text-[#1E3328]">
                              {typeLabel}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="font-medium text-[#1E3328]">
                                {source?.name || 'Validated Biomass Source'}
                              </div>
                              {source?.type && (
                                <div className="text-xs text-[#64756A]">{source.type}</div>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="font-medium text-[#1E3328]">
                                {location?.barangay || 'Not specified'}
                              </div>
                              <div className="text-xs text-[#64756A]">
                                {[location?.city, location?.province].filter(Boolean).join(', ') ||
                                  'Philippines'}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <span className="font-bold text-[#006B45] tabular-nums">
                                {availQty.toLocaleString()}
                              </span>{' '}
                              <span className="text-xs text-[#64756A]">{unitLabel}</span>
                            </td>
                            <td className="px-5 py-3.5 text-xs text-[#64756A] whitespace-nowrap">
                              {periodText}
                            </td>
                            <td className="px-5 py-3.5">
                              <StatusBadge status={RecordStatus.VALIDATED} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              {filteredTableRecords.length > PAGE_SIZE && (
                <div className="px-5 py-3.5 border-t border-[#E2EAE3] bg-[#F7FAF7]/60 flex items-center justify-between text-xs text-[#64756A]">
                  <span className="tabular-nums">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(currentPage * PAGE_SIZE, filteredTableRecords.length)} of{' '}
                    {filteredTableRecords.length} validated records
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      icon={<ChevronLeft size={14} />}
                    >
                      Previous
                    </Button>
                    <span className="font-semibold text-[#1E3328] tabular-nums">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* SECTION 5 — Availability and Aggregation Summaries */}
        <section id="aggregation-summaries" className="scroll-mt-24 space-y-6">
          {/* Availability vs Internal Producer Use */}
          <Card>
            <CardHeader className="border-b border-[#E2EAE3] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Layers size={19} className="text-[#006B45]" />
                  Biomass Availability &amp; Utilization Summary
                </CardTitle>
                <CardDescription className="mt-1">
                  Comparison of validated biomass available for external market linkage versus internal producer utilization and committed holds.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5 text-[#006B45]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#006B45] inline-block" />
                  Available ({utilizationStats.availablePercent}%)
                </span>
                <span className="flex items-center gap-1.5 text-[#9C6E00]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E8A800] inline-block" />
                  Internal Use ({utilizationStats.internalPercent}%)
                </span>
                <span className="flex items-center gap-1.5 text-[#008838]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#48A818] inline-block" />
                  Reserved ({utilizationStats.reservedPercent}%)
                </span>
              </div>
            </CardHeader>

            <CardContent className="pt-5 space-y-5">
              <div className="w-full h-3.5 bg-[#EAF4EC] rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${utilizationStats.availablePercent}%` }}
                  className="bg-[#006B45] transition-all duration-500"
                  title={`Available: ${utilizationStats.availableTonnes} MT`}
                />
                <div
                  style={{ width: `${utilizationStats.internalPercent}%` }}
                  className="bg-[#E8A800] transition-all duration-500"
                  title={`Internal Producer Use: ${utilizationStats.internalTonnes} MT`}
                />
                <div
                  style={{ width: `${utilizationStats.reservedPercent}%` }}
                  className="bg-[#48A818] transition-all duration-500"
                  title={`Reserved / Committed: ${utilizationStats.reservedTonnes} MT`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#EAF4EC]/70 border border-[#C3DFC8]">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#006B45]">
                    <span>Available for Linkage</span>
                    <span className="tabular-nums">{utilizationStats.availablePercent}%</span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#1E3328] mt-1 tabular-nums">
                    {utilizationStats.availableTonnes.toLocaleString()}{' '}
                    <span className="text-xs font-semibold text-[#006B45]">MT</span>
                  </p>
                  <p className="text-xs text-[#64756A] mt-0.5">
                    Validated &amp; open for non-binding inquiries
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#FFF7E2]/80 border border-[#F5DA8A]">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#8F6500]">
                    <span>Internal Producer Use</span>
                    <span className="tabular-nums">{utilizationStats.internalPercent}%</span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#1E3328] mt-1 tabular-nums">
                    {utilizationStats.internalTonnes.toLocaleString()}{' '}
                    <span className="text-xs font-semibold text-[#9C6E00]">MT</span>
                  </p>
                  <p className="text-xs text-[#64756A] mt-0.5">
                    Retained for boiler fuel, mulch, or on-site reuse
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#F7FAF7] border border-[#E2EAE3]">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#008838]">
                    <span>Reserved / Committed</span>
                    <span className="tabular-nums">{utilizationStats.reservedPercent}%</span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#1E3328] mt-1 tabular-nums">
                    {utilizationStats.reservedTonnes.toLocaleString()}{' '}
                    <span className="text-xs font-semibold text-[#48A818]">MT</span>
                  </p>
                  <p className="text-xs text-[#64756A] mt-0.5">
                    Allocated to prior arrangements
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Biomass Distribution by Category Chart */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 size={18} className="text-[#006B45]" />
                  Biomass Volume by Category (MT)
                </CardTitle>
                <CardDescription>
                  Total validated volume compared with externally available volume per feedstock.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-[290px]">
                {categoryBreakdown.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-sm text-[#64756A]">
                    No validated category data available yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={290}>
                    <BarChart
                      data={categoryBreakdown}
                      margin={{ top: 12, right: 20, left: 4, bottom: 28 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2EAE3" />
                      <XAxis
                        dataKey="categoryName"
                        tick={{ fontSize: 11, fill: '#64756A' }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        angle={-18}
                        textAnchor="end"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64756A' }}
                        axisLine={false}
                        tickLine={false}
                        unit=" t"
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #E2EAE3',
                          backgroundColor: '#FFFFFF',
                          color: '#1E3328',
                        }}
                        formatter={(value: any, name: any) => [
                          `${Number(value).toLocaleString()} MT`,
                          name === 'totalQuantityTonnes'
                            ? 'Total Validated'
                            : 'Available Volume',
                        ]}
                      />
                      <Bar
                        dataKey="totalQuantityTonnes"
                        name="totalQuantityTonnes"
                        fill="#C3DFC8"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        dataKey="availableQuantityTonnes"
                        name="availableQuantityTonnes"
                        fill="#006B45"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Information-Level Aggregation Groups */}
            <Card className="flex flex-col">
              <CardHeader className="border-b border-[#E2EAE3] pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">
                      Active Aggregation Summaries
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Information-level consolidation of compatible validated records ({aggregationSummary.uniqueTotalTonnes.toLocaleString()} MT unique consolidated volume).
                    </CardDescription>
                  </div>
                  <span className="text-xs font-semibold bg-[#EAF4EC] text-[#006B45] border border-[#C3DFC8] px-2.5 py-1 rounded-md tabular-nums shrink-0">
                    {aggregationSummary.groupCount} Active
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-4 flex-1 flex flex-col justify-between gap-4">
                {aggregationSummary.groupRows.length === 0 ? (
                  <div className="py-10 text-center text-sm text-[#64756A]">
                    No active information-level aggregation groups currently published.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {aggregationSummary.groupRows.map((group) => (
                      <div
                        key={group.id}
                        className="p-3.5 rounded-xl border border-[#E2EAE3] bg-[#F7FAF7]/60 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-[#1E3328] truncate">
                            {group.name}
                          </p>
                          <p className="text-xs text-[#64756A] mt-0.5">
                            {group.biomassType} &bull; {group.memberCount} validated member{' '}
                            {group.memberCount === 1 ? 'record' : 'records'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm text-[#006B45] tabular-nums">
                            {group.displayTotal}
                          </p>
                          <p className="text-[11px] text-[#64756A] tabular-nums">
                            ~{group.totalTonnes.toLocaleString()} MT
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 rounded-lg bg-[#EAF4EC]/50 border border-[#E2EAE3] flex items-start gap-2 text-xs text-[#64756A]">
                  <Info size={15} className="shrink-0 mt-0.5 text-[#006B45]" />
                  <span>
                    Totals represent non-double-counted information consolidation only and do not denote physical warehousing, hauling, or payment processing.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* SECTION 6 — Reports and Planning Insights */}
        <section id="planning-reports" className="scroll-mt-24">
          <Card>
            <CardHeader className="border-b border-[#E2EAE3] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 size={19} className="text-[#006B45]" />
                  Reports &amp; LGU Planning Insights
                </CardTitle>
                <CardDescription className="mt-1">
                  Barangay-level biomass concentration rankings derived from validated records to inform LGU waste-to-value planning.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Download size={14} />}
                onClick={exportPlanningCSV}
              >
                Export Validated Planning CSV
              </Button>
            </CardHeader>

            <CardContent className="pt-5">
              {barangayRankings.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#64756A]">
                  No validated barangay concentration data available yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {barangayRankings.slice(0, 6).map((item, idx) => (
                    <div
                      key={item.locationKey}
                      className="p-4 rounded-xl border border-[#E2EAE3] bg-[#F7FAF7]/50 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-[#EAF4EC] text-[#006B45] border border-[#C3DFC8] text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-[#1E3328] truncate">
                            {item.barangay}
                          </p>
                          <p className="text-xs text-[#64756A] truncate">
                            {[item.city, item.province].filter(Boolean).join(', ') || 'Philippines'}
                          </p>
                          <p className="text-[11px] text-[#64756A] mt-0.5 tabular-nums">
                            {item.recordCount} validated {item.recordCount === 1 ? 'record' : 'records'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm text-[#1E3328] tabular-nums">
                          {item.totalVolumeTonnes.toLocaleString()} MT
                        </p>
                        <p className="text-xs font-semibold text-[#006B45] tabular-nums">
                          {item.availableVolumeTonnes.toLocaleString()} MT avail.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* SECTION 7 — Lower Login Section ("Access Your Workspace") */}
        <AccessWorkspace initialPortal={initialPortal} />
      </main>

      <footer className="border-t border-[#E2EAE3] bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#64756A]">
          <div className="flex items-center gap-2.5">
            <BrandLogo size="sm" />
            <span>
              <strong className="text-[#1E3328]">AgriCycle</strong> &bull; Community-Based Biomass Information Management &amp; Market Linkage System
            </span>
          </div>
          <span>Study Location: Butuan City, Philippines</span>
        </div>
      </footer>
    </div>
  );
};
