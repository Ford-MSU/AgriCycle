import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { Button } from './ui/Button';
import { RecordStatus, SystemAction } from '../types';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { CheckCircle, XCircle, RotateCcw, Clock, AlertCircle } from 'lucide-react';

interface ValidationFormProps {
  recordId: string;
  currentStatus: RecordStatus;
  onComplete: () => void;
}

export const ValidationForm: React.FC<ValidationFormProps> = ({
  recordId,
  currentStatus,
  onComplete,
}) => {
  const { user } = useAuth();
  const { addValidation, updateRecord } = useData();
  const [basis, setBasis] = useState('Documentary Review');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const handleMarkUnderReview = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await updateRecord(recordId, { status: RecordStatus.UNDER_REVIEW }, SystemAction.REVIEW);
      onComplete();
    } catch (err: any) {
      setError(err?.message || 'Failed to update review status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecision = async (decision: RecordStatus) => {
    setError('');

    if (decision === RecordStatus.VALIDATED && !basis) {
      setError('Validation basis is required when approving a biomass record.');
      return;
    }

    if ((decision === RecordStatus.RETURNED || decision === RecordStatus.REJECTED) && !notes.trim()) {
      setError(`An explanatory reason is mandatory when ${decision === RecordStatus.RETURNED ? 'returning' : 'rejecting'} a record.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await addValidation(
        recordId,
        decision,
        basis || 'Documentary Review',
        notes.trim() || (decision === RecordStatus.VALIDATED ? 'Validated according to regional biomass guidelines' : 'Not specified')
      );
      onComplete();
    } catch (err: any) {
      setError(err?.message || 'Failed to save validation decision.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-agri-green-300 shadow-sm mt-6 bg-white">
      <CardHeader className="bg-agri-green-50/70 border-b border-agri-green-100 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            LGU Administrative Review Workflow
          </CardTitle>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase">
            Status: {currentStatus}
          </span>
        </div>
        <CardDescription className="text-xs text-gray-600">
          Official administrative review evaluating documentary completeness and regional reporting standards. This does not constitute a laboratory or biological certification.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-200 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Mark Under Review if Submitted */}
        {currentStatus === RecordStatus.SUBMITTED && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div className="text-xs text-blue-900">
              <p className="font-semibold">Step 1: Initiate Formal Review</p>
              <p className="text-blue-700">Acknowledge receipt and move this submission into active evaluation.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="bg-white border-blue-300 text-blue-800 hover:bg-blue-100 shrink-0"
              icon={<Clock size={15} />}
              isLoading={isSubmitting}
              onClick={handleMarkUnderReview}
            >
              Mark as Under Review
            </Button>
          </div>
        )}

        {/* Evaluation Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Validation Basis *
            </label>
            <select
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-agri-green-500 focus:border-agri-green-500"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
            >
              <option value="Documentary Review">Documentary Review (Barangay/Coop records)</option>
              <option value="Phone Verification">Phone / Officer Verification</option>
              <option value="Field Visit">Field Inspection / Site Visit</option>
              <option value="Historical Data Comparison">Historical Agronomic Yield Comparison</option>
              <option value="LGU Farm Registry Cross-Reference">LGU Farm Registry Cross-Reference</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Grounding methodology used by the LGU reviewer.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reviewer Notes / Correction Reason
            </label>
            <textarea
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
              rows={3}
              placeholder="Mandatory if returning for correction or rejecting. Explains what needs correction to the submitter..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2.5 justify-end pt-3 border-t border-gray-100 mt-2">
          <Button
            type="button"
            variant="outline"
            className="text-red-700 border-red-200 hover:bg-red-50 text-xs py-2 px-3"
            icon={<XCircle size={15} />}
            disabled={isSubmitting}
            onClick={() => handleDecision(RecordStatus.REJECTED)}
          >
            Reject Record
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-amber-700 border-amber-200 hover:bg-amber-50 text-xs py-2 px-3"
            icon={<RotateCcw size={15} />}
            disabled={isSubmitting}
            onClick={() => handleDecision(RecordStatus.RETURNED)}
          >
            Return for Correction
          </Button>
          <Button
            type="button"
            className="bg-agri-green-600 hover:bg-agri-green-700 text-white text-xs py-2 px-4 shadow-sm"
            icon={<CheckCircle size={15} />}
            isLoading={isSubmitting}
            onClick={() => handleDecision(RecordStatus.VALIDATED)}
          >
            Validate Record
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
