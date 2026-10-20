import React, { useEffect, useRef, useState } from 'react';
import { Scan, Settings, Key, Map as MapIcon, X, Check, Navigation, AlertTriangle } from 'lucide-react';
import L from 'leaflet';

const HIGHWAY_ROUTES = {
  'TRK-001': { route: 'Goa → Mumbai', corridor: 'NH 66', waypoints: [[15.4909, 73.8278], [15.8647, 73.8234], [16.1558, 73.7124], [16.9902, 73.3120], [17.5450, 73.4867], [18.2324, 73.4456], [18.7521, 73.1022], [19.0760, 72.8777]] },
  'TRK-002': { route: 'Delhi → Nagpur', corridor: 'NH 44', waypoints: [[28.6139, 77.2090], [27.4924, 77.6737], [27.1767, 78.0081], [26.2183, 78.1828], [25.4484, 78.5685], [23.8388, 78.7378], [21.8974, 77.9068], [21.1458, 79.0882]] },
  'TRK-003': { route: 'Kochi → Pondicherry', corridor: 'NH 544 / NH 79', waypoints: [[9.9312, 76.2673], [10.5276, 76.2144], [10.7867, 76.6548], [11.0168, 76.9558], [11.3410, 77.7172], [11.6643, 78.1460], [11.9416, 79.8083]] },
  'TRK-004': { route: 'Pune → Nashik', corridor: 'NH 60', waypoints: [[18.5204, 73.8567], [18.7180, 73.8820], [19.0144, 73.9450], [19.2312, 73.9780], [19.5312, 74.0210], [19.7890, 73.9120], [19.9975, 73.7898]] },
  'TRK-005': { route: 'Noida → Indore', corridor: 'NH 48 / NH 52', waypoints: [[28.5355, 77.3910], [27.1767, 78.0081], [26.2183, 78.1828], [25.4244, 77.6593], [24.6465, 77.3164], [23.7167, 76.9167], [23.1765, 75.7885], [22.7196, 75.8577]] },
  'TRK-006': { route: 'Bengaluru → Chennai', corridor: 'NH 48', waypoints: [[12.9716, 77.5946], [12.7409, 77.8253], [12.5186, 78.2137], [12.8996, 79.0967], [13.0827, 80.2707]] },
  'TRK-007': { route: 'Ahmedabad → Surat', corridor: 'NE 1 / NH 48', waypoints: [[23.0225, 72.5714], [22.6916, 72.8634], [22.3072, 73.1812], [21.7051, 72.9959], [21.1702, 72.8311]] },
  'TRK-008': { route: 'Kolkata → Bhubaneswar', corridor: 'NH 16', waypoints: [[22.5726, 88.3639], [22.4257, 87.3199], [21.9322, 86.7444], [20.9467, 86.1432], [20.2961, 85.8245]] },
  'TRK-009': { route: 'Chandigarh → Amritsar', corridor: 'NH 3 / NH 44', waypoints: [[30.7333, 76.7794], [30.9010, 75.8573], [31.3260, 75.5762], [31.6340, 74.8723]] },
  'TRK-010': { route: 'Hyderabad → Vijayawada', corridor: 'NH 65', waypoints: [[17.3850, 78.4867], [17.0544, 79.2671], [16.9891, 80.0031], [16.7850, 80.8450], [16.5062, 80.6480]] },
  'TRK-011': { route: 'Jaipur → Agra', corridor: 'NH 21', waypoints: [[26.9124, 75.7873], [26.9880, 76.3540], [27.0560, 76.9980], [27.1767, 78.0081]] },
  'TRK-012': { route: 'Lucknow → Varanasi', corridor: 'Purvanchal Expy', waypoints: [[26.8467, 80.9462], [26.2637, 82.0726], [26.1445, 82.5712], [25.3176, 82.9739]] },
  'TRK-013': { route: 'Guwahati → Shillong', corridor: 'NH 6', waypoints: [[26.1445, 91.7362], [25.9080, 91.8670], [25.6890, 91.9050], [25.5788, 91.8933]] },
  'TRK-014': { route: 'Bhopal → Jabalpur', corridor: 'NH 45', waypoints: [[23.2599, 77.4126], [23.0850, 78.2120], [23.1230, 79.1450], [23.1815, 79.9864]] },
  'TRK-015': { route: 'Mangaluru → Udupi', corridor: 'NH 66', waypoints: [[12.9141, 74.8560], [13.0980, 74.7920], [13.2240, 74.7650], [13.3409, 74.7421]] },
  'TRK-016': { route: 'Pune → Mumbai', corridor: 'Mumbai-Pune Expy', waypoints: [[18.5204, 73.8567], [18.7521, 73.4022], [18.9890, 73.1120], [19.0760, 72.8777]] },
};

