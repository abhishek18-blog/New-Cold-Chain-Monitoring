import React, { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

export default function ExcursionDurationChart({ data = [], scope = 'all' }) {
  const [hoveredEpisode, setHoveredEpisode] = useState(null);

  const episodes = (data && data.length > 0) ? data : [
    { id: 'CC-261017-042', truck: 'TRK-007', time: '03:14', duration_min: 2.5, peak_delta: '+5.5°C', severity: 'CRITICAL', cause: 'Reefer Compressor Failure', resolved: false },
    { id: 'CC-261017-041', truck: 'TRK-014', time: '03:12', duration_min: 4.6, peak_delta: '+7.5°C', severity: 'CRITICAL', cause: 'Door Left Ajar', resolved: true },
    { id: 'CC-261017-040', truck: 'TRK-003', time: '03:10', duration_min: 12.0, peak_delta: '+2.4°C', severity: 'WARNING', cause: 'Extreme Ambient Heatwave Spike', resolved: true },
    { id: 'CC-261017-039', truck: 'TRK-011', time: '02:45', duration_min: 8.2, peak_delta: '+2.8°C', severity: 'WARNING', cause: 'Door Left Ajar', resolved: true },
    { id: 'CC-261017-038', truck: 'TRK-002', time: '01:22', duration_min: 6.0, peak_delta: '+2.2°C', severity: 'WARNING', cause: 'Sensor Disconnect', resolved: true },
    { id: 'CC-261017-037', truck: 'TRK-005', time: '23:40', duration_min: 14.2, peak_delta: '+5.8°C', severity: 'CRITICAL', cause: 'Reefer Compressor Failure', resolved: true },
    { id: 'CC-261017-036', truck: 'TRK-008', time: '21:15', duration_min: 18.5, peak_delta: '+7.6°C', severity: 'CRITICAL', cause: 'Door Left Ajar', resolved: true },
    { id: 'CC-261017-035', truck: 'TRK-001', time: '19:08', duration_min: 9.0, peak_delta: '+3.4°C', severity: 'WARNING', cause: 'Extreme Ambient Heatwave Spike', resolved: true },
  ];

  // SVG Chart Dimensions
  const width = 1000;
  const height = 300;
  const padLeft = 60;
  const padRight = 40;
  const padTop = 30;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxDuration = Math.max(20, Math.max(...episodes.map(e => e.duration_min || 0)));
  const getY = (dur) => padTop + chartH * (1 - dur / maxDuration);

  const totalDuration = episodes.reduce((acc, e) => acc + (e.duration_min || 0), 0);
  const avgDuration = episodes.length > 0 ? (totalDuration / episodes.length).toFixed(1) : 0;
  const maxEpisode = episodes.reduce((max, e) => (e.duration_min > (max?.duration_min || 0) ? e : max), episodes[0]);
  const criticalCount = episodes.filter(e => e.severity === 'CRITICAL').length;

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-5 text-[#F5F0E1] shadow-sm select-none">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 mb-3 border-b border-[#2A2A2A] gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-[#EF4444]" />
            <h2 className="text-sm font-bold tracking-tight text-[#F5E6D3]">
              Thermal Excursion Incident Timeline & Severity Duration
            </h2>
          </div>
          <p className="text-xs text-[#8A7A6A] mt-0.5">
            Individual excursion episodes classified by duration (minutes outside safe band) and peak excursion delta
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-[#EF4444] rounded-sm"></span>
            <span className="text-[#FCA5A5]">Critical Excursion (≥4°C / Door)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-[#F59E0B] rounded-sm"></span>
            <span className="text-[#FCD34D]">Warning (≥2°C)</span>
          </div>
        </div>
      </div>

      {/* SVG Plot Viewport */}
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[700px] overflow-visible">
          {/* Threshold reference lines */}
          {[0, 5, 10, 15, 20, 25].map((val) => {
            if (val > maxDuration) return null;
            const y = getY(val);
            return (
              <g key={val}>
                <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#2A2A2A" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padLeft - 10} y={y + 3} textAnchor="end" fontSize="10" fill="#8A7A6A" fontFamily="monospace">
                  {val} min
                </text>
              </g>
            );
          })}

          {/* Episode Column Bars */}
          {episodes.map((ep, idx) => {
            const barW = Math.min(48, Math.max(24, (chartW / episodes.length) * 0.65));
            const x = padLeft + (idx / episodes.length) * chartW + ((chartW / episodes.length) - barW) / 2;
            const y = getY(ep.duration_min || 0);
            const h = height - padBottom - y;
            const isCritical = ep.severity === 'CRITICAL';
            const isHovered = hoveredEpisode?.idx === idx;
            const color = isCritical ? '#EF4444' : '#F59E0B';

            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredEpisode({ ...ep, idx, x, y })}
                onMouseLeave={() => setHoveredEpisode(null)}
              >
                {/* Bar capsule */}
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(4, h)}
                  rx="4"
                  fill={color}
                  opacity={isHovered ? 1.0 : 0.85}
                  filter={isHovered ? `drop-shadow(0 0 10px ${color})` : 'none'}
                />

                {/* Delta Pill inside or on top of bar */}
                <text
                  x={x + barW / 2}
                  y={Math.max(padTop + 14, y - 6)}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="bold"
                  fill={isHovered ? '#FFFFFF' : color}
                  fontFamily="monospace"
                >
                  {ep.peak_delta}
                </text>

                {/* X-axis Episode ID and Truck label */}
                <text
                  x={x + barW / 2}
                  y={height - padBottom + 16}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="#B8B5AF"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {ep.truck}
                </text>
                <text
                  x={x + barW / 2}
                  y={height - padBottom + 28}
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#8A7A6A"
                  fontFamily="monospace"
                >
                  {ep.time}
                </text>
              </g>
            );
          })}

          {/* Active Hover Tooltip Card */}
          {hoveredEpisode && (
            <g transform={`translate(${Math.min(width - padRight - 180, Math.max(padLeft, hoveredEpisode.x - 70))}, ${Math.max(10, hoveredEpisode.y - 85)})`}>
              <rect
                width="180"
                height="78"
                rx="6"
                fill="#12100F"
                stroke="#3A2B20"
                strokeWidth="1.2"
                filter="drop-shadow(0 4px 14px rgba(0,0,0,0.85))"
              />
              <text x="10" y="18" fill="#F5E6D3" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                {hoveredEpisode.id} · {hoveredEpisode.truck}
              </text>
              <text x="10" y="34" fill={hoveredEpisode.severity === 'CRITICAL' ? '#EF4444' : '#F59E0B'} fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                {hoveredEpisode.severity}: {hoveredEpisode.peak_delta} ({hoveredEpisode.duration_min} min)
              </text>
              <text x="10" y="50" fill="#B8B5AF" fontSize="9.5" fontFamily="sans-serif">
                Cause: {hoveredEpisode.cause}
              </text>
              <text x="10" y="66" fill={hoveredEpisode.resolved ? '#34D399' : '#F59E0B'} fontSize="9" fontWeight="bold" fontFamily="monospace">
                {hoveredEpisode.resolved ? '✓ RESOLVED' : '⚠️ OPEN · INTERVENTION'}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Metric summary badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[#2A2A2A] text-xs">
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Analyzed Incidents</span>
          <span className="text-sm font-bold font-mono text-[#F5E6D3]">{episodes.length} episodes</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Max Single Excursion</span>
          <span className="text-sm font-bold font-mono text-[#EF4444]">{maxEpisode?.duration_min || 0} min ({maxEpisode?.truck})</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Mean Excursion Duration</span>
          <span className="text-sm font-bold font-mono text-[#F59E0B]">{avgDuration} min / incident</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Critical Breaches</span>
          <span className="text-sm font-bold font-mono text-[#EF4444]">{criticalCount} incidents</span>
        </div>
      </div>
    </div>
  );
}

