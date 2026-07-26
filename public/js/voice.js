/* ============================================================
   VOICE.JS — WebRTC P2P Voice Chat + Screen Share
   ============================================================ */

'use strict';

const safeStorage = {
  getItem(key) { try { return localStorage.getItem(key); } catch(e) { return null; } },
  setItem(key, value) { try { localStorage.setItem(key, value); } catch(e) {} }
};

// ─── VOICE CHAT STATE ───────────────────────────────────────
window._localStream          = null;
window._peerConnections     = {}; // username -> RTCPeerConnection
window._userAudioElements   = {}; // username -> HTMLAudioElement
window._userAudioNodes      = {}; // username -> { source, analyser, gainNode }
window._userVolumes         = {}; // username -> volume 0-2
window._userLocalMuted      = {}; // username -> boolean
window._partyVoiceMembers   = {}; // username -> { micMuted, deafened, pingMs, channelId }
window._peerIceQueues       = {}; // username -> []
window._micMuted            = false;
window._deafened            = false;
window._selectedMicId       = safeStorage.getItem('os_selected_mic_id') || 'default';
window._voiceInterval       = null;
window._voiceSignalsInterval = null;
window._audioContext        = null;
window._peerMissingTicks    = {};
window._currentChannelId    = null;
window._peerReconnectTimers = {}; // username -> timer
window._voiceConnState      = 'disconnected'; // 'connecting' | 'connected' | 'disconnected'
window._voiceSwitchToken    = 0;
let _signalPollingSpeed     = 350;

function updateVoiceConnectionStatus(state) {
  window._voiceConnState = state;

  document.querySelectorAll('.voice-status-pill').forEach(p => p.remove());

  if (state === 'disconnected' || !window._currentChannelId) return;

  const currentChanCard = document.getElementById(`channel-card-${window._currentChannelId}`);
  if (currentChanCard) {
    const header = currentChanCard.querySelector('.sub-channel-header');
    if (header) {
      const pill = document.createElement('div');
      pill.className = `voice-status-pill ${state} icon-only`;
      if (state === 'connecting') {
        pill.setAttribute('data-tooltip', 'Kanal Bağlantısı Kuruluyor...');
        pill.innerHTML = `<span class="voice-spinner"></span>`;
      } else if (state === 'connected') {
        pill.setAttribute('data-tooltip', 'Ses Bağlantısı Aktif (RTC)');
        pill.innerHTML = `<span class="voice-connected-dot"></span>`;
      }
      header.appendChild(pill);
    }
  }
}

// ─── SCREEN SHARE STATE ────────────────────────────────────
window._screenStream        = null;      // local screen capture stream
window._ssConnections       = {};        // username -> RTCPeerConnection (screen share)
window._ssRemoteStreams     = {};        // username -> MediaStream (incoming screen)
window._ssPolling           = null;      // setInterval for screen share state polling
window._ssCurrentSharer     = null;      // username of person being viewed

// ─── WebRTC CONFIG ──────────────────────────────────────────
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80',    username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',   username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

// ─── INIT ────────────────────────────────────────────────────
async function initVoiceChat(partyId) {
  if (!partyId) return;
  console.log('[VoiceChat] Initializing for party:', partyId);

  window._currentPartyId = partyId;
  // Full cleanup without resetting partyId
  stopVoiceChat(false);
  window._currentPartyId = partyId;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('[VoiceChat] Insecure context / No mediaDevices API.');
    const handoverBanner = document.getElementById('voiceHandoverBanner');
    if (handoverBanner) {
      handoverBanner.innerHTML = `
        <div class="voice-handover-pill warning" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.4);">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" width="18" height="18">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style="flex:1">
            <div style="font-weight:800; color:#ef4444; font-size:12.5px;">HTTPS / Güvenli Bağlantı Gerekli</div>
            <div style="font-size:11px; color:rgba(255,255,255,0.7); margin-top:2px;">HTTP IP adresinden (http://${window.location.hostname}) mikrofona izin verilmez. Lütfen HTTPS veya localhost adresini kullanın.</div>
          </div>
        </div>`;
      handoverBanner.style.display = 'block';
    }
    showToast('Mikrofon erişimi için HTTPS veya localhost gereklidir.');
    return;
  }

  try {
    const constraints = {
      audio: window._selectedMicId && window._selectedMicId !== 'default'
        ? { deviceId: { exact: window._selectedMicId }, echoCancellation: true, noiseSuppression: true, sampleRate: 48000 }
        : { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
      video: false
    };

    try {
      window._localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch(e) {
      console.warn('[VoiceChat] Selected mic failed, falling back:', e);
      window._localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    }

    setMicMuteState(window._micMuted);

    // AudioContext
    try {
      window._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (window._audioContext.state === 'suspended') {
        const resume = () => {
          if (window._audioContext?.state === 'suspended') window._audioContext.resume().catch(() => {});
          document.removeEventListener('click', resume);
          document.removeEventListener('touchstart', resume);
        };
        document.addEventListener('click', resume);
        document.addEventListener('touchstart', resume);
      }
    } catch(e) { console.warn('[VoiceChat] AudioContext init failed:', e); }

    if (currentUser?.username) setupUserSpeechAnalyser(currentUser.username, window._localStream);

    startVoiceStateLoop(partyId);
    startVoiceSignalsLoop(partyId);
    startScreenShareStatePolling(partyId);

  } catch(err) {
    console.error('[VoiceChat] Mic access failed:', err);
    showToast('Mikrofona erişilemedi. Lütfen izinleri kontrol edin.');
  }
}

function stopVoiceChat(resetPartyId = true) {
  console.log('[VoiceChat] Stopping. resetPartyId:', resetPartyId);
  const pId = window._currentPartyId;
  if (resetPartyId && window._currentPartyId) {
    if (typeof playChannelSound === 'function') playChannelSound('disconnect');
    window._currentPartyId = null;
  }

  if (pId) {
    try {
      fetch(`/api/parties/${pId}/voice-leave`, { method: 'POST' }).catch(() => {});
    } catch(e) {}
  }

  if (window._voiceInterval)        { clearInterval(window._voiceInterval);        window._voiceInterval = null; }
  if (window._voiceSignalsInterval)  { clearInterval(window._voiceSignalsInterval);  window._voiceSignalsInterval = null; }
  if (window._ssPolling)             { clearInterval(window._ssPolling);             window._ssPolling = null; }

  // Stop screen share if explicitly leaving party
  if (resetPartyId) {
    stopScreenShare(false);
  }

  // Stop local stream
  if (window._localStream) {
    window._localStream.getTracks().forEach(t => t.stop());
    window._localStream = null;
  }

  // Close peer connections
  Object.keys(window._peerConnections).forEach(u => { try { window._peerConnections[u].close(); } catch(e){} });
  window._peerConnections = {};

  // Remove audio elements
  Object.keys(window._userAudioElements).forEach(u => {
    try { window._userAudioElements[u].pause(); window._userAudioElements[u].remove(); } catch(e){}
  });
  window._userAudioElements = {};
  window._userAudioNodes    = {};
  window._partyVoiceMembers = {};
  window._peerIceQueues     = {};
  window._peerMissingTicks  = {};

  Object.values(window._peerReconnectTimers || {}).forEach(t => clearTimeout(t));
  window._peerReconnectTimers = {};

  if (window._audioContext) {
    try { window._audioContext.close(); } catch(e){}
    window._audioContext = null;
  }
}

// Send beacon on page unload so active voice session is instantly cleared
window.addEventListener('beforeunload', () => {
  if (window._currentPartyId) {
    try {
      navigator.sendBeacon(`/api/parties/${window._currentPartyId}/voice-leave`);
    } catch(e) {}
  }
});

// ─── INSTANT CHANNEL SWITCH ──────────────────────────────────
async function switchVoiceChannel(newChannelId) {
  const currentToken = Date.now();
  window._voiceSwitchToken = currentToken;
  console.log('[VoiceChat] Channel switch to:', newChannelId, 'token:', currentToken);

  updateVoiceConnectionStatus('connecting');

  // 1. If screen share is active, stop it immediately and notify user
  if (window._screenStream) {
    stopScreenShare(true);
    showToast('Kanal değiştirildiği için ekran paylaşımı sonlandırıldı.');
  }

  // 2. Drop all existing peer connections immediately
  const existingPeers = Object.keys(window._peerConnections);
  existingPeers.forEach(u => closePeerConnection(u));
  window._peerMissingTicks = {};
  window._peerIceQueues = {};

  window._currentChannelId = newChannelId;

  // 3. Boost signal polling speed to 120ms during transition for instant WebRTC handshake
  boostSignalPollingSpeed();

  // 4. Force immediate voice state update to update server and get new channel members
  await triggerVoiceStateUpdate();

  // Abort if rapid channel click happened while fetching state
  if (window._voiceSwitchToken !== currentToken) {
    console.log('[VoiceChat] Aborting outdated switch token:', currentToken);
    return;
  }

  // 5. Immediately establish peer connections for members in new channel
  await maintainPeerConnections();

  // 6. Pull signals right away
  await fetchVoiceSignals();

  // If no other members in channel, mark connected
  const sameChannelPeers = Object.keys(window._partyVoiceMembers || {}).filter(u => {
    const m = window._partyVoiceMembers[u];
    return m && parseInt(m.channelId) === parseInt(newChannelId);
  });
  if (sameChannelPeers.length === 0) {
    updateVoiceConnectionStatus('connected');
  }
}

function boostSignalPollingSpeed() {
  _signalPollingSpeed = 120;
  if (window._currentPartyId) {
    startVoiceSignalsLoop(window._currentPartyId);
  }
  setTimeout(() => {
    _signalPollingSpeed = 350;
    if (window._currentPartyId) {
      startVoiceSignalsLoop(window._currentPartyId);
    }
  }, 4000);
}

// ─── STATE LOOP ──────────────────────────────────────────────
function startVoiceStateLoop(partyId) {
  const sendVoiceState = async () => {
    if (!window._currentPartyId) return;
    await triggerVoiceStateUpdate();
  };

  sendVoiceState();
  window._voiceInterval = setInterval(sendVoiceState, 4000);
}

// ─── SIGNAL LOOP (fast polling) ─────────────────────────────
function getDeviceSessionId() {
  if (!window._deviceSessionId) {
    let id = localStorage.getItem('os_device_session_id') || sessionStorage.getItem('os_device_session_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      localStorage.setItem('os_device_session_id', id);
      sessionStorage.setItem('os_device_session_id', id);
    } else {
      localStorage.setItem('os_device_session_id', id);
      sessionStorage.setItem('os_device_session_id', id);
    }
    window._deviceSessionId = id;
  }
  return window._deviceSessionId;
}

function handleVoiceHandoverDisconnect() {
  console.log('[VoiceChat] Handover force disconnect triggered on this device.');

  // 1. Play disconnect sound chime
  if (typeof playChannelSound === 'function') playChannelSound('disconnect');

  // 2. Stop WebRTC voice chat streams
  if (typeof stopVoiceChat === 'function') stopVoiceChat(true);

  // 3. Clear active party room state on this device
  if (typeof clearActiveParty === 'function') clearActiveParty();

  // 4. Close Party Modal if open on this device
  if (typeof closePartyModal === 'function') closePartyModal();

  // 5. Hide overlays and banners
  const overlay = document.getElementById('partyFocusOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.classList.remove('has-active-handover-blocker');
  }
  const modal = document.getElementById('partyModal');
  if (modal) modal.classList.remove('has-active-handover-blocker');

  const container1 = document.getElementById('voiceHandoverBanner');
  const container2 = document.getElementById('overlayVoiceHandoverBanner');
  if (container1) container1.style.display = 'none';
  if (container2) container2.style.display = 'none';

  // 6. Show toast notification to user
  if (typeof showToast === 'function') {
    showToast('Sesli sohbet diğer cihazınıza aktarıldı');
  }
}

let _handoverTargetPartyId = null;
let _handoverTargetChannelId = null;
let _handoverDismissed = false;

window.dismissHandoverOverlay = function dismissHandoverOverlay() {
  const container1 = document.getElementById('voiceHandoverBanner');
  const container2 = document.getElementById('overlayVoiceHandoverBanner');
  if (container1) container1.style.display = 'none';
  if (container2) container2.style.display = 'none';
};

async function checkAndRenderHandoverButton(partyId) {
  const container1 = document.getElementById('voiceHandoverBanner');
  const container2 = document.getElementById('overlayVoiceHandoverBanner');

  const hideAll = () => {
    if (container1) container1.style.display = 'none';
    if (container2) container2.style.display = 'none';
  };

  // RULE 1: Visitor / Logged-out guard — ABSOLUTELY NEVER SHOW HANDOVER TO UNAUTHENTICATED VISITORS!
  if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) {
    hideAll();
    return;
  }

  // RULE 2: Local WebRTC Voice Active Guard — If this device is ALREADY in voice locally, hide handover!
  if (window._localStream && window._localStream.getAudioTracks().some(t => t.readyState === 'live')) {
    hideAll();
    return;
  }

  try {
    const res = await fetch(`/api/user/active-voice-session?deviceId=${encodeURIComponent(getDeviceSessionId())}`);
    
    // RULE 3: HTTP Auth Guard — If 401 Unauthorized, 403 Forbidden, 500 or not OK, immediately hide!
    if (!res.ok) {
      hideAll();
      return;
    }

    const data = await res.json();
    
    // RULE 4: Multi-Device Valid Handover Guard — MUST have active voice AND be a DIFFERENT device AND have valid partyId!
    if (data.hasActiveVoice && data.isOtherDevice && data.partyId) {
      _handoverTargetPartyId = partyId || data.partyId;
      _handoverTargetChannelId = data.channelId || null;

      const html = `
        <div class="voice-handover-card">
          <div class="voice-handover-icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="24" height="24">
              <rect x="5" y="2" width="14" height="20" rx="3"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>
          <div class="voice-handover-card-title">Sesli Sohbet Başka Cihazda Aktif</div>
          <div class="voice-handover-card-desc">Şu an bilgisayarınız veya başka bir cihazınız bu odak odasında sesli sohbette. Sesi bu cihaza devralmak için aşağıdaki butona basın.</div>
          <button class="voice-handover-btn-lg" onclick="transferVoiceToCurrentDevice(${_handoverTargetPartyId}, ${_handoverTargetChannelId || 'null'})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
              <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            <span>Buradan Bağlan</span>
          </button>
        </div>`;

      if (container1) { container1.innerHTML = html; container1.style.display = 'block'; }
      if (container2) { container2.innerHTML = html; container2.style.display = 'block'; }
      return;
    }
  } catch (e) {}

  hideAll();
}

