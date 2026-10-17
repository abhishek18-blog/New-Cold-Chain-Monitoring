import React from 'react';

export default function Footer() {
  return (
    <footer className="border-t border-[#2A3324] bg-[#0A0F0A] text-[#8A7A6A] text-xs py-4 px-4 lg:px-8 mt-8 select-none">
      <div className="max-w-[1720px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div>
          ColdChain Studio v2.4.0 · Sandbox Build 2026.10
        </div>
        <div className="font-mono text-[11px] text-[#A8B3A0]">
          Zero Data Loss Protocol · End-to-End Latency &lt; 45ms
        </div>
        <div>
          2026 ColdChain Cloud Infrastructure · Telemetry Pipeline Active
        </div>
      </div>
    </footer>
  );
}

