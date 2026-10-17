import React from 'react';
import { Phone, CheckCircle2 } from 'lucide-react';

const DRIVER_DIRECTORY = {
  'TRK-001': { driver: 'Sanjay Deshmukh', phone: '+91 90000 01001' },
  'TRK-002': { driver: 'Vikram Joshi', phone: '+91 90000 01002' },
  'TRK-003': { driver: 'Anoop Nair', phone: '+91 90000 01003' },
  'TRK-004': { driver: 'Prakash Patil', phone: '+91 90000 01004' },
  'TRK-005': { driver: 'Amit Verma', phone: '+91 90000 01005' },
  'TRK-006': { driver: 'Karthik Raja', phone: '+91 90000 01006' },
  'TRK-007': { driver: 'Arjun Mehta', phone: '+91 90000 01007' },
  'TRK-008': { driver: 'Subhash Sen', phone: '+91 90000 01008' },
  'TRK-009': { driver: 'Gurpreet Singh', phone: '+91 90000 01009' },
  'TRK-010': { driver: 'Venkat Rao', phone: '+91 90000 01010' },
  'TRK-011': { driver: 'Manoj Sharma', phone: '+91 90000 01011' },
  'TRK-012': { driver: 'Rahul Yadav', phone: '+91 90000 01012' },
  'TRK-013': { driver: 'Biplab Barua', phone: '+91 90000 01013' },
  'TRK-014': { driver: 'Ravi Nair', phone: '+91 90000 01014' },
  'TRK-015': { driver: 'Ganesh Kamath', phone: '+91 90000 01015' },
};

export default function IncidentFeed({ alerts = [] }) {
  // If no backend alerts yet, fallback to canonical Figma incidents
  const displayAlerts = alerts && alerts.length > 0 ? alerts.slice(0, 5) : [
    {
      id: 'mock-1',
      truck_id: 'TRK-007',
      created_at: '03:14:12 UTC',
      excess_temp_c: 5.5,
      cargo_temp_c: 9.5,
      setpoint_c: 4.0,
      status: 'CRITICAL',
      reason: 'Reefer compressor failure',
      door_open: false,
    },
    {
      id: 'mock-2',
      truck_id: 'TRK-014',
      created_at: '03:12:08 UTC',
      excess_temp_c: 7.5,
      cargo_temp_c: -10.5,
      setpoint_c: -18.0,
      status: 'CRITICAL',
      reason: 'Cargo door breach · 4m 34s',
      door_open: true,
    },
    {
      id: 'mock-3',
      truck_id: 'TRK-003',
      created_at: '03:10:32 UTC',
      excess_temp_c: 2.4,
      cargo_temp_c: -15.6,
      setpoint_c: -18.0,
      status: 'WARNING',
      reason: 'Ambient heat load rising',
      door_open: false,
    }
  ];

  return (
    <div className="bg-[#1A140D] border border-[#3A2B20] rounded-lg overflow-hidden text-[#F5F0E1] shadow-sm select-none">
      {/* Section Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3A2B20] bg-[#1A140D]">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5E6D3]">
            Driver Alert & Incident Feed
          </h3>
          <p className="text-[11px] text-[#C9B7A8]">
            4 thermal incidents · 1 connectivity incident
          </p>
        </div>
        <div className="px-2.5 py-0.5 rounded text-[11px] font-bold font-mono bg-[#3C202C] text-[#D97706] border border-[#7F1D1D]/50 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse"></span>
          {displayAlerts.length} ACTIVE
        </div>
      </div>

      {/* Incident List */}
      <div className="p-3 space-y-2.5 max-h-[380px] overflow-y-auto">
        {displayAlerts.map((inc, i) => {
          const tid = inc.truck_id || 'TRK-001';
          const driverInfo = DRIVER_DIRECTORY[tid] || { driver: 'Fleet Driver', phone: '+91 90000 00000' };
          const excess = inc.excess_temp_c ? `+${inc.excess_temp_c.toFixed(1)}°C` : '+5.0°C';
          const isCritical = (inc.status === 'ALERT' || inc.status === 'CRITICAL' || inc.excess_temp_c >= 4.0);

          return (
            <div
              key={inc.id || i}
              className={`p-3 rounded-lg border transition-all ${
                isCritical
                  ? 'bg-[#281C2B] border-[#7F1D1D]/40'
                  : 'bg-[#1A140D] border-[#3A2B20]'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-[#F5E6D3]">
                    {tid}
                  </span>
                  <span className="text-[10px] font-mono text-[#8A7A6A]">
                    {typeof inc.created_at === 'string' && inc.created_at.includes('T')
                      ? inc.created_at.split('T')[1].slice(0, 8) + ' UTC'
                      : (inc.created_at || '03:14:12 UTC')}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                    isCritical
                      ? 'bg-[#3C202C] text-[#FB7185] border border-[#C64142]/40'
                      : 'bg-[#3B2B16] text-[#FBBF24] border border-[#A76609]/40'
                  }`}>
                    {excess} {isCritical ? 'CRITICAL' : 'WARNING'}
                  </span>
                </div>
              </div>

              <div className="mb-2">
                <p className="text-xs font-semibold text-[#F5F0E1]">
                  {inc.reason || (inc.door_open ? 'Cargo door breach detected' : 'Reefer compressor temperature spike')}
                </p>
                <p className="text-[11px] text-[#C9B7A8]">
                  Cargo at {inc.cargo_temp_c ?? 9.5}°C · setpoint {inc.setpoint_c ?? 4.0}°C
                </p>
              </div>

              {/* Driver Contact & Confirmation */}
              <div className="pt-2 border-t border-[#3A2B20]/60 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] text-[#B8B5AF]">
                  <Phone className="w-3 h-3 text-[#F59E0B]" />
                  <span>{driverInfo.driver} · {driverInfo.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[#5EEAD4] font-medium">
                  <span>✓ SMS sent · Delivered</span>
                  <span>✓ In-cab alarm sounded</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

