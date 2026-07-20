/* ============================================================
   VOICE.JS — WebRTC P2P Voice Chat, Audio Management, and UI States
   ============================================================ */

'use strict';

// ─── VOICE CHAT STATE ────────────────────────────────────────
window._localStream          = null;
window._peerConnections     = {}; // username -> RTCPeerConnection
window._userAudioElements   = {}; // username -> HTMLAudioElement
window._userAudioNodes      = {}; // username -> { source, analyser }
window._userVolumes         = {}; // username -> volume (0 to 1)
window._userLocalMuted      = {}; // username -> boolean (muted locally by me)
window._partyVoiceMembers   = {}; // username -> { micMuted, deafened, pingMs }
window._micMuted            = false;
window._deafened            = false;
window._selectedMicId       = localStorage.getItem('os_selected_mic_id') || 'default';
window._voiceInterval       = null;
window._voiceSignalsInterval = null;
window._audioContext        = null;

// WebRTC Configuration - Google Public STUN Servers
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ─── INITIALIZATION ──────────────────────────────────────────
async function initVoiceChat(partyId) {
  if (!partyId) return;
  console.log('Initializing Voice Chat for party:', partyId);
  stopVoiceChat();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('navigator.mediaDevices.getUserMedia is not supported or not available (HTTPS connection may be required)');
    showToast('Sesli sohbet desteklenmiyor (HTTPS bağlantısı gerekli olabilir).');
    return;
  }

  try {
    // 1. Get User Media (Microphone)
    const constraints = {
      audio: window._selectedMicId && window._selectedMicId !== 'default' ? { deviceId: { exact: window._selectedMicId } } : true,
      video: false
    };

    try {
      window._localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.warn('Selected microphone failed, falling back to default', e);
      window._localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    // Set initial mute states
    setMicMuteState(window._micMuted);

    // Initialize AudioContext for speaking indicators
    window._audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // 2. Start Signaling & Voice State Loops
    startVoiceStateLoop(partyId);
    startVoiceSignalsLoop(partyId);

  } catch (err) {
    console.error('Failed to access microphone:', err);
    showToast('Mikrofona erişilemedi. Lütfen izinleri veya cihaz ayarlarını kontrol edin.');
  }
}

function stopVoiceChat() {
  console.log('Stopping Voice Chat');
  
  // Clear loops
  if (window._voiceInterval) { clearInterval(window._voiceInterval); window._voiceInterval = null; }
  if (window._voiceSignalsInterval) { clearInterval(window._voiceSignalsInterval); window._voiceSignalsInterval = null; }

  // Stop local stream tracks
  if (window._localStream) {
    window._localStream.getTracks().forEach(t => t.stop());
    window._localStream = null;
  }

  // Close all peer connections
  Object.keys(window._peerConnections).forEach(username => {
    try {
      window._peerConnections[username].close();
    } catch(e){}
  });
  window._peerConnections = {};

  // Remove audio elements
  Object.keys(window._userAudioElements).forEach(username => {
    try {
      window._userAudioElements[username].pause();
      window._userAudioElements[username].remove();
    } catch(e){}
  });
  window._userAudioElements = {};
  window._userAudioNodes = {};
  window._partyVoiceMembers = {};

  if (window._audioContext) {
    try {
      window._audioContext.close();
    } catch(e){}
    window._audioContext = null;
  }
}

