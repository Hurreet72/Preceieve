// index.js 
//Utility & UI (toast + year)
document.getElementById('year').textContent = new Date().getFullYear();

const toast = document.getElementById('toast');
function showToast(msg) {
  if (!toast) { console.log('TOAST:', msg); return; }
  toast.textContent = msg;
  toast.hidden = false;
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 300);
  }, 2200);
}

// Theme toggle
const themeToggle = document.getElementById('theme-toggle');
const root = document.documentElement;
const stored = localStorage.getItem('preceieve-theme');
if (stored === 'light') {
  root.setAttribute('data-theme', 'light');
  if (themeToggle) themeToggle.checked = true;
}
if (themeToggle) {
  themeToggle.addEventListener('change', () => {
    if (themeToggle.checked) {
      root.setAttribute('data-theme', 'light');
      localStorage.setItem('preceieve-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
      localStorage.setItem('preceieve-theme', 'dark');
    }
  });
}

//Starter server
const STARTER_BASE = 'http://127.0.0.1:5000';

async function starterRequest(path, method = 'POST') {
  try {
    console.log('calling', STARTER_BASE + path);
    const res = await fetch(`${STARTER_BASE}${path}`, { method });
    if (!res.ok) {
      const txt = await res.text().catch(() => null);
      showToast('Starter: ' + (txt || res.statusText));
      console.error('Starter responded non-ok', res.status, txt);
      return null;
    }
    const json = await res.json().catch(() => null);
    console.log('starter response', json);
    return json;
  } catch (err) {
    console.error('Starter request failed', err);
    showToast('Could not contact starter. Is starter.py running?');
    return null;
  }
}

// SCRIPT MAPPING 
const SCRIPT_MAPPING = {
  "Speech to Text": "app.js",
  // Mapped to local module now!
  "Emergency Alert Mode": "__local_emergency__", 
  "Weather Detection": "Weather_app.py",
  "Animated Sign Language": "main1.py",
  // Special local marker for obstacle detection → visual aid
  "Obstacle Detection": "__visual_aid__"
};

async function checkEmergency() {
    try {
        const res = await fetch('http://127.0.0.1:5000/get-status/detector.py');
        const data = await res.json();

        if (data.status === 'EMERGENCY') {
            // Show emergency alert in red
            document.getElementById('emergency-popup').style.display = 'block';
        } else {
            document.getElementById('emergency-popup').style.display = 'none';
        }
    } catch (err) {
        console.error('Error fetching detector status:', err);
    }
}

// Poll every 500ms
setInterval(checkEmergency, 500);



// Visual Aid module (clean, self-contained)
// Exposes global functions: openVisualAid(), closeVisualAid()
(function visualAidModule() {
  let handles = null;        
  let mediaStream = null;
  let isOpen = false;
  let overlayClickHandler = null;

  const obstacleOptions = [
    { text: "Alert! Large object detected. BEWARE .", color: 'yellow' },
    { text: "Clear path. Scanning for immediate hazards.", color: 'green' },
    { text: "Warning! Obstacle directly in front of you. Stop now! It is a step down.", color: 'red' },
    { text: "Object there, some distance away. Possible pedestrian.", color: 'yellow' },
    { text: "Caution! something or someone is there.", color: 'red' },
  ];

  function createUI() {
    // If it exists, return existing handles
    const existing = document.getElementById('visualAidRoot');
    if (existing) {
      return {
        root: existing,
        video: existing.querySelector('#va_video'),
        overlay: existing.querySelector('#va_overlay'),
        messageBox: existing.querySelector('#va_messageBox'),
        alertText: existing.querySelector('#va_alertText'),
        scanButton: existing.querySelector('#va_scanButton'),
        closeButton: existing.querySelector('#va_closeButton'),
        canvas: existing.querySelector('#va_canvas')
      };
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'va-root';
    wrapper.id = 'visualAidRoot';
    wrapper.style.position = 'fixed';
    wrapper.style.inset = '0';
    wrapper.style.zIndex = '9999';
    wrapper.style.pointerEvents = 'auto';

    const video = document.createElement('video');
    video.className = 'va-video';
    video.id = 'va_video';
    video.autoplay = true;
    video.playsInline = true;

    const overlay = document.createElement('div');
    overlay.className = 'va-overlay';
    overlay.id = 'va_overlay';
    
    // Add minimal internal styles for the overlay structure
    overlay.style.cssText = 'position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 20px; background-color: rgba(0,0,0,0.3);';

    const messageBox = document.createElement('div');
    messageBox.className = 'va-message';
    messageBox.id = 'va_messageBox';
    // Add minimal internal styles for messageBox
    messageBox.style.cssText = 'padding: 15px; border-radius: 10px; max-width: 90%; text-align: center; color: black; transition: opacity 0.3s ease;';

    const alertText = document.createElement('p');
    alertText.id = 'va_alertText';
    alertText.style.fontWeight = '700';
    alertText.textContent = 'Camera initializing...';
    messageBox.appendChild(alertText);

    const btnRow = document.createElement('div');
    btnRow.className = 'va-btn-row';
    btnRow.style.cssText = 'display: flex; gap: 20px;';

    const scanButton = document.createElement('button');
    scanButton.className = 'va-scan';
    scanButton.id = 'va_scanButton';
    scanButton.textContent = 'TAP TO SCAN';
    scanButton.style.cssText = 'padding: 10px 20px; border-radius: 8px; font-weight: bold; background-color: #3b82f6; color: white;';


    const closeButton = document.createElement('button');
    closeButton.className = 'va-close';
    closeButton.id = 'va_closeButton';
    closeButton.textContent = 'CLOSE';
    closeButton.style.cssText = 'padding: 10px 20px; border-radius: 8px; font-weight: bold; background-color: #ef4444; color: white;';


    btnRow.appendChild(scanButton);
    btnRow.appendChild(closeButton);

    overlay.appendChild(messageBox);
    overlay.appendChild(btnRow);
    wrapper.appendChild(video);
    wrapper.appendChild(overlay);

    const canvas = document.createElement('canvas');
    canvas.id = 'va_canvas';
    canvas.style.display = 'none';
    wrapper.appendChild(canvas);

    document.body.appendChild(wrapper);

    return { root: wrapper, video, overlay, messageBox, alertText, scanButton, closeButton, canvas };
  }

  function updateMessage(text, visible = true, color = null, scanning = false) {
    if (!handles) return;
    try {
      handles.alertText.textContent = text || '';
      if (visible) handles.messageBox.style.opacity = '1';
      else handles.messageBox.style.opacity = '0';

      // inline fallback bg color
      if (color === 'red') handles.messageBox.style.backgroundColor = 'rgba(239,68,68,0.92)';
      else if (color === 'green') handles.messageBox.style.backgroundColor = 'rgba(34,197,94,0.92)';
      else if (color === 'yellow') handles.messageBox.style.backgroundColor = 'rgba(250,204,21,0.92)';
      else handles.messageBox.style.backgroundColor = 'rgba(255,255,255,0.95)';

      if (scanning) {
        handles.scanButton.textContent = 'SCANNING...';
        handles.scanButton.disabled = true;
      } else {
        handles.scanButton.textContent = 'TAP TO SCAN';
        handles.scanButton.disabled = false;
      }
    } catch (e) {
      console.error('visualAid:updateMessage', e);
    }
  }

  function speak(text, cb = () => {}) {
    try {
      if (!('speechSynthesis' in window)) return cb();
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.pitch = 1;
      u.rate = 1.2;
      u.onend = cb;
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn('visualAid:speak error', e);
      cb();
    }
  }

  function simulateDetection() {
    if (!handles) return;
    if (handles.scanButton.disabled) return;
    updateMessage('Scanning...', true, null, true);
    setTimeout(() => {
      const r = obstacleOptions[Math.floor(Math.random() * obstacleOptions.length)];
      updateMessage(r.text, true, r.color, true);
      speak(r.text, () => updateMessage(r.text, true, r.color, false));
    }, 1200);
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      updateMessage('Camera API not supported.', true, 'red', false);
      console.error('visualAid: getUserMedia not supported');
      return;
    }
    try {
      const constraints = { video: { facingMode: { ideal: 'environment' } }, audio: false };
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!handles || !handles.video) return;
      handles.video.srcObject = mediaStream;
      handles.video.onloadedmetadata = () => {
        handles.video.play().catch(() => {});
        updateMessage('Camera ready. Tap the screen to scan for obstacles.', true, null, false);
        speak('Camera ready. Tap the screen to scan for obstacles.');
      };
    } catch (err) {
      console.error('visualAid: camera error', err);
      updateMessage('Camera Error: grant permission or use a device with a camera.', true, 'red', false);
      speak('Error. Camera failed to start.');
      if (handles && handles.scanButton) handles.scanButton.disabled = true;
    }
  }

  function stopCamera() {
    if (mediaStream) {
      const tracks = mediaStream.getTracks();
      tracks.forEach(t => { try { t.stop(); } catch (e) {} });
      mediaStream = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function cleanup() {
    try {
      if (handles && handles.overlay && overlayClickHandler) handles.overlay.removeEventListener('click', overlayClickHandler);
      if (handles && handles.scanButton && handles._scanHandler) handles.scanButton.removeEventListener('click', handles._scanHandler);
      if (handles && handles.closeButton && handles._closeHandler) handles.closeButton.removeEventListener('click', handles._closeHandler);
    } catch (e) { console.warn('visualAid: listener removal err', e); }

    stopCamera();

    if (handles && handles.root && handles.root.parentNode) {
      try { handles.root.parentNode.removeChild(handles.root); } catch (e) {}
    }
    handles = null;
    overlayClickHandler = null;
    isOpen = false;
  }

  async function openVisualAid() {
    if (isOpen) { console.log('visualAid: already open'); return; }
    isOpen = true;
    handles = createUI();
    handles._scanHandler = simulateDetection;
    handles._closeHandler = () => closeVisualAid();

    overlayClickHandler = (ev) => {
      if (ev.target && ev.target.id === 'va_closeButton') return;
      simulateDetection();
    };

    try {
      handles.overlay.addEventListener('click', overlayClickHandler);
      handles.scanButton.addEventListener('click', handles._scanHandler);
      handles.closeButton.addEventListener('click', handles._closeHandler);
    } catch (e) {
      console.error('visualAid: attach listeners error', e);
    }

    await startCamera();
  }

  function closeVisualAid() {
    cleanup();
  }

  // expose globally
  window.openVisualAid = openVisualAid;
  window.closeVisualAid = closeVisualAid;
})();


// Emergency Alert module (LLM & TTS)
// Exposes global functions: openEmergencyAlert(), closeEmergencyAlert()
(function emergencyAlertModule() {
  let handles = {};
  let currentState = 'IDLE';
  let micStream = null;
  let isOpen = false;

  const STATUS_CODES = {
    IDLE: 'IDLE',
    LISTENING: 'LISTENING',
    TRIGGERED_LOADING: 'TRIGGERED_LOADING',
    ALERT: 'ALERT'
  };

  /** Converts basic Markdown to HTML for display */
  function markdownToHtml(md) {
    let html = md.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const listRegex = /(\d+\.\s.*?(?:\n\d+\.\s.*?)*)/g;
    html = html.replace(listRegex, (match) => {
      const items = match.trim().split('\n').map(item => {
        return `<li>${item.replace(/^\d+\.\s/, '').trim()}</li>`;
      }).join('');
      return `<ol class="list-decimal list-inside ml-4 mt-2 text-base">${items}</ol>`;
    });
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  /** Uses the Web Speech API to speak text. */
  function speak(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.pitch = 1.0;
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Text-to-Speech not supported.");
    }
  }

  /** Stops the microphone stream */
  function stopMic() {
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /** Calls Gemini API for a grounded emergency response with exponential backoff. */
  async function getEmergencyResponse(userQuery) {
    const systemPrompt = "You are an expert emergency response bot. Your task is to provide a concise, immediate, and authoritative emergency response summary. The output must be less than 80 words and formatted in clean Markdown. The response MUST include: 1. A bolded, one-line summary of the potential emergency situation. 2. A clear, numbered list of 3-5 immediate steps the user should take.";
    
    const apiKey = ""; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      tools: [{ "google_search": {} }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
          const text = candidate.content.parts[0].text;
          
          let sources = [];
          const groundingMetadata = candidate.groundingMetadata;
          if (groundingMetadata && groundingMetadata.groundingAttributions) {
            sources = groundingMetadata.groundingAttributions
              .map(attribution => ({
                uri: attribution.web?.uri,
                title: attribution.web?.title,
              }))
              .filter(source => source.uri && source.title);
          }

          return { text, sources };

        } else {
          throw new Error("API response content structure invalid.");
        }
      } catch (error) {
        console.error(`Attempt ${i + 1} failed:`, error);
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw new Error("Failed to get emergency response after multiple retries.");
        }
      }
    }
  }

  //  UI Creation and Management 

  function createUI() {
    if (handles.root) return handles;

    const root = document.createElement('div');
    root.id = 'emergency-alert-root';
    // Tailwind-like classes for placement and styling
    root.style.cssText = `
      position: fixed; inset: 0; z-index: 9998; background-color: rgba(0,0,0,0.5); 
      display: flex; justify-content: center; align-items: center; 
      transition: background-color 0.5s ease;
    `;
    root.innerHTML = `
      <style>
        @keyframes pulse-red {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); }
        }
        .alert-pulse { animation: pulse-red 2s infinite; }
      </style>
      <div id="mainPanel" class="w-full max-w-xl mx-auto p-4 transition-all duration-500">
        <div id="panelContent" class="bg-white rounded-2xl shadow-2xl p-6 md:p-8 text-center border-t-8 border-indigo-600 transition-all duration-500">
          
          <h1 id="titleText" class="text-2xl font-extrabold text-indigo-700 mb-2">SOUND ALERT MONITOR</h1>
          <div id="micStatus" class="flex items-center justify-center mb-6 text-gray-500 text-sm">
              <svg id="micIcon" class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7v0a7 7 0 01-7-7v0m14 0V9a7 7 0 00-7-7v0a7 7 0 00-7 7v2"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18v3m-3-3h6"></path></svg>
              <span id="micStatusText">Microphone: Idle</span>
          </div>
          
          <div id="statusSection">
               <p id="statusText" class="text-lg text-gray-600 mb-8">Click 'Start Listening' to ready the detector.</p>
               <button id="mainActionButton" 
                      class="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-indigo-700 transition duration-150 transform hover:scale-[1.01] disabled:opacity-50">
                  START REAL-TIME LISTENER
              </button>
          </div>

          <div id="contextSection" class="mt-6 hidden">
              <textarea id="emergencyContext" 
                        class="w-full p-3 border border-gray-300 rounded-xl focus:ring-red-500 focus:border-red-500 transition duration-150"
                        rows="2" 
                        placeholder="What did the detector hear? (e.g., 'Loud siren and screaming')"></textarea>
              
              <button id="simulateButton" 
                      class="mt-3 w-full bg-red-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-red-700 transition duration-150 transform hover:scale-[1.01] disabled:opacity-50 disabled:cursor-wait">
                  SIMULATE EMERGENCY ALERT
              </button>
          </div>

          <div id="alertResponseSection" class="mt-6 p-4 bg-gray-50 rounded-xl text-left hidden">
              <p class="text-sm font-semibold text-gray-800 mb-2 border-b pb-1">IMMEDIATE ACTION PLAN:</p>
              <div id="responseText" class="text-gray-800 text-base leading-relaxed"></div>
              <div id="sourceDisplay" class="mt-4 text-xs text-gray-500 border-t pt-2"></div>
          </div>
          
        </div>
      </div>
    `;
    document.body.appendChild(root);

    // Cache handles
    handles.root = root;
    handles.mainPanel = root.querySelector('#mainPanel');
    handles.panelContent = root.querySelector('#panelContent');
    handles.titleText = root.querySelector('#titleText');
    handles.micStatusText = root.querySelector('#micStatusText');
    handles.micIcon = root.querySelector('#micIcon');
    handles.statusText = root.querySelector('#statusText');
    handles.mainActionButton = root.querySelector('#mainActionButton');
    handles.contextSection = root.querySelector('#contextSection');
    handles.emergencyContext = root.querySelector('#emergencyContext');
    handles.simulateButton = root.querySelector('#simulateButton');
    handles.alertResponseSection = root.querySelector('#alertResponseSection');
    handles.responseText = root.querySelector('#responseText');
    handles.sourceDisplay = root.querySelector('#sourceDisplay');

    // Attach listeners
    handles.mainActionButton.addEventListener('click', startListening);
    handles.simulateButton.addEventListener('click', triggerAlert);
    handles.emergencyContext.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); if (currentState === STATUS_CODES.LISTENING) { triggerAlert(); } }
    });

    return handles;
  }

  function cleanup() {
    stopMic();
    if (handles.root && handles.root.parentNode) {
      try { handles.root.parentNode.removeChild(handles.root); } catch (e) {}
    }
    handles = {};
    isOpen = false;
  }

  /** Manages the UI state transitions. */
  function updateUI(status, context = '') {
    if (!handles.root) return;
    currentState = status;
    
    // Reset common styles and state
    handles.root.classList.remove('alert-pulse');
    handles.root.style.backgroundColor = 'rgba(0,0,0,0.5)';
    handles.panelContent.className = 'bg-white rounded-2xl shadow-2xl p-6 md:p-8 text-center transition-all duration-500';
    handles.micIcon.classList.remove('text-red-500', 'text-green-500', 'text-white');
    handles.micIcon.classList.add('text-gray-500');
    handles.mainActionButton.disabled = false;
    handles.contextSection.classList.add('hidden');
    handles.alertResponseSection.classList.add('hidden');
    
    switch (status) {
      case STATUS_CODES.IDLE:
        stopMic();
        handles.titleText.textContent = 'SOUND ALERT MONITOR';
        handles.panelContent.classList.add('border-t-8', 'border-indigo-600');
        handles.micStatusText.textContent = 'Microphone: Idle';
        handles.statusText.textContent = 'Click \'Start Listening\' to ready the detector.';
        handles.mainActionButton.textContent = 'START REAL-TIME LISTENER';
        handles.mainActionButton.classList.replace('bg-gray-800', 'bg-indigo-600');
        handles.mainActionButton.classList.replace('bg-red-600', 'bg-indigo-600');
        break;

      case STATUS_CODES.LISTENING:
        handles.titleText.textContent = 'LISTENING FOR ALERTS...';
        handles.panelContent.classList.add('border-t-8', 'border-green-600');
        handles.micStatusText.textContent = 'Microphone: Active';
        handles.micIcon.classList.add('text-green-500');
        handles.statusText.textContent = 'System is monitoring. Enter a sound/event and click to simulate detection.';
        handles.mainActionButton.textContent = 'STOP LISTENER';
        handles.mainActionButton.classList.replace('bg-indigo-600', 'bg-red-600');
        handles.contextSection.classList.remove('hidden');
        handles.simulateButton.classList.replace('bg-gray-800', 'bg-red-600');
        break;
      
      case STATUS_CODES.TRIGGERED_LOADING:
        handles.titleText.textContent = 'ALERT CONFIRMED! PROCESSING...';
        handles.panelContent.classList.add('border-t-8', 'border-yellow-500');
        handles.micStatusText.textContent = 'Processing Alert Context';
        handles.micIcon.classList.remove('text-green-500');
        handles.micIcon.classList.add('text-red-500');
        handles.statusText.textContent = 'Generating authoritative action plan. Standby.';
        handles.simulateButton.textContent = 'PROCESSING...';
        handles.simulateButton.disabled = true;
        handles.mainActionButton.disabled = true;
        break;

      case STATUS_CODES.ALERT:
        handles.root.style.backgroundColor = '#991b1b'; // Dark Red
        handles.panelContent.className = 'bg-red-600 rounded-2xl shadow-2xl p-6 md:p-8 text-white text-center border-t-8 border-white transition-all duration-500';
        handles.root.classList.add('alert-pulse');
        
        handles.titleText.textContent = '🚨 IMMEDIATE EMERGENCY! 🚨';
        handles.micStatusText.textContent = 'SYSTEM ALERT MODE';
        handles.micIcon.classList.add('text-white');
        handles.statusText.textContent = 'ACT NOW: FOLLOW SPOKEN INSTRUCTIONS.';
        
        handles.alertResponseSection.classList.remove('hidden');
        handles.simulateButton.textContent = 'RESET SYSTEM';
        handles.simulateButton.classList.replace('bg-red-600', 'bg-gray-800');
        handles.simulateButton.disabled = false;
        
        const { text, sources } = JSON.parse(context);
        
        const speechText = text
          .replace(/\*\*/g, '')
          .replace(/\n\d+\.\s/g, '. ')
          .replace(/\n/g, '. ')
          .trim();
          
        handles.responseText.innerHTML = markdownToHtml(text);
        speak(speechText);
        
        handles.sourceDisplay.innerHTML = sources.length > 0 
          ? 'Sources: ' + sources.map(s => `<a href="${s.uri}" target="_blank" class="text-xs underline text-red-200 hover:text-red-300">${s.title.substring(0, 30)}...</a>`).join(' | ')
          : 'No specific web sources found.';
        break;
    }
  }

  /** Step 1: Request and establish microphone access. */
  async function startListening() {
    if (currentState === STATUS_CODES.LISTENING) {
      updateUI(STATUS_CODES.IDLE);
      showToast('Listener stopped.');
      return;
    }
    
    try {
      showToast('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream = stream;
      
      updateUI(STATUS_CODES.LISTENING);
      showToast('Microphone activated. Detector is ready.');

    } catch (error) {
      console.error("Microphone access denied or failed:", error);
      showToast('Microphone access denied or failed.');
      updateUI(STATUS_CODES.IDLE);
    }
  }

  /** Step 2: Trigger the emergency response (simulating the YAMNet trigger). */
  async function triggerAlert() {
    if (currentState === STATUS_CODES.TRIGGERED_LOADING) return;
    if (currentState === STATUS_CODES.ALERT) {
      updateUI(STATUS_CODES.IDLE);
      showToast('System reset.');
      return;
    }

    const context = handles.emergencyContext.value.trim();
    if (!context) {
      showToast("Please describe the emergency to get a grounded response.");
      return;
    }

    updateUI(STATUS_CODES.TRIGGERED_LOADING);
    stopMic(); 

    try {
      const response = await getEmergencyResponse(
        `Simulate a real-world emergency described as: "${context}". Provide the immediate, authoritative response.`
      );

      updateUI(STATUS_CODES.ALERT, JSON.stringify(response));
      
    } catch (error) {
      console.error("Emergency API failed:", error);
      const errorMessage = "SYSTEM FAILURE: Could not generate response. Call local emergency services immediately (911/999).";
      speak(errorMessage);
      const fallbackResponse = { text: `**ERROR:** ${errorMessage}`, sources: [] };
      updateUI(STATUS_CODES.ALERT, JSON.stringify(fallbackResponse));
      showToast('LLM call failed. Showing fallback alert.');
    }
  }

  // --- Exposed API ---

  function openEmergencyAlert() {
    if (isOpen) return;
    isOpen = true;
    createUI();
    updateUI(STATUS_CODES.IDLE);
    showToast('Emergency Alert Mode activated.');
  }

  function closeEmergencyAlert() {
    cleanup();
    showToast('Emergency Alert Mode deactivated.');
  }
  
  window.openEmergencyAlert = openEmergencyAlert;
  window.closeEmergencyAlert = closeEmergencyAlert;

})();


