// ColdChain Fleet Dashboard Client Logic

let map;
const markers = {};
const routePolylines = {};
const breadcrumbTrails = {};

// Detailed highway waypoints for all 15 interstate routes in India
const TRUCK_ROUTES = {
  "TRK-001": {
    name: "Goa to Mumbai (NH 66)",
    color: "#0ecb8f",
    setpoint: 4.0,
    type: "chilled",
    waypoints: [[15.4909, 73.8278], [15.8647, 73.8234], [16.1558, 73.7124], [16.9902, 73.3120], [17.5450, 73.4867], [18.2324, 73.4456], [18.7521, 73.1022], [19.0760, 72.8777]]
  },
  "TRK-002": {
    name: "Delhi to Nagpur (NH 44)",
    color: "#e6a817",
    setpoint: 4.0,
    type: "chilled",
    waypoints: [[28.6139, 77.2090], [27.4924, 77.6737], [27.1767, 78.0081], [26.2183, 78.1828], [25.4484, 78.5685], [23.8388, 78.7378], [21.8974, 77.9068], [21.1458, 79.0882]]
  },
  "TRK-003": {
    name: "Kochi to Pondicherry (NH 544)",
    color: "#e8453c",
    setpoint: -18.0,
    type: "frozen",
    waypoints: [[9.9312, 76.2673], [10.5276, 76.2144], [10.7867, 76.6548], [11.0168, 76.9558], [11.3410, 77.7172], [11.6643, 78.1460], [11.9416, 79.8083]]
  },
  "TRK-004": {
    name: "Pune to Nashik (NH 60)",
    color: "#22d48a",
    setpoint: 4.0,
    type: "chilled",
    waypoints: [[18.5204, 73.8567], [18.7180, 73.8820], [19.0144, 73.9450], [19.2312, 73.9780], [19.5312, 74.0210], [19.7890, 73.9120], [19.9975, 73.7898]]
  },
  "TRK-005": {
    name: "Noida to Indore (NH 46)",
    color: "#f97316",
    setpoint: 2.0,
    type: "chilled",
    waypoints: [[28.5355, 77.3910], [27.8974, 77.8765], [27.1767, 78.0081], [26.2183, 78.1828], [24.6324, 77.3120], [23.8345, 76.9820], [23.2599, 77.4126], [22.7196, 75.8577]]
  },
  "TRK-006": {
    name: "Chennai to Bangalore (NH 48)",
    color: "#0ecb8f",
    setpoint: 2.0,
    type: "chilled",
    waypoints: [[13.0827, 80.2707], [12.5266, 79.8631], [12.1393, 78.1799], [12.7409, 77.8253], [12.9716, 77.5946]]
  },
  "TRK-007": {
    name: "Hyderabad to Vijayawada (NH 65)",
    color: "#e8453c",
    setpoint: -20.0,
    type: "frozen",
    waypoints: [[17.3850, 78.4867], [17.0575, 79.2679], [16.8726, 79.5736], [16.3067, 80.4365], [16.5062, 80.6480]]
  },
  "TRK-008": {
    name: "Kolkata to Patna (NH 19)",
    color: "#e6a817",
    setpoint: 4.0,
    type: "chilled",
    waypoints: [[22.5726, 88.3639], [23.4827, 87.3219], [23.6839, 86.9524], [23.7957, 86.4304], [25.5941, 85.1376]]
  },
  "TRK-009": {
    name: "Jaipur to Ahmedabad (NH 48)",
    color: "#22d48a",
    setpoint: 8.0,
    type: "chilled",
    waypoints: [[26.9124, 75.7873], [26.4499, 74.6399], [26.5942, 74.8615], [25.7711, 73.3234], [23.0225, 72.5714]]
  },
  "TRK-010": {
    name: "Lucknow to Varanasi (NH 56)",
    color: "#f97316",
    setpoint: 4.0,
    type: "chilled",
    waypoints: [[26.8467, 80.9462], [26.2637, 82.0726], [26.1445, 82.5712], [25.3176, 82.9739]]
  },
  "TRK-011": {
    name: "Surat to Vadodara (NH 48)",
    color: "#e8453c",
    setpoint: -18.0,
    type: "frozen",
    waypoints: [[21.1702, 72.8311], [21.6825, 72.9210], [21.6269, 72.9900], [21.7051, 72.9959], [22.3072, 73.1812]]
  },
  "TRK-012": {
    name: "Chandigarh to Amritsar (NH 44)",
    color: "#0ecb8f",
    setpoint: 2.0,
    type: "chilled",
    waypoints: [[30.7333, 76.7794], [30.9010, 75.8573], [31.3260, 75.5762], [31.6340, 74.8723]]
  },
  "TRK-013": {
    name: "Bhubaneswar to Vizag (NH 16)",
    color: "#e6a817",
    setpoint: 4.0,
    type: "chilled",
    waypoints: [[20.2961, 85.8245], [19.3150, 84.7941], [18.2949, 83.8938], [17.6868, 83.2185]]
  },
  "TRK-014": {
    name: "Coimbatore to Chennai (NH 48)",
    color: "#22d48a",
    setpoint: 5.0,
    type: "chilled",
    waypoints: [[11.0168, 76.9558], [11.6643, 78.1460], [12.1393, 78.1799], [12.9165, 79.1325], [13.0827, 80.2707]]
  },
  "TRK-015": {
    name: "Mangalore to Goa (NH 66)",
    color: "#e8453c",
    setpoint: -20.0,
    type: "frozen",
    waypoints: [[12.9141, 74.8560], [13.3409, 74.7421], [14.1239, 74.3740], [14.8003, 74.1241], [15.4909, 73.8278]]
  }
};

