import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { InactivityTracker } from '../components/InactivityTracker';
import { BrandLogo } from '../components/BrandLogo';
import { Role } from '../types';
import { cn } from '../utils/cn';
import { getRoleDisplayName, getRoleShortName, getRoleBadgeStyle } from '../utils/rbac';
import { format } from 'date-fns';
import {
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
  ClipboardList,
  AlertTriangle,
  RefreshCw,
  CheckCheck,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  matchFn?: (pathname: string, search: string) => boolean;
}

const getRoleSpecificNavItems = (role: Role | undefined): NavItem[] => {
  if (!role) return [];

  switch (role) {
    case Role.ADMINISTRATOR:
      return [
        {
          name: 'Dashboard',
          path: '/',
          icon: LayoutDashboard,
          matchFn: (pathname) => pathname === '/',
        },
        { name: 'Users', path: '/users', icon: Users },
        { name: 'Administrative Reports', path: '/reports', icon: BarChart3 },
        { name: 'Audit Logs', path: '/audit-logs', icon: ClipboardList },
      ];
    case Role.COORDINATOR:
      return [
        {
          name: 'Dashboard',
          path: '/',
          icon: LayoutDashboard,
          matchFn: (pathname) => pathname === '/',
        },
        {
          name: 'Biomass Sources & Records',
          path: '/biomass-records',
          icon: FileText,
          matchFn: (pathname, search) =>
            pathname === '/biomass-records' && !search.includes('tab=validation'),
        },
        {
          name: 'Biomass Validation',
          path: '/biomass-records?tab=validation',
          icon: ShieldCheck,
          matchFn: (pathname, search) =>
            pathname === '/biomass-records' && search.includes('tab=validation'),
        },
        {
          name: 'Biomass Aggregation',
          path: '/aggregation-hubs',
          icon: Layers,
          matchFn: (pathname) =>
            pathname === '/aggregation-hubs' || pathname === '/aggregation',
        },
        { name: 'GIS Map', path: '/map', icon: MapIcon },
        { name: 'Buyer Inquiries', path: '/inquiries', icon: MessageSquare },
        { name: 'Reports & Monitoring', path: '/reports', icon: BarChart3 },
      ];
    case Role.LGU:
      return [
        {
          name: 'Overview',
          path: '/',
          icon: LayoutDashboard,
          matchFn: (pathname) => pathname === '/',
        },
        {
          name: 'Validated Biomass Records',
          path: '/biomass-records',
          icon: CheckCircle2,
        },
        { name: 'GIS Map', path: '/map', icon: MapIcon },
        {
          name: 'Availability and Aggregation',
          path: '/aggregation-hubs',
          icon: Layers,
          matchFn: (pathname) =>
            pathname === '/aggregation-hubs' || pathname === '/aggregation',
        },
        { name: 'Planning Reports', path: '/reports', icon: BarChart3 },
      ];
    case Role.BUYER:
      return [
        {
          name: 'Dashboard',
          path: '/',
          icon: LayoutDashboard,
          matchFn: (pathname) => pathname === '/',
        },
        {
          name: 'Biomass Listings',
          path: '/listings',
          icon: List,
          matchFn: (pathname) => pathname.startsWith('/listings'),
        },
        { name: 'GIS Map', path: '/map', icon: MapIcon },
        { name: 'My Inquiries', path: '/inquiries', icon: MessageSquare },
      ];
    default:
      return [
        {
          name: 'Dashboard',
          path: '/',
          icon: LayoutDashboard,
          matchFn: (pathname) => pathname === '/',
        },
      ];
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
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Strict recipient scoping
  const userNotifications = notifications.filter((n) => {
    if (!user) return false;
    if (n.recipientUserId) {
      return n.recipientUserId === user.id || n.recipientUserId === user.email;
    }
    if (n.recipientRole) {
      return n.recipientRole === user.role;
    }
    return false;
  });
  const unreadCount = userNotifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = (n: any) => {
    markNotificationRead(n.id);
    setNotificationsOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  };

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    navigate('/', { replace: true });
  };

  const navItems = getRoleSpecificNavItems(user?.role);

  const isNavItemActive = (item: NavItem) => {
    if (item.matchFn) {
      return item.matchFn(location.pathname, location.search);
    }
    return location.pathname === item.path.split('?')[0];
  };

  return (
    <div className="min-h-screen bg-[#F7FAF7] text-[#1E3328] flex flex-col">
      <InactivityTracker />

      {/* Sticky Horizontal Top Header Navigation (Zero Sidebar) */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-sm border-b border-[#E2EAE3]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Left: Official AgriCycle Brand */}
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006B45] rounded-lg py-1"
          >
            <BrandLogo size="sm" showText />
          </Link>

          {/* Center: Single-Line Horizontal Role Navigation */}
          <nav
            aria-label="Workspace Navigation"
            className="hidden lg:flex items-center gap-1 overflow-x-auto no-scrollbar"
          >
            {navItems.map((item) => {
              const active = isNavItemActive(item);
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-[#EAF4EC] text-[#006B45] font-semibold'
                      : 'text-[#64756A] hover:text-[#1E3328] hover:bg-[#F7FAF7]'
                  )}
                >
                  <item.icon size={15} className="shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right: Actions, Notifications, User Badge, Sign Out */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isUsingSupabase && (
              <button
                type="button"
                onClick={() => refreshData()}
                disabled={isLoading}
                title="Refresh data from database"
                className="text-[#64756A] hover:text-[#006B45] p-1.5 rounded-lg hover:bg-[#EAF4EC] transition-colors cursor-pointer"
              >
                <RefreshCw size={17} className={isLoading ? 'animate-spin text-[#006B45]' : ''} />
              </button>
            )}

            {/* Notifications Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="text-[#64756A] hover:text-[#006B45] relative p-1.5 rounded-lg hover:bg-[#EAF4EC] transition-colors cursor-pointer"
                title="System Notifications"
                aria-label="System Notifications"
              >
                <Bell size={19} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[17px] h-[17px] px-1 text-[10px] font-bold text-white bg-[#E8A800] rounded-full ring-2 ring-white tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-[#E2EAE3] py-2 z-50">
                  <div className="px-4 py-2.5 border-b border-[#E2EAE3] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#1E3328]">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="bg-[#FFF7E2] text-[#8F6500] border border-[#F5DA8A] text-xs px-2 py-0.5 rounded-md font-semibold tabular-nums">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllNotificationsRead()}
                        className="text-xs text-[#006B45] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCheck size={14} /> Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-[360px] overflow-y-auto divide-y divide-[#E2EAE3]">
                    {userNotifications.length === 0 ? (
                      <div className="py-8 text-center text-sm text-[#64756A]">
                        No notifications yet
                      </div>
                    ) : (
                      userNotifications.slice(0, 15).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={cn(
                            'px-4 py-3 hover:bg-[#EAF4EC]/50 cursor-pointer transition-colors flex gap-3 items-start',
                            !n.isRead ? 'bg-[#EAF4EC]/30' : ''
                          )}
                        >
                          <div
                            className={cn(
                              'w-2 h-2 mt-2 rounded-full shrink-0',
                              !n.isRead ? 'bg-[#006B45]' : 'bg-transparent'
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                'text-xs truncate',
                                !n.isRead ? 'font-bold text-[#1E3328]' : 'font-medium text-[#1E3328]'
                              )}
                            >
                              {n.title}
                            </p>
                            <p className="text-xs text-[#64756A] mt-0.5 line-clamp-2">{n.message}</p>
                            <span className="text-[10px] text-[#64756A] mt-1 block">
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

            {/* User Display & Role Badge */}
            <div className="hidden md:flex items-center gap-2 border-l border-[#E2EAE3] pl-3">
              <span className="text-sm font-medium text-[#1E3328] max-w-[130px] truncate">
                {user?.name}
              </span>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap',
                  getRoleBadgeStyle(user?.role)
                )}
                title={getRoleDisplayName(user?.role)}
              >
                {getRoleShortName(user?.role)}
              </span>
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#64756A] hover:text-red-700 hover:bg-red-50 border border-[#E2EAE3] hover:border-red-200 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>

            {/* Compact Mobile Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden p-2 rounded-lg text-[#1E3328] hover:bg-[#EAF4EC] border border-[#E2EAE3] transition-colors cursor-pointer"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Compact Dropdown Menu (Zero Left Sidebar) */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[#E2EAE3] bg-white px-4 py-3 space-y-1 shadow-sm">
            <div className="pb-2 mb-2 border-b border-[#E2EAE3] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1E3328] truncate">{user?.name}</p>
                <p className="text-xs text-[#64756A] truncate">{getRoleDisplayName(user?.role)}</p>
              </div>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border shrink-0',
                  getRoleBadgeStyle(user?.role)
                )}
              >
                {getRoleShortName(user?.role)}
              </span>
            </div>

            {navItems.map((item) => {
              const active = isNavItemActive(item);
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'bg-[#EAF4EC] text-[#006B45] font-semibold'
                      : 'text-[#1E3328] hover:bg-[#F7FAF7]'
                  )}
                >
                  <item.icon size={16} />
                  <span>{item.name}</span>
                </Link>
              );
            })}

            <div className="pt-2 mt-2 border-t border-[#E2EAE3]">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </header>

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
