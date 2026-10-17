import React from 'react';
import { Timer, Activity, DoorOpen, Database } from 'lucide-react';

export default function HistoricalSummaryKPIs({ summary = {} }) {
  const excursionTime = summary.cumulative_excursion_time_min ?? 346;
  const mtbi = summary.mean_time_between_incidents_hours ?? 8.6;
  const doorDuration = summary.door_open_duration_total_min ?? 126;
  const records = (summary.archived_telemetry_records ?? 431208).toLocaleString();
  const incidents = summary.total_incidents_24h ?? 42;
  const compliance = summary.fleet_compliance_pct ?? 98.4;

  const kpis = [
    {
      title: 'Cumulative Excursion Time',
      value: excursionTime.toString(),
      unit: 'minutes',
      desc: `Fleet-wide time outside safe range · ${compliance}% compliance`,
      icon: Timer,
      color: 'text-[#F59E0B]',
    },
    {
      title: 'Mean Time Between Incidents',
      value: mtbi.toString(),
      unit: 'operating hours',
      desc: `360 monitored fleet-hours / ${incidents} incidents · last 24h`,
      icon: Activity,
      color: 'text-[#34D399]',
    },
    {
      title: 'Door Open Duration Total',
      value: doorDuration.toString(),
      unit: 'minutes',
      desc: 'Aggregated cargo-bay door access and ambient exposure',
      icon: DoorOpen,
      color: 'text-[#EF4444]',
    },
    {
      title: 'Archived Telemetry Records',
      value: records,
      unit: 'records',
      desc: 'Immutable records in cold cloud storage · 7-year retention',
      icon: Database,
      color: 'text-[#38BDF8]',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
      {kpis.map((k, idx) => {
        const Icon = k.icon;
        return (
          <div
            key={idx}
            className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-4 flex flex-col justify-between hover:border-[#3A2B20] transition-colors shadow-sm"
          >
            <div className="flex items-center justify-between text-xs text-[#B8B5AF] mb-3">
              <span className="font-semibold">{k.title}</span>
              <Icon className={`w-4 h-4 ${k.color}`} />
            </div>

            <div className="my-1 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-[#F5F0E1]">
                {k.value}
              </span>
              <span className="text-xs font-mono text-[#A3A3A3]">
                {k.unit}
              </span>
            </div>

            <div className="text-[11px] text-[#8A7A6A] mt-2 pt-2 border-t border-[#2A2A2A]">
              {k.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}
