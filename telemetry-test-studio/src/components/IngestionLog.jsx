import React, { useRef, useEffect } from 'react';
import { Terminal, Trash2 } from 'lucide-react';

export default function IngestionLog({ logs = [], onClearLogs }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Default initial entries matching Figma
  const defaultLogs = [
    { ts: '11802.005', tag: 'RECV', tagColor: 'text-[#34D399]', payload: 'TRK-001  {temp:4.2,set:4.0,door:"CLOSED",speed:62,fuel:78}' },
    { ts: '11802.009', tag: 'GPS', tagColor: 'text-[#38BDF8]', payload: 'TRK-001  {lat:15.490900,lon:73.827800,source:"demo"}' },
    { ts: '11802.014', tag: 'COMMIT', tagColor: 'text-[#FBBF24]', payload: 'topic=coldchain.telemetry.sandbox  partition=0  offset=528416' },
    { ts: '11802.021', tag: 'ACK', tagColor: 'text-[#A8B3A0]', payload: 'Firestore upsert /live_status/TRK-001  latency=16ms' },
    { ts: '11802.026', tag: 'ARCHIVE', tagColor: 'text-[#DEC58F]', payload: 'gs://coldchain-demo/raw/2026/10/17/03/16  immutable=true' },
    { ts: '11801.008', tag: 'RECV', tagColor: 'text-[#34D399]', payload: 'TRK-007  {temp:9.5,set:4.0,door:"CLOSED",speed:42}' },
    { ts: '11801.014', tag: 'ALERT', tagColor: 'text-[#EF4444]', payload: 'TRK-007  excess=+5.5°C  rule=critical_thermal  active=true' },
    { ts: '11801.018', tag: 'COMMIT', tagColor: 'text-[#FBBF24]', payload: 'partition=1  offset=528415  acks=all  replicas=3' },
    { ts: '11801.024', tag: 'ACK', tagColor: 'text-[#A8B3A0]', payload: 'TRK-007  incident open; duplicate SMS suppressed' },
    { ts: '11800.002', tag: 'RECV', tagColor: 'text-[#34D399]', payload: 'TRK-014  {temp:-10.5,set:-18.0,door:"OPEN",speed:0}' },
    { ts: '11800.011', tag: 'ALERT', tagColor: 'text-[#EF4444]', payload: 'TRK-014  excess=+7.5°C  door_breach=true' },
  ];

  const allLogs = logs && logs.length > 0
    ? [
        ...defaultLogs,
        ...logs.map((l, idx) => ({
          ts: l.time || `11803.${String(idx).padStart(3, '0')}`,
          tag: l.type === 'alert-msg' ? 'ALERT' : 'INJECT',
          tagColor: l.type === 'alert-msg' ? 'text-[#EF4444]' : 'text-[#34D399]',
          payload: l.message
        }))
      ]
    : defaultLogs;

  return (
    <div className="bg-[#0A0F0A] border border-[#2A3324] rounded-lg text-[#F5F0E1] overflow-hidden shadow-sm select-none">
      {/* Log Toolbar */}
      <div className="p-3 border-b border-[#2A3324] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#34D399]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5F0E1]">
            Live Pipeline Ingestion Log
          </h3>
        </div>
        <button
          onClick={onClearLogs}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[#A8B3A0] hover:text-[#F5F0E1] hover:bg-[#151A14] transition-colors"
        >
          <Trash2 className="w-3 h-3 text-[#A8B3A0]" />
          <span>Clear</span>
        </button>
      </div>

      {/* Log Channel Info */}
      <div className="bg-[#111810] px-3 py-1.5 border-b border-[#2A3324] flex items-center justify-between font-mono text-[10px] text-[#FCD34D]">
        <span>● FOLLOWING · coldchain.telemetry.sandbox</span>
        <span>3 PARTITIONS · AUTO-SCROLL ON</span>
      </div>

      {/* Log Stream */}
      <div
        ref={scrollRef}
        className="p-3 space-y-1 font-mono text-xs max-h-64 overflow-y-auto bg-[#0A0F0A]"
      >
        {allLogs.map((entry, idx) => (
          <div key={idx} className="flex items-start gap-2 leading-relaxed hover:bg-[#151A14]/40 px-1 py-0.5 rounded">
            <span className="text-[#8A7A6A] text-[10px] select-none shrink-0 w-16">
              {entry.ts}
            </span>
            <span className={`text-[10px] font-bold shrink-0 w-14 ${entry.tagColor}`}>
              [{entry.tag}]
            </span>
            <span className="text-[#B8B5AF] text-[11px] break-all">
              {entry.payload}
            </span>
          </div>
        ))}
      </div>

      {/* Log Session Footer */}
      <div className="bg-[#111810] px-3 py-1.5 border-t border-[#2A3324] flex items-center justify-between font-mono text-[10px] text-[#8A7A6A]">
        <span>{allLogs.length} RECENT ENTRIES · NO DROPPED EVENTS</span>
        <span>SANDBOX-01 · KAFKA v3.8</span>
      </div>
    </div>
  );
}

