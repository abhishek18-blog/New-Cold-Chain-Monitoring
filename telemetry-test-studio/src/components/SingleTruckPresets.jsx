import React from 'react';
import { Thermometer, DoorOpen, Snowflake, CheckCircle2 } from 'lucide-react';

export default function SingleTruckPresets({ selectedTruck, onApplyPreset }) {
  const presets = [
    {
      key: 'COMPRESSOR_FAILURE',
      title: 'Compressor Failure',
      desc: 'Temp spikes to +9.5°C → Critical Alert',
      icon: Thermometer,
      color: 'text-[#EF4444]',
    },
    {
      key: 'DOOR_OPEN_EXCURSION',
      title: 'Door Left Ajar',
      desc: 'Door open with +6.8°C → Driver Alert',
      icon: DoorOpen,
      color: 'text-[#F59E0B]',
    },
    {
      key: 'FREEZE_SPOILAGE',
      title: 'Freeze Hazard',
      desc: 'Chiller drops to −1.5°C → Produce damage',
      icon: Snowflake,
      color: 'text-[#38BDF8]',
    },
    {
      key: 'NORMAL_RESTORE',
      title: 'Restore Optimal State',
      desc: '4.0°C Setpoint, Door closed → Normal state',
      icon: CheckCircle2,
      color: 'text-[#22C55E]',
    },
  ];

  return (
    <div className="bg-[#111810] border border-[#2A3324] rounded-lg text-[#F5F0E1] overflow-hidden shadow-sm select-none">
      {/* Header */}
      <div className="bg-[#0A0F0A] border-b border-[#2A3324] p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-[#F5F0E1]">
            Single Truck Anomaly Preset
          </h2>
          <p className="text-xs text-[#A8B3A0]">
            Applies to {selectedTruck || 'TRK-001'} · Chilled / Frozen cargo
          </p>
        </div>
        <span className="text-[10px] font-mono font-medium text-[#A8B3A0] bg-[#151A14] px-2.5 py-1 rounded border border-[#2A3324]">
          1 TARGET
        </span>
      </div>

      {/* Preset List */}
      <div className="p-4 space-y-2">
        {presets.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.key}
              onClick={() => onApplyPreset(p.key)}
              className="p-3 rounded bg-[#151A14] hover:bg-[#1A1F16] border border-[#2A3324] cursor-pointer transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${p.color}`} />
                <div>
                  <div className="text-xs font-bold text-[#F5F0E1]">{p.title}</div>
                  <div className="text-[11px] text-[#A8B3A0]">{p.desc}</div>
                </div>
              </div>
              <span className="text-xs font-mono font-semibold text-[#FCD34D] hover:underline">
                Apply →
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

