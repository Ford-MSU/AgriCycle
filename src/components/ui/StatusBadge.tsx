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
        return 'bg-[#F7FAF7] text-[#64756A] border-[#E2EAE3]';
      case RecordStatus.SUBMITTED:
        return 'bg-sky-50 text-sky-800 border-sky-200';
      case RecordStatus.UNDER_REVIEW:
        return 'bg-[#FFF7E2] text-[#8F6500] border-[#F0D68A]';
      case RecordStatus.VALIDATED:
        return 'bg-[#EAF4EC] text-[#006B45] border-[#C3DFC8]';
      case RecordStatus.RETURNED:
        return 'bg-[#FFF7E2] text-[#9C5C00] border-[#F0C878]';
      case RecordStatus.REJECTED:
        return 'bg-red-50 text-red-700 border-red-200';
      case RecordStatus.STALE:
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case RecordStatus.UNAVAILABLE:
        return 'bg-gray-100 text-gray-500 border-gray-200 line-through';
      case RecordStatus.RESERVED:
        return 'bg-[#EAF4EC] text-[#008838] border-[#B8DEC2]';
      case RecordStatus.ALREADY_USED:
        return 'bg-teal-50 text-teal-800 border-teal-200';
      case RecordStatus.UNSUITABLE:
        return 'bg-red-50 text-red-700 border-red-200';
      case RecordStatus.ARCHIVED:
        return 'bg-gray-100 text-gray-600 border-gray-300';
      default:
        return 'bg-[#F7FAF7] text-[#64756A] border-[#E2EAE3]';
    }
  };

  const getStatusLabel = (status: RecordStatus) => {
    return status.replace(/_/g, ' ');
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border capitalize',
        getStatusStyles(status),
        className
      )}
    >
      {getStatusLabel(status).toLowerCase()}
    </span>
  );
};
