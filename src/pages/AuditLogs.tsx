import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { Card, CardContent } from '../components/ui/Card';
import { format } from 'date-fns';
import { Search, Filter, ShieldAlert, Download } from 'lucide-react';
import { SystemAction } from '../types';
import { Button } from '../components/ui/Button';

export const AuditLogs: React.FC = () => {
  const { auditLogs, profiles, isLoading } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const getActorInfo = (userId: string) => {
    const profile = profiles.find(
      (p) => p.id === userId || p.email.toLowerCase() === userId.toLowerCase()
    );
    if (profile) {
      return {
        name: profile.name,
        role: profile.role,
        email: profile.email,
      };
    }

    // Graceful fallback for mock/system IDs
    if (userId === 'user-admin') return { name: 'Juan Dela Cruz', role: 'ADMINISTRATOR', email: 'admin@agricycle.ph' };
    if (userId === 'user-coord') return { name: 'Nitronford Beatingo', role: 'COORDINATOR', email: 'nitronford.beatingo@g.msuiit.edu.ph' };
    if (userId === 'user-lgu') return { name: 'Engr. Arvin Jimenez', role: 'LGU', email: 'arvin.jimenez@g.msuiit.edu.ph' };
    if (userId === 'user-buyer') return { name: 'Carlos Santos', role: 'BUYER', email: 'buyer@biopower.ph' };

    // Generic UUID or system actor
    if (userId.includes('@')) {
      const fallbackName = userId.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return { name: fallbackName, role: 'SYSTEM / USER', email: userId };
    }

    return { name: userId.length > 12 ? `${userId.slice(0, 8)}...` : userId, role: 'SYSTEM', email: userId };
  };

  const logs = [...auditLogs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const filteredLogs = logs.filter((log) => {
    const actor = getActorInfo(log.userId);
    const matchesSearch =
      log.entityId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      actor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      actor.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.notes && log.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const exportCSV = () => {
    const headers = ['Date/Time', 'Actor Name', 'Role', 'User ID', 'Action', 'Entity Type', 'Entity ID', 'Details'];
    const rows = filteredLogs.map((log) => {
      const actor = getActorInfo(log.userId);
      return [
        format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        `"${actor.name.replace(/"/g, '""')}"`,
        actor.role,
        log.userId,
        log.action,
        log.entityType,
        log.entityId,
        `"${(log.details || log.notes || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `agricycle_audit_logs_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMINISTRATOR':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'COORDINATOR':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'LGU':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'BUYER':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="text-agri-green-600" /> System Audit Trail
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Tamper-evident record of all system events, status changes, and administrative actions with full actor identification.
          </p>
        </div>
        <Button onClick={exportCSV} variant="outline" icon={<Download size={16} />}>
          Export to CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 items-center bg-gray-50/50">
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by Actor Name, Role, User ID, Entity ID, or Details..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter size={18} className="text-gray-400" />
              <select
                className="block w-full sm:w-48 pl-3 pr-10 py-2 text-sm border-gray-200 focus:outline-none focus:ring-agri-green-500 focus:border-agri-green-500 rounded-lg"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                <option value="ALL">All Actions</option>
                {Object.values(SystemAction).map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-agri-earth-500 font-semibold tracking-wider">
                  <th className="px-5 py-4">Date/Time</th>
                  <th className="px-5 py-4">Actor & Role</th>
                  <th className="px-5 py-4">Action</th>
                  <th className="px-5 py-4">Entity Type</th>
                  <th className="px-5 py-4">Entity ID</th>
                  <th className="px-5 py-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {isLoading && filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                      Loading audit logs...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                      No audit logs match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const actor = getActorInfo(log.userId);
                    return (
                      <tr key={log.id} className="hover:bg-agri-green-50/30 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap text-agri-earth-600 font-mono text-xs">
                          {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-gray-900">{actor.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getRoleBadgeColor(actor.role)}`}>
                              {actor.role}
                            </span>
                            <span className="text-[11px] text-gray-400 font-mono" title={log.userId}>
                              {log.userId.length > 16 ? `${log.userId.slice(0, 12)}...` : log.userId}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-700 uppercase">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-agri-earth-600 font-medium">{log.entityType}</td>
                        <td className="px-5 py-4 font-mono text-xs text-agri-green-700">{log.entityId}</td>
                        <td className="px-5 py-4 text-xs text-gray-600 max-w-xs truncate" title={log.details || log.notes || ''}>
                          {log.details || log.notes || '—'}
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
    </div>
  );
};
