import React, { useState } from 'react';
import { Thermometer, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function ThermalTrendChart({ data = [], scope = 'all', truckMeta = null }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const sp = truckMeta?.sp ?? (scope === 'TRK-003' || scope === 'TRK-008' || scope === 'TRK-013' || scope === 'TRK-015' ? -18.0 : 4.0);
  const isChilled = sp > 0;

  // Fallback data if props are loading
  const points = (data && data.length > 0) ? data : [
    { time: '00:00', temp: sp + 0.1, setpoint: sp, safe_min: sp - 2, safe_max: sp + 2, door: false },
    { time: '03:00', temp: sp - 0.2, setpoint: sp, safe_min: sp - 2, safe_max: sp + 2, door: false },
    { time: '06:00', temp: sp + 0.2, setpoint: sp, safe_min: sp - 2, safe_max: sp + 2, door: false },
    { time: '09:00', temp: sp + 0.5, setpoint: sp, safe_min: sp - 2, safe_max: sp + 2, door: false },
    { time: '12:00', temp: sp + 1.2, setpoint: sp, safe_min: sp - 2, safe_max: sp + 2, door: false },
    { time: '15:00', temp: sp + 3.8, setpoint: sp, safe_min: sp - 2, safe_max: sp + 2, door: true },
    { time: '18:00', temp: sp + 1.4, setpoint: sp, safe_min: sp - 2, safe_max: sp + 2, door: false },
    { time: '21:00', temp: sp + 0.3, setpoint: sp, safe_min: sp - 2, safe_max: sp + 2, door: false },
    { time: '23:00', temp: sp + 0.1, setpoint: sp, safe_min: sp - 2, safe_max: sp + 2, door: false },
  ];

  // SVG Chart Dimensions
  const width = 1000;
  const height = 300;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const minY = isChilled ? 0.0 : -25.0;
  const maxY = isChilled ? 12.0 : -8.0;

  const getY = (val) => {
    const norm = (val - minY) / (maxY - minY);
    return padTop + chartH * (1 - Math.max(0, Math.min(1, norm)));
  };

  const getX = (idx) => {
    return padLeft + (idx / Math.max(1, points.length - 1)) * chartW;
  };

  // Safe band coordinates
  const safeTopY = getY(sp + 2.0);
  const safeBottomY = getY(sp - 2.0);
  const setpointY = getY(sp);
  const warningThresholdY = getY(sp + 2.0);
  const criticalThresholdY = getY(sp + 4.0);

  // Line path generator
  const pathD = points.reduce((acc, p, idx) => {
    const x = getX(idx);
    const y = getY(p.temp);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  // Area path generator (fill under line down to chart bottom)
  const bottomY = getY(minY);
  const areaD = pathD ? `${pathD} L ${getX(points.length - 1)} ${bottomY} L ${getX(0)} ${bottomY} Z` : '';

  // Calculate summary stats
  const temps = points.map(p => p.temp);
  const maxTemp = Math.max(...temps);
  const minTemp = Math.min(...temps);
  const excursionsCount = points.filter(p => p.temp > (sp + 2.0) || p.temp < (sp - 2.0)).length;

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-5 text-[#F5F0E1] shadow-sm select-none">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 mb-3 border-b border-[#2A2A2A] gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-[#F59E0B]" />
            <h2 className="text-sm font-bold tracking-tight text-[#F5E6D3]">
              Historical Thermal Trend vs. Regulatory Setpoint
            </h2>
          </div>
          <p className="text-xs text-[#8A7A6A] mt-0.5">
            24-hour continuous sensor telemetry · Target setpoint <span className="font-mono text-[#F59E0B] font-bold">{sp > 0 ? `+${sp.toFixed(1)}` : sp.toFixed(1)}°C</span> with safe corridor (±2.0°C)
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#F59E0B]"></span>
            <span className="text-[#B8B5AF]">Cargo Temp</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-[#8A7A6A]"></span>
            <span className="text-[#8A7A6A]">Setpoint ({sp}°C)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#22C55E]/20 border border-[#22C55E]/50 rounded-sm"></span>
            <span className="text-[#34D399]">Safe Band (±2°C)</span>
          </div>
        </div>
      </div>

      {/* SVG Plot Viewport */}
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[700px] overflow-visible">
          <defs>
            <linearGradient id="thermalAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.35" />
              <stop offset="60%" stopColor="#C2410C" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#1A1A1A" stopOpacity="0.0" />
            </linearGradient>
            <pattern id="safeBandPattern" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 0 10 L 10 0 M 0 0 L 10 10" stroke="#22C55E" strokeWidth="0.5" strokeOpacity="0.15" />
            </pattern>
          </defs>

          {/* Grid lines */}
          {[minY, sp - 2.0, sp, sp + 2.0, sp + 4.0, maxY].map((val, i) => {
            const y = getY(val);
            return (
              <g key={i}>
                <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#2A2A2A" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padLeft - 10} y={y + 3} textAnchor="end" fontSize="10" fill="#8A7A6A" fontFamily="monospace">
                  {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}°
                </text>
              </g>
            );
          })}

          {/* Safe Band Shading Polygon [sp - 2, sp + 2] */}
          <rect
            x={padLeft}
            y={safeTopY}
            width={chartW}
            height={Math.max(0, safeBottomY - safeTopY)}
            fill="url(#safeBandPattern)"
          />
          <rect
            x={padLeft}
            y={safeTopY}
            width={chartW}
            height={Math.max(0, safeBottomY - safeTopY)}
            fill="#22C55E"
            fillOpacity="0.08"
            stroke="#22C55E"
            strokeWidth="0.75"
            strokeOpacity="0.3"
            strokeDasharray="4 4"
          />

          {/* Setpoint Reference Line */}
          <line
            x1={padLeft}
            y1={setpointY}
            x2={width - padRight}
            y2={setpointY}
            stroke="#8A7A6A"
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />

          {/* Area fill under curve */}
          {areaD && <path d={areaD} fill="url(#thermalAreaGrad)" />}

          {/* Main Temperature Line */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="drop-shadow(0 0 6px rgba(245, 158, 11, 0.4))"
            />
          )}

          {/* Data Points and Interactivity */}
          {points.map((p, idx) => {
            const x = getX(idx);
            const y = getY(p.temp);
            const delta = p.temp - sp;
            const isExcursion = Math.abs(delta) > 2.0;
            const isDoor = p.door;
            const isHovered = hoveredPoint?.idx === idx;

            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredPoint({ ...p, idx, x, y, delta })}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                {/* Excursion halo pulse */}
                {isExcursion && (
                  <circle cx={x} cy={y} r="8" fill="#EF4444" opacity="0.3" className="animate-ping" />
                )}

                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 6 : (isExcursion || isDoor ? 4.5 : 3)}
                  fill={isExcursion ? '#EF4444' : (isDoor ? '#F59E0B' : '#F59E0B')}
                  stroke="#12100F"
                  strokeWidth="2"
                />

                {/* X-axis time labels */}
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

          {/* Active Hover Tooltip Card in SVG */}
          {hoveredPoint && (
            <g transform={`translate(${Math.min(width - padRight - 150, Math.max(padLeft, hoveredPoint.x - 70))}, ${Math.max(10, hoveredPoint.y - 75)})`}>
              <rect
                width="140"
                height="65"
                rx="6"
                fill="#12100F"
                stroke="#3A2B20"
                strokeWidth="1.2"
                filter="drop-shadow(0 4px 12px rgba(0,0,0,0.8))"
              />
              <text x="10" y="18" fill="#F5E6D3" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                {hoveredPoint.time} UTC
              </text>
              <text x="10" y="34" fill={hoveredPoint.temp > (sp + 2) ? '#EF4444' : '#F59E0B'} fontSize="11" fontWeight="bold" fontFamily="monospace">
                Temp: {hoveredPoint.temp > 0 ? `+${hoveredPoint.temp.toFixed(1)}` : hoveredPoint.temp.toFixed(1)}°C
              </text>
              <text x="10" y="48" fill="#B8B5AF" fontSize="9.5" fontFamily="monospace">
                Delta: {hoveredPoint.delta > 0 ? `+${hoveredPoint.delta.toFixed(1)}` : hoveredPoint.delta.toFixed(1)}°C {hoveredPoint.door ? '· ⚠️ DOOR OPEN' : ''}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Metric summary badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[#2A2A2A] text-xs">
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Regulatory Setpoint</span>
          <span className="text-sm font-bold font-mono text-[#F5E6D3]">{sp > 0 ? `+${sp.toFixed(1)}` : sp.toFixed(1)}°C</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Peak Excursion Temp</span>
          <span className="text-sm font-bold font-mono text-[#EF4444]">{maxTemp > 0 ? `+${maxTemp.toFixed(1)}` : maxTemp.toFixed(1)}°C</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Lowest Temperature</span>
          <span className="text-sm font-bold font-mono text-[#38BDF8]">{minTemp > 0 ? `+${minTemp.toFixed(1)}` : minTemp.toFixed(1)}°C</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Compliance Band Status</span>
          <span className={`text-sm font-bold font-mono ${excursionsCount > 0 ? 'text-[#F59E0B]' : 'text-[#34D399]'}`}>
            {excursionsCount > 0 ? `${excursionsCount} Excursion Hours` : '100% In-Band'}
          </span>
        </div>
      </div>
    </div>
  );
}
