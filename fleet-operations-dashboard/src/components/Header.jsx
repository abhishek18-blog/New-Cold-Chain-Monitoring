import React from 'react';
import { LayoutDashboard, FlaskConical, BarChart3, Radio } from 'lucide-react';

export default function Header({ liveCount = 15, lastSync, kafkaConnected = true }) {
  const syncTime = lastSync || (
    new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) +
    ' IST · ' +
    new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
  );

  return (
    <header className="bg-[#1A140D] border-b border-[#3A2B20] text-[#F5F0E1] px-4 lg:px-8 py-3.5 select-none">
      <div className="max-w-[1720px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-[#C2410C] flex items-center justify-center shadow-lg shadow-[#C2410C]/20 shrink-0">
            <svg width="28" height="28" viewBox="0 0 44 44" fill="none">
              <path d="M19.7497 31L18.3434 28.1875M18.3434 28.1875L15.2494 28.75M18.3434 28.1875L19.7497 25.375M18.3434 28.1875L16.3745 32.125M19.7497 13L18.3434 15.8125M18.3434 15.8125L15.2494 15.25M18.3434 15.8125L19.7497 18.625M18.3434 15.8125L16.3745 11.875M24.2501 31L25.6565 28.1875M25.6565 28.1875L28.7505 28.75M25.6565 28.1875L27.6254 32.125M25.6565 28.1875L24.2501 25.375M24.2501 13L25.6565 15.8125M25.6565 15.8125L28.7505 15.25M25.6565 15.8125L27.6254 11.875M25.6565 15.8125L24.2501 18.625M24.2501 25.375H19.7497M24.2501 25.375L25.9377 22M19.7497 25.375L18.0621 22M25.9377 22L24.2501 18.625M25.9377 22H29.313M18.0621 22H14.6868M18.0621 22L19.7497 18.625M24.2501 18.625H19.7497M29.313 22H33.2508M29.313 22L31.0006 19.75M29.313 22L31.0006 24.25M10.749 22H14.6868M14.6868 22L12.9992 19.75M14.6868 22L12.9992 24.25" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-[#F5F0E1]">
                ColdChain<span className="text-[#F59E0B]">Fleet</span>
              </span>
            </div>
            <p className="text-xs text-[#B8B5AF]">Real-Time Cold Chain Fleet Telemetry & Driver Alert System</p>
          </div>
        </div>

        {/* Center Stream & Connection status */}
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="px-2.5 py-1 rounded bg-[#241A14] border border-[#3A2B20] text-[#C9B7A8] font-mono text-[11px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#8A7A6A]"></span>
            DEMO / SIMULATION
          </div>

          <div className="px-3 py-1 rounded bg-[#1B1410] border border-[#3A2B20] text-[#34D399] font-medium flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]"></span>
            </span>
            <span className="text-[11px] font-semibold tracking-wide">LIVE STREAMING (3s)</span>
          </div>

          <span className="text-[#8B8882] text-[11px] hidden sm:inline font-mono">
            Last sync {syncTime}
          </span>

          <div className="w-7 h-7 rounded-full bg-[#241A14] border border-[#3A2B20] flex items-center justify-center text-[#F6D18A] text-xs font-semibold">
            AK
          </div>
        </div>
      </div>

      {/* Navigation tabs row */}
      <div className="max-w-[1720px] mx-auto mt-3.5 pt-3 border-t border-[#3A2B20]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <a
            href="/"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium bg-[#241A14] border border-[#C2410C] text-[#F5E6D3] shadow-sm shadow-[#C2410C]/20 transition-colors"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Fleet Operations Dashboard</span>
          </a>

          <a
            href="/simulator.html"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium text-[#C9B7A8] hover:text-[#F5F0E1] hover:bg-[#241A14] transition-colors"
          >
            <FlaskConical className="w-3.5 h-3.5 text-[#8A7A6A]" />
            <span>Telemetry Test Studio</span>
          </a>

          <a
            href="/analytics.html"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium text-[#C9B7A8] hover:text-[#F5F0E1] hover:bg-[#241A14] transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#8A7A6A]" />
            <span>Historical Analytics</span>
          </a>
        </nav>

        <div className="text-[11px] font-mono text-[#8B8882] tracking-wider uppercase">
          REGION IN-WEST · ENV sandbox-01
        </div>
      </div>
    </header>
  );
}

