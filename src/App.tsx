import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import { DataProvider } from './store/DataContext';
import { MainLayout } from './layouts/MainLayout';
import { Login } from './pages/Login';
import { ConfirmEmail } from './pages/ConfirmEmail';
import { Dashboard } from './pages/Dashboard';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { BiomassRecords } from './pages/BiomassRecords';
import { AggregationHubs } from './pages/AggregationHubs';
import { BiomassListings } from './pages/BiomassListings';
import { ListingDetail } from './pages/ListingDetail';
import { Inquiries } from './pages/Inquiries';
import { MapView } from './pages/MapView';
import { Reports } from './pages/Reports';
import { AuditLogs } from './pages/AuditLogs';
import { UsersPage } from './pages/Users';
import { Role } from './types';
import { normalizeAuthRedirectHash } from './utils/authRedirect';

// Normalize any incoming Supabase auth fragments (#access_token=... or #error=...)
// so HashRouter routes directly to /confirm-email
normalizeAuthRedirectHash();

// Simple protected route wrapper
const ProtectedRoute = ({ 
  children, 
  allowedRoles = Object.values(Role) 
}: { 
  children: React.ReactNode, 
  allowedRoles?: Role[] 
}) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-agri-cream-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-agri-green-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // If authenticated but not authorized, redirect to dashboard
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/confirm-email" element={<ConfirmEmail />} />
            <Route path="/auth/callback" element={<ConfirmEmail />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="biomass-records" element={<BiomassRecords />} />
              <Route path="aggregation-hubs" element={<AggregationHubs />} />
              <Route path="listings" element={<BiomassListings />} />
              <Route path="listings/:type/:id" element={<ListingDetail />} />
              <Route path="inquiries" element={<Inquiries />} />
              <Route path="reports" element={
                <ProtectedRoute allowedRoles={[Role.ADMINISTRATOR, Role.COORDINATOR, Role.LGU]}>
                  <Reports />
                </ProtectedRoute>
              } />
              <Route path="users" element={
                <ProtectedRoute allowedRoles={[Role.ADMINISTRATOR]}>
                  <UsersPage />
                </ProtectedRoute>
              } />
              <Route path="audit-logs" element={
                <ProtectedRoute allowedRoles={[Role.ADMINISTRATOR]}>
                  <AuditLogs />
                </ProtectedRoute>
              } />
              <Route path="map" element={<MapView />} />
              <Route path="*" element={<PlaceholderPage />} />
            </Route>
          </Routes>
        </Router>
      </DataProvider>
    </AuthProvider>
  );
}
