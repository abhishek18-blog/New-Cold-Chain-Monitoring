import React, { useState } from 'react';
import { CalendarDays, ListFilter, Search } from 'lucide-react';

const AUDIT_RECORDS = [
  {
    id: 'CC-261017-042',
    severity: 'CRITICAL',
    date: '17 Oct 2026',
    time: '03:14:12 UTC',
    truck: 'TRK-007',
    route: 'Pune → Hyderabad',
    cargo: 'Chilled',
    setpoint: 'SP 4.0°C',
    peakTemp: '9.5°C',
    delta: 'Δ +5.5°C',
    duration: '2.5 min',
    ongoing: true,
    cause: 'Reefer Compressor Failure',
    driver: 'Arjun Mehta',
    smsDelivered: 'SMS delivered 03:14:14',
    acknowledged: 'Driver acknowledged 03:14:31',
    note: 'Pullover requested; backup reefer dispatched from Solapur.',
    status: 'OPEN · intervention in progress',
    statusColor: 'text-[#F59E0B]'
  },
  {
    id: 'CC-261017-041',
    severity: 'CRITICAL',
    date: '17 Oct 2026',
    time: '03:12:08 UTC',
    truck: 'TRK-014',
    route: 'Hyderabad → Bengaluru',
    cargo: 'Frozen',
    setpoint: 'SP −18.0°C',
    peakTemp: '−10.5°C',
    delta: 'Δ +7.5°C',
    duration: '4.6 min',
    ongoing: false,
    cause: 'Cargo Door Breach',
    driver: 'Ravi Nair',
    smsDelivered: 'SMS delivered 03:12:10',
    acknowledged: 'In-cab alarm sounded · receipt confirmed',
    note: 'Door closed by driver at toll plaza. Reefer restored.',
    status: 'RESOLVED · 03:16:42 UTC',
    statusColor: 'text-[#34D399]'
  },
  {
    id: 'CC-261017-040',
    severity: 'WARNING',
    date: '17 Oct 2026',
    time: '03:10:32 UTC',
    truck: 'TRK-003',
    route: 'Kochi → Pondicherry',
    cargo: 'Frozen',
    setpoint: 'SP −18.0°C',
    peakTemp: '−15.6°C',
    delta: 'Δ +2.4°C',
    duration: '12.0 min',
    ongoing: false,
    cause: 'Extreme Ambient Heatwave Spike',
    driver: 'Anoop Nair',
    smsDelivered: 'SMS delivered 03:10:35',
    acknowledged: 'Driver acknowledged 03:11:00',
    note: 'Auxiliary cooling booster triggered. Safe temp restored.',
    status: 'RESOLVED · 03:22:32 UTC',
    statusColor: 'text-[#34D399]'
  },
  {
    id: 'CC-261017-039',
    severity: 'WARNING',
    date: '17 Oct 2026',
    time: '02:45:18 UTC',
    truck: 'TRK-011',
    route: 'Delhi → Lucknow',
    cargo: 'Chilled',
    setpoint: 'SP 4.0°C',
    peakTemp: '6.8°C',
    delta: 'Δ +2.8°C',
    duration: '8.2 min',
    ongoing: false,
    cause: 'Door Left Ajar at Inspection Point',
    driver: 'Manoj Sharma',
    smsDelivered: 'SMS delivered 02:45:20',
    acknowledged: 'Driver acknowledged 02:46:05',
    note: 'Inspection latch secured. Thermal seal re-established.',
    status: 'RESOLVED · 02:53:30 UTC',
    statusColor: 'text-[#34D399]'
  },
  {
    id: 'CC-261017-038',
    severity: 'WARNING',
    date: '17 Oct 2026',
    time: '01:22:05 UTC',
    truck: 'TRK-002',
    route: 'Mumbai → Pune',
    cargo: 'Chilled',
    setpoint: 'SP 4.0°C',
    peakTemp: '6.2°C',
    delta: 'Δ +2.2°C',
    duration: '6.0 min',
    ongoing: false,
    cause: 'Traffic Congestion Ambient Heat',
    driver: 'Vikram Joshi',
    smsDelivered: 'SMS delivered 01:22:08',
    acknowledged: 'Driver acknowledged 01:22:45',
    note: 'Ghat section clearance, thermal recovery normal.',
    status: 'RESOLVED · 01:28:05 UTC',
    statusColor: 'text-[#34D399]'
  }
];