window.transferVoiceToCurrentDevice = async function transferVoiceToCurrentDevice(partyId, channelId) {
  console.log('[VoiceChat] Transfer voice requested for:', partyId, channelId);
  let pId = partyId || _handoverTargetPartyId || window._currentPartyId;
  let cId = channelId || _handoverTargetChannelId || window._currentChannelId;

  if (!pId) {
    try {
      const res = await fetch(`/api/user/active-voice-session?deviceId=${encodeURIComponent(getDeviceSessionId())}`);
      if (res.ok) {
        const data = await res.json();
        if (data.hasActiveVoice) {
          pId = data.partyId;
          cId = data.channelId;
        }
      }
    } catch(e) {}
  }

  if (!pId) {
    if (typeof showToast === 'function') showToast('Aktarılacak aktif sesli sohbet bulunamadı');
    return;
  }

  const deviceId = getDeviceSessionId();

  try {
    const res = await fetch(`/api/parties/${pId}/voice-handover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDeviceId: deviceId, channelId: cId })
    });
    if (res.ok) {
      // 1. Close Odak Odaları Modal cleanly
      if (typeof closePartyModal === 'function') {
        closePartyModal();
      }

      // 2. Hide Handover banners
      const container1 = document.getElementById('voiceHandoverBanner');
      const container2 = document.getElementById('overlayVoiceHandoverBanner');
      if (container1) container1.style.display = 'none';
      if (container2) container2.style.display = 'none';

      // 3. Connect voice on current device with force transfer = true
      if (typeof setActiveParty === 'function') await setActiveParty(pId, true);
      if (typeof joinChannel === 'function' && cId) {
        await joinChannel(cId);
      } else if (typeof initVoiceChat === 'function') {
        await initVoiceChat(pId);
      }
      showToast('Sesli sohbet bu cihaza aktarıldı');
    }
  } catch (e) {
    showToast('Ses aktarılamadı');
  }
};

// Explicit click listener on document for handover buttons
document.addEventListener('click', (e) => {
  const primaryBtn = e.target.closest('#globalHandoverActionBtn, .global-handover-btn-primary, .voice-handover-btn-lg');
  if (primaryBtn) {
    e.preventDefault();
    e.stopPropagation();
    window.transferVoiceToCurrentDevice();
    return;
  }

  const secondaryBtn = e.target.closest('.global-handover-btn-secondary');
  if (secondaryBtn) {
    e.preventDefault();
    e.stopPropagation();
    window.dismissHandoverOverlay();
    return;
  }
});

async function fetchVoiceSignals() {
  if (!window._currentPartyId) return;
  try {
    const res = await fetch(`/api/parties/${window._currentPartyId}/voice-signals`);
    if (res.status === 429) return;
    if (res.status === 401 || res.status === 404 || res.status === 403) {
      if (typeof stopVoiceChat === 'function') stopVoiceChat(true);
      if (typeof clearActiveParty === 'function') clearActiveParty();
      return;
    }
    if (res.ok) {
      const signals = await res.json();
      for (const sig of signals) {
        if (sig.signal && sig.signal._handover) {
          if (sig.signal.newDeviceId !== getDeviceSessionId()) {
            handleVoiceHandoverDisconnect();
          }
        } else if (sig.signal && sig.signal._ssShare) {
          await handleIncomingScreenShareSignal(sig.fromUsername, sig.signal);
        } else {
          await handleIncomingSignal(sig.fromUsername, sig.signal);
        }
      }
    }
  } catch(e) {
    // Network reconnecting/polling pause
  }
}

function startVoiceSignalsLoop(partyId) {
  if (window._voiceSignalsInterval) clearInterval(window._voiceSignalsInterval);
  window._voiceSignalsInterval = setInterval(fetchVoiceSignals, _signalPollingSpeed);
}

// ─── PEER CONNECTION MANAGEMENT ──────────────────────────────
async function maintainPeerConnections() {
  const allMembers = window._partyVoiceMembers || {};
  const sameChannel = Object.keys(allMembers).filter(uname => {
    const m = allMembers[uname];
    if (!window._currentChannelId) return true;
    return m && parseInt(m.channelId) === parseInt(window._currentChannelId);
  });

  // Connect to same-channel members
  for (const username of sameChannel) {
    window._peerMissingTicks[username] = 0;
    if (!window._peerConnections[username]) {
      const isInitiator = currentUser?.username < username;
      if (isInitiator) {
        console.log('[VoiceChat] Initiating connection to:', username);
        await createPeerConnection(username, true);
      }
    } else {
      // Check if connection is broken and recover it
      const pc = window._peerConnections[username];
      if (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed') {
        console.warn('[VoiceChat] Connection failed with', username, '- recovering...');
        closePeerConnection(username);
        const isInitiator = currentUser?.username < username;
        if (isInitiator) await createPeerConnection(username, true);
      }
    }
  }

  // Close connections for members in different channels
  Object.keys(window._peerConnections).forEach(username => {
    if (!sameChannel.includes(username)) {
      window._peerMissingTicks[username] = (window._peerMissingTicks[username] || 0) + 1;
      if (window._peerMissingTicks[username] >= 2) {
        console.log('[VoiceChat] Closing stale connection to:', username);
        closePeerConnection(username);
        delete window._peerMissingTicks[username];
      }
    } else {
      window._peerMissingTicks[username] = 0;
    }
  });
}

async function createPeerConnection(targetUsername, isInitiator) {
  if (window._peerConnections[targetUsername]) return;

  const pc = new RTCPeerConnection(RTC_CONFIG);
  window._peerConnections[targetUsername] = pc;

  // Add local audio tracks
  if (window._localStream) {
    window._localStream.getTracks().forEach(track => pc.addTrack(track, window._localStream));
  }

  // ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate && window._currentPartyId) {
      sendVoiceSignal(targetUsername, { type: 'candidate', candidate: event.candidate });
    }
  };

  // ICE state monitoring + auto-recovery
  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    console.log(`[ICE] ${targetUsername}: ${state}`);
    if (state === 'connected' || state === 'completed') {
      updateVoiceConnectionStatus('connected');
      if (window._peerReconnectTimers[targetUsername]) {
        clearTimeout(window._peerReconnectTimers[targetUsername]);
        delete window._peerReconnectTimers[targetUsername];
      }
    } else if (state === 'failed') {
      console.warn(`[VoiceChat] ICE failed for ${targetUsername}, attempting reconnect in 2s`);
      if (!window._peerReconnectTimers[targetUsername]) {
        window._peerReconnectTimers[targetUsername] = setTimeout(async () => {
          delete window._peerReconnectTimers[targetUsername];
          if (window._peerConnections[targetUsername]) {
            closePeerConnection(targetUsername);
            const isInit = currentUser?.username < targetUsername;
            if (isInit && window._currentPartyId) {
              await createPeerConnection(targetUsername, true);
            }
          }
        }, 2000);
      }
    } else if (state === 'disconnected') {
      // Brief grace period before treating as failed
      if (!window._peerReconnectTimers[targetUsername]) {
        window._peerReconnectTimers[targetUsername] = setTimeout(async () => {
          delete window._peerReconnectTimers[targetUsername];
          const current = window._peerConnections[targetUsername];
          if (current && (current.iceConnectionState === 'disconnected' || current.iceConnectionState === 'failed')) {
            closePeerConnection(targetUsername);
            const isInit = currentUser?.username < targetUsername;
            if (isInit && window._currentPartyId) await createPeerConnection(targetUsername, true);
          }
        }, 5000);
      }
    }
  };

  // Receive remote audio
  pc.ontrack = (event) => {
    console.log('[VoiceChat] Track from:', targetUsername, event.track.kind);
    updateVoiceConnectionStatus('connected');
    const remoteStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);

    let audio = window._userAudioElements[targetUsername];
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = 'none';
      audio.id = `remote-audio-${targetUsername}`;
      document.body.appendChild(audio);
      window._userAudioElements[targetUsername] = audio;
    }

    if (audio.srcObject !== remoteStream) audio.srcObject = remoteStream;
    applyUserVolume(targetUsername);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn(`[VoiceChat] Autoplay blocked for ${targetUsername}:`, err);
        const unlock = () => {
          audio?.play().catch(() => {});
          document.removeEventListener('click', unlock);
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock);
        document.addEventListener('touchstart', unlock);
      });
    }

    setupUserSpeechAnalyser(targetUsername, remoteStream);
  };

  if (isInitiator) {
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    await pc.setLocalDescription(offer);
    await sendVoiceSignal(targetUsername, { type: 'offer', offer: pc.localDescription });
  }
}

function closePeerConnection(username) {
  try {
    const pc = window._peerConnections[username];
    if (pc) {
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.ontrack = null;
      pc.close();
      delete window._peerConnections[username];
    }
  } catch(e){}
  try {
    const audio = window._userAudioElements[username];
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      delete window._userAudioElements[username];
    }
  } catch(e){}
  try { delete window._userAudioNodes[username]; } catch(e){}
  try { delete window._peerIceQueues[username]; } catch(e){}
  if (window._peerReconnectTimers[username]) {
    clearTimeout(window._peerReconnectTimers[username]);
    delete window._peerReconnectTimers[username];
  }
}

async function sendVoiceSignal(toUsername, signal) {
  if (!window._currentPartyId) return;
  try {
    await fetch(`/api/parties/${window._currentPartyId}/voice-signal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUsername, signal })
    });
  } catch(e){}
}

