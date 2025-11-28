async function translateText(text) {
  const targetLang = document.getElementById("targetLang").value;
  const speechLang = document.getElementById("speechLang").value;

  if (!text.trim()) return;

 
  const sourceLang = speechLang.split("-")[0];

 
  if (sourceLang === targetLang) {
    document.getElementById("translatedText").innerText =
      "⚠ Please select different languages.";
    return;
  }

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=${sourceLang}|${targetLang}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.responseData && data.responseData.translatedText) {
      document.getElementById("translatedText").innerText =
        data.responseData.translatedText;
    } else if (data.responseDetails) {
      document.getElementById("translatedText").innerText =
        "⚠ " + data.responseDetails;
    } else {
      document.getElementById("translatedText").innerText =
        "⚠ Translation unavailable.";
    }
  } catch (error) {
    console.error("Translation failed:", error);
    document.getElementById("translatedText").innerText = "⚠ Translation error.";
  }
}


const micBtn = document.getElementById("micBtn");
const micLabel = micBtn?.querySelector(".mic-label");
const sttState = document.getElementById("stt-state");

let recognizing = false;
let recognition = null;

function setMicUI(active) {
  if (!micBtn) return;

  micBtn.classList.toggle("listening", active);
  micBtn.setAttribute("aria-pressed", String(active));

  if (micLabel) micLabel.textContent = active ? "🎤 Listening…" : "🎤 Start";
  if (sttState) sttState.textContent = active ? "Listening" : "Idle";
}


function startRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert(
      "Speech Recognition is not supported in this browser.\nUse Google Chrome."
    );
    return;
  }

  recognition = new SpeechRecognition();

  const inputLang = document.getElementById("speechLang").value;

  recognition.lang = inputLang;
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onstart = () => {
    recognizing = true;
    setMicUI(true);
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    document.getElementById("stt-output").style.display = "block";
    document.getElementById("transcribedText").innerText = transcript;

   
    translateText(transcript);
  };

  recognition.onerror = (e) => {
    console.error("STT Error:", e.error);
    stopRecognition();
  };

  recognition.onend = () => {
    if (recognizing) recognition.start();
  };

  recognition.start();
}


function stopRecognition() {
  recognizing = false;
  setMicUI(false);
  if (recognition) recognition.stop();
}


if (micBtn) {
  micBtn.addEventListener("click", () => {
    recognizing ? stopRecognition() : startRecognition();
  });
}


let currentLat, currentLng, destinationLat, destinationLng;
const statusDiv = document.getElementById("guidance-status");
const startBtn = document.getElementById("start-guidance-btn");


let map;
let currentMarker;
let destinationMarker;


L.Icon.Default.imagePath = "https://unpkg.com/leaflet@1.9.4/dist/images/";

/**
 * Step 1: Initiates the guidance process.
 */
function startGuidance() {
  const destinationInput = document.getElementById("destination").value;

  if (!destinationInput) {
    statusDiv.innerHTML =
      '<span style="color: yellow;">Please enter a destination.</span>';
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = "Getting Location...";
  statusDiv.innerHTML = "Getting your current location...";

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentLat = position.coords.latitude;
        currentLng = position.coords.longitude;

        statusDiv.innerHTML = `✅ Location found! Lat: ${currentLat.toFixed(
          4
        )}`;

       
        setTimeout(() => {
          // 1. Initialize 
          initMap(currentLat, currentLng);

          // 2. Proceed to find destination coordinates
          findDestination(destinationInput, startBtn);
        }, 100);
      },
      (error) => {
        statusDiv.innerHTML = `<span style="color: red;">❌ Location error: ${error.message}</span>`;
        startBtn.disabled = false;
        startBtn.textContent = "Start Guidance";
        console.error("Geolocation Error:", error);
      }
    );
  } else {

    statusDiv.innerHTML =
      '<span style="color: red;">❌ Geolocation not supported.</span>';
    startBtn.disabled = false;
    startBtn.textContent = "Start Guidance";
  }
}

/**
 * Leaflet: Initializes the map centered on the current location.
 */
