import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { PublicDashboard } from './PublicDashboard';

/**
 * Legacy /#/login route compatibility:
 * Renders the redesigned Public Planning Dashboard and smoothly scrolls down
 * to the #access-workspace section (Coordinator & Buyer portals only) rather
 * than displaying the old standalone 4-role login screen.
 */
export const Login: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7FAF7]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006B45]" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <PublicDashboard scrollToLoginOnMount />;
};
