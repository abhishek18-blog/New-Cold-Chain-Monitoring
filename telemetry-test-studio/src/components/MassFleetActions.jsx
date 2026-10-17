import React from 'react';
import { ArrowUpRight, Info } from 'lucide-react';

export default function MassFleetActions({ onTriggerScenario }) {
  const actions = [
    {
      id: 'COMPRESSOR_FAILURE',
      title: 'Fleet Heatwave Spike',
      headline: '+8.5°C across all 15 trucks simultaneously.',
      desc: 'Relative to each truck’s current temperature · preserve reefer setpoints',
      color: 'text-[#F59E0B]',
      border: 'border-[#2A3324]',
      bg: 'bg-[#151A14] hover:bg-[#1A1F16]',
    },
    {
      id: 'DOOR_OPEN_EXCURSION',
      title: 'Fleet Multi-Door Breach',
      headline: 'Open cargo doors across all 15 trucks.',
      desc: 'Emit door_open=true · exercise breach detection and dispatch delivery',
      color: 'text-[#F59E0B]',
      border: 'border-[#2A3324]',
      bg: 'bg-[#151A14] hover:bg-[#1A1F16]',
    },
    {
      id: 'CHAOS_CASCADE',
      title: 'Fleet Chaos Cascade',
      headline: 'Mounting randomized anomalies across trucks.',
      desc: 'Escalating heat, door, speed, fuel and sensor-loss events',
      color: 'text-[#F87171]',
      border: 'border-[#7F1D1D]/60',
      bg: 'bg-[#2A0A0A] hover:bg-[#381010]',
    },
    {
      id: 'NORMAL_RESTORE',
      title: 'Restabilize All 15 Trucks',
      headline: 'Restore optimal setpoints and close doors.',
      desc: 'Chilled 4.0°C / Frozen −18.0°C · reset faults and restore heartbeats',
      color: 'text-[#34D399]',
      border: 'border-[#2A3324]',
      bg: 'bg-[#132A10] hover:bg-[#183515]',
    },
  ];

  return (
    <div className="bg-[#111810] border border-[#2A3324] rounded-lg text-[#F5F0E1] overflow-hidden shadow-sm select-none">
      {/* Header */}
      <div className="bg-[#0A0F0A] border-b border-[#2A3324] p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-[#F5F0E1]">
            Mass Fleet Actions (All 15 Trucks)
          </h2>
          <p className="text-xs text-[#A8B3A0]">
            Resilience testing at fleet scale · execution affects all selected targets
          </p>
        </div>
        <span className="text-[10px] font-mono font-medium text-[#A8B3A0] bg-[#151A14] px-2.5 py-1 rounded border border-[#2A3324]">
          15 VEHICLES
        </span>
      </div>

      {/* Action Cards */}
      <div className="p-4 space-y-2.5">
        {actions.map((act) => (
          <div
            key={act.id}
            onClick={() => onTriggerScenario(act.id, act.title)}
            className={`p-3 rounded border cursor-pointer transition-all flex items-center justify-between ${act.bg} ${act.border}`}
          >
            <div>
              <div className={`text-xs font-bold ${act.color} mb-0.5`}>
                {act.title}
              </div>
              <div className="text-xs font-semibold text-[#F5F0E1]">
                {act.headline}
              </div>
              <div className="text-[11px] text-[#A8B3A0] mt-0.5">
                {act.desc}
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-[#A8B3A0] shrink-0 ml-3" />
          </div>
        ))}

        {/* Safety Note */}
        <div className="flex items-start gap-2 pt-2 text-[11px] text-[#B8B5AF]">
          <Info className="w-3.5 h-3.5 text-[#F59E0B] shrink-0 mt-0.5" />
          <span>Heatwave and chaos actions may create 15 simultaneous incidents. Restore clears synthetic faults only.</span>
        </div>
      </div>
    </div>
  );
}

