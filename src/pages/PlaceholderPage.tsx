import React from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Construction } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export const PlaceholderPage: React.FC = () => {
  const location = useLocation();
  const moduleName = location.pathname.substring(1).replace('-', ' ');

  return (
    <div className="h-full flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center border-dashed border-2 border-[#C3DFC8] bg-white">
        <CardContent className="pt-10 pb-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-[#EAF4EC] flex items-center justify-center text-[#006B45] mb-4">
            <Construction size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#1E3328] capitalize mb-2">
            {moduleName || 'Module'} Under Construction
          </h2>
          <p className="text-[#64756A] mb-6">
            This module is scheduled for implementation in Phase 2 of the AgriCycle research prototype.
          </p>
          <div className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium bg-[#EAF4EC] text-[#006B45]">
            Coming in next phase
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
