// ColdChain Fleet Simulator Client Logic

let isStreaming = false;
let streamTimer = null;
let doorIsOpen = false;

// FIX M3: Store per-truck fuel levels instead of a single hardcoded 85.0.
// Each profile carries an initial fuel percentage that updates as the
// truck profile is selected, matching the generator's starting values.
const truckProfiles = {
  "TRK-001": { setpoint: 4.0,   lat: 15.4909, lon: 73.8278, fuel: 92.0 },
  "TRK-002": { setpoint: 4.0,   lat: 28.6139, lon: 77.2090, fuel: 85.5 },
  "TRK-003": { setpoint: -18.0, lat: 9.9312,  lon: 76.2673, fuel: 78.0 },
  "TRK-004": { setpoint: 4.0,   lat: 18.5204, lon: 73.8567, fuel: 64.0 },
  "TRK-005": { setpoint: 2.0,   lat: 28.5355, lon: 77.3910, fuel: 89.0 },
  "TRK-006": { setpoint: 4.0,   lat: 12.9716, lon: 77.5946, fuel: 90.0 },
  "TRK-007": { setpoint: 3.0,   lat: 23.0225, lon: 72.5714, fuel: 82.0 },
  "TRK-008": { setpoint: -20.0, lat: 22.5726, lon: 88.3639, fuel: 74.0 },
  "TRK-009": { setpoint: 5.0,   lat: 30.7333, lon: 76.7794, fuel: 88.0 },
  "TRK-010": { setpoint: 4.0,   lat: 17.3850, lon: 78.4867, fuel: 95.0 },
  "TRK-011": { setpoint: 4.0,   lat: 26.9124, lon: 75.7873, fuel: 80.0 },
  "TRK-012": { setpoint: 2.0,   lat: 26.8467, lon: 80.9462, fuel: 87.0 },
  "TRK-013": { setpoint: -18.0, lat: 26.1445, lon: 91.7362, fuel: 76.0 },
  "TRK-014": { setpoint: 4.0,   lat: 23.2599, lon: 77.4126, fuel: 83.0 },
  "TRK-015": { setpoint: -22.0, lat: 12.9141, lon: 74.8560, fuel: 91.0 }
};

const LOGS_STORAGE_KEY = 'coldchain_injection_logs';
const MAX_SAVED_LOGS = 250;