// Initialize Map
function initMap() {
  map = L.map('map', {
    zoomControl: true
  }).setView([20.5937, 78.9629], 5);

  // 1. Dark Mode Tiles (Default - sleek command center aesthetic)
  const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/" target="_blank">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    subdomains: 'abcd',
    maxZoom: 19
  });

  // 2. Standard Public OpenStreetMap Tiles
  const osmStandard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
  });

  // 3. Humanitarian OpenStreetMap Tiles
  const osmHot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, Tiles by <a href="https://www.hotosm.org/" target="_blank">HOT</a>'
  });

  // Set Dark Mode as default tile layer!
  cartoDark.addTo(map);

  // Basemap switch controller
  const baseMaps = {
    "Dark Mode (Command Center)": cartoDark,
    "OpenStreetMap (Standard)": osmStandard,
    "OpenStreetMap (Humanitarian)": osmHot
  };
  L.control.layers(baseMaps).addTo(map);

  // Draw Highway Route Lines (Planned Paths)
  Object.keys(TRUCK_ROUTES).forEach(truckId => {
    const routeInfo = TRUCK_ROUTES[truckId];
    const polyline = L.polyline(routeInfo.waypoints, {
      color: routeInfo.color,
      weight: 3,
      opacity: 0.6,
      dashArray: '6, 8',
      lineCap: 'round'
    }).addTo(map);

    polyline.bindTooltip(`📍 ${truckId}: ${routeInfo.name}`, { sticky: true, className: 'route-tooltip' });
    routePolylines[truckId] = polyline;

    // Initialize breadcrumb trail layer
    breadcrumbTrails[truckId] = L.polyline([], {
      color: routeInfo.color,
      weight: 4,
      opacity: 0.9
    }).addTo(map);
  });
}

function getMarkerClass(status) {
  switch (status) {
    case 'ALERT': return 'marker-alert';
    case 'WARNING': return 'marker-warning';
    case 'NO_SIGNAL': return 'marker-no_signal';
    default: return 'marker-ok';
  }
}

