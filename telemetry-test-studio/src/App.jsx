import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import SignalForm from './components/SignalForm';
import MassFleetActions from './components/MassFleetActions';
import SingleTruckPresets from './components/SingleTruckPresets';
import IngestionLog from './components/IngestionLog';
import Footer from './components/Footer';

export default function App() {
  const [selectedTruck, setSelectedTruck] = useState('TRK-001');
  const [logs, setLogs] = useState([]);
  const [isContinuous, setIsContinuous] = useState(false);
  const [streamMps, setStreamMps] = useState(0);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/telemetry/logs');
      if (res.ok) {
        const data = await res.json();
        if (data.logs && Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch logs:', e);
    }
  }, []);

  const checkStreamStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/telemetry/stream-status');
      if (res.ok) {
        const data = await res.json();
        setIsContinuous(data.active);
        setStreamMps(data.actual_mps || (data.active ? data.target_rate : 0));
      }
    } catch (e) {
      console.warn('Failed to check stream status:', e);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    checkStreamStatus();
    const intervalTime = isContinuous ? 1000 : 2500;
    const interval = setInterval(() => {
      fetchLogs();
      checkStreamStatus();
    }, intervalTime);
    return () => clearInterval(interval);
  }, [fetchLogs, checkStreamStatus, isContinuous]);

  // Handle single truck telemetry injection
  const handleInject = async (payload) => {
    try {
      const res = await fetch('/api/telemetry/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchLogs();
      }
    } catch (err) {
      console.error('Injection error:', err);
    }
  };

  // Handle preset for single truck
  const handleApplyPreset = async (scenarioKey) => {
    try {
      const res = await fetch('/api/telemetry/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truck_id: selectedTruck,
          scenario: scenarioKey
        })
      });
      if (res.ok) {
        fetchLogs();
      }
    } catch (err) {
      console.error('Preset error:', err);
    }
  };

  // Handle batch scenario for all 15 trucks
  const handleMassScenario = async (scenarioKey) => {
    try {
      const res = await fetch('/api/telemetry/simulate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truck_ids: [
            'TRK-001', 'TRK-002', 'TRK-003', 'TRK-004', 'TRK-005',
            'TRK-006', 'TRK-007', 'TRK-008', 'TRK-009', 'TRK-010',
            'TRK-011', 'TRK-012', 'TRK-013', 'TRK-014', 'TRK-015', 'TRK-016'
          ],
          scenario: scenarioKey
        })
      });
      if (res.ok) {
        fetchLogs();
      }
    } catch (err) {
      console.error('Mass scenario error:', err);
    }
  };

  // Toggle continuous 1,000 msg/sec backend blaster
  const toggleContinuous = async (rate = 1000) => {
    const nextState = !isContinuous;
    setIsContinuous(nextState);
    try {
      const res = await fetch('/api/telemetry/continuous-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: nextState,
          rate: rate
        })
      });
      if (res.ok) {
        const data = await res.json();
        setIsContinuous(data.active);
        setStreamMps(data.actual_mps || (data.active ? data.target_rate : 0));
        fetchLogs();
      }
    } catch (err) {
      console.error('Failed to toggle continuous stream:', err);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/telemetry/logs', { method: 'DELETE' });
      setLogs([]);
    } catch (e) {
      setLogs([]);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F0A] text-[#F5F0E1] flex flex-col font-sans">
      <Header isStreaming={isContinuous} streamMps={streamMps} />

      <main className="flex-1 max-w-[1720px] w-full mx-auto px-4 lg:px-8 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column (7 cols): Manipulate Telemetry Signals */}
          <div className="lg:col-span-7">
            <SignalForm
              selectedTruck={selectedTruck}
              onSelectTruck={setSelectedTruck}
              onInject={handleInject}
              isContinuousSimulating={isContinuous}
              streamMps={streamMps}
              onToggleContinuousSimulation={toggleContinuous}
            />
          </div>

          {/* Right Column (5 cols): Mass Actions, Presets, Ingestion Log */}
          <div className="lg:col-span-5 space-y-5">
            <MassFleetActions onApplyMassScenario={handleMassScenario} />
            <SingleTruckPresets
              selectedTruck={selectedTruck}
              onApplyPreset={handleApplyPreset}
            />
            <IngestionLog logs={logs} onClear={handleClearLogs} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
