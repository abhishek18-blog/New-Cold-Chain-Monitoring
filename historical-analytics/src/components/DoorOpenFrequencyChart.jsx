import React, { useState } from 'react';
import { DoorOpen, Clock, AlertTriangle } from 'lucide-react';

export default function DoorOpenFrequencyChart({ data = [], scope = 'all' }) {
  const [hoveredBar, setHoveredBar] = useState(null);

  // Fallback data if loading
  const points = (data && data.length > 0) ? data : [
    { time: '00:00', count: 0, duration_min: 0.0, location: 'Night Depot' },
    { time: '02:00', count: 0, duration_min: 0.0, location: 'Night Depot' },
    { time: '04:00', count: 1, duration_min: 2.1, location: 'Pre-trip Departure Check' },
    { time: '06:00', count: 0, duration_min: 0.0, location: 'Transit' },
    { time: '08:00', count: 3, duration_min: 11.4, location: 'Warehouse Delivery Dock #1' },
    { time: '10:00', count: 1, duration_min: 3.5, location: 'Highway Toll Security Check' },
    { time: '12:00', count: 2, duration_min: 7.2, location: 'Midway Distribution Cross-dock' },
    { time: '14:00', count: 4, duration_min: 16.8, location: 'Urban Hub Pallet Unload' },
    { time: '16:00', count: 3, duration_min: 12.0, location: 'Retail Depot Delivery' },
    { time: '18:00', count: 2, duration_min: 6.4, location: 'Inspection Gate' },
    { time: '20:00', count: 1, duration_min: 2.5, location: 'Refueling Bay' },
    { time: '22:00', count: 0, duration_min: 0.0, location: 'Depot Secured' },
  ];

  const totalOpenings = points.reduce((acc, p) => acc + (p.count || 0), 0);
  const totalMinutes = points.reduce((acc, p) => acc + (p.duration_min || 0), 0);
  const peakPoint = points.reduce((max, p) => (p.duration_min > (max?.duration_min || 0) ? p : max), points[0]);

  // SVG Chart Dimensions
  const width = 1000;
  const height = 300;
  const padLeft = 60;
  const padRight = 60;
  const padTop = 30;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxCount = Math.max(5, Math.max(...points.map(p => p.count || 0)));
  const maxDuration = Math.max(20, Math.max(...points.map(p => p.duration_min || 0)));

  const getBarX = (idx) => padLeft + (idx / points.length) * chartW + (chartW / points.length) * 0.15;
  const barWidth = Math.max(8, (chartW / points.length) * 0.7);

  const getCountY = (cnt) => padTop + chartH * (1 - cnt / maxCount);
  const getDurationY = (dur) => padTop + chartH * (1 - dur / maxDuration);

  // Line path for duration curve
  const durationPathD = points.reduce((acc, p, idx) => {
    const x = padLeft + (idx / points.length) * chartW + (chartW / points.length) * 0.5;
    const y = getDurationY(p.duration_min || 0);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-5 text-[#F5F0E1] shadow-sm select-none">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 mb-3 border-b border-[#2A2A2A] gap-3">
        <div>
          <div className="flex items-center gap-2">
            <DoorOpen className="w-4 h-4 text-[#F59E0B]" />
            <h2 className="text-sm font-bold tracking-tight text-[#F5E6D3]">
              Hourly Door Open Frequency & Bay Exposure Duration
            </h2>
          </div>
          <p className="text-xs text-[#8A7A6A] mt-0.5">
            24-hour cargo bay access frequency vs. cumulative ambient thermal exposure duration
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-[#D97706] rounded-sm"></span>
            <span className="text-[#B8B5AF]">Door Open Events (Count)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#EF4444]"></span>
            <span className="text-[#FCA5A5]">Exposure Duration (Min)</span>
          </div>
        </div>
      </div>

      {/* SVG Plot Viewport */}
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[700px] overflow-visible">
          {/* Grid lines */}
          {[0, 1, 2, 3, 4, 5].map((cnt) => {
            const y = getCountY(cnt);
            const durVal = Math.round((cnt / 5) * maxDuration);
            return (
              <g key={cnt}>
                <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#2A2A2A" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padLeft - 10} y={y + 3} textAnchor="end" fontSize="10" fill="#D97706" fontFamily="monospace">
                  {cnt}
                </text>
                <text x={width - padRight + 10} y={y + 3} textAnchor="start" fontSize="10" fill="#EF4444" fontFamily="monospace">
                  {durVal}m
                </text>
              </g>
            );
          })}

          {/* Left Y-axis label */}
          <text x={padLeft - 25} y={padTop - 12} textAnchor="middle" fontSize="9" fill="#D97706" fontWeight="bold">
            EVENTS
          </text>
          {/* Right Y-axis label */}
          <text x={width - padRight + 25} y={padTop - 12} textAnchor="middle" fontSize="9" fill="#EF4444" fontWeight="bold">
            MINUTES
          </text>

          {/* Vertical Bars: Door Open Count */}
          {points.map((p, idx) => {
            const x = getBarX(idx);
            const y = getCountY(p.count || 0);
            const h = height - padBottom - y;
            const isHovered = hoveredBar?.idx === idx;

            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredBar({ ...p, idx, x, y })}
                onMouseLeave={() => setHoveredBar(null)}
              >
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(0, h)}
                  rx="3"
                  fill={isHovered ? '#F59E0B' : '#D97706'}
                  opacity={isHovered ? 1 : 0.85}
                  filter={isHovered ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.6))' : 'none'}
                />

                {/* X-axis time label */}
                {(idx % 2 === 0 || idx === points.length - 1) && (
                  <text
                    x={x + barWidth / 2}
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

          {/* Duration Line Overlay */}
          {durationPathD && (
            <path
              d={durationPathD}
              fill="none"
              stroke="#EF4444"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="drop-shadow(0 0 4px rgba(239, 68, 68, 0.5))"
            />
          )}

          {/* Duration Points */}
          {points.map((p, idx) => {
            const x = padLeft + (idx / points.length) * chartW + (chartW / points.length) * 0.5;
            const y = getDurationY(p.duration_min || 0);
            return (
              <circle
                key={idx}
                cx={x}
                cy={y}
                r="3.5"
                fill="#EF4444"
                stroke="#12100F"
                strokeWidth="1.5"
              />
            );
          })}

          {/* Hover Tooltip Card */}
          {hoveredBar && (
            <g transform={`translate(${Math.min(width - padRight - 160, Math.max(padLeft, hoveredBar.x - 60))}, ${Math.max(10, hoveredBar.y - 80)})`}>
              <rect
                width="160"
                height="70"
                rx="6"
                fill="#12100F"
                stroke="#3A2B20"
                strokeWidth="1.2"
                filter="drop-shadow(0 4px 12px rgba(0,0,0,0.8))"
              />
              <text x="10" y="18" fill="#F5E6D3" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                {hoveredBar.time} · {hoveredBar.location || 'Dock'}
              </text>
              <text x="10" y="36" fill="#F59E0B" fontSize="11" fontWeight="bold" fontFamily="monospace">
                Door Openings: {hoveredBar.count || 0} events
              </text>
              <text x="10" y="52" fill="#FCA5A5" fontSize="10.5" fontFamily="monospace">
                Exposure: {hoveredBar.duration_min || 0} min total
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Metric summary badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[#2A2A2A] text-xs">
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Total Door Openings</span>
          <span className="text-sm font-bold font-mono text-[#F5E6D3]">{totalOpenings} events</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Total Bay Exposure</span>
          <span className="text-sm font-bold font-mono text-[#EF4444]">{totalMinutes.toFixed(1)} minutes</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Peak Exposure Window</span>
          <span className="text-sm font-bold font-mono text-[#F59E0B]">{peakPoint?.time || '14:00'} ({peakPoint?.duration_min || 0}m)</span>
        </div>
        <div className="bg-[#12100F] p-2.5 rounded border border-[#2A2A2A]">
          <span className="text-[10px] text-[#8A7A6A] uppercase font-mono block">Risk Assessment</span>
          <span className="text-sm font-bold font-mono text-[#34D399]">Controlled Dwell</span>
        </div>
      </div>
    </div>
  );
}