export default function RegulatoryAuditLog({ auditRecords = [], selectedScope = 'all' }) {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  const baseRecords = (auditRecords && auditRecords.length > 0) ? auditRecords : AUDIT_RECORDS;

  const filteredRecords = baseRecords.filter(r => {
    const matchesScope = selectedScope === 'all' || r.truck === selectedScope;

    const matchesSearch = !search ||
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      r.truck.toLowerCase().includes(search.toLowerCase()) ||
      r.route.toLowerCase().includes(search.toLowerCase()) ||
      r.cause.toLowerCase().includes(search.toLowerCase()) ||
      (r.driver && r.driver.toLowerCase().includes(search.toLowerCase()));

    const matchesSeverity = severityFilter === 'ALL' || r.severity === severityFilter;
    return matchesScope && matchesSearch && matchesSeverity;
  });

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg overflow-hidden text-[#F5F0E1] shadow-sm select-none">
      {/* Audit Heading */}
      <div className="p-4 border-b border-[#2A2A2A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-[#F5E6D3]">
            Historical Regulatory Audit Log
          </h2>
          <p className="text-xs text-[#8A7A6A] mt-0.5">
            Immutable incident records · {selectedScope === 'all' ? 'All fleet corridors' : selectedScope} · timestamps and delivery acknowledgments in UTC
          </p>
        </div>
        <div className="px-2.5 py-1 rounded bg-[#2A2A2A] text-xs font-mono font-medium text-[#F5E6D3] border border-[#3A3A3A] self-start sm:self-auto">
          {filteredRecords.length} INCIDENTS / 24h
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="p-3 bg-[#141414] border-b border-[#2A2A2A] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1A1A1A] border border-[#2A2A2A] text-xs text-[#B8B5AF]">
            <CalendarDays className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>16 Oct – 17 Oct 2026 ▾</span>
          </button>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-1.5 rounded bg-[#1A1A1A] border border-[#2A2A2A] text-xs text-[#B8B5AF] focus:outline-none focus:border-[#D97706]"
          >
            <option value="ALL">Severity: All Incidents</option>
            <option value="CRITICAL">Severity: Critical Only</option>
            <option value="WARNING">Severity: Warning Only</option>
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#8A7A6A] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Keyword, truck, route or incident reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded bg-[#1A1A1A] border border-[#2A2A2A] text-xs text-[#F5F0E1] placeholder-[#8A7A6A] focus:outline-none focus:border-[#D97706] w-64"
            />
          </div>
        </div>

        <div className="text-[11px] text-[#8A7A6A] font-mono">
          Sorted by newest first ↓
        </div>
      </div>

      {/* Audit Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#141414] border-b border-[#2A2A2A] text-[#8A7A6A] text-[11px]">
              <th className="py-2.5 px-3.5">Incident Reference ID</th>
              <th className="py-2.5 px-3">Timestamp UTC</th>
              <th className="py-2.5 px-3">Truck ID & Route</th>
              <th className="py-2.5 px-3">Cargo Type</th>
              <th className="py-2.5 px-3 text-right">Peak Temp °C</th>
              <th className="py-2.5 px-3 text-center">Duration</th>
              <th className="py-2.5 px-3">Primary Trigger Cause</th>
              <th className="py-2.5 px-3">Driver Contacted & Acknowledged</th>
              <th className="py-2.5 px-3.5">Remediation Note / Resolution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2A2A2A]">
            {filteredRecords.map((r) => (
              <tr key={r.id} className="hover:bg-[#1F1F1F] transition-colors">
                {/* ID & Severity */}
                <td className="py-3 px-3.5">
                  <div className="font-mono font-bold text-[#F5E6D3]">{r.id}</div>
                  <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                    r.severity === 'CRITICAL'
                      ? 'bg-[#3C202C] text-[#FB7185] border border-[#7F1D1D]'
                      : 'bg-[#3B2B16] text-[#FBBF24] border border-[#A16207]'
                  }`}>
                    {r.severity}
                  </span>
                </td>

                {/* Timestamp */}
                <td className="py-3 px-3 font-mono text-[11px] text-[#B8B5AF]">
                  <div>{r.date}</div>
                  <div className="text-[#8A7A6A]">{r.time}</div>
                </td>

                {/* Truck & Route */}
                <td className="py-3 px-3">
                  <div className="font-mono font-bold text-[#F6D18A]">{r.truck}</div>
                  <div className="text-[11px] text-[#A3A3A3]">{r.route}</div>
                </td>

                {/* Cargo & Setpoint */}
                <td className="py-3 px-3 text-[11px] text-[#B8B5AF]">
                  <div>{r.cargo}</div>
                  <div className="font-mono text-[#8A7A6A]">{r.setpoint}</div>
                </td>

                {/* Peak Temp */}
                <td className="py-3 px-3 text-right font-mono">
                  <div className={`font-bold ${r.severity === 'CRITICAL' ? 'text-[#EF4444]' : 'text-[#F59E0B]'}`}>
                    {r.peakTemp}
                  </div>
                  <div className="text-[10px] text-[#8A7A6A]">{r.delta}</div>
                </td>

                {/* Duration */}
                <td className="py-3 px-3 text-center font-mono">
                  <div className="text-[#F5F0E1]">{r.duration}</div>
                  {r.ongoing && (
                    <span className="text-[10px] font-semibold text-[#EF4444] animate-pulse">
                      ongoing
                    </span>
                  )}
                </td>

                {/* Trigger Cause */}
                <td className="py-3 px-3 text-[11px] text-[#F5F0E1]">
                  {r.cause}
                </td>

                {/* Driver & Acknowledgment */}
                <td className="py-3 px-3 text-[11px]">
                  <div className="font-semibold text-[#F5E6D3]">{r.driver}</div>
                  <div className="text-[10px] text-[#34D399]">{r.smsDelivered}</div>
                  <div className="text-[10px] text-[#8A7A6A]">{r.acknowledged}</div>
                </td>

                {/* Remediation Note */}
                <td className="py-3 px-3.5 text-[11px]">
                  <div className="text-[#B8B5AF] mb-1">{r.note}</div>
                  <div className={`font-mono font-semibold text-[10px] ${r.statusColor}`}>
                    {r.status}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

