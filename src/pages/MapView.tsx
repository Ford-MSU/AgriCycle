import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { RecordStatus, Role } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { hasPermission, Permission } from '../utils/rbac';
import { Filter, MapPin, Edit3, X, AlertCircle } from 'lucide-react';
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

const INITIAL_CENTER: [number, number] = [8.9475, 125.5406]; // Butuan City

const MINDANAO_BOUNDS: L.LatLngBoundsExpression = [
  [4.4, 119.3],
  [9.9, 127.7],
];

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

  // Coordinator GIS coordinate editor modal state
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editingLocLabel, setEditingLocLabel] = useState('');
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [coordError, setCoordError] = useState('');
  const [isSavingCoords, setIsSavingCoords] = useState(false);

  if (!user) return null;

  const canManageMap = hasPermission(user.role, Permission.MANAGE_MAP_INFO);
  const isValidatedOnlyRole = user.role === Role.BUYER || user.role === Role.LGU;

  // Retrieve role-authorized records
  let mapRecords = records;

  if (groupIdFilter) {
    const memberRecordIds = getAggregationMembers(groupIdFilter).map((m) => m.biomassRecordId);
    mapRecords = mapRecords.filter((r) => memberRecordIds.includes(r.id));
    if (isValidatedOnlyRole) {
      mapRecords = mapRecords.filter((r) => r.status === RecordStatus.VALIDATED);
    }
  } else {
    if (user.role === Role.BUYER) {
      mapRecords = mapRecords.filter((r) => {
        const remaining = r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity;
        return (
          r.status === RecordStatus.VALIDATED &&
          !r.isTheoreticalEstimate &&
          r.externalAvailability !== 'NOT_AVAILABLE' &&
          remaining > 0
        );
      });
    } else if (user.role === Role.LGU) {
      // Planning users view validated biomass information only
      mapRecords = mapRecords.filter((r) => r.status === RecordStatus.VALIDATED);
    }
  }

  if (activeBiomassType !== 'ALL') {
    mapRecords = mapRecords.filter((r) => r.biomassTypeId === activeBiomassType);
  }
  if (!isValidatedOnlyRole && activeStatus !== 'ALL') {
    mapRecords = mapRecords.filter((r) => r.status === activeStatus);
  }

  // Strictly use real stored coordinates — NEVER fabricate fake lat/lng
  const enriched = mapRecords.map((record) => {
    const source = getSource(record.sourceId);
    const location = source ? getLocation(source.locationId) : getLocation(record.locationId);
    return { record, source, location };
  });

  const mappedPoints = enriched.filter(
    (item) =>
      item.location?.coordinates &&
      Number.isFinite(item.location.coordinates.lat) &&
      Number.isFinite(item.location.coordinates.lng)
  );
  const unmappedItems = enriched.filter((item) => !item.location?.coordinates);

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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {groupIdFilter ? `GIS Map: Group ${groupIdFilter}` : 'GIS / Biomass Map'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            {isValidatedOnlyRole
              ? 'Read-only spatial visibility of validated biomass sources.'
              : 'Spatial visibility and GPS coordinate management for recorded biomass sources.'}
          </p>
        </div>
        {groupIdFilter && (
          <Link to="/aggregation-hubs">
            <Button variant="outline" size="sm">
              Back to Biomass Aggregation
            </Button>
          </Link>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 h-full min-h-0">
        {/* Sidebar Filters & Pending Coordinates */}
        <Card className="md:w-80 shrink-0 h-full overflow-y-auto">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter size={16} /> Map Filters ({mappedPoints.length} Plotted)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-5">
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
                    return (
                      <div
                        key={item.record.id}
                        className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1"
                      >
                        <p className="font-semibold text-gray-900">{item.source?.name || item.record.id}</p>
                        <p className="text-gray-600">
                          {typeLabel} &bull; Brgy. {item.location?.barangay || 'Unknown'}
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
                                  `${item.source?.name || 'Source'} (Brgy. ${item.location!.barangay})`,
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
        <div className="flex-1 bg-gray-100 rounded-xl border border-gray-200 overflow-hidden relative z-0 shadow-inner">
          <MapContainer
            center={INITIAL_CENTER}
            zoom={11}
            minZoom={7}
            maxZoom={18}
            maxBounds={MINDANAO_BOUNDS}
            maxBoundsViscosity={1.0}
            scrollWheelZoom={true}
            className="w-full h-full"
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
              maxZoom={19}
            />

            {mappedPoints.map((item, index) => {
              if (!item.location?.coordinates) return null;

              const type = referenceData.find((r) => r.id === item.record.biomassTypeId)?.label;
              const unit = referenceData.find((r) => r.id === item.record.originalUnit)?.label;
              const availQty =
                item.record.remainingQuantity !== undefined ? item.record.remainingQuantity : item.record.quantity;
              const isAvailableToMarket = item.record.externalAvailability !== 'NOT_AVAILABLE';

              return (
                <Marker
                  key={`${item.record.id}-${index}`}
                  position={[item.location.coordinates.lat, item.location.coordinates.lng]}
                  icon={createStatusIcon(item.record.status)}
                >
                  <Popup className="agricycle-popup">
                    <div className="p-1 min-w-[210px]">
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
                        <p className="font-semibold text-gray-800">
                          Source: {item.source?.name} ({item.location.barangay}, {item.location.city})
                        </p>
                        <p className="text-[11px] text-gray-500">
                          Coords: {item.location.coordinates.lat.toFixed(4)}, {item.location.coordinates.lng.toFixed(4)}
                        </p>
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
                                `${item.source?.name || 'Source'} (Brgy. ${item.location!.barangay})`,
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
                      placeholder="e.g. 8.9475"
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
                      placeholder="e.g. 125.5406"
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
