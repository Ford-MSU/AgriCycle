import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Role, User } from '../types';
import {
  getRoleDisplayName,
  getRoleShortName,
  getRoleBadgeStyle,
  hasPermission,
  Permission,
} from '../utils/rbac';
import {
  Users as UsersIcon,
  Search,
  Filter,
  Shield,
  Building,
  UserCheck,
  UserX,
  Mail,
  CheckCircle,
  AlertCircle,
  Edit3,
  Info,
  X,
} from 'lucide-react';

export const UsersPage: React.FC = () => {
  const { profiles, organizations, updateUserRole, toggleUserActiveStatus } = useData();
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editedRole, setEditedRole] = useState<Role>(Role.BUYER);
  const [editedOrgId, setEditedOrgId] = useState<string>('');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const canManageUsers = hasPermission(currentUser?.role, Permission.MANAGE_USERS);
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
      getOrgName(u.organizationId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      getRoleDisplayName(u.role).toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole =
      (selectedRoleFilter === 'ALL' || u.role === selectedRoleFilter) &&
      (activeTab === 'ALL' || u.role === activeTab);

    return matchesSearch && matchesRole;
  });

  const openEditModal = (target: User) => {
    setEditingUser(target);
    setEditedRole(target.role);
    setEditedOrgId(target.organizationId || '');
    setErrorMsg(null);
  };

  const handleSaveRoleAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !canManageUsers) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await updateUserRole(editingUser.email, editedRole, editedOrgId || undefined);
      setFeedbackMsg(
        `Updated ${editingUser.name} (${editingUser.email}) to ${getRoleDisplayName(editedRole)}.`
      );
      setEditingUser(null);
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update user role.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (target: User) => {
    if (!canManageUsers) return;
    const nextActive = target.isActive === false;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await toggleUserActiveStatus(target.email, nextActive);
      setFeedbackMsg(
        `${target.name} (${target.email}) has been ${nextActive ? 'activated' : 'deactivated'}.`
      );
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update account status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <UsersIcon className="text-agri-green-600" /> User Directory &amp; Role Governance
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Assign formal system roles and manage account activation across Butuan City AgriCycle users.
          </p>
        </div>
        <Button onClick={() => setIsGuideOpen(true)} variant="outline" icon={<Info size={16} />}>
          Role Assignment Guide
        </Button>
      </div>

      {feedbackMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-2 text-sm shadow-sm">
          <CheckCircle size={18} className="text-emerald-600 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2 text-sm shadow-sm">
          <AlertCircle size={18} className="text-red-600 shrink-0" />
          <span>{errorMsg}</span>
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
          <div className="text-xs font-semibold text-agri-earth-500 uppercase tracking-wider">
            All Accounts
          </div>
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
          <div className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
            Administrators
          </div>
          <div className="text-2xl font-bold text-purple-900 mt-1">
            {roleCounts[Role.ADMINISTRATOR]}
          </div>
          <div className="text-[11px] text-purple-600 mt-0.5">Accounts &amp; audit governance</div>
        </div>

        <div
          onClick={() => {
            setActiveTab(Role.COORDINATOR);
            setSelectedRoleFilter('ALL');
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === Role.COORDINATOR
              ? 'bg-emerald-50/70 border-emerald-500 shadow-sm'
              : 'bg-white border-gray-200 hover:border-emerald-300'
          }`}
        >
          <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
            Biomass Coordinators
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-1">
            {roleCounts[Role.COORDINATOR]}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">
            Intake, validation &amp; inquiries
          </div>
        </div>

        <div
          onClick={() => {
            setActiveTab(Role.LGU);
            setSelectedRoleFilter('ALL');
          }}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === Role.LGU
              ? 'bg-blue-50/70 border-blue-500 shadow-sm'
              : 'bg-white border-gray-200 hover:border-blue-300'
          }`}
        >
          <div className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
            Planning Users
          </div>
          <div className="text-2xl font-bold text-blue-900 mt-1">{roleCounts[Role.LGU]}</div>
          <div className="text-[11px] text-blue-600 mt-0.5">View-only LGU planning</div>
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
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
            Buyers / Inquirers
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-1">{roleCounts[Role.BUYER]}</div>
          <div className="text-[11px] text-amber-600 mt-0.5">Validated listing inquiries</div>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 items-center bg-gray-50/50">
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by name, email, role, or affiliated organization..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter size={18} className="text-gray-400" />
              <select
                className="block w-full sm:w-64 pl-3 pr-10 py-2 text-sm border-gray-200 focus:outline-none focus:ring-agri-green-500 focus:border-agri-green-500 rounded-lg bg-white"
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
              >
                <option value="ALL">All Formal Roles</option>
                <option value={Role.ADMINISTRATOR}>{getRoleDisplayName(Role.ADMINISTRATOR)}</option>
                <option value={Role.COORDINATOR}>{getRoleDisplayName(Role.COORDINATOR)}</option>
                <option value={Role.LGU}>{getRoleDisplayName(Role.LGU)}</option>
                <option value={Role.BUYER}>{getRoleDisplayName(Role.BUYER)}</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-agri-earth-500 font-semibold tracking-wider">
                  <th className="px-5 py-4">User</th>
                  <th className="px-5 py-4">Assigned Formal Role</th>
                  <th className="px-5 py-4">Affiliation / Agency</th>
                  <th className="px-5 py-4">Account Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
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
                    const isSelf =
                      currentUser?.id === u.id ||
                      currentUser?.email.toLowerCase() === u.email.toLowerCase();
                    const isActive = u.isActive !== false;

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
                            title={getRoleDisplayName(u.role)}
                          >
                            <Shield size={12} />
                            {getRoleShortName(u.role)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Building size={14} className="text-gray-400 shrink-0" />
                            <span className="text-sm font-medium">{getOrgName(u.organizationId)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <UserCheck size={12} />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300">
                              <UserX size={12} />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {canManageUsers && (
                            <div className="inline-flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                icon={<Edit3 size={13} />}
                                onClick={() => openEditModal(u)}
                                disabled={isSubmitting}
                              >
                                Assign Role
                              </Button>
                              {!isSelf && (
                                <Button
                                  size="sm"
                                  variant={isActive ? 'danger' : 'secondary'}
                                  onClick={() => handleToggleActive(u)}
                                  disabled={isSubmitting}
                                >
                                  {isActive ? 'Deactivate' : 'Activate'}
                                </Button>
                              )}
                            </div>
                          )}
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

      {/* Assign Role Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-agri-green-600 text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Shield size={18} /> Assign Formal Role
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="text-white hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRoleAssignment} className="p-6 space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
                <p className="font-semibold text-gray-900">{editingUser.name}</p>
                <p className="text-gray-600">{editingUser.email}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-agri-earth-700 mb-1">
                  Formal System Role
                </label>
                <select
                  value={editedRole}
                  onChange={(e) => setEditedRole(e.target.value as Role)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                >
                  <option value={Role.ADMINISTRATOR}>
                    {getRoleDisplayName(Role.ADMINISTRATOR)}
                  </option>
                  <option value={Role.COORDINATOR}>
                    {getRoleDisplayName(Role.COORDINATOR)}
                  </option>
                  <option value={Role.LGU}>{getRoleDisplayName(Role.LGU)}</option>
                  <option value={Role.BUYER}>{getRoleDisplayName(Role.BUYER)}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-agri-earth-700 mb-1">
                  Affiliated Office / Organization (Optional)
                </label>
                <select
                  value={editedOrgId}
                  onChange={(e) => setEditedOrgId(e.target.value)}
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

              {editingUser.id === currentUser?.id && editedRole !== Role.ADMINISTRATOR && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg text-xs">
                  Warning: Reassigning your own role away from Administrator will remove your access to User &amp; Audit administration.
                </div>
              )}

              <div className="pt-4 flex justify-end gap-2 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Role Assignment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Assignment Guide Modal */}
      {isGuideOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-800 text-white">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Info size={18} /> Privileged Account Provisioning Policy
              </h3>
              <button
                onClick={() => setIsGuideOpen(false)}
                className="text-white hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm text-gray-700">
              <p>
                To enforce strict role governance, public self-registration creates standard{' '}
                <strong>{getRoleDisplayName(Role.BUYER)}</strong> accounts only.
              </p>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-600">
                <li>
                  The staff member or planning user registers and verifies their email through the standard Sign Up flow.
                </li>
                <li>
                  Their profile appears automatically in this directory as a Buyer/Institutional Inquirer.
                </li>
                <li>
                  An Administrator uses <strong>Assign Role</strong> on that row to promote the account to{' '}
                  <strong>{getRoleDisplayName(Role.COORDINATOR)}</strong>,{' '}
                  <strong>{getRoleDisplayName(Role.LGU)}</strong>, or{' '}
                  <strong>{getRoleDisplayName(Role.ADMINISTRATOR)}</strong>.
                </li>
              </ol>
              <div className="pt-3 flex justify-end border-t border-gray-100">
                <Button variant="primary" onClick={() => setIsGuideOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
