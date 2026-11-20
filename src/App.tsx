import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import { DataProvider } from './store/DataContext';
import { MainLayout } from './layouts/MainLayout';
import { PublicDashboard } from './pages/PublicDashboard';
import { Login } from './pages/Login';
import { AdminLogin } from './pages/AdminLogin';
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

// Normalize incoming Supabase auth fragments (#access_token=... or #error=...)
normalizeAuthRedirectHash();

const ProtectedRoute = ({
  children,
  allowedRoles = Object.values(Role),
}: {
  children: React.ReactNode;
  allowedRoles?: Role[];
}) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7FAF7]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006B45]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const RootEntryRoute: React.FC = () => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7FAF7]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006B45]" />
      </div>
    );
  }

  if (!user) {
    if (location.pathname !== '/') {
      return <Navigate to="/" replace />;
    }
    return <PublicDashboard />;
  }

  return <MainLayout />;
};

const AdminLoginRoute: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7FAF7]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006B45]" />
      </div>
    );
  }

  if (user && user.role === Role.ADMINISTRATOR) {
    return <Navigate to="/" replace />;
  }

  return <AdminLogin />;
};

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin/login" element={<AdminLoginRoute />} />
            <Route path="/confirm-email" element={<ConfirmEmail />} />
            <Route path="/auth/callback" element={<ConfirmEmail />} />

            <Route path="/" element={<RootEntryRoute />}>
              <Route
                index
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="biomass-records"
                element={
                  <ProtectedRoute allowedRoles={[Role.COORDINATOR, Role.LGU]}>
                    <BiomassRecords />
                  </ProtectedRoute>
                }
              />
              <Route
                path="aggregation-hubs"
                element={
                  <ProtectedRoute allowedRoles={[Role.COORDINATOR, Role.LGU]}>
                    <AggregationHubs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="aggregation"
                element={
                  <ProtectedRoute allowedRoles={[Role.COORDINATOR, Role.LGU]}>
                    <AggregationHubs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="listings"
                element={
                  <ProtectedRoute allowedRoles={[Role.BUYER]}>
                    <BiomassListings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="listings/:type/:id"
                element={
                  <ProtectedRoute allowedRoles={[Role.BUYER]}>
                    <ListingDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="inquiries"
                element={
                  <ProtectedRoute allowedRoles={[Role.COORDINATOR, Role.BUYER]}>
                    <Inquiries />
                  </ProtectedRoute>
                }
              />
              <Route
                path="reports"
                element={
                  <ProtectedRoute allowedRoles={[Role.ADMINISTRATOR, Role.COORDINATOR, Role.LGU]}>
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedRoute allowedRoles={[Role.ADMINISTRATOR]}>
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="audit-logs"
                element={
                  <ProtectedRoute allowedRoles={[Role.ADMINISTRATOR]}>
                    <AuditLogs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="map"
                element={
                  <ProtectedRoute allowedRoles={[Role.COORDINATOR, Role.LGU, Role.BUYER]}>
                    <MapView />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<PlaceholderPage />} />
            </Route>
          </Routes>
        </Router>
      </DataProvider>
    </AuthProvider>
  );
}
