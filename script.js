
const $ = (id) => document.getElementById(id);

// Data Structures
// Map = Hash Map for fast zone lookup
const zones = new Map();

// Queue = FIFO event processing
const eventQueue = [];

// Store recent activity
let history = [];
let activeZoneIds = new Set();
let currentLocation = null;
let processedEvents = 0;
let isProcessing = false;

// Restore saved data
try {
  const savedZones = JSON.parse(localStorage.getItem("ss_zones") || "[]");
  savedZones.forEach(zone => zones.set(zone.id, zone));

  history = JSON.parse(localStorage.getItem("ss_history") || "[]");
  activeZoneIds = new Set(
    JSON.parse(localStorage.getItem("ss_active") || "[]")
  );
} catch (error) {
  console.warn("Saved data could not be loaded.", error);
}

function saveData() {
  localStorage.setItem("ss_zones", JSON.stringify([...zones.values()]));
  localStorage.setItem("ss_history", JSON.stringify(history.slice(0, 50)));
  localStorage.setItem("ss_active", JSON.stringify([...activeZoneIds]));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function addHistory(title, detail, icon = "📍") {
  history.unshift({
    title,
    detail,
    icon,
    time: new Date().toLocaleString()
  });

  history = history.slice(0, 50);
  saveData();
  renderHistory();
}

function renderZones() {
  const list = $("zoneList");
  const select = $("simulationZone");
  const previousSelection = select.value;

  $("zoneCount").textContent = zones.size;

  if (zones.size === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span>📍</span>
        <h3>No zones added yet</h3>
        <p>Add a location to get started.</p>
      </div>`;
  } else {
    list.innerHTML = [...zones.values()].map(zone => `
      <article class="zone-card">
        <div class="zone-card-top">
          <div>
            <h3>${escapeHTML(zone.name)}</h3>
            <p>${escapeHTML(zone.type)} · ${zone.radius} m radius</p>
            <p>${zone.lat == null
              ? "Location not set"
              : `${zone.lat.toFixed(5)}, ${zone.lng.toFixed(5)}`}</p>
          </div>
          <span class="zone-badge">
            ${activeZoneIds.has(zone.id) ? "🔕 Inside" : "Available"}
          </span>
        </div>
        <div class="zone-actions">
          <button data-action="toggle" data-id="${zone.id}">
            ${zone.enabled ? "Disable" : "Enable"}
          </button>
          <button data-action="locate" data-id="${zone.id}">
            Set current location
          </button>
          <button class="delete" data-action="delete" data-id="${zone.id}">
            Delete
          </button>
        </div>
      </article>
    `).join("");
  }

  select.innerHTML = zones.size
    ? [...zones.values()].map(zone => `
        <option value="${zone.id}">
          ${escapeHTML(zone.name)}
        </option>
      `).join("")
    : `<option value="">Add a zone first</option>`;

  if (zones.has(previousSelection)) select.value = previousSelection;

  renderStatus();
}

function renderHistory() {
  const list = $("historyList");

  if (history.length === 0) {
    list.innerHTML = `<p class="muted">No activity recorded yet.</p>`;
    return;
  }

  list.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-icon">${escapeHTML(item.icon)}</div>
      <div>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.detail)}</p>
        <time>${escapeHTML(item.time)}</time>
      </div>
    </div>
  `).join("");
}

function renderStatus() {
  const active = [...activeZoneIds]
    .map(id => zones.get(id))
    .filter(zone => zone && zone.enabled);

  $("activeCount").textContent = active.length;

  if (active.length > 0) {
    $("soundIcon").textContent = "🔕";
    $("soundStatus").textContent = "Silent Mode";
    $("soundMessage").textContent =
      `Active in ${active.map(z => z.name).join(", ")}`;
    $("modePill").textContent = "ZONE ACTIVE";
    $("soundIcon").style.background = "#42304f";
  } else {
    $("soundIcon").textContent = "🔔";
    $("soundStatus").textContent = "Normal Mode";
    $("soundMessage").textContent = "No active silent zone";
    $("modePill").textContent = "READY";
    $("soundIcon").style.background = "#234b4a";
  }

  $("eventCount").textContent = processedEvents;
}

function addZone(event) {
  event.preventDefault();

  const name = $("zoneName").value.trim();
  if (!name) return;

  const latValue = $("latitude").value.trim();
  const lngValue = $("longitude").value.trim();

  const lat = latValue === "" ? null : Number(latValue);
  const lng = lngValue === "" ? null : Number(lngValue);

  if ((lat === null) !== (lng === null)) {
    alert("Enter both latitude and longitude, or leave both empty.");
    return;
  }

  if (
    lat !== null &&
    (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
     !Number.isFinite(lng) || lng < -180 || lng > 180)
  ) {
    alert("Please enter valid coordinates.");
    return;
  }

  const zone = {
    id: crypto.randomUUID(),
    name,
    type: $("zoneType").value,
    radius: Number($("zoneRadius").value),
    lat,
    lng,
    enabled: true
  };

  zones.set(zone.id, zone);
  saveData();
  renderZones();

  addHistory("Silent zone added", `${name} created successfully`, "➕");
  $("zoneForm").reset();
}

function handleZoneAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  const zone = zones.get(id);
  if (!zone) return;

  if (action === "delete") {
    zones.delete(id);
    activeZoneIds.delete(id);
    saveData();
    renderZones();
    addHistory("Zone deleted", zone.name, "🗑️");
  }

  if (action === "toggle") {
    zone.enabled = !zone.enabled;

    if (!zone.enabled) activeZoneIds.delete(id);

    saveData();
    renderZones();
    addHistory(
      zone.enabled ? "Zone enabled" : "Zone disabled",
      zone.name,
      "⚙️"
    );
  }

  if (action === "locate") {
    if (!currentLocation) {
      alert("First click 'Use My Current Location'.");
      return;
    }

    zone.lat = currentLocation.lat;
    zone.lng = currentLocation.lng;
    saveData();
    renderZones();
    addHistory("Zone location updated", zone.name, "📍");
  }
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);

  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
    Math.cos(radians(lat2)) *
    Math.sin(dLng / 2) ** 2;

  return 6371000 * 2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function enqueueEvent(event) {
  eventQueue.push(event);
  processQueue();
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    while (eventQueue.length > 0) {
      const event = eventQueue.shift();

      // Ignore stale or disabled zones
      const zone = zones.get(event.id);
      if (!zone || !zone.enabled) continue;

      if (event.type === "ENTER") {
        activeZoneIds.add(event.id);
        addHistory("Entered silent zone", zone.name, "🔕");
      } else {
        activeZoneIds.delete(event.id);
        addHistory("Left silent zone", zone.name, "🔔");
      }

      processedEvents++;
      saveData();
      renderZones();

      // Keep the demo responsive while processing queued events
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  } finally {
    isProcessing = false;
    renderStatus();
  }
}