async function drainIceQueue(username, pc) {
  const queue = window._peerIceQueues[username];
  if (!queue) return;
  while (queue.length > 0) {
    const candidate = queue.shift();
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e){}
  }
}

async function handleIncomingSignal(fromUsername, signal) {
  if (!window._peerConnections[fromUsername]) {
    await createPeerConnection(fromUsername, false);
  }
  const pc = window._peerConnections[fromUsername];
  if (!pc) return;

  if (signal.type === 'offer') {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendVoiceSignal(fromUsername, { type: 'answer', answer: pc.localDescription });
      await drainIceQueue(fromUsername, pc);
    } catch(e) { console.warn('[VoiceChat] Offer handling failed:', e); }
  } else if (signal.type === 'answer') {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
      await drainIceQueue(fromUsername, pc);
    } catch(e) { console.warn('[VoiceChat] Answer handling failed:', e); }
  } else if (signal.type === 'candidate') {
    try {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else {
        if (!window._peerIceQueues[fromUsername]) window._peerIceQueues[fromUsername] = [];
        window._peerIceQueues[fromUsername].push(signal.candidate);
      }
    } catch(e){}
  }
}

// ─── AUDIO CONTROLS ──────────────────────────────────────────
function applyUserVolume(username) {
  const isLocallyMuted = !!window._userLocalMuted[username];
  const userPrefVol = window._userVolumes[username] !== undefined ? window._userVolumes[username] : getUserVolume(username);
  const effectiveVol = (isLocallyMuted || window._deafened) ? 0 : userPrefVol;

  if (window._userAudioNodes[username]?.gainNode) {
    try { window._userAudioNodes[username].gainNode.gain.value = effectiveVol; } catch(e){}
  }
  const audio = window._userAudioElements[username];
  if (audio) {
    audio.volume = Math.max(0, Math.min(1.0, effectiveVol));
    audio.muted  = effectiveVol === 0;
  }
}

function setUserVolume(username, volPercent) {
  const vol = Math.max(0, Math.min(200, parseInt(volPercent) || 0)) / 100;
  window._userVolumes[username] = vol;
  safeStorage.setItem(`os_voice_vol_${username}`, vol);
  applyUserVolume(username);
}

function getUserVolume(username) {
  if (window._userVolumes[username] !== undefined) return window._userVolumes[username];
  const stored = safeStorage.getItem(`os_voice_vol_${username}`);
  if (stored !== null) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed)) { window._userVolumes[username] = parsed; return parsed; }
  }
  return 1.0;
}

function toggleMuteUserLocally(username) {
  window._userLocalMuted[username] = !window._userLocalMuted[username];
  applyUserVolume(username);
  updateLobbyVoiceBadges();
  return window._userLocalMuted[username];
}

async function triggerVoiceStateUpdate() {
  if (!window._currentPartyId) return;
  const tStart = Date.now();
  try {
    const res = await fetch(`/api/parties/${window._currentPartyId}/voice-state`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        micMuted: window._micMuted || window._deafened,
        deafened: window._deafened,
        channelId: window._currentChannelId || null,
        pingMs: Date.now() - tStart,
        deviceId: getDeviceSessionId()
      })
    });
    if (res.ok) {
      const data = await res.json();
      const serverMembers = data.members || {};
      window._partyVoiceMembers = {};
      Object.keys(serverMembers).forEach(uid => {
        const m = serverMembers[uid];
        if (m.username !== currentUser?.username) {
          window._partyVoiceMembers[m.username] = m;
        }
      });
      updateLobbyVoiceBadges();
      await maintainPeerConnections();
    }
  } catch(e){}
}

function setMicMuteState(muted) {
  if (window._audioContext?.state === 'suspended') window._audioContext.resume().catch(() => {});
  window._micMuted = muted;
  if (window._localStream) {
    window._localStream.getAudioTracks().forEach(track => { track.enabled = !muted; });
  }
  Object.values(window._peerConnections || {}).forEach(pc => {
    try { pc.getSenders().forEach(sender => { if (sender.track?.kind === 'audio') sender.track.enabled = !muted; }); } catch(e){}
  });
  updateSelfVoiceUI();
  updateLobbyVoiceBadges();
  triggerVoiceStateUpdate();
}

