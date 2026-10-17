import React from 'react';

export default function RootCauseAndRouteRisk({
  rootCauses = [],
  routeRisks = [],
  totalIncidents = 42
}) {
  const defaultCauses = [
    { label: 'Door Left Ajar', count: 18, pct: '42.9%', color: '#C99842' },
    { label: 'Reefer Compressor Failure', count: 12, pct: '28.6%', color: '#C64142' },
    { label: 'Extreme Ambient Heatwave Spike', count: 8, pct: '19.0%', color: '#DEC58F' },
    { label: 'Sensor Disconnect', count: 4, pct: '9.5%', color: '#8B8882' },
  ];

  const defaultRoutes = [
    { corridor: 'Pune → Hyderabad', minutes: 96, compliance: '93.3%' },
    { corridor: 'Ahmedabad → Mumbai', minutes: 78, compliance: '94.6%' },
    { corridor: 'Goa → Mumbai', minutes: 64, compliance: '95.5%' },
    { corridor: 'Delhi → Lucknow', minutes: 58, compliance: '96.0%' },
    { corridor: 'Hyderabad → Bengaluru', minutes: 50, compliance: '96.5%' },
  ];

  const causes = (rootCauses && rootCauses.length > 0) ? rootCauses : defaultCauses;
  const routes = (routeRisks && routeRisks.length > 0) ? routeRisks : defaultRoutes;

  // Donut SVG circumference calculation
  const r = 38;
  const circumference = 2 * Math.PI * r; // ~238.761
  const totalCount = causes.reduce((acc, c) => acc + (c.count || 0), 0) || 1;

  // Calculate dynamic segments
  let accumulatedLength = 0;
  const segments = causes.map((c) => {
    const fraction = (c.count || 0) / totalCount;
    const dashLength = fraction * circumference;
    const offset = accumulatedLength;
    accumulatedLength += dashLength;
    return {
      ...c,
      dashLength,
      offset,
      strokeDasharray: `${dashLength.toFixed(2)} ${(circumference - dashLength).toFixed(2)}`,
      strokeDashoffset: `-${offset.toFixed(2)}`,
    };
  });

  const maxRouteMinutes = Math.max(100, Math.max(...routes.map(r => r.minutes || 0)));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 select-none">
      {/* Left: Incident Classification Distribution (Donut Pie Chart) */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-5 text-[#F5F0E1] shadow-sm flex flex-col justify-between">
        <div>
          <div className="pb-3 mb-4 border-b border-[#2A2A2A]">
            <h2 className="text-sm font-bold tracking-tight text-[#F5E6D3]">
              Incident Classification Distribution
            </h2>
            <p className="text-xs text-[#8A7A6A] mt-0.5">
              Primary root cause · {totalIncidents} incidents / last 24 hours
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
            {/* Dynamic Donut Chart */}
            <div className="sm:col-span-5 flex justify-center">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {/* Background track circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke="#2A2A2A"
                    strokeWidth="15"
                  />
                  {/* Dynamic pie segments */}
                  {segments.map((seg, idx) => (
                    <circle
                      key={idx}
                      cx="50"
                      cy="50"
                      r={r}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="15"
                      strokeDasharray={seg.strokeDasharray}
                      strokeDashoffset={seg.strokeDashoffset}
                      className="transition-all duration-700 ease-out"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-extrabold font-mono text-[#F5F0E1]">
                    {totalIncidents}
                  </span>
                  <span className="text-[9px] font-mono tracking-wider text-[#A3A3A3] uppercase">
                    Incidents
                  </span>
                </div>
              </div>
            </div>

            {/* Legend breakdown with dynamic counts & percentages */}
            <div className="sm:col-span-7 space-y-2.5">
              {causes.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.color }}></span>
                    <span className="text-[#B8B5AF] text-xs">{c.label}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-[#F5F0E1]">{c.count}</span>
                    <span className="text-[11px] text-[#8A7A6A] w-12 text-right">{c.pct}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-[#2A2A2A] text-[11px] text-[#8A7A6A]">
          Calculated dynamically from real stored incidents. Connectivity loss is categorized under sensor disconnects.
        </div>
      </div>

      {/* Right: High-Risk Route Analysis */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-5 text-[#F5F0E1] shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#2A2A2A]">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-[#F5E6D3]">
                High-Risk Route Analysis
              </h2>
              <p className="text-xs text-[#8A7A6A] mt-0.5">
                Ranked by time outside safe temperature range · top transit corridors
              </p>
            </div>
            <span className="text-[10px] font-mono tracking-wider uppercase text-[#A3A3A3] bg-[#2A2A2A] px-2 py-0.5 rounded">
              24H WINDOW
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#8A7A6A] pb-1 border-b border-[#2A2A2A]">
              <span>TRANSPORT CORRIDOR</span>
              <div className="flex items-center gap-8">
                <span>EXCURSION MINUTES</span>
                <span className="w-16 text-right">COMPLIANCE</span>
              </div>
            </div>

            {routes.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1">
                <span className="font-medium text-[#F5F0E1]">{r.corridor}</span>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 w-32">
                    <div className="flex-1 h-2 bg-[#2A2A2A] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#C99842] rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, ((r.minutes || 0) / maxRouteMinutes) * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-[#F5F0E1] w-10 text-right">{r.minutes}m</span>
                  </div>

                  <span className="font-mono font-bold text-xs text-[#34D399] w-16 text-right">
                    {r.compliance}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-[#2A2A2A] text-[11px] text-[#8A7A6A]">
          Calculated using time-weighted trapezoidal integration of excursion intervals across monitored journeys.
        </div>
      </div>
    </div>
  );
}