function simulateEnter() {
  const id = $("simulationZone").value;
  const zone = zones.get(id);

  if (!zone) {
    alert("Please add and select a silent zone first.");
    return;
  }

  if (!zone.enabled) {
    alert("Enable this zone before simulating entry.");
    return;
  }

  if (activeZoneIds.has(id)) {
    alert("You are already inside this simulated zone.");
    return;
  }

  enqueueEvent({ type: "ENTER", id });
}

function simulateExit() {
  const id = $("simulationZone").value;
  const zone = zones.get(id);

  if (!zone) {
    alert("Please add and select a silent zone first.");
    return;
  }

  if (!activeZoneIds.has(id)) {
    alert("Enter the zone first.");
    return;
  }

  enqueueEvent({ type: "EXIT", id });
}

function resetSimulation() {
  eventQueue.length = 0;
  activeZoneIds.clear();
  saveData();
  renderZones();
  addHistory("Simulation reset", "All active demo zones cleared", "↻");
}

function getCurrentLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by this browser.");
    return;
  }

  $("appStatus").textContent = "● Locating...";

  navigator.geolocation.getCurrentPosition(
    position => {
      currentLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      $("latitude").value = currentLocation.lat;
      $("longitude").value = currentLocation.lng;
      $("appStatus").textContent = "● Location ready";

      addHistory(
        "Location detected",
        "Current coordinates received",
        "📍"
      );

      checkCurrentLocation();
    },
    error => {
      $("appStatus").textContent = "● Location unavailable";
      alert("Could not get your location. Allow location access and try again.");
      console.warn(error.message);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function checkCurrentLocation() {
  if (!currentLocation) return;

  for (const zone of zones.values()) {
    if (!zone.enabled || zone.lat == null || zone.lng == null) continue;

    const distance = getDistanceMeters(
      currentLocation.lat,
      currentLocation.lng,
      zone.lat,
      zone.lng
    );

    const inside = distance <= zone.radius;
    const active = activeZoneIds.has(zone.id);

    if (inside && !active) {
      enqueueEvent({ type: "ENTER", id: zone.id });
    } else if (!inside && active) {
      enqueueEvent({ type: "EXIT", id: zone.id });
    }
  }
}

// Button and form listeners
$("zoneForm").addEventListener("submit", addZone);
$("zoneList").addEventListener("click", handleZoneAction);
$("locationBtn").addEventListener("click", getCurrentLocation);
$("enterBtn").addEventListener("click", simulateEnter);
$("exitBtn").addEventListener("click", simulateExit);
$("resetBtn").addEventListener("click", resetSimulation);

$("clearHistory").addEventListener("click", () => {
  history = [];
  saveData();
  renderHistory();
});

renderZones();
renderHistory();



/* SilentSense: Sound and Vibration Alerts */

let soundAlertsEnabled = true;
let silentSenseAudio = null;

const soundToggleBtn = document.getElementById("soundToggleBtn");
const enterZoneBtn = document.getElementById("enterBtn");
const exitZoneBtn = document.getElementById("exitBtn");

function playTone(frequency, duration, delay = 0) {
  if (!soundAlertsEnabled) return;

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) return;

  try {
    if (!silentSenseAudio) {
      silentSenseAudio = new AudioContextClass();
    }

    const ctx = silentSenseAudio;

    const play = () => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.2,
        ctx.currentTime + 0.02
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + duration / 1000
      );

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + duration / 1000);
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(() => {
        setTimeout(play, delay);
      });
    } else {
      setTimeout(play, delay);
    }
  } catch (error) {
    console.log("Sound alert unavailable:", error);
  }
}

