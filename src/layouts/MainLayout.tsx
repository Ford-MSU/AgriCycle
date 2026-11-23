import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Menu,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { InactivityTracker } from '../components/InactivityTracker';
import { AuthenticatedSidebar } from '../components/AuthenticatedSidebar';
import { BrandLogo } from '../components/BrandLogo';
import { cn } from '../utils/cn';
import {
  getRoleBadgeStyle,
  getRoleDisplayName,
  getRoleShortName,
} from '../utils/rbac';

export const MainLayout: React.FC = () => {
  const { user } = useAuth();
  const {
    isUsingSupabase,
    error,
    isLoading,
    refreshData,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useData();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileDrawerOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationsOpen &&
        notificationsDropdownRef.current &&
        !notificationsDropdownRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
        setMobileDrawerOpen(false);
      }
    };

    if (notificationsOpen || mobileDrawerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationsOpen, mobileDrawerOpen]);

  // Strict recipient scoping
  const userNotifications = useMemo(
    () =>
      notifications.filter((n) => {
        if (!user) return false;
        if (n.recipientUserId) {
          return n.recipientUserId === user.id || n.recipientUserId === user.email;
        }
        if (n.recipientRole) {
          return n.recipientRole === user.role;
        }
        return false;
      }),
    [notifications, user]
  );

  const unreadCount = userNotifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = (n: (typeof userNotifications)[number]) => {
    markNotificationRead(n.id);
    setNotificationsOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  };

  const userDisplayName =
    user?.name?.trim() || user?.email?.split('@')[0] || 'Authenticated User';
  const roleDisplayName = getRoleDisplayName(user?.role);
  const roleShortName = getRoleShortName(user?.role);
  const roleBadgeClass = getRoleBadgeStyle(user?.role);

  return (
    <div className="min-h-screen bg-[#F7FAF7] text-[#1E3328] flex">
      <InactivityTracker />

      {/* Shared Role-Based Left Sidebar (Persistent Sticky on Desktop, Slide-In Drawer on Tablet/Mobile) */}
      <AuthenticatedSidebar
        isMobileOpen={mobileDrawerOpen}
        onCloseMobile={() => setMobileDrawerOpen(false)}
        isDesktopCollapsed={desktopCollapsed}
        onToggleDesktopCollapse={() => setDesktopCollapsed((prev) => !prev)}
      />

      {/* Right Main Workspace Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Top Workspace Toolbar */}
        <header className="sticky top-0 z-30 h-16 w-full bg-white/95 backdrop-blur-sm border-b border-[#E2EAE3] px-4 sm:px-6 flex items-center justify-between gap-3">
          {/* Left: Mobile/Tablet Drawer Trigger + Mobile Brand / Desktop Role Context */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileDrawerOpen}
              className="lg:hidden p-2 rounded-lg text-[#1E3328] hover:bg-[#EAF4EC] border border-[#E2EAE3] transition-colors cursor-pointer shrink-0"
            >
              <Menu size={18} />
            </button>

            <Link
              to="/"
              className="lg:hidden flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006B45] rounded-lg py-0.5"
            >
              <BrandLogo size="sm" showText />
            </Link>

            <div className="hidden lg:flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-[#1E3328] truncate">
                {roleDisplayName}
              </span>
            </div>
          </div>

          {/* Right: Refresh, Notifications, Compact User Info & Role Badge */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => refreshData()}
              disabled={isLoading}
              title={isUsingSupabase ? 'Refresh data from database' : 'Refresh workspace data'}
              aria-label="Refresh workspace data"
              className="text-[#64756A] hover:text-[#006B45] disabled:opacity-60 p-2 rounded-lg hover:bg-[#EAF4EC] transition-colors cursor-pointer"
            >
              <RefreshCw size={17} className={isLoading ? 'animate-spin text-[#006B45]' : ''} />
            </button>

            {/* Notifications Dropdown */}
            <div className="relative" ref={notificationsDropdownRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="text-[#64756A] hover:text-[#006B45] relative p-2 rounded-lg hover:bg-[#EAF4EC] transition-colors cursor-pointer"
                title="System Notifications"
                aria-label="System Notifications"
                aria-expanded={notificationsOpen}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[17px] h-[17px] px-1 text-[10px] font-bold text-white bg-[#E8A800] rounded-full ring-2 ring-white tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-[#E2EAE3] py-2 z-50">
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

            {/* Compact User Profile Indicator & Role Badge */}
            <div className="hidden sm:flex items-center gap-2 border-l border-[#E2EAE3] pl-3">
              <span className="text-sm font-medium text-[#1E3328] max-w-[150px] truncate">
                {userDisplayName}
              </span>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap',
                  roleBadgeClass
                )}
                title={roleDisplayName}
              >
                {roleShortName}
              </span>
            </div>
          </div>
        </header>

        {/* Main Workspace Content */}
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
    </div>
  );
};