function setDeafState(deafened) {
  if (window._audioContext?.state === 'suspended') window._audioContext.resume().catch(() => {});
  window._deafened = deafened;
  if (deafened) {
    setMicMuteState(true);
  } else {
    setMicMuteState(window._micMuted);
  }
  Object.keys(window._userAudioElements || {}).forEach(username => applyUserVolume(username));
  updateSelfVoiceUI();
  triggerVoiceStateUpdate();
}

// ─── SPEECH ANALYSER ─────────────────────────────────────────
function setupUserSpeechAnalyser(username, mediaStream) {
  if (!window._audioContext) return;
  try {
    if (window._userAudioNodes[username]) return;

    const source   = window._audioContext.createMediaStreamSource(mediaStream);
    const analyser = window._audioContext.createAnalyser();
    analyser.fftSize = 512;
    const gainNode = window._audioContext.createGain();
    const isMe     = currentUser && username === currentUser.username;

    if (!isMe) {
      const userPrefVol = getUserVolume(username);
      gainNode.gain.value = (!!window._userLocalMuted[username] || window._deafened) ? 0 : userPrefVol;
      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(window._audioContext.destination);
      const audio = window._userAudioElements[username];
      if (audio) audio.muted = true; // WebAudio handles playback
    } else {
      gainNode.gain.value = 0; // No echo
      source.connect(gainNode);
      gainNode.connect(analyser);
    }

    window._userAudioNodes[username] = { source, analyser, gainNode };

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const checkSpeech = () => {
      try {
        const me = currentUser && username === currentUser.username;
        if (!me && (!window._userAudioNodes[username] || !window._peerConnections[username])) return;
        if (me && (!window._userAudioNodes[username] || !window._localStream)) return;
        if (window._audioContext?.state === 'suspended') window._audioContext.resume().catch(() => {});

        analyser.getByteFrequencyData(dataArray);
        let total = 0;
        for (let i = 0; i < dataArray.length; i++) total += dataArray[i];
        const avg = total / dataArray.length;

        const isMutedSelf = username === currentUser?.username && (window._micMuted || window._deafened);
        const isSpeaking  = avg > 10 && !window._deafened && !window._userLocalMuted[username] && !isMutedSelf;

        const avatarEls = document.querySelectorAll(`#member-card-${username} .avatar, .avatar-user-${username}, .avatar[data-username="${username}"]`);
        avatarEls.forEach(el => el.classList.toggle('is-speaking', isSpeaking));
      } catch(e){}
      setTimeout(checkSpeech, 120);
    };
    checkSpeech();
  } catch(e) { console.warn('[VoiceChat] Speech analyser failed for:', username, e); }
}

// ─── UI UPDATES ──────────────────────────────────────────────
function updateSelfVoiceUI() {
  const micBtn  = document.getElementById('voiceMicToggleBtn');
  const deafBtn = document.getElementById('voiceDeafToggleBtn');

  if (micBtn) {
    const isMuted = window._micMuted || window._deafened;
    micBtn.setAttribute('data-tooltip', isMuted ? 'Susturmayı Kaldır' : 'Sustur');
    micBtn.setAttribute('title',        isMuted ? 'Susturmayı Kaldır' : 'Sustur');
    micBtn.classList.toggle('muted', isMuted);
    micBtn.innerHTML = isMuted
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
  }

  if (deafBtn) {
    const isDeaf = window._deafened;
    deafBtn.setAttribute('data-tooltip', isDeaf ? 'Sağırlığı Kaldır' : 'Sağırlaştır');
    deafBtn.setAttribute('title',        isDeaf ? 'Sağırlığı Kaldır' : 'Sağırlaştır');
    deafBtn.classList.toggle('deafened', isDeaf);
    deafBtn.innerHTML = isDeaf
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 14c0-4.42-3.58-8-8-8h-2c-1.34 0-2.58.33-3.66.91M4.77 4.77A8 8 0 0 0 3 10v3a5 5 0 0 0 5 5h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5v-2c0-.58.07-1.14.2-1.68"/><path d="M15 12h4v3a5 5 0 0 1-2.2 4.13"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 1 2 2h1a2 2 0 0 1 2-2v-3a2 2 0 0 1-2-2H3z"/></svg>`;
  }

  // Screen share button state
  const ssBtn = document.getElementById('voiceScreenShareBtn');
  if (ssBtn) {
    const isSharing = !!window._screenStream;
    ssBtn.classList.toggle('active', isSharing);
    ssBtn.setAttribute('data-tooltip', isSharing ? 'Paylaşımı Durdur' : 'Ekran Paylaş');
    ssBtn.style.color = isSharing ? '#23a55a' : '';
  }
}

function updateLobbyVoiceBadges() {
  Object.keys(window._partyVoiceMembers).forEach(username => {
    const member          = window._partyVoiceMembers[username];
    const badgeContainer  = document.getElementById(`voice-badge-${username}`);
    if (!badgeContainer) return;

    const existingSSBadge = badgeContainer.querySelector(`.ss-member-badge`);

    const isDeaf         = member.deafened;
    const isMuted        = member.micMuted || member.deafened;
    const isLocallyMuted = !!window._userLocalMuted[username];

    let iconsHtml = '';
    if (isLocallyMuted) {
      iconsHtml += `<span class="voice-badge-icon local-mute" title="Tarafınızdan Susturuldu"><svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" width="12" height="12"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg></span>`;
    } else if (isDeaf) {
      iconsHtml += `<span class="voice-badge-icon deafened" title="Kulaklığı Kapalı"><svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" width="12" height="12"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 14c0-4.42-3.58-8-8-8h-2c-1.34 0-2.58.33-3.66.91M4.77 4.77A8 8 0 0 0 3 10v3a5 5 0 0 0 5 5h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5v-2"/><path d="M15 12h4v3a5 5 0 0 1-2.2 4.13"/></svg></span>`;
    } else if (isMuted) {
      iconsHtml += `<span class="voice-badge-icon muted" title="Susturulmuş"><svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" width="12" height="12"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg></span>`;
    }
    badgeContainer.innerHTML = iconsHtml;
    if (existingSSBadge) badgeContainer.appendChild(existingSSBadge);
  });

  const selfBadge = document.getElementById(`voice-badge-${currentUser?.username}`);
  if (selfBadge) {
    const existingSelfSSBadge = selfBadge.querySelector(`.ss-member-badge`);
    let selfIcons = '';
    if (window._deafened) {
      selfIcons += `<span class="voice-badge-icon deafened" title="Kulaklığınız Kapalı"><svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" width="12" height="12"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 14c0-4.42-3.58-8-8-8h-2c-1.34 0-2.58.33-3.66.91M4.77 4.77A8 8 0 0 0 3 10v3a5 5 0 0 0 5 5h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5v-2"/><path d="M15 12h4v3a5 5 0 0 1-2.2 4.13"/></svg></span>`;
    } else if (window._micMuted) {
      selfIcons += `<span class="voice-badge-icon muted" title="Mikrofonunuz Kapalı"><svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" width="12" height="12"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg></span>`;
    }
    selfBadge.innerHTML = selfIcons;
    if (existingSelfSSBadge) selfBadge.appendChild(existingSelfSSBadge);
  }

  if (window._latestScreenShareStates) updateScreenShareBadges(window._latestScreenShareStates);
}

// ─── USER VOICE MODAL ─────────────────────────────────────────
window._modalActiveUser    = null;
window._modalActiveUserObj = null;
window._modalFriendStatus  = null; // 'none'|'pending_sent'|'pending_received'|'friends'