function vibrateDevice(pattern) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

// Zone activated: one high beep and one vibration
function zoneActivatedAlert() {
  playTone(880, 180);
  vibrateDevice([150]);
}

// Zone deactivated: two lower beeps and two vibrations
function zoneDeactivatedAlert() {
  playTone(520, 150);
  playTone(520, 150, 250);
  vibrateDevice([100, 100, 100]);
}

// Toggle sound alerts ON/OFF
if (soundToggleBtn) {
  soundToggleBtn.addEventListener("click", () => {
    soundAlertsEnabled = !soundAlertsEnabled;

    soundToggleBtn.textContent = soundAlertsEnabled
      ? "🔊 Sound Alerts: ON"
      : "🔇 Sound Alerts: OFF";

    if (!soundAlertsEnabled && "vibrate" in navigator) {
      navigator.vibrate(0);
    }
  });
}

// Play alerts when simulation buttons are pressed
if (enterZoneBtn) {
  enterZoneBtn.addEventListener("click", zoneActivatedAlert);
}

if (exitZoneBtn) {
  exitZoneBtn.addEventListener("click", zoneDeactivatedAlert);
}


function trackMyLocation() {
  const status = document.getElementById("appStatus");

  if (!navigator.geolocation) {
    status.textContent = "Location is not supported by this browser.";
    return;
  }

  status.textContent = "Requesting location permission...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      status.textContent =
        `Location detected: ${latitude.toFixed(5)}, ` +
        `${longitude.toFixed(5)} (accuracy ±${Math.round(accuracy)} m)`;

      console.log("Latitude:", latitude);
      console.log("Longitude:", longitude);
      console.log("Accuracy:", accuracy, "meters");
    },
    (error) => {
      status.textContent =
        error.code === 1
          ? "Location permission denied."
          : "Unable to get location. Please try again.";
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}
  