export default function FleetMap({ trucks = [], onSelectTruck, selectedTruckId }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef({});
  const routesRef = useRef({});

  // Map settings state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState(() => localStorage.getItem('coldchain_maps_api_key') || '');
  const [mapProvider, setMapProvider] = useState(() => localStorage.getItem('coldchain_map_provider') || 'carto_dark');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [21.5, 79.5],
      zoom: 5,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false
    });

    // Helper to get tile layer URL
    const createTileLayer = (provider, key) => {
      if (key && (provider === 'google_roadmap' || provider === 'google_hybrid' || provider === 'google_terrain')) {
        const typeMap = {
          google_roadmap: 'm',
          google_hybrid: 'y',
          google_terrain: 'p'
        };
        const lyrs = typeMap[provider] || 'm';
        return L.tileLayer(`https://mt1.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}&key=${key}`, {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        });
      }
      // High-performance Charcoal Dark Matter default
      return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      });
    };

    const initialLayer = createTileLayer(mapProvider, mapsApiKey);
    initialLayer.addTo(map);
    tileLayerRef.current = initialLayer;

    // Zoom controls in bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Draw Highway Route Polylines
    Object.entries(HIGHWAY_ROUTES).forEach(([tid, routeInfo]) => {
      const polyline = L.polyline(routeInfo.waypoints, {
        color: '#D97706',
        weight: 2.5,
        opacity: 0.35,
        dashArray: '4, 6',
        smoothFactor: 1.0
      }).addTo(map);

      polyline.on('click', () => {
        if (onSelectTruck) onSelectTruck(tid);
      });

      routesRef.current[tid] = polyline;
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Tile Layer if provider or API key changes
  const applyTileLayer = (provider, key) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let newLayer;
    if (key && (provider === 'google_roadmap' || provider === 'google_hybrid' || provider === 'google_terrain')) {
      const typeMap = {
        google_roadmap: 'm',
        google_hybrid: 'y',
        google_terrain: 'p'
      };
      const lyrs = typeMap[provider] || 'm';
      newLayer = L.tileLayer(`https://mt1.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}&key=${key}`, {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
      });
    } else {
      newLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      });
    }

    newLayer.addTo(map);
    tileLayerRef.current = newLayer;
  };

  // Save Settings Modal
  const handleSaveSettings = () => {
    localStorage.setItem('coldchain_maps_api_key', mapsApiKey.trim());
    localStorage.setItem('coldchain_map_provider', mapProvider);
    applyTileLayer(mapProvider, mapsApiKey.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setShowSettingsModal(false);
    }, 800);
  };

  // Highlight selected truck route
  useEffect(() => {
    Object.entries(routesRef.current).forEach(([tid, polyline]) => {
      if (tid === selectedTruckId) {
        polyline.setStyle({
          color: '#F59E0B',
          weight: 4.5,
          opacity: 0.95,
          dashArray: null
        });
        polyline.bringToFront();
      } else {
        polyline.setStyle({
          color: '#D97706',
          weight: 2.5,
          opacity: 0.35,
          dashArray: '4, 6'
        });
      }
    });
  }, [selectedTruckId]);

  // Synchronize Markers & Gliding Positions
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !trucks || trucks.length === 0) return;

    trucks.forEach((truck) => {
      const tid = truck.truck_id;
      const lat = truck.lat;
      const lon = truck.lon;
      if (lat === undefined || lon === undefined) return;

      const status = truck.status || 'OK';
      const isSelected = selectedTruckId === tid;

      let color = '#22C55E';
      let glow = 'rgba(34, 197, 94, 0.4)';
      if (status === 'ALERT') {
        color = '#EF4444';
        glow = 'rgba(239, 68, 68, 0.6)';
      } else if (status === 'WARNING') {
        color = '#F59E0B';
        glow = 'rgba(245, 158, 11, 0.5)';
      } else if (status === 'NO_SIGNAL') {
        color = '#8B8882';
        glow = 'rgba(139, 136, 130, 0.3)';
      }

      const routeInfo = HIGHWAY_ROUTES[tid] || {};

      const iconHtml = `
        <div class="truck-marker-wrapper" style="
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
        ">
          ${status === 'ALERT' ? `<div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: ${color}; opacity: 0.4; animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>` : ''}
          <div style="
            width: ${isSelected ? '26px' : '20px'};
            height: ${isSelected ? '26px' : '20px'};
            border-radius: 50%;
            background: ${color};
            border: 2px solid #FFFFFF;
            box-shadow: 0 0 14px ${glow};
            display: flex;
            align-items: center;
            justify-content: center;
            color: #12100F;
            font-weight: 800;
            font-size: 8.5px;
            font-family: monospace;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          ">
            ${tid.replace('TRK-', '')}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'truck-marker-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      if (!markersRef.current[tid]) {
        const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
        marker.on('click', () => {
          if (onSelectTruck) onSelectTruck(tid);
        });
        markersRef.current[tid] = marker;
      } else {
        // Smoothly glide marker to new coordinates
        markersRef.current[tid].setLatLng([lat, lon]);
        markersRef.current[tid].setIcon(customIcon);
      }

      // Rich status popup
      const popupContent = `
        <div style="padding: 6px; font-family: Inter, sans-serif; min-width: 170px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 800; font-size: 13px; color: #F5E6D3;">${tid}</span>
            <span style="font-size: 9px; font-weight: bold; padding: 2px 5px; border-radius: 3px; background: ${color}22; color: ${color}; border: 1px solid ${color}66;">
              ${status}
            </span>
          </div>
          <div style="font-size: 11px; color: #B8B5AF; margin-bottom: 2px;">
            <span style="color: #F59E0B; font-weight: 600;">${routeInfo.corridor || 'Highway'}</span> · ${routeInfo.route || 'Transit'}
          </div>
          <div style="font-size: 11px; color: #B8B5AF; margin-bottom: 5px;">
            Cargo: <span style="font-weight: 700; color: ${color};">${truck.cargo_temp_c ?? '--'}°C</span> (SP: ${truck.setpoint_c ?? '--'}°C)
          </div>
          <div style="font-size: 10px; color: #8A7A6A; display: flex; justify-content: space-between; border-top: 1px solid #3A2B20; pt: 4px;">
            <span>Door: <b style="color: ${truck.door_open ? '#EF4444' : '#22C55E'}">${truck.door_open ? 'OPEN' : 'CLOSED'}</b></span>
            <span>Speed: <b>${truck.speed_kmph ?? 0} km/h</b></span>
          </div>
        </div>
      `;
      markersRef.current[tid].bindPopup(popupContent);
    });
  }, [trucks, selectedTruckId, onSelectTruck]);

  const fitFleet = () => {
    const map = mapInstanceRef.current;
    if (!map || trucks.length === 0) return;
    const validTrucks = trucks.filter(t => t.lat !== undefined && t.lon !== undefined);
    if (validTrucks.length === 0) return;
    const bounds = L.latLngBounds(validTrucks.map(t => [t.lat, t.lon]));
    map.fitBounds(bounds, { padding: [40, 40] });
  };

  return (
    <div className="bg-[#1A140D] border border-[#3A2B20] rounded-lg overflow-hidden text-[#F5F0E1] shadow-sm select-none relative">
      <style>{`
        .truck-marker-icon {
          transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .leaflet-popup-content-wrapper {
          background: #1A140D !important;
          border: 1px solid #3A2B20 !important;
          color: #F5F0E1 !important;
          border-radius: 6px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.6) !important;
        }
        .leaflet-popup-tip {
          background: #1A140D !important;
          border: 1px solid #3A2B20 !important;
        }
      `}</style>

      {/* Map Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3A2B20] bg-[#1A140D]">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-[#F59E0B]" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5E6D3]">
              Live Highway Telemetry Map
            </h3>
            <p className="text-[11px] text-[#B8B5AF]">
              India transport corridors · 15 active GPS routes with live motion
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Map Provider / API Key Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#1A1A1A] hover:bg-[#2A2116] border border-[#3A2B20] text-[#B8B5AF] hover:text-[#F5F0E1] transition-colors"
            title="Configure Map Provider and Google Maps API Key"
          >
            <Key className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Map Key / Layer</span>
          </button>

          {/* Fit Fleet Viewport */}
          <button
            onClick={fitFleet}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#1A1A1A] hover:bg-[#2A2116] border border-[#3A2B20] text-[#B8B5AF] hover:text-[#F5F0E1] transition-colors"
          >
            <Scan className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Fit Fleet</span>
          </button>
        </div>
      </div>

      {/* Map Viewport */}
      <div className="relative w-full h-[360px] lg:h-[430px] bg-[#12100F]">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Live Motion Indicator Badge */}
        <div className="absolute top-3 left-3 bg-[#1A140D]/90 backdrop-blur-md border border-[#3A2B20] rounded px-2.5 py-1 text-[10.5px] font-mono text-[#F5E6D3] flex items-center gap-2 z-[1000]">
          <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-ping"></span>
          <span>LIVE HIGHWAY RADAR ACTIVE</span>
          {mapProvider.startsWith('google') && mapsApiKey && (
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#C2410C]/40 text-[#FDBA74] border border-[#EA580C]/40 font-sans font-bold">
              GOOGLE TILES
            </span>
          )}
        </div>

        {/* Map Legend Overlay */}
        <div className="absolute bottom-3 left-3 bg-[#1A140D]/90 backdrop-blur-sm border border-[#3A2B20] rounded px-3 py-2 text-[11px] flex items-center gap-4 z-[1000] text-[#B8B5AF]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]"></span>
            <span>Optimal (OK)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span>
            <span>Warning (≥2.0°C)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]"></span>
            <span>Critical Excursion</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-[#F59E0B]"></span>
            <span>Highway Corridors</span>
          </div>
        </div>
      </div>

      {/* Map Settings & Google Maps API Key Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[2000]">
          <div className="bg-[#1A140D] border border-[#3A2B20] rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#3A2B20] pb-3">
              <div className="flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-[#F59E0B]" />
                <h3 className="text-sm font-bold text-[#F5E6D3]">Map Basemap & Google Maps API Key</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-[#8A7A6A] hover:text-[#F5F0E1] p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#F5E6D3] block mb-1">
                  Basemap Provider
                </label>
                <select
                  value={mapProvider}
                  onChange={(e) => setMapProvider(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#12100F] border border-[#3A2B20] text-xs text-[#F5F0E1] focus:outline-none focus:border-[#F59E0B]"
                >
                  <option value="carto_dark">CartoDB Dark Matter (High Contrast Charcoal - Default)</option>
                  <option value="google_hybrid">Google Maps Satellite Hybrid</option>
                  <option value="google_roadmap">Google Maps Vector Roadmap</option>
                  <option value="google_terrain">Google Maps Terrain</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#F5E6D3] block mb-1">
                  Google Maps API Key {mapProvider.startsWith('google') && <span className="text-[#F59E0B]">*</span>}
                </label>
                <input
                  type="text"
                  placeholder="AIzaSy..."
                  value={mapsApiKey}
                  onChange={(e) => setMapsApiKey(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#12100F] border border-[#3A2B20] font-mono text-xs text-[#F5F0E1] focus:outline-none focus:border-[#F59E0B]"
                />
                <p className="text-[11px] text-[#8A7A6A] mt-1.5 leading-relaxed">
                  Keys are stored locally in your browser’s <code className="text-[#F59E0B]">localStorage</code>. If no key is provided, the high-performance Charcoal Dark Matter basemap is used seamlessly.
                </p>
              </div>

              {mapProvider.startsWith('google') && !mapsApiKey && (
                <div className="p-2.5 rounded bg-[#2A1B0E] border border-[#D97706]/40 flex items-start gap-2 text-xs text-[#FBBF24]">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#F59E0B] mt-0.5" />
                  <span>Please provide your Google Maps API Key to render Google tiles, or choose CartoDB Dark Matter.</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#3A2B20]">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-3 py-1.5 rounded text-xs font-medium bg-[#12100F] border border-[#3A2B20] text-[#B8B5AF] hover:text-[#F5F0E1]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold bg-[#D97706] hover:bg-[#B45309] text-white shadow-md transition-colors"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <span>Save & Apply</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
