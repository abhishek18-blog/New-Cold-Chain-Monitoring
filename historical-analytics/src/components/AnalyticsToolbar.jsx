import React, { useState } from 'react';
import { BarChart3, Download, FileCheck2, Truck, ChevronDown, Check } from 'lucide-react';

const VEHICLES = [
  { id: 'all', label: 'All Fleet (15 vehicles)', route: 'Pan-India Fleet Aggregate', sp: 4.0 },
  { id: 'TRK-001', label: 'TRK-001 · Goa → Mumbai', route: 'NH 66 · Chilled 4°C', sp: 4.0 },
  { id: 'TRK-002', label: 'TRK-002 · Delhi → Nagpur', route: 'NH 44 · Chilled 4°C', sp: 4.0 },
  { id: 'TRK-003', label: 'TRK-003 · Kochi → Pondicherry', route: 'NH 544 · Frozen -18°C', sp: -18.0 },
  { id: 'TRK-004', label: 'TRK-004 · Pune → Nashik', route: 'NH 60 · Chilled 4°C', sp: 4.0 },
  { id: 'TRK-005', label: 'TRK-005 · Noida → Indore', route: 'NH 48 · Chilled 2°C', sp: 2.0 },
  { id: 'TRK-006', label: 'TRK-006 · Bengaluru → Chennai', route: 'NH 48 · Chilled 4°C', sp: 4.0 },
  { id: 'TRK-007', label: 'TRK-007 · Ahmedabad → Surat', route: 'NE 1 · Chilled 3°C', sp: 3.0 },
  { id: 'TRK-008', label: 'TRK-008 · Kolkata → Bhubaneswar', route: 'NH 16 · Frozen -20°C', sp: -20.0 },
  { id: 'TRK-009', label: 'TRK-009 · Chandigarh → Amritsar', route: 'NH 3 · Chilled 5°C', sp: 5.0 },
  { id: 'TRK-010', label: 'TRK-010 · Hyderabad → Vijayawada', route: 'NH 65 · Chilled 4°C', sp: 4.0 },
  { id: 'TRK-011', label: 'TRK-011 · Jaipur → Agra', route: 'NH 21 · Chilled 4°C', sp: 4.0 },
  { id: 'TRK-012', label: 'TRK-012 · Lucknow → Varanasi', route: 'Purvanchal · Chilled 2°C', sp: 2.0 },
  { id: 'TRK-013', label: 'TRK-013 · Guwahati → Shillong', route: 'NH 6 · Frozen -18°C', sp: -18.0 },
  { id: 'TRK-014', label: 'TRK-014 · Bhopal → Jabalpur', route: 'NH 45 · Chilled 4°C', sp: 4.0 },
  { id: 'TRK-015', label: 'TRK-015 · Mangaluru → Udupi', route: 'NH 66 · Frozen -22°C', sp: -22.0 },
];

export default function AnalyticsToolbar({
  activeTab = 'temperature',
  onSelectTab,
  selectedScope = 'all',
  onSelectScope,
  auditRecords = []
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const tabs = [
    { id: 'temperature', label: 'Temperature Trends' },
    { id: 'door', label: 'Door Open Frequency' },
    { id: 'excursion', label: 'Excursion Duration' },
    { id: 'efficiency', label: 'Speed vs. Fuel Efficiency' },
  ];

  const currentVehicle = VEHICLES.find(v => v.id === selectedScope) || VEHICLES[0];

  const handleExportCSV = () => {
    let csv = "Incident ID,Timestamp,Truck ID,Route,Cargo,Setpoint,Peak Temp,Delta,Duration,Root Cause,Driver,Status\n";
    const dataToExport = auditRecords && auditRecords.length > 0 ? auditRecords : [
      { id: "CC-261017-042", time: "2026-10-17 16:14:12 IST", truck: "TRK-007", route: "Pune -> Hyderabad", cargo: "Chilled", setpoint: "4.0C", peakTemp: "9.5C", delta: "+5.5C", duration: "2.5 min", cause: "Reefer Compressor Failure", driver: "Arjun Mehta", status: "OPEN" },
      { id: "CC-261017-041", time: "2026-10-17 16:12:08 IST", truck: "TRK-014", route: "Hyderabad -> Bengaluru", cargo: "Frozen", setpoint: "-18.0C", peakTemp: "-10.5C", delta: "+7.5C", duration: "4.6 min", cause: "Door Left Ajar", driver: "Ravi Nair", status: "RESOLVED" }
    ];

    dataToExport.forEach(r => {
      csv += `"${r.id || ''}","${r.time || r.date || ''}","${r.truck || ''}","${r.route || ''}","${r.cargo || ''}","${r.setpoint || ''}","${r.peakTemp || ''}","${r.delta || ''}","${r.duration || ''}","${r.cause || ''}","${r.driver || ''}","${r.status || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `coldchain_audit_export_${selectedScope}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="bg-[#1A140D] border border-[#3A2B20] rounded-lg p-4 text-[#F5F0E1] shadow-sm select-none space-y-4">
      {/* Top row: Title and Export actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#D97706]/15 border border-[#D97706]/30 flex items-center justify-center text-[#D97706]">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-[#F5E6D3]">
              Historical Data & Advanced Analytics
            </h1>
            <p className="text-xs text-[#B8B5AF]">
              Fleet-level compliance, incident attribution, and immutable regulatory evidence.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#1A1A1A] hover:bg-[#2A2116] border border-[#3A2B20] text-[#F5F5F5] transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Export CSV Report</span>
          </button>

          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#D97706] hover:bg-[#B45309] text-white shadow-sm shadow-[#D97706]/20 transition-colors"
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Download PDF Compliance Audit</span>
          </button>
        </div>
      </div>

      {/* Bottom row: Interactive Scope filter dropdown, view tabs, and timeframe */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#3A2B20]/60">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Scope Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#1A1A1A] hover:bg-[#2A2116] border border-[#3A2B20] text-xs font-medium text-[#F5F5F5] transition-colors"
            >
              <Truck className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span className="font-semibold text-[#F5E6D3]">{currentVehicle.label}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-[#8A7A6A] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1.5 w-64 max-h-72 overflow-y-auto bg-[#1A140D] border border-[#3A2B20] rounded-lg shadow-2xl py-1 z-50 text-xs">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-[#8A7A6A] border-b border-[#3A2B20]/60">
                    Filter Analytics Scope
                  </div>
                  {VEHICLES.map((v) => {
                    const isSelected = selectedScope === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          if (onSelectScope) onSelectScope(v.id);
                          setDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#2A2116] transition-colors ${
                          isSelected ? 'bg-[#2A2116] text-[#F59E0B]' : 'text-[#F5F0E1]'
                        }`}
                      >
                        <div>
                          <div className="font-semibold">{v.label}</div>
                          <div className="text-[10px] text-[#8A7A6A]">{v.route}</div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#F59E0B]" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* View tabs */}
          <div className="flex items-center bg-[#1A1A1A] border border-[#3A2B20] rounded p-0.5 text-xs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onSelectTab && onSelectTab(tab.id)}
                className={`px-3 py-1 rounded transition-colors font-medium ${
                  activeTab === tab.id
                    ? 'bg-[#D97706] text-white shadow-sm font-bold'
                    : 'text-[#A3A3A3] hover:text-[#F5F0E1]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[11px] font-mono tracking-wider text-[#A3A3A3] uppercase bg-[#1A1A1A] px-2.5 py-1 rounded border border-[#3A2B20]">
          LAST 24 HOURS
        </div>
      </div>
    </div>
  );
}
