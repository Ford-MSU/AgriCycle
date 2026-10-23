import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Role, User } from '../types';
import {
  Users as UsersIcon,
  Search,
  Filter,
  Shield,
  Building,
  UserCheck,
  Mail,
  UserPlus,
  CheckCircle,
  X,
} from 'lucide-react';

export const UsersPage: React.FC = () => {
  const { profiles, organizations } = useData();
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>(Role.COORDINATOR);
  const [newUserOrg, setNewUserOrg] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Combine profiles with any fallback
  const userList: User[] = profiles && profiles.length > 0 ? profiles : [];

  const getOrgName = (orgId?: string) => {
    if (!orgId) return 'None / Independent';
    const org = organizations.find((o) => o.id === orgId);
    return org ? org.name : orgId;
  };

  const roleCounts = {
    total: userList.length,
    [Role.ADMINISTRATOR]: userList.filter((u) => u.role === Role.ADMINISTRATOR).length,
    [Role.COORDINATOR]: userList.filter((u) => u.role === Role.COORDINATOR).length,
    [Role.LGU]: userList.filter((u) => u.role === Role.LGU).length,
    [Role.BUYER]: userList.filter((u) => u.role === Role.BUYER).length,
  };

  const filteredUsers = userList.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getOrgName(u.organizationId).toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole =
      (selectedRoleFilter === 'ALL' || u.role === selectedRoleFilter) &&
      (activeTab === 'ALL' || u.role === activeTab);

    return matchesSearch && matchesRole;
  });

  const getRoleBadgeStyle = (role: Role) => {
    switch (role) {
      case Role.ADMINISTRATOR:
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case Role.COORDINATOR:
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case Role.LGU:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case Role.BUYER:
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;

    // Simulate creation into the active directory
    userList.push({
      id: `usr-${Date.now()}`,
      name: newUserName.trim(),
      email: newUserEmail.trim(),
      role: newUserRole,
      organizationId: newUserOrg || undefined,
    });

    setFeedbackMsg(`User ${newUserName} successfully added as ${newUserRole}.`);
    setIsAddModalOpen(false);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserOrg('');
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <UsersIcon className="text-agri-green-600" /> User Directory & Access Management
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Browse and manage all registered AgriCycle accounts grouped by operational role in Caraga Region.
          </p>
        </div>
        <Button
          onClick={() => setIsAddModalOpen(true)}
          variant="primary"
          icon={<UserPlus size={16} />}
        >
          Add New User
        </Button>
      </div>

      {feedbackMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-2 text-sm shadow-sm">
          <CheckCircle size={18} className="text-emerald-600 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Role Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => {
            setActiveTab('ALL');
            setSelectedRoleFilter('ALL');
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === 'ALL'
              ? 'bg-agri-green-50/70 border-agri-green-500 shadow-sm'
              : 'bg-white border-gray-200 hover:border-agri-green-300'
          }`}
        >
          <div className="text-xs font-semibold text-agri-earth-500 uppercase tracking-wider">All Accounts</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{roleCounts.total}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Total registered</div>
        </div>

        <div
          onClick={() => {
            setActiveTab(Role.ADMINISTRATOR);
            setSelectedRoleFilter('ALL');
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === Role.ADMINISTRATOR
              ? 'bg-purple-50/70 border-purple-500 shadow-sm'
              : 'bg-white border-gray-200 hover:border-purple-300'
          }`}
        >
          <div className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Admins</div>
          <div className="text-2xl font-bold text-purple-900 mt-1">{roleCounts[Role.ADMINISTRATOR]}</div>
          <div className="text-[11px] text-purple-600 mt-0.5">Full governance</div>
        </div>

        <div
          onClick={() => {
            setActiveTab(Role.COORDINATOR);
            setSelectedRoleFilter('ALL');
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === Role.COORDINATOR
              ? 'bg-blue-50/70 border-blue-500 shadow-sm'
              : 'bg-white border-gray-200 hover:border-blue-300'
          }`}
        >
          <div className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Coordinators</div>
          <div className="text-2xl font-bold text-blue-900 mt-1">{roleCounts[Role.COORDINATOR]}</div>
          <div className="text-[11px] text-blue-600 mt-0.5">Coops & Hubs</div>
        </div>

        <div
          onClick={() => {
            setActiveTab(Role.LGU);
            setSelectedRoleFilter('ALL');
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === Role.LGU
              ? 'bg-emerald-50/70 border-emerald-500 shadow-sm'
              : 'bg-white border-gray-200 hover:border-emerald-300'
          }`}
        >
          <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">LGU Officers</div>
          <div className="text-2xl font-bold text-emerald-900 mt-1">{roleCounts[Role.LGU]}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">City Validators</div>
        </div>

        <div
          onClick={() => {
            setActiveTab(Role.BUYER);
            setSelectedRoleFilter('ALL');
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === Role.BUYER
              ? 'bg-amber-50/70 border-amber-500 shadow-sm'
              : 'bg-white border-gray-200 hover:border-amber-300'
          }`}
        >
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Buyers</div>
          <div className="text-2xl font-bold text-amber-900 mt-1">{roleCounts[Role.BUYER]}</div>
          <div className="text-[11px] text-amber-600 mt-0.5">Commercial & Power</div>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardContent className="p-0">
          {/* Search and filters toolbar */}
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 items-center bg-gray-50/50">
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by name, email, or affiliated organization..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter size={18} className="text-gray-400" />
              <select
                className="block w-full sm:w-48 pl-3 pr-10 py-2 text-sm border-gray-200 focus:outline-none focus:ring-agri-green-500 focus:border-agri-green-500 rounded-lg bg-white"
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                <option value={Role.ADMINISTRATOR}>Administrators</option>
                <option value={Role.COORDINATOR}>Coordinators</option>
                <option value={Role.LGU}>LGU Officers</option>
                <option value={Role.BUYER}>Buyers</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-agri-earth-500 font-semibold tracking-wider">
                  <th className="px-5 py-4">User</th>
                  <th className="px-5 py-4">Role / Category</th>
                  <th className="px-5 py-4">Affiliation / Organization</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                      No users match the search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = currentUser?.id === u.id || currentUser?.email === u.email;
                    return (
                      <tr key={u.id} className="hover:bg-agri-green-50/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-agri-green-100 text-agri-green-700 font-bold flex items-center justify-center text-sm shrink-0 border border-agri-green-200">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 flex items-center gap-2">
                                {u.name}
                                {isSelf && (
                                  <span className="text-[10px] bg-agri-cream-100 text-agri-earth-700 px-1.5 py-0.5 rounded font-medium border border-agri-cream-200">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-agri-earth-500 flex items-center gap-1 mt-0.5">
                                <Mail size={12} className="text-gray-400" />
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getRoleBadgeStyle(
                              u.role
                            )}`}
                          >
                            <Shield size={12} />
                            {u.role.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Building size={14} className="text-gray-400 shrink-0" />
                            <span className="text-sm font-medium">{getOrgName(u.organizationId)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <UserCheck size={12} />
                            Active
                          </span>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-gray-400">
                          {u.id.length > 16 ? `${u.id.slice(0, 12)}...` : u.id}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-agri-green-500 text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <UserPlus size={18} /> Register New Platform User
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-white hover:text-gray-200">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-agri-earth-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maria Clara"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-agri-earth-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@organization.ph"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-agri-earth-700 mb-1">
                  Role / System Category
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as Role)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                >
                  <option value={Role.COORDINATOR}>Cooperative / Hub Coordinator</option>
                  <option value={Role.LGU}>LGU Officer / Validator</option>
                  <option value={Role.BUYER}>Biomass Buyer</option>
                  <option value={Role.ADMINISTRATOR}>System Administrator</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-agri-earth-700 mb-1">
                  Affiliated Organization (Optional)
                </label>
                <select
                  value={newUserOrg}
                  onChange={(e) => setNewUserOrg(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                >
                  <option value="">None / Independent</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Create User
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
