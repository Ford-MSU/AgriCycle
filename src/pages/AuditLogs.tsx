import React, { useState } from 'react';
import { db } from '../store/mockDb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { format } from 'date-fns';
import { Search, Filter, ShieldAlert, Download } from 'lucide-react';
import { SystemAction } from '../types';
import { Button } from '../components/ui/Button';

export const AuditLogs: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const logs = db.auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.entityId.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.userId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const exportCSV = () => {
    const headers = ['Date/Time', 'User ID', 'Action', 'Entity Type', 'Entity ID'];
    const rows = filteredLogs.map(log => [
      format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      log.userId,
      log.action,
      log.entityType,
      log.entityId
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `agricycle_audit_logs_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="text-agri-green-600" /> System Audit Trail
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            Secure, unalterable log of significant system actions and information changes.
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
                placeholder="Search by User ID or Entity ID..."
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
                {Object.values(SystemAction).map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-agri-earth-500 font-semibold tracking-wider">
                  <th className="px-5 py-4">Date/Time</th>
                  <th className="px-5 py-4">User ID</th>
                  <th className="px-5 py-4">Action</th>
                  <th className="px-5 py-4">Entity Type</th>
                  <th className="px-5 py-4">Entity ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                      No audit logs match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-agri-green-50/30 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap text-agri-earth-600">
                        {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                      </td>
                      <td className="px-5 py-4 font-medium text-gray-900">
                        {log.userId}
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-700 uppercase">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-agri-earth-600">
                        {log.entityType}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-agri-green-700">
                        {log.entityId}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