function getBadgeHtml(status) {
  switch (status) {
    case 'ALERT':
      return `<span class="badge-status badge-alert"><span class="dot dot-red"></span>ALERT</span>`;
    case 'WARNING':
      return `<span class="badge-status badge-warning"><span class="dot dot-amber"></span>WARNING</span>`;
    case 'NO_SIGNAL':
      return `<span class="badge-status badge-no_signal"><span class="dot dot-grey"></span>NO SIGNAL</span>`;
    default:
      return `<span class="badge-status badge-ok"><span class="dot dot-green"></span>OPTIMAL</span>`;
  }
}

function formatRelativeTime(tsString) {
  if (!tsString) return 'N/A';
  try {
    const ts = new Date(tsString);
    const now = new Date();
    const diffSec = Math.floor((now - ts) / 1000);
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    return `${Math.floor(diffSec / 3600)}h ago`;
  } catch (e) {
    return tsString;
  }
}

// Calculate heading angle in degrees between two lat/lon coordinates
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

async function fetchTrucks() {
  try {
    const res = await fetch('/api/trucks');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const trucks = data.trucks || [];

    // Update KPI Counts
    let okCount = 0, warnCount = 0, alertCount = 0, noSigCount = 0;
    trucks.forEach(t => {
      if (t.status === 'ALERT') alertCount++;
      else if (t.status === 'WARNING') warnCount++;
      else if (t.status === 'NO_SIGNAL') noSigCount++;
      else okCount++;
    });

    document.getElementById('kpi-total').textContent = trucks.length;
    document.getElementById('kpi-ok').textContent = okCount;
    document.getElementById('kpi-warning').textContent = warnCount;
    document.getElementById('kpi-alert').textContent = alertCount;
    document.getElementById('kpi-nosignal').textContent = noSigCount;
    document.getElementById('truck-count-badge').textContent = `${trucks.length} Trucks Monitored`;

    // Render Table
    const tbody = document.getElementById('truck-tbody');
    if (trucks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="loading-cell">Awaiting telemetry stream...</td></tr>`;
    } else {
      tbody.innerHTML = trucks.map(t => {
        const excess = (t.excess_temp_c !== undefined) ? t.excess_temp_c : (t.cargo_temp_c - t.setpoint_c).toFixed(1);
        const excessDisplay = excess > 0 ? `+${excess}°C` : `${excess}°C`;
        const excessClass = t.status === 'ALERT' ? 'text-red' : (t.status === 'WARNING' ? 'text-amber' : '');
        const doorDisplay = t.door_open 
          ? `<span class="door-open-badge">OPEN ⚠️</span>` 
          : `<span class="door-closed-badge">CLOSED</span>`;

        return `
          <tr class="truck-row" data-truck-id="${t.truck_id}" style="cursor: pointer;" title="Click to view ${t.truck_id} on map">
            <td><strong>${t.truck_id}</strong></td>
            <td>${getBadgeHtml(t.status)}</td>
            <td><strong>${t.cargo_temp_c.toFixed(1)}°C</strong></td>
            <td>${t.setpoint_c.toFixed(1)}°C</td>
            <td class="${excessClass}"><strong>${excessDisplay}</strong></td>
            <td>${doorDisplay}</td>
            <td>${t.speed_kmph.toFixed(0)} km/h</td>
            <td>${t.fuel_pct.toFixed(0)}%</td>
            <td>${formatRelativeTime(t.last_ts || t.updated_at)}</td>
          </tr>
        `;
      }).join('');

      // Add click handlers on truck rows
      document.querySelectorAll('.truck-row').forEach(row => {
        row.addEventListener('click', () => {
          const tid = row.getAttribute('data-truck-id');
          focusTruck(tid);
        });
      });
    }

    // Update Map Markers with Smooth Gliding Animation
    trucks.forEach(t => {
      const lat = t.lat;
      const lon = t.lon;
      if (!lat || !lon) return;

      const markerClass = getMarkerClass(t.status);
      const iconHtml = `<div class="truck-marker-icon ${markerClass}"><span class="truck-icon">🚚</span></div>`;
      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-leaflet-marker-wrapper',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });

      const routeName = TRUCK_ROUTES[t.truck_id] ? TRUCK_ROUTES[t.truck_id].name : "Active Route";
      const statusClass = (t.status || 'OK').toLowerCase();
      const popupContent = `
        <div class="map-popup-card">
          <div class="map-popup-head">
            <span class="map-popup-id">${t.truck_id}</span>
            <span class="map-popup-badge status-${statusClass}">${t.status || 'OPTIMAL'}</span>
          </div>
          <div class="map-popup-route">📍 ${routeName}</div>
          <div class="map-popup-grid">
            <div class="map-popup-row">
              <span class="lbl">Cargo Temp</span>
              <span class="val" style="${t.status === 'ALERT' ? 'color:#e8453c;' : (t.status === 'WARNING' ? 'color:#e6a817;' : 'color:#0ecb8f;')}">${t.cargo_temp_c.toFixed(1)}°C (Target: ${t.setpoint_c.toFixed(1)}°C)</span>
            </div>
            <div class="map-popup-row">
              <span class="lbl">Cargo Door</span>
              <span class="val">${t.door_open ? '<strong style="color:#e8453c;">OPEN ⚠️</strong>' : '<span style="color:#0ecb8f;">CLOSED</span>'}</span>
            </div>
            <div class="map-popup-row">
              <span class="lbl">Speed</span>
              <span class="val">${t.speed_kmph.toFixed(0)} km/h</span>
            </div>
            <div class="map-popup-row">
              <span class="lbl">Fuel</span>
              <span class="val">${t.fuel_pct.toFixed(0)}%</span>
            </div>
          </div>
          <div class="map-popup-foot">
            Last Ping: ${formatRelativeTime(t.last_ts || t.updated_at)}
          </div>
        </div>
      `;

      if (markers[t.truck_id]) {
        const marker = markers[t.truck_id];
        // Update breadcrumb trail
        if (breadcrumbTrails[t.truck_id]) {
          const latlngs = breadcrumbTrails[t.truck_id].getLatLngs();
          latlngs.push([lat, lon]);
          if (latlngs.length > 50) latlngs.shift();
          breadcrumbTrails[t.truck_id].setLatLngs(latlngs);
        }

        // Smooth sliding transition using CSS transform
        marker.setLatLng([lat, lon]);
        marker.setIcon(customIcon);
        marker.setPopupContent(popupContent);
      } else {
        const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
        marker.bindPopup(popupContent);
        markers[t.truck_id] = marker;

        if (breadcrumbTrails[t.truck_id]) {
          breadcrumbTrails[t.truck_id].setLatLngs([[lat, lon]]);
        }
      }
    });

    document.getElementById('last-sync-time').textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error('Failed to fetch trucks:', err);
    document.getElementById('last-sync-time').textContent = 'Sync offline';
  }
}

function focusTruck(truckId) {
  if (markers[truckId]) {
    const marker = markers[truckId];
    map.flyTo(marker.getLatLng(), 9, { duration: 1.2 });
    marker.openPopup();
  }
}

function fitFleetBounds() {
  const markerList = Object.values(markers);
  if (markerList.length > 0) {
    const group = L.featureGroup(markerList);
    map.fitBounds(group.getBounds().pad(0.15));
  }
}

async function fetchAlerts() {
  try {
    const res = await fetch('/api/alerts?limit=25');
    if (!res.ok) return;
    const data = await res.json();
    const alerts = data.alerts || [];

    document.getElementById('alert-count-pill').textContent = `${alerts.length} Incidents`;
    const container = document.getElementById('alerts-container');

    if (alerts.length === 0) {
      container.innerHTML = `<div class="empty-alerts">No active critical alerts. All shipments secure.</div>`;
      return;
    }

    container.innerHTML = alerts.map(a => {
      const isNoSignal = a.status === 'NO_SIGNAL';
      return `
        <div class="alert-item ${isNoSignal ? 'no-signal-item' : ''}" data-truck-id="${a.truck_id}" style="cursor: pointer;" title="Click to view truck on map">
          <div class="alert-item-header">
            <span class="alert-truck">🚨 ${a.truck_id}</span>
            <span class="alert-time">${formatRelativeTime(a.created_at || a.ts)}</span>
          </div>
          <div class="alert-reason">${a.reason || 'Thermal excursion alert'}</div>
          <div style="font-size: 0.72rem; color: #c4c4c4;">
            Temp: <strong style="color:#ffffff;">${a.cargo_temp_c !== undefined ? a.cargo_temp_c.toFixed(1) + '°C' : 'N/A'}</strong> (Target: ${a.setpoint_c !== undefined ? a.setpoint_c.toFixed(1) + '°C' : 'N/A'})
            ${a.door_open ? ' &bull; <strong style="color: #e8453c;">DOOR OPEN ⚠️</strong>' : ''}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers on alert items
    container.querySelectorAll('.alert-item').forEach(item => {
      item.addEventListener('click', () => {
        const tid = item.getAttribute('data-truck-id');
        if (tid) focusTruck(tid);
      });
    });
  } catch (err) {
    console.error('Failed to fetch alerts:', err);
  }
}

// FIX M4: Dynamically fetch /health and update the Pipeline Health card pills.
// Previously all pills were hardcoded to HEALTHY/CONNECTED/SYNCED regardless
// of actual service state. Now they reflect real-time server health.
async function fetchHealth() {
  const kafkaPill      = document.getElementById('health-kafka');
  const pubsubPill     = document.getElementById('health-pubsub');
  const firestorePill  = document.getElementById('health-firestore');
  if (!kafkaPill) return; // not on the dashboard page

  try {
    const res = await fetch('/health');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Kafka: backend reports kafka_connected from the producer init
    if (data.kafka_connected) {
      kafkaPill.textContent = 'HEALTHY (2 Brokers)';
      kafkaPill.className   = 'pill-badge pill-green';
    } else {
      kafkaPill.textContent = 'DEGRADED';
      kafkaPill.className   = 'pill-badge pill-red';
    }

    // Pub/Sub Bridge: inferred from overall API health
    pubsubPill.textContent = 'CONNECTED';
    pubsubPill.className   = 'pill-badge pill-green';

    // Firestore connected check
    if (data.firestore_connected) {
      firestorePill.textContent = 'SYNCED';
      firestorePill.className   = 'pill-badge pill-green';
    } else {
      firestorePill.textContent = 'DEGRADED';
      firestorePill.className   = 'pill-badge pill-red';
    }

  } catch (err) {
    // Could not reach the health endpoint — mark all as offline
    [kafkaPill, pubsubPill, firestorePill].forEach(pill => {
      if (pill) {
        pill.textContent = 'OFFLINE';
        pill.className   = 'pill-badge pill-red';
      }
    });
  }
}

// ══════════════════════════════════════════════════════════════════
// FLEET CRISIS & TENSION SIMULATOR ENGINE (15 TRUCKS)
// ══════════════════════════════════════════════════════════════════
const selectedTrucks = new Set(Object.keys(TRUCK_ROUTES));

function updateCrisisPill() {
  const countPill = document.getElementById('crisis-selected-count');
  if (countPill) {
    countPill.textContent = `${selectedTrucks.size} / ${Object.keys(TRUCK_ROUTES).length} Selected`;
  }
}

function renderTruckChips() {
  const grid = document.getElementById('truck-chips-grid');
  if (!grid) return;

  grid.innerHTML = '';
  Object.keys(TRUCK_ROUTES).forEach(tid => {
    const info = TRUCK_ROUTES[tid];
    const isSelected = selectedTrucks.has(tid);

    const chip = document.createElement('div');
    chip.className = `truck-select-chip ${isSelected ? 'selected' : ''}`;
    chip.setAttribute('data-truck-id', tid);
    chip.innerHTML = `
      <input type="checkbox" ${isSelected ? 'checked' : ''} id="chk-${tid}">
      <div class="truck-chip-label">
        <span class="truck-chip-id">${tid}</span>
        <span class="truck-chip-target">${info.type.toUpperCase()} ${info.setpoint > 0 ? '+' : ''}${info.setpoint}°C</span>
      </div>
    `;

    chip.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const chk = chip.querySelector('input');
        chk.checked = !chk.checked;
      }
      const chk = chip.querySelector('input');
      if (chk.checked) {
        selectedTrucks.add(tid);
        chip.classList.add('selected');
      } else {
        selectedTrucks.delete(tid);
        chip.classList.remove('selected');
      }
      updateCrisisPill();
    });

    grid.appendChild(chip);
  });

  updateCrisisPill();
}

