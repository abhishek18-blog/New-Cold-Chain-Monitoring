import React from 'react';
import { Truck, CheckCircle2, AlertTriangle, Siren, WifiOff } from 'lucide-react';

export default function FleetHealthSummary({ counts }) {
  const { total = 15, ok = 10, warning = 2, alert = 2, noSignal = 1 } = counts || {};

  const metrics = [
    {
      label: 'Active Trucks',
      value: String(total).padStart(2, '0'),
      sub: 'Monitored routes',
      icon: Truck,
      color: 'text-[#F5F0E1]',
      border: 'border-[#3A2B20]',
      bg: 'bg-[#1A140D]'
    },
    {
      label: 'Optimal (OK)',
      value: String(ok).padStart(2, '0'),
      sub: 'Normal temperature',
      icon: CheckCircle2,
      color: 'text-[#22C55E]',
      border: 'border-[#3A2B20]',
      bg: 'bg-[#1A140D]'
    },
    {
      label: 'Warning',
      value: String(warning).padStart(2, '0'),
      sub: 'Excess ≥ 2.0°C',
      icon: AlertTriangle,
      color: 'text-[#F59E0B]',
      border: 'border-[#3A2B20]',
      bg: 'bg-[#1A140D]'
    },
    {
      label: 'Critical Alerts',
      value: String(alert).padStart(2, '0'),
      sub: 'Severe excursion · excess ≥ 5.0°C',
      icon: Siren,
      color: 'text-[#EF4444]',
      border: 'border-[#3A2B20]',
      bg: 'bg-[#1A140D]'
    },
    {
      label: 'No Signal',
      value: String(noSignal).padStart(2, '0'),
      sub: 'Silent > 120s',
      icon: WifiOff,
      color: 'text-[#8B8882]',
      border: 'border-[#3A2B20]',
      bg: 'bg-[#1A140D]'
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 select-none">
      {metrics.map((m, idx) => {
        const Icon = m.icon;
        return (
          <div
            key={idx}
            className={`${m.bg} ${m.border} border rounded-lg p-4 flex flex-col justify-between transition-all hover:border-[#6B4A3A] shadow-sm`}
          >
            <div className="flex items-center justify-between text-xs text-[#B8B5AF]">
              <span className="font-medium tracking-wide">{m.label}</span>
              <Icon className={`w-4 h-4 ${m.color} opacity-80`} />
            </div>
            <div className="my-2">
              <span className={`text-3xl lg:text-4xl font-extrabold tracking-tight font-mono ${m.color}`}>
                {m.value}
              </span>
            </div>
            <div className="text-[11px] text-[#8A7A6A] truncate">
              {m.sub}
            </div>
          </div>
        );
      })}
    </div>
  );
}

