import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { db } from '../store/mockDb';
import { ValidationRecord, RecordStatus, SystemAction } from '../types';
import { useAuth } from '../store/AuthContext';
import { CheckCircle, XCircle, RotateCcw } from 'lucide-react';

interface ValidationFormProps {
  recordId: string;
  onComplete: () => void;
}

export const ValidationForm: React.FC<ValidationFormProps> = ({ recordId, onComplete }) => {
  const { user } = useAuth();
  const [basis, setBasis] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  if (!user) return null;

  const handleValidateAction = (decision: RecordStatus) => {
    if (!basis && decision === RecordStatus.VALIDATED) {
      setError('Validation basis is required when approving a record.');
      return;
    }

    if (!notes && (decision === RecordStatus.RETURNED || decision === RecordStatus.REJECTED)) {
      setError('Notes are required when returning or rejecting a record.');
      return;
    }

    const validation: ValidationRecord = {
      id: `VAL-${Date.now()}`,
      biomassRecordId: recordId,
      validatorId: user.id,
      decision,
      validationBasis: basis || 'Not provided',
      validationNotes: notes || 'None',
      validationDate: new Date().toISOString(),
    };

    db.addValidation(validation, user.id);
    onComplete();
  };

  return (
    <Card className="border-agri-green-200 shadow-sm mt-6">
      <CardHeader className="bg-agri-green-50/50 border-b border-agri-green-100 pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          Validation Actions
        </CardTitle>
        <CardDescription>
          Record your evaluation decision. This is an information review, not a physical certification.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Validation Basis</label>
            <select 
              className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-agri-green-500 focus:border-agri-green-500 h-10"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
            >
              <option value="">-- Select Basis --</option>
              <option value="Documentary Review">Documentary Review</option>
              <option value="Phone Verification">Phone Verification</option>
              <option value="Field Visit">Field Visit</option>
              <option value="Historical Data Comparison">Historical Data Comparison</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Validation Notes</label>
            <textarea 
              className="w-full p-2 border border-gray-200 rounded-md text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
              rows={2}
              placeholder="Required for returns or rejections..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 justify-end pt-2 border-t border-gray-100 mt-4">
          <Button 
            variant="outline" 
            className="text-red-600 border-red-200 hover:bg-red-50" 
            icon={<XCircle size={16} />}
            onClick={() => handleValidateAction(RecordStatus.REJECTED)}
          >
            Reject
          </Button>
          <Button 
            variant="outline" 
            className="text-yellow-600 border-yellow-200 hover:bg-yellow-50"
            icon={<RotateCcw size={16} />}
            onClick={() => handleValidateAction(RecordStatus.RETURNED)}
          >
            Return
          </Button>
          <Button 
            className="bg-agri-green-600 hover:bg-agri-green-700" 
            icon={<CheckCircle size={16} />}
            onClick={() => handleValidateAction(RecordStatus.VALIDATED)}
          >
            Validate Record
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
