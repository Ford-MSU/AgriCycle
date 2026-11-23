import React, { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  X,
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle2,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { BrandLogo } from './BrandLogo';
import { Role } from '../types';
import { cn } from '../utils/cn';
import { getRoleDisplayName, getRoleShortName, getRoleBadgeStyle } from '../utils/rbac';

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

const getRolePortalLabel = (role?: Role): string => {
  switch (role) {
    case Role.ADMINISTRATOR:
      return 'ADMINISTRATOR PORTAL';
    case Role.COORDINATOR:
      return 'BIOMASS COORDINATOR';
    case Role.LGU:
      return 'LGU PLANNING PORTAL';
    case Role.BUYER:
      return 'BUYER PORTAL';
    default:
      return 'WORKSPACE PORTAL';
  }
};

const getUserInitials = (name: string): string => {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return 'AC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

interface AuthenticatedSidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  isDesktopCollapsed: boolean;
  onToggleDesktopCollapse: () => void;
}

export const AuthenticatedSidebar: React.FC<AuthenticatedSidebarProps> = ({
  isMobileOpen,
  onCloseMobile,
  isDesktopCollapsed,
  onToggleDesktopCollapse,
}) => {
  const { user, logout } = useAuth();
  const { organizations } = useData();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = useMemo(() => getRoleSpecificNavItems(user?.role), [user?.role]);

  const userDisplayName =
    user?.name?.trim() || user?.email?.split('@')[0] || 'Authenticated User';
  const userInitials = useMemo(() => getUserInitials(userDisplayName), [userDisplayName]);
  const roleShortName = getRoleShortName(user?.role);
  const roleDisplayName = getRoleDisplayName(user?.role);
  const roleBadgeClass = getRoleBadgeStyle(user?.role);
  const portalLabel = getRolePortalLabel(user?.role);

  const userOrganization = useMemo(() => {
    if (!user?.organizationId) return null;
    return organizations.find((org) => org.id === user.organizationId) || null;
  }, [organizations, user?.organizationId]);

  const isNavItemActive = (item: NavItem) => {
    if (item.matchFn) {
      return item.matchFn(location.pathname, location.search);
    }
    return location.pathname === item.path.split('?')[0];
  };

  const handleLogout = async () => {
    onCloseMobile();
    await logout();
    navigate('/', { replace: true });
  };

  const renderSidebarBody = (collapsed: boolean, isDrawer: boolean) => (
    <div className="flex flex-col h-full bg-white text-[#1E3328]">
      {/* Top Branding + Portal Label */}
      <div
        className={cn(
          'border-b border-[#E2EAE3] shrink-0',
          collapsed ? 'px-2 py-4 flex flex-col items-center gap-2' : 'px-4 py-4'
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between gap-2',
            collapsed ? 'justify-center w-full' : ''
          )}
        >
          <Link
            to="/"
            onClick={() => {
              if (isDrawer) onCloseMobile();
            }}
            title={collapsed ? 'AgriCycle Workspace' : undefined}
            className="flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006B45] rounded-lg py-0.5 min-w-0"
          >
            <BrandLogo size="sm" showText={!collapsed} />
          </Link>

          {isDrawer ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation drawer"
              className="p-1.5 rounded-lg text-[#64756A] hover:text-[#1E3328] hover:bg-[#EAF4EC] border border-[#E2EAE3] transition-colors cursor-pointer shrink-0"
            >
              <X size={18} />
            </button>
          ) : (
            !collapsed && (
              <button
                type="button"
                onClick={onToggleDesktopCollapse}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                className="p-1.5 rounded-lg text-[#64756A] hover:text-[#006B45] hover:bg-[#EAF4EC] transition-colors cursor-pointer shrink-0"
              >
                <PanelLeftClose size={17} />
              </button>
            )
          )}
        </div>

        {!collapsed ? (
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#006B45]">
            {portalLabel}
          </p>
        ) : (
          !isDrawer && (
            <button
              type="button"
              onClick={onToggleDesktopCollapse}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="p-1.5 rounded-lg text-[#64756A] hover:text-[#006B45] hover:bg-[#EAF4EC] transition-colors cursor-pointer"
            >
              <PanelLeftOpen size={17} />
            </button>
          )
        )}
      </div>

      {/* User Profile Card */}
      <div className={cn('border-b border-[#E2EAE3] shrink-0', collapsed ? 'p-2.5' : 'p-3.5')}>
        {collapsed ? (
          <div
            title={`${userDisplayName} — ${roleDisplayName}`}
            className="w-10 h-10 mx-auto rounded-xl bg-[#006B45] text-white font-bold text-xs flex items-center justify-center select-none"
          >
            {userInitials}
          </div>
        ) : (
          <div className="bg-[#F7FAF7] border border-[#E2EAE3] rounded-xl p-3 flex items-start gap-3">
            <div
              aria-hidden="true"
              className="w-9 h-9 rounded-lg bg-[#006B45] text-white font-bold text-xs flex items-center justify-center shrink-0 select-none mt-0.5"
            >
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#1E3328] truncate" title={userDisplayName}>
                {userDisplayName}
              </p>
              <p
                className="text-[11px] text-[#64756A] truncate mt-0.5"
                title={userOrganization?.name || roleDisplayName}
              >
                {userOrganization?.name || roleDisplayName}
              </p>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border mt-1.5 max-w-full truncate',
                  roleBadgeClass
                )}
                title={roleDisplayName}
              >
                {roleShortName}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Vertical Role-Specific Navigation Links */}
      <div className="flex-1 overflow-y-auto py-3 px-2.5">
        {!collapsed && (
          <p className="px-2.5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#64756A]">
            Navigation
          </p>
        )}
        <nav
          aria-label={isDrawer ? 'Mobile Sidebar Navigation' : 'Sidebar Navigation'}
          className="space-y-1"
        >
          {navItems.map((item) => {
            const active = isNavItemActive(item);
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => {
                  if (isDrawer) onCloseMobile();
                }}
                title={collapsed ? item.name : undefined}
                aria-label={collapsed ? item.name : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center rounded-xl text-[13px] transition-colors',
                  collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                  active
                    ? 'bg-[#006B45] text-white font-semibold shadow-2xs'
                    : 'text-[#1E3328] font-medium hover:bg-[#EAF4EC] hover:text-[#006B45]'
                )}
              >
                <item.icon
                  size={18}
                  className={cn('shrink-0', active ? 'text-white' : 'text-[#64756A]')}
                />
                {!collapsed && <span className="leading-snug">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Sign Out Section */}
      <div className={cn('mt-auto border-t border-[#E2EAE3] shrink-0', collapsed ? 'p-2.5' : 'p-3')}>
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? 'Sign Out' : undefined}
          aria-label="Sign Out"
          className={cn(
            'flex items-center w-full rounded-xl text-[13px] font-semibold text-[#64756A] hover:text-red-700 hover:bg-red-50 border border-[#E2EAE3] hover:border-red-200 transition-colors cursor-pointer',
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2.5'
          )}
        >
          <LogOut size={17} className="shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Persistent Desktop Left Sidebar */}
      <aside
        aria-label="Workspace Sidebar"
        className={cn(
          'hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen lg:shrink-0 border-r border-[#E2EAE3] bg-white z-30 transition-[width] duration-200',
          isDesktopCollapsed ? 'lg:w-[76px]' : 'lg:w-[260px]'
        )}
      >
        {renderSidebarBody(isDesktopCollapsed, false)}
      </aside>

      {/* Mobile & Tablet Slide-In Overlay Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            aria-hidden="true"
            onClick={onCloseMobile}
            className="fixed inset-0 bg-[#1E3328]/40 backdrop-blur-[1px]"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Workspace Navigation Drawer"
            className="relative z-10 w-[272px] max-w-[85vw] h-full bg-white border-r border-[#E2EAE3] shadow-xl flex flex-col"
          >
            {renderSidebarBody(false, true)}
          </aside>
        </div>
      )}
    </>
  );
};