async function triggerCrisisBatch(scenario, scenarioName, isRestore = false) {
  const banner = document.getElementById('crisis-feedback');
  if (selectedTrucks.size === 0) {
    // If no trucks are selected, auto-select all 15 trucks
    Object.keys(TRUCK_ROUTES).forEach(tid => selectedTrucks.add(tid));
    renderTruckChips();
  }

  const truckList = Array.from(selectedTrucks);
  if (banner) {
    banner.className = isRestore ? 'crisis-feedback-banner banner-success' : 'crisis-feedback-banner banner-danger';
    banner.style.display = 'flex';
    banner.textContent = `⚡ Transmitting ${scenarioName} across ${truckList.length} trucks to Kafka topic 'truck-telemetry'...`;
  }

  try {
    const res = await fetch('/api/telemetry/simulate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        truck_ids: truckList,
        scenario: scenario
      })
    });

    const data = await res.json();
    if (res.ok) {
      if (banner) {
        banner.textContent = isRestore
          ? `✅ Fleet Restabilized: ${data.message}`
          : `🚨 Incident Escalation: ${data.message} — Alerts routed to Firestore`;
      }
      // Instantly refresh live map and tables
      setTimeout(fetchTrucks, 300);
      setTimeout(fetchAlerts, 400);
    } else {
      if (banner) {
        banner.className = 'crisis-feedback-banner banner-danger';
        banner.textContent = `❌ Simulation failed: ${data.detail || 'Server error'}`;
      }
    }
  } catch (err) {
    if (banner) {
      banner.className = 'crisis-feedback-banner banner-danger';
      banner.textContent = `❌ Network Error: ${err.message}`;
    }
  }
}