function getSavedLogs() {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function persistLogEntry(time, msg, type) {
  try {
    const logs = getSavedLogs();
    logs.push({ time, msg, type });
    if (logs.length > MAX_SAVED_LOGS) {
      logs.splice(0, logs.length - MAX_SAVED_LOGS);
    }
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    console.warn("Could not save log entry to localStorage:", e);
  }
}

function logTerminal(msg, type = 'system-msg', save = true) {
  const terminal = document.getElementById('terminal-output');
  if (!terminal) return;
  const line = document.createElement('div');
  line.className = `terminal-line ${type}`;
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${msg}`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;

  if (save) {
    persistLogEntry(time, msg, type);
  }
}

async function restorePersistedLogs() {
  const terminal = document.getElementById('terminal-output');
  if (!terminal) return;

  // Render localStorage entries first (instant feedback)
  const localLogs = getSavedLogs();
  if (localLogs && localLogs.length > 0) {
    terminal.innerHTML = '';
    localLogs.forEach(item => {
      const line = document.createElement('div');
      line.className = `terminal-line ${item.type || 'system-msg'}`;
      line.textContent = `[${item.time}] ${item.msg}`;
      terminal.appendChild(line);
    });
    terminal.scrollTop = terminal.scrollHeight;
  }

  // Always also fetch server ring buffer and append any entries not in localStorage
  try {
    const res = await fetch('/api/telemetry/logs');
    if (res.ok) {
      const data = await res.json();
      const serverLogs = data.logs || [];
      // Sync poll counter so we only show NEW entries from here on
      _lastPolledLogCount = serverLogs.length;
      if (serverLogs.length > 0) {
        const localMsgs = new Set(localLogs.map(l => l.msg));
        serverLogs.forEach(item => {
          if (!localMsgs.has(item.message)) {
            const line = document.createElement('div');
            line.className = `terminal-line ${item.type || 'system-msg'}`;
            line.textContent = `[${item.time}] ${item.message}`;
            terminal.appendChild(line);
            persistLogEntry(item.time, item.message, item.type || 'system-msg');
          }
        });
        terminal.scrollTop = terminal.scrollHeight;
      }
    }
  } catch (err) {
    // Non-blocking
  }
}

// Auto-poll server log ring buffer every 2s and append new entries
let _lastPolledLogCount = 0;
async function pollServerLogs() {
  const terminal = document.getElementById('terminal-output');
  if (!terminal) return;
  try {
    const res = await fetch('/api/telemetry/logs');
    if (!res.ok) return;
    const data = await res.json();
    const logs = data.logs || [];
    if (logs.length > _lastPolledLogCount) {
      const newEntries = logs.slice(_lastPolledLogCount);
      newEntries.forEach(item => {
        const line = document.createElement('div');
        line.className = `terminal-line ${item.type || 'system-msg'}`;
        line.textContent = `[${item.time}] ${item.message}`;
        terminal.appendChild(line);
        persistLogEntry(item.time, item.message, item.type || 'system-msg');
      });
      terminal.scrollTop = terminal.scrollHeight;
      _lastPolledLogCount = logs.length;
    }
  } catch (err) {
    // Non-blocking
  }
}

function updateTempColor(cargoTemp, setpoint) {
  const valElem = document.getElementById('cargo-temp-val');
  const excess = cargoTemp - setpoint;
  valElem.textContent = `${cargoTemp.toFixed(1)}°C (${excess >= 0 ? '+' : ''}${excess.toFixed(1)}°C)`;

  if (excess >= 4.0 || (doorIsOpen && excess >= 2.0)) {
    valElem.style.color = 'var(--color-red)';
  } else if (excess >= 2.0) {
    valElem.style.color = 'var(--color-amber)';
  } else if (cargoTemp < 0) {
    valElem.style.color = '#0ecb8f';
  } else {
    valElem.style.color = 'var(--color-green)';
  }
}

let simMap = null;
let simMarker = null;

function initSimMap() {
  const initialLat = parseFloat(document.getElementById('lat-input').value) || 18.5204;
  const initialLon = parseFloat(document.getElementById('lon-input').value) || 73.8567;

  simMap = L.map('sim-map', {
    zoomControl: true
  }).setView([initialLat, initialLon], 6);

  // Free Public OpenStreetMap Tile Layer (No API Key Required)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
  }).addTo(simMap);

  // Custom marker pin
  const customIcon = L.divIcon({
    html: `<div style="background:#0ecb8f; color:#0a0a0a; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid rgba(255,255,255,0.85); box-shadow:0 0 12px rgba(14,203,143,0.6); font-size:14px; cursor:grab;">🚚</div>`,
    className: 'sim-map-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  simMarker = L.marker([initialLat, initialLon], {
    draggable: true,
    icon: customIcon
  }).addTo(simMap);

  // Drag marker to update coordinates
  simMarker.on('dragend', function (e) {
    const pos = e.target.getLatLng();
    updateCoordinates(pos.lat, pos.lng);
    logTerminal(`📍 Map pin dragged to Lat: ${pos.lat.toFixed(4)}, Lon: ${pos.lng.toFixed(4)}`, 'system-msg');
  });

  // Click map to reposition marker
  simMap.on('click', function (e) {
    const { lat, lng } = e.latlng;
    updateCoordinates(lat, lng);
    simMarker.setLatLng([lat, lng]);
    logTerminal(`📍 Waypoint selected on Map: Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}`, 'system-msg');
  });
}

function updateCoordinates(lat, lon) {
  const latInput = document.getElementById('lat-input');
  const lonInput = document.getElementById('lon-input');
  latInput.value = parseFloat(lat).toFixed(4);
  lonInput.value = parseFloat(lon).toFixed(4);
  if (simMarker && simMap) {
    simMarker.setLatLng([lat, lon]);
    simMap.panTo([lat, lon]);
  }
}

function initControls() {
  const truckSelect = document.getElementById('truck-select');
  const tempSlider = document.getElementById('cargo-temp-slider');
  const setpointSlider = document.getElementById('setpoint-slider');
  const speedSlider = document.getElementById('speed-slider');
  const latInput = document.getElementById('lat-input');
  const lonInput = document.getElementById('lon-input');

  initSimMap();

  // Sync manual coordinate typing
  latInput.addEventListener('change', () => {
    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);
    if (!isNaN(lat) && !isNaN(lon)) updateCoordinates(lat, lon);
  });

  lonInput.addEventListener('change', () => {
    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);
    if (!isNaN(lat) && !isNaN(lon)) updateCoordinates(lat, lon);
  });

  // Sync sliders
  tempSlider.addEventListener('input', (e) => {
    const temp = parseFloat(e.target.value);
    const sp = parseFloat(setpointSlider.value);
    updateTempColor(temp, sp);
  });

  setpointSlider.addEventListener('input', (e) => {
    const sp = parseFloat(e.target.value);
    document.getElementById('setpoint-val').textContent = `${sp.toFixed(1)}°C`;
    const temp = parseFloat(tempSlider.value);
    updateTempColor(temp, sp);
  });

  speedSlider.addEventListener('input', (e) => {
    document.getElementById('speed-val').textContent = `${e.target.value} km/h`;
  });

  // FIX M3: Wire up live display for the fuel slider (was not present before
  // because fuel was previously hardcoded — not user-controllable).
  const fuelSlider = document.getElementById('fuel-slider');
  if (fuelSlider) {
    fuelSlider.addEventListener('input', (e) => {
      document.getElementById('fuel-val').textContent = `${e.target.value}%`;
    });
  }

  // Truck Change
  truckSelect.addEventListener('change', (e) => {
    const tid = e.target.value;
    const prof = truckProfiles[tid];
    if (prof) {
      setpointSlider.value = prof.setpoint;
      tempSlider.value = prof.setpoint;
      updateCoordinates(prof.lat, prof.lon);
      document.getElementById('setpoint-val').textContent = `${prof.setpoint.toFixed(1)}°C`;
      updateTempColor(prof.setpoint, prof.setpoint);
      // FIX M3: Update the fuel slider to reflect the selected truck's starting fuel.
      const fuelSlider = document.getElementById('fuel-slider');
      if (fuelSlider) {
        fuelSlider.value = prof.fuel;
        document.getElementById('fuel-val').textContent = `${prof.fuel.toFixed(0)}%`;
      }
      logTerminal(`Switched active profile to ${tid} (Default Setpoint: ${prof.setpoint}°C, Fuel: ${prof.fuel}%)`);
    }
  });

  // Door Buttons
  const doorClosedBtn = document.getElementById('door-closed-btn');
  const doorOpenBtn = document.getElementById('door-open-btn');

  doorClosedBtn.addEventListener('click', () => {
    doorIsOpen = false;
    doorClosedBtn.classList.add('active');
    doorOpenBtn.classList.remove('active');
    updateTempColor(parseFloat(tempSlider.value), parseFloat(setpointSlider.value));
  });

  doorOpenBtn.addEventListener('click', () => {
    doorIsOpen = true;
    doorOpenBtn.classList.add('active');
    doorClosedBtn.classList.remove('active');
    updateTempColor(parseFloat(tempSlider.value), parseFloat(setpointSlider.value));
  });

  // Quick Location Chips
  document.querySelectorAll('.btn-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const lat = parseFloat(chip.dataset.lat);
      const lon = parseFloat(chip.dataset.lon);
      updateCoordinates(lat, lon);
      logTerminal(`Updated GPS coordinates to ${chip.textContent} (${lat}, ${lon})`);
    });
  });

  // Clear Terminal Button
  document.getElementById('btn-clear-log').addEventListener('click', async () => {
    document.getElementById('terminal-output').innerHTML = '';
    localStorage.removeItem(LOGS_STORAGE_KEY);
    // CRITICAL FIX: reset poll counter so new entries are detected after clear
    _lastPolledLogCount = 0;
    try {
      await fetch('/api/telemetry/logs', { method: 'DELETE' });
    } catch (e) {
      // Non-blocking
    }
    logTerminal('Logs cleared by operator.', 'system-msg', true);
  });

  // Pre-fill from current live status
  document.getElementById('btn-fetch-current').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/trucks');
      const data = await res.json();
      const tid = truckSelect.value;
      const truck = (data.trucks || []).find(t => t.truck_id === tid);
      if (truck) {
        tempSlider.value = truck.cargo_temp_c;
        setpointSlider.value = truck.setpoint_c;
        document.getElementById('setpoint-val').textContent = `${truck.setpoint_c.toFixed(1)}°C`;
        speedSlider.value = truck.speed_kmph;
        document.getElementById('speed-val').textContent = `${truck.speed_kmph.toFixed(0)} km/h`;
        // FIX M3: Pre-fill fuel from live truck data instead of leaving a stale value.
        const fuelSlider = document.getElementById('fuel-slider');
        if (fuelSlider) {
          fuelSlider.value = truck.fuel_pct;
          document.getElementById('fuel-val').textContent = `${truck.fuel_pct.toFixed(0)}%`;
        }
        if (truck.lat && truck.lon) {
          updateCoordinates(truck.lat, truck.lon);
        }
        
        if (truck.door_open) {
          doorOpenBtn.click();
        } else {
          doorClosedBtn.click();
        }
        updateTempColor(truck.cargo_temp_c, truck.setpoint_c);
        logTerminal(`Pre-filled latest live state for ${tid}: ${truck.cargo_temp_c}°C, fuel=${truck.fuel_pct}%, status=${truck.status}`, 'success-msg');
      } else {
        logTerminal(`No live status found for ${tid}`, 'alert-msg');
      }
    } catch (err) {
      logTerminal(`Error fetching current state: ${err.message}`, 'error-msg');
    }
  });

  // Send Single Telemetry Ping Button
  // Send Single Telemetry Ping Button
  const btnSendPing = document.getElementById('btn-send-ping');
  if (btnSendPing) {
    btnSendPing.addEventListener('click', () => {
      sendTelemetryPayload();
    });
  }

  // Toggle Single Truck Continuous Stream
  const toggleBtn = document.getElementById('btn-toggle-stream');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (!isStreaming) {
        isStreaming = true;
        toggleBtn.textContent = '⏹️ Stop Stream';
        toggleBtn.classList.add('streaming-active');
        logTerminal(`Started continuous stream for ${truckSelect.value} (1s interval)...`, 'alert-msg');
        sendTelemetryPayload();
        streamTimer = setInterval(sendTelemetryPayload, 1000);
      } else {
        isStreaming = false;
        clearInterval(streamTimer);
        toggleBtn.textContent = '▶️ Stream Selected (1s)';
        toggleBtn.classList.remove('streaming-active');
        logTerminal(`Stopped custom stream for ${truckSelect.value}.`, 'system-msg');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // FLEET-WIDE MASS SIMULATION CONTROLS (ALL 15 TRUCKS)
  // ══════════════════════════════════════════════════════════════════
  let isFleetStreaming = false;
  let fleetStreamTimer = null;
  let fleetStreamTick = 0;

  // Rotating scenario cycle: heatwave → door breach → chaos → restore → repeat
  const FLEET_TICK_SCENARIOS = [
    { scenario: 'COMPRESSOR_FAILURE',  label: '🔥 Heatwave Thermal Spike (+8.5°C)' },
    { scenario: 'DOOR_OPEN_EXCURSION', label: '🚪 Multi-Door Breach' },
    { scenario: 'CHAOS_CASCADE',       label: '🎲 Chaos Cascade' },
    { scenario: 'NORMAL_RESTORE',      label: '✅ Fleet Restabilized' }
  ];

  async function sendFleetSimulationTick() {
    const allTruckIds = Object.keys(truckProfiles);
    const entry = FLEET_TICK_SCENARIOS[fleetStreamTick % FLEET_TICK_SCENARIOS.length];
    fleetStreamTick++;

    try {
      const res = await fetch('/api/telemetry/simulate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truck_ids: allTruckIds,
          scenario: entry.scenario
        })
      });
      const data = await res.json();
      if (res.ok) {
        logTerminal(`⚡ [Tick #${fleetStreamTick}] ${entry.label} → ${data.count} trucks injected into Kafka 'truck-telemetry'`, 'success-msg');
      } else {
        logTerminal(`❌ Fleet Tick Failed: ${data.detail || 'Server error'}`, 'error-msg');
      }
    } catch (err) {
      logTerminal(`❌ Fleet Simulation Network Error: ${err.message}`, 'error-msg');
    }
  }

  // Toggle Continuous Fleet-Wide Simulation (15 Trucks)
  const toggleFleetBtn = document.getElementById('btn-toggle-fleet-stream');
  if (toggleFleetBtn) {
    toggleFleetBtn.addEventListener('click', () => {
      if (!isFleetStreaming) {
        isFleetStreaming = true;
        toggleFleetBtn.textContent = '⏹️ Stop Simulating All 15 Trucks';
        toggleFleetBtn.classList.add('streaming-active');
        logTerminal('⚡ Started fleet-wide continuous simulation across all 15 trucks (1s stream)...', 'alert-msg');
        sendFleetSimulationTick();
        fleetStreamTimer = setInterval(sendFleetSimulationTick, 1000);
      } else {
        isFleetStreaming = false;
        clearInterval(fleetStreamTimer);
        toggleFleetBtn.textContent = '⚡ Start Simulating All 15 Trucks (Continuous 1s Stream)';
        toggleFleetBtn.classList.remove('streaming-active');
        logTerminal('⏹️ Stopped fleet-wide simulation.', 'system-msg');
      }
    });
  }

  async function triggerMassFleetScenario(scenario, name) {
    const allTruckIds = Object.keys(truckProfiles);
    logTerminal(`⚡ Initiating ${name} across all ${allTruckIds.length} trucks...`, 'alert-msg');

    try {
      const res = await fetch('/api/telemetry/simulate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truck_ids: allTruckIds,
          scenario: scenario
        })
      });
      const data = await res.json();
      if (res.ok) {
        logTerminal(`✅ ${name} Dispatched: ${data.message} (${data.count} trucks updated)`, 'success-msg');
      } else {
        logTerminal(`❌ Mass Action Failed: ${data.detail || 'Error'}`, 'error-msg');
      }
    } catch (err) {
      logTerminal(`❌ Network Error: ${err.message}`, 'error-msg');
    }
  }

  // Mass Fleet Action Buttons
  const btnFleetHeatwave = document.getElementById('btn-fleet-heatwave');
  if (btnFleetHeatwave) {
    btnFleetHeatwave.addEventListener('click', () => {
      triggerMassFleetScenario('COMPRESSOR_FAILURE', '🔥 Fleet Heatwave Thermal Spike (+8.5°C)');
    });
  }

  const btnFleetDoor = document.getElementById('btn-fleet-door');
  if (btnFleetDoor) {
    btnFleetDoor.addEventListener('click', () => {
      triggerMassFleetScenario('DOOR_OPEN_EXCURSION', '🚪 Fleet Multi-Door Breach');
    });
  }

  const btnFleetCascade = document.getElementById('btn-fleet-cascade');
  if (btnFleetCascade) {
    btnFleetCascade.addEventListener('click', () => {
      triggerMassFleetScenario('CHAOS_CASCADE', '🎲 Fleet Chaos Cascade (Mounting Tension)');
    });
  }

  const btnFleetRestore = document.getElementById('btn-fleet-restore');
  if (btnFleetRestore) {
    btnFleetRestore.addEventListener('click', () => {
      triggerMassFleetScenario('NORMAL_RESTORE', '✅ Full Fleet Restabilization (Optimal State)');
    });
  }

  // One-Click Single-Truck Anomaly Scenarios
  document.querySelectorAll('.scenario-btn[data-scenario]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const scenario = btn.dataset.scenario;
      const tid = truckSelect.value;
      logTerminal(`Triggering preset scenario [${scenario}] for ${tid}...`, 'alert-msg');

      try {
        const res = await fetch('/api/telemetry/scenario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ truck_id: tid, scenario: scenario })
        });
        const result = await res.json();
        if (res.ok) {
          logTerminal(`✅ Scenario Injected: ${result.message}`, 'success-msg');
          logTerminal(`Payload: ${JSON.stringify(result.payload)}`, 'system-msg');
          // Update sliders to reflect scenario values
          tempSlider.value = result.payload.cargo_temp_c;
          setpointSlider.value = result.payload.setpoint_c;
          document.getElementById('setpoint-val').textContent = `${result.payload.setpoint_c}°C`;
          if (result.payload.door_open) doorOpenBtn.click();
          else doorClosedBtn.click();
          updateTempColor(result.payload.cargo_temp_c, result.payload.setpoint_c);
        } else {
          logTerminal(`❌ Injection Failed: ${result.detail}`, 'error-msg');
        }
      } catch (err) {
        logTerminal(`❌ Network Error: ${err.message}`, 'error-msg');
      }
    });
  });
}