// ─── STATE POLLING & HEARTBEAT ───────────────────────────────
function startVoiceStateLoop(partyId) {
  const sendVoiceState = async () => {
    if (!window._currentPartyId) return;

    // Estimate ping time from request roundtrip
    const tStart = Date.now();
    try {
      const res = await fetch(`/api/parties/${partyId}/voice-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          micMuted: window._micMuted || window._deafened,
          deafened: window._deafened,
          pingMs: Date.now() - tStart
        })
      });

      if (res.ok) {
        const data = await res.json();
        const serverMembers = data.members || {};
        
        // Update local party voice list
        window._partyVoiceMembers = {};
        Object.keys(serverMembers).forEach(uid => {
          const m = serverMembers[uid];
          if (m.username !== currentUser.username) {
            window._partyVoiceMembers[m.username] = m;
          }
        });

        updateLobbyVoiceBadges();
        maintainPeerConnections();
      }
    } catch (e) {
      console.warn('Voice state heartbeat failed:', e);
    }
  };

  sendVoiceState();
  window._voiceInterval = setInterval(sendVoiceState, 4000);
}

function startVoiceSignalsLoop(partyId) {
  const checkSignals = async () => {
    if (!window._currentPartyId) return;
    try {
      const res = await fetch(`/api/parties/${partyId}/voice-signals`);
      if (res.ok) {
        const signals = await res.json();
        for (const sig of signals) {
          await handleIncomingSignal(sig.fromUsername, sig.signal);
        }
      }
    } catch (e) {
      console.warn('Voice signaling pull failed:', e);
    }
  };

  window._voiceSignalsInterval = setInterval(checkSignals, 1500);
}

// ─── WEBRTC CONNECTION MANAGEMENT ──────────────────────────
async function maintainPeerConnections() {
  // Connect to anyone who is in the party and not connected yet
  const activeUsernames = Object.keys(window._partyVoiceMembers);
  
  for (const username of activeUsernames) {
    if (!window._peerConnections[username]) {
      // Establish peer connection. To avoid double offer collisions, 
      // the user with alphabetically smaller username initiates.
      const isInitiator = currentUser.username < username;
      if (isInitiator) {
        console.log('Initiating peer connection to:', username);
        await createPeerConnection(username, true);
      }
    }
  }

  // Clean up connections for users who left
  Object.keys(window._peerConnections).forEach(username => {
    if (!activeUsernames.includes(username)) {
      console.log('User left, closing peer connection:', username);
      closePeerConnection(username);
    }
  });
}

async function createPeerConnection(targetUsername, isInitiator) {
  if (window._peerConnections[targetUsername]) return;

  const pc = new RTCPeerConnection(RTC_CONFIG);
  window._peerConnections[targetUsername] = pc;

  // Add local audio tracks
  if (window._localStream) {
    window._localStream.getTracks().forEach(track => {
      pc.addTrack(track, window._localStream);
    });
  }

  // Send ICE Candidates
  pc.onicecandidate = (event) => {
    if (event.candidate && window._currentPartyId) {
      sendVoiceSignal(targetUsername, { type: 'candidate', candidate: event.candidate });
    }
  };

  // Receive Remote Audio
  pc.ontrack = (event) => {
    console.log('Received track from:', targetUsername);
    const remoteStream = event.streams[0];
    
    // Play audio in dynamic HTMLAudioElement
    let audio = window._userAudioElements[targetUsername];
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      window._userAudioElements[targetUsername] = audio;
    }
    audio.srcObject = remoteStream;

    // Apply volume adjustments
    applyUserVolume(targetUsername);

    // Setup speech analyzer
    setupUserSpeechAnalyser(targetUsername, remoteStream);
  };

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendVoiceSignal(targetUsername, { type: 'offer', offer: pc.localDescription });
  }
}

function closePeerConnection(username) {
  try {
    if (window._peerConnections[username]) {
      window._peerConnections[username].close();
      delete window._peerConnections[username];
    }
    if (window._userAudioElements[username]) {
      window._userAudioElements[username].pause();
      window._userAudioElements[username].remove();
      delete window._userAudioElements[username];
    }
    if (window._userAudioNodes[username]) {
      delete window._userAudioNodes[username];
    }
  } catch(e){}
}

async function sendVoiceSignal(toUsername, signal) {
  if (!window._currentPartyId) return;
  try {
    await fetch(`/api/parties/${window._currentPartyId}/voice-signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUsername, signal })
    });
  } catch(e){}
}

async function handleIncomingSignal(fromUsername, signal) {
  // Ensure connection exists
  if (!window._peerConnections[fromUsername]) {
    await createPeerConnection(fromUsername, false);
  }

  const pc = window._peerConnections[fromUsername];

  if (signal.type === 'offer') {
    await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendVoiceSignal(fromUsername, { type: 'answer', answer: pc.localDescription });
  } else if (signal.type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
  } else if (signal.type === 'candidate') {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    } catch(e){}
  }
}

// ─── AUDIO CONTROLS & LOCAL MUTES ─────────────────────────────
function applyUserVolume(username) {
  const audio = window._userAudioElements[username];
  if (!audio) return;

  const isLocallyMuted = !!window._userLocalMuted[username];
  if (isLocallyMuted || window._deafened) {
    audio.volume = 0;
  } else {
    const userPrefVol = window._userVolumes[username] !== undefined ? window._userVolumes[username] : 1.0;
    audio.volume = userPrefVol;
  }
}

function setUserVolume(username, volPercent) {
  const vol = Math.max(0, Math.min(100, volPercent)) / 100;
  window._userVolumes[username] = vol;
  localStorage.setItem(`os_voice_vol_${username}`, vol);
  applyUserVolume(username);
}

function getUserVolume(username) {
  if (window._userVolumes[username] !== undefined) return window._userVolumes[username];
  const stored = localStorage.getItem(`os_voice_vol_${username}`);
  if (stored !== null) {
    const parsed = parseFloat(stored);
    window._userVolumes[username] = parsed;
    return parsed;
  }
  return 1.0; // Default: 100%
}

function toggleMuteUserLocally(username) {
  window._userLocalMuted[username] = !window._userLocalMuted[username];
  applyUserVolume(username);
  updateLobbyVoiceBadges();
  return window._userLocalMuted[username];
}