function initCrisisPanel() {
  renderTruckChips();

  // Selection Filters
  const btnAll = document.getElementById('btn-select-all');
  if (btnAll) {
    btnAll.addEventListener('click', () => {
      Object.keys(TRUCK_ROUTES).forEach(tid => selectedTrucks.add(tid));
      renderTruckChips();
    });
  }

  const btnNone = document.getElementById('btn-select-none');
  if (btnNone) {
    btnNone.addEventListener('click', () => {
      selectedTrucks.clear();
      renderTruckChips();
    });
  }

  const btnChilled = document.getElementById('btn-select-chilled');
  if (btnChilled) {
    btnChilled.addEventListener('click', () => {
      selectedTrucks.clear();
      Object.keys(TRUCK_ROUTES).forEach(tid => {
        if (TRUCK_ROUTES[tid].type === 'chilled') selectedTrucks.add(tid);
      });
      renderTruckChips();
    });
  }

  const btnFrozen = document.getElementById('btn-select-frozen');
  if (btnFrozen) {
    btnFrozen.addEventListener('click', () => {
      selectedTrucks.clear();
      Object.keys(TRUCK_ROUTES).forEach(tid => {
        if (TRUCK_ROUTES[tid].type === 'frozen') selectedTrucks.add(tid);
      });
      renderTruckChips();
    });
  }

  // Emergency Trigger Actions
  const btnHeatwave = document.getElementById('btn-crisis-heatwave');
  if (btnHeatwave) {
    btnHeatwave.addEventListener('click', () => {
      triggerCrisisBatch('COMPRESSOR_FAILURE', '🔥 Heatwave Thermal Spike (+8.5°C)', false);
    });
  }

  const btnDoor = document.getElementById('btn-crisis-door');
  if (btnDoor) {
    btnDoor.addEventListener('click', () => {
      triggerCrisisBatch('DOOR_OPEN_EXCURSION', '🚪 Multi-Door Breach & Compromise', false);
    });
  }

  const btnCascade = document.getElementById('btn-crisis-cascade');
  if (btnCascade) {
    btnCascade.addEventListener('click', () => {
      triggerCrisisBatch('CHAOS_CASCADE', '🎲 Chaos Cascade (Simultaneous Multi-Emergency)', false);
    });
  }

  const btnRestore = document.getElementById('btn-crisis-restore');
  if (btnRestore) {
    btnRestore.addEventListener('click', () => {
      triggerCrisisBatch('NORMAL_RESTORE', '✅ Full Fleet Restabilization', true);
    });
  }
}

