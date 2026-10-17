import React from 'react';
import { Truck } from 'lucide-react';

const ROUTE_INFO = {
  'TRK-001': { route: 'Goa → Mumbai', type: 'Chilled' },
  'TRK-002': { route: 'Mumbai → Pune', type: 'Chilled' },
  'TRK-003': { route: 'Kochi → Pondicherry', type: 'Frozen' },
  'TRK-004': { route: 'Pune → Nashik', type: 'Chilled' },
  'TRK-005': { route: 'Noida → Indore', type: 'Cold' },
  'TRK-006': { route: 'Bengaluru → Chennai', type: 'Chilled' },
  'TRK-007': { route: 'Ahmedabad → Surat', type: 'Chilled' },
  'TRK-008': { route: 'Kolkata → Bhubaneswar', type: 'Deep Freeze' },
  'TRK-009': { route: 'Chandigarh → Amritsar', type: 'Chilled' },
  'TRK-010': { route: 'Hyderabad → Vijayawada', type: 'Chilled' },
  'TRK-011': { route: 'Jaipur → Agra', type: 'Chilled' },
  'TRK-012': { route: 'Lucknow → Varanasi', type: 'Cold' },
  'TRK-013': { route: 'Guwahati → Shillong', type: 'Frozen' },
  'TRK-014': { route: 'Bhopal → Jabalpur', type: 'Chilled' },
  'TRK-015': { route: 'Mangaluru → Udupi', type: 'Deep Freeze' },
};

export default function TelemetryTable({ trucks = [], onSelectTruck, selectedTruckId }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'ALERT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#3C202C] text-[#FB7185] border border-[#7F1D1D]/60">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse"></span>
            ALERT
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold font-mono bg-[#3B2B16] text-[#FBBF24] border border-[#A16207]/60">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>
            WARNING
          </span>
        );
      case 'NO_SIGNAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium font-mono bg-[#2A2A2A] text-[#8B8882] border border-[#3A3A3A]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8B8882]"></span>
            NO SIGNAL
          </span>
        );
      case 'OK':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold font-mono bg-[#132A10] text-[#34D399] border border-[#22C55E]/40">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span>
            OK
          </span>
        );
    }
  };

  return (
    <div className="bg-[#1A140D] border border-[#3A2B20] rounded-lg overflow-hidden text-[#F5F0E1] shadow-sm select-none">
      {/* Table Heading */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3A2B20] bg-[#1A140D]">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5E6D3]">
            Real-Time Truck Telemetry Status
          </h3>
          <p className="text-[11px] text-[#C9B7A8]">
            Latest event per vehicle · deviations are relative to reefer setpoint
          </p>
        </div>
        <div className="text-xs font-mono font-medium text-[#C9B7A8] bg-[#241A14] px-3 py-1 rounded border border-[#3A2B20]">
          {trucks.length} ACTIVE TRUCKS
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#241A14] border-b border-[#3A2B20] text-[#B8B5AF] text-[11px] font-semibold">
              <th className="py-2.5 px-3.5">Truck ID</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Cargo Temp<br/><span className="text-[10px] text-[#8A7A6A]">°C</span></th>
              <th className="py-2.5 px-3 text-right">Setpoint<br/><span className="text-[10px] text-[#8A7A6A]">°C</span></th>
              <th className="py-2.5 px-3 text-right">Excess Temp<br/><span className="text-[10px] text-[#8A7A6A]">°C</span></th>
              <th className="py-2.5 px-3 text-center">Door State</th>
              <th className="py-2.5 px-3 text-right">Speed<br/><span className="text-[10px] text-[#8A7A6A]">km/h</span></th>
              <th className="py-2.5 px-3 text-right">Fuel<br/><span className="text-[10px] text-[#8A7A6A]">%</span></th>
              <th className="py-2.5 px-3.5 text-right">Last Telemetry<br/><span className="text-[10px] text-[#8A7A6A]">Ping</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#3A2B20]/60">
            {trucks.map((truck) => {
              const tid = truck.truck_id;
              const meta = ROUTE_INFO[tid] || { route: 'National Corridor', type: 'Standard' };
              const isSelected = selectedTruckId === tid;
              const temp = typeof truck.cargo_temp_c === 'number' ? truck.cargo_temp_c.toFixed(1) : '--';
              const sp = typeof truck.setpoint_c === 'number' ? truck.setpoint_c.toFixed(1) : '--';
              const excess = (typeof truck.cargo_temp_c === 'number' && typeof truck.setpoint_c === 'number')
                ? (truck.cargo_temp_c - truck.setpoint_c).toFixed(1)
                : '0.0';
              const excessNum = parseFloat(excess);
              const excessSign = excessNum > 0 ? `+${excess}` : excess;

              return (
                <tr
                  key={tid}
                  onClick={() => onSelectTruck && onSelectTruck(tid)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#281C2B] border-l-2 border-[#C2410C]'
                      : 'hover:bg-[#241A14]/70 bg-[#1A140D]'
                  }`}
                >
                  <td className="py-2.5 px-3.5">
                    <div className="font-mono font-bold text-[#F6D18A] flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-[#F59E0B]" />
                      {tid}
                    </div>
                    <div className="text-[11px] text-[#C9B7A8] truncate">
                      {meta.type} · {meta.route}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    {getStatusBadge(truck.status)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#F5F0E1]">
                    {temp}°C
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-[#B8B5AF]">
                    {sp}°C
                  </td>
                  <td className={`py-2.5 px-3 text-right font-mono font-semibold ${
                    excessNum >= 5.0 ? 'text-[#EF4444]' : excessNum >= 2.0 ? 'text-[#F59E0B]' : 'text-[#34D399]'
                  }`}>
                    {excessSign}°C
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {truck.door_open ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#3C202C] text-[#FB7185] border border-[#7F1D1D]">
                        OPEN
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#151A14] text-[#B8B5AF] border border-[#3A2B20]">
                        CLOSED
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-[#B8B5AF]">
                    {truck.speed_kmph ?? 0}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-[#B8B5AF]">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{truck.fuel_pct ? Math.round(truck.fuel_pct) : 85}%</span>
                      <div className="w-8 h-1.5 bg-[#2A2116] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#F59E0B]"
                          style={{ width: `${truck.fuel_pct ?? 85}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-mono text-[11px] text-[#8A7A6A]">
                    2s ago
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