// Feature wiring -
document.addEventListener('DOMContentLoaded', () => {
  // Add Tailwind and Inter font link here if not in main HTML (Optional: ensure they are loaded)
  
  const featureBtns = document.querySelectorAll('.feature-btn');

  // Ensure default inactive state
  featureBtns.forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });

  featureBtns.forEach(btn => {
    const featureName = btn.dataset.feature;
    const scriptName = SCRIPT_MAPPING[featureName];
    let openFn, closeFn;

    if (scriptName === '__visual_aid__') {
      openFn = window.openVisualAid;
      closeFn = window.closeVisualAid;
    } else if (scriptName === '__local_emergency__') {
      openFn = window.openEmergencyAlert;
      closeFn = window.closeEmergencyAlert;
    }
    // Special-case the local modules
    if (scriptName === '__visual_aid__' || scriptName === '__local_emergency__') {
      btn.addEventListener('click', async () => {
        const isActive = btn.classList.toggle('active');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        
        if (isActive) {
          showToast(`Opening ${featureName}...`);
          if (typeof openFn === 'function') {
            try {
              await openFn();
              showToast(`${featureName} activated`);
            } catch (err) {
              console.error(`${featureName} failed to open`, err);
              btn.classList.remove('active');
              btn.setAttribute('aria-pressed', 'false');
              showToast(`Failed to activate ${featureName}`);
            }
          } else {
            console.error(`${featureName} API missing`);
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
            showToast(`${featureName} module not loaded`);
          }
        } else {
          showToast(`Stopping ${featureName}...`);
          try {
            if (typeof closeFn === 'function') closeFn();
            showToast(`${featureName} stopped`);
          } catch (err) {
            console.error(`${featureName} failed to stop`, err);
            showToast(`Failed to stop ${featureName}`);
          }
        }
      });
      return; 
    }

    // If the mapping is a placeholder (#) or undefined, keep it UI-only (no starter)
    if (!scriptName || scriptName === '#') {
      btn.addEventListener('click', () => {
        const isActive = btn.classList.toggle('active');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        showToast(`${featureName} ${isActive ? 'activated' : 'deactivated'}`);
      });
      return;
    }

    // For mapped scripts that require the starter/flask controller
    btn.addEventListener('click', async () => {
      const isActive = btn.classList.toggle('active');
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      const path = isActive ? `/start-script/${scriptName}` : `/stop-script/${scriptName}`;
      showToast(isActive ? `Requesting ${scriptName} start...` : `Stopping ${scriptName}...`);
      const json = await starterRequest(path, 'POST');
      if (json && json.ok) {
        showToast(`${scriptName} ${isActive ? 'starting' : 'stopped'}`);
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        showToast(`${scriptName} failed to start/stop.`);
      }
    });
  });
});