async function sendTelemetryPayload() {
  const tid = document.getElementById('truck-select').value;
  const cargoTemp = parseFloat(document.getElementById('cargo-temp-slider').value);
  const setpoint = parseFloat(document.getElementById('setpoint-slider').value);
  const speed = parseFloat(document.getElementById('speed-slider').value);
  const lat = parseFloat(document.getElementById('lat-input').value) || 18.5204;
  const lon = parseFloat(document.getElementById('lon-input').value) || 73.8567;
  // FIX M3: Read fuel from the slider instead of the previous hardcoded 85.0.
  const fuelElem = document.getElementById('fuel-slider');
  const fuel = fuelElem ? parseFloat(fuelElem.value) : (truckProfiles[tid]?.fuel ?? 85.0);

  const payload = {
    truck_id: tid,
    cargo_temp_c: cargoTemp,
    setpoint_c: setpoint,
    door_open: doorIsOpen,
    speed_kmph: speed,
    fuel_pct: fuel,
    lat: lat,
    lon: lon
  };

  try {
    const res = await fetch('/api/telemetry/inject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (res.ok) {
      logTerminal(`🚀 Sent: ${tid} | Temp=${cargoTemp}°C (Setpoint=${setpoint}°C) | Door=${doorIsOpen ? 'OPEN' : 'CLOSED'} | Offset Committed`, 'success-msg');
    } else {
      logTerminal(`❌ Error: ${result.detail || 'Failed to inject'}`, 'error-msg');
    }
  } catch (err) {
    logTerminal(`❌ Exception: ${err.message}`, 'error-msg');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initControls();
  restorePersistedLogs();
  // Auto-poll server logs every 2s to keep terminal live
  setInterval(pollServerLogs, 2000);
});
