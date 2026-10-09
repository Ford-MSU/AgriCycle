import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { RecordStatus } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { ArrowLeft, Save, Plus, MapPin } from 'lucide-react';

interface CreateRecordFormProps {
  onCancel: () => void;
  onSuccess: (recordId: string) => void;
}

export const CreateRecordForm: React.FC<CreateRecordFormProps> = ({ onCancel, onSuccess }) => {
  const { user } = useAuth();
  const {
    sources,
    locations,
    referenceData,
    getBiomassTypes,
    getSource,
    addLocation,
    addSource,
    addRecord,
  } = useData();

  // Record Form State
  const [sourceId, setSourceId] = useState('');
  const [biomassTypeId, setBiomassTypeId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [originalUnit, setOriginalUnit] = useState('');
  const [isTheoreticalEstimate, setIsTheoreticalEstimate] = useState(false);
  const [availabilityPeriodStart, setAvailabilityPeriodStart] = useState('');
  const [availabilityPeriodEnd, setAvailabilityPeriodEnd] = useState('');
  const [currentUse, setCurrentUse] = useState('');
  const [reservedQuantity, setReservedQuantity] = useState('');
  const [remainingQuantity, setRemainingQuantity] = useState('');
  const [condition, setCondition] = useState('');
  const [conditionNote, setConditionNote] = useState('');
  const [storage, setStorage] = useState('');
  const [accessLocationNotes, setAccessLocationNotes] = useState('');

  // Source Creation State
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceType, setNewSourceType] = useState('Agricultural Coop');
  const [newSourceLocationId, setNewSourceLocationId] = useState('');
  const [newSourceContact, setNewSourceContact] = useState('');
  const [isSavingSource, setIsSavingSource] = useState(false);

  // Location Creation State
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [newBarangay, setNewBarangay] = useState('');
  const [newCity, setNewCity] = useState('Butuan City');
  const [newProvince, setNewProvince] = useState('Agusan del Norte');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  const handleCreateLocation = async () => {
    setError('');
    if (!newBarangay.trim() || !newCity.trim() || !newProvince.trim()) {
      setError('Please provide Barangay, City, and Province for the new location.');
      return;
    }

    let coordinates: { lat: number; lng: number } | undefined;
    if (newLat.trim() || newLng.trim()) {
      const latNum = Number(newLat);
      const lngNum = Number(newLng);
      if (isNaN(latNum) || latNum < -90 || latNum > 90 || isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        setError('Please enter valid latitude (-90 to 90) and longitude (-180 to 180) coordinates.');
        return;
      }
      coordinates = { lat: latNum, lng: lngNum };
    }

    setIsSavingLocation(true);
    try {
      const createdLoc = await addLocation({
        barangay: newBarangay.trim(),
        city: newCity.trim(),
        province: newProvince.trim(),
        coordinates,
      });
      setNewSourceLocationId(createdLoc.id);
      setIsCreatingLocation(false);
      setNewBarangay('');
      setNewLat('');
      setNewLng('');
    } catch (err: any) {
      setError(err?.message || 'Failed to save location.');
    } finally {
      setIsSavingLocation(false);
    }
  };

  const handleCreateSource = async () => {
    setError('');
    if (!newSourceName.trim() || !newSourceLocationId || !newSourceContact.trim()) {
      setError('Please fill in all required source fields.');
      return;
    }

    setIsSavingSource(true);
    try {
      const createdSource = await addSource({
        name: newSourceName.trim(),
        type: newSourceType,
        locationId: newSourceLocationId,
        contactPerson: newSourceContact.trim(),
        cooperativeId: user.organizationId,
      });

      setSourceId(createdSource.id);
      setIsCreatingSource(false);
      setNewSourceName('');
      setNewSourceContact('');
    } catch (err: any) {
      setError(err?.message || 'Failed to register new source.');
    } finally {
      setIsSavingSource(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!sourceId || !biomassTypeId || !quantity || !originalUnit || !availabilityPeriodStart || !availabilityPeriodEnd) {
      setError('Please fill in all required fields.');
      return;
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be a positive number.');
      return;
    }

    const reserved = reservedQuantity ? Number(reservedQuantity) : 0;
    if (isNaN(reserved) || reserved < 0 || reserved > qty) {
      setError('Reserved quantity cannot be negative or exceed total quantity.');
      return;
    }

    const remaining = remainingQuantity ? Number(remainingQuantity) : qty - reserved;
    if (isNaN(remaining) || remaining < 0 || remaining > qty - reserved) {
      setError('Remaining quantity cannot be negative or exceed (Total Quantity - Reserved Quantity).');
      return;
    }

    if (new Date(availabilityPeriodEnd) < new Date(availabilityPeriodStart)) {
      setError('Availability end date cannot be before start date.');
      return;
    }

    const source = getSource(sourceId);
    if (!source) {
      setError('Selected source is invalid.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await addRecord({
        biomassTypeId,
        quantity: qty,
        originalUnit,
        sourceId,
        locationId: source.locationId,
        status: RecordStatus.SUBMITTED,
        isTheoreticalEstimate,
        availabilityPeriodStart: new Date(availabilityPeriodStart).toISOString(),
        availabilityPeriodEnd: new Date(availabilityPeriodEnd).toISOString(),
        currentUse: currentUse.trim() || 'Not specified',
        reservedQuantity: reserved,
        remainingQuantity: remaining,
        condition: condition.trim() || 'Not specified',
        conditionNote: conditionNote.trim(),
        storage: storage.trim() || 'Not specified',
        accessLocationNotes: accessLocationNotes.trim() || 'Not specified',
        submitterId: user.id,
      });

      onSuccess(created.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to save biomass record to database.');
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
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Add New Biomass Record</h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Encode a new biomass availability record for validation.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/50">
            <CardTitle className="text-lg">1. Source Information</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {!isCreatingSource ? (
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Biomass Source *</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                  >
                    <option value="">-- Select Source --</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.type})
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreatingSource(true)}
                  icon={<Plus size={16} />}
                >
                  New Source
                </Button>
              </div>
            ) : (
              <div className="bg-agri-green-50/30 p-4 rounded-lg border border-agri-green-100 space-y-4">
                <h4 className="font-semibold text-agri-green-800 text-sm">Register New Source</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Source Name *"
                    placeholder="e.g. Lumbocan Farm"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Source Type *</label>
                    <select
                      className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500 h-10"
                      value={newSourceType}
                      onChange={(e) => setNewSourceType(e.target.value)}
                    >
                      <option value="Agricultural Coop">Agricultural Coop</option>
                      <option value="Industrial">Industrial</option>
                      <option value="Farm">Farm</option>
                      <option value="LGU Facility">LGU Facility</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-gray-700">Location *</label>
                      {!isCreatingLocation && (
                        <button
                          type="button"
                          onClick={() => setIsCreatingLocation(true)}
                          className="text-xs text-agri-green-700 hover:underline flex items-center gap-1"
                        >
                          <MapPin size={12} /> + Add Barangay
                        </button>
                      )}
                    </div>
                    <select
                      className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500 h-10"
                      value={newSourceLocationId}
                      onChange={(e) => setNewSourceLocationId(e.target.value)}
                    >
                      <option value="">-- Select Location --</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.barangay}, {loc.city}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Contact Person *"
                    placeholder="Name of contact"
                    value={newSourceContact}
                    onChange={(e) => setNewSourceContact(e.target.value)}
                  />
                </div>

                {isCreatingLocation && (
                  <div className="bg-white p-4 rounded-md border border-gray-200 space-y-3">
                    <h5 className="text-xs font-semibold uppercase text-gray-700">New Barangay Location</h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Input
                        label="Barangay *"
                        placeholder="e.g. Tiniwisan"
                        value={newBarangay}
                        onChange={(e) => setNewBarangay(e.target.value)}
                      />
                      <Input
                        label="City *"
                        value={newCity}
                        onChange={(e) => setNewCity(e.target.value)}
                      />
                      <Input
                        label="Province *"
                        value={newProvince}
                        onChange={(e) => setNewProvince(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        label="Latitude (Optional)"
                        type="number"
                        step="any"
                        placeholder="e.g. 8.9612"
                        value={newLat}
                        onChange={(e) => setNewLat(e.target.value)}
                      />
                      <Input
                        label="Longitude (Optional)"
                        type="number"
                        step="any"
                        placeholder="e.g. 125.5681"
                        value={newLng}
                        onChange={(e) => setNewLng(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setIsCreatingLocation(false)}>
                        Cancel
                      </Button>
                      <Button type="button" size="sm" onClick={handleCreateLocation} isLoading={isSavingLocation}>
                        Save Location
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setIsCreatingSource(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleCreateSource} isLoading={isSavingSource}>
                    Save Source
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/50">
            <CardTitle className="text-lg">2. Biomass Availability Details</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Biomass Type *</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500 h-10"
                  value={biomassTypeId}
                  onChange={(e) => setBiomassTypeId(e.target.value)}
                >
                  <option value="">-- Select Biomass Type --</option>
                  {getBiomassTypes().map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {bt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Availability Classification *</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500 h-10"
                  value={isTheoreticalEstimate ? 'true' : 'false'}
                  onChange={(e) => setIsTheoreticalEstimate(e.target.value === 'true')}
                >
                  <option value="false">Practical Availability (Currently available supply)</option>
                  <option value="true">Theoretical Estimate (Potential yield, not current supply)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Total Quantity *"
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <Input
                label="Reserved Quantity (Optional)"
                type="number"
                min="0"
                step="any"
                value={reservedQuantity}
                onChange={(e) => setReservedQuantity(e.target.value)}
              />
              <Input
                label="Remaining Quantity"
                type="number"
                min="0"
                step="any"
                value={remainingQuantity}
                onChange={(e) => setRemainingQuantity(e.target.value)}
                placeholder={quantity ? String(Math.max(0, Number(quantity) - (Number(reservedQuantity) || 0))) : ''}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500 h-10"
                  value={originalUnit}
                  onChange={(e) => setOriginalUnit(e.target.value)}
                >
                  <option value="">-- Select Unit --</option>
                  {referenceData
                    .filter((r) => r.category === 'UNIT' && r.isActive)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Availability Start Date *"
                type="date"
                value={availabilityPeriodStart}
                onChange={(e) => setAvailabilityPeriodStart(e.target.value)}
              />
              <Input
                label="Availability End Date *"
                type="date"
                value={availabilityPeriodEnd}
                onChange={(e) => setAvailabilityPeriodEnd(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/50">
            <CardTitle className="text-lg">3. Condition & Logistics</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Condition / Quality Observation"
                placeholder="e.g. Dry, Wet, Mixed"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              />
              <Input
                label="Storage Condition"
                placeholder="e.g. Open yard, Covered warehouse"
                value={storage}
                onChange={(e) => setStorage(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Quality / Condition Notes (Optional)"
                placeholder="e.g. Stored in covered warehouse, clean bags"
                value={conditionNote}
                onChange={(e) => setConditionNote(e.target.value)}
              />
              <Input
                label="Present/Current Use"
                placeholder="e.g. Used as fuel, Left in field, Available"
                value={currentUse}
                onChange={(e) => setCurrentUse(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Access & Practical Availability Notes
              </label>
              <textarea
                className="w-full p-3 border border-gray-200 rounded-md text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                rows={3}
                placeholder="e.g. Accessible by 10-wheeler truck"
                value={accessLocationNotes}
                onChange={(e) => setAccessLocationNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" icon={<Save size={18} />} isLoading={isSubmitting}>
            Submit Biomass Record
          </Button>
        </div>
      </form>
    </div>
  );
};
