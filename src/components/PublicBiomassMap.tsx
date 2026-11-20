import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { format } from 'date-fns';
import { Filter, MapPin, RotateCcw } from 'lucide-react';
import { BiomassRecord, BiomassSource, Location, ReferenceData, RecordStatus } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { StatusBadge } from './ui/StatusBadge';
import { LocationFilterSelects } from './LocationSelector';
import { formatLocationHierarchy, normalizeRegionName } from '../utils/philippineLocations';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const VALIDATED_MARKER_ICON = L.divIcon({
  className: 'custom-leaflet-marker',
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:#006B45;border:2.5px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,45,28,0.35);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

const DEFAULT_CENTER: [number, number] = [8.9475, 125.5406]; // Butuan City / Caraga default when empty
const DEFAULT_ZOOM = 11;

interface MapViewportProps {
  points: Array<[number, number]>;
  fitKey: string;
  resetCounter: number;
}

const PublicMapViewportController: React.FC<MapViewportProps> = ({
  points,
  fitKey,
  resetCounter,
}) => {
  const map = useMap();

  useEffect(() => {
    if (resetCounter > 0) {
      if (points.length === 0) {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
      } else if (points.length === 1) {
        map.setView(points[0], 13, { animate: true });
      } else {
        const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13, animate: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetCounter, map]);

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);

  return null;
};

interface PublicBiomassMapProps {
  records: BiomassRecord[];
  sources: BiomassSource[];
  locations: Location[];
  referenceData: ReferenceData[];
}

export const PublicBiomassMap: React.FC<PublicBiomassMapProps> = ({
  records,
  sources,
  locations,
  referenceData,
}) => {
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [locationFilter, setLocationFilter] = useState({
    region: 'ALL',
    province: 'ALL',
    city: 'ALL',
    barangay: 'ALL',
  });
  const [resetCounter, setResetCounter] = useState(0);

  const validatedRecords = useMemo(
    () => records.filter((r) => r.status === RecordStatus.VALIDATED),
    [records]
  );

  const biomassTypes = useMemo(
    () => referenceData.filter((r) => r.category === 'BIOMASS_TYPE' && r.isActive),
    [referenceData]
  );

  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const availableLocations = useMemo(() => {
    const map = new Map<string, Location>();
    validatedRecords.forEach((rec) => {
      const src = sourceMap.get(rec.sourceId);
      const loc = locationMap.get(src?.locationId || rec.locationId);
      if (loc) map.set(loc.id, loc);
    });
    return Array.from(map.values());
  }, [validatedRecords, sourceMap, locationMap]);

  const filteredItems = useMemo(() => {
    return validatedRecords
      .filter((rec) => selectedType === 'ALL' || rec.biomassTypeId === selectedType)
      .map((record) => {
        const source = sourceMap.get(record.sourceId);
        const location = locationMap.get(source?.locationId || record.locationId);
        return { record, source, location };
      })
      .filter(({ location }) => {
        const hasFilter =
          locationFilter.region !== 'ALL' ||
          locationFilter.province !== 'ALL' ||
          locationFilter.city !== 'ALL' ||
          locationFilter.barangay !== 'ALL';
        if (!hasFilter) return true;
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
  }, [validatedRecords, selectedType, locationFilter, sourceMap, locationMap]);

  const mappedMarkers = useMemo(() => {
    const withCoords = filteredItems.filter(
      (item) =>
        item.location?.coordinates &&
        Number.isFinite(item.location.coordinates.lat) &&
        Number.isFinite(item.location.coordinates.lng)
    );

    const coordCounts = new Map<string, number>();
    withCoords.forEach((item) => {
      const k = `${item.location!.coordinates!.lat.toFixed(5)},${item.location!.coordinates!.lng.toFixed(5)}`;
      coordCounts.set(k, (coordCounts.get(k) || 0) + 1);
    });

    const seen = new Map<string, number>();
    return withCoords.map((item) => {
      const lat = item.location!.coordinates!.lat;
      const lng = item.location!.coordinates!.lng;
      const k = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      const count = coordCounts.get(k) || 1;
      const idx = seen.get(k) || 0;
      seen.set(k, idx + 1);

      let displayLat = lat;
      let displayLng = lng;
      if (count > 1) {
        const angle = (2 * Math.PI * idx) / count;
        const radius = 0.00025;
        displayLat = lat + radius * Math.cos(angle);
        displayLng = lng + radius * Math.sin(angle);
      }

      return {
        ...item,
        position: [displayLat, displayLng] as [number, number],
        sharedCoordCount: count,
      };
    });
  }, [filteredItems]);

  const unmappedCount = filteredItems.length - mappedMarkers.length;
  const points = mappedMarkers.map((m) => m.position);
  const fitKey = `${mappedMarkers.map((m) => m.record.id).join('|')}-${selectedType}-${locationFilter.region}-${locationFilter.province}-${locationFilter.city}-${locationFilter.barangay}`;

  const hasLocationFilter =
    locationFilter.region !== 'ALL' ||
    locationFilter.province !== 'ALL' ||
    locationFilter.city !== 'ALL' ||
    locationFilter.barangay !== 'ALL';

  const handleReset = () => {
    setSelectedType('ALL');
    setLocationFilter({ region: 'ALL', province: 'ALL', city: 'ALL', barangay: 'ALL' });
    setResetCounter((c) => c + 1);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[#E2EAE3] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin size={19} className="text-[#006B45]" />
            GIS Biomass Distribution Map
          </CardTitle>
          <CardDescription className="mt-1">
            Spatial view of validated biomass sources with recorded GPS coordinates across barangays.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#006B45] bg-[#EAF4EC] border border-[#C3DFC8] px-2.5 py-1 rounded-md tabular-nums">
            {mappedMarkers.length} Plotted
          </span>
          <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={handleReset}>
            Reset View
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Map Filters Column */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#E2EAE3] bg-[#F7FAF7]/60 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#1E3328] flex items-center gap-1.5">
                <Filter size={13} className="text-[#006B45]" /> Filter Map Sources
              </span>
              {(hasLocationFilter || selectedType !== 'ALL') && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-semibold text-[#006B45] hover:underline cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#64756A] uppercase tracking-wider mb-1.5">
                Biomass Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-[#E2EAE3] bg-white text-sm text-[#1E3328] focus:outline-none focus:ring-2 focus:ring-[#006B45]"
              >
                <option value="ALL">All Biomass Types</option>
                {biomassTypes.map((bt) => (
                  <option key={bt.id} value={bt.id}>
                    {bt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-[#E2EAE3]">
              <LocationFilterSelects
                locations={availableLocations}
                value={locationFilter}
                onChange={setLocationFilter}
                compact
              />
            </div>

            <div className="pt-3 border-t border-[#E2EAE3] space-y-2 text-xs text-[#64756A]">
              <div className="flex items-center gap-2 text-[#1E3328] font-medium">
                <span className="w-3.5 h-3.5 rounded-full bg-[#006B45] border-2 border-white shadow-xs inline-block shrink-0" />
                <span>Validated Biomass Source</span>
              </div>
              <p className="leading-relaxed">
                Only validated records with saved GPS coordinates appear on the map.
              </p>
              {unmappedCount > 0 && (
                <div className="p-2.5 rounded-lg bg-[#FFF7E2] border border-[#F5DA8A] text-[#8F6500]">
                  <span className="font-semibold tabular-nums">{unmappedCount}</span> validated{' '}
                  {unmappedCount === 1 ? 'record is' : 'records are'} currently listed in the table below without GPS coordinates.
                </div>
              )}
            </div>
          </div>

          {/* Interactive Leaflet Map Canvas */}
          <div className="lg:col-span-8 h-[380px] sm:h-[440px] bg-[#EAF4EC]/40 relative">
            <MapContainer
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              minZoom={5}
              maxZoom={18}
              scrollWheelZoom={false}
              className="w-full h-full"
            >
              <TileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
                maxZoom={19}
              />
              <PublicMapViewportController
                points={points}
                fitKey={fitKey}
                resetCounter={resetCounter}
              />

              {mappedMarkers.map((item, idx) => {
                const typeLabel =
                  referenceData.find((r) => r.id === item.record.biomassTypeId)?.label || 'Biomass';
                const unitLabel =
                  referenceData.find((r) => r.id === item.record.originalUnit)?.label || '';
                const availQty =
                  item.record.remainingQuantity !== undefined
                    ? item.record.remainingQuantity
                    : item.record.quantity;
                const isMarketAvailable = item.record.externalAvailability !== 'NOT_AVAILABLE';
                const fullLoc = formatLocationHierarchy(item.location);

                return (
                  <Marker
                    key={`${item.record.id}-${idx}`}
                    position={item.position}
                    icon={VALIDATED_MARKER_ICON}
                  >
                    <Popup className="agricycle-popup">
                      <div className="p-1 min-w-[220px] text-[#1E3328]">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <StatusBadge status={RecordStatus.VALIDATED} />
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                              isMarketAvailable
                                ? 'bg-[#EAF4EC] text-[#006B45] border-[#C3DFC8]'
                                : 'bg-[#FFF7E2] text-[#8F6500] border-[#F5DA8A]'
                            }`}
                          >
                            {isMarketAvailable ? 'Available for Linkage' : 'Internal Use Only'}
                          </span>
                        </div>

                        <h4 className="font-bold text-sm text-[#1E3328]">{typeLabel}</h4>
                        <p className="text-xs font-medium text-[#1E3328] mt-0.5">
                          {item.source?.name || 'Validated Biomass Source'}
                        </p>
                        <p className="text-[11px] text-[#64756A] mt-0.5 pb-2 border-b border-[#E2EAE3]">
                          {fullLoc}
                        </p>

                        <div className="mt-2 space-y-1 text-xs">
                          <p>
                            <span className="text-[#64756A]">Available Qty:</span>{' '}
                            <span className="font-bold text-[#006B45] tabular-nums">
                              {availQty.toLocaleString()} {unitLabel}
                            </span>
                          </p>
                          <p>
                            <span className="text-[#64756A]">Condition:</span>{' '}
                            <span className="font-medium">{item.record.condition}</span>
                          </p>
                          <p className="text-[11px] text-[#64756A]">
                            Updated:{' '}
                            {item.record.lastUpdatedDate &&
                            !Number.isNaN(new Date(item.record.lastUpdatedDate).getTime())
                              ? format(new Date(item.record.lastUpdatedDate), 'MMM d, yyyy')
                              : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
