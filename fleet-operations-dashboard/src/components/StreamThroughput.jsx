import React from 'react';

export default function StreamThroughput({ metrics }) {
  const msgsPerSec = metrics?.msgs_per_sec ?? 4.7;
  const kbPerSec = metrics?.kb_per_sec ?? 6.8;
  const totalMsgs = metrics?.total_msgs_produced ? Number(metrics.total_msgs_produced).toLocaleString() : '28,416';
  const mode = metrics?.mode || 'NORMAL';

  // Format uptime
  const uptimeSec = metrics?.uptime_sec ?? 6128;
  const hours = String(Math.floor(uptimeSec / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((uptimeSec % 3600) / 60)).padStart(2, '0');
  const seconds = String(uptimeSec % 60).padStart(2, '0');
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

  // Bars width percentage
  const msgPct = Math.min(100, Math.round((msgsPerSec / 50) * 100));
  const kbPct = Math.min(100, Math.round((kbPerSec / 50) * 100));

  return (
    <div className="bg-[#1A140D] border border-[#3A2B20] rounded-lg p-4 text-[#F5F0E1] shadow-sm select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#3A2B20] mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5E6D3]">
          Live Pub/Sub Stream Throughput
        </h3>
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
          mode === 'STRESS'
            ? 'bg-[#3C202C] text-[#FB7185] border border-[#7F1D1D]'
            : 'bg-[#241A14] text-[#F6D18A] border border-[#C2410C]/40'
        }`}>
          {mode}
        </span>
      </div>

      {/* Metric 1 */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#B8B5AF]">Messages / sec</span>
          <div className="font-mono">
            <span className="font-bold text-[#F5E6D3]">{msgsPerSec}</span>
            <span className="text-[10px] text-[#C9B7A8] ml-1">msg/s</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-[#241A14] rounded-full overflow-hidden border border-[#3A2B20]">
          <div
            className="h-full bg-gradient-to-r from-[#D97706] to-[#F59E0B] transition-all duration-300"
            style={{ width: `${Math.max(5, msgPct)}%` }}
          />
        </div>
      </div>

      {/* Metric 2 */}
      <div className="mb-3.5">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#B8B5AF]">Data Transfer Rate</span>
          <div className="font-mono">
            <span className="font-bold text-[#F5E6D3]">{kbPerSec}</span>
            <span className="text-[10px] text-[#C9B7A8] ml-1">KB/s</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-[#241A14] rounded-full overflow-hidden border border-[#3A2B20]">
          <div
            className="h-full bg-gradient-to-r from-[#C2410C] to-[#D97706] transition-all duration-300"
            style={{ width: `${Math.max(5, kbPct)}%` }}
          />
        </div>
      </div>

      {/* Session stats */}
      <div className="pt-3 border-t border-[#3A2B20]/60 grid grid-cols-2 gap-2 text-center mb-2">
        <div className="bg-[#241A14] p-2 rounded border border-[#3A2B20]">
          <div className="text-[9px] font-mono tracking-wider text-[#C9B7A8] uppercase">Session Messages</div>
          <div className="text-sm font-extrabold font-mono text-[#F5E6D3] mt-0.5">{totalMsgs}</div>
        </div>
        <div className="bg-[#241A14] p-2 rounded border border-[#3A2B20]">
          <div className="text-[9px] font-mono tracking-wider text-[#C9B7A8] uppercase">Cluster Uptime</div>
          <div className="text-sm font-extrabold font-mono text-[#F5E6D3] mt-0.5">{uptimeStr}</div>
        </div>
      </div>

      <div className="text-[11px] text-[#C9B7A8]">
        WORKLOAD: BASELINE / 3s · 14 publishers
      </div>
    </div>
  );
}

