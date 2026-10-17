import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import AnalyticsToolbar from './components/AnalyticsToolbar';
import ThermalTrendChart from './components/ThermalTrendChart';
import DoorOpenFrequencyChart from './components/DoorOpenFrequencyChart';
import ExcursionDurationChart from './components/ExcursionDurationChart';
import SpeedVsEfficiencyChart from './components/SpeedVsEfficiencyChart';
import HistoricalSummaryKPIs from './components/HistoricalSummaryKPIs';
import RootCauseAndRouteRisk from './components/RootCauseAndRouteRisk';
import RegulatoryAuditLog from './components/RegulatoryAuditLog';
import ComplianceMethodology from './components/ComplianceMethodology';
import Footer from './components/Footer';

export default function App() {
  const [activeTab, setActiveTab] = useState('temperature');
  const [selectedScope, setSelectedScope] = useState('all');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const url = selectedScope && selectedScope !== 'all'
        ? `/api/analytics?truck_id=${selectedScope}`
        : '/api/analytics';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.warn('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedScope]);

  useEffect(() => {
    setLoading(true);
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 3000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  // Render the appropriate distinct graph based on activeTab
  const renderActiveChart = () => {
    switch (activeTab) {
      case 'door':
        return (
          <DoorOpenFrequencyChart
            data={analyticsData?.chart_data?.door}
            scope={selectedScope}
          />
        );
      case 'excursion':
        return (
          <ExcursionDurationChart
            data={analyticsData?.chart_data?.excursion}
            scope={selectedScope}
          />
        );
      case 'efficiency':
        return (
          <SpeedVsEfficiencyChart
            data={analyticsData?.chart_data?.efficiency}
            scope={selectedScope}
          />
        );
      case 'temperature':
      default:
        return (
          <ThermalTrendChart
            data={analyticsData?.chart_data?.temperature}
            scope={selectedScope}
            truckMeta={analyticsData?.truck_meta}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#12100F] text-[#F5F0E1] flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-[1720px] w-full mx-auto px-4 lg:px-8 py-5 space-y-5">
        {/* Analytics Toolbar with working Scope Filter and 4 Tabs */}
        <AnalyticsToolbar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          selectedScope={selectedScope}
          onSelectScope={setSelectedScope}
          auditRecords={analyticsData?.audit_log}
        />

        {/* Dynamic Multi-Chart View (Switches between 4 completely different chart types) */}
        {renderActiveChart()}

        {/* Fleet Historical Summary (4 KPI Cards with dynamic values from stored data) */}
        <HistoricalSummaryKPIs summary={analyticsData?.summary} />

        {/* Incident Classification Donut Chart & Route Risk (Dynamically calculated from stored data) */}
        <RootCauseAndRouteRisk
          rootCauses={analyticsData?.root_causes}
          routeRisks={analyticsData?.route_risks}
          totalIncidents={analyticsData?.summary?.total_incidents_24h}
        />

        {/* Historical Regulatory Audit Log Table (Filtered by vehicle and search) */}
        <RegulatoryAuditLog
          auditRecords={analyticsData?.audit_log}
          selectedScope={selectedScope}
        />

        {/* Compliance Methodology Box */}
        <ComplianceMethodology />
      </main>

      <Footer />
    </div>
  );
}
