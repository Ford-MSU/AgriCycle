import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { db } from '../store/mockDb';
import { useAuth } from '../store/AuthContext';
import { Role, RecordStatus, InquiryStatus } from '../types';
import { Button } from '../components/ui/Button';
import { FileText, AlertTriangle, CheckCircle, Activity, Layers, Download } from 'lucide-react';

const COLORS = ['#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#64748b'];

export const Reports: React.FC = () => {
  const { user } = useAuth();

  if (!user || user.role === Role.BUYER) {
    return <div className="text-center py-10">Unauthorized access.</div>;
  }

  // Filter records based on role (Coordinator sees their hub's stuff, LGU/Admin see all)
  const accessibleRecords = useMemo(() => {
    if (user.role === Role.COORDINATOR) {
      // Assuming a simplistic authorization: coordinator sees records they submitted or from their cooperative
      return db.records.filter(r => r.submitterId === user.id || r.sourceId.includes('src-1') || r.sourceId.includes('src-2'));
    }
    return db.records;
  }, [user]);

  const accessibleInquiries = useMemo(() => {
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

  const staleRecords = accessibleRecords.filter(r => r.status === RecordStatus.STALE);
  const validatedRecords = accessibleRecords.filter(r => r.status === RecordStatus.VALIDATED);

  // Group by biomass type AND unit to prevent mixed units
  const biomassQuantities = useMemo(() => {
    const map = new Map<string, { typeName: string, unitName: string, quantity: number, count: number }>();
    
    validatedRecords.forEach(r => {
      const typeLabel = db.referenceData.find(ref => ref.id === r.biomassTypeId)?.label || 'Unknown';
      const unitLabel = db.referenceData.find(ref => ref.id === r.originalUnit)?.label || 'Unknown';
      
      const key = `${typeLabel}_${unitLabel}`;
      if (!map.has(key)) {
        map.set(key, { typeName: typeLabel, unitName: unitLabel, quantity: 0, count: 0 });
      }
      
      const current = map.get(key)!;
      current.quantity += r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity;
      current.count += 1;
    });

    return Array.from(map.values());
  }, [validatedRecords]);

  // Status Distribution for Pie Chart
  const statusDistribution = useMemo(() => {
    const counts = accessibleRecords.reduce((acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [accessibleRecords]);

  // Inquiry Status Distribution
  const inquiryDistribution = useMemo(() => {
    const counts = accessibleInquiries.reduce((acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [accessibleInquiries]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-100 shadow-md rounded-lg">
          <p className="font-semibold text-gray-900">{payload[0].payload.typeName}</p>
          <p className="text-sm text-agri-earth-600">
            Quantity: {payload[0].value.toLocaleString()} {payload[0].payload.unitName}
          </p>
          <p className="text-xs text-gray-500">From {payload[0].payload.count} records</p>
        </div>
      );
    }
    return null;
  };

  const exportFreshnessCSV = () => {
    const headers = ['Record ID', 'Biomass Type', 'Status', 'Availability Window', 'Last Updated'];
    const rows = staleRecords.map(r => [
      r.id,
      db.referenceData.find(ref => ref.id === r.biomassTypeId)?.label || 'Unknown',
      r.status,
      new Date(r.availabilityPeriodEnd).toLocaleDateString(),
      new Date(r.lastUpdatedDate).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `agricycle_stale_records_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Reports & Analytics</h2>
          <p className="text-sm text-agri-earth-500 mt-1">
            System summaries and monitoring derived strictly from recorded data.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
            Report Generated: {new Date().toLocaleDateString()}
          </div>
          <Button onClick={exportFreshnessCSV} variant="outline" size="sm" icon={<Download size={14} />}>
            Export Freshness
          </Button>
        </div>
      </div>

      {/* High-Level Monitoring */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600 mr-4">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-agri-earth-500">Validated Records</p>
              <p className="text-xl font-bold text-gray-900">{validatedRecords.length}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-5 flex items-center">
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600 mr-4">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-agri-earth-500">Stale Records</p>
              <p className="text-xl font-bold text-gray-900">{staleRecords.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 mr-4">
              <Layers size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-agri-earth-500">Recorded Sources</p>
              <p className="text-xl font-bold text-gray-900">{new Set(accessibleRecords.map(r => r.sourceId)).size}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 mr-4">
              <Activity size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-agri-earth-500">Inquiries Handled</p>
              <p className="text-xl font-bold text-gray-900">{accessibleInquiries.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Reported Biomass Quantities</CardTitle>
            <CardDescription>
              Sum of validated records, separated by strict unit of measurement.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
            {biomassQuantities.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                No validated biomass records available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={biomassQuantities} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="typeName" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="quantity" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={50}>
                    {biomassQuantities.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Record Status Distribution</CardTitle>
            <CardDescription>
              Monitoring the freshness and validation state of all accessible records.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
             {statusDistribution.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                No records available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
             )}
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Inquiry Status Distribution</CardTitle>
            <CardDescription>
              Monitoring the state of buyer inquiries across the system.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
             {inquiryDistribution.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                No inquiries available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={inquiryDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                  >
                    {inquiryDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
             )}
          </CardContent>
        </Card>
      </div>

      {/* Tabular Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Data Freshness & Revalidation Queue</CardTitle>
          <CardDescription>Records identified as stale or nearing expiration that require update.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase text-agri-earth-500 font-semibold tracking-wider">
                  <th className="px-5 py-4">Record ID</th>
                  <th className="px-5 py-4">Biomass Type</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Availability Window</th>
                  <th className="px-5 py-4 text-right">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {staleRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                      No records currently require freshness review.
                    </td>
                  </tr>
                ) : (
                  staleRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-red-50/30 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-gray-600">{r.id}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {db.referenceData.find(ref => ref.id === r.biomassTypeId)?.label}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs bg-red-100 text-red-800 font-semibold px-2 py-1 rounded uppercase">
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-agri-earth-600 text-xs">
                        {new Date(r.availabilityPeriodEnd).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right text-agri-earth-500 text-xs">
                        {new Date(r.lastUpdatedDate).toLocaleDateString()}
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