// Local Mic Mute (Mutes our track)
function setMicMuteState(muted) {
  window._micMuted = muted;
  if (window._localStream) {
    window._localStream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }
  updateSelfVoiceUI();
}

// Local Headphone Deafen (Mutes all incoming audio + mutes our mic)
function setDeafState(deafened) {
  window._deafened = deafened;
  
  if (deafened) {
    // If deafened, microphone must also be muted automatically
    setMicMuteState(true);
  } else {
    // Keep mic muted status as it was previously
    setMicMuteState(window._micMuted);
  }

  // Update all remote audio element volumes
  Object.keys(window._userAudioElements).forEach(username => {
    applyUserVolume(username);
  });
  
  updateSelfVoiceUI();
}

// ─── ACTIVE SPEAKER DETECTION (Web Audio Analyser) ─────────────
function setupUserSpeechAnalyser(username, mediaStream) {
  if (!window._audioContext) return;
  try {
    const source = window._audioContext.createMediaStreamSource(mediaStream);
    const analyser = window._audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    window._userAudioNodes[username] = { source, analyser };

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // Check speech levels periodically
    const checkSpeech = () => {
      if (!window._userAudioNodes[username] || !window._peerConnections[username]) return;

      analyser.getByteFrequencyData(dataArray);
      
      // Calculate simple average level
      let total = 0;
      for (let i = 0; i < dataArray.length; i++) {
        total += dataArray[i];
      }
      const avg = total / dataArray.length;

      // Threshold level 12 indicates active speaking
      const isSpeaking = avg > 12 && !window._deafened && !window._userLocalMuted[username];
      
      const avatarEl = document.querySelector(`#member-card-${username} .avatar`);
      if (avatarEl) {
        if (isSpeaking) {
          avatarEl.classList.add('is-speaking');
        } else {
          avatarEl.classList.remove('is-speaking');
        }
      }

      setTimeout(checkSpeech, 150);
    };

    checkSpeech();
  } catch (e) {
    console.warn('Speech analysis failed to build for:', username, e);
  }
}

// ─── UI UPDATES & MUTED BADGES ────────────────────────────────
function updateSelfVoiceUI() {
  const micBtn = document.getElementById('voiceMicToggleBtn');
  const deafBtn = document.getElementById('voiceDeafToggleBtn');
  
  if (micBtn) {
    micBtn.classList.toggle('muted', window._micMuted || window._deafened);
    micBtn.innerHTML = (window._micMuted || window._deafened) 
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
  }

  if (deafBtn) {
    deafBtn.classList.toggle('deafened', window._deafened);
    deafBtn.innerHTML = window._deafened
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 14c0-4.42-3.58-8-8-8h-2c-1.34 0-2.58.33-3.66.91M4.77 4.77A8 8 0 0 0 3 10v3a5 5 0 0 0 5 5h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5v-2c0-.58.07-1.14.2-1.68"/><path d="M15 12h4v3a5 5 0 0 1-2.2 4.13"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 1 2 2h1a2 2 0 0 1 2-2v-3a2 2 0 0 1-2-2H3z"/></svg>`;
  }
}

function updateLobbyVoiceBadges() {
  // Update state badges next to names in Lobby
  Object.keys(window._partyVoiceMembers).forEach(username => {
    const member = window._partyVoiceMembers[username];
    const badgeContainer = document.getElementById(`voice-badge-${username}`);
    
    if (badgeContainer) {
      const isMuted = member.micMuted || member.deafened;
      const isDeaf = member.deafened;
      const isLocallyMuted = !!window._userLocalMuted[username];

      let iconsHtml = '';
      
      // Beautiful SVG status icons styled with app-matching colors
      if (isLocallyMuted) {
        // Red locally muted badge
        iconsHtml += `<span class="voice-badge-icon local-mute" title="Tarafınızdan Susturuldu"><svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" width="12" height="12"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg></span>`;
      } else if (isDeaf) {
        // Gray deafened badge
        iconsHtml += `<span class="voice-badge-icon deafened" title="Kulaklığı Kapalı"><svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" width="12" height="12"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 14c0-4.42-3.58-8-8-8h-2c-1.34 0-2.58.33-3.66.91M4.77 4.77A8 8 0 0 0 3 10v3a5 5 0 0 0 5 5h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5v-2"/><path d="M15 12h4v3a5 5 0 0 1-2.2 4.13"/></svg></span>`;
      } else if (isMuted) {
        // Yellow muted badge
        iconsHtml += `<span class="voice-badge-icon muted" title="Susturulmuş"><svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" width="12" height="12"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg></span>`;
      }

      badgeContainer.innerHTML = iconsHtml;
    }
  });

  // Self indicators
  const selfBadgeContainer = document.getElementById(`voice-badge-${currentUser.username}`);
  if (selfBadgeContainer) {
    let selfIcons = '';
    if (window._deafened) {
      selfIcons += `<span class="voice-badge-icon deafened" title="Kulaklığınız Kapalı"><svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" width="12" height="12"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 14c0-4.42-3.58-8-8-8h-2c-1.34 0-2.58.33-3.66.91M4.77 4.77A8 8 0 0 0 3 10v3a5 5 0 0 0 5 5h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5v-2"/><path d="M15 12h4v3a5 5 0 0 1-2.2 4.13"/></svg></span>`;
    } else if (window._micMuted) {
      selfIcons += `<span class="voice-badge-icon muted" title="Mikrofonunuz Kapalı"><svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" width="12" height="12"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg></span>`;
    }
    selfBadgeContainer.innerHTML = selfIcons;
  }
}

