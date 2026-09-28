import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { RecordStatus, Role } from '../types';
import { Tractor, FileText, CheckCircle, AlertTriangle, Users, Activity, MessageSquare, Layers } from 'lucide-react';
import { useAuth } from '../store/AuthContext';
import { hasPermission, Permission } from '../utils/rbac';
import { db } from '../store/mockDb';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;

  const accessibleRecords = useMemo(() => {
    if (user.role === Role.COORDINATOR) {
      return db.records.filter(r => r.submitterId === user.id || r.sourceId.includes('src-1') || r.sourceId.includes('src-2'));
    }
    return db.records;
  }, [user]);

  const accessibleInquiries = useMemo(() => {
    if (user.role === Role.BUYER) {
      return db.inquiries.filter(i => i.buyerUserId === user.id);
    }
    if (user.role === Role.COORDINATOR) {
      return db.inquiries.filter(i => {
        if (i.targetType === 'RECORD') {
          const rec = db.getRecord(i.targetId);
          return rec && accessibleRecords.some(ar => ar.id === rec.id);
        }
        return false;
      });
    }
    return db.inquiries;
  }, [user, accessibleRecords]);

  // Derived metrics
  const totalUsers = 4; // Mock representation based on standard roles available
  const totalSources = new Set(accessibleRecords.map(r => r.sourceId)).size;
  const mySubmissions = db.records.filter(r => r.submitterId === user.id).length;
  const pendingValidation = db.records.filter(r => r.status === RecordStatus.SUBMITTED).length;
  const validatedRecords = accessibleRecords.filter(r => r.status === RecordStatus.VALIDATED).length;
  
  const recentRecords = accessibleRecords
    .sort((a, b) => new Date(b.lastUpdatedDate).getTime() - new Date(a.lastUpdatedDate).getTime())
    .slice(0, 5);

  const recentLogs = db.auditLogs
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {hasPermission(user.role, Permission.VIEW_SYSTEM_WIDE_RECORDS) 
              ? 'System Overview' 
              : 'My Dashboard'}
          </h2>
          <p className="text-sm text-agri-earth-500 mt-1 capitalize">
            {user.role.toLowerCase().replace(/_/g, ' ')} Portal &bull; Recorded Biomass Information
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {hasPermission(user.role, Permission.VIEW_SYSTEM_WIDE_RECORDS) && (
          <>
            <Card>
              <CardContent className="p-5 flex items-center">
                <div className="w-12 h-12 rounded-lg bg-agri-green-100 flex items-center justify-center text-agri-green-600 mr-4">
                  <Users size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-agri-earth-500">Active Roles</p>
                  <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center">
                <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 mr-4">
                  <Tractor size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-agri-earth-500">Recorded Sources</p>
                  <p className="text-2xl font-bold text-gray-900">{totalSources}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {hasPermission(user.role, Permission.MANAGE_BIOMASS_RECORDS) && (
          <Card>
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 mr-4">
                <FileText size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-agri-earth-500">My Submissions</p>
                <p className="text-2xl font-bold text-gray-900">{mySubmissions}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {hasPermission(user.role, Permission.VIEW_VALIDATION_QUEUE) && (
          <Card>
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600 mr-4">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-agri-earth-500">Pending Validation</p>
                <p className="text-2xl font-bold text-gray-900">{pendingValidation}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {(user.role === Role.BUYER || user.role === Role.COORDINATOR || user.role === Role.LGU) && (
          <Card>
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 mr-4">
                <MessageSquare size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-agri-earth-500">Inquiries</p>
                <p className="text-2xl font-bold text-gray-900">{accessibleInquiries.length}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {user.role !== Role.BUYER && (
          <Card>
            <CardContent className="p-5 flex items-center">
              <div className="w-12 h-12 rounded-lg bg-agri-green-50 flex items-center justify-center text-agri-green-600 mr-4">
                <CheckCircle size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-agri-earth-500">Validated Available</p>
                <p className="text-2xl font-bold text-gray-900">{validatedRecords}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {user.role !== Role.BUYER && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {hasPermission(user.role, Permission.VIEW_SYSTEM_WIDE_RECORDS) || hasPermission(user.role, Permission.VIEW_VALIDATION_QUEUE)
                  ? 'Recent Community Records' 
                  : 'My Recent Records'}
              </CardTitle>
              <CardDescription>Latest biomass entries and their current statuses.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-agri-earth-500 uppercase bg-agri-cream-50 border-b border-agri-green-100">
                    <tr>
                      <th className="px-4 py-3 font-medium">Biomass Type</th>
                      <th className="px-4 py-3 font-medium">Reported Qty</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-agri-green-50">
                    {recentRecords.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">No records found.</td>
                      </tr>
                    ) : (
                      recentRecords.map(record => {
                        const typeLabel = db.referenceData.find(r => r.id === record.biomassTypeId)?.label;
                        const unitLabel = db.referenceData.find(r => r.id === record.originalUnit)?.label;
                        const source = db.getSource(record.sourceId);
                        
                        return (
                          <tr key={record.id} className="hover:bg-agri-green-50/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">{typeLabel}</td>
                            <td className="px-4 py-3 text-agri-earth-600">
                              {record.quantity.toLocaleString()} {unitLabel}
                            </td>
                            <td className="px-4 py-3 text-agri-earth-600">{source?.name}</td>
                            <td className="px-4 py-3"><StatusBadge status={record.status} /></td>
                            <td className="px-4 py-3 text-agri-earth-500">
                              {format(new Date(record.lastUpdatedDate), 'MMM d, yyyy')}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-center">
                <Link to="/biomass-records" className="text-sm font-medium text-agri-green-600 hover:text-agri-green-700">
                  View All Records &rarr;
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {hasPermission(user.role, Permission.VIEW_AUDIT_LOGS) ? (
          <Card className={user.role === Role.BUYER ? 'lg:col-span-3' : ''}>
            <CardHeader>
              <CardTitle>System Activity</CardTitle>
              <CardDescription>Audit log traceability overview.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentLogs.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No audit logs available.</p>
                ) : (
                  recentLogs.map((log) => (
                    <div key={log.id} className="flex gap-3">
                      <div className="mt-0.5 w-2 h-2 rounded-full bg-agri-green-400 shrink-0"></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{log.action}</p>
                        <p className="text-xs text-agri-earth-500 mt-0.5">
                          By User: {log.userId} &bull; Entity: {log.entityId}
                        </p>
                        <p className="text-xs text-agri-earth-400 mt-1">
                          {format(new Date(log.timestamp), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 text-center border-t border-gray-100 pt-3">
                <Link to="/audit-logs" className="text-sm font-medium text-agri-green-600 hover:text-agri-green-700">
                  View Full Audit Trail &rarr;
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className={user.role === Role.BUYER ? 'lg:col-span-3' : ''}>
             <CardHeader>
              <CardTitle>My Recent Actions</CardTitle>
              <CardDescription>Your interactions with the system.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity size={32} className="text-agri-green-200 mb-3" />
                <p className="text-sm font-medium text-gray-900">Information Up To Date</p>
                <p className="text-xs text-agri-earth-500 mt-1 max-w-[200px]">
                  Track your records and inquiries using the navigation menu.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
