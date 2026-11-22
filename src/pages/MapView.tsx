import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { SafeMapController } from '../components/SafeMapController';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { Location, RecordStatus, Role } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { hasPermission, Permission } from '../utils/rbac';
import { LocationFilterSelects } from '../components/LocationSelector';
import { formatLocationHierarchy, normalizeRegionName } from '../utils/philippineLocations';
import { Filter, MapPin, Edit3, X, AlertCircle, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams, Link } from 'react-router-dom';
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createStatusIcon = (status: RecordStatus) => {
  let colorClass = 'bg-gray-400';
  if (status === RecordStatus.VALIDATED) colorClass = 'bg-agri-green-500';
  if (status === RecordStatus.UNDER_REVIEW || status === RecordStatus.SUBMITTED) colorClass = 'bg-yellow-500';
  if (status === RecordStatus.STALE) colorClass = 'bg-purple-500';
  if (status === RecordStatus.UNAVAILABLE) colorClass = 'bg-red-500';

  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `<div class="w-6 h-6 rounded-full border-2 border-white shadow-md ${colorClass} flex items-center justify-center"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

// Philippines geographic center and nationwide zoom
const INITIAL_CENTER: [number, number] = [12.8797, 121.7740];
const INITIAL_ZOOM = 6;

export const MapView: React.FC = () => {
  const { user } = useAuth();
  const {
    records,
    referenceData,
    getBiomassTypes,
    getSource,
    getLocation,
    getAggregationMembers,
    updateLocationCoordinates,
  } = useData();
  const [searchParams] = useSearchParams();
  const groupIdFilter = searchParams.get('groupId');

  const [activeBiomassType, setActiveBiomassType] = useState<string>('ALL');
  const [activeStatus, setActiveStatus] = useState<string>('ALL');
  const [locationFilter, setLocationFilter] = useState({
    region: 'ALL',
    province: 'ALL',
    city: 'ALL',
    barangay: 'ALL',
  });
  const [resetCounter, setResetCounter] = useState(0);

  // Coordinator GIS coordinate editor modal state
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editingLocLabel, setEditingLocLabel] = useState('');
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [coordError, setCoordError] = useState('');
  const [isSavingCoords, setIsSavingCoords] = useState(false);

  const isValidatedOnlyRole = user?.role === Role.BUYER || user?.role === Role.LGU;

  // Retrieve role-authorized records (prior to location filtering so filter dropdowns reflect available areas)
  const roleAuthorizedRecords = useMemo(() => {
    if (!user) return [];
    let list = records;

    if (groupIdFilter) {
      const memberRecordIds = getAggregationMembers(groupIdFilter).map((m) => m.biomassRecordId);
      list = list.filter((r) => memberRecordIds.includes(r.id));
      if (isValidatedOnlyRole) {
        list = list.filter((r) => r.status === RecordStatus.VALIDATED);
      }
    } else if (user.role === Role.BUYER) {
      list = list.filter((r) => {
        const remaining = r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity;
        return (
          r.status === RecordStatus.VALIDATED &&
          !r.isTheoreticalEstimate &&
          r.externalAvailability !== 'NOT_AVAILABLE' &&
          remaining > 0
        );
      });
    } else if (user.role === Role.LGU) {
      list = list.filter((r) => r.status === RecordStatus.VALIDATED);
    }

    return list;
  }, [user, records, groupIdFilter, isValidatedOnlyRole, getAggregationMembers]);

  // Unique active locations available across role-authorized records
  const availableFilterLocations = useMemo(() => {
    const locMap = new Map<string, Location>();
    roleAuthorizedRecords.forEach((rec) => {
      const src = getSource(rec.sourceId);
      const loc = src ? getLocation(src.locationId) : getLocation(rec.locationId);
      if (loc) locMap.set(loc.id, loc);
    });
    return Array.from(locMap.values());
  }, [roleAuthorizedRecords, getSource, getLocation]);

  const enriched = useMemo(() => {
    return roleAuthorizedRecords
      .filter((r) => {
        if (activeBiomassType !== 'ALL' && r.biomassTypeId !== activeBiomassType) return false;
        if (!isValidatedOnlyRole && activeStatus !== 'ALL' && r.status !== activeStatus) return false;
        return true;
      })
      .map((record) => {
        const source = getSource(record.sourceId);
        const location = source ? getLocation(source.locationId) : getLocation(record.locationId);
        return { record, source, location };
      })
      .filter(({ location }) => {
        const hasLocationFilter =
          locationFilter.region !== 'ALL' ||
          locationFilter.province !== 'ALL' ||
          locationFilter.city !== 'ALL' ||
          locationFilter.barangay !== 'ALL';
        if (!hasLocationFilter) return true;
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
        return true;
      });
  }, [
    roleAuthorizedRecords,
    activeBiomassType,
    activeStatus,
    isValidatedOnlyRole,
    locationFilter,
    getSource,
    getLocation,
  ]);

  const mappedPointsWithOffsets = useMemo(() => {
    const valid = enriched.filter(
      (item) =>
        item.location?.coordinates &&
        Number.isFinite(item.location.coordinates.lat) &&
        Number.isFinite(item.location.coordinates.lng)
    );

    const coordGroups = new Map<string, number>();
    valid.forEach((item) => {
      const key = `${item.location!.coordinates!.lat.toFixed(5)},${item.location!.coordinates!.lng.toFixed(5)}`;
      coordGroups.set(key, (coordGroups.get(key) || 0) + 1);
    });

    const seenInGroup = new Map<string, number>();
    return valid.map((item) => {
      const baseLat = item.location!.coordinates!.lat;
      const baseLng = item.location!.coordinates!.lng;
      const key = `${baseLat.toFixed(5)},${baseLng.toFixed(5)}`;
      const totalAtCoord = coordGroups.get(key) || 1;
      const idxInCoord = seenInGroup.get(key) || 0;
      seenInGroup.set(key, idxInCoord + 1);

      let displayLat = baseLat;
      let displayLng = baseLng;
      if (totalAtCoord > 1) {
        const angle = (2 * Math.PI * idxInCoord) / totalAtCoord;
        const radius = 0.00025;
        displayLat = baseLat + radius * Math.cos(angle);
        displayLng = baseLng + radius * Math.sin(angle);
      }

      return {
        ...item,
        displayPosition: [displayLat, displayLng] as [number, number],
        sharedCoordCount: totalAtCoord,
      };
    });
  }, [enriched]);

  const unmappedItems = useMemo(
    () =>
      enriched.filter(
        (item) =>
          !item.location?.coordinates ||
          !Number.isFinite(item.location.coordinates.lat) ||
          !Number.isFinite(item.location.coordinates.lng)
      ),
    [enriched]
  );

  if (!user) return null;

  const canManageMap = hasPermission(user.role, Permission.MANAGE_MAP_INFO);
  const hasLocationFilter =
    locationFilter.region !== 'ALL' ||
    locationFilter.province !== 'ALL' ||
    locationFilter.city !== 'ALL' ||
    locationFilter.barangay !== 'ALL';

  const fitPoints = useMemo(
    () => mappedPointsWithOffsets.map((p) => p.displayPosition),
    [mappedPointsWithOffsets]
  );
  const fitKey =
    mappedPointsWithOffsets.map((p) => p.record.id).join('|') +
    `|${locationFilter.region}|${locationFilter.province}|${locationFilter.city}|${locationFilter.barangay}|${activeBiomassType}|${activeStatus}`;

  const openCoordinateEditor = (locId: string, label: string, current?: { lat: number; lng: number }) => {
    setEditingLocId(locId);
    setEditingLocLabel(label);
    setLatInput(current ? String(current.lat) : '');
    setLngInput(current ? String(current.lng) : '');
    setCoordError('');
  };

  const handleSaveCoords = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocId) return;
    setCoordError('');
    const latNum = Number(latInput);
    const lngNum = Number(lngInput);
    if (
      !latInput.trim() ||
      !lngInput.trim() ||
      isNaN(latNum) ||
      isNaN(lngNum) ||
      latNum < -90 ||
      latNum > 90 ||
      lngNum < -180 ||
      lngNum > 180
    ) {
      setCoordError('Enter valid coordinates: Latitude (-90 to 90) and Longitude (-180 to 180).');
      return;
    }

    setIsSavingCoords(true);
    try {
      await updateLocationCoordinates(editingLocId, latNum, lngNum);
      setEditingLocId(null);
    } catch (err: any) {
      setCoordError(err?.message || 'Failed to save coordinates.');
    } finally {
      setIsSavingCoords(false);
    }
  };

  const handleResetAllFiltersAndView = () => {
    setActiveBiomassType('ALL');
    setActiveStatus('ALL');
    setLocationFilter({ region: 'ALL', province: 'ALL', city: 'ALL', barangay: 'ALL' });
    setResetCounter((c) => c + 1);
  };

  return (
    <div className="flex flex-col md:h-[calc(100vh-8rem)] md:min-h-[560px]">
      <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {groupIdFilter ? `GIS Map: Group ${groupIdFilter}` : 'GIS / Biomass Map (Philippines)'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            {isValidatedOnlyRole
              ? 'Read-only spatial visibility of validated barangay-level biomass sources across the Philippines.'
              : 'Philippines-wide spatial visibility and GPS coordinate management for recorded biomass sources.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={handleResetAllFiltersAndView}
          >
            Reset Philippines View
          </Button>
          {groupIdFilter && (
            <Link to="/aggregation-hubs">
              <Button variant="outline" size="sm">
                Back to Biomass Aggregation
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:flex-1 md:min-h-0">
        {/* Sidebar Filters & Pending Coordinates */}
        <Card className="md:w-80 shrink-0 md:h-full max-h-[420px] md:max-h-none overflow-y-auto">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter size={16} /> Map Filters ({mappedPointsWithOffsets.length} Plotted)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2.5 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700 uppercase">Location Filter</span>
                {hasLocationFilter && (
                  <button
                    type="button"
                    onClick={() =>
                      setLocationFilter({ region: 'ALL', province: 'ALL', city: 'ALL', barangay: 'ALL' })
                    }
                    className="text-[11px] font-semibold text-agri-green-700 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <LocationFilterSelects
                locations={availableFilterLocations}
                value={locationFilter}
                onChange={setLocationFilter}
                compact
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Biomass Type</label>
              <select
                className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                value={activeBiomassType}
                onChange={(e) => setActiveBiomassType(e.target.value)}
              >
                <option value="ALL">All Types</option>
                {getBiomassTypes().map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {!isValidatedOnlyRole ? (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Validation Status</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                  value={activeStatus}
                  onChange={(e) => setActiveStatus(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value={RecordStatus.VALIDATED}>Validated Only</option>
                  <option value={RecordStatus.SUBMITTED}>Submitted</option>
                  <option value={RecordStatus.UNDER_REVIEW}>Under Review</option>
                  <option value={RecordStatus.STALE}>Stale</option>
                </select>
              </div>
            ) : (
              <div className="p-2.5 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800">
                Showing <strong>Validated</strong> biomass records only (Read-Only).
              </div>
            )}

            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-agri-earth-500 italic">
                Note: Only sources with recorded GPS coordinates are plotted on the map. Map presence does not guarantee current supply.
              </p>

              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-agri-green-500 border border-white shrink-0"></div>
                  <span>Validated</span>
                </div>
                {!isValidatedOnlyRole && (
                  <>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full bg-yellow-500 border border-white shrink-0"></div>
                      <span>Submitted / Under Review</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full bg-purple-500 border border-white shrink-0"></div>
                      <span>Stale</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {unmappedItems.length > 0 && (
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <p className="text-xs font-semibold text-gray-700 uppercase">
                  Pending GPS Coordinates ({unmappedItems.length})
                </p>
                <div className="space-y-2">
                  {unmappedItems.map((item) => {
                    const typeLabel = referenceData.find((r) => r.id === item.record.biomassTypeId)?.label;
                    const locDisplay = formatLocationHierarchy(item.location);
                    return (
                      <div
                        key={item.record.id}
                        className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1"
                      >
                        <p className="font-semibold text-gray-900">{item.source?.name || item.record.id}</p>
                        <p className="text-gray-600">
                          {typeLabel} &bull; {locDisplay}
                        </p>
                        <span className="inline-block text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          Coordinates Not Yet Recorded
                        </span>
                        {canManageMap && item.location && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                openCoordinateEditor(
                                  item.location!.id,
                                  `${item.source?.name || 'Source'} (${locDisplay})`,
                                  item.location!.coordinates
                                )
                              }
                              className="text-[11px] font-semibold text-agri-green-700 hover:text-agri-green-800 flex items-center gap-1"
                            >
                              <MapPin size={11} /> Add GPS Coordinates
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Map Container */}
        <div className="w-full h-[440px] shrink-0 md:w-auto md:flex-1 md:h-full md:min-h-0 bg-gray-100 rounded-xl border border-gray-200 overflow-hidden relative z-0 shadow-inner">
          <MapContainer
            center={INITIAL_CENTER}
            zoom={INITIAL_ZOOM}
            minZoom={5}
            maxZoom={18}
            scrollWheelZoom={true}
            zoomAnimation={false}
            markerZoomAnimation={false}
            className="w-full h-full"
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
              maxZoom={19}
            />

            <SafeMapController
              points={fitPoints}
              fitKey={fitKey}
              resetCounter={resetCounter}
              defaultCenter={INITIAL_CENTER}
              defaultZoom={INITIAL_ZOOM}
              singlePointZoom={13}
              fitBoundsPadding={[48, 48]}
              fitBoundsMaxZoom={14}
              resetMode="default"
            />

            {mappedPointsWithOffsets.map((item, index) => {
              if (!item.location?.coordinates) return null;

              const type = referenceData.find((r) => r.id === item.record.biomassTypeId)?.label;
              const unit = referenceData.find((r) => r.id === item.record.originalUnit)?.label;
              const availQty =
                item.record.remainingQuantity !== undefined ? item.record.remainingQuantity : item.record.quantity;
              const isAvailableToMarket = item.record.externalAvailability !== 'NOT_AVAILABLE';
              const fullLoc = formatLocationHierarchy(item.location);
              const precisionLabel =
                item.location.coordinatePrecision === 'BARANGAY_CENTROID'
                  ? 'Approx. Barangay Centroid'
                  : 'Exact Site GPS';

              return (
                <Marker
                  key={`${item.record.id}-${index}`}
                  position={item.displayPosition}
                  icon={createStatusIcon(item.record.status)}
                >
                  <Popup className="agricycle-popup">
                    <div className="p-1 min-w-[225px]">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <StatusBadge status={item.record.status} />
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isAvailableToMarket
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {isAvailableToMarket ? 'Market Available' : 'Internal Only'}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-900">{type}</h3>
                      <div className="text-xs text-agri-earth-700 mb-2 border-b border-gray-100 pb-1.5 space-y-0.5">
                        <p className="font-semibold text-gray-800">{item.source?.name}</p>
                        <p className="text-[11px] text-gray-600">{fullLoc}</p>
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <span className="text-[10px] text-gray-500">
                            {item.location.coordinates.lat.toFixed(4)}, {item.location.coordinates.lng.toFixed(4)}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                            {precisionLabel}
                          </span>
                        </div>
                        {item.sharedCoordCount > 1 && (
                          <p className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded mt-1">
                            Pin slightly offset ({item.sharedCoordCount} records share these coordinates)
                          </p>
                        )}
                      </div>

                      <div className="space-y-1 mb-3 text-xs">
                        <p>
                          <span className="font-semibold text-agri-green-800">Remaining Avail:</span>{' '}
                          <span className="font-bold text-agri-green-700">{availQty.toLocaleString()}</span> {unit}
                        </p>
                        <p className="text-gray-500">
                          <span>Total Recorded:</span> {item.record.quantity.toLocaleString()} {unit}
                        </p>
                        <p>
                          <span className="font-medium text-gray-700">Condition:</span> {item.record.condition}
                        </p>
                        <p className="text-gray-500 text-[11px]">
                          <span>Updated:</span> {format(new Date(item.record.lastUpdatedDate), 'MMM d, yyyy')}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Link
                          to={
                            user.role === Role.BUYER
                              ? `/listings/record/${item.record.id}`
                              : `/biomass-records?recordId=${item.record.id}`
                          }
                        >
                          <Button size="sm" className="w-full text-xs">
                            View Record
                          </Button>
                        </Link>
                        {canManageMap && item.location && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-xs"
                            icon={<Edit3 size={12} />}
                            onClick={() =>
                              openCoordinateEditor(
                                item.location!.id,
                                `${item.source?.name || 'Source'} (${fullLoc})`,
                                item.location!.coordinates
                              )
                            }
                          >
                            Update Coordinates
                          </Button>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>

      {/* Coordinator GPS Coordinate Editor Modal */}
      {editingLocId && canManageMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md bg-white shadow-xl">
            <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Update Source GPS Coordinates</CardTitle>
              <button onClick={() => setEditingLocId(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleSaveCoords} className="space-y-4">
                <p className="text-xs text-gray-600">
                  Location: <strong className="text-gray-900">{editingLocLabel}</strong>
                </p>
                {coordError && (
                  <div className="text-xs text-red-700 bg-red-50 p-2.5 rounded border border-red-200 flex items-center gap-1.5">
                    <AlertCircle size={14} /> {coordError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Latitude *</label>
                    <input
                      type="number"
                      step="any"
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                      placeholder="e.g. 8.4772"
                      value={latInput}
                      onChange={(e) => setLatInput(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Longitude *</label>
                    <input
                      type="number"
                      step="any"
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                      placeholder="e.g. 124.6361"
                      value={lngInput}
                      onChange={(e) => setLngInput(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingLocId(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" isLoading={isSavingCoords}>
                    Save Coordinates
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
