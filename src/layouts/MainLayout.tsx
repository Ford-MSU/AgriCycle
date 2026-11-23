import React from 'react';
import { Outlet } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { InactivityTracker } from '../components/InactivityTracker';
import { AuthenticatedHeader } from '../components/AuthenticatedHeader';
import { AlertTriangle } from 'lucide-react';

export const MainLayout: React.FC = () => {
  const { isUsingSupabase, error, refreshData } = useData();

  return (
    <div className="min-h-screen bg-[#F7FAF7] text-[#1E3328] flex flex-col">
      <InactivityTracker />

      {/* Shared Responsive Full-Width Header for All Authenticated Roles */}
      <AuthenticatedHeader />

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!isUsingSupabase && (
          <div className="mb-5 bg-[#FFF7E2] border border-[#F5DA8A] text-[#8F6500] px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span>
              Local Fallback Mode active — configure <code className="font-mono">VITE_SUPABASE_URL</code> for live Supabase PostgreSQL persistence.
            </span>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => refreshData()}
              className="px-3 py-1 bg-white border border-red-200 rounded text-xs font-semibold hover:bg-red-100 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        <Outlet />
      </main>
    </div>
  );
};
