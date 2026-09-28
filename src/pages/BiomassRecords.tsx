import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { RecordStatus, Role, BiomassRecord, SystemAction } from '../types';
import { db } from '../store/mockDb';
import { useAuth } from '../store/AuthContext';
import { hasPermission, Permission } from '../utils/rbac';
import { Search, Filter, Plus, FileText, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CreateRecordForm } from '../components/CreateRecordForm';
import { ValidationForm } from '../components/ValidationForm';

export const BiomassRecords: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isCreating, setIsCreating] = useState(false);
  
  // State for detail view
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(searchParams.get('recordId'));

  // Sync selectedRecordId with URL
  useEffect(() => {
    if (selectedRecordId) {
      setSearchParams({ recordId: selectedRecordId });
    } else {
      setSearchParams({});
    }
  }, [selectedRecordId, setSearchParams]);

  if (!user) return null;

  if (isCreating) {
    return (
      <CreateRecordForm 
        onCancel={() => setIsCreating(false)} 
        onSuccess={(newId) => {
          setIsCreating(false);
          setSelectedRecordId(newId);
        }} 
      />
    );
  }

  // Render detail view if a record is selected
  if (selectedRecordId) {
    const record = db.getRecord(selectedRecordId);
    if (!record) return <div>Record not found</div>;
    
    const type = db.referenceData.find(r => r.id === record.biomassTypeId)?.label;
    const source = db.getSource(record.sourceId);
    const location = source ? db.getLocation(source.locationId) : null;
    const unit = db.referenceData.find(r => r.id === record.originalUnit)?.label;
    
    // Self-validation check
    const isSubmitter = record.submitterId === user.id;
    const canValidate = hasPermission(user.role, Permission.VALIDATE_BIOMASS_RECORD);
    const showValidationControls = canValidate && record.status === RecordStatus.SUBMITTED;
    const canSubmit = hasPermission(user.role, Permission.MANAGE_BIOMASS_RECORDS) && record.status === RecordStatus.DRAFT;

    const handleStatusChange = (newStatus: RecordStatus, action: SystemAction) => {
      if (isSubmitter && canValidate && (action === SystemAction.VALIDATE || action === SystemAction.REJECT || action === SystemAction.RETURN)) {
         alert("Self-validation denied. You cannot validate a record you submitted.");
         return;
      }
      
      const updates: Partial<BiomassRecord> = { status: newStatus };
      if (action === SystemAction.VALIDATE) {
        updates.validationDate = new Date().toISOString();
      }
      
      db.updateRecord(record.id, updates, user.id, action);
      
      // Force re-render (In a real app, we'd use context or Redux)
      setSelectedRecordId(null);
      setTimeout(() => setSelectedRecordId(record.id), 0);
    };

    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setSelectedRecordId(null)} className="p-2">
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Record Details</h2>
            <p className="text-sm text-agri-earth-500 mt-1">
              Detailed view and traceability of the biomass record.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row justify-between items-start border-b border-gray-100 pb-4">
            <div>
              <CardTitle className="text-xl">{type}</CardTitle>
              <CardDescription className="mt-1">ID: {record.id}</CardDescription>
            </div>
            <StatusBadge status={record.status} />
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-10 text-sm">
            <div>
              <p className="text-gray-500 font-medium mb-1">Reported Quantity</p>
              <p className="font-semibold text-gray-900 text-lg">
                {record.quantity.toLocaleString()} {unit}
              </p>
              {record.reservedQuantity !== undefined && record.remainingQuantity !== undefined && (
                <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                   <div className="flex justify-between mb-1">
                     <span>Reserved:</span>
                     <span className="font-medium">{record.reservedQuantity.toLocaleString()} {unit}</span>
                   </div>
                   <div className="flex justify-between">
                     <span>Remaining Available:</span>
                     <span className="font-bold text-agri-green-700">{record.remainingQuantity.toLocaleString()} {unit}</span>
                   </div>
                </div>
              )}
              {record.isTheoreticalEstimate && (
                <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded mt-2">
                  Theoretical Estimate — Not Current Supply
                </span>
              )}
            </div>
            <div>
              <p className="text-gray-500 font-medium mb-1">Availability Window</p>
              <p className="text-gray-900">
                {format(new Date(record.availabilityPeriodStart), 'MMM d, yyyy')} to {format(new Date(record.availabilityPeriodEnd), 'MMM d, yyyy')}
              </p>
              <p className="text-gray-500 font-medium mb-1 mt-3">Present Use</p>
              <p className="text-gray-900">{record.currentUse}</p>
            </div>
            <div>
              <p className="text-gray-500 font-medium mb-1">Source Information</p>
              <p className="text-gray-900">{source?.name}</p>
              <p className="text-gray-600 text-xs">{source?.type} • {location?.barangay}</p>
              <p className="text-gray-500 font-medium mb-1 mt-3">Condition</p>
              <p className="text-gray-900">{record.condition} {record.conditionNote && <span className="text-gray-500 text-xs">({record.conditionNote})</span>}</p>
            </div>
            <div>
              <p className="text-gray-500 font-medium mb-1">Traceability</p>
              <p className="text-gray-900">Submitted by: {record.submitterId}</p>
              <p className="text-gray-600 text-xs">Last Updated: {format(new Date(record.lastUpdatedDate), 'MMM d, yyyy HH:mm')}</p>
              {record.validationDate && (
                <p className="text-gray-600 text-xs mt-0.5">Last Validated: {format(new Date(record.validationDate), 'MMM d, yyyy HH:mm')}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Validation / Action Controls */}
        <div className="flex flex-col gap-3">
          {canSubmit && (
            <Card className="border-agri-green-200 bg-agri-green-50/30">
               <CardContent className="p-4 flex justify-between items-center">
                 <div>
                   <p className="font-medium text-gray-900">Submit for Review</p>
                   <p className="text-xs text-gray-500">Send this draft to the LGU for validation.</p>
                 </div>
                 <Button onClick={() => handleStatusChange(RecordStatus.SUBMITTED, SystemAction.SUBMIT)}>
                   Submit Record
                 </Button>
               </CardContent>
            </Card>
          )}

          {showValidationControls && (
            <Card className={isSubmitter ? "border-red-200 bg-red-50/30" : "border-yellow-200 bg-yellow-50/30"}>
              <CardContent className="p-4">
                {isSubmitter ? (
                  <div className="text-red-700 text-sm flex items-center gap-2 font-medium p-4">
                    <AlertTriangle size={16} /> Self-validation is not permitted. You cannot validate a record you submitted.
                  </div>
                ) : (
                  <ValidationForm 
                    recordId={record.id} 
                    onComplete={() => {
                      // Trigger a re-render or notification if needed.
                      // Since we use mockDb without context state, forcing a re-render is needed
                      setSearchTerm(searchTerm + ' ');
                      setTimeout(() => setSearchTerm(searchTerm), 10);
                    }} 
                  />
                )}
              </CardContent>
            </Card>
          )}
          
          {canValidate && (record.status === RecordStatus.VALIDATED) && (
             <Card className="border-gray-200 bg-gray-50/50">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-900">Data Freshness</p>
                    <p className="text-xs text-gray-500">Mark as stale if the availability period has passed or information is outdated.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleStatusChange(RecordStatus.UNAVAILABLE, SystemAction.MARK_UNAVAILABLE)}>
                      Mark Unavailable
                    </Button>
                    <Button variant="outline" className="text-yellow-600 border-yellow-200 hover:bg-yellow-50" onClick={() => handleStatusChange(RecordStatus.STALE, SystemAction.MARK_STALE)}>
                      Flag as Stale
                    </Button>
                  </div>
                </CardContent>
             </Card>
          )}
        </div>
      </div>
    );
  }

  // Filter records based on role and search
  const allRecords = db.records;
  let visibleRecords = allRecords;

  // Role-based filtering
  if (user.role === Role.COORDINATOR) {
    visibleRecords = allRecords.filter(r => r.submitterId === user.id || r.sourceId.includes('src-1') || r.sourceId.includes('src-2')); 
  } else if (user.role === Role.BUYER) {
    visibleRecords = allRecords.filter(r => r.status === RecordStatus.VALIDATED); // Buyers only see validated
  }

  // Search & Status filters
  if (statusFilter !== 'ALL') {
    visibleRecords = visibleRecords.filter(r => r.status === statusFilter);
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    visibleRecords = visibleRecords.filter(r => {
      const type = db.referenceData.find(ref => ref.id === r.biomassTypeId)?.label?.toLowerCase() || '';
      const source = db.getSource(r.sourceId)?.name?.toLowerCase() || '';
      return type.includes(term) || source.includes(term);
    });
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Biomass Records</h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Manage and view reported practical availability.
          </p>
        </div>
        {hasPermission(user.role, Permission.MANAGE_BIOMASS_RECORDS) && (
          <Button icon={<Plus size={18} />} onClick={() => setIsCreating(true)}>
            Add New Record
          </Button>
        )}
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
                placeholder="Search by biomass type or source..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter size={18} className="text-gray-400" />
              <select
                className="block w-full sm:w-48 pl-3 pr-10 py-2 text-sm border-gray-200 focus:outline-none focus:ring-agri-green-500 focus:border-agri-green-500 rounded-lg"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value={RecordStatus.VALIDATED}>Validated</option>
                <option value={RecordStatus.UNDER_REVIEW}>Under Review</option>
                <option value={RecordStatus.STALE}>Stale</option>
                <option value={RecordStatus.UNAVAILABLE}>Unavailable</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-agri-earth-500 font-semibold tracking-wider">
                  <th className="px-5 py-4">Biomass Source & Type</th>
                  <th className="px-5 py-4">Quantity</th>
                  <th className="px-5 py-4">Availability</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Last Updated</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {visibleRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                      No records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  visibleRecords.map((record) => {
                    const type = db.referenceData.find(r => r.id === record.biomassTypeId)?.label;
                    const source = db.getSource(record.sourceId);
                    const location = source ? db.getLocation(source.locationId) : null;
                    const unit = db.referenceData.find(r => r.id === record.originalUnit)?.label;
                    
                    return (
                      <tr key={record.id} className="hover:bg-agri-green-50/30 transition-colors cursor-pointer" onClick={() => setSelectedRecordId(record.id)}>
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-900">{type}</p>
                          <p className="text-xs text-agri-earth-500 mt-0.5">{source?.name}</p>
                          {location && <p className="text-xs text-agri-earth-400">{location.barangay}</p>}
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-semibold text-gray-900">{record.quantity.toLocaleString()}</span>
                          <span className="text-xs text-agri-earth-500 ml-1">{unit}</span>
                          {record.isTheoreticalEstimate && (
                            <span className="block text-[10px] text-yellow-600 font-medium uppercase mt-1">Theoretical Est.</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-agri-earth-600 text-xs">
                          {format(new Date(record.availabilityPeriodStart), 'MMM d, yyyy')} - <br/>
                          {format(new Date(record.availabilityPeriodEnd), 'MMM d, yyyy')}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={record.status} />
                        </td>
                        <td className="px-5 py-4 text-agri-earth-500 text-xs">
                          {format(new Date(record.lastUpdatedDate), 'MMM d, yyyy')}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button variant="outline" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); setSelectedRecordId(record.id); }}>
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