function initMap(lat, lng) {
  const mapContainer = document.getElementById("map-container");

  if (map) {
    map.remove(); 
  }

  map = L.map("map-container").setView([lat, lng], 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://carto.com/attributions">CartoDB</a> contributors, &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
  // Add marker for current location
  currentMarker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup("Your Current Location")
    .openPopup();

  mapContainer.style.backgroundColor = "transparent";

  // 🛑 CRITICAL WORKAROUND: Force Leaflet to re-render tiles
  map.invalidateSize();
}

/**
 * Step 2: Uses a free Geocoding service (Nominatim) to convert the address to coordinates.
 */
function findDestination(address, startBtn) {
  statusDiv.innerHTML = `Finding coordinates for "${address}" via Nominatim...`;

  // Nominatim is the free geocoding service for OpenStreetMap
  const NOMINATIM_URL = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    address
  )}&limit=1`;

  fetch(NOMINATIM_URL)
    .then((response) => response.json())
    .then((data) => {
      if (data && data.length > 0) {
        const result = data[0];
        destinationLat = parseFloat(result.lat);
        destinationLng = parseFloat(result.lon);

        // Add marker for destination
        destinationMarker = L.marker([destinationLat, destinationLng])
          .addTo(map)
          .bindPopup(address)
          .openPopup();

        // Adjust map view to show both points
        map.fitBounds([
          [currentLat, currentLng],
          [destinationLat, destinationLng],
        ]);

        // 3. Display the route (using OSRM for directions)
        calculateAndDisplayRoute(
          currentLat,
          currentLng,
          destinationLat,
          destinationLng
        );

        // 4. Start the simulated vibration guidance
        simulateGuidance();
      } else {
        statusDiv.innerHTML = "❌ Geocoding failed: Location not found.";
        startBtn.disabled = false;
        startBtn.textContent = "Start Guidance";
      }
    })
    .catch((error) => {
      statusDiv.innerHTML = "❌ Geocoding API Error.";
      startBtn.disabled = false;
      startBtn.textContent = "Start Guidance";
      console.error("Geocoding error:", error);
    });
}

function calculateAndDisplayRoute(lat1, lon1, lat2, lon2) {
  statusDiv.innerHTML = "Calculating route via OSRM...";

  // OSRM Public Demo API URL for routing
  const OSRM_URL = `https://router.project-osrm.org/route/v1/walking/${lon1},${lat1};${lon2},${lat2}?geometries=geojson&overview=full`;

  fetch(OSRM_URL)
    .then((response) => response.json())
    .then((data) => {
      if (data.code === "Ok" && data.routes.length > 0) {
        const route = data.routes[0];

        
        L.geoJSON(route.geometry).addTo(map);

        statusDiv.innerHTML = "Route found! Guidance is Active.";
      } else {
        statusDiv.innerHTML = "❌ Routing failed: Cannot find walking route.";
      }
    })
    .catch((error) => {
      statusDiv.innerHTML = "❌ Routing API Error.";
      console.error("Routing error:", error);
    });
}

function simulateGuidance() {
  const bearing = calculateBearing(
    currentLat,
    currentLng,
    destinationLat,
    destinationLng
  );

  let direction;
  let vibrationPattern;

  if (bearing >= 315 || bearing < 45) {
    direction = "⬆ North (STRAIGHT)";
    vibrationPattern = [500]; // Single long pulse
  } else if (bearing >= 45 && bearing < 135) {
    direction = "➡ East (TURN RIGHT)";
    vibrationPattern = [100, 100, 300]; // Short, pause, long
  } else if (bearing >= 135 && bearing < 225) {
    direction = "⬇ South (BACK/U-TURN)";
    vibrationPattern = [100, 50, 100, 50, 100]; // Triple short pulses
  } else {
    direction = "⬅ West (TURN LEFT)";
    vibrationPattern = [300, 100, 100]; // Long, pause, short
  }

  statusDiv.innerHTML = `*DIRECTION:* ${direction}. Move now!`;


  const mapContainer = document.getElementById("map-container");
  if (mapContainer) {
    // Flash a border to show the vibration alert is happening
    mapContainer.style.border = "4px solid #6ee7b7"; // Your green color
    setTimeout(() => {
      mapContainer.style.border = "none";
    }, 800);
  }

  if ("vibrate" in navigator) {
    navigator.vibrate(vibrationPattern);
  }
  // Since this is a simulation, the process ends here.
}

/**
 * Helper function to calculate the initial bearing. (Unchanged)
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLon);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;

  return (bearing + 360) % 360;
}