import React, { useState, useEffect } from 'react';
import { RefreshCw, ShieldCheck, Truck, ChevronDown, Play, Square, Send, Radio, MapPin } from 'lucide-react';

const VEHICLES = [
  { id: 'TRK-001', route: 'Goa → Mumbai', type: 'Chilled', sp: 4.0, lat: 15.4909, lon: 73.8278 },
  { id: 'TRK-002', route: 'Mumbai → Pune', type: 'Chilled', sp: 4.0, lat: 28.6139, lon: 77.2090 },
  { id: 'TRK-003', route: 'Kochi → Pondicherry', type: 'Frozen', sp: -18.0, lat: 9.9312, lon: 76.2673 },
  { id: 'TRK-004', route: 'Delhi → Jaipur', type: 'Chilled', sp: 4.0, lat: 18.5204, lon: 73.8567 },
  { id: 'TRK-005', route: 'Ahmedabad → Mumbai', type: 'Frozen', sp: 2.0, lat: 28.5355, lon: 77.3910 },
  { id: 'TRK-006', route: 'Bengaluru → Chennai', type: 'Chilled', sp: 4.0, lat: 12.9716, lon: 77.5946 },
  { id: 'TRK-007', route: 'Pune → Hyderabad', type: 'Chilled', sp: 3.0, lat: 23.0225, lon: 72.5714 },
  { id: 'TRK-008', route: 'Nagpur → Hyderabad', type: 'Frozen', sp: -20.0, lat: 22.5726, lon: 88.3639 },
  { id: 'TRK-009', route: 'Indore → Ahmedabad', type: 'Chilled', sp: 5.0, lat: 30.7333, lon: 76.7794 },
  { id: 'TRK-010', route: 'Chennai → Vijayawada', type: 'Frozen', sp: 4.0, lat: 17.3850, lon: 78.4867 },
  { id: 'TRK-011', route: 'Delhi → Lucknow', type: 'Chilled', sp: 4.0, lat: 26.9124, lon: 75.7873 },
  { id: 'TRK-012', route: 'Jaipur → Indore', type: 'Frozen', sp: 2.0, lat: 26.8467, lon: 80.9462 },
  { id: 'TRK-013', route: 'Guwahati → Shillong', type: 'Chilled', sp: -18.0, lat: 26.1445, lon: 91.7362 },
  { id: 'TRK-014', route: 'Bhopal → Jabalpur', type: 'Frozen', sp: 4.0, lat: 23.2599, lon: 77.4126 },
  { id: 'TRK-015', route: 'Mangaluru → Udupi', type: 'Frozen', sp: -22.0, lat: 12.9141, lon: 74.8560 },
];