async function openUserVoiceModal(username) {
  try {
    const partyModal = document.getElementById('partyModal');
    if (partyModal && partyModal.classList.contains('open')) {
      window._openedUserVoiceFromPartyModal = true;
      if (typeof closePartyModal === 'function') closePartyModal();
    }
    window._modalActiveUser = username;
    const modal = document.getElementById('userVoiceSettingsModal');
    if (!modal) return;

    // ── Fetch user profile ──
    let user = { username };
    try {
      const res = await fetch(`/api/users/${username}`);
      if (res.ok) user = await res.json();
    } catch(e){}
    window._modalActiveUserObj = user;

    // ── Avatar ──
    const avatarEl = document.getElementById('uvAvatarContainer');
    if (avatarEl) {
      if (user.profile_photo) {
        avatarEl.innerHTML = `<img src="${user.profile_photo}" alt="${esc(username)}" style="width:100%;height:100%;object-fit:cover;">`;
      } else {
        const initials = (username || '?')[0].toUpperCase();
        const colors = ['#5865f2','#3ba55d','#faa61a','#ed4245','#9b59b6'];
        const color  = colors[username.charCodeAt(0) % colors.length];
        avatarEl.innerHTML = `<div style="width:100%;height:100%;background:${color};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;">${initials}</div>`;
      }
    }

    // ── Online ring ──
    const isOnline = user.is_online !== undefined ? Boolean(user.is_online) : false;
    const effectiveStatus = (isOnline && user.status !== 'invisible') ? (user.status || 'online') : 'offline';

    const ring = document.getElementById('uvOnlineRing');
    if (ring) {
      const statusColorMap = { online: '#23a55a', away: '#faa61a', dnd: '#ed4245', invisible: null, offline: null };
      const color  = statusColorMap[effectiveStatus];
      if (color) {
        ring.style.background = color;
        ring.style.display = 'block';
      } else {
        ring.style.display = 'none';
      }
    }

    // ── Username / Status ──
    const nameEl = document.getElementById('uvUsername');
    if (nameEl) nameEl.textContent = `@${username}`;

    const statusLabel = document.getElementById('uvStatusLabel');
    if (statusLabel) {
      const statusTextMap  = { online: 'Çevrimiçi', away: 'Uzakta', dnd: 'Rahatsız Etme', invisible: 'Çevrimdışı', offline: 'Çevrimdışı' };
      const statusColorMap = { online: '#4ade80', away: '#fbbf24', dnd: '#ef4444', invisible: '#9ca3af', offline: '#9ca3af' };
      statusLabel.textContent  = statusTextMap[effectiveStatus] || 'Çevrimdışı';
      statusLabel.style.color  = statusColorMap[effectiveStatus] || '#9ca3af';
    }

    // ── Latency ──
    const pingEl = document.getElementById('uvLatency');
    if (pingEl) {
      const state = window._partyVoiceMembers?.[username];
      pingEl.textContent = state?.pingMs ? `${state.pingMs} ms` : '— ms';
    }

    // ── Party / role data ──
    let party = null, myRole = 'member', targetMember = null;
    if (window._currentPartyId) {
      try {
        const partyRes = await fetch(`/api/parties/${window._currentPartyId}`);
        if (partyRes.ok) {
          party = await partyRes.json();
          const me = (party.members || []).find(m => m.username === currentUser?.username);
          myRole = me ? me.role : 'member';
          targetMember = (party.members || []).find(m => m.username === username);
        }
      } catch(e){}
    }

    // ── Role badge ──
    const roleBadge  = document.getElementById('uvRoleBadge');
    const targetRole = targetMember ? targetMember.role : (party && party.owner_id === user.id ? 'owner' : 'member');
    if (roleBadge) {
      const roleTextMap = { owner: 'KURUCU', admin: 'YÖNETİCİ', moderator: 'MODERATÖR', member: 'ÜYE' };
      roleBadge.textContent = roleTextMap[targetRole] || 'ÜYE';
      roleBadge.className   = `role-badge ${targetRole}`;
    }

    const isSelf    = currentUser && username === currentUser.username;
    const canManage = ['owner', 'admin', 'moderator'].includes(myRole) && !isSelf;

    // ── Friendship status (for social buttons) ──
    window._modalFriendStatus = 'none';
    if (!isSelf) {
      try {
        const profRes = await fetch(`/api/users/${username}`);
        if (profRes.ok) {
          const profData = await profRes.json();
          const fs = profData.friendship;
          if (fs) {
            if (fs.status === 'accepted') window._modalFriendStatus = 'friends';
            else if (fs.from_user_id === currentUser?.id) window._modalFriendStatus = 'pending_sent';
            else window._modalFriendStatus = 'pending_received';
          }
        }
      } catch(e){}
    }

    // ── Social row ──
    const socialRow = document.getElementById('uvSocialRow');
    if (socialRow) socialRow.style.display = isSelf ? 'none' : 'flex';

    const friendBtn = document.getElementById('uvFriendBtn');
    if (friendBtn && !isSelf) {
      const fs = window._modalFriendStatus;
      if (fs === 'friends') {
        friendBtn.style.display = 'none'; // Already friends — show DM only
      } else if (fs === 'pending_sent') {
        friendBtn.setAttribute('data-tooltip', 'İstek Gönderildi');
        friendBtn.classList.add('friend-pending');
        friendBtn.style.display = 'flex';
      } else {
        friendBtn.setAttribute('data-tooltip', 'Arkadaş Ekle');
        friendBtn.classList.remove('friend-pending','friend-active');
        friendBtn.style.display = 'flex';
      }
    }

    const dmBtn = document.getElementById('uvDmBtn');
    if (dmBtn && !isSelf) {
      dmBtn.style.display = 'flex';
      if (window._modalFriendStatus === 'friends') {
        dmBtn.setAttribute('data-tooltip', 'Mesaj Gönder');
        dmBtn.style.opacity = '1';
        dmBtn.disabled = false;
      } else {
        dmBtn.setAttribute('data-tooltip', 'Mesaj (Arkadaş değilsiniz)');
        dmBtn.style.opacity = '0.4';
        dmBtn.disabled = true;
      }
    }

    // ── Volume section ──
    const volSection = document.getElementById('uvVolumeSection');
    if (volSection) volSection.style.display = isSelf ? 'none' : 'block';

    const slider  = document.getElementById('uvVolumeSlider');
    const valText = document.getElementById('uvVolumeVal');
    if (slider) {
      const pct    = Math.round(getUserVolume(username) * 100);
      slider.value = pct;
      if (valText) valText.textContent = `${pct}%`;
      slider.disabled = isSelf;
    }

    const muteBtn   = document.getElementById('uvMuteToggleBtn');
    const muteLabel = document.getElementById('uvMuteBtnLabel');
    if (muteBtn) {
      const isMuted = !!window._userLocalMuted[username];
      muteBtn.classList.toggle('muted', isMuted);
      if (muteLabel) muteLabel.textContent = isMuted ? 'Susturuldu' : 'Sustur';
    }

    // ── Manager controls ──
    const managerControls = document.getElementById('uvManagerControls');
    if (managerControls) managerControls.style.display = canManage ? 'block' : 'none';

    if (canManage && party) {
      const canAssignRoles = ['owner', 'admin'].includes(myRole) && targetRole !== 'owner';
      const roleSelectWrap = document.getElementById('uvRoleSelectWrap');
      const roleSelect     = document.getElementById('uvRoleSelect');
      if (roleSelectWrap && roleSelect) {
        roleSelectWrap.style.display = canAssignRoles ? 'block' : 'none';
        roleSelect.value = targetRole === 'owner' ? 'admin' : targetRole;
      }
      const channelSelect = document.getElementById('uvChannelSelect');
      if (channelSelect) {
        const channels = party.channels || [];
        channelSelect.innerHTML = channels.map(c => {
          const isCurrent = targetMember && parseInt(targetMember.channel_id) === parseInt(c.id);
          return `<option value="${c.id}" ${isCurrent ? 'selected' : ''}>${esc(c.name)}${c.user_limit > 0 ? ` (Limit: ${c.user_limit})` : ''}</option>`;
        }).join('');
      }
    }

    // ── Danger controls ──
    const dangerControls = document.getElementById('uvDangerControls');
    if (dangerControls) dangerControls.style.display = canManage ? 'flex' : 'none';

    const banBtn = document.getElementById('uvBanBtn');
    if (banBtn) banBtn.style.display = ['owner', 'admin'].includes(myRole) && !isSelf ? 'flex' : 'none';

    modal.classList.add('open');
  } catch(err) {
    console.error('openUserVoiceModal error:', err);
    const modal = document.getElementById('userVoiceSettingsModal');
    if (modal) modal.classList.add('open');
  }
}

function closeUserVoiceModal() {
  const modal = document.getElementById('userVoiceSettingsModal');
  if (modal) modal.classList.remove('open');
  window._modalActiveUser    = null;
  window._modalActiveUserObj = null;
  window._modalFriendStatus  = null;

  if (window._openedUserVoiceFromPartyModal) {
    window._openedUserVoiceFromPartyModal = false;
    if (typeof openPartyModal === 'function') {
      openPartyModal();
    }
  }
}

function handleUvVolumeChange(val) {
  if (!window._modalActiveUser) return;
  const numVal  = parseInt(val) || 0;
  const valText = document.getElementById('uvVolumeVal');
  if (valText) valText.textContent = `${numVal}%`;
  setUserVolume(window._modalActiveUser, numVal);
}

function handleUvMuteToggle() {
  if (!window._modalActiveUser) return;
  const muted     = toggleMuteUserLocally(window._modalActiveUser);
  const muteBtn   = document.getElementById('uvMuteToggleBtn');
  const muteLabel = document.getElementById('uvMuteBtnLabel');
  if (muteBtn) muteBtn.classList.toggle('muted', muted);
  if (muteLabel) muteLabel.textContent = muted ? 'Susturuldu' : 'Sustur';
}

function handleUvViewProfile() {
  const username = window._modalActiveUser;
  if (!username) return;
  window._openedUserVoiceFromPartyModal = false;
  closeUserVoiceModal();
  if (typeof openUserPage === 'function') openUserPage(username);
}

async function handleUvFriendRequest() {
  const username = window._modalActiveUser;
  if (!username || window._modalFriendStatus !== 'none') return;
  try {
    const res = await fetch(`/api/friends/request/${username}`, { method: 'POST' });
    if (res.ok) {
      window._modalFriendStatus = 'pending_sent';
      const friendBtn = document.getElementById('uvFriendBtn');
      if (friendBtn) {
        friendBtn.setAttribute('data-tooltip', 'İstek Gönderildi');
        friendBtn.classList.add('friend-pending');
      }
      showToast('Arkadaşlık isteği gönderildi');
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'İstek gönderilemedi');
    }
  } catch(e) { console.error('Friend request error:', e); }
}

async function handleUvSendMessage() {
  const username = window._modalActiveUser;
  if (!username) return;
  closeUserVoiceModal();
  if (typeof showPage === 'function') showPage('messages');
  if (typeof openDirectChat === 'function') {
    openDirectChat(username);
  } else if (typeof openDmWithUser === 'function') {
    openDmWithUser(username);
  }
}

async function handleUvKick() {
  const user = window._modalActiveUserObj;
  if (!user || !window._currentPartyId) return;
  try {
    const res = await fetch(`/api/parties/${window._currentPartyId}/members/${user.id}/kick`, { method: 'DELETE' });
    if (res.ok) {
      showToast(`${user.username} odadan atıldı`);
      if (typeof fetchPartyAndRender === 'function') fetchPartyAndRender(window._currentPartyId);
      closeUserVoiceModal();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Kullanıcı atılamadı');
    }
  } catch(e) { console.error('Kick error:', e); }
}