(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const KEYS = {
    zones: "silentsense_zones_v1",
    history: "silentsense_history_v1"
  };

  let enabled = false;
  let watchId = null;
  let currentPosition = null;
  let activeZones = new Set();

  function load(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch {
      alert("Storage unavailable. Check browser settings.");
      return false;
    }
  }

  function log(message) {
    const history = load(KEYS.history);
    history.unshift({
      message,
      time: new Date().toLocaleString()
    });

    save(KEYS.history, history.slice(0, 100));
    renderHistory();
  }

  function renderZones() {
    const list = $("ss-zones");
    if (!list) return;

    list.replaceChildren();

    load(KEYS.zones).forEach((zone) => {
      const li = document.createElement("li");
      li.append(
        document.createTextNode(
          `${zone.name} (${zone.type}) — ${zone.radius} m `
        )
      );

      const remove = document.createElement("button");
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        save(KEYS.zones, load(KEYS.zones)
          .filter((item) => item.id !== zone.id));
        activeZones.delete(zone.id);
        log(`Zone deleted: ${zone.name}`);
        renderZones();
      });

      li.append(remove);
      list.append(li);
    });

    if (!list.children.length) {
      list.textContent = "No saved places yet.";
    }
  }

  function renderHistory() {
    const list = $("ss-history");
    if (!list) return;

    list.replaceChildren();

    load(KEYS.history).slice(0, 20).forEach((entry) => {
      const li = document.createElement("li");
      li.textContent = `${entry.time} — ${entry.message}`;
      list.append(li);
    });

    if (!list.children.length) {
      list.textContent = "No activity recorded yet.";
    }
  }

  function distanceMetres(a, b) {
    const rad = (value) => value * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);

    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(dLon / 2) ** 2;

    return 6371000 * 2 *
      Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function notify(message) {
    alert(message);

    if ("Notification" in window &&
        Notification.permission === "granted") {
      try {
        new Notification("SilentSense", { body: message });
      } catch {
        // The in-page alert still provides feedback.
      }
    }
  }

  function checkZones(position) {
    const point = {
      lat: position.coords.latitude,
      lon: position.coords.longitude
    };

    load(KEYS.zones).forEach((zone) => {
      const distance = distanceMetres(point, zone);
      const inside = distance <= zone.radius;
      const wasInside = activeZones.has(zone.id);

      if (inside && !wasInside) {
        activeZones.add(zone.id);
        log(`Entered ${zone.name}`);
        notify(`You are near ${zone.name}. Check your phone's sound mode.`);
      } else if (!inside && wasInside) {
        activeZones.delete(zone.id);
        log(`Exited ${zone.name}`);
        notify(`You left ${zone.name}. Check your phone's sound mode.`);
      }
    });
  }

  function handlePosition(position) {
    currentPosition = {
      lat: position.coords.latitude,
      lon: position.coords.longitude
    };

    $("ss-status").textContent =
      `Detection ${enabled ? "ON" : "OFF"} | Location updated`;

    checkZones(position);
  }

  function handleError(error) {
    const messages = {
      1: "Location permission denied. Allow it in browser settings.",
      2: "Location is currently unavailable.",
      3: "Location request timed out."
    };

    $("ss-status").textContent =
      messages[error.code] || "Unable to get location.";
  }

  function getLocationOnce() {
    if (!navigator.geolocation) {
      alert("This browser does not support geolocation.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        handlePosition(position);
        alert(
          `Location found!\nLatitude: ${currentPosition.lat.toFixed(5)}` +
          `\nLongitude: ${currentPosition.lon.toFixed(5)}`
        );
      },
      handleError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function startDetection() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported in this browser.");
      return;
    }

    if (!window.isSecureContext) {
      alert("Open this site using VS Code Live Server on localhost or HTTPS.");
      return;
    }

    if ("Notification" in window &&
        Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    enabled = true;
    $("ss-toggle").textContent = "Turn OFF Detection";
    $("ss-status").textContent = "Requesting location permission...";

    watchId = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

  function stopDetection() {
    enabled = false;

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    activeZones.clear();
    $("ss-toggle").textContent = "Turn ON Detection";
    $("ss-status").textContent = "Detection is OFF";
  }

  function addZone() {
    if (!currentPosition) {
      alert("First click Check My Location and allow location access.");
      return;
    }

    const name = $("ss-zone-name").value.trim();
    const type = $("ss-place").value;
    const radius = Number($("ss-radius").value);

    if (!name) {
      alert("Please enter a place name.");
      return;
    }

    if (!Number.isFinite(radius) || radius < 50 || radius > 5000) {
      alert("Radius must be between 50 and 5000 metres.");
      return;
    }

    const zones = load(KEYS.zones);

    zones.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      type,
      lat: currentPosition.lat,
      lon: currentPosition.lon,
      radius
    });

    if (save(KEYS.zones, zones)) {
      $("ss-zone-name").value = "";
      log(`Zone saved: ${name}`);
      renderZones();
      notify(`${name} saved. Detection ${enabled ? "is ON" : "is OFF"}.`);
    }
  }

  function init() {
    // Prevent duplicate event handlers if this script is initialized again.
    if (!$("ss-advanced") || $("ss-advanced").dataset.ready === "yes") {
      return;
    }

    $("ss-advanced").dataset.ready = "yes";

    $("ss-toggle").addEventListener("click", () => {
      if (enabled) stopDetection();
      else startDetection();
    });

    $("ss-find").addEventListener("click", getLocationOnce);
    $("ss-save-zone").addEventListener("click", addZone);

    $("ss-clear-history").addEventListener("click", () => {
      if (confirm("Clear all SilentSense activity history?")) {
        save(KEYS.history, []);
        renderHistory();
      }
    });

    renderZones();
    renderHistory();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
