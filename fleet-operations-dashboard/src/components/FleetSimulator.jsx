import React, { useState } from 'react';
import { FlaskConical, ThermometerSun, DoorOpen, Zap, RotateCcw, Info, Check } from 'lucide-react';

const ALL_TRUCKS = [
  { id: 'TRK-001', type: 'Chilled', route: 'Goa → Mumbai', sp: 4.0 },
  { id: 'TRK-002', type: 'Chilled', route: 'Mumbai → Pune', sp: 4.0 },
  { id: 'TRK-003', type: 'Frozen', route: 'Kochi → Pondicherry', sp: -18.0 },
  { id: 'TRK-004', type: 'Chilled', route: 'Pune → Nashik', sp: 4.0 },
  { id: 'TRK-005', type: 'Frozen', route: 'Noida → Indore', sp: 2.0 },
  { id: 'TRK-006', type: 'Chilled', route: 'Bengaluru → Chennai', sp: 4.0 },
  { id: 'TRK-007', type: 'Chilled', route: 'Ahmedabad → Surat', sp: 3.0 },
  { id: 'TRK-008', type: 'Frozen', route: 'Kolkata → Bhubaneswar', sp: -20.0 },
  { id: 'TRK-009', type: 'Chilled', route: 'Chandigarh → Amritsar', sp: 5.0 },
  { id: 'TRK-010', type: 'Frozen', route: 'Hyderabad → Vijayawada', sp: 4.0 },
  { id: 'TRK-011', type: 'Chilled', route: 'Jaipur → Agra', sp: 4.0 },
  { id: 'TRK-012', type: 'Frozen', route: 'Lucknow → Varanasi', sp: 2.0 },
  { id: 'TRK-013', type: 'Chilled', route: 'Guwahati → Shillong', sp: -18.0 },
  { id: 'TRK-014', type: 'Frozen', route: 'Bhopal → Jabalpur', sp: 4.0 },
  { id: 'TRK-015', type: 'Frozen', route: 'Mangaluru → Udupi', sp: -22.0 },
];