async function handleUvBan() {
  const user = window._modalActiveUserObj;
  if (!user || !window._currentPartyId) return;
  if (!confirm(`@${user.username} bu odadan kalıcı olarak yasaklansın mı?`)) return;
  try {
    const res = await fetch(`/api/parties/${window._currentPartyId}/members/${user.id}/ban`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (res.ok) {
      showToast(`${user.username} yasaklandı`);
      if (typeof fetchPartyAndRender === 'function') fetchPartyAndRender(window._currentPartyId);
      closeUserVoiceModal();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Kullanıcı yasaklanamadı');
    }
  } catch(e) { console.error('Ban error:', e); }
}

async function handleUvRoleChange(newRole) {
  if (!window._modalActiveUser || !window._currentPartyId || !window._modalActiveUserObj) return;
  try {
    const userId = window._modalActiveUserObj.id;
    const res    = await fetch(`/api/parties/${window._currentPartyId}/members/${userId}/role`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    if (res.ok) {
      showToast('Yetki güncellendi');
      if (typeof fetchPartyAndRender === 'function') fetchPartyAndRender(window._currentPartyId);
      openUserVoiceModal(window._modalActiveUser);
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Yetki güncellenemedi');
    }
  } catch(e) { console.error('Role update error:', e); }
}

async function handleUvChannelMove(channelId) {
  if (!window._modalActiveUser || !window._currentPartyId || !window._modalActiveUserObj) return;
  try {
    const userId = window._modalActiveUserObj.id;
    const res    = await fetch(`/api/parties/${window._currentPartyId}/members/${userId}/move`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: parseInt(channelId) })
    });
    if (res.ok) {
      showToast('Kullanıcı kanala taşındı');
      if (typeof fetchPartyAndRender === 'function') fetchPartyAndRender(window._currentPartyId);
      closeUserVoiceModal();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Taşınamadı');
    }
  } catch(e) { console.error('Channel move error:', e); }
}

// ─── MIC DEVICE ──────────────────────────────────────────────
async function populateMicDeviceList() {
  const select = document.getElementById('settingsMicDeviceSelect');
  if (!select) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    select.innerHTML = '<option value="">Ses Girişi Desteklenmiyor (HTTPS gerekli)</option>';
    return;
  }
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices    = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    select.innerHTML = audioInputs.map(d => {
      const label = d.label || `Mikrofon (${d.deviceId.substring(0, 5)}...)`;
      return `<option value="${esc(d.deviceId)}" ${d.deviceId === window._selectedMicId ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
    if (audioInputs.length === 0) select.innerHTML = '<option value="">Mikrofon bulunamadı</option>';
  } catch(err) {
    select.innerHTML = '<option value="">Erişim İzni Eksik</option>';
  }
}

async function handleMicDeviceChange(deviceId) {
  if (!deviceId) return;
  window._selectedMicId = deviceId;
  safeStorage.setItem('os_selected_mic_id', deviceId);
  if (window._currentPartyId) {
    await initVoiceChat(window._currentPartyId);
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      stream.getTracks().forEach(t => t.stop());
    } catch(e){}
  }
}

// ─── SCREEN SHARE PROMPT & SOURCE SELECTOR ───────────────────
window._selectedSSSurface = 'monitor';

function openScreenSharePromptModal() {
  if (!window._currentPartyId || !window._currentChannelId) {
    showToast('Önce bir ses kanalına girin.');
    return;
  }

  fetch(`/api/parties/${window._currentPartyId}/screenshare-state`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sharing: true, channelId: window._currentChannelId })
  }).then(async res => {
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Bu kanalda ekran paylaşımı izni yok.');
      return;
    }
    const modal = document.getElementById('screenSharePromptModal');
    if (modal) modal.classList.add('open');
  }).catch(() => {
    showToast('Ekran paylaşımı izni kontrol edilemedi.');
  });
}

function closeScreenSharePromptModal() {
  const modal = document.getElementById('screenSharePromptModal');
  if (modal) modal.classList.remove('open');
}

function selectSSSurface(surface, btn) {
  window._selectedSSSurface = surface;
  const opts = document.querySelectorAll('.ss-prompt-option');
  opts.forEach(o => o.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

async function confirmStartScreenShare() {
  closeScreenSharePromptModal();
  await startScreenShare(window._selectedSSSurface);
}

// ─── SCREEN SHARE STREAMING ──────────────────────────────────
async function toggleScreenShare() {
  if (window._screenStream) {
    stopScreenShare(true);
  } else {
    if (!window._currentPartyId || !window._currentChannelId) {
      showToast('Önce bir ses kanalına girin.');
      return;
    }
    await startScreenShare('monitor');
  }
}

async function startScreenShare(preferredSurface = 'monitor') {
  if (!window._currentPartyId || !window._currentChannelId) return;

  try {
    const videoConstraints = {
      frameRate: { ideal: 60, max: 60 },
      cursor: 'always'
    };
    if (preferredSurface) videoConstraints.displaySurface = preferredSurface;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        suppressLocalAudioPlayback: false
      }
    }).catch(async () => {
      return await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: true
      });
    });

    window._screenStream = stream;

    stream.getVideoTracks()[0].onended = () => stopScreenShare(true);

    updateSelfVoiceUI();
    showToast('Ekran paylaşımı başlatıldı');

    showScreenShareViewer(currentUser?.username || 'Siz', stream, true);

    const sameChannelPeers = Object.keys(window._partyVoiceMembers).filter(u => {
      const m = window._partyVoiceMembers[u];
      return m && parseInt(m.channelId) === parseInt(window._currentChannelId);
    });

    for (const username of sameChannelPeers) {
      await createScreenShareConnection(username, true);
    }

  } catch(err) {
    console.warn('[ScreenShare] getDisplayMedia failed:', err);
    try {
      await fetch(`/api/parties/${window._currentPartyId}/screenshare-state`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharing: false, channelId: window._currentChannelId })
      });
    } catch(e2){}
    if (err.name !== 'NotAllowedError') showToast('Ekran paylaşımı başlatılamadı.');
    window._screenStream = null;
    updateSelfVoiceUI();
  }
}

function stopScreenShare(announce = true) {
  if (window._screenStream) {
    window._screenStream.getTracks().forEach(t => t.stop());
    window._screenStream = null;
  }

  Object.keys(window._ssConnections).forEach(u => {
    try { window._ssConnections[u].close(); } catch(e){}
  });
  window._ssConnections = {};

  updateSelfVoiceUI();

  if (announce && window._currentPartyId) {
    fetch(`/api/parties/${window._currentPartyId}/screenshare-state`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sharing: false, channelId: window._currentChannelId })
    }).catch(() => {});
  }

  if (window._ssCurrentSharer === currentUser?.username) {
    closeScreenShareViewer();
  }
}

function getOrCreateSSPeerConnection(targetUsername) {
  if (window._ssConnections[targetUsername]) {
    const existing = window._ssConnections[targetUsername];
    if (existing.connectionState !== 'closed' && existing.signalingState !== 'closed') {
      return existing;
    }
  }

  const pc = new RTCPeerConnection(RTC_CONFIG);
  window._ssConnections[targetUsername] = pc;

  pc.onicecandidate = (event) => {
    if (event.candidate && window._currentPartyId) {
      sendScreenShareSignal(targetUsername, { type: 'candidate', candidate: event.candidate });
    }
  };

  pc.ontrack = (event) => {
    console.log('[ScreenShare WebRTC] Received remote track from:', targetUsername, event.streams);
    const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
    window._ssRemoteStreams[targetUsername] = stream;
    showScreenShareViewer(targetUsername, stream, false);
  };

  return pc;
}

async function createScreenShareConnection(targetUsername, isInitiator) {
  if (window._ssConnections[targetUsername]) {
    try { window._ssConnections[targetUsername].close(); } catch(e){}
    delete window._ssConnections[targetUsername];
  }

  const pc = getOrCreateSSPeerConnection(targetUsername);

  if (window._screenStream) {
    window._screenStream.getTracks().forEach(track => {
      pc.addTrack(track, window._screenStream);
    });
  }

  if (isInitiator && window._screenStream) {
    const offer = await pc.createOffer({ offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    await sendScreenShareSignal(targetUsername, { type: 'ss-offer', offer: pc.localDescription });
  }
}

async function sendScreenShareSignal(toUsername, signal) {
  if (!window._currentPartyId) return;
  try {
    const ssSig = Object.assign({}, signal, { _ssShare: true });
    await fetch(`/api/parties/${window._currentPartyId}/screenshare-signal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUsername, signal: ssSig })
    });
  } catch(e){}
}

if (!window._ssIceQueues) window._ssIceQueues = {};

