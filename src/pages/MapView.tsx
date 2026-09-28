import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { RecordStatus, Role, BiomassRecord } from '../types';
import { db } from '../store/mockDb';
import { useAuth } from '../store/AuthContext';
import { MapPin, Filter, Layers, Navigation, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams, Link } from 'react-router-dom';
import L from 'leaflet';

// Fix for Leaflet default icon paths in React/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom status-aware icons
const createStatusIcon = (status: RecordStatus) => {
  let colorClass = 'bg-gray-400';
  if (status === RecordStatus.VALIDATED) colorClass = 'bg-agri-green-500';
  if (status === RecordStatus.UNDER_REVIEW) colorClass = 'bg-yellow-500';
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

const INITIAL_CENTER: [number, number] = [8.9475, 125.5406]; // Butuan City center

export const MapView: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const groupIdFilter = searchParams.get('groupId');
  
  const [activeBiomassType, setActiveBiomassType] = useState<string>('ALL');
  const [activeStatus, setActiveStatus] = useState<string>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<BiomassRecord | null>(null);

  if (!user) return null;

  // Retrieve authorized records
  let mapRecords = db.records;
  
  // Apply Group Filter if present in URL
  if (groupIdFilter) {
    const memberRecordIds = db.getAggregationMembers(groupIdFilter).map(m => m.biomassRecordId);
    mapRecords = mapRecords.filter(r => memberRecordIds.includes(r.id));
  } else {
    if (user.role === Role.BUYER) {
      mapRecords = mapRecords.filter(r => r.status === RecordStatus.VALIDATED);
    } else if (user.role === Role.COORDINATOR) {
      mapRecords = mapRecords.filter(r => r.submitterId === user.id || r.sourceId.includes('src-1') || r.sourceId.includes('src-2'));
    }
  }

  // Apply filters
  if (activeBiomassType !== 'ALL') {
    mapRecords = mapRecords.filter(r => r.biomassTypeId === activeBiomassType);
  }
  if (activeStatus !== 'ALL') {
    mapRecords = mapRecords.filter(r => r.status === activeStatus);
  }

  // Combine records with locations
  const mappedPoints = mapRecords.map(record => {
    const source = db.getSource(record.sourceId);
    const location = source ? db.getLocation(source.locationId) : null;
    return { record, source, location };
  }).filter(item => item.location?.coordinates); // Only items with coordinates

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {groupIdFilter ? `GIS Map: Group ${groupIdFilter}` : 'GIS / Biomass Map'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Spatial visibility of recorded biomass sources (Decision Support Tool)
          </p>
        </div>
        {groupIdFilter && (
          <Link to="/aggregation-hubs">
            <Button variant="outline" size="sm">Back to Aggregation Group</Button>
          </Link>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 h-full">
        {/* Sidebar Filters */}
        <Card className="md:w-72 shrink-0 h-full overflow-y-auto">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter size={16} /> Map Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Biomass Type</label>
              <select 
                className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                value={activeBiomassType}
                onChange={(e) => setActiveBiomassType(e.target.value)}
              >
                <option value="ALL">All Types</option>
                {db.getBiomassTypes().map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Validation Status</label>
              <select 
                className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                value={activeStatus}
                onChange={(e) => setActiveStatus(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value={RecordStatus.VALIDATED}>Validated Only</option>
                <option value={RecordStatus.UNDER_REVIEW}>Under Review</option>
                <option value={RecordStatus.STALE}>Stale</option>
              </select>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs text-agri-earth-500 italic">
                Note: Map location implies source presence, not guaranteed current supply. Refer to record status for actual availability.
              </p>
              
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-agri-green-500 border border-white shrink-0"></div>
                  <span>Validated</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-yellow-500 border border-white shrink-0"></div>
                  <span>Under Review</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-purple-500 border border-white shrink-0"></div>
                  <span>Stale</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Map Container */}
        <div className="flex-1 bg-gray-100 rounded-xl border border-gray-200 overflow-hidden relative z-0 shadow-inner">
          <MapContainer 
            center={INITIAL_CENTER} 
            zoom={12} 
            scrollWheelZoom={true} 
            className="w-full h-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            
            {mappedPoints.map((item, index) => {
              if (!item.location?.coordinates) return null;
              
              const type = db.referenceData.find(r => r.id === item.record.biomassTypeId)?.label;
              const unit = db.referenceData.find(r => r.id === item.record.originalUnit)?.label;
              
              return (
                <Marker 
                  key={`${item.record.id}-${index}`} 
                  position={[item.location.coordinates.lat, item.location.coordinates.lng]}
                  icon={createStatusIcon(item.record.status)}
                  eventHandlers={{
                    click: () => setSelectedRecord(item.record)
                  }}
                >
                  <Popup className="agricycle-popup">
                    <div className="p-1">
                      <div className="mb-2">
                        <StatusBadge status={item.record.status} />
                      </div>
                      <h3 className="font-bold text-gray-900">{type}</h3>
                      <p className="text-xs text-agri-earth-600 mb-2 border-b border-gray-100 pb-2">
                        {item.source?.name} &bull; {item.location.barangay}
                      </p>
                      
                      <div className="space-y-1 mb-3">
                        <p className="text-sm">
                          <span className="font-medium">Quantity:</span> {item.record.quantity.toLocaleString()} {unit}
                        </p>
                        <p className="text-xs">
                          <span className="font-medium">Condition:</span> {item.record.condition}
                        </p>
                        <p className="text-xs text-gray-500">
                          <span className="font-medium text-gray-700">Updated:</span> {format(new Date(item.record.lastUpdatedDate), 'MMM d, yyyy')}
                        </p>
                      </div>
                      
                      <Link to={`/biomass-records?recordId=${item.record.id}`}>
                        <Button size="sm" className="w-full text-xs">
                          View Record
                        </Button>
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
};