// ─── USER VOLUME & LATENCY MODAL ─────────────────────────────
window._modalActiveUser = null;

function openUserVoiceModal(username) {
  if (username === currentUser.username) return; // Cannot adjust self volume/latency here
  window._modalActiveUser = username;

  const modal = document.getElementById('userVoiceSettingsModal');
  if (!modal) return;

  // Set Profile Photo
  const avatarEl = document.getElementById('uvAvatarContainer');
  if (avatarEl) {
    avatarEl.innerHTML = typeof renderAvatar === 'function' ? renderAvatar({ username }, 'avatar avatar-xl') : '';
  }

  // Set Username & Latency (ms)
  const nameEl = document.getElementById('uvUsername');
  if (nameEl) nameEl.textContent = username;
  
  const pingEl = document.getElementById('uvLatency');
  if (pingEl) {
    const state = window._partyVoiceMembers[username];
    const latency = state ? state.pingMs : 0;
    pingEl.textContent = `MS: ${latency || '—'}`;
  }

  // Set Volume Slider
  const slider = document.getElementById('uvVolumeSlider');
  if (slider) {
    const currentVol = getUserVolume(username);
    slider.value = Math.round(currentVol * 100);
  }

  // Set Mute state button
  const muteBtn = document.getElementById('uvMuteToggleBtn');
  if (muteBtn) {
    const isMuted = !!window._userLocalMuted[username];
    muteBtn.classList.toggle('muted', isMuted);
    muteBtn.innerHTML = isMuted
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg> Susturuldu`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg> Sustur`;
  }

  modal.classList.add('open');
}

function closeUserVoiceModal() {
  const modal = document.getElementById('userVoiceSettingsModal');
  if (modal) modal.classList.remove('open');
  window._modalActiveUser = null;
}

function handleUvVolumeChange(val) {
  if (!window._modalActiveUser) return;
  setUserVolume(window._modalActiveUser, val);
}

function handleUvMuteToggle() {
  if (!window._modalActiveUser) return;
  const muted = toggleMuteUserLocally(window._modalActiveUser);
  const muteBtn = document.getElementById('uvMuteToggleBtn');
  if (muteBtn) {
    muteBtn.classList.toggle('muted', muted);
    muteBtn.innerHTML = muted
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg> Susturuldu`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg> Sustur`;
  }
}

// ─── AUDIO INPUT DEVICES ─────────────────────────────────────
async function populateMicDeviceList() {
  const select = document.getElementById('settingsMicDeviceSelect');
  if (!select) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    select.innerHTML = '<option value="">Ses Girişi Desteklenmiyor (HTTPS gerekli)</option>';
    return;
  }

  try {
    // Explicitly re-request permissions first to make sure device labels are populated
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');

    select.innerHTML = audioInputs.map(device => {
      const label = device.label || `Mikrofon (${device.deviceId.substring(0, 5)}...)`;
      const isSelected = device.deviceId === window._selectedMicId;
      return `<option value="${esc(device.deviceId)}" ${isSelected ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');

    // Fallback if none
    if (audioInputs.length === 0) {
      select.innerHTML = '<option value="">Mikrofon bulunamadı</option>';
    }
  } catch (err) {
    console.error('Failed to populate device list:', err);
    select.innerHTML = '<option value="">Erişim İzni Eksik</option>';
  }
}

async function handleMicDeviceChange(deviceId) {
  if (!deviceId) return;
  console.log('Switching microphone device to:', deviceId);
  window._selectedMicId = deviceId;
  localStorage.setItem('os_selected_mic_id', deviceId);

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return;
  }

  // If currently active in a voice chat, reinitialize to swap track
  if (window._currentPartyId) {
    await initVoiceChat(window._currentPartyId);
  } else {
    // Just trigger a re-get user media to test permissions
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      stream.getTracks().forEach(t => t.stop());
    } catch(e){}
  }
}