export default function FleetSimulator({ onSimulateComplete }) {
  const [selectedTrucks, setSelectedTrucks] = useState(ALL_TRUCKS.map(t => t.id));
  const [feedback, setFeedback] = useState({
    message: 'Ready for injection. No mass scenario running · 15 targets armed · Notifications appear here after execution.',
    type: 'idle'
  });
  const [executing, setExecuting] = useState(false);

  const toggleTruck = (tid) => {
    setSelectedTrucks(prev =>
      prev.includes(tid) ? prev.filter(x => x !== tid) : [...prev, tid]
    );
  };

  const selectAll = () => setSelectedTrucks(ALL_TRUCKS.map(t => t.id));
  const clearAll = () => setSelectedTrucks([]);
  const selectChilled = () => setSelectedTrucks(ALL_TRUCKS.filter(t => t.type === 'Chilled').map(t => t.id));
  const selectFrozen = () => setSelectedTrucks(ALL_TRUCKS.filter(t => t.type === 'Frozen').map(t => t.id));

  const triggerScenario = async (scenarioKey, label) => {
    if (selectedTrucks.length === 0) {
      setFeedback({
        message: 'No vehicles selected. Select at least 1 truck to trigger a scenario.',
        type: 'warning'
      });
      return;
    }

    setExecuting(true);
    setFeedback({
      message: `Executing [${label}] across ${selectedTrucks.length} targets into Kafka cluster...`,
      type: 'pending'
    });

    try {
      const res = await fetch('/api/telemetry/simulate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truck_ids: selectedTrucks,
          scenario: scenarioKey
        })
      });

      if (res.ok) {
        const data = await res.json();
        setFeedback({
          message: `⚡ ${data.message || `Scenario executed successfully across ${selectedTrucks.length} trucks.`}`,
          type: 'success'
        });
        if (onSimulateComplete) onSimulateComplete();
      } else {
        const err = await res.text();
        setFeedback({
          message: `Execution failed: ${err}`,
          type: 'error'
        });
      }
    } catch (e) {
      setFeedback({
        message: `Network error triggering scenario: ${e.message}`,
        type: 'error'
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="bg-[#1A140D] border border-[#3A2B20] rounded-lg p-5 text-[#F5F0E1] shadow-sm select-none">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 mb-4 border-b border-[#3A2B20] gap-3">
        <div className="flex items-center gap-2.5">
          <FlaskConical className="w-5 h-5 text-[#F59E0B]" />
          <h2 className="text-sm font-bold tracking-wider uppercase text-[#F5E6D3]">
            Fleet Crisis & Tension Simulator
          </h2>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wide bg-[#241A14] text-[#C9B7A8] border border-[#3A2B20]">
            SANDBOX ONLY
          </span>
        </div>

        <div className="text-xs font-mono font-medium text-[#F6D18A] bg-[#241A14] px-3 py-1 rounded border border-[#3A2B20] self-start sm:self-auto">
          {selectedTrucks.length} / 15 Selected
        </div>
      </div>

      {/* Scope description and quick filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
        <div>
          <p className="text-xs text-[#F5E6D3]">
            Trigger mass emergencies to validate driver alerts, pipeline resilience, and recovery under load.
          </p>
          <p className="text-[11px] text-[#C9B7A8] mt-0.5">
            Synthetic events only. Production vehicles and driver contacts are never affected.
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={selectAll}
            className="px-2.5 py-1 text-xs rounded bg-[#1A140D] hover:bg-[#241A14] border border-[#3A2B20] text-[#B8B5AF] hover:text-[#F5F0E1] transition-colors"
          >
            Select All
          </button>
          <button
            onClick={clearAll}
            className="px-2.5 py-1 text-xs rounded bg-[#1A140D] hover:bg-[#241A14] border border-[#3A2B20] text-[#B8B5AF] hover:text-[#F5F0E1] transition-colors"
          >
            Clear
          </button>
          <button
            onClick={selectChilled}
            className="px-2.5 py-1 text-xs rounded bg-[#1A140D] hover:bg-[#241A14] border border-[#3A2B20] text-[#B8B5AF] hover:text-[#F5F0E1] transition-colors"
          >
            Chilled Only
          </button>
          <button
            onClick={selectFrozen}
            className="px-2.5 py-1 text-xs rounded bg-[#1A140D] hover:bg-[#241A14] border border-[#3A2B20] text-[#B8B5AF] hover:text-[#F5F0E1] transition-colors"
          >
            Frozen Only
          </button>
        </div>
      </div>

      {/* 15 Vehicle Checkbox Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-4">
        {ALL_TRUCKS.map((trk) => {
          const isSelected = selectedTrucks.includes(trk.id);
          return (
            <div
              key={trk.id}
              onClick={() => toggleTruck(trk.id)}
              className={`flex items-center gap-2 p-2 rounded cursor-pointer border text-xs transition-all ${
                isSelected
                  ? 'bg-[#241A14] border-[#C2410C]/60 text-[#F5F0E1]'
                  : 'bg-[#151A14] border-[#3A2B20] text-[#8A7A6A] opacity-60 hover:opacity-100'
              }`}
            >
              <div
                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                  isSelected
                    ? 'bg-[#C2410C] border-[#C2410C] text-white'
                    : 'border-[#3A2B20] bg-[#12100F]'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
              <span className="font-mono font-medium truncate">
                {trk.id} <span className="text-[10px] text-[#C9B7A8]">/ {trk.type}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Scenario Triggers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3.5">
        <button
          disabled={executing}
          onClick={() => triggerScenario('COMPRESSOR_FAILURE', 'Heatwave Spike')}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-semibold bg-[#3B2B16] hover:bg-[#4A381E] border border-[#3A2B20] text-[#FBBF24] transition-all disabled:opacity-50 shadow-sm"
        >
          <ThermometerSun className="w-4 h-4 text-[#F59E0B]" />
          <span>Heatwave Spike (+8.5°C)</span>
        </button>

        <button
          disabled={executing}
          onClick={() => triggerScenario('DOOR_OPEN_EXCURSION', 'Multi-Door Breach')}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-semibold bg-[#3B2B16] hover:bg-[#4A381E] border border-[#3A2B20] text-[#FBBF24] transition-all disabled:opacity-50 shadow-sm"
        >
          <DoorOpen className="w-4 h-4 text-[#F59E0B]" />
          <span>Multi-Door Breach (Doors Open)</span>
        </button>

        <button
          disabled={executing}
          onClick={() => triggerScenario('CHAOS_CASCADE', 'Chaos Cascade')}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-semibold bg-[#3C202C] hover:bg-[#4E2A3A] border border-[#7F1D1D]/50 text-[#FB7185] transition-all disabled:opacity-50 shadow-sm"
        >
          <Zap className="w-4 h-4 text-[#F87171]" />
          <span>Chaos Cascade (Mounting Tension)</span>
        </button>

        <button
          disabled={executing}
          onClick={() => triggerScenario('NORMAL_RESTORE', 'Restabilize Fleet')}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-bold bg-[#C2410C] hover:bg-[#EA580C] border border-[#F6D18A] text-[#F5E6D3] transition-all disabled:opacity-50 shadow-md shadow-[#C2410C]/20"
        >
          <RotateCcw className="w-4 h-4 text-white" />
          <span>Restabilize Fleet (Restore Optimal)</span>
        </button>
      </div>

      {/* Execution Feedback Banner */}
      <div className="bg-[#241A14] border border-[#3A2B20] rounded p-2.5 flex items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-2 text-[#C9B7A8] truncate">
          <Info className="w-4 h-4 text-[#F59E0B] shrink-0" />
          <span className="truncate">{feedback.message}</span>
        </div>
        <div className="font-mono text-[10px] tracking-wider text-[#8A7A6A] shrink-0">
          MODE: MANUAL
        </div>
      </div>
    </div>
  );
}