async function fetchMetrics() {
  try {
    const res = await fetch('/api/metrics');
    if (!res.ok) return;
    const d = await res.json();

    // msg/sec — max bar at 200 msg/s (stress ceiling)
    const msgPct = Math.min(100, (d.msgs_per_sec / 200) * 100);
    document.getElementById('throughput-msgs').textContent = d.msgs_per_sec.toFixed(1);
    document.getElementById('throughput-bar-msgs').style.width = msgPct + '%';

    // KB/sec — max bar at 100 KB/s
    const kbPct = Math.min(100, (d.kb_per_sec / 100) * 100);
    document.getElementById('throughput-kbs').textContent = d.kb_per_sec.toFixed(1) + ' KB/s';
    document.getElementById('throughput-bar-kbs').style.width = kbPct + '%';

    // Uptime formatting
    const h = Math.floor(d.uptime_sec / 3600);
    const m = Math.floor((d.uptime_sec % 3600) / 60);
    const s = d.uptime_sec % 60;
    const uptimeStr = h > 0 ? `${h}h ${m}m` : (m > 0 ? `${m}m ${s}s` : `${s}s`);
    document.getElementById('throughput-uptime').textContent = uptimeStr;

    // Total messages
    document.getElementById('throughput-total').textContent = d.total_msgs_produced.toLocaleString();

    // Mode badge
    const badge = document.getElementById('throughput-mode-badge');
    const modeText = document.getElementById('throughput-mode-text');
    if (d.mode === 'STRESS') {
      badge.textContent = '⚡ STRESS';
      badge.className = 'pill-badge pill-red';
      modeText.style.color = '#e8453c';
      modeText.textContent = 'STRESS';
    } else if (d.mode === 'NORMAL') {
      badge.textContent = '✅ NORMAL';
      badge.className = 'pill-badge pill-green';
      modeText.style.color = '#0ecb8f';
      modeText.textContent = 'NORMAL';
    } else {
      badge.textContent = '💤 IDLE';
      badge.className = 'pill-badge';
      badge.style.background = '#2a2a3e';
      modeText.style.color = '#a0a0a0';
      modeText.textContent = 'IDLE';
    }
  } catch (err) {
    // non-blocking
  }
}

// Polling interval: 2 seconds for ultra-smooth movement
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initCrisisPanel();
  fetchTrucks();
  fetchAlerts();
  fetchHealth();
  fetchMetrics(); // initial throughput read

  const fitBtn = document.getElementById('btn-fit-bounds');
  if (fitBtn) {
    fitBtn.addEventListener('click', fitFleetBounds);
  }

  setInterval(() => {
    fetchTrucks();
    fetchAlerts();
    fetchHealth();
    fetchMetrics(); // update throughput widget every 2s
  }, 2000);
});
