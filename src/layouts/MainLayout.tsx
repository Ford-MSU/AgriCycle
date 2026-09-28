import React, { useState } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { Role } from '../types';
import { cn } from '../utils/cn';
import { 
  Leaf, 
  LayoutDashboard, 
  Tractor, 
  FileText, 
  CheckSquare, 
  Map as MapIcon, 
  Layers, 
  List, 
  MessageSquare, 
  BarChart3, 
  ShieldCheck, 
  Users, 
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  User as UserIcon,
  Flag,
  Database,
  Search,
  Activity,
  ClipboardList,
  AlertTriangle
} from 'lucide-react';

const getRoleSpecificNavItems = (role: Role | undefined) => {
  if (!role) return [];

  const baseItems = [{ name: 'Dashboard', path: '/', icon: LayoutDashboard }];

  switch (role) {
    case Role.ADMINISTRATOR:
      return [
        ...baseItems,
        { name: 'Users', path: '/users', icon: Users },
        { name: 'Roles & Permissions', path: '/roles-permissions', icon: ShieldCheck },
        { name: 'Reference Data', path: '/reference-data', icon: Database },
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
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = getRoleSpecificNavItems(user?.role);

  return (
    <div className="flex h-screen bg-agri-cream-50 overflow-hidden">
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
              {/* Dynamic title could go here based on route */}
              Platform Dashboard
            </h1>
          </div>
          
          <div className="hidden md:flex items-center justify-center flex-1">
             <span className="bg-yellow-100 text-yellow-800 border border-yellow-200 text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full flex items-center gap-1 shadow-sm">
               <AlertTriangle size={12} />
               Academic Prototype - Demo Data Only
             </span>
          </div>

          <div className="flex items-center gap-4">
            <button className="text-agri-earth-500 hover:text-agri-green-600 relative">
              <Bell size={20} />
              <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-agri-accent-500 ring-2 ring-white"></span>
            </button>
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
          <Outlet />
        </main>
      </div>
    </div>
  );
};
