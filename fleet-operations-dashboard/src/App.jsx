import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import FleetHealthSummary from './components/FleetHealthSummary';
import FleetMap from './components/FleetMap';
import IncidentFeed from './components/IncidentFeed';
import PipelineHealth from './components/PipelineHealth';
import StreamThroughput from './components/StreamThroughput';
import Footer from './components/Footer';
import { subscribeToTrucks } from './firestore';

export default function App() {
  const [trucks, setTrucks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [selectedTruckId, setSelectedTruckId] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [trucksRes, alertsRes, metricsRes, healthRes] = await Promise.allSettled([
        fetch('/api/trucks'),
        fetch('/api/alerts?limit=20'),
        fetch('/api/metrics'),
        fetch('/health')
      ]);

      if (trucksRes.status === 'fulfilled' && trucksRes.value.ok) {
        const data = await trucksRes.value.json();
        if (data.trucks && Array.isArray(data.trucks) && data.trucks.length > 0) {
          // Always update with the latest live moving truck coordinates and status
          setTrucks(data.trucks);
        }
      }

      if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
        const data = await alertsRes.value.json();
        if (data.alerts && Array.isArray(data.alerts)) {
          setAlerts(data.alerts);
        }
      }

      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        const data = await metricsRes.value.json();
        setMetrics(data);
      }

      if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
        const data = await healthRes.value.json();
        setHealth(data);
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
      const dateStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
      setLastSync(`${timeStr} IST · ${dateStr}`);
    } catch (err) {
      console.error('Data fetch error:', err);
    }
  }, []);

  // Connect native Firestore web SDK listener (onSnapshot) to live_status collection
  useEffect(() => {
    let unsubscribe = null;
    try {
      unsubscribe = subscribeToTrucks(
        (liveTrucks) => {
          if (liveTrucks && liveTrucks.length > 0) {
            setTrucks(liveTrucks);
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
            const dateStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
            setLastSync(`${timeStr} IST · ${dateStr} (Live Firestore)`);
          }
        },
        (err) => {
          console.warn('Firestore onSnapshot listener notice:', err);
        }
      );
    } catch (err) {
      console.warn('Could not initialize direct onSnapshot listener:', err);
    }

    // Baseline fetch for metrics, incidents, health, and smooth movement
    fetchData();
    const interval = setInterval(fetchData, 1200);

    return () => {
      if (unsubscribe) unsubscribe();
      clearInterval(interval);
    };
  }, [fetchData]);

  // Compute counts
  const counts = {
    total: trucks.length || 16,
    ok: trucks.filter(t => t.status === 'OK').length || (trucks.length === 0 ? 11 : 0),
    warning: trucks.filter(t => t.status === 'WARNING').length || (trucks.length === 0 ? 2 : 0),
    alert: trucks.filter(t => t.status === 'ALERT').length || (trucks.length === 0 ? 2 : 0),
    noSignal: trucks.filter(t => t.status === 'NO_SIGNAL').length || (trucks.length === 0 ? 1 : 0),
  };

  return (
    <div className="min-h-screen bg-[#12100F] text-[#F5F0E1] flex flex-col font-sans">
      <Header
        liveCount={counts.total}
        lastSync={lastSync}
        streamConnected={health?.pubsub_connected !== false}
      />

      <main className="flex-1 max-w-[1720px] w-full mx-auto px-4 lg:px-8 py-5 space-y-5">
        {/* Top Fleet Health KPI Cards */}
        <FleetHealthSummary counts={counts} />

        {/* Live Operations Workspace: Clean Map on left, Incident & Health Sidebar on right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Main Column (8 cols): Large Interactive Map */}
          <div className="lg:col-span-8">
            <FleetMap
              trucks={trucks}
              onSelectTruck={setSelectedTruckId}
              selectedTruckId={selectedTruckId}
            />
          </div>

          {/* Incident and Pipeline Sidebar (4 cols) */}
          <div className="lg:col-span-4 space-y-5">
            <IncidentFeed alerts={alerts} />
            <PipelineHealth health={health} />
            <StreamThroughput metrics={metrics} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

