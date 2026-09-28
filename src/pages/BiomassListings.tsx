import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { RecordStatus, Role, AggregationStatus } from '../types';
import { db } from '../store/mockDb';
import { useAuth } from '../store/AuthContext';
import { Search, Filter, Info, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export const BiomassListings: React.FC = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  if (!user) return null;

  // Combine Validated Individual Records and Active Groups for the Listing
  const validatedRecords = db.records.filter(r => r.status === RecordStatus.VALIDATED);
  const activeGroups = db.aggregationGroups.filter(g => g.status === AggregationStatus.ACTIVE);

  const getGroupTotals = (groupId: string) => {
    const members = db.getAggregationMembers(groupId);
    let total = 0;
    let unit = '';
    let isMixed = false;

    members.forEach(m => {
      const record = db.getRecord(m.biomassRecordId);
      if (record && record.status === RecordStatus.VALIDATED) {
        const recordUnit = db.referenceData.find(r => r.id === record.originalUnit)?.label || '';
        if (!unit) unit = recordUnit;
        else if (unit !== recordUnit) isMixed = true;
        total += record.remainingQuantity !== undefined ? record.remainingQuantity : record.quantity;
      }
    });

    return { total, unit: isMixed ? 'Mixed Units' : unit };
  };

  const allListings = [
    ...validatedRecords.map(r => ({
      id: r.id,
      isGroup: false,
      title: db.referenceData.find(ref => ref.id === r.biomassTypeId)?.label || 'Unknown',
      biomassTypeId: r.biomassTypeId,
      sourceName: db.getSource(r.sourceId)?.name,
      location: db.getLocation(db.getSource(r.sourceId)?.locationId || '')?.barangay,
      quantity: r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity,
      unit: db.referenceData.find(ref => ref.id === r.originalUnit)?.label || '',
      availableFrom: r.availabilityPeriodStart,
      availableTo: r.availabilityPeriodEnd,
      updatedAt: r.lastUpdatedDate,
    })),
    ...activeGroups.map(g => {
      const totals = getGroupTotals(g.id);
      return {
        id: g.id,
        isGroup: true,
        title: `${db.referenceData.find(ref => ref.id === g.biomassTypeId)?.label || 'Unknown'} (Aggregation Group)`,
        biomassTypeId: g.biomassTypeId,
        sourceName: db.getOrganization(g.hubId)?.name,
        location: 'Multiple / Hub Coordinated',
        quantity: totals.total,
        unit: totals.unit,
        availableFrom: g.createdAt, // Mocking availability for group
        availableTo: g.updatedAt,
        updatedAt: g.updatedAt,
      }
    })
  ];

  // Filtering
  const filteredListings = allListings.filter(listing => {
    const matchesSearch = listing.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (listing.sourceName && listing.sourceName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = typeFilter === 'ALL' || listing.biomassTypeId === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Biomass Listings</h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Discover validated and actively grouped biomass information available for inquiry.
          </p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-blue-800 text-sm">
        <Info className="shrink-0 mt-0.5 text-blue-500" size={18} />
        <div className="space-y-1">
          <p>
            <strong>Information Purpose Only:</strong> The quantities shown here are based on reported information and do <em>not</em> represent a guaranteed supply or completed physical collection.
          </p>
          <p>
            Submitting an inquiry does not constitute a purchase, contract, payment, or delivery agreement.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 items-center bg-gray-50/50">
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search listings by type or source..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter size={18} className="text-gray-400" />
              <select
                className="block w-full sm:w-48 pl-3 pr-10 py-2 text-sm border-gray-200 focus:outline-none focus:ring-agri-green-500 focus:border-agri-green-500 rounded-lg"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Biomass Types</option>
                {db.getBiomassTypes().map(bt => (
                  <option key={bt.id} value={bt.id}>{bt.label}</option>
                ))}
              </select>
            </div>
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
                {filteredListings.length === 0 ? (
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
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-semibold uppercase">Group</span>
                          )}
                        </div>
                        <p className="text-xs text-agri-earth-500 mt-0.5">{listing.sourceName}</p>
                        <p className="text-xs text-agri-earth-400 flex items-center gap-1 mt-0.5">
                          <MapPin size={10} /> {listing.location}
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
                        {format(new Date(listing.availableFrom), 'MMM d, yyyy')} - <br/>
                        {format(new Date(listing.availableTo), 'MMM d, yyyy')}
                      </td>
                      <td className="px-5 py-4 text-agri-earth-500 text-xs">
                        {format(new Date(listing.updatedAt), 'MMM d, yyyy')}
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