async function handleIncomingScreenShareSignal(fromUsername, signal) {
  if (!window._ssIceQueues[fromUsername]) window._ssIceQueues[fromUsername] = [];

  if (signal.type === 'ss-request') {
    console.log('[ScreenShare] Received ss-request from viewer:', fromUsername);
    if (window._screenStream) {
      await createScreenShareConnection(fromUsername, true);
    }
  } else if (signal.type === 'ss-offer') {
    console.log('[ScreenShare] Received ss-offer from sharer:', fromUsername);
    const pc = getOrCreateSSPeerConnection(fromUsername);

    await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));

    // Flush queued ICE candidates
    if (window._ssIceQueues[fromUsername]) {
      for (const cand of window._ssIceQueues[fromUsername]) {
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch(e){}
      }
      window._ssIceQueues[fromUsername] = [];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendScreenShareSignal(fromUsername, { type: 'ss-answer', answer: pc.localDescription });

  } else if (signal.type === 'ss-answer') {
    console.log('[ScreenShare] Received ss-answer from viewer:', fromUsername);
    const pc = window._ssConnections[fromUsername];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));

      if (window._ssIceQueues[fromUsername]) {
        for (const cand of window._ssIceQueues[fromUsername]) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch(e){}
        }
        window._ssIceQueues[fromUsername] = [];
      }
    }
  } else if (signal.type === 'candidate') {
    const pc = window._ssConnections[fromUsername];
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch(e){}
    } else {
      if (!window._ssIceQueues[fromUsername]) window._ssIceQueues[fromUsername] = [];
      window._ssIceQueues[fromUsername].push(signal.candidate);
    }
  }
}

// ─── SCREEN SHARE VIEWER ─────────────────────────────────────
function makeOverlayDraggable(overlay, handle) {
  if (!overlay || !handle || overlay._isDraggableInit) return;
  overlay._isDraggableInit = true;
  let isDragging = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = overlay.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    overlay.style.transform = 'none';
    overlay.style.left = initialLeft + 'px';
    overlay.style.top = initialTop + 'px';
    overlay.style.bottom = 'auto';
    overlay.style.right = 'auto';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    overlay.style.left = Math.max(0, Math.min(window.innerWidth - overlay.offsetWidth, initialLeft + dx)) + 'px';
    overlay.style.top = Math.max(0, Math.min(window.innerHeight - overlay.offsetHeight, initialTop + dy)) + 'px';
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
}

function attachStreamToVideo(video, stream, isOwnStream = false) {
  if (!video || !stream) return;
  
  if (isOwnStream) {
    video.muted = true;
    video.volume = 0;
    video.setAttribute('muted', '');
  } else {
    video.muted = false;
    video.removeAttribute('muted');
    const slider = document.getElementById('ssVolumeSlider');
    const currentVol = slider ? parseInt(slider.value) / 100 : 1.0;
    video.volume = Math.min(1.0, currentVol);
  }

  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  
  const play = () => {
    video.play().catch(err => console.warn('[ScreenShare] Video play warning:', err));
  };
  
  video.onloadedmetadata = play;
  play();
  requestAnimationFrame(play);
  setTimeout(play, 100);
}

function showScreenShareViewer(sharerUsername, stream, isOwnStream = false) {
  let overlay = document.getElementById('screenShareOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id        = 'screenShareOverlay';
    document.body.appendChild(overlay);
  }

  overlay.className = 'ss-overlay open' + (isOwnStream ? ' mini-mode' : '');

  if (!overlay.querySelector('#ssToolbar') || !overlay.querySelector('#ssVideo')) {
    overlay.innerHTML = `
      <div class="ss-toolbar" id="ssToolbar" title="Pencereyi sürüklemek için tıklayıp tutun">
        <div class="ss-toolbar-left">
          <div class="ss-sharer-badge" id="ssSharerBadge">
            <span class="ss-live-dot" title="CANLI"></span>
            <span id="ssSharerName" class="ss-sharer-name"></span>
          </div>
          <span class="ss-quality-badge" id="ssQualityBadge">HD</span>
        </div>
        <div class="ss-toolbar-right">
          <button class="ss-tool-btn" id="ssSnapshotBtn" onclick="takeSSSnapshot()" data-tooltip="📸 Kare Yakala & İndir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
          
          <div class="ss-volume-container" style="position: relative;">
            <button class="ss-tool-btn" id="ssVolumeBtn" onclick="toggleSSVolumePopover(event)" data-tooltip="Ses Seviyesi & Gain (%0 - %200)">
              <svg id="ssVolumeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </button>
            <div id="ssVolumePopover" class="ss-volume-popover">
              <input type="range" id="ssVolumeSlider" min="0" max="200" value="100" oninput="setSSVolume(this.value)" style="width: 80px; height: 4px; accent-color: #8b92ff; cursor: pointer;">
              <span id="ssVolumeValue" style="color: #8b92ff; font-size: 11px; font-weight: 800; min-width: 32px; text-align: right;">100%</span>
            </div>
          </div>

          <button class="ss-tool-btn" id="ssMiniToggleBtn" onclick="toggleSSMiniMode()" data-tooltip="Küçük / Kayan Pencere">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
              <rect x="3" y="3" width="18" height="18" rx="2"/><rect x="11" y="11" width="8" height="8" rx="1"/>
            </svg>
          </button>
          <button class="ss-tool-btn" id="ssFitToggleBtn" onclick="toggleSSFitMode()" data-tooltip="Sığdır / Kapla">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
          <button class="ss-tool-btn" id="ssPipToggleBtn" onclick="toggleSSPiP()" data-tooltip="Resim-içinde-Resim (PiP)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
              <rect x="2" y="3" width="20" height="14" rx="2"/><rect x="12" y="9" width="8" height="6" rx="1" fill="currentColor"/>
            </svg>
          </button>
          <button class="ss-tool-btn" id="ssFsToggleBtn" onclick="toggleSSFullscreen()" data-tooltip="Tam Ekran">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>
          <button class="ss-close-btn" onclick="closeScreenShareViewer()" data-tooltip="Yayını Kapat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="ss-video-container">
        <div id="ssVideoStatus" style="position: absolute; z-index: 2; color: #a0a5ba; font-size: 13px; font-weight: 600; text-align: center; pointer-events: none;">🎥 Yayına bağlanılıyor...</div>
        <video id="ssVideo" class="ss-video" autoplay playsinline></video>
      </div>
    `;
    makeOverlayDraggable(overlay, overlay.querySelector('#ssToolbar'));
  }

  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('open'));

  const sharerName = document.getElementById('ssSharerName');
  if (sharerName) sharerName.textContent = isOwnStream ? 'Ekranınız' : `@${sharerUsername}`;

  const statusText = document.getElementById('ssVideoStatus');
  const video = document.getElementById('ssVideo');
  if (video) {
    if (!video._pipEventsInit) {
      video._pipEventsInit = true;
      video.addEventListener('enterpictureinpicture', () => {
        const overlay = document.getElementById('screenShareOverlay');
        if (overlay) overlay.style.display = 'none';
      });
      video.addEventListener('leavepictureinpicture', () => {
        const overlay = document.getElementById('screenShareOverlay');
        if (overlay) overlay.style.display = 'flex';
      });
    }

    if (stream) {
      if (statusText) statusText.style.display = 'none';
      attachStreamToVideo(video, stream, isOwnStream);
    } else if (statusText) {
      statusText.style.display = 'block';
      statusText.textContent = `🎥 @${sharerUsername} kullanıcısının yayınına bağlanılıyor...`;
    }
  }

  window._ssCurrentSharer = sharerUsername;
}

function toggleSSVolumePopover(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('ssVolumePopover');
  if (!popover) return;
  const isHidden = getComputedStyle(popover).display === 'none';
  popover.style.display = isHidden ? 'flex' : 'none';
}

document.addEventListener('click', (e) => {
  const popover = document.getElementById('ssVolumePopover');
  const btn = document.getElementById('ssVolumeBtn');
  if (popover && btn && !popover.contains(e.target) && !btn.contains(e.target)) {
    popover.style.display = 'none';
  }
});

window._ssAudioContext = null;
window._ssGainNode = null;

function setSSVolume(val) {
  const value = parseInt(val);
  const valDisplay = document.getElementById('ssVolumeValue');
  if (valDisplay) valDisplay.textContent = `${value}%`;

  const video = document.getElementById('ssVideo');
  if (!video) return;

  if (value === 0) {
    video.muted = true;
  } else {
    video.muted = false;
    if (value <= 100) {
      video.volume = value / 100;
      if (window._ssGainNode) window._ssGainNode.gain.value = 1.0;
    } else {
      video.volume = 1.0;
      if (video.srcObject && !window._ssGainNode) {
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) {
            window._ssAudioContext = new AudioContext();
            const source = window._ssAudioContext.createMediaStreamSource(video.srcObject);
            window._ssGainNode = window._ssAudioContext.createGain();
            source.connect(window._ssGainNode);
            window._ssGainNode.connect(window._ssAudioContext.destination);
          }
        } catch(e) {
          console.warn('[AudioBoost] Gain node creation error:', e);
        }
      }
      if (window._ssGainNode) {
        window._ssGainNode.gain.value = value / 100;
      }
    }
  }

  const icon = document.getElementById('ssVolumeIcon');
  if (icon) {
    if (video.muted || value === 0) {
      icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
    } else {
      icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
    }
  }
}

