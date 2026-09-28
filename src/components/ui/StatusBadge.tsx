import React from 'react';
import { cn } from '../../utils/cn';
import { RecordStatus } from '../../types';

interface StatusBadgeProps {
  status: RecordStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const getStatusStyles = (status: RecordStatus) => {
    switch (status) {
      case RecordStatus.DRAFT:
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case RecordStatus.SUBMITTED:
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case RecordStatus.UNDER_REVIEW:
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case RecordStatus.VALIDATED:
        return 'bg-agri-green-50 text-agri-green-700 border-agri-green-200';
      case RecordStatus.RETURNED:
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case RecordStatus.REJECTED:
        return 'bg-red-50 text-red-700 border-red-200';
      case RecordStatus.STALE:
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case RecordStatus.UNAVAILABLE:
        return 'bg-gray-100 text-gray-500 border-gray-200 line-through';
      case RecordStatus.RESERVED:
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case RecordStatus.ALREADY_USED:
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case RecordStatus.UNSUITABLE:
        return 'bg-red-50 text-red-700 border-red-200';
      case RecordStatus.ARCHIVED:
        return 'bg-gray-200 text-gray-600 border-gray-300';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (status: RecordStatus) => {
    return status.replace(/_/g, ' ');
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize",
        getStatusStyles(status),
        className
      )}
    >
      {getStatusLabel(status).toLowerCase()}
    </span>
  );
};
