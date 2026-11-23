import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { BrandLogo } from './BrandLogo';
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
  RefreshCw,
  CheckCheck,
  CheckCircle2,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';

export interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  matchFn?: (pathname: string, search: string) => boolean;
}

export const getRoleSpecificNavItems = (role: Role | undefined): NavItem[] => {
  if (!role) return [];

  switch (role) {
    case Role.ADMINISTRATOR:
      return [
        {
          name: 'Dashboard',
          path: '/',
          icon: LayoutDashboard,
          matchFn: (pathname) => pathname === '/' || pathname === '/dashboard',
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
          matchFn: (pathname) => pathname === '/' || pathname === '/dashboard',
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
          matchFn: (pathname) => pathname === '/' || pathname === '/dashboard',
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
          matchFn: (pathname) => pathname === '/' || pathname === '/dashboard',
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
          matchFn: (pathname) => pathname === '/' || pathname === '/dashboard',
        },
      ];
  }
};

export const AuthenticatedHeader: React.FC = () => {
  const { user, logout } = useAuth();
  const {
    isUsingSupabase,
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
  const [useCompactNav, setUseCompactNav] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const headerRowRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const navProbeRef = useRef<HTMLDivElement>(null);
  const rightProbeRef = useRef<HTMLDivElement>(null);
  const notificationsDropdownRef = useRef<HTMLDivElement>(null);

  const navItems = useMemo(() => getRoleSpecificNavItems(user?.role), [user?.role]);

  const measureHeaderFit = useCallback(() => {
    const rowEl = headerRowRef.current;
    const brandEl = brandRef.current;
    const navProbeEl = navProbeRef.current;
    const rightProbeEl = rightProbeRef.current;
    if (!rowEl || !brandEl || !navProbeEl || !rightProbeEl) return;

    if (window.innerWidth < 768) {
      setUseCompactNav(true);
      return;
    }

    const computed = window.getComputedStyle(rowEl);
    const padLeft = parseFloat(computed.paddingLeft) || 0;
    const padRight = parseFloat(computed.paddingRight) || 0;
    const usableWidth = rowEl.clientWidth - padLeft - padRight;

    // Require enough space for brand + gap + full single-row nav + gap + full right controls + buffer
    const requiredWidth =
      brandEl.offsetWidth +
      16 +
      navProbeEl.scrollWidth +
      16 +
      rightProbeEl.scrollWidth +
      12;

    setUseCompactNav(usableWidth < requiredWidth);
  }, []);

  useLayoutEffect(() => {
    measureHeaderFit();

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            measureHeaderFit();
          })
        : null;

    if (observer) {
      if (headerRowRef.current) observer.observe(headerRowRef.current);
      if (brandRef.current) observer.observe(brandRef.current);
      if (navProbeRef.current) observer.observe(navProbeRef.current);
      if (rightProbeRef.current) observer.observe(rightProbeRef.current);
    }

    window.addEventListener('resize', measureHeaderFit);
    let mounted = true;
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (mounted) measureHeaderFit();
      });
    }

    return () => {
      mounted = false;
      observer?.disconnect();
      window.removeEventListener('resize', measureHeaderFit);
    };
  }, [measureHeaderFit, navItems, user?.name, user?.role]);

  useEffect(() => {
    if (!useCompactNav) {
      setMobileMenuOpen(false);
    }
  }, [useCompactNav]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        notificationsOpen &&
        notificationsDropdownRef.current &&
        !notificationsDropdownRef.current.contains(target)
      ) {
        setNotificationsOpen(false);
      }
      if (mobileMenuOpen && headerRef.current && !headerRef.current.contains(target)) {
        setMobileMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
        setMobileMenuOpen(false);
      }
    };

    if (notificationsOpen || mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationsOpen, mobileMenuOpen]);

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

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
    await logout();
    navigate('/', { replace: true });
  };

  const isNavItemActive = (item: NavItem) => {
    if (item.matchFn) {
      return item.matchFn(location.pathname, location.search);
    }
    return location.pathname === item.path.split('?')[0];
  };

  const roleShortName = getRoleShortName(user?.role);
  const roleDisplayName = getRoleDisplayName(user?.role);
  const roleBadgeClass = getRoleBadgeStyle(user?.role);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-sm border-b border-[#E2EAE3]"
    >
      {/* Hidden intrinsic-width probes for unified space-driven layout calculation */}
      <div
        aria-hidden="true"
        className="fixed top-0 left-0 w-0 h-0 overflow-hidden pointer-events-none invisible"
      >
        <div className="flex items-center w-max">
          <div ref={navProbeRef} className="flex items-center gap-1 whitespace-nowrap shrink-0">
            {navItems.map((item) => (
              <div
                key={item.name}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap shrink-0"
              >
                <item.icon size={15} className="shrink-0" />
                <span>{item.name}</span>
              </div>
            ))}
          </div>

          <div ref={rightProbeRef} className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <div className="p-1.5">
            <RefreshCw size={17} />
          </div>
          <div className="p-1.5">
            <Bell size={19} />
          </div>
          <div className="flex items-center gap-2 border-l border-[#E2EAE3] pl-2.5">
            <span className="text-sm font-medium max-w-[140px] xl:max-w-[170px] truncate">
              {user?.name}
            </span>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap',
                roleBadgeClass
              )}
            >
              {roleShortName}
            </span>
          </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap">
              <LogOut size={14} />
              <span>Sign Out</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Full-Width Header Bar */}
      <div
        ref={headerRowRef}
        className="w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-4"
      >
        {/* Left Section: Official AgriCycle Logo + Role-Specific Navigation */}
        <div className="flex items-center gap-4 min-w-0">
          <Link
            ref={brandRef}
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006B45] rounded-lg py-1"
          >
            <BrandLogo size="sm" showText />
          </Link>

          {!useCompactNav && (
            <nav aria-label="Workspace Navigation" className="flex items-center gap-1 min-w-0">
              {navItems.map((item) => {
                const active = isNavItemActive(item);
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors shrink-0',
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
          )}
        </div>

        {/* Right Section: Refresh, Notifications, User Info, Role Badge, Sign Out */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => refreshData()}
            disabled={isLoading}
            title={isUsingSupabase ? 'Refresh data from database' : 'Refresh workspace data'}
            aria-label="Refresh workspace data"
            className="text-[#64756A] hover:text-[#006B45] disabled:opacity-60 p-1.5 rounded-lg hover:bg-[#EAF4EC] transition-colors cursor-pointer"
          >
            <RefreshCw size={17} className={isLoading ? 'animate-spin text-[#006B45]' : ''} />
          </button>

          {/* Notifications Dropdown */}
          <div className="relative" ref={notificationsDropdownRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((prev) => !prev)}
              className="text-[#64756A] hover:text-[#006B45] relative p-1.5 rounded-lg hover:bg-[#EAF4EC] transition-colors cursor-pointer"
              title="System Notifications"
              aria-label="System Notifications"
              aria-expanded={notificationsOpen}
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

          {/* Authenticated User Info & Role Badge */}
          <div className="hidden md:flex items-center gap-2 border-l border-[#E2EAE3] pl-2.5">
            <span className="text-sm font-medium text-[#1E3328] max-w-[140px] xl:max-w-[170px] truncate">
              {user?.name}
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

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={handleLogout}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#64756A] hover:text-red-700 hover:bg-red-50 border border-[#E2EAE3] hover:border-red-200 transition-colors cursor-pointer whitespace-nowrap"
            title="Sign Out"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>

          {/* Compact Dropdown Toggle (shown when full horizontal nav cannot fit comfortably) */}
          {useCompactNav && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="p-2 rounded-lg text-[#1E3328] hover:bg-[#EAF4EC] border border-[#E2EAE3] transition-colors cursor-pointer"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* Compact Top Dropdown Navigation (Zero Left Sidebar) */}
      {useCompactNav && mobileMenuOpen && (
        <div className="border-t border-[#E2EAE3] bg-white px-4 py-3 space-y-1 shadow-sm">
          <div className="pb-2 mb-2 border-b border-[#E2EAE3] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#1E3328] truncate">{user?.name}</p>
              <p className="text-xs text-[#64756A] truncate">{roleDisplayName}</p>
            </div>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border shrink-0',
                roleBadgeClass
              )}
            >
              {roleShortName}
            </span>
          </div>

          <nav aria-label="Compact Workspace Navigation" className="space-y-1">
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
                  <item.icon size={16} className="shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

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
  );
};
