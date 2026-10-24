import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { BiomassRecord, RecordStatus, Role } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { ArrowLeft, Save, Plus, MapPin, Search, Check, AlertCircle, Info } from 'lucide-react';

const BUTUAN_BARANGAYS = [
  'Agusan Pequeño', 'Amparo', 'Ampayon', 'Anticala', 'Antongalon', 'Aupagan',
  'Baan KM 3', 'Baan Riverside', 'Babag', 'Bading', 'Bancasi', 'Banza',
  'Baobaoan', 'Basag', 'Bilay', 'Bit-os', 'Bitan-agan', 'Bobon', 'Bonbon',
  'Bugabus', 'Cabcabon', 'Camayahan', 'Dagohoy', 'Dankias', 'De Oro',
  'Diego Silang', 'Doongan', 'Dulag', 'Dumalagan', 'Florida', 'Golden Ribbon',
  'Holy Redeemer', 'Humabon', 'Kinamlutan', 'Lapu-lapu', 'Lemon', 'Leon Kilat',
  'Libertad', 'Limaha', 'Los Angeles', 'Lumbocan', 'Maguinda', 'Mahay',
  'Mahogany', 'Maibu', 'Mandamo', 'Maon', 'Masao', 'Maug', 'New Society Village',
  'Nong-nong', 'Obrero', 'Ong Yiu', 'Pangabugan', 'Pianing', 'Pigdaulan',
  'Pinamanculan', 'Port Poyohon', 'Rajahi', 'Salvacion', 'San Ignacio',
  'San Mateo', 'San Vicente', 'Santo Niño', 'Tagabaca', 'Taguibo', 'Taligaman',
  'Tiniwisan', 'Tungao', 'Urduja', 'Villa Kananga'
];

interface CreateRecordFormProps {
  initialRecord?: BiomassRecord;
  onCancel: () => void;
  onSuccess: (recordId: string) => void;
}

