import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { InactivityTracker } from '../components/InactivityTracker';
import { Role } from '../types';
import { cn } from '../utils/cn';
import { format } from 'date-fns';
import { 
  Leaf, 
  LayoutDashboard, 
  FileText, 
  Map as MapIcon, 
  Layers, 
  List, 
  MessageSquare, 
  BarChart3, 
  Users, 
  LogOut,
  Menu,
  X,
  Bell,
  User as UserIcon,
  Activity,
  ClipboardList,
  AlertTriangle,
  RefreshCw,
  CheckCheck,
  CheckCircle2,
  Clock
} from 'lucide-react';

const getRoleSpecificNavItems = (role: Role | undefined) => {
  if (!role) return [];

  const baseItems = [{ name: 'Dashboard', path: '/', icon: LayoutDashboard }];

  switch (role) {
    case Role.ADMINISTRATOR:
      return [
        ...baseItems,
        { name: 'Users', path: '/users', icon: Users },
        { name: 'Reports & Analytics', path: '/reports', icon: BarChart3 },
        { name: 'Audit Logs', path: '/audit-logs', icon: ClipboardList },
      ];
    case Role.COORDINATOR:
      return [
        ...baseItems,
        { name: 'Sources & Records', path: '/biomass-records', icon: FileText },
        { name: 'Aggregation Hubs', path: '/aggregation-hubs', icon: Layers },
        { name: 'Map View', path: '/map', icon: MapIcon },
        { name: 'Manage Inquiries', path: '/inquiries', icon: MessageSquare },
        { name: 'Reports & Monitoring', path: '/reports', icon: BarChart3 },
      ];
    case Role.LGU:
      return [
        ...baseItems,
        { name: 'Biomass Records', path: '/biomass-records', icon: FileText },
        { name: 'Aggregation Hubs', path: '/aggregation-hubs', icon: Layers },
        { name: 'Map View', path: '/map', icon: MapIcon },
        { name: 'Monitor Inquiries', path: '/inquiries', icon: Activity },
        { name: 'Reports & Analytics', path: '/reports', icon: BarChart3 },
      ];
    case Role.BUYER:
      return [
        ...baseItems,
        { name: 'Biomass Listings', path: '/listings', icon: List },
        { name: 'Map View', path: '/map', icon: MapIcon },
        { name: 'My Inquiries', path: '/inquiries', icon: MessageSquare },
      ];
    default:
      return baseItems;
  }
};

export const MainLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const {
    isUsingSupabase,
    error,
    isLoading,
    refreshData,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useData();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notificationsOpen]);

  const userNotifications = notifications.filter(
    (n) => !n.recipientRole || n.recipientRole === user?.role || n.recipientUserId === user?.id
  );
  const unreadCount = userNotifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = (n: any) => {
    markNotificationRead(n.id);
    setNotificationsOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = getRoleSpecificNavItems(user?.role);

  return (
    <div className="flex h-screen bg-agri-cream-50 overflow-hidden">
      <InactivityTracker />
      {/* Mobile sidebar backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-20 bg-gray-900/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-agri-green-100 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between h-16 px-6 border-b border-agri-green-50 bg-agri-green-500 text-white">
            <div className="flex items-center gap-2">
              <Leaf size={24} />
              <span className="text-lg font-bold tracking-tight">AgriCycle</span>
            </div>
            <button className="lg:hidden text-white" onClick={() => setMobileMenuOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-agri-green-50 text-agri-green-700"
                      : "text-agri-earth-600 hover:bg-agri-cream-100 hover:text-agri-green-700"
                  )
                }
              >
                <item.icon size={18} />
                {item.name}
              </NavLink>
            ))}
          </div>

          <div className="p-4 border-t border-agri-green-100">
            <div className="flex items-center gap-3 mb-4 px-2">
              <div className="w-8 h-8 rounded-full bg-agri-green-100 flex items-center justify-center text-agri-green-600">
                <UserIcon size={16} />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                <p className="text-xs text-agri-earth-500 capitalize">{user?.role.toLowerCase().replace(/_/g, ' ')}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-agri-green-100 flex items-center justify-between px-4 sm:px-6 z-10 shadow-sm">
          <div className="flex items-center">
            <button
              className="lg:hidden text-agri-earth-600 hover:text-agri-green-600 mr-4"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <h1 className="text-xl font-semibold text-gray-800 capitalize hidden sm:block">
              Platform Dashboard
            </h1>
          </div>
          
          {!isUsingSupabase && (
            <div className="hidden md:flex items-center justify-center flex-1">
              <span className="bg-yellow-100 text-yellow-800 border border-yellow-200 text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full flex items-center gap-1 shadow-sm">
                <AlertTriangle size={12} />
                Local Fallback Mode — Configure VITE_SUPABASE_URL for Live Database
              </span>
            </div>
          )}

          <div className="flex items-center gap-4">
            {isUsingSupabase && (
              <button
                onClick={() => refreshData()}
                disabled={isLoading}
                title="Refresh data from database"
                className="text-agri-earth-500 hover:text-agri-green-600 p-1.5 rounded-md hover:bg-agri-green-50 transition-colors"
              >
                <RefreshCw size={18} className={isLoading ? 'animate-spin text-agri-green-600' : ''} />
              </button>
            )}

            {/* Notification Bell with Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="text-agri-earth-500 hover:text-agri-green-600 relative p-1.5 rounded-lg hover:bg-agri-green-50 transition-colors"
                title="System Notifications"
                aria-label="System Notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white shadow-sm animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllNotificationsRead()}
                        className="text-xs text-agri-green-600 hover:text-agri-green-700 font-semibold flex items-center gap-1"
                      >
                        <CheckCheck size={14} /> Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-50">
                    {userNotifications.length === 0 ? (
                      <div className="py-8 text-center text-sm text-gray-400">
                        No notifications yet
                      </div>
                    ) : (
                      userNotifications.slice(0, 15).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={cn(
                            "px-4 py-3 hover:bg-agri-green-50/50 cursor-pointer transition-colors flex gap-3 items-start",
                            !n.isRead ? "bg-emerald-50/30" : ""
                          )}
                        >
                          <div className={cn(
                            "w-2 h-2 mt-2 rounded-full shrink-0",
                            !n.isRead ? "bg-agri-green-600 ring-4 ring-agri-green-100" : "bg-transparent"
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-xs truncate",
                              !n.isRead ? "font-bold text-gray-900" : "font-medium text-gray-700"
                            )}>
                              {n.title}
                            </p>
                            <p className="text-xs text-agri-earth-600 mt-0.5 line-clamp-2">
                              {n.message}
                            </p>
                            <span className="text-[10px] text-gray-400 mt-1 block">
                              {format(new Date(n.createdAt), 'MMM d, h:mm a')}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2 border-l border-agri-green-100 pl-4">
              <span className="text-sm font-medium text-gray-700">{user?.name}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-agri-green-100 text-agri-green-800 capitalize">
                {user?.role.toLowerCase().replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {error && (
            <div className="max-w-7xl mx-auto mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => refreshData()}
                className="px-3 py-1 bg-white border border-red-200 rounded text-xs font-semibold hover:bg-red-100 transition-colors"
              >
                Retry
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};