function takeSSSnapshot() {
  const video = document.getElementById('ssVideo');
  if (!video || !video.videoWidth || !video.videoHeight) {
    showToast('Snapshot için aktif video yayını bulunamadı.');
    return;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(`BLUNK LIVE — ${new Date().toLocaleTimeString()}`, 20, canvas.height - 20);

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `blunk_snapshot_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    const overlay = document.getElementById('screenShareOverlay');
    if (overlay) {
      const flash = document.createElement('div');
      flash.style.cssText = 'position: absolute; inset: 0; background: #ffffff; opacity: 0.75; z-index: 999; pointer-events: none; transition: opacity 0.3s ease;';
      overlay.appendChild(flash);
      requestAnimationFrame(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 350); });
    }

    showToast('📸 Ekran alıntısı başarıyla indirildi!');
  } catch(err) {
    console.warn('[Snapshot] Error:', err);
    showToast('Ekran alıntısı alınamadı.');
  }
}

function toggleSSAudioMute() {
  const slider = document.getElementById('ssVolumeSlider');
  const video = document.getElementById('ssVideo');
  if (!video) return;

  if (video.muted) {
    const prevVal = slider ? slider.value : '100';
    setSSVolume(prevVal > 0 ? prevVal : '100');
  } else {
    setSSVolume(0);
  }
}

function closeScreenShareViewer() {
  const overlay = document.getElementById('screenShareOverlay');
  if (overlay) {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    overlay.classList.remove('open', 'mini-mode', 'is-fullscreen', 'cover-fit');
    setTimeout(() => { try { overlay.style.display = 'none'; } catch(e){} }, 300);
  }

  if (window._ssCurrentSharer && window._ssCurrentSharer !== currentUser?.username && window._ssConnections[window._ssCurrentSharer]) {
    try { window._ssConnections[window._ssCurrentSharer].close(); } catch(e){}
    delete window._ssConnections[window._ssCurrentSharer];
    delete window._ssRemoteStreams[window._ssCurrentSharer];
  }
  window._ssCurrentSharer = null;
}

function toggleSSFitMode() {
  const overlay = document.getElementById('screenShareOverlay');
  if (!overlay) return;
  const isContain = overlay.classList.toggle('contain-fit');
  showToast(isContain ? 'Görüntü Modu: Orantılı Sığdır (Yan Boşluklu)' : 'Görüntü Modu: Ekranı Kapla (Siyah Boşluksuz)');
}

function toggleSSMiniMode() {
  const overlay = document.getElementById('screenShareOverlay');
  if (!overlay) return;
  const isMini = overlay.classList.toggle('mini-mode');
  if (isMini) {
    overlay.style.transform = 'none';
    overlay.style.top = Math.max(20, window.innerHeight - 330) + 'px';
    overlay.style.left = Math.max(20, window.innerWidth - 480) + 'px';
    overlay.style.width = '460px';
    overlay.style.height = '290px';
  } else {
    overlay.style.top = '50%';
    overlay.style.left = '50%';
    overlay.style.transform = 'translate(-50%, -50%)';
    overlay.style.width = '880px';
    overlay.style.height = '520px';
  }
  showToast(isMini ? 'Küçük kayan pencere moduna geçildi' : 'Varsayılan pencere moduna geçildi');
}

function toggleSSFullscreen() {
  const overlay = document.getElementById('screenShareOverlay');
  if (!overlay) return;

  if (!document.fullscreenElement && !overlay.classList.contains('is-fullscreen')) {
    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(() => {
        overlay.classList.add('is-fullscreen');
      });
    } else {
      overlay.classList.add('is-fullscreen');
    }
  } else {
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    overlay.classList.remove('is-fullscreen');
  }
}

document.addEventListener('fullscreenchange', () => {
  const overlay = document.getElementById('screenShareOverlay');
  if (!overlay) return;
  if (document.fullscreenElement === overlay) {
    overlay.classList.add('is-fullscreen');
  } else {
    overlay.classList.remove('is-fullscreen');
  }
});

async function toggleSSPiP() {
  const video = document.getElementById('ssVideo');
  if (!video) return;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      await video.requestPictureInPicture();
    } else {
      showToast('Picture-in-Picture bu tarayıcıda desteklenmiyor.');
    }
  } catch(err) {
    console.warn('PiP error:', err);
    showToast('Kayan pencereye geçilemedi.');
  }
}

// ─── SCREEN SHARE STATE POLLING ──────────────────────────────
window._prevSharers = [];

function startScreenShareStatePolling(partyId) {
  let pingCounter = 0;
  window._ssMissingCount = 0;

  const poll = async () => {
    if (!window._currentPartyId) return;
    try {
      // Keep alive own screen share on every 2nd cycle (4s)
      if (window._screenStream && ++pingCounter >= 2) {
        pingCounter = 0;
        fetch(`/api/parties/${partyId}/screenshare-state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharing: true, channelId: window._currentChannelId })
        }).catch(() => {});
      }

      const res = await fetch(`/api/parties/${partyId}/screenshare-state`);
      if (!res.ok) return;
      const states = await res.json();

      updateScreenShareBadges(states);

      // Check for new sharers in our current channel and notify
      const currentSharers = Object.keys(states);
      currentSharers.forEach(username => {
        if (username !== currentUser?.username && !window._prevSharers.includes(username)) {
          const st = states[username];
          if (st && window._currentChannelId && parseInt(st.channelId) === parseInt(window._currentChannelId)) {
            showToast(`🎥 @${username} yayın başlattı! Yayını izlemek için 'Yayını İzle' butonuna tıklayın.`);
          }
        }
      });
      window._prevSharers = currentSharers;

      if (window._ssCurrentSharer) {
        const isOwnActiveStream = (window._ssCurrentSharer === currentUser?.username) && window._screenStream && window._screenStream.active;
        if (!isOwnActiveStream && !states[window._ssCurrentSharer]) {
          window._ssMissingCount = (window._ssMissingCount || 0) + 1;
          if (window._ssMissingCount >= 3) {
            window._ssMissingCount = 0;
            closeScreenShareViewer();
            showToast('Ekran paylaşımı sona erdi.');
          }
        } else {
          window._ssMissingCount = 0;
        }
      } else {
        window._ssMissingCount = 0;
      }
    } catch(e){}
  };

  window._ssPolling = setInterval(poll, 2000);
}

window._latestScreenShareStates = {};

function updateScreenShareBadges(states) {
  window._latestScreenShareStates = states || {};
  const activeSharers = Object.keys(states || {});

  // 1. Remove badges only for users no longer sharing
  document.querySelectorAll('.ss-watch-btn, .ss-member-badge').forEach(el => {
    const sharer = el.getAttribute('data-sharer');
    if (sharer && !activeSharers.includes(sharer)) {
      el.remove();
    }
  });

  // 2. Add or update badges for active sharers without destroying existing DOM nodes
  Object.entries(states || {}).forEach(([username, state]) => {
    const channelId = state.channelId;
    const chanCard = document.getElementById(`channel-card-${channelId}`);
    const isSelf = currentUser && username === currentUser.username;
    const tooltipText = isSelf ? 'Yayınınızı İzle' : `Yayını İzle (@${username})`;

    if (chanCard) {
      const header = chanCard.querySelector('.sub-channel-header');
      if (header) {
        let watchBtn = header.querySelector(`.ss-watch-btn[data-sharer="${username}"]`);
        if (!watchBtn) {
          watchBtn = document.createElement('button');
          watchBtn.className = 'ss-watch-btn icon-only';
          watchBtn.setAttribute('data-sharer', username);
          watchBtn.setAttribute('data-tooltip', tooltipText);
          watchBtn.onclick = (e) => {
            e.stopPropagation();
            openStreamViewerForUser(username);
          };
          watchBtn.innerHTML = `
            <span class="ss-watch-dot"></span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>
            </svg>
          `;
          header.appendChild(watchBtn);
        }
      }
    }

    const badgeBoxes = document.querySelectorAll(`[id="voice-badge-${username}"]`);
    if (badgeBoxes.length > 0) {
      badgeBoxes.forEach(badgeBox => {
        let mBadge = badgeBox.querySelector(`.ss-member-badge[data-sharer="${username}"]`);
        if (!mBadge) {
          mBadge = document.createElement('button');
          mBadge.className = 'ss-member-badge icon-only';
          mBadge.setAttribute('data-sharer', username);
          mBadge.setAttribute('data-tooltip', tooltipText);
          mBadge.onclick = (e) => {
            e.stopPropagation();
            openStreamViewerForUser(username);
          };
          mBadge.innerHTML = `
            <span class="ss-watch-dot"></span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>
            </svg>
          `;
          badgeBox.appendChild(mBadge);
        }
      });
    } else {
      const memberCard = document.getElementById(`member-card-${username}`);
      if (memberCard) {
        let mBadge = memberCard.querySelector(`.ss-member-badge[data-sharer="${username}"]`);
        if (!mBadge) {
          mBadge = document.createElement('button');
          mBadge.className = 'ss-member-badge icon-only';
          mBadge.setAttribute('data-sharer', username);
          mBadge.setAttribute('data-tooltip', tooltipText);
          mBadge.onclick = (e) => {
            e.stopPropagation();
            openStreamViewerForUser(username);
          };
          mBadge.innerHTML = `
            <span class="ss-watch-dot"></span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>
            </svg>
          `;
          memberCard.appendChild(mBadge);
        }
      }
    }
  });
}

function openStreamViewerForUser(username) {
  const isSelf = currentUser && username === currentUser.username;
  if (isSelf) {
    if (window._screenStream) {
      showScreenShareViewer(username, window._screenStream, true);
    } else {
      showToast('Aktif bir ekran paylaşımınız bulunmuyor.');
    }
  } else {
    const stream = window._ssRemoteStreams[username];
    showScreenShareViewer(username, stream || null, false);
    if (!stream) {
      showToast(`@${username} kullanıcısının yayınına bağlanılıyor...`);
      sendScreenShareSignal(username, { type: 'ss-request' });
    }
  }
}

// ─── EVENT DELEGATION ────────────────────────────────────────
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.member-voice-settings-btn');
  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    const username = btn.getAttribute('data-username');
    if (username) openUserVoiceModal(username);
  }
});

// Close userVoiceSettingsModal on backdrop click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('userVoiceSettingsModal');
  if (modal && modal.classList.contains('open') && e.target === modal) {
    closeUserVoiceModal();
  }
});