export const CreateRecordForm: React.FC<CreateRecordFormProps> = ({
  initialRecord,
  onCancel,
  onSuccess,
}) => {
  const { user } = useAuth();
  const {
    sources,
    locations,
    referenceData,
    getSource,
    getLocation,
    addLocation,
    addSource,
    addRecord,
    updateRecord,
  } = useData();

  const isEditing = Boolean(initialRecord);

  // Section A: Source State
  const initialSource = initialRecord ? getSource(initialRecord.sourceId) : undefined;
  const initialLocation = initialSource
    ? getLocation(initialSource.locationId)
    : initialRecord
    ? getLocation(initialRecord.locationId)
    : undefined;

  const [sourceId, setSourceId] = useState(initialRecord?.sourceId || '');
  const [sourceType, setSourceType] = useState(initialSource?.type || 'Farm');
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceContact, setNewSourceContact] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState(initialLocation?.barangay || '');
  const [barangaySearch, setBarangaySearch] = useState('');
  const [showBarangayDropdown, setShowBarangayDropdown] = useState(false);
  const [accessLocationNotes, setAccessLocationNotes] = useState(initialRecord?.accessLocationNotes || '');

  // Section B: Biomass Information State
  const [biomassTypeId, setBiomassTypeId] = useState(initialRecord?.biomassTypeId || '');
  const [quantity, setQuantity] = useState(initialRecord ? String(initialRecord.quantity) : '');
  const [originalUnit, setOriginalUnit] = useState(initialRecord?.originalUnit || 'ref-unit-1');
  const [condition, setCondition] = useState(initialRecord?.condition || 'Dry');
  const [conditionNote, setConditionNote] = useState(initialRecord?.conditionNote || '');
  const [storage, setStorage] = useState(initialRecord?.storage || 'Covered Warehouse');
  const [isTheoreticalEstimate, setIsTheoreticalEstimate] = useState(initialRecord?.isTheoreticalEstimate || false);

  // Section C: Utilization and Availability State
  const [currentUseQuantity, setCurrentUseQuantity] = useState(
    initialRecord?.currentUseQuantity !== undefined ? String(initialRecord.currentUseQuantity) : '0'
  );
  const [currentUseDescription, setCurrentUseDescription] = useState(initialRecord?.currentUse || 'Available / not currently used');
  const [reservedQuantity, setReservedQuantity] = useState(
    initialRecord?.reservedQuantity !== undefined ? String(initialRecord.reservedQuantity) : '0'
  );
  const [externalAvailability, setExternalAvailability] = useState<'AVAILABLE_TO_OTHERS' | 'NOT_AVAILABLE'>(
    initialRecord?.externalAvailability || 'AVAILABLE_TO_OTHERS'
  );
  const [availabilityPeriodStart, setAvailabilityPeriodStart] = useState(
    initialRecord?.availabilityPeriodStart ? initialRecord.availabilityPeriodStart.slice(0, 10) : ''
  );
  const [availabilityPeriodEnd, setAvailabilityPeriodEnd] = useState(
    initialRecord?.availabilityPeriodEnd ? initialRecord.availabilityPeriodEnd.slice(0, 10) : ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Filtered barangays for search
  const filteredBarangays = useMemo(() => {
    if (!barangaySearch) return BUTUAN_BARANGAYS.slice(0, 20);
    return BUTUAN_BARANGAYS.filter((b) =>
      b.toLowerCase().includes(barangaySearch.toLowerCase())
    );
  }, [barangaySearch]);

  // Derived calculations: Remaining Available Quantity
  const numQuantity = Number(quantity) || 0;
  const numCurrentUse = Number(currentUseQuantity) || 0;
  const numReserved = Number(reservedQuantity) || 0;
  const calculatedRemaining = Math.max(0, numQuantity - numCurrentUse - numReserved);

  // Dynamic source name label based on selected source type
  const getSourceNameLabel = (type: string) => {
    switch (type) {
      case 'Farm':
        return 'Farm Name';
      case 'Rice Mill':
        return 'Rice Mill Name';
      case 'Agricultural Processor':
        return 'Processing Facility Name';
      default:
        return 'Farm / Mill / Source Name';
    }
  };

  const handleSourceSelect = (selectedId: string) => {
    setSourceId(selectedId);
    const src = getSource(selectedId);
    if (src) {
      setSourceType(src.type);
      const loc = getLocation(src.locationId);
      if (loc) {
        setSelectedBarangay(loc.barangay);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!biomassTypeId) {
      setError('Please select a biomass type.');
      return;
    }

    if (numQuantity <= 0 || isNaN(numQuantity)) {
      setError('Quantity must be a valid positive number.');
      return;
    }

    if (numCurrentUse < 0 || numReserved < 0) {
      setError('Used and reserved quantities cannot be negative.');
      return;
    }

    if (numCurrentUse + numReserved > numQuantity) {
      setError('The sum of Current Use and Reserved Quantity cannot exceed Total Quantity.');
      return;
    }

    // Availability dates are completely optional. Validate only if both are provided
    if (availabilityPeriodStart && availabilityPeriodEnd) {
      if (new Date(availabilityPeriodEnd) < new Date(availabilityPeriodStart)) {
        setError('Availability end date cannot be earlier than start date.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let finalSourceId = sourceId;
      let finalLocationId = initialRecord?.locationId || '';

      // If creating new source inline
      if (isCreatingSource) {
        if (!newSourceName.trim() || !selectedBarangay) {
          setError('Please provide a source name and select a barangay.');
          setIsSubmitting(false);
          return;
        }

        // Find or create location record
        let loc = locations.find(
          (l) => l.barangay.toLowerCase() === selectedBarangay.toLowerCase() && l.city === 'Butuan City'
        );
        if (!loc) {
          loc = await addLocation({
            barangay: selectedBarangay,
            city: 'Butuan City',
            province: 'Agusan del Norte',
          });
        }
        finalLocationId = loc.id;

        const newSource = await addSource({
          name: newSourceName.trim(),
          type: sourceType,
          locationId: loc.id,
          contactPerson: newSourceContact.trim() || user?.name || 'Authorized Contact',
          cooperativeId: user?.organizationId,
        });
        finalSourceId = newSource.id;
      } else {
        if (!finalSourceId) {
          setError('Please select an existing biomass source or create a new one.');
          setIsSubmitting(false);
          return;
        }
        const src = getSource(finalSourceId);
        if (src) {
          finalLocationId = src.locationId;
        }
      }

      const finalStartDate = availabilityPeriodStart
        ? new Date(availabilityPeriodStart).toISOString()
        : undefined;
      const finalEndDate = availabilityPeriodEnd
        ? new Date(availabilityPeriodEnd).toISOString()
        : undefined;

      if (isEditing && initialRecord) {
        await updateRecord(initialRecord.id, {
          biomassTypeId,
          quantity: numQuantity,
          originalUnit,
          sourceId: finalSourceId,
          locationId: finalLocationId,
          status: initialRecord.status === RecordStatus.RETURNED ? RecordStatus.SUBMITTED : initialRecord.status,
          externalAvailability,
          isTheoreticalEstimate,
          availabilityPeriodStart: finalStartDate,
          availabilityPeriodEnd: finalEndDate,
          currentUse: currentUseDescription.trim() || 'Not specified',
          currentUseQuantity: numCurrentUse,
          reservedQuantity: numReserved,
          remainingQuantity: calculatedRemaining,
          condition: condition.trim() || 'Dry',
          conditionNote: conditionNote.trim(),
          storage: storage.trim() || 'Covered Warehouse',
          accessLocationNotes: accessLocationNotes.trim() || 'Accessible location',
        });
        onSuccess(initialRecord.id);
      } else {
        const created = await addRecord({
          biomassTypeId,
          quantity: numQuantity,
          originalUnit,
          sourceId: finalSourceId,
          locationId: finalLocationId,
          status: RecordStatus.SUBMITTED,
          externalAvailability,
          isTheoreticalEstimate,
          availabilityPeriodStart: finalStartDate,
          availabilityPeriodEnd: finalEndDate,
          currentUse: currentUseDescription.trim() || 'Not specified',
          currentUseQuantity: numCurrentUse,
          reservedQuantity: numReserved,
          remainingQuantity: calculatedRemaining,
          condition: condition.trim() || 'Dry',
          conditionNote: conditionNote.trim(),
          storage: storage.trim() || 'Covered Warehouse',
          accessLocationNotes: accessLocationNotes.trim() || 'Accessible location',
          submitterId: user?.id || 'system',
        });
        onSuccess(created.id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save biomass record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onCancel}
          className="p-2 -ml-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {isEditing ? 'Edit Biomass Record' : 'Create Biomass Record'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Encode agricultural biomass availability, source details, and utilization parameters.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm border border-red-200 flex items-start gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION A: SOURCE INFORMATION */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/60">
            <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-agri-green-600 text-white text-xs flex items-center justify-center font-bold">
                A
              </span>
              Source Information
            </CardTitle>
            <CardDescription className="text-xs text-gray-500">
              Identify the farm, mill, or agricultural supplier producing this biomass.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Source Entry:</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingSource(false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    !isCreatingSource
                      ? 'bg-agri-green-50 border-agri-green-500 text-agri-green-800'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Choose Existing Source
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingSource(true)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    isCreatingSource
                      ? 'bg-agri-green-50 border-agri-green-500 text-agri-green-800'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  + Register New Source
                </button>
              </div>
            </div>

            {!isCreatingSource ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Existing Source *
                </label>
                <select
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                  value={sourceId}
                  onChange={(e) => handleSourceSelect(e.target.value)}
                >
                  <option value="">-- Choose Source --</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.type}) — {getLocation(s.locationId)?.barangay || 'Butuan'}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Source Type *</label>
                    <select
                      className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-agri-green-500 focus:border-agri-green-500"
                      value={sourceType}
                      onChange={(e) => setSourceType(e.target.value)}
                    >
                      <option value="Farm">Farm</option>
                      <option value="Rice Mill">Rice Mill</option>
                      <option value="Agricultural Processor">Agricultural Processor</option>
                      <option value="Other">Other Agricultural Source</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {getSourceNameLabel(sourceType)} *
                    </label>
                    <input
                      type="text"
                      className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                      placeholder={`e.g. ${sourceType === 'Farm' ? 'Green Valley Farm' : 'Golden Grain Mill'}`}
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Barangay (Butuan City) *
                    </label>
                    <div className="relative">
                      <div
                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white flex items-center justify-between cursor-pointer"
                        onClick={() => setShowBarangayDropdown(!showBarangayDropdown)}
                      >
                        <span className={selectedBarangay ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                          {selectedBarangay || 'Select Barangay'}
                        </span>
                        <MapPin size={16} className="text-gray-400" />
                      </div>

                      {showBarangayDropdown && (
                        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-2 max-h-56 overflow-y-auto">
                          <input
                            type="text"
                            placeholder="Type to search barangay..."
                            className="w-full p-2 text-xs border border-gray-200 rounded-md mb-2 focus:ring-agri-green-500 focus:border-agri-green-500"
                            value={barangaySearch}
                            onChange={(e) => setBarangaySearch(e.target.value)}
                            autoFocus
                          />
                          <div className="space-y-1">
                            {filteredBarangays.map((b) => (
                              <div
                                key={b}
                                onClick={() => {
                                  setSelectedBarangay(b);
                                  setShowBarangayDropdown(false);
                                  setBarangaySearch('');
                                }}
                                className={`px-2.5 py-1.5 text-xs rounded cursor-pointer flex items-center justify-between hover:bg-agri-green-50 hover:text-agri-green-800 ${
                                  selectedBarangay === b ? 'bg-agri-green-50 font-bold text-agri-green-800' : 'text-gray-700'
                                }`}
                              >
                                <span>{b}</span>
                                {selectedBarangay === b && <Check size={14} className="text-agri-green-600" />}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                    <input
                      type="text"
                      className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                      placeholder="e.g. Juan dela Cruz"
                      value={newSourceContact}
                      onChange={(e) => setNewSourceContact(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Access & Location Notes (Optional)
              </label>
              <input
                type="text"
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                placeholder="e.g. Near Km 7 highway, accessible by 6-wheeler trucks, gated warehouse"
                value={accessLocationNotes}
                onChange={(e) => setAccessLocationNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* SECTION B: BIOMASS INFORMATION */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/60">
            <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-agri-green-600 text-white text-xs flex items-center justify-center font-bold">
                B
              </span>
              Biomass Information
            </CardTitle>
            <CardDescription className="text-xs text-gray-500">
              Specify biomass category, total quantity produced, and physical conditions.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Biomass Category *</label>
                <select
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                  value={biomassTypeId}
                  onChange={(e) => setBiomassTypeId(e.target.value)}
                >
                  <option value="">-- Choose Category --</option>
                  {referenceData
                    .filter((r) => r.category === 'BIOMASS_TYPE')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Quantity *</label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  placeholder="e.g. 500"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit of Measure *</label>
                <select
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                  value={originalUnit}
                  onChange={(e) => setOriginalUnit(e.target.value)}
                >
                  {referenceData
                    .filter((r) => r.category === 'UNIT' && (r.isActive || r.id === originalUnit))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                <select
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                >
                  <option value="Dry">Dry (&lt;14% moisture)</option>
                  <option value="Semi-Dry">Semi-Dry (15-25% moisture)</option>
                  <option value="Wet / Fresh">Wet / Fresh (&gt;25% moisture)</option>
                  <option value="Baled">Baled / Compacted</option>
                  <option value="Loose / Bulk">Loose / Bulk Pile</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Storage Setup</label>
                <select
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                  value={storage}
                  onChange={(e) => setStorage(e.target.value)}
                >
                  <option value="Covered Warehouse">Covered Warehouse</option>
                  <option value="Open Shed">Open Shed (Roof only)</option>
                  <option value="Open Field Tarpaulin">Open Field (Tarpaulin covered)</option>
                  <option value="Open Air Pile">Open Air Pile</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Condition Notes (Optional)</label>
              <input
                type="text"
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                placeholder="e.g. Free of soil debris, stored off-ground on pallets"
                value={conditionNote}
                onChange={(e) => setConditionNote(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* SECTION C: UTILIZATION & AVAILABILITY */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/60">
            <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-agri-green-600 text-white text-xs flex items-center justify-center font-bold">
                C
              </span>
              Utilization & Availability
            </CardTitle>
            <CardDescription className="text-xs text-gray-500">
              Classify current internal utilization versus remaining supply available for coordination and external buyers.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity Currently Used (Internal Use)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  placeholder="0"
                  value={currentUseQuantity}
                  onChange={(e) => setCurrentUseQuantity(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">Biomass used for farm soil conditioning, boiler fuel, etc.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Internal Use Description <span className="text-xs text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  placeholder="e.g. Mulching, boiler combustion, cattle bedding, soil conditioning"
                  value={currentUseDescription}
                  onChange={(e) => setCurrentUseDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity Reserved / Committed
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  placeholder="0"
                  value={reservedQuantity}
                  onChange={(e) => setReservedQuantity(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">Biomass already promised or earmarked.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  External Availability
                </label>
                <select
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                  value={externalAvailability}
                  onChange={(e) => setExternalAvailability(e.target.value as any)}
                >
                  <option value="AVAILABLE_TO_OTHERS">Available to Others / Market</option>
                  <option value="NOT_AVAILABLE">Not Available to Others (Internal Only)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Governs whether remaining volume can be linked to buyers.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Availability Start Date <span className="text-xs text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  value={availabilityPeriodStart}
                  onChange={(e) => setAvailabilityPeriodStart(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Availability End Date <span className="text-xs text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                  value={availabilityPeriodEnd}
                  onChange={(e) => setAvailabilityPeriodEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 italic">
              * Note: Availability window dates are optional. If left blank, the biomass is considered immediately and flexibly available.
            </p>

            {/* Live Calculation Display */}
            <div className="p-4 bg-agri-green-50/70 border border-agri-green-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-agri-green-800">
                  Calculated Remaining Available Supply
                </p>
                <p className="text-xs text-agri-earth-600 mt-0.5">
                  Formula: Total ({numQuantity}) − Current Use ({numCurrentUse}) − Reserved ({numReserved})
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-agri-green-700">
                  {calculatedRemaining.toLocaleString()}
                </span>
                <span className="text-sm font-medium text-agri-green-900 ml-1.5">
                  {referenceData.find((r) => r.id === originalUnit)?.label || 'Units'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-800">
              <Info size={16} className="shrink-0 mt-0.5 text-amber-700" />
              <span>
                <strong>Listing Eligibility Notice:</strong> A record will only be discoverable by buyers in the Biomass Listings once it achieves <strong>VALIDATED</strong> review status from the LGU and is marked <strong>Available to Others</strong>.
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} icon={<Save size={16} />}>
            {isEditing ? 'Save Changes' : 'Submit Biomass Record'}
          </Button>
        </div>
      </form>
    </div>
  );
};
