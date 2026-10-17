import React from 'react';
import { ShieldCheck } from 'lucide-react';

export default function ComplianceMethodology() {
  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-3.5 flex items-start gap-3 text-xs text-[#B8B5AF] select-none">
      <ShieldCheck className="w-4 h-4 text-[#34D399] shrink-0 mt-0.5" />
      <div>
        <p className="leading-relaxed">
          <strong className="text-[#F5F0E1]">Compliance methodology:</strong> excursion = cargo outside commanded setpoint ±2.0°C. Fleet compliance = 1 − 346 / 21,600 monitored minutes = <strong className="text-[#34D399]">98.4%</strong> (rounded). Offline intervals are tracked separately. All evidence shown is synthetic demo data.
        </p>
      </div>
    </div>
  );
}

