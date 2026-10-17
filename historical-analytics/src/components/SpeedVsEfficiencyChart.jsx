import React, { useState } from 'react';
import { Gauge, Fuel, Zap } from 'lucide-react';

export default function SpeedVsEfficiencyChart({ data = [], scope = 'all' }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const points = (data && data.length > 0) ? data : [
    { time: '00:00', speed_kmph: 64.0, fuel_pct: 94.0, burn_rate_l_hr: 4.8, reefer_load_pct: 42.0 },
    { time: '02:00', speed_kmph: 72.0, fuel_pct: 90.5, burn_rate_l_hr: 5.6, reefer_load_pct: 45.0 },
    { time: '04:00', speed_kmph: 0.0, fuel_pct: 88.0, burn_rate_l_hr: 1.6, reefer_load_pct: 85.0 },
    { time: '06:00', speed_kmph: 58.0, fuel_pct: 84.5, burn_rate_l_hr: 4.4, reefer_load_pct: 40.0 },
    { time: '08:00', speed_kmph: 68.0, fuel_pct: 80.0, burn_rate_l_hr: 5.2, reefer_load_pct: 48.0 },
    { time: '10:00', speed_kmph: 76.0, fuel_pct: 75.0, burn_rate_l_hr: 6.2, reefer_load_pct: 55.0 },
    { time: '12:00', speed_kmph: 45.0, fuel_pct: 71.0, burn_rate_l_hr: 4.0, reefer_load_pct: 68.0 },
    { time: '14:00', speed_kmph: 15.0, fuel_pct: 68.0, burn_rate_l_hr: 2.5, reefer_load_pct: 92.0 },
    { time: '16:00', speed_kmph: 62.0, fuel_pct: 63.5, burn_rate_l_hr: 5.0, reefer_load_pct: 50.0 },
    { time: '18:00', speed_kmph: 70.0, fuel_pct: 59.0, burn_rate_l_hr: 5.8, reefer_load_pct: 46.0 },
    { time: '20:00', speed_kmph: 65.0, fuel_pct: 55.0, burn_rate_l_hr: 5.1, reefer_load_pct: 44.0 },
    { time: '22:00', speed_kmph: 0.0, fuel_pct: 53.0, burn_rate_l_hr: 1.4, reefer_load_pct: 38.0 },
  ];

  // SVG Chart Dimensions
  const width = 1000;
  const height = 300;
  const padLeft = 60;
  const padRight = 60;
  const padTop = 30;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxSpeed = 100; // 0 to 100 km/h
  const minFuel = 40;
  const maxFuel = 100;

  const getX = (idx) => padLeft + (idx / Math.max(1, points.length - 1)) * chartW;
  const getSpeedY = (spd) => padTop + chartH * (1 - spd / maxSpeed);
  const getFuelY = (fuel) => padTop + chartH * (1 - (fuel - minFuel) / (maxFuel - minFuel));

  // Speed Area path
  const speedPathD = points.reduce((acc, p, idx) => {
    const x = getX(idx);
    const y = getSpeedY(p.speed_kmph || 0);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');
  const bottomY = getSpeedY(0);
  const speedAreaD = speedPathD ? `${speedPathD} L ${getX(points.length - 1)} ${bottomY} L ${getX(0)} ${bottomY} Z` : '';

  // Fuel Line path
  const fuelPathD = points.reduce((acc, p, idx) => {
    const x = getX(idx);
    const y = getFuelY(p.fuel_pct || 80);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const speeds = points.map(p => p.speed_kmph || 0);
  const avgSpeed = (speeds.reduce((a, b) => a + b, 0) / Math.max(1, speeds.length)).toFixed(1);
  const maxSpd = Math.max(...speeds);
  const fuelBurn = ((points[0]?.fuel_pct || 95) - (points[points.length - 1]?.fuel_pct || 55)).toFixed(1);

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-5 text-[#F5F0E1] shadow-sm select-none">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 mb-3 border-b border-[#2A2A2A] gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-[#38BDF8]" />
            <h2 className="text-sm font-bold tracking-tight text-[#F5E6D3]">
              Transit Speed vs. Fuel Consumption & Auxiliary Reefer Load
            </h2>
          </div>
          <p className="text-xs text-[#8A7A6A] mt-0.5">
            24-hour correlation between highway vehicle velocity, fuel burn rate, and refrigeration duty cycle
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 bg-[#38BDF8]/40 border border-[#38BDF8] rounded-sm"></span>
            <span className="text-[#BAE6FD]">Cruising Speed (km/h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#F59E0B]"></span>
            <span className="text-[#FCD34D]">Fuel Level (%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#34D399]"></span>
            <span className="text-[#A7F3D0]">Reefer Active Duty</span>
          </div>
        </div>
      </div>

      {/* SVG Plot Viewport */}
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[700px] overflow-visible">
          <defs>
            <linearGradient id="speedAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#1A1A1A" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((spd) => {
            const y = getSpeedY(spd);
            const fuelVal = minFuel + (spd / 100) * (maxFuel - minFuel);
            return (
              <g key={spd}>
                <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#2A2A2A" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padLeft - 10} y={y + 3} textAnchor="end" fontSize="10" fill="#38BDF8" fontFamily="monospace">
                  {spd} km/h
                </text>
                <text x={width - padRight + 10} y={y + 3} textAnchor="start" fontSize="10" fill="#F59E0B" fontFamily="monospace">
                  {Math.round(fuelVal)}%
                </text>
              </g>
            );
          })}

          {/* Speed Area & Line */}
          {speedAreaD && <path d={speedAreaD} fill="url(#speedAreaGrad)" />}
          {speedPathD && (
            <path
              d={speedPathD}
              fill="none"
              stroke="#38BDF8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="drop-shadow(0 0 6px rgba(56, 189, 248, 0.4))"
            />
          )}

          {/* Fuel Line */}
          {fuelPathD && (
            <path
              d={fuelPathD}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2"
              strokeDasharray="4 2"
              strokeLinecap="round"
            />
          )}

          {/* Points & Interactivity */}
          {points.map((p, idx) => {
            const x = getX(idx);
            const ySpeed = getSpeedY(p.speed_kmph || 0);
            const yFuel = getFuelY(p.fuel_pct || 80);
            const isHovered = hoveredPoint?.idx === idx;
            const reeferHigh = (p.reefer_load_pct || 40) > 75;

            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredPoint({ ...p, idx, x, y: ySpeed })}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                {/* Speed point */}
                <circle
                  cx={x}
                  cy={ySpeed}
                  r={isHovered ? 5.5 : 3.5}
                  fill="#38BDF8"
                  stroke="#12100F"
                  strokeWidth="1.5"
                />

                {/* Reefer Duty Badge */}
                <circle
                  cx={x}
                  cy={yFuel}
                  r={isHovered ? 4.5 : 3}
                  fill={reeferHigh ? '#EF4444' : '#34D399'}
                  stroke="#12100F"
                  strokeWidth="1.5"
                />

                {/* X-axis time label */}
                {(idx % 2 === 0 || idx === points.length - 1) && (
                  <text
                    x={x}
                    y={height - padBottom + 18}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#8A7A6A"
                    fontFamily="monospace"
                  >
                    {p.time}
                  </text>
                )}
              </g>
            );
          })}

          {/* Active Hover Tooltip */}
          {hoveredPoint && (
            <g transform={`translate(${Math.min(width - padRight - 170, Math.max(padLeft, hoveredPoint.x - 70))}, ${Math.max(10, hoveredPoint.y - 85)})`}>
              <rect
                width="170"
                height="78"
                rx="6"
                fill="#12100F"
                stroke="#3A2B20"
                strokeWidth="1.2"
                filter="drop-shadow(0 4px 14px rgba(0,0,0,0.85))"
              />
              <text x="10" y="18" fill="#F5E6D3" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                {hoveredPoint.time} IST Telemetry
              </text>
              <text x="10" y="34" fill="#38BDF8" fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                Transit Speed: {hoveredPoint.speed_kmph} km/h
              </text>
              <text x="10" y="50" fill="#F59E0B" fontSize="10" fontFamily="monospace">
                Fuel Level: {hoveredPoint.fuel_pct}% ({hoveredPoint.burn_rate_l_hr || 4.5} L/h)
              </text>
              <text x="10" y="66" fill="#34D399" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                Reefer Load: {hoveredPoint.reefer_load_pct || 42}% Compressor
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Metric summary badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[#2A2A2A] text-xs">
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Mean Cruising Speed</span>
          <span className="text-sm font-bold font-mono text-[#38BDF8]">{avgSpeed} km/h</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Peak Highway Velocity</span>
          <span className="text-sm font-bold font-mono text-[#F5E6D3]">{maxSpd} km/h</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">24h Fuel Burn Extent</span>
          <span className="text-sm font-bold font-mono text-[#F59E0B]">−{fuelBurn}% capacity</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Reefer Energy Index</span>
          <span className="text-sm font-bold font-mono text-[#34D399]">96.4% Optimal</span>
        </div>
      </div>
    </div>
  );
}

