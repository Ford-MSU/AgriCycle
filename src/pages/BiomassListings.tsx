import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Location, RecordStatus, AggregationStatus } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { LocationFilterSelects } from '../components/LocationSelector';
import { formatLocationHierarchy, normalizeRegionName } from '../utils/philippineLocations';
import { Search, Filter, Info, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

const formatSafeDate = (iso?: string, fallback = 'Flexible') => {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : format(d, 'MMM d, yyyy');
};

export const BiomassListings: React.FC = () => {
  const { user } = useAuth();
  const {
    records,
    aggregationGroups,
    aggregationMembers,
    referenceData,
    isLoading,
    getBiomassTypes,
    getRecord,
    getSource,
    getLocation,
    getAggregationMembers,
  } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState({
    region: 'ALL',
    province: 'ALL',
    city: 'ALL',
    barangay: 'ALL',
  });

  const activeAggregatedRecordIds = useMemo(
    () => new Set(aggregationMembers.filter((m) => m.isActive).map((m) => m.biomassRecordId)),
    [aggregationMembers]
  );

  // Only validated, non-theoretical, externally available, non-expired records with remaining qty > 0
  const unaggregatedValidatedRecords = useMemo(() => {
    const now = new Date();
    return records.filter((r) => {
      const remaining = r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity;
      const notExpired = !r.availabilityPeriodEnd || new Date(r.availabilityPeriodEnd) >= now;
      return (
        r.status === RecordStatus.VALIDATED &&
        !r.isTheoreticalEstimate &&
        r.externalAvailability !== 'NOT_AVAILABLE' &&
        remaining > 0 &&
        notExpired &&
        !activeAggregatedRecordIds.has(r.id)
      );
    });
  }, [records, activeAggregatedRecordIds]);

  const activeGroups = useMemo(
    () => aggregationGroups.filter((g) => g.status === AggregationStatus.ACTIVE),
    [aggregationGroups]
  );

  const availableLocations = useMemo(() => {
    const locMap = new Map<string, Location>();
    unaggregatedValidatedRecords.forEach((r) => {
      const src = getSource(r.sourceId);
      const loc = src ? getLocation(src.locationId) : getLocation(r.locationId);
      if (loc) locMap.set(loc.id, loc);
    });
    activeGroups.forEach((g) => {
      getAggregationMembers(g.id).forEach((m) => {
        const rec = getRecord(m.biomassRecordId);
        if (rec && rec.status === RecordStatus.VALIDATED) {
          const src = getSource(rec.sourceId);
          const loc = src ? getLocation(src.locationId) : getLocation(rec.locationId);
          if (loc) locMap.set(loc.id, loc);
        }
      });
    });
    return Array.from(locMap.values());
  }, [unaggregatedValidatedRecords, activeGroups, getSource, getLocation, getAggregationMembers, getRecord]);

  if (!user) return null;

  const getGroupTotalsAndLocations = (groupId: string) => {
    const members = getAggregationMembers(groupId);
    let total = 0;
    let unit = '';
    let isMixed = false;
    const memberLocs: Location[] = [];

    members.forEach((m) => {
      const record = getRecord(m.biomassRecordId);
      if (record && record.status === RecordStatus.VALIDATED) {
        const recordUnit = referenceData.find((r) => r.id === record.originalUnit)?.label || '';
        if (!unit) unit = recordUnit;
        else if (unit !== recordUnit) isMixed = true;
        total += record.remainingQuantity !== undefined ? record.remainingQuantity : record.quantity;

        const src = getSource(record.sourceId);
        const loc = src ? getLocation(src.locationId) : getLocation(record.locationId);
        if (loc) memberLocs.push(loc);
      }
    });

    const uniqueCities = Array.from(
      new Set(memberLocs.map((l) => [l.city, l.province].filter(Boolean).join(', ')).filter(Boolean))
    );
    const locationSummary =
      uniqueCities.length > 0
        ? `Multiple Validated Sources (${uniqueCities.slice(0, 2).join('; ')}${uniqueCities.length > 2 ? '…' : ''})`
        : 'Multiple Validated Sources';

    return { total, unit: isMixed ? 'Mixed Units' : unit, memberLocs, locationSummary };
  };

  const allListings = [
    ...unaggregatedValidatedRecords.map((r) => {
      const src = getSource(r.sourceId);
      const loc = src ? getLocation(src.locationId) : getLocation(r.locationId);
      return {
        id: r.id,
        isGroup: false,
        title: referenceData.find((ref) => ref.id === r.biomassTypeId)?.label || 'Unknown',
        biomassTypeId: r.biomassTypeId,
        sourceName: src?.name,
        location: formatLocationHierarchy(loc),
        locationsList: loc ? [loc] : ([] as Location[]),
        quantity: r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity,
        unit: referenceData.find((ref) => ref.id === r.originalUnit)?.label || '',
        availableFrom: r.availabilityPeriodStart,
        availableTo: r.availabilityPeriodEnd,
        updatedAt: r.lastUpdatedDate,
      };
    }),
    ...activeGroups
      .map((g) => {
        const totals = getGroupTotalsAndLocations(g.id);
        return {
          id: g.id,
          isGroup: true,
          title: `${referenceData.find((ref) => ref.id === g.biomassTypeId)?.label || 'Unknown'} (${g.name})`,
          biomassTypeId: g.biomassTypeId,
          sourceName: 'Information-Based Consolidation',
          location: totals.locationSummary,
          locationsList: totals.memberLocs,
          quantity: totals.total,
          unit: totals.unit,
          availableFrom: g.createdAt,
          availableTo: undefined,
          updatedAt: g.updatedAt,
        };
      })
      .filter((g) => g.quantity > 0),
  ];

  const hasLocationFilter =
    locationFilter.region !== 'ALL' ||
    locationFilter.province !== 'ALL' ||
    locationFilter.city !== 'ALL' ||
    locationFilter.barangay !== 'ALL';

  const filteredListings = allListings.filter((listing) => {
    const matchesSearch =
      listing.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (listing.sourceName && listing.sourceName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (listing.location && listing.location.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = typeFilter === 'ALL' || listing.biomassTypeId === typeFilter;

    let matchesLocation = true;
    if (hasLocationFilter) {
      matchesLocation = listing.locationsList.some(
        (loc) =>
          (locationFilter.region === 'ALL' || normalizeRegionName(loc.region) === locationFilter.region) &&
          (locationFilter.province === 'ALL' || loc.province === locationFilter.province) &&
          (locationFilter.city === 'ALL' || loc.city === locationFilter.city) &&
          (locationFilter.barangay === 'ALL' || loc.barangay === locationFilter.barangay)
      );
    }

    return matchesSearch && matchesType && matchesLocation;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Biomass Listings</h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Discover validated and actively grouped biomass availability across the Philippines for non-binding inquiries.
          </p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-blue-800 text-sm">
        <Info className="shrink-0 mt-0.5 text-blue-500" size={18} />
        <div className="space-y-1">
          <p>
            <strong>Information Purpose Only:</strong> The quantities shown here reflect validated reported information and do{' '}
            <em>not</em> represent guaranteed supply or completed physical collection.
          </p>
          <p>
            Submitting an inquiry is strictly non-binding and does not constitute a purchase, contract, reservation, payment, or delivery schedule.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-gray-100 space-y-3 bg-gray-50/50">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search listings by type, source, barangay, city, province, or region..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter size={18} className="text-gray-400" />
                <select
                  className="block w-full sm:w-48 pl-3 pr-10 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-agri-green-500 focus:border-agri-green-500 rounded-lg bg-white"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="ALL">All Biomass Types</option>
                  {getBiomassTypes().map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {bt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {availableLocations.length > 0 && (
              <div className="pt-2 border-t border-gray-200/70">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Filter by Location
                  </span>
                  {hasLocationFilter && (
                    <button
                      type="button"
                      onClick={() =>
                        setLocationFilter({ region: 'ALL', province: 'ALL', city: 'ALL', barangay: 'ALL' })
                      }
                      className="text-xs font-semibold text-agri-green-700 hover:underline"
                    >
                      Clear Location Filters
                    </button>
                  )}
                </div>
                <LocationFilterSelects
                  locations={availableLocations}
                  value={locationFilter}
                  onChange={setLocationFilter}
                />
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-agri-earth-500 font-semibold tracking-wider">
                  <th className="px-5 py-4">Biomass Type & Source</th>
                  <th className="px-5 py-4">Reported Quantity</th>
                  <th className="px-5 py-4">Availability Period</th>
                  <th className="px-5 py-4">Last Updated</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {isLoading && filteredListings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                      Loading validated listings...
                    </td>
                  </tr>
                ) : filteredListings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                      No validated listings found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredListings.map((listing) => (
                    <tr key={listing.id} className="hover:bg-agri-green-50/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{listing.title}</p>
                          {listing.isGroup && (
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-semibold uppercase">
                              Group
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-agri-earth-500 mt-0.5">{listing.sourceName}</p>
                        <p className="text-xs text-agri-earth-400 flex items-center gap-1 mt-0.5">
                          <MapPin size={10} className="shrink-0" /> {listing.location}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {listing.unit === 'Mixed Units' ? (
                          <span className="text-gray-500 italic">Mixed Units</span>
                        ) : (
                          <>
                            <span className="font-semibold text-gray-900">{listing.quantity.toLocaleString()}</span>
                            <span className="text-xs text-agri-earth-500 ml-1">{listing.unit}</span>
                          </>
                        )}
                      </td>
                      <td className="px-5 py-4 text-agri-earth-600 text-xs">
                        {listing.availableFrom && listing.availableTo
                          ? `${formatSafeDate(listing.availableFrom)} – ${formatSafeDate(listing.availableTo)}`
                          : listing.availableFrom
                          ? `From ${formatSafeDate(listing.availableFrom)} (Flexible)`
                          : listing.availableTo
                          ? `Until ${formatSafeDate(listing.availableTo)}`
                          : 'Immediate & Flexible'}
                      </td>
                      <td className="px-5 py-4 text-agri-earth-500 text-xs">
                        {formatSafeDate(listing.updatedAt)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link to={`/listings/${listing.isGroup ? 'group' : 'record'}/${listing.id}`}>
                          <Button variant="outline" size="sm" className="text-xs">
                            View Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