const CITY_PRESETS = [
  { name: 'Goa', lat: 15.4909, lon: 73.8278 },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { name: 'Pune', lat: 18.5204, lon: 73.8567 },
  { name: 'Delhi', lat: 28.6139, lon: 77.2090 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Hyderabad', lat: 17.3850, lon: 78.4867 },
];

export default function SignalForm({
  selectedTruck,
  onSelectTruck,
  onInject,
  isContinuousSimulating,
  streamMps = 0,
  onToggleContinuousSimulation
}) {
  const currentVehicle = VEHICLES.find(v => v.id === selectedTruck) || VEHICLES[0];

  const [temp, setTemp] = useState(4.2);
  const [setpoint, setSetpoint] = useState(4.0);
  const [doorOpen, setDoorOpen] = useState(false);
  const [speed, setSpeed] = useState(62.0);
  const [fuel, setFuel] = useState(85.0);
  const [blastRate, setBlastRate] = useState(1000);
  const [lat, setLat] = useState(currentVehicle.lat);
  const [lon, setLon] = useState(currentVehicle.lon);
  const [showDropdown, setShowDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Update setpoint when truck changes
  useEffect(() => {
    setSetpoint(currentVehicle.sp);
    setTemp(currentVehicle.sp > 0 ? currentVehicle.sp + 0.2 : currentVehicle.sp + 0.1);
    setLat(currentVehicle.lat);
    setLon(currentVehicle.lon);
  }, [currentVehicle]);

  const excess = (temp - setpoint).toFixed(1);
  const excessNum = parseFloat(excess);

  const getExcessBadge = () => {
    if (excessNum >= 5.0 || (doorOpen && excessNum >= 2.0)) {
      return (
        <span className="text-xs font-mono font-bold text-[#EF4444] bg-[#2A0A0A] border border-[#7F1D1D] px-2 py-0.5 rounded">
          +{excess}°C · CRITICAL EXCURSION
        </span>
      );
    }
    if (excessNum >= 2.0) {
      return (
        <span className="text-xs font-mono font-semibold text-[#F59E0B] bg-[#3B2B16] border border-[#A16207] px-2 py-0.5 rounded">
          +{excess}°C · WARNING
        </span>
      );
    }
    return (
      <span className="text-xs font-mono font-semibold text-[#34D399] bg-[#132A10] border border-[#22C55E]/40 px-2 py-0.5 rounded">
        +{excess}°C · OPTIMAL
      </span>
    );
  };

  const handlePrefill = async () => {
    try {
      const res = await fetch('/api/trucks');
      if (res.ok) {
        const data = await res.json();
        const found = data.trucks?.find(t => t.truck_id === selectedTruck);
        if (found) {
          setTemp(found.cargo_temp_c ?? 4.0);
          setSetpoint(found.setpoint_c ?? 4.0);
          setDoorOpen(found.door_open ?? false);
          setSpeed(found.speed_kmph ?? 60.0);
          setFuel(found.fuel_pct ?? 85.0);
          if (found.lat) setLat(found.lat);
          if (found.lon) setLon(found.lon);
        }
      }
    } catch (e) {
      console.warn('Prefill error:', e);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setSubmitting(true);
    try {
      await onInject({
        truck_id: selectedTruck,
        cargo_temp_c: parseFloat(temp),
        setpoint_c: parseFloat(setpoint),
        door_open: doorOpen,
        speed_kmph: parseFloat(speed),
        fuel_pct: parseFloat(fuel),
        lat: parseFloat(lat),
        lon: parseFloat(lon),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#111810] border border-[#2A3324] rounded-lg text-[#F5F0E1] overflow-hidden shadow-sm select-none">
      {/* Heading */}
      <div className="bg-[#0A0F0A] border-b border-[#2A3324] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-[#F5F0E1]">
            Manipulate Telemetry Signals
          </h2>
          <p className="text-xs text-[#A8B3A0]">
            Build a synthetic payload and publish to the sandbox.
          </p>
        </div>
        <button
          type="button"
          onClick={handlePrefill}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#151A14] hover:bg-[#1A1F16] border border-[#2A3324] text-[#F5F0E1] transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#34D399]" />
          <span>Pre-fill Current Values</span>
        </button>
      </div>

      {/* Simulation Environment Notice */}
      <div className="bg-[#132A10] border-b border-[#2A3324] px-4 py-2 flex items-center gap-2 text-xs text-[#34D399]">
        <ShieldCheck className="w-4 h-4 shrink-0 text-[#34D399]" />
        <span>Isolated test environment · topic coldchain.telemetry.sandbox · fictional drivers</span>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* Section 01: Target Vehicle */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#0B2A1B] text-[#22C55E] font-mono text-[10px] font-bold flex items-center justify-center">
                01
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[#B8B5AF]">
                Target vehicle
              </span>
            </div>
            <span className="text-[11px] text-[#8A7A6A]">15 registered vehicles</span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-between p-3 rounded bg-[#151A14] border border-[#2A3324] text-xs font-mono hover:border-[#34D399] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4 text-[#F59E0B]" />
                <span className="font-bold text-[#F5F0E1]">{currentVehicle.id}</span>
                <span className="text-[#A8B3A0]">· {currentVehicle.route} — {currentVehicle.type} ({currentVehicle.sp}°C)</span>
              </div>
              <ChevronDown className="w-4 h-4 text-[#A8B3A0]" />
            </button>

            {showDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#151A14] border border-[#2A3324] rounded-md shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-[#2A3324]">
                {VEHICLES.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => {
                      onSelectTruck(v.id);
                      setShowDropdown(false);
                    }}
                    className={`p-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-[#1A1F16] transition-colors ${
                      v.id === selectedTruck ? 'bg-[#132A10] text-[#34D399]' : 'text-[#B8B5AF]'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold">{v.id}</span>
                      <span className="text-[11px] text-[#8A7A6A]">({v.type} {v.sp}°C)</span>
                    </div>
                    <div className="text-[11px] text-[#A8B3A0]">{v.route}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 02: Thermal Control */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-5 h-5 rounded-full bg-[#0B2A1B] text-[#22C55E] font-mono text-[10px] font-bold flex items-center justify-center">
              02
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#B8B5AF]">
              Thermal control
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Cargo Temperature */}
            <div className="bg-[#151A14] border border-[#2A3324] rounded p-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-[#A8B3A0]">Cargo Temperature (°C)</span>
                <input
                  type="number"
                  step="0.1"
                  value={temp}
                  onChange={(e) => setTemp(parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 rounded bg-[#0A0F0A] border border-[#2A3324] text-right font-mono font-bold text-[#F5F0E1] text-xs focus:outline-none focus:border-[#34D399]"
                />
              </div>
              <input
                type="range"
                min="-30"
                max="30"
                step="0.5"
                value={temp}
                onChange={(e) => setTemp(parseFloat(e.target.value))}
                className="w-full accent-[#D97706] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8A7A6A] font-mono mt-1">
                <span>-25°C</span>
                <span>-18°C</span>
                <span>0°C</span>
                <span>+4°C</span>
                <span>+25°C</span>
              </div>
            </div>

            {/* Commanded Setpoint */}
            <div className="bg-[#151A14] border border-[#2A3324] rounded p-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-[#A8B3A0]">Commanded Setpoint (°C)</span>
                <input
                  type="number"
                  step="0.5"
                  value={setpoint}
                  onChange={(e) => setSetpoint(parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 rounded bg-[#0A0F0A] border border-[#2A3324] text-right font-mono font-bold text-[#F5F0E1] text-xs focus:outline-none focus:border-[#34D399]"
                />
              </div>
              <input
                type="range"
                min="-30"
                max="15"
                step="0.5"
                value={setpoint}
                onChange={(e) => setSetpoint(parseFloat(e.target.value))}
                className="w-full accent-[#34D399] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8A7A6A] font-mono mt-1">
                <span>-30°C</span>
                <span>-18°C</span>
                <span>0°C</span>
                <span>+4°C</span>
                <span>+15°C</span>
              </div>
            </div>
          </div>

          {/* Calculated Deviation Badge */}
          <div className="mt-2.5 p-2 rounded bg-[#151A14] border border-[#2A3324] flex items-center justify-between">
            <span className="text-xs text-[#A8B3A0]">Calculated excess temperature</span>
            {getExcessBadge()}
          </div>
        </div>

        {/* Section 03: Vehicle Sensor State */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-5 h-5 rounded-full bg-[#0B2A1B] text-[#22C55E] font-mono text-[10px] font-bold flex items-center justify-center">
              03
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#B8B5AF]">
              Vehicle sensor state
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Door Switch */}
            <div className="bg-[#151A14] border border-[#2A3324] rounded p-3 flex flex-col justify-between">
              <span className="text-xs text-[#A8B3A0] mb-2">Door State</span>
              <button
                type="button"
                onClick={() => setDoorOpen(!doorOpen)}
                className={`w-full py-2 rounded text-xs font-bold font-mono transition-colors ${
                  doorOpen
                    ? 'bg-[#2A0A0A] border border-[#7F1D1D] text-[#FB7185]'
                    : 'bg-[#132A10] border border-[#2A3324] text-[#34D399]'
                }`}
              >
                {doorOpen ? '⚠️ OPEN (BREACH)' : 'CLOSED'}
              </button>
            </div>

            {/* Speed Control */}
            <div className="bg-[#151A14] border border-[#2A3324] rounded p-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[#A8B3A0]">Speed (km/h)</span>
                <span className="font-mono font-bold text-[#F5F0E1]">{speed}</span>
              </div>
              <input
                type="range"
                min="0"
                max="120"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-[#F59E0B] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8A7A6A] font-mono mt-1">
                <span>0</span>
                <span>60</span>
                <span>120</span>
              </div>
            </div>

            {/* Fuel Level */}
            <div className="bg-[#151A14] border border-[#2A3324] rounded p-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[#A8B3A0]">Fuel (%)</span>
                <span className="font-mono font-bold text-[#F5F0E1]">{fuel}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={fuel}
                onChange={(e) => setFuel(parseFloat(e.target.value))}
                className="w-full accent-[#34D399] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8A7A6A] font-mono mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 04: GPS Coordinates */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#0B2A1B] text-[#22C55E] font-mono text-[10px] font-bold flex items-center justify-center">
                04
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[#B8B5AF]">
                GPS coordinates
              </span>
            </div>
            <span className="text-[11px] text-[#8A7A6A]">Corridor position</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className="text-[11px] text-[#A8B3A0] mb-1 block">Latitude</label>
              <input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 rounded bg-[#151A14] border border-[#2A3324] font-mono text-xs text-[#F5F0E1] focus:outline-none focus:border-[#34D399]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#A8B3A0] mb-1 block">Longitude</label>
              <input
                type="number"
                step="0.0001"
                value={lon}
                onChange={(e) => setLon(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 rounded bg-[#151A14] border border-[#2A3324] font-mono text-xs text-[#F5F0E1] focus:outline-none focus:border-[#34D399]"
              />
            </div>
          </div>

          {/* Quick city jump presets */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[11px] text-[#8A7A6A] mr-1">Jump to:</span>
            {CITY_PRESETS.map((city) => (
              <button
                key={city.name}
                type="button"
                onClick={() => {
                  setLat(city.lat);
                  setLon(city.lon);
                }}
                className="px-2 py-0.5 rounded text-[11px] bg-[#151A14] hover:bg-[#1A1F16] border border-[#2A3324] text-[#A8B3A0] hover:text-[#F5F0E1] transition-colors"
              >
                {city.name}
              </button>
            ))}
          </div>
        </div>

        {/* Section 05: Submission Actions & 1,000 msg/s Kafka Blaster */}
        <div className="pt-3 border-t border-[#2A3324] space-y-3">
          {/* Target Rate Selector */}
          <div className="flex items-center justify-between text-xs bg-[#151A14] px-3 py-2 rounded border border-[#2A3324]">
            <span className="text-[#A8B3A0] font-medium text-[11px]">Blaster Target Rate:</span>
            <div className="flex items-center gap-1.5">
              {[1000, 500, 250, 100].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setBlastRate(rate)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                    blastRate === rate
                      ? 'bg-[#D97706] text-white font-bold'
                      : 'bg-[#0A0F0A] text-[#A8B3A0] hover:text-[#F5F0E1] border border-[#2A3324]'
                  }`}
                >
                  {rate} msg/s
                </button>
              ))}
            </div>
          </div>

          {/* Continuous Blaster Toggle */}
          <button
            type="button"
            onClick={() => onToggleContinuousSimulation(blastRate)}
            className={`w-full py-3.5 px-4 rounded-md text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all ${
              isContinuousSimulating
                ? 'bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-[#EF4444]/30 animate-pulse'
                : 'bg-[#D97706] hover:bg-[#B45309] text-white shadow-[#D97706]/30'
            }`}
          >
            {isContinuousSimulating ? (
              <>
                <Square className="w-4 h-4 fill-white" />
                <span>Stop High-Velocity Stream (Active: {streamMps ? streamMps.toFixed(0) : blastRate} msg/s)</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>⚡ Blast High-Velocity Stream ({blastRate.toLocaleString()} msg/sec to Kafka)</span>
              </>
            )}
          </button>

          {/* Single Truck Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="submit"
              disabled={submitting}
              className="py-2 px-3 rounded bg-[#151A14] hover:bg-[#1A1F16] border border-[#2A3324] text-xs font-semibold text-[#FCD34D] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ping Selected Truck</span>
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              className="py-2 px-3 rounded bg-[#151A14] hover:bg-[#1A1F16] border border-[#2A3324] text-xs font-semibold text-[#FCD34D] flex items-center justify-center gap-1.5 transition-colors"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Inject Single Point</span>
            </button>
          </div>

          {/* Status footer */}
          <div className="flex items-center justify-between text-[11px] text-[#A8B3A0] pt-1 font-mono">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isContinuousSimulating ? 'bg-[#EF4444] animate-ping' : 'bg-[#22C55E]'}`}></span>
              <span className={isContinuousSimulating ? 'text-[#FCA5A5] font-bold' : 'text-[#34D399]'}>
                {isContinuousSimulating
                  ? `⚡ KAFKA STRESS ACTIVE: ${streamMps ? streamMps.toFixed(0) : blastRate} msg/s`
                  : 'STREAM ENGINE IDLE'}
              </span>
            </div>
            <span>TARGET TOPIC: truck-telemetry</span>
          </div>
        </div>
      </form>
    </div>
  );
}

