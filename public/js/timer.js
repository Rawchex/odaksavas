/* ============================================================
   TIMER.JS — Focus Session Engine for BLUNK
   All DB writes go through API — this file is client-only.
   ============================================================ */

'use strict';

const SVG_ICONS = {
  coffee: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="vertical-align: middle; display: inline-block; margin-right: 4px;"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><path d="M6 1v3M10 1v3M14 1v3"/></svg>`,
  tomato: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="vertical-align: middle; display: inline-block; margin-right: 4px;"><circle cx="12" cy="13" r="8"/><path d="M12 5V2M12 2a4 4 0 0 1 4 4M12 2a4 4 0 0 0-4 4"/></svg>`
};

// ─────────────────────────────────────────────────────────────
// § 1. CORE STATE
// ─────────────────────────────────────────────────────────────
let _timerWorker       = null;
let _timerInterval     = null;   // fallback if Worker unavailable
let _partyPollInterval = null;
let _partyMsgInterval  = null;
let _partyUIInterval   = null;
let _wakeLock          = null;
let _sessionStartTime  = null;
let _sessionElapsed    = 0;      // seconds elapsed this session
let _currentPartyId    = null;
let _duelMode          = false;

// Timer Mode
let _timerMode          = localStorage.getItem('blunk_timer_mode') || 'free';
let _selectedSetupMode  = _timerMode;
let _pomodoroTargetSecs = parseInt(localStorage.getItem('blunk_pomo_work') || '25', 10) * 60;
let _pomodoroBreakSecs  = parseInt(localStorage.getItem('blunk_pomo_break') || '5', 10) * 60;
let _pomoOvertimeActive    = false;
let _pomoToleranceRemain   = 30 * 60;
let _pomoRound             = parseInt(localStorage.getItem('blunk_pomodoro_round') || '0', 10);
let _breakActive           = false;
let _breakInterval         = null;
let _breakRemaining        = 0;

// Nudge (free mode, 1hr check)
let _lastNudgeHour     = 0;
let _nudgeTimer        = null;
let _nudgeTimeoutSecs  = 15 * 60;

// Questionnaire
let _sessionRatingId   = null;
let _currentFeeling    = null;
let _currentCategory   = null;
let _currentActivity   = null;

// XP milestones (reset per session)
const _milestones = { 5: false, 10: false, 25: false, 60: false, 120: false };

// Loading overlay
let _loadingShownAt = null;
let _loadingTimer   = null;

// Party state
let _lastFocusingMembers = {};
let _partyLiveMembers    = [];


// ─────────────────────────────────────────────────────────────
// § 2. UTILITY HELPERS
// ─────────────────────────────────────────────────────────────
function fmtClock(secs) {
  const s = Math.max(0, secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
}

function el(id) { return document.getElementById(id); }

function showSessionOverlay(msg, submsg, durationMs = 3000) {
  return new Promise(resolve => {
    const overlay = el('sessionLoadingOverlay');
    const msgEl   = el('sessionLoadingMsg');
    const subEl   = el('sessionLoadingSub');
    if (!overlay) { resolve(); return; }
    if (msgEl) msgEl.textContent = msg || 'İşlem Yapılıyor...';
    if (subEl) subEl.textContent = submsg || '';
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('visible'));

    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(() => {
        overlay.style.display = 'none';
        resolve();
      }, 300);
    }, durationMs);
  });
}

function showSessionLoading(msg, submsg) {
  const overlay = el('sessionLoadingOverlay');
  const msgEl   = el('sessionLoadingMsg');
  const subEl   = el('sessionLoadingSub');
  if (_loadingTimer) { clearTimeout(_loadingTimer); _loadingTimer = null; }
  if (!overlay) return;
  if (msgEl) msgEl.textContent = msg || 'yükleniyor...';
  if (subEl) subEl.textContent = submsg || '';
  overlay.style.display = 'flex';
  overlay.classList.add('visible');
  _loadingShownAt = Date.now();
}

function hideSessionLoading() {
  return new Promise(resolve => {
    const overlay = el('sessionLoadingOverlay');
    if (!overlay) { resolve(); return; }
    if (_loadingTimer) clearTimeout(_loadingTimer);
    _loadingTimer = setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(() => { overlay.style.display = 'none'; }, 300);
      _loadingShownAt = null;
      _loadingTimer   = null;
      resolve();
    }, 400);
  });
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) { /* silently ignore */ }
}

function releaseWakeLock() {
  if (_wakeLock) { _wakeLock.release().catch(() => {}); _wakeLock = null; }
}

document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && window._activeSession && !_wakeLock) await requestWakeLock();
  if (_currentPartyId) startPartyPoll(_currentPartyId);
});


// ─────────────────────────────────────────────────────────────
// § 3. XP / LEVEL SYSTEM
// ─────────────────────────────────────────────────────────────
window.getLevelFromXP = function(xp) {
  if (xp <= 0) return 1;
  return Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2);
};

window.getXPNeededForLevel = function(level) {
  return 50 * (level - 1) * level;
};

window.getLevelProgress = function(xp) {
  const level        = getLevelFromXP(xp);
  const thisLvlStart = getXPNeededForLevel(level);
  const nextLvlStart = getXPNeededForLevel(level + 1);
  const xpInLevel    = xp - thisLvlStart;
  const xpForNext    = nextLvlStart - thisLvlStart;
  return { level, xpInLevel, xpNeededForNext: xpForNext, percentage: Math.min(100, Math.max(0, (xpInLevel / xpForNext) * 100)) };
};

function updateXPBarUI(xp) {
  const p = getLevelProgress(xp);
  const lvlEl  = el('statLevel');
  const fillEl = el('xpBarFill');
  const txtEl  = el('xpText');
  if (lvlEl)  lvlEl.textContent  = `LVL ${p.level}`;
  if (fillEl) fillEl.style.width = `${p.percentage}%`;
  if (txtEl)  txtEl.textContent  = `${p.xpInLevel}/${p.xpNeededForNext} XP`;
}

function animateXPBar(oldXP, newXP) {
  const start = Date.now();
  const dur   = 5000;
  triggerCurvedParticles(dur);
  function tick() {
    const t  = Math.min(1, (Date.now() - start) / dur);
    const et = 1 - Math.pow(1 - t, 3);
    updateXPBarUI(Math.floor(oldXP + (newXP - oldXP) * et));
    if (t < 1) requestAnimationFrame(tick);
    else updateXPBarUI(newXP);
  }
  requestAnimationFrame(tick);
}

function triggerCurvedParticles(totalMs) {
  const timerEl = el('timerDisplaySolo');
  const xpRail  = el('xpBarFill')?.parentElement;
  if (!timerEl || !xpRail) return;

  const src  = timerEl.getBoundingClientRect();
  const dst  = xpRail.getBoundingClientRect();
  const srcX = src.left + src.width / 2;
  const srcY = src.top - 15;
  const dstX = dst.left + dst.width * 0.5;
  const dstY = dst.top + dst.height / 2;
  const ctrlX = (srcX + dstX) / 2 - 60;
  const ctrlY = Math.min(srcY, dstY) - 120;

  const began    = Date.now();
  const stopAt   = totalMs - 1000;
  const emitId = setInterval(() => {
    if (Date.now() - began > stopAt) { clearInterval(emitId); return; }
    spawnParticle(srcX, srcY, ctrlX, ctrlY, dstX, dstY);
    if (Math.random() > 0.4) spawnParticle(srcX, srcY, ctrlX, ctrlY, dstX, dstY);
  }, 100);
}

function spawnParticle(sx, sy, cx, cy, dx, dy) {
  const p = document.createElement('div');
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const pColor = isLight ? '#6c63ff' : '#ffffff';
  const pGlow = isLight ? 'rgba(108, 99, 255, 0.9)' : 'rgba(255, 255, 255, 0.9)';

  Object.assign(p.style, {
    width: '4px', height: '4px',
    background: pColor, boxShadow: `0 0 5px ${pGlow}`,
    borderRadius: '50%', position: 'fixed', zIndex: '999999',
    pointerEvents: 'none',
    left: `${sx + (Math.random() - .5) * 20}px`,
    top:  `${sy + (Math.random() - .5) * 10}px`
  });
  document.body.appendChild(p);

  const jcx = cx + (Math.random() - .5) * 40;
  const jcy = cy + (Math.random() - .5) * 30;
  const t0  = Date.now();
  const dur = 800 + Math.random() * 400;

  const psx = parseFloat(p.style.left), psy = parseFloat(p.style.top);

  function fly() {
    const t = Math.min(1, (Date.now() - t0) / dur);
    const x = (1-t)*(1-t)*psx + 2*(1-t)*t*jcx + t*t*dx;
    const y = (1-t)*(1-t)*psy + 2*(1-t)*t*jcy + t*t*dy;
    p.style.left    = `${x}px`;
    p.style.top     = `${y}px`;
    p.style.opacity = `${1 - t}`;
    p.style.transform = `scale(${1 - 0.5 * t})`;
    if (t < 1) requestAnimationFrame(fly); else p.remove();
  }
  requestAnimationFrame(fly);
}


// ─────────────────────────────────────────────────────────────
// § 4. NOTIFICATION SOUNDS
// ─────────────────────────────────────────────────────────────
function playNotificationSound(type) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const configs = {
      complete: { type: 'sine', freqs: [[523.25, 0], [783.99, 0.2]], dur: 0.8 },
      break_complete: { type: 'triangle', freqs: [[659.25, 0], [880, 0.15]], dur: 0.6 }
    };
    const cfg = configs[type];
    if (!cfg) return;
    cfg.freqs.forEach(([freq, delay]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = cfg.type;
      osc.connect(gain); gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.3, now + delay + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + cfg.dur);
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.start(now + delay); osc.stop(now + delay + cfg.dur + 0.1);
    });
  } catch (e) { /* ignore */ }
}

function playChannelSound(type) {
  try {
    const volRaw = localStorage.getItem('os_channel_sound_volume');
    const vol    = volRaw !== null ? parseInt(volRaw) / 100 : 1.0;
    if (vol <= 0) return;
    if (!window._sharedAudioCtx || window._sharedAudioCtx.state === 'closed') {
      try { window._sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    }
    const ctx = window._sharedAudioCtx;
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); if (ctx.state === 'suspended') return; }

    const master = ctx.createGain();
    master.gain.setValueAtTime(Math.min(1, Math.max(0, vol * 0.15)), ctx.currentTime);
    master.connect(ctx.destination);

    const now   = ctx.currentTime;
    const freqs = type === 'connect' ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25];
    freqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0,   now + i * 0.07);
      gain.gain.linearRampToValueAtTime(1, now + i * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);
      osc.connect(gain); gain.connect(master);
      osc.start(now + i * 0.07); osc.stop(now + i * 0.07 + 0.4);
    });
  } catch (e) { /* ignore */ }
}


// ─────────────────────────────────────────────────────────────
// § 5. FOCUS SETUP MODAL  — 3-step: activity → mode → pomo
// ─────────────────────────────────────────────────────────────
let _fsmSelectedActivity = '';
let _fsmSelectedCategory = '';
let _fsmSelectedMode     = 'free';
let _fsmCurrentCat       = null;  // null = All

// Free-mode smart break reminder (50-60 min suggestion)
let _fsmBreakReminderTimer = null;
const FREE_BREAK_SUGGEST_SECS = 55 * 60; // 55 minutes

function _startBreakReminderIfFree() {
  if (_timerMode !== 'free') return;
  _clearBreakReminder();
  _fsmBreakReminderTimer = setTimeout(() => {
    if (!window._activeSession || _timerMode !== 'free') return;
    if (typeof showToast === 'function')
      showToast('55 dakikalık çalışma seansını tamamladınız. Zihninizi dinlendirmek için kısa bir mola vermenizi öneririz.', 6000);
    // Re-schedule for another 55 minutes
    _startBreakReminderIfFree();
  }, FREE_BREAK_SUGGEST_SECS * 1000);
}

function _clearBreakReminder() {
  if (_fsmBreakReminderTimer) { clearTimeout(_fsmBreakReminderTimer); _fsmBreakReminderTimer = null; }
}

function openFocusSetupModal() {
  if (window._activeSession) return;
  const modal = el('focusSetupModal');
  if (!modal) return;
  if (modal.parentElement !== document.body) document.body.appendChild(modal);

  // Reset state
  _fsmSelectedActivity = '';
  _fsmSelectedCategory = '';
  _fsmSelectedMode     = 'free';
  _fsmCurrentCat       = null;

  // Build cat pills
  const pills = el('fsm2CatPills');
  if (pills) {
    const cats = ['Tümü', ...Object.keys(_activitiesDb)];
    pills.innerHTML = cats.map(c =>
      `<button class="fsm2-cat-pill${c === 'Tümü' ? ' active' : ''}" onclick="fsmSelectCat('${esc(c)}')">${esc(c)}</button>`
    ).join('');
  }

  // Clear selection badge
  const badge = el('fsm2SelectedBadge'); if (badge) badge.style.display = 'none';
  const step1btn = el('fsm2Step1Btn'); if (step1btn) step1btn.disabled = true;

  // Reset mode cards
  el('fsm2CardFree')?.classList.remove('selected');
  el('fsm2CardPomo')?.classList.remove('selected');
  el('fsm2Step2Btn') && (el('fsm2Step2Btn').disabled = true);

  // Clear search
  const si = el('fsm2SearchInput'); if (si) si.value = '';

  // Render initial activities
  _fsmRenderActivities('');

  // Show step 1, update dots
  _fsmShowStep(1);
  modal.style.display = 'flex';
  modal.classList.add('open');
}

function closeFocusSetupModal() {
  const modal = el('focusSetupModal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

function _fsmShowStep(n) {
  [1, 2, 3].forEach(i => {
    const step = el(`fsmStep${i}`);
    if (step) {
      step.classList.toggle('active', i === n);
      step.style.display = (i === n) ? 'block' : 'none';
    }
    const dot = el(`fsm2Dot${i}`);
    if (dot) {
      dot.classList.toggle('active', i === n);
      dot.style.background = (i === n) ? 'var(--t-accent-primary, #6c63ff)' : 'rgba(255,255,255,0.2)';
    }
  });
  const back = el('fsm2BackBtn');
  if (back) {
    back.style.display = n > 1 ? 'inline-flex' : 'none';
    back.style.visibility = n > 1 ? 'visible' : 'hidden';
  }
}

function fsmGoBack() {
  const active = document.querySelector('#focusSetupModal .fsm2-step.active');
  if (!active) return;
  const cur = parseInt(active.id.replace('fsmStep',''));
  if (cur > 1) _fsmShowStep(cur - 1);
}

function fsmSelectCat(cat) {
  _fsmCurrentCat = cat === 'Tümü' ? null : cat;
  document.querySelectorAll('.fsm2-cat-pill').forEach(p => {
    p.classList.toggle('active', p.textContent === cat);
  });
  _fsmRenderActivities(el('fsm2SearchInput')?.value || '');
}

function _fsmRenderActivities(query) {
  const grid = el('fsm2ActGrid');
  if (!grid) return;

  const q = query.toLowerCase().trim();
  let items = [];

  if (_fsmCurrentCat) {
    items = (_activitiesDb[_fsmCurrentCat] || []).map(a => ({ cat: _fsmCurrentCat, act: a }));
  } else {
    Object.entries(_activitiesDb).forEach(([cat, acts]) =>
      acts.forEach(a => items.push({ cat, act: a }))
    );
  }

  if (q) items = items.filter(i => i.act.toLowerCase().includes(q));
  items = items.slice(0, 60);

  if (!items.length && q) {
    grid.innerHTML = `<div class="fsm2-act-item" onclick="fsmPickActivity('${esc(query)}','Diğer')" style="color:rgba(255,255,255,0.5);font-style:italic;">
      + "${esc(query)}" ekle
    </div>`;
    return;
  }

  grid.innerHTML = items.map(i =>
    `<div class="fsm2-act-item${i.act === _fsmSelectedActivity ? ' selected' : ''}" onclick="fsmPickActivity('${esc(i.act)}','${esc(i.cat)}')">${esc(i.act)}</div>`
  ).join('');
}

function fsmSearchActivities(val) {
  _fsmRenderActivities(val);
}

function fsmPickActivity(act, cat) {
  _fsmSelectedActivity = act;
  _fsmSelectedCategory = cat;

  // Update grid highlight
  document.querySelectorAll('.fsm2-act-item').forEach(e => {
    e.classList.toggle('selected', e.textContent.trim() === act);
  });

  // Show badge
  const badge = el('fsm2SelectedBadge'), txt = el('fsm2SelectedText');
  if (badge) badge.style.display = 'flex';
  if (txt)   txt.textContent     = act;

  // Enable continue
  const btn = el('fsm2Step1Btn'); if (btn) btn.disabled = false;
}

function fsmToStep2() {
  if (!_fsmSelectedActivity) return;
  _fsmShowStep(2);
}

function fsmSelectMode(mode) {
  _fsmSelectedMode = mode;
  el('fsm2CardFree')?.classList.toggle('selected', mode === 'free');
  el('fsm2CardPomo')?.classList.toggle('selected', mode === 'pomodoro');
  const btn = el('fsm2Step2Btn'); if (btn) btn.disabled = false;
}

function fsmStep2Next() {
  if (!_fsmSelectedMode) return;
  if (_fsmSelectedMode === 'pomodoro') {
    _fsmShowStep(3);
  } else {
    // Free mode: start immediately
    confirmStartFocusFromModal();
  }
}

function fsm2ApplyPreset(work, brk, btn) {
  const w = el('inputWorkMins'), b = el('inputBreakMins');
  if (w) w.value = work;
  if (b) b.value = brk;
  document.querySelectorAll('.fsm-preset, .fsm2-preset').forEach(e => e.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function fsm2AdjustInput(id, delta) {
  const input = el(id);
  if (!input) return;
  const min = parseInt(input.min) || 1;
  const max = parseInt(input.max) || 180;
  input.value = Math.min(max, Math.max(min, (parseInt(input.value) || 0) + delta));
  document.querySelectorAll('.fsm-preset, .fsm2-preset').forEach(e => e.classList.remove('active'));
}

function fsm2ClearPresets() {
  document.querySelectorAll('.fsm-preset, .fsm2-preset').forEach(e => e.classList.remove('active'));
}

function setMainTimerMode(mode) {
  _timerMode = mode;
  _selectedSetupMode = mode;
  localStorage.setItem('blunk_timer_mode', mode);
  syncMainTimerModeUI();
}

function syncMainTimerModeUI() {
  const freeBtn = el('timerModeFreeBtn');
  const pomoBtn = el('timerModePomoBtn');
  const hintEl  = el('timerModeHint');

  if (freeBtn) freeBtn.classList.toggle('active', _timerMode === 'free');
  if (pomoBtn) pomoBtn.classList.toggle('active', _timerMode === 'pomodoro');

  if (window._activeSession) {
    if (hintEl) {
      if (_timerMode === 'pomodoro') {
        const workMins = Math.round((_pomodoroTargetSecs || 1500) / 60);
        const breakMins = Math.round((_pomodoroBreakSecs || 300) / 60);
        hintEl.textContent = `Pomodoro modu: ${workMins} dk çalışma · ${breakMins} dk mola`;
      } else {
        hintEl.textContent = 'Serbest mod: İstediğin zaman bitir.';
      }
    }
  } else {
    if (hintEl) {
      if (_timerMode === 'pomodoro') {
        hintEl.textContent = 'Pomodoro modu seçili: çalışma ve mola sürelerini özelleştirebilirsiniz.';
      } else {
        hintEl.textContent = 'Serbest modu seçtiniz: süre sınırı yok.';
      }
    }
  }
}

// Legacy aliases (keep for pomodoro next-round flow)
function selectSetupMode(mode)  { fsmSelectMode(mode); }
function applyPomoPreset(w,b,btn){ fsm2ApplyPreset(w,b,btn); }
function adjustPomoInput(id,d)   { fsm2AdjustInput(id,d); }
function clearPresetSelection()  { fsm2ClearPresets(); }

function confirmStartFocusFromModal() {
  _timerMode = _fsmSelectedMode || 'free';
  _selectedSetupMode = _timerMode;
  localStorage.setItem('blunk_timer_mode', _timerMode);
  if (_timerMode === 'pomodoro') {
    const workMins  = parseInt(el('inputWorkMins')?.value,  10) || 25;
    const breakMins = parseInt(el('inputBreakMins')?.value, 10) || 5;
    _pomodoroTargetSecs = Math.max(1, Math.min(180, workMins)) * 60;
    _pomodoroBreakSecs  = Math.max(1, Math.min(60, breakMins)) * 60;
    localStorage.setItem('blunk_pomo_work',  workMins);
    localStorage.setItem('blunk_pomo_break', breakMins);
  }
  closeFocusSetupModal();
  startFocusSession(_fsmSelectedActivity, _fsmSelectedCategory);
}

function onMainTimerButtonClick() {
  if (window._activeSession) return;
  openFocusSetupModal();
}


// ─────────────────────────────────────────────────────────────
// § 6. FREE MODE NUDGE (hourly check-in)
// ─────────────────────────────────────────────────────────────
function checkFreeModeNudge(secs) {
  if (_timerMode !== 'free' || !window._activeSession) return;
  const hours = Math.floor(secs / 3600);
  if (hours > 0 && hours > _lastNudgeHour) {
    _lastNudgeHour = hours;
    openNudgeModal();
  }
}

function openNudgeModal() {
  const modal = el('nudgeModal');
  if (modal) modal.style.display = 'flex';
  _nudgeTimeoutSecs = 15 * 60;
  if (_nudgeTimer) clearInterval(_nudgeTimer);
  _nudgeTimer = setInterval(() => {
    _nudgeTimeoutSecs--;
    if (_nudgeTimeoutSecs <= 0) {
      clearInterval(_nudgeTimer); _nudgeTimer = null;
      handleNudgeTimeout();
    }
  }, 1000);
}

function confirmNudgeContinue() {
  const modal = el('nudgeModal');
  if (modal) modal.style.display = 'none';
  if (_nudgeTimer) { clearInterval(_nudgeTimer); _nudgeTimer = null; }
  if (typeof showToast === 'function') showToast('Oturuma odaklanmaya devam ediliyor.', 3000);
}

function confirmNudgeStop() {
  const modal = el('nudgeModal');
  if (modal) modal.style.display = 'none';
  if (_nudgeTimer) { clearInterval(_nudgeTimer); _nudgeTimer = null; }
  endSession(false);
}

async function handleNudgeTimeout() {
  const modal = el('nudgeModal');
  if (modal) modal.style.display = 'none';
  if (!window._activeSession) return;

  const savedHours     = Math.max(1, _lastNudgeHour);
  const customDuration = savedHours * 3600;
  const session        = window._activeSession;

  try {
    if (session?.id) {
      await fetch(`/api/sessions/end/${session.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violation: false, customDuration })
      });
    }
  } catch { /* ignore */ }

  _stopTimerMachinery();
  window._activeSession  = null;
  window._violationFired = false;
  updateTimerUI('idle');

  const timeoutModal = el('nudgeTimeoutModal');
  const timeoutMsg   = el('nudgeTimeoutMsg');
  if (timeoutMsg) timeoutMsg.textContent = `${savedHours} saatlik harika çalışman kaydedildi! Dürtme mesajımıza yanıt alınamadığı için oturumun ${savedHours * 60}. dakikada güvenle tamamlandı. ☕`;
  if (timeoutModal) timeoutModal.style.display = 'flex';
}

function closeNudgeTimeoutModal() {
  const modal = el('nudgeTimeoutModal');
  if (modal) modal.style.display = 'none';
}


// ─────────────────────────────────────────────────────────────
// § 7. POMODORO — OVERTIME & BREAK
// ─────────────────────────────────────────────────────────────
function handlePomodoroOvertime(secs) {
  if (_timerMode !== 'pomodoro' || !window._activeSession) return;
  if (secs < _pomodoroTargetSecs) return;

  if (!_pomoOvertimeActive) {
    _pomoOvertimeActive     = true;
    _pomoToleranceRemain    = 30 * 60;
    syncSessionState('overtime', _pomoRound);
    const overtimeBox = el('pomoOvertimeBox');
    const breakBtn    = el('timerBreakBtn');
    const stopBtn     = el('timerStopBtn');
    const otTitle     = el('pomoOvertimeTitle');
    if (overtimeBox) overtimeBox.style.display = 'block';
    if (otTitle)     otTitle.textContent       = `${_pomoRound + 1}. Tur Fazla Mesai`;
    if (breakBtn)    breakBtn.classList.remove('hidden');
    if (stopBtn)     stopBtn.classList.remove('hidden');
    playNotificationSound('complete');
    if (typeof showToast === 'function') showToast('Çalışma hedefiniz tamamlandı. Dilediğiniz zaman molaya çıkabilirsiniz.', 4500);
  } else {
    _pomoToleranceRemain--;
    const tolDisplay = el('pomoToleranceTimer');
    if (tolDisplay) tolDisplay.textContent = fmtClock(Math.max(0, _pomoToleranceRemain));
    if (_pomoToleranceRemain <= 0 && typeof handleViolation === 'function') {
      handleViolation('MOLA TOLERANS SÜRESİ DOLDU');
    }
  }
}

async function claimPomodoroBreak() {
  const overtimeBox = el('pomoOvertimeBox');
  const breakBtn    = el('timerBreakBtn');
  const stopBtn     = el('timerStopBtn');
  const startBtn    = el('timerStartBtn');
  if (overtimeBox) overtimeBox.style.display = 'none';
  if (breakBtn)    breakBtn.classList.add('hidden');
  if (stopBtn)     stopBtn.classList.add('hidden');
  if (startBtn)    startBtn.style.display    = 'none';
  _pomoOvertimeActive = false;
  _pomoRound++;
  localStorage.setItem('blunk_pomodoro_round', _pomoRound);
  syncSessionState('break', _pomoRound);

  // Stop the work timer but DO NOT end the session.
  // The DB session stays active across all pomodoro rounds.
  _stopTimerMachinery();

  if (typeof showToast === 'function')
    showToast(`${_pomoRound}. çalışma turu tamamlandı. Mola zamanı.`, 3500);

  startBreakTimer(_pomodoroBreakSecs);
}

function startBreakTimer(totalSecs) {
  _breakActive    = true;
  _breakRemaining = totalSecs;
  persistPomodoroBreakState();

  const breakPhase = el('pomoBreakPhase');
  const indicator  = el('pomoPhaseIndicator');
  const phaseIcon  = el('pomoPhaseIcon');
  const phaseLabel = el('pomoPhaseLabel');
  const nextBtn    = el('pomoNextRoundBtn');
  const startBtn   = el('timerStartBtn');
  const timerDisp  = el('timerDisplaySolo');
  const statusTxt  = el('timerStatusText');
  const bonusInd   = el('timerBonusIndicator');

  if (breakPhase)  breakPhase.style.display  = 'none';
  if (nextBtn)     nextBtn.classList.add('hidden');
  if (startBtn)    startBtn.style.display     = 'none';
  if (indicator)   indicator.style.display    = 'none';
  if (phaseIcon)   { phaseIcon.innerHTML = SVG_ICONS.coffee; phaseIcon.style.color = 'var(--text)'; }
  if (phaseLabel)  { phaseLabel.textContent = `${_pomoRound}. Tur Molası`; phaseLabel.style.color = 'var(--text)'; }
  if (timerDisp)   {
    timerDisp.style.display = 'block';
    timerDisp.style.cursor = 'default';
  }
  if (bonusInd)    bonusInd.style.display     = 'none';
  if (statusTxt)   statusTxt.innerHTML        = '';
  const skipBtn = el('pomoSkipBreakBtn');
  if (skipBtn)     skipBtn.classList.remove('hidden');
  _updatePomoRoundBadge();
  _updateBreakDisplay(_breakRemaining);

  _breakInterval = setInterval(() => {
    if (!_breakActive) { clearInterval(_breakInterval); return; }
    _breakRemaining--;
    _updateBreakDisplay(_breakRemaining);
    persistPomodoroBreakState();
    const cd = el('pomoPhaseCountdown');
    const str = _fmtBreak(_breakRemaining);
    if (cd) cd.textContent = str;
    document.title = `[Mola ${str}] BLUNK`;
    if (_breakRemaining <= 0) {
      clearInterval(_breakInterval);
      clearPomodoroBreakState();
      _onBreakComplete();
    }
  }, 1000);
}

function _fmtBreak(secs) {
  const s = Math.max(0, secs);
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

function _updateBreakDisplay(secs) {
  const timerDisp = el('timerDisplaySolo');
  if (timerDisp) timerDisp.textContent = _fmtBreak(secs);
}

function _updatePomoRoundBadge() {
  const badge = el('pomoRoundBadge');
  if (!badge) return;
  if (_timerMode === 'pomodoro' && window._activeSession) {
    if (_breakActive) {
      badge.textContent = `TUR ${_pomoRound} MOLASI`;
      badge.style.color = 'var(--text)';
    } else {
      badge.textContent = `TUR ${_pomoRound + 1} ODAK`;
      badge.style.color = 'var(--text-3)';
    }
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function _onBreakComplete() {
  _breakActive = false;
  document.title = 'BLUNK';
  playNotificationSound('break_complete');
  const breakPhase = el('pomoBreakPhase');
  const nextBtn    = el('pomoNextRoundBtn');
  const timerDisp  = el('timerDisplaySolo');
  const statusTxt  = el('timerStatusText');
  const phaseIcon  = el('pomoPhaseIcon');
  const phaseLabel = el('pomoPhaseLabel');
  if (breakPhase)  breakPhase.style.display = 'none';
  if (nextBtn)     nextBtn.classList.remove('hidden');
  if (timerDisp)   { 
    timerDisp.className = 'timer-display-solo'; 
    timerDisp.style.display = 'block'; 
    timerDisp.style.cursor = 'pointer';
  }
  if (statusTxt)   statusTxt.innerHTML      = 'Yeni tura hazır mısın?';
  const skipBtn = el('pomoSkipBreakBtn');
  if (skipBtn)     skipBtn.classList.add('hidden');
  if (phaseIcon)   { phaseIcon.innerHTML = SVG_ICONS.tomato; phaseIcon.style.color = '#ef4444'; }
  if (phaseLabel)  { phaseLabel.textContent = `${_pomoRound}. TUR BİTTİ`; phaseLabel.style.color = '#ef4444'; }
  if (typeof showToast === 'function') showToast(`Mola tamamlandı. ${_pomoRound + 1}. tura geçiş yapabilirsiniz.`, 4000);
  if (nextBtn) {
    nextBtn.classList.add('pulse-anim');
    setTimeout(() => nextBtn.classList.remove('pulse-anim'), 3000);
  }
}

function skipPomodorBreak() {
  if (!_breakActive) return;
  clearInterval(_breakInterval);
  _breakActive = false;
  clearPomodoroBreakState();
  _onBreakComplete();
}

function startNextPomodoro() {
  const nextBtn   = el('pomoNextRoundBtn');
  const indicator = el('pomoPhaseIndicator');
  const timerDisp = el('timerDisplaySolo');
  if (nextBtn)   { nextBtn.classList.add('hidden'); nextBtn.classList.remove('pulse-anim'); }
  if (indicator)   indicator.style.display = 'none';
  if (timerDisp)   { timerDisp.className = 'timer-display-solo'; timerDisp.style.display = 'block'; }
  _pomoOvertimeActive     = false;
  _pomoToleranceRemain    = 30 * 60;

  // Session is still open — just restart the worker to begin the next round.
  // No new session is created, no modal is shown.
  if (!window._activeSession) {
    // Edge case: session was somehow lost, fall back to full restart
    openFocusSetupModal();
    return;
  }

  // Reset the round start time so elapsed counts from 0 for this round
  _sessionStartTime = new Date();
  _sessionElapsed   = 0;
  _pomoOvertimeActive    = false;
  _pomoToleranceRemain   = 30 * 60;

  _startTimerWorker();
  updateTimerUI('running');
  _updatePomoRoundBadge();
  syncSessionState('focusing', _pomoRound);

  if (typeof showToast === 'function')
    showToast(`${_pomoRound + 1}. çalışma turu başladı. İyi odaklanmalar.`, 3000);
}

function persistPomodoroBreakState() {
  localStorage.setItem('blunk_pomodoro_break_state', JSON.stringify({
    breakActive:    _breakActive,
    breakRemaining: _breakRemaining,
    pomodoroRound:  _pomoRound,
    timerMode:      _timerMode,
    pomoTargetSecs: _pomodoroTargetSecs,
    pomoBreakSecs:  _pomodoroBreakSecs
  }));
}

function clearPomodoroBreakState() {
  localStorage.removeItem('blunk_pomodoro_break_state');
}

function restorePomodoroBreakState() {
  try {
    const json = localStorage.getItem('blunk_pomodoro_break_state');
    if (!json) return;
    const s = JSON.parse(json);
    if (!s || s.timerMode !== 'pomodoro') return;
    _timerMode         = 'pomodoro';
    _pomodoroTargetSecs = s.pomoTargetSecs || _pomodoroTargetSecs;
    _pomodoroBreakSecs  = s.pomoBreakSecs  || _pomodoroBreakSecs;
    _pomoRound          = s.pomodoroRound  || 0;
    localStorage.setItem('blunk_pomodoro_round', _pomoRound);
    _breakRemaining     = s.breakRemaining || 0;
    if (s.breakActive && _breakRemaining > 0) startBreakTimer(_breakRemaining);
    else clearPomodoroBreakState();
  } catch { clearPomodoroBreakState(); }
}

function openPomodoroInfoModal() {
  const modal = el('pomoInfoModal');
  if (modal) modal.style.display = 'flex';
}

function closePomodoroInfoModal() {
  const modal = el('pomoInfoModal');
  if (modal) modal.style.display = 'none';
}


async function syncSessionState(state, round) {
  if (!window._activeSession?.id) return;
  try {
    await fetch('/api/sessions/update-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, round })
    });
  } catch(e) { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────
// § 8. SESSION LIFECYCLE
// ─────────────────────────────────────────────────────────────
async function checkActiveSession() {
  try {
    const res     = await fetch('/api/sessions/active');
    const session = await res.json();
    if (!session?.id) {
      _stopTimerMachinery();
      localStorage.removeItem('os_active_session');
      clearPomodoroBreakState();
      return;
    }

    window._activeSession  = session;
    window._violationFired = false;
    _timerMode        = session.mode || 'free';
    _currentPartyId   = session.party_id || null;

    if (_timerMode === 'pomodoro') {
      _pomoRound = session.pomo_round || 0;
      localStorage.setItem('blunk_pomodoro_round', _pomoRound);

      if (session.target_duration) _pomodoroTargetSecs = parseInt(session.target_duration, 10);
      if (session.break_duration)  _pomodoroBreakSecs  = parseInt(session.break_duration,  10);

      if (session.pomo_state && session.state_start_time) {
        const stateStart = new Date(session.state_start_time.replace(' ', 'T') + 'Z');
        const elapsedSinceStateChange = Math.floor((Date.now() - stateStart) / 1000);

        if (session.pomo_state === 'focusing') {
          if (elapsedSinceStateChange < _pomodoroTargetSecs) {
            _sessionStartTime = stateStart;
            _sessionElapsed = elapsedSinceStateChange;
            _pomoOvertimeActive = false;
            
            _startTimerWorker();
            updateTimerUI('running');
            _updatePomoRoundBadge();
          } else {
            const otSecs = elapsedSinceStateChange - _pomodoroTargetSecs;
            _pomoOvertimeActive = true;
            _pomoToleranceRemain = Math.max(0, 1800 - otSecs);
            _sessionStartTime = stateStart;
            _sessionElapsed = elapsedSinceStateChange;
            
            _startTimerWorker();
            updateTimerUI('running');
            _updatePomoRoundBadge();
            
            const overtimeBox = el('pomoOvertimeBox');
            const breakBtn    = el('timerBreakBtn');
            const stopBtn     = el('timerStopBtn');
            const otTitle     = el('pomoOvertimeTitle');
            if (overtimeBox) overtimeBox.style.display = 'block';
            if (otTitle)     otTitle.textContent       = `${_pomoRound + 1}. Tur Fazla Mesai`;
            if (breakBtn)    breakBtn.classList.remove('hidden');
            if (stopBtn)     stopBtn.classList.remove('hidden');
          }
        } else if (session.pomo_state === 'overtime') {
          _pomoOvertimeActive = true;
          _pomoToleranceRemain = Math.max(0, 1800 - elapsedSinceStateChange);
          _sessionStartTime = stateStart;
          _sessionElapsed = _pomodoroTargetSecs + elapsedSinceStateChange;

          _startTimerWorker();
          updateTimerUI('running');
          _updatePomoRoundBadge();

          const overtimeBox = el('pomoOvertimeBox');
          const breakBtn    = el('timerBreakBtn');
          const stopBtn     = el('timerStopBtn');
          const otTitle     = el('pomoOvertimeTitle');
          if (overtimeBox) overtimeBox.style.display = 'block';
          if (otTitle)     otTitle.textContent       = `${_pomoRound + 1}. Tur Fazla Mesai`;
          if (breakBtn)    breakBtn.classList.remove('hidden');
          if (stopBtn)     stopBtn.classList.remove('hidden');
        } else if (session.pomo_state === 'break') {
          _pomoOvertimeActive = false;
          _stopTimerMachinery();
          
          if (elapsedSinceStateChange < _pomodoroBreakSecs) {
            _breakActive = true;
            _breakRemaining = _pomodoroBreakSecs - elapsedSinceStateChange;
            persistPomodoroBreakState();
            startBreakTimer(_breakRemaining);
          } else {
            _breakActive = false;
            _breakRemaining = 0;
            clearPomodoroBreakState();
            
            const nextBtn = el('pomoNextRoundBtn');
            const phaseLabel = el('pomoPhaseLabel');
            const phaseIcon  = el('pomoPhaseIcon');
            const startBtn   = el('timerStartBtn');
            const timerDisp  = el('timerDisplaySolo');
            if (nextBtn) nextBtn.classList.remove('hidden');
            if (phaseLabel) { phaseLabel.textContent = `${_pomoRound}. Tur Molası Bitti`; phaseLabel.style.color = 'var(--text)'; }
            if (phaseIcon)  { phaseIcon.innerHTML = SVG_ICONS.arrowRight; phaseIcon.style.color = 'var(--text)'; }
            if (startBtn) startBtn.style.display = 'none';
            if (timerDisp) { timerDisp.className = 'timer-display-solo'; timerDisp.style.display = 'block'; }
            
            _updatePomoRoundBadge();
          }
        }
      }
    } else {
      let startTime = null;
      try {
        const local = JSON.parse(localStorage.getItem('os_active_session') || 'null');
        if (local?.id === session.id && local?.startTime) startTime = new Date(local.startTime);
      } catch { /* ignore */ }

      _sessionStartTime = startTime || new Date(session.start_time.replace(' ', 'T') + 'Z');
      _startTimerWorker();
      updateTimerUI('running');
    }

    requestWakeLock();
    if (_currentPartyId) startPartyPoll(_currentPartyId);
  } catch (err) { console.error('[Timer] checkActiveSession error:', err); }
}

async function startFocusSession(activity, category) {
  if (window._activeSession) return;

  // Reset flags
  Object.keys(_milestones).forEach(k => _milestones[k] = false);
  window._violationFired   = false;
  _pomoOvertimeActive      = false;
  _pomoToleranceRemain     = 30 * 60;
  _lastNudgeHour           = 0;

  // Store for session-level use
  _fsmSelectedActivity = activity || '';
  _fsmSelectedCategory = category || '';

  try {
    const res = await fetch('/api/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partyId:        _currentPartyId || null,
        mode:           _timerMode,
        targetDuration: _timerMode === 'pomodoro' ? _pomodoroTargetSecs : 0,
        breakDuration:  _timerMode === 'pomodoro' ? _pomodoroBreakSecs  : 0,
        activity:       _fsmSelectedActivity || null,
        category:       _fsmSelectedCategory || null
      })
    });

    if (!res.ok) {
      if (res.status === 401) {
        if (typeof showToast === 'function') showToast('Odaklanmaya başlamak için lütfen giriş yapın.');
        if (typeof openRegisterModal === 'function') openRegisterModal();
      } else {
        if (typeof showToast === 'function') showToast('Oturum başlatılamadı');
      }
      return;
    }

    const data = await res.json();
    window._activeSession = { id: data.sessionId, partyId: _currentPartyId || null };
    _sessionStartTime     = new Date();
    _sessionElapsed       = 0;

    localStorage.setItem('os_active_session', JSON.stringify({
      id:        data.sessionId,
      partyId:   _currentPartyId || null,
      startTime: _sessionStartTime.toISOString(),
      activity:  _fsmSelectedActivity,
      category:  _fsmSelectedCategory
    }));

    // Show 3-second start overlay screen
    await showSessionOverlay('Odaklanma Başlıyor', 'Zihniniz odak moduna geçiyor. Blunk ile verimli çalışmalar dileriz.', 3000);

    _startTimerWorker();
    updateTimerUI('running');
    _updatePomoRoundBadge();
    requestWakeLock();
    if (_currentPartyId) startPartyPoll(_currentPartyId);

    // Start break reminder for free mode
    if (_timerMode === 'free') _startBreakReminderIfFree();

    // Entry feedback toast
    const msgs = [
      'Blunk ile odaklandığın için teşekkürler!',
      'Oturum başarıyla başlatıldı. Çalışırken suyunu ihmal etme.',
      'Odaklanma oturumu aktif. İyi çalışmalar dileriz.',
      'Konsantrasyon modu devrede. Başarılar.'
    ];
    if (typeof showToast === 'function')
      showToast(msgs[Math.floor(Math.random() * msgs.length)], 3500);

  } catch (err) {
    console.error('[Timer] startFocusSession error:', err);
    if (typeof showToast === 'function') showToast('Oturum başlatılamadı');
  }
}

async function stopFocusSession() {
  if (!window._activeSession) return;
  if (!(await window.showConfirm('Odaklanma seansını sonlandırmak istediğinizden emin misiniz?'))) return;
  await endSession(false);
}

async function endSession(isViolation = false) {
  const session = window._activeSession;
  if (!session) { updateTimerUI('idle'); return; }

  const sessionIdToRate = session.id;
  if (!session.id) {
    window._activeSession = null;
    window._violationFired = false;
    resetTimerDisplay();
    updateTimerUI('idle');
    return;
  }

  releaseWakeLock();
  _stopTimerMachinery();
  resetTimerDisplay();
  _clearBreakReminder();
  localStorage.removeItem('os_active_session');
  _pomoRound = 0;
  localStorage.removeItem('blunk_pomodoro_round');

  if (!isViolation) {
    await showSessionOverlay('Oturum Sonlandırılıyor', 'Verileriniz kaydediliyor ve ilerlemeniz hesaplanıyor. Lütfen bekleyiniz.', 3000);
  }

  try {
    const res = await fetch(`/api/sessions/end/${session.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ violation: isViolation })
    });

    window._activeSession  = null;
    window._violationFired = false;

    if (res.ok) {
      const data = await res.json();

      if (!isViolation) await hideSessionLoading();

      if (data.total_focus_time !== undefined && currentUser) {
        currentUser.total_focus_time = data.total_focus_time;
      }

      if (isViolation) {
        updateTimerUI('violated', data);
        updateTimerStats();
        const banner = el('violationBanner');
        const crack  = el('crackOverlay');
        if (banner) banner.classList.add('show');
        if (crack)  crack.classList.add('show');
        setTimeout(() => {
          if (banner) banner.classList.remove('show');
          if (crack)  crack.classList.remove('show');
        }, 3000);
      } else {
        if (data.xpGained !== undefined && currentUser) {
          const oldXP   = currentUser.xp || 0;
          const oldLevel = currentUser.level || 1;
          currentUser.xp    += data.xpGained;
          currentUser.level  = data.newLevel;

          if (data.xpGained > 0) {
            animateXPBar(oldXP, currentUser.xp);
            setTimeout(() => {
              openSummaryModal(data, sessionIdToRate);
            }, 5200);
          } else {
            updateTimerStats();
            setTimeout(() => {
              openSummaryModal(data, sessionIdToRate);
            }, 500);
          }

          if (data.newLevel > oldLevel) {
            setTimeout(() => {
              if (typeof showToast === 'function') showToast(`Tebrikler, yeni bir seviyeye ulaştınız! Güncel Seviyeniz: ${data.newLevel}`, 5000);
            }, 1200);
          }

          if (data.xpGained > 0 && typeof showToast === 'function') {
            const bonusText = data.bonusGained > 0 ? ` (+${data.bonusGained} Milestone Bonusu!)` : '';
            showToast(`+${data.xpGained} XP kazandınız.${bonusText}`, 3000);
          }
        }
        updateTimerUI('completed', data);
        // openSummaryModal call removed from here (it's delayed above)
      }
    } else {
      if (!isViolation) await hideSessionLoading();
      updateTimerUI('idle');
    }
  } catch (err) {
    console.error('[Timer] endSession error:', err);
    window._activeSession  = null;
    window._violationFired = false;
    if (!isViolation) await hideSessionLoading();
    updateTimerUI('idle');
  }

  // Restore start button text in case it was left in a loading state
  const _sb = el('timerStartBtn');
  if (_sb) {
    _sb.disabled    = false;
    _sb.style.opacity = '';
    if (!_sb.textContent.startsWith('ODAKLAN')) {
      _sb.textContent = _timerMode === 'pomodoro' ? 'ODAKLAN (Pomodoro)' : 'ODAKLAN';
    }
  }
}

function handleViolation(reason) {
  if (!window._activeSession || window._violationFired) return;
  window._violationFired = true;
  const banner = el('violationBanner');
  if (banner) banner.textContent = `${reason || 'EKRANDAN UZAKLAŞTIN'} — ODAK BOZULDU`;
  endSession(true);
}


// ─────────────────────────────────────────────────────────────
// § 9. TIMER WORKER / TICK ENGINE
// ─────────────────────────────────────────────────────────────
function _stopTimerMachinery() {
  if (_timerWorker) {
    _timerWorker.postMessage({ action: 'stop' });
    _timerWorker.terminate();
    _timerWorker = null;
  }
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  if (_partyPollInterval) { clearInterval(_partyPollInterval); _partyPollInterval = null; }
  if (_partyMsgInterval)  { clearInterval(_partyMsgInterval);  _partyMsgInterval  = null; }
}

function _onTick(elapsed) {
  if (!window._activeSession) {
    _stopTimerMachinery();
    return;
  }
  _sessionElapsed = elapsed;
  renderTimerDisplay(elapsed);
  checkMilestones(elapsed);
  checkFreeModeNudge(elapsed);
  handlePomodoroOvertime(elapsed);

  if (currentUser) {
    const totalDisplay = (currentUser.total_focus_time || 0) + elapsed;
    const statTotal = el('statTotal');
    if (statTotal && typeof fmtTime === 'function') statTotal.textContent = fmtTime(totalDisplay);
  }
}

function _startTimerWorker() {
  // Clean up any existing workers/intervals
  if (_timerWorker) { _timerWorker.postMessage({ action: 'stop' }); _timerWorker.terminate(); _timerWorker = null; }
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }

  if (typeof Worker !== 'undefined') {
    try {
      const inlineWorkerCode = `
        let _interval = null, _startTime = null, _mode = 'free', _durationSecs = 0;
        self.onmessage = function(e) {
          const { action, startTime, mode, durationSecs } = e.data || {};
          if (action === 'start') {
            if (_interval) clearInterval(_interval);
            _startTime = startTime || Date.now();
            _mode = mode || 'free';
            _durationSecs = durationSecs || 0;
            _interval = setInterval(() => {
              const elapsed = Math.floor((Date.now() - _startTime) / 1000);
              self.postMessage({
                type: 'tick',
                elapsed,
                remaining: _mode === 'pomodoro' ? Math.max(0, _durationSecs - elapsed) : null,
                isOver: _mode === 'pomodoro' ? elapsed >= _durationSecs : false
              });
            }, 1000);
          } else if (action === 'stop') {
            if (_interval) { clearInterval(_interval); _interval = null; }
            _startTime = null;
          }
        };
      `;
      const blob = new Blob([inlineWorkerCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      _timerWorker = new Worker(blobUrl);
      _timerWorker.onmessage = (e) => { if (e.data.type === 'tick') _onTick(e.data.elapsed); };
      _timerWorker.postMessage({
        action:       'start',
        startTime:    _sessionStartTime.getTime(),
        mode:         _timerMode,
        durationSecs: _timerMode === 'pomodoro' ? _pomodoroTargetSecs : 0
      });
      return;
    } catch (e) {
      try {
        _timerWorker = new Worker('/js/timer-worker.js');
        _timerWorker.onmessage = (e) => { if (e.data.type === 'tick') _onTick(e.data.elapsed); };
        _timerWorker.postMessage({
          action:       'start',
          startTime:    _sessionStartTime.getTime(),
          mode:         _timerMode,
          durationSecs: _timerMode === 'pomodoro' ? _pomodoroTargetSecs : 0
        });
        return;
      } catch (err) {
        console.warn('[Timer] Worker failed, using interval fallback:', err);
      }
    }
  }

  // Fallback: setInterval
  _timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - _sessionStartTime) / 1000);
    _onTick(elapsed);
  }, 1000);
}

// Legacy alias used in session restore
function startTimerTick() { _startTimerWorker(); }


// ─────────────────────────────────────────────────────────────
// § 10. TIMER DISPLAY REÖNDER
// ─────────────────────────────────────────────────────────────
function renderTimerDisplay(secs) {
  let titleText = 'BLUNK';

  if (_duelMode) {
    const timeStr = fmtClock(secs);
    const duelMe = el('duelTimerMe');
    if (duelMe) duelMe.textContent = timeStr;
    updateDuelLeads?.();
    titleText = `[⚔️ ${timeStr}] BLUNK`;
  } else {
    const disp = el('timerDisplaySolo');
    if (!disp) return;

    if (_timerMode === 'pomodoro' && !_pomoOvertimeActive) {
      const remaining  = Math.max(0, _pomodoroTargetSecs - secs);
      const timeStr    = fmtClock(remaining);
      disp.textContent = timeStr;
      titleText        = `[🍅 Tur ${_pomoRound + 1} - ${timeStr}] BLUNK`;
    } else {
      const timeStr    = fmtClock(secs);
      disp.textContent = timeStr;
      titleText        = `[⏱️ ${timeStr}] BLUNK`;
    }

    disp.classList.add('ticking');
    setTimeout(() => disp.classList.remove('ticking'), 100);

    const bonusInd = el('timerBonusIndicator');
    if (bonusInd) bonusInd.textContent = `Sonraki Bonus (+5 XP): ${60 - (secs % 60)} sn`;
  }

  document.title = titleText;
}

function resetTimerDisplay() {
  _sessionElapsed = 0;
  const sets = [
    ['timerDisplaySolo', '00:00'],
    ['duelTimerMe', '00:00'],
    ['duelTimerOther', '00:00']
  ];
  sets.forEach(([id, val]) => { const e = el(id); if (e) e.textContent = val; });
  const solo = el('timerDisplaySolo');
  if (solo) solo.style.display = 'block';
  el('duelLeadMe')?.classList.remove('show');
  el('duelLeadOther')?.classList.remove('show');
  const bonusInd = el('timerBonusIndicator');
  if (bonusInd) bonusInd.style.display = 'none';
  _updatePomoRoundBadge();
  document.title = 'BLUNK';
}


// ─────────────────────────────────────────────────────────────
// § 11. MILESTONE TOASTS
// ─────────────────────────────────────────────────────────────
function checkMilestones(secs) {
  const mins = Math.floor(secs / 60);
  const toasts = [
    [5,   '🔥 5 dakika — iyi gidiyorsun!'],
    [10,  '⚡ 10 dakika — ritme girdin'],
    [25,  '💪 25 dakika — yarı yoldasın'],
    [60,  '🏆 1 SAAT! Efsane odak'],
    [120, '👑 2 SAAT! Rakipler titredi']
  ];
  toasts.forEach(([m, msg]) => {
    if (mins === m && !_milestones[m]) {
      _milestones[m] = true;
      if (typeof showToast === 'function') showToast(msg, m >= 60 ? 2600 : 2200);
    }
  });
}


// ─────────────────────────────────────────────────────────────
// § 12. UI STATE MACHINE
// ─────────────────────────────────────────────────────────────
function updateTimerUI(state, data = {}) {
  const startBtn  = el('timerStartBtn');
  const stopBtn   = el('timerStopBtn');
  const statusDot = el('statusDot');
  const bonusInd  = el('timerBonusIndicator');
  const statusChip = el('timerStatusChip');
  const statusTxt  = el('statusText');
  const timerTxt   = el('timerStatusText');
  const soloDisp   = el('timerDisplaySolo');
  const bottomNav  = el('bottomNav');
  const topMeta    = el('timerTopMeta');

  if (bonusInd) bonusInd.style.display = (state === 'running' && !_duelMode) ? 'block' : 'none';

  const _showModeUI = () => {
    const picker = el('timerModePicker');
    if (picker) picker.style.display = 'flex';
    syncMainTimerModeUI();
  };

  const _hideModeUI = () => {
    const picker = el('timerModePicker');
    if (picker) picker.style.display = 'none';
    syncMainTimerModeUI();
  };

  const _clearBreakOvertime = () => {
    const breakBtn   = el('timerBreakBtn');
    const overtimeBox = el('pomoOvertimeBox');
    const skipBtn     = el('pomoSkipBreakBtn');
    if (breakBtn)    breakBtn.classList.add('hidden');
    if (overtimeBox) overtimeBox.style.display = 'none';
    if (skipBtn)     skipBtn.classList.add('hidden');
  };

  // Keep startBtn hidden at all times
  if (startBtn) startBtn.style.display = 'none';

  switch (state) {
    case 'running': {
      if (stopBtn)  stopBtn.classList.remove('hidden');
      if (statusChip) statusChip.className = 'timer-status-chip state-focus';
      if (statusDot)  statusDot.className  = 'timer-status-dot live';
      if (statusTxt)  statusTxt.textContent = 'odaklanıyorsun';
      if (timerTxt)   { timerTxt.className = 'timer-status-text live'; timerTxt.textContent = ''; }
      if (soloDisp)   {
        soloDisp.classList.remove('violated');
        soloDisp.classList.add('active-pulse');
        soloDisp.removeAttribute('data-tooltip');
        soloDisp.style.cursor = 'default';
      }
      if (bottomNav)  bottomNav.style.display = 'none';
      if (topMeta)    topMeta.style.display   = 'none';
      _hideModeUI();
      break;
    }

    case 'violated': {
      if (stopBtn)  stopBtn.classList.add('hidden');
      _clearBreakOvertime();
      resetTimerDisplay();
      if (statusChip) statusChip.className = 'timer-status-chip state-status';
      if (statusDot)  statusDot.className  = 'timer-status-dot bad';
      if (statusTxt)  statusTxt.textContent = 'ihlal';
      if (timerTxt)   { timerTxt.className = 'timer-status-text bad'; timerTxt.textContent = `odak bozuldu · ${typeof fmtTime === 'function' ? fmtTime(_sessionElapsed) : ''} kaydedilmedi`; }
      if (soloDisp)   {
        soloDisp.classList.add('violated');
        soloDisp.classList.remove('active-pulse');
        soloDisp.setAttribute('data-tooltip', 'Odaklanmaya Başlamak İçin Tıkla');
        soloDisp.setAttribute('data-tooltip-pos', 'bottom');
        soloDisp.style.cursor = 'pointer';
      }
      if (bottomNav)  bottomNav.style.display = 'flex';
      if (topMeta)    topMeta.style.display   = 'flex';
      _showModeUI();
      break;
    }

    case 'completed': {
      if (stopBtn)  stopBtn.classList.add('hidden');
      _clearBreakOvertime();
      const completedDuration = data.duration || _sessionElapsed;
      resetTimerDisplay();
      if (statusChip) statusChip.className = 'timer-status-chip state-status';
      if (statusDot)  statusDot.className  = 'timer-status-dot good';
      if (statusTxt)  statusTxt.textContent = 'tamamlandı';
      if (timerTxt)   {
        timerTxt.className   = 'timer-status-text good';
        timerTxt.textContent = data.xpGained
          ? `${typeof fmtTime === 'function' ? fmtTime(completedDuration) : ''} · +${data.xpGained} XP`
          : `${typeof fmtTime === 'function' ? fmtTime(completedDuration) : ''}`;
      }
      if (soloDisp)  {
        soloDisp.classList.remove('violated', 'active-pulse');
        soloDisp.setAttribute('data-tooltip', 'Odaklanmaya Başlamak İçin Tıkla');
        soloDisp.setAttribute('data-tooltip-pos', 'bottom');
        soloDisp.style.cursor = 'pointer';
      }
      if (bottomNav)  bottomNav.style.display = 'flex';
      if (topMeta)    topMeta.style.display   = 'flex';
      _showModeUI();
      break;
    }

    case 'idle':
    default: {
      if (stopBtn)  stopBtn.classList.add('hidden');
      _clearBreakOvertime();
      resetTimerDisplay();
      const partyBtnIdle = el('timerPartyBtn');
      if (partyBtnIdle && !_currentPartyId) partyBtnIdle.style.display = 'none';
      if (statusChip) statusChip.className = 'timer-status-chip state-status';
      if (typeof updatePresenceUI === 'function') updatePresenceUI();
      else {
        if (statusDot) statusDot.className   = 'timer-status-dot';
        if (statusTxt) statusTxt.textContent = 'hazır';
      }
      if (timerTxt)  { timerTxt.className = 'timer-status-text'; timerTxt.textContent = 'odaklanmaya başlamak için dokun'; }
      if (soloDisp)  {
        soloDisp.classList.remove('violated', 'active-pulse');
        soloDisp.setAttribute('data-tooltip', 'Odaklanmaya Başlamak İçin Tıkla');
        soloDisp.setAttribute('data-tooltip-pos', 'bottom');
        soloDisp.style.cursor = 'pointer';
      }
      if (bottomNav)  bottomNav.style.display = 'flex';
      if (topMeta)    topMeta.style.display   = 'flex';
      _showModeUI();
      break;
    }
  }
}


// ─────────────────────────────────────────────────────────────
// § 13. STATS
// ─────────────────────────────────────────────────────────────
function updateTimerStats(withGlow = false) {
  if (!currentUser) return;
  updateXPBarUI(currentUser.xp || 0);
  if (withGlow) {
    const fill = el('xpBarFill');
    const txt  = el('xpText');
    if (fill) { fill.classList.remove('gained'); void fill.offsetWidth; fill.classList.add('gained'); }
    if (txt)  { txt.classList.add('gained'); setTimeout(() => txt.classList.remove('gained'), 1400); }
  }
  const statTotal = el('statTotal');
  if (statTotal && typeof fmtTime === 'function') statTotal.textContent = fmtTime(currentUser.total_focus_time || 0);
}


// ─────────────────────────────────────────────────────────────
// § 14. ACTIVITIES DB & SUMMARY MODAL
// ─────────────────────────────────────────────────────────────
// Using global _activitiesDb defined in activities.js

function openSummaryModal(data, sessionId) {
  _sessionRatingId = sessionId || null;
  _currentFeeling = null;

  const summaryModal = el('focusSummaryModal');
  if (!summaryModal) return;

  // Clear inputs
  const noteInput = el('ratingNoteInput');
  if (noteInput) noteInput.value = '';
  document.querySelectorAll('.feeling-btn').forEach(b => b.classList.remove('selected'));

  summaryModal.classList.add('open');
}

// Legacy helper still used by some flow callbacks
function goToStep(stepName) {
  document.querySelectorAll('.summary-step').forEach(s => s.classList.remove('active'));
  el(`step${stepName}`)?.classList.add('active');
}

function selectFeeling(feeling, btnElement) {
  _currentFeeling = feeling;
  document.querySelectorAll('.feeling-btn').forEach(b => b.classList.remove('selected'));
  if (btnElement) {
    btnElement.classList.add('selected');
  }
}

function selectCategory(category, btnElement) {
  _currentCategory = category;
  // Remove visual selection from any category buttons (if present)
  try {
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
  } catch (e) {}
  if (btnElement && btnElement.classList) btnElement.classList.add('selected');
}

async function submitRating() {
  if (!_currentFeeling) { 
    if (typeof showToast === 'function') showToast('Lütfen nasıl hissettiğinizi seçin'); 
    return; 
  }
  if (!_sessionRatingId) return;

  const noteInput = el('ratingNoteInput');
  const ratingNote = noteInput ? noteInput.value.trim() : '';

  try {
    const res = await fetch(`/api/sessions/rate/${_sessionRatingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feeling: _currentFeeling, note: ratingNote })
    });
    if (res.ok) {
      const banner = el('unratedSessionBanner');
      if (banner) banner.style.display = 'none';
      closeFocusSummaryModal();
      if (typeof showToast === 'function') showToast('Katkınız başarıyla kaydedildi!');
    } else {
      if (typeof showToast === 'function') showToast('Kayıt başarısız oldu');
    }
  } catch { 
    if (typeof showToast === 'function') showToast('Bağlantı hatası'); 
  }
}

async function checkUnratedSession() {
  const banner = el('unratedSessionBanner');
  if (banner) banner.style.display = 'none';
  return;
}

function openUnratedSessionRating() {
  if (!_sessionRatingId) return;
  const modal = el('focusSummaryModal');
  if (modal) { goToStep('Feeling'); modal.classList.add('open'); }
}

function closeFocusSummaryModal() {
  el('focusSummaryModal')?.classList.remove('open');
  checkUnratedSession();
}


// ─────────────────────────────────────────────────────────────
// § 15. PARTY POLL & REÖNDER
// ─────────────────────────────────────────────────────────────
function startPartyPoll(partyId) {
  if (!partyId || partyId === 'undefined' || partyId === 'null') return;

  clearInterval(_partyPollInterval);
  clearInterval(_partyMsgInterval);

  const bg = document.hidden;
  const pollDelay = bg ? 30000 : 1000;
  const msgDelay  = bg ? 30000 : 3000;

  fetchPartyAndRender(partyId);
  _partyPollInterval = setInterval(() => {
    if (!_currentPartyId) { clearInterval(_partyPollInterval); _partyPollInterval = null; return; }
    fetchPartyAndRender(_currentPartyId);
  }, pollDelay);

  fetchPartyMessages(partyId);
  _partyMsgInterval = setInterval(() => {
    if (!_currentPartyId) { clearInterval(_partyMsgInterval); _partyMsgInterval = null; return; }
    fetchPartyMessages(_currentPartyId);
  }, msgDelay);

  if (!_partyUIInterval) {
    _partyUIInterval = setInterval(() => {
      if (!_partyLiveMembers?.length) return;
      _partyLiveMembers.forEach(m => {
        if (!m.isActive && !(m.isMe && window._activeSession)) return;
        let elapsed = m.isMe ? _sessionElapsed
          : (m.sessionStartUtc ? Math.floor((Date.now() - m.sessionStartUtc.getTime()) / 1000) : 0);
        if (elapsed < 0) elapsed = 0;
        const card = el(`member-card-${m.username}`);
        if (card) {
          const statusEl = card.querySelector('.member-status');
          if (statusEl) statusEl.textContent = `● ODAKTA: ${elapsed} sn`;
        }
      });
    }, 1000);
  }
}

async function fetchPartyMessages(partyId) {
  try {
    const res = await fetch(`/api/parties/${partyId}/live-status`);
    if (res.status === 404 || res.status === 403 || res.status === 401) {
      if (typeof clearActiveParty === 'function') clearActiveParty();
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    const container = el('partyChatMessages');
    if (!container) return;

    const wasNearBottom   = container.scrollHeight - container.clientHeight - container.scrollTop < 60;
    const currentMsgCount = container.children.length;
    const partyKey        = `party_${partyId}`;

    const systemBanner = `<div class="chat-system-retention-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>Güvenlik ve gizliliğiniz için oda sohbet mesajları 24 saat sonra otomatik olarak silinir.</span>
    </div>`;

    container.innerHTML = systemBanner + (data.messages || []).map(m => {
      if (m.user_id === 0 || !m.username) {
        return `<div style="align-self:center;text-align:center;margin:10px 0;font-size:11px;color:#555;font-weight:800;text-transform:uppercase;letter-spacing:1px;width:100%;">${esc(m.content)}</div>`;
      }
      const isMe = m.username === currentUser?.username;
      let content = m.content || '';
      try { if (typeof decryptText === 'function') content = decryptText(m.content, partyKey) || m.content; } catch { /* ignore */ }
      return `<div class="party-msg-row ${isMe ? 'me' : ''}">
        <div style="cursor:pointer" onclick="openUserPage('${esc(m.username)}')">
          ${typeof renderAvatar === 'function' ? renderAvatar({ username: m.username, profile_photo: m.profile_photo }, 'avatar avatar-sm') : ''}
        </div>
        <div class="party-msg-content">
          <div class="party-msg-name" onclick="openUserPage('${esc(m.username)}')">${esc(m.username)}</div>
          <div class="party-msg-bubble">${esc(content)}</div>
        </div></div>`;
    }).join('');

    if (data.messages?.length > currentMsgCount && currentMsgCount > 0) {
      const last = container.lastElementChild?.querySelector('.party-msg-bubble');
      if (last) { last.classList.add('new-message-highlight'); setTimeout(() => last.classList.remove('new-message-highlight'), 2000); }
    }
    if (wasNearBottom || currentMsgCount === 0) container.scrollTop = container.scrollHeight;

    const isChatOpen = el('partyChatModal')?.classList.contains('open');
    const totalMsgs  = data.messages?.length || 0;
    const badge      = el('partyChatUnreadBadge');
    if (isChatOpen) {
      localStorage.setItem(`last_seen_party_msg_${partyId}`, totalMsgs);
      if (badge) badge.style.display = 'none';
    } else {
      const lastSeen = parseInt(localStorage.getItem(`last_seen_party_msg_${partyId}`) || '0');
      const unread   = totalMsgs - lastSeen;
      if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'flex' : 'none'; }
    }
  } catch { /* ignore */ }
}

async function sendPartyChatMessage() {
  const input   = el('partyChatInput');
  const content = input?.value?.trim();
  const partyId = _currentPartyId || window._currentPartyId || window._currentParty?.id;
  if (!content || !partyId) return;
  _currentPartyId = partyId;
  window._currentPartyId = partyId;

  const key       = `party_${partyId}`;
  const encrypted = typeof encryptText === 'function' ? encryptText(content, key) : content;

  try {
    const res = await fetch(`/api/parties/${partyId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: encrypted })
    });
    if (res.ok) {
      input.value = '';
      await fetchPartyMessages(partyId);
    } else {
      const data = await res.json().catch(() => ({}));
      if (typeof showToast === 'function') showToast(data.error || 'Mesaj gönderilemedi');
      if (res.status === 429) {
        input.disabled = true;
        const cooldown = data.retryAfter || 15;
        let count = cooldown;
        const orig = input.placeholder;
        const t = setInterval(() => {
          count--;
          input.placeholder = `Spam Engeli (${count}s)...`;
          if (count <= 0) { clearInterval(t); input.disabled = false; input.placeholder = orig; }
        }, 1000);
      }
    }
  } catch (e) { console.warn('[PartyChat] Error:', e); }
}

async function fetchPartyAndRender(partyId) {
  if (!partyId || partyId === 'undefined' || partyId === 'null') return;
  try {
    const res = await fetch(`/api/parties/${partyId}`);
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      if (typeof clearActiveParty === 'function') clearActiveParty();
      return;
    }
    if (!res.ok) return;
    const party = await res.json();

    _partyLiveMembers = (party.members || []).map(m => ({
      username:       m.username,
      isMe:          m.username === currentUser?.username,
      isActive:      m.active_session_id !== null,
      sessionStartUtc: m.session_start ? new Date(m.session_start.replace(' ', 'T') + 'Z') : null
    }));

    const newFocusing = {};
    (party.members || []).forEach(m => {
      const isMe = m.username === currentUser?.username;
      if (m.active_session_id !== null && !isMe) {
        newFocusing[m.username] = true;
        if (!_lastFocusingMembers[m.username] && typeof showToast === 'function') {
          showToast(`🔥 ${esc(m.username)} odağa başladı!`);
        }
      }
    });
    _lastFocusingMembers = newFocusing;

    renderPartyDuel(party);
  } catch (err) {
    if (err?.name !== 'TypeError') console.error('fetchPartyAndRender error:', err);
  }
}


// ─────────────────────────────────────────────────────────────
// § 16. PARTY REÖNDER / DUEL DISPLAY
// ─────────────────────────────────────────────────────────────
window._lobbyCardSize    = localStorage.getItem('os_lobby_size') || 'm';
window._currentPartyData = null;

function setGlobalCardSize(size) {
  window._lobbyCardSize = size;
  localStorage.setItem('os_lobby_size', size);
  if (_currentPartyId) fetchPartyAndRender(_currentPartyId);
}

function getRoleLabel(role) {
  return { owner: 'Kurucu', admin: 'Yönetici', moderator: 'Moderatör', member: '' }[role] || '';
}
function getRoleColor(role) {
  return { owner: '#fbbf24', admin: '#c084fc', moderator: '#60a5fa', member: '#80848e' }[role] || '#80848e';
}

function syncPartyTitleMarquee() {
  const label    = el('partyFocusLabel');
  const viewport = label?.querySelector('.party-focus-label-viewport');
  const text     = label?.querySelector('.party-focus-label-text');
  if (!label || !viewport || !text) return;
  requestAnimationFrame(() => {
    const overflow = Math.max(0, Math.ceil(text.scrollWidth - viewport.clientWidth));
    text.style.setProperty('--party-title-shift',    `${-overflow}px`);
    text.style.setProperty('--party-title-duration', `${Math.min(24, Math.max(7, overflow / 16 + 5))}s`);
    text.classList.toggle('is-long-title', overflow > 2);
  });
}

function renderPartyDuel(partyData) {
  const party   = (partyData?.members) ? partyData : { members: Array.isArray(partyData) ? partyData : [] };
  const members = party.members || [];
  window._currentPartyData = party;
  if (_currentPartyId) window._currentPartyId = _currentPartyId;

  const grid      = el('partyDuelGrid');
  const solo      = el('timerSolo');
  const duelInner = el('timerDuelInner');
  const overlay   = el('partyFocusOverlay');
  const membersEl = el('partyFocusMembers');
  const labelEl   = el('partyFocusLabel');
  const addChanBtn = el('addChannelBtnHeader');

  if (!members.length || !overlay || !_currentPartyId) {
    if (grid)    grid.style.display = 'none';
    if (overlay) { overlay.classList.remove('in-active-party'); overlay.style.display = 'none'; overlay.style.setProperty('display','none','important'); }
    return;
  }

  _duelMode = false;
  if (solo)      solo.style.display      = 'flex';
  if (duelInner) duelInner.style.display = 'none';
  if (grid)      grid.style.display      = 'none';

  const meMember  = members.find(m => m.username === currentUser?.username);
  const isOwner   = Boolean(
    (party.owner_id   && currentUser?.id       && parseInt(party.owner_id)   === parseInt(currentUser.id))  ||
    (party.owner_name && currentUser?.username && party.owner_name === currentUser.username) ||
    (meMember && meMember.role === 'owner')
  );
  const canManage     = isOwner || (meMember && ['owner','admin','moderator'].includes(meMember?.role));
  const myDisplayRole = isOwner ? 'owner' : (meMember?.role || 'member');

  // Party name header
  if (labelEl) {
    labelEl.innerHTML = `<span class="party-focus-label-viewport"><span class="party-focus-label-text">${esc(party.name || 'Odak Odası')}</span></span>`;
    syncPartyTitleMarquee();
  }

  if (addChanBtn) addChanBtn.style.display = canManage ? 'inline-flex' : 'none';

  // Moderation button
  let modBtn = el('partyModerationBtn');
  if (!modBtn && addChanBtn?.parentElement) {
    modBtn = document.createElement('button');
    modBtn.id        = 'partyModerationBtn';
    modBtn.type      = 'button';
    modBtn.className = 'party-hdr-btn';
    modBtn.setAttribute('data-tooltip', 'Oda Yönetimi');
    modBtn.setAttribute('data-tooltip-pos', 'bottom');
    modBtn.setAttribute('aria-label', 'Oda Yönetimi');
    modBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    modBtn.onclick = () => {
      if (window.RoomManagement?.open) window.RoomManagement.open();
      else if (typeof openPartyModal === 'function') {
        if (typeof switchPartyTab === 'function') switchPartyTab('manage');
        openPartyModal();
      }
    };
    addChanBtn.parentElement.insertBefore(modBtn, addChanBtn.nextSibling);
  }
  if (modBtn) modBtn.style.display = ['owner','admin','moderator'].includes(myDisplayRole) ? 'inline-flex' : 'none';

  const bottomPartyBtn = el('timerPartyBtn');
  if (bottomPartyBtn) bottomPartyBtn.style.display = ['owner','admin','moderator'].includes(myDisplayRole) ? 'flex' : 'none';

  // Channel resolution
  const defaultChanId = parseInt(party.default_channel_id) || (party.channels?.[0] ? parseInt(party.channels[0].id) : 1);
  if (meMember) {
    const serverChanId = meMember.channel_id ? parseInt(meMember.channel_id) : defaultChanId;
    if (window._currentChannelId && parseInt(window._currentChannelId) !== serverChanId) {
      window._currentChannelId = serverChanId;
      if (typeof switchVoiceChannel === 'function') switchVoiceChannel(serverChanId);
    } else if (!window._currentChannelId) {
      window._currentChannelId = serverChanId;
    }
  } else if (!window._currentChannelId) {
    window._currentChannelId = defaultChanId;
  }

  const channels = (party.channels?.length > 0)
    ? party.channels.map(c => ({ ...c, id: parseInt(c.id) || defaultChanId }))
    : [{ id: defaultChanId, name: 'Genel Odak Odası', user_limit: 0, position: 0, is_default: 1 }];

  if (membersEl) {
    membersEl.innerHTML = channels.map(chan => {
      const chanMembers    = members.filter(m => parseInt(m.channel_id) === parseInt(chan.id) || (!m.channel_id && chan.is_default));
      const isCurrentChan  = window._currentChannelId && parseInt(window._currentChannelId) === parseInt(chan.id);
      const isFull         = chan.user_limit > 0 && chanMembers.length >= chan.user_limit;

      return `<div class="sub-channel-card ${isCurrentChan ? 'active-channel' : ''}" id="channel-card-${chan.id}"
        ondragover="handleChannelDragOver(event)" ondragleave="handleChannelDragLeave(event)" ondrop="handleChannelDrop(event, ${chan.id})">
        <div class="sub-channel-header" onclick="joinSubChannel(${chan.id})">
          <div class="sub-channel-title" style="display:flex;align-items:center;gap:8px;min-width:0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="${isCurrentChan ? '#23a55a' : '#80848e'}" stroke-width="2" width="16" height="16"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            <span class="sub-channel-name" style="color:${isCurrentChan ? '#ffffff' : '#949ba4'};font-weight:${isCurrentChan ? '700' : '500'};font-size:13px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${esc(chan.name)}</span>
            ${chan.user_limit > 0 ? `<span style="font-size:10px;color:#80848e;font-family:monospace;flex-shrink:0;">${chanMembers.length}/${chan.user_limit}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            ${canManage ? `<div onclick="event.stopPropagation();" class="channel-actions" style="display:flex;align-items:center;gap:4px;opacity:0.6;">
              <button onclick="promptEditChannel(${chan.id}, '${esc(chan.name)}', ${chan.user_limit})" data-tooltip="Kanalı Düzenle" style="background:none;border:none;color:#b5bac1;cursor:pointer;padding:2px;display:inline-flex;align-items:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              ${!chan.is_default ? `<button onclick="promptDeleteChannel(${chan.id})" data-tooltip="Kanalı Sil" style="background:none;border:none;color:#b5bac1;cursor:pointer;padding:2px;display:inline-flex;align-items:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>` : ''}
            </div>` : ''}
          </div>
        </div>
        <div class="sub-channel-members-list">
          ${chanMembers.length === 0 ? `<div style="font-size:11px;color:#4e5058;padding:4px 8px;font-style:italic;">— Boş —</div>` : chanMembers.map(m => {
            const isMe    = m.username === currentUser?.username;
            const isActive = m.active_session_id !== null || (isMe && window._activeSession);
            const startUtc = m.session_start ? new Date(m.session_start.replace(' ','T') + 'Z') : null;
            const elapsed  = isMe ? _sessionElapsed : (isActive && startUtc ? Math.floor((Date.now() - startUtc.getTime()) / 1000) : 0);
            const roleLabel = getRoleLabel(m.role);
            const roleColor = getRoleColor(m.role);
            return `<div class="party-focus-member ${isMe ? 'is-me' : ''}" id="member-card-${m.username}"
              data-voice-modal-user data-username="${esc(m.username)}"
              onclick="if(typeof openUserVoiceModal === 'function') openUserVoiceModal('${esc(m.username)}');"
              style="cursor:pointer;" aria-label="${esc(m.username)} oda üyesi">
              <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden;">
                <div class="voice-avatar-wrap" data-voice-username="${esc(m.username)}">
                  ${typeof renderAvatar === 'function' ? renderAvatar(m, 'avatar avatar-xs') : ''}
                  <span class="voice-speaking-ring" aria-hidden="true"></span>
                </div>
                <div style="display:flex;flex-direction:column;min-width:0;overflow:hidden;">
                  <span class="party-focus-member-name" style="font-size:13px;color:${isMe ? '#ffffff' : '#dbdee1'};font-weight:500;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${esc(m.username)}</span>
                  ${roleLabel ? `<span style="font-size:10px;color:${roleColor};font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">${roleLabel}</span>` : ''}
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:6px;">
                <div id="voice-badge-${m.username}"></div>
                <span style="font-size:11px;color:#80848e;font-weight:600;white-space:nowrap;">${isActive ? fmtClock(elapsed) : ''}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');
  }

  const soloPartyRow = el('soloPartyControlsRow');
  if (_currentPartyId) {
    overlay.classList.add('in-active-party');
    overlay.style.display = 'flex';
    overlay.style.removeProperty('display');
    if (soloPartyRow) soloPartyRow.style.display = 'none';
    const inviteBtn = el('timerInvitePartyBtn');
    if (inviteBtn) inviteBtn.style.display = 'inline-flex';
    if (typeof updatePartyOverlayCollapseBtn === 'function') updatePartyOverlayCollapseBtn();
  } else {
    overlay.classList.remove('in-active-party');
    overlay.style.display = 'none';
    overlay.style.setProperty('display', 'none', 'important');
    if (soloPartyRow) soloPartyRow.style.display = 'flex';
    const inviteBtn = el('timerInvitePartyBtn');
    if (inviteBtn) inviteBtn.style.display = 'none';
  }

  if (typeof updateLobbyVoiceBadges === 'function') updateLobbyVoiceBadges();
}


// ─────────────────────────────────────────────────────────────
// § 17. CHANNEL CONFIG MODAL
// ─────────────────────────────────────────────────────────────
window._ccmMode            = null;
window._ccmTargetChannelId = null;

function updateCcmLimitDisplay(val) {
  const v = parseInt(val) || 0;
  const d = el('ccmLimitDisplay');
  if (d) d.textContent = v === 0 ? 'Sınırsız' : `${v} kişi`;
}

function openChannelConfigModal(mode, options = {}) {
  window._ccmMode            = mode;
  window._ccmTargetChannelId = options.channelId || null;

  const partyModal = el('partyModal');
  if (partyModal?.classList.contains('open')) {
    window._ccmWasPartyModalOpen = true;
    if (typeof closePartyModal === 'function') closePartyModal();
  }

  const modal      = el('channelConfigModal');
  const title      = el('ccmTitle');
  const nameLabel  = el('ccmNameLabel');
  const nameInput  = el('ccmNameInput');
  const limitWrap  = el('ccmLimitWrap');
  const limitInput = el('ccmLimitInput');
  const deleteBtn  = el('ccmDeleteBtn');
  const ssWrap     = el('ccmScreenShareWrap');
  const ssCheck    = el('ccmScreenShareToggle');
  if (!modal) return;

  if (mode === 'rename_party') {
    if (title)      title.textContent     = 'Oda Adını Değiştir';
    if (nameLabel)  nameLabel.textContent = 'ODA ADI';
    if (nameInput)  nameInput.value       = options.currentName || '';
    if (limitWrap)  limitWrap.style.display  = 'none';
    if (deleteBtn)  deleteBtn.style.display  = 'none';
    if (ssWrap)     ssWrap.style.display     = 'none';
  } else if (mode === 'add_channel') {
    if (title)      title.textContent     = 'Yeni Alt Oda Ekle';
    if (nameLabel)  nameLabel.textContent = 'KANAL ADI';
    if (nameInput)  nameInput.value       = '';
    if (limitWrap)  limitWrap.style.display  = 'block';
    if (limitInput) { limitInput.min = '0'; limitInput.value = '0'; }
    updateCcmLimitDisplay(0);
    if (deleteBtn)  deleteBtn.style.display  = 'none';
    if (ssWrap)     ssWrap.style.display     = 'flex';
    if (ssCheck)    ssCheck.checked          = false;
  } else if (mode === 'edit_channel') {
    if (title)      title.textContent     = 'Alt Odayı Düzenle';
    if (nameLabel)  nameLabel.textContent = 'KANAL ADI';
    if (nameInput)  nameInput.value       = options.currentName || '';
    if (limitWrap)  limitWrap.style.display = 'block';
    const lv = Math.min(parseInt(options.currentLimit) || 0, 20);
    if (limitInput) limitInput.value = lv;
    updateCcmLimitDisplay(lv);
    if (deleteBtn)  deleteBtn.style.display  = options.isDefault ? 'none' : 'inline-block';
    if (ssWrap)     ssWrap.style.display     = 'flex';
    if (ssCheck)    ssCheck.checked          = !!(options.allowScreenShare);
  }

  modal.style.display = 'flex';
  modal.classList.add('open');
  if (nameInput) setTimeout(() => { nameInput.focus(); nameInput.select(); }, 100);
}

function closeChannelConfigModal() {
  const modal = el('channelConfigModal');
  if (modal) { modal.classList.remove('open'); modal.style.display = 'none'; }
  window._ccmMode = null;
  window._ccmTargetChannelId = null;
  if (window._ccmWasPartyModalOpen) {
    window._ccmWasPartyModalOpen = false;
    if (typeof openPartyModal === 'function') openPartyModal();
  }
}

async function submitChannelConfigModal() {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId || !window._ccmMode) { if (typeof showToast === 'function') showToast('Odak odası bulunamadı'); return; }

  const nameInput       = el('ccmNameInput');
  const limitInput      = el('ccmLimitInput');
  const ssCheck         = el('ccmScreenShareToggle');
  const name            = nameInput ? nameInput.value.trim() : '';
  const userLimit       = limitInput ? parseInt(limitInput.value) || 0 : 0;
  const allowScreenShare = ssCheck ? ssCheck.checked : false;

  if (!name) { if (typeof showToast === 'function') showToast('Lütfen geçerli bir isim giriniz'); return; }

  const saveBtn = el('ccmSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Kaydediliyor...'; }

  try {
    if (window._ccmMode === 'rename_party') {
      const res = await fetch(`/api/parties/${partyId}/name`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (res.ok) {
        if (typeof showToast === 'function') showToast('✅ Oda adı güncellendi');
        if (window._currentPartyData) window._currentPartyData.name = name;
        closeChannelConfigModal();
        fetchPartyAndRender(partyId);
        if (typeof refreshPartyModal === 'function') refreshPartyModal();
      } else {
        const d = await res.json().catch(() => ({}));
        if (typeof showToast === 'function') showToast(d.error || 'Güncellenemedi');
      }
    } else if (window._ccmMode === 'add_channel') {
      const res = await fetch(`/api/parties/${partyId}/channels`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, userLimit, allowScreenShare }) });
      if (res.ok) {
        if (typeof showToast === 'function') showToast('Yeni alt oda oluşturuldu');
        closeChannelConfigModal();
        fetchPartyAndRender(partyId);
        if (typeof refreshPartyModal === 'function') refreshPartyModal();
      } else {
        const d = await res.json().catch(() => ({}));
        if (typeof showToast === 'function') showToast(d.error || 'Oluşturulamadı');
      }
    } else if (window._ccmMode === 'edit_channel' && window._ccmTargetChannelId) {
      const res = await fetch(`/api/parties/${partyId}/channels/${window._ccmTargetChannelId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, userLimit, allowScreenShare }) });
      if (res.ok) {
        if (typeof showToast === 'function') showToast('✅ Kanal güncellendi');
        closeChannelConfigModal();
        fetchPartyAndRender(partyId);
        if (typeof refreshPartyModal === 'function') refreshPartyModal();
      } else {
        const d = await res.json().catch(() => ({}));
        if (typeof showToast === 'function') showToast(d.error || 'Güncellenemedi');
      }
    }
  } catch (e) {
    console.error('submitChannelConfigModal error:', e);
    if (typeof showToast === 'function') showToast('İşlem başarısız');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Kaydet'; }
  }
}

async function submitChannelDeleteFromModal() {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId || !window._ccmTargetChannelId) return;
  try {
    const res = await fetch(`/api/parties/${partyId}/channels/${window._ccmTargetChannelId}`, { method: 'DELETE' });
    if (res.ok) {
      if (typeof showToast === 'function') showToast('Alt oda silindi');
      playChannelSound('disconnect');
      closeChannelConfigModal();
      fetchPartyAndRender(partyId);
      if (typeof refreshPartyModal === 'function') refreshPartyModal();
    } else {
      const d = await res.json().catch(() => ({}));
      if (typeof showToast === 'function') showToast(d.error || 'Silinemedi');
    }
  } catch (e) { console.error('Delete channel error:', e); }
}

function triggerPartyRenameFromHeader() {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId) { if (typeof showToast === 'function') showToast('Herhangi bir odak odasında değilsiniz'); return; }
  const party   = window._currentPartyData || {};
  const members = party.members || [];
  const meMember = members.find(m => m.username === currentUser?.username);
  const isOwner  = Boolean(
    (party.owner_id   && currentUser?.id       && parseInt(party.owner_id)   === parseInt(currentUser.id)) ||
    (party.owner_name && currentUser?.username && party.owner_name === currentUser.username) ||
    (meMember && meMember.role === 'owner')
  );
  const canManage = isOwner || (meMember && ['owner','admin','moderator'].includes(meMember?.role)) || !party.owner_id;
  if (!canManage) { if (typeof showToast === 'function') showToast('Sadece oda yöneticisi oda adını değiştirebilir'); return; }
  const labelEl   = el('partyFocusLabel');
  const currentName = party.name || (labelEl ? labelEl.textContent.trim().replace(/\s*✏.*$/, '') : '');
  openChannelConfigModal('rename_party', { currentName });
}

function promptAddChannel() {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId) { if (typeof showToast === 'function') showToast('Herhangi bir odak odasında değilsiniz'); return; }
  const party   = window._currentPartyData || {};
  const members = party.members || [];
  const meMember = members.find(m => m.username === currentUser?.username);
  const isOwner  = Boolean(
    (party.owner_id   && currentUser?.id       && parseInt(party.owner_id)   === parseInt(currentUser.id)) ||
    (party.owner_name && currentUser?.username && party.owner_name === currentUser.username) ||
    (meMember && meMember.role === 'owner')
  );
  const canManage = isOwner || (meMember && ['owner','admin','moderator'].includes(meMember?.role)) || !party.owner_id;
  if (!canManage) { if (typeof showToast === 'function') showToast('Sadece oda yöneticisi alt oda ekleyebilir'); return; }
  openChannelConfigModal('add_channel');
}

function promptEditChannel(chanId, currentName, currentLimit) {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId) return;
  const chan = (window._currentPartyData?.channels || []).find(c => parseInt(c.id) === parseInt(chanId));
  openChannelConfigModal('edit_channel', { channelId: chanId, currentName, currentLimit, isDefault: chan?.is_default || false, allowScreenShare: !!chan?.allow_screen_share });
}

function promptDeleteChannel(chanId) {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId) return;
  const chan = (window._currentPartyData?.channels || []).find(c => parseInt(c.id) === parseInt(chanId));
  openChannelConfigModal('edit_channel', { channelId: chanId, currentName: chan?.name || '', currentLimit: chan?.user_limit || 0, isDefault: chan?.is_default || false, allowScreenShare: !!chan?.allow_screen_share });
}

async function reorderChannel(chanId, direction) {
  if (!window._currentPartyId || !window._currentPartyData) return;
  const channels = window._currentPartyData.channels || [];
  const idx      = channels.findIndex(c => parseInt(c.id) === parseInt(chanId));
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= channels.length) return;
  const reordered = channels.map((c, i) => ({ id: c.id, position: i }));
  [reordered[idx].position, reordered[targetIdx].position] = [reordered[targetIdx].position, reordered[idx].position];
  try {
    const res = await fetch(`/api/parties/${window._currentPartyId}/channels-reorder`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels: reordered }) });
    if (res.ok) fetchPartyAndRender(window._currentPartyId);
  } catch (e) { console.error('Reorder channels error:', e); }
}

async function joinSubChannel(chanId) {
  if (!window._currentPartyId) return;
  if (window._currentChannelId && parseInt(window._currentChannelId) === parseInt(chanId)) return;
  const targetChan = (window._currentPartyData?.channels || []).find(c => parseInt(c.id) === parseInt(chanId));
  const chanName   = targetChan?.name || 'Kanal';
  try {
    const res = await fetch(`/api/parties/${window._currentPartyId}/channels/${chanId}/join`, { method: 'POST' });
    if (res.ok) {
      window._currentChannelId = chanId;
      if (typeof switchVoiceChannel === 'function') await switchVoiceChannel(chanId);
      playChannelSound('connect');
      if (typeof showToast === 'function') showToast(`"${chanName}" kanalına geçildi`);
      fetchPartyAndRender(window._currentPartyId);
    } else {
      const d = await res.json().catch(() => ({}));
      if (typeof showToast === 'function') showToast(d.error || 'Kanala katılamadı');
    }
  } catch (e) { console.error('Join channel error:', e); }
}


// ─────────────────────────────────────────────────────────────
// § 18. DRAG & DROP (CHANNEL MEMBERS)
// ─────────────────────────────────────────────────────────────
async function openPartyModerationPanel() {
  const partyId = window._currentPartyId;
  if (!partyId) return;
  el('partyModerationPanel')?.remove();
  const panel = document.createElement('section');
  panel.id        = 'partyModerationPanel';
  panel.className = 'party-moderation-panel';
  panel.innerHTML = `<div class="party-moderation-head">
    <div><strong>Oda Moderasyonu</strong><small>Aktif yasaklar ve geri alma işlemleri</small></div>
    <button type="button" aria-label="Kapat">×</button>
  </div><div class="party-moderation-body"><div class="party-moderation-loading">Yasak listesi yükleniyor…</div></div>`;
  panel.querySelector('.party-moderation-head button').onclick = () => panel.remove();
  document.body.appendChild(panel);
  const body = panel.querySelector('.party-moderation-body');
  try {
    const res  = await fetch(`/api/parties/${partyId}/moderation/bans`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Yasak listesi alınamadı');
    const bans = data.bans || [];
    body.innerHTML = bans.length ? bans.map(ban => `
      <article class="party-ban-row">
        <div class="party-ban-avatar">${esc((ban.username || '?').slice(0, 1).toUpperCase())}</div>
        <div class="party-ban-copy"><strong>@${esc(ban.username)}</strong><small>${esc(ban.reason || 'Gerekçe belirtilmedi')} · ${esc(ban.banned_by_username || 'Yönetici')}</small></div>
        <button type="button" data-user-id="${ban.user_id}">Yasağı kaldır</button>
      </article>`).join('') : '<div class="party-moderation-empty">Bu odada aktif yasak yok.</div>';
    body.querySelectorAll('[data-user-id]').forEach(btn => {
      btn.onclick = async () => {
        const uid = Number(btn.dataset.userId);
        btn.disabled = true;
        const res2 = await fetch(`/api/parties/${partyId}/members/${uid}/ban`, { method: 'DELETE' });
        const d    = await res2.json().catch(() => ({}));
        if (!res2.ok) { if (typeof showToast === 'function') showToast(d.error || 'Yasak kaldırılamadı'); btn.disabled = false; return; }
        if (typeof showToast === 'function') showToast('Yasak kaldırıldı');
        openPartyModerationPanel();
      };
    });
  } catch (err) {
    body.innerHTML = `<div class="party-moderation-empty">${esc(err.message || 'Moderasyon verisi alınamadı')}</div>`;
  }
}

function handleMemberDragStart(e, memberUserId) {
  e.stopPropagation();
  e.dataTransfer.setData('text/plain', memberUserId.toString());
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
  setTimeout(() => e.currentTarget?.classList.remove('dragging'), 400);
}
function handleChannelDragOver(e) {
  e.preventDefault(); e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function handleChannelDragLeave(e) {
  e.preventDefault(); e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
}
async function handleChannelDrop(e, targetChannelId) {
  e.preventDefault(); e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  const targetUserId = parseInt(e.dataTransfer.getData('text/plain'));
  if (!targetUserId || !window._currentPartyId) return;
  const chan = (window._currentPartyData?.channels || []).find(c => parseInt(c.id) === parseInt(targetChannelId));
  try {
    const res = await fetch(`/api/parties/${window._currentPartyId}/members/${targetUserId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: parseInt(targetChannelId) }) });
    if (res.ok) {
      if (typeof showToast === 'function') showToast(`Kullanıcı "${chan?.name || 'Kanal'}" kanalına taşındı`);
      playChannelSound('disconnect');
      fetchPartyAndRender(window._currentPartyId);
    } else {
      const d = await res.json().catch(() => ({}));
      if (typeof showToast === 'function') showToast(d.error || 'Taşıma başarısız');
    }
  } catch (e) { console.error('Channel drop error:', e); }
}


// ─────────────────────────────────────────────────────────────
// § 19. PARTY CHAT MODAL
// ─────────────────────────────────────────────────────────────
function togglePartyChatModal(show) {
  const modal = el('partyChatModal');
  if (!modal) return;
  modal.classList.toggle('open', show);
  if (show) {
    const badge = el('partyChatUnreadBadge');
    if (badge) badge.style.display = 'none';
    if (_currentPartyId) {
      const msgs = el('partyChatMessages');
      if (msgs) localStorage.setItem(`last_seen_party_msg_${_currentPartyId}`, msgs.children.length);
    }
    setTimeout(() => {
      el('partyChatInput')?.focus();
      const msgs = el('partyChatMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 100);
  }
}


// ─────────────────────────────────────────────────────────────
// § 20. ACTIVE PARTY MANAGEMENT
// ─────────────────────────────────────────────────────────────
async function setActiveParty(partyId, isForceTransfer = false) {
  if (!partyId || partyId === 'undefined' || partyId === 'null') { clearActiveParty(); return; }

  if (!isForceTransfer) {
    try {
      const devId    = typeof getDeviceSessionId === 'function' ? getDeviceSessionId() : '';
      const checkRes = await fetch(`/api/user/active-voice-session?deviceId=${encodeURIComponent(devId)}`);
      if (checkRes.ok) {
        const activeData = await checkRes.json();
        if (activeData.hasActiveVoice && activeData.isOtherDevice) {
          if (typeof checkAndRenderHandoverButton === 'function') checkAndRenderHandoverButton(partyId);
          startPartyPoll(partyId);
          return;
        }
      }
    } catch { /* ignore */ }
  }

  _currentPartyId        = partyId;
  window._currentPartyId = partyId;

  const overlay = el('partyFocusOverlay');
  if (overlay) { overlay.classList.add('in-active-party'); overlay.style.display = 'flex'; overlay.style.removeProperty('display'); }

  if (typeof showPage === 'function') showPage('timer');
  playChannelSound('connect');

  const info    = el('activePartyInfo');
  const btn     = el('timerPartyBtn');
  const chatBtn = el('timerChatBtn');
  const leaveBtn = el('timerLeavePartyBtn');
  const soloPartyRow = el('soloPartyControlsRow');

  if (soloPartyRow) soloPartyRow.style.display = 'none';
  if (info)    info.style.display    = 'none';
  if (chatBtn) chatBtn.style.display = 'block';
  if (leaveBtn) leaveBtn.style.display = 'flex';
  if (btn) {
    btn.style.display = 'inline-flex';
    btn.onclick       = () => typeof openPartyManagementModal === 'function' && openPartyManagementModal();
    btn.title         = 'Oda Yönetimi';
    btn.innerHTML     = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  }

  startPartyPoll(partyId);
  await fetchPartyAndRender(partyId);
  if (typeof initVoiceChat === 'function') initVoiceChat(partyId);
}

function clearActiveParty() {
  _currentPartyId        = null;
  window._currentPartyId = null;
  _duelMode              = false;

  clearInterval(_partyPollInterval); _partyPollInterval = null;
  clearInterval(_partyMsgInterval);  _partyMsgInterval  = null;
  clearInterval(_partyUIInterval);   _partyUIInterval   = null;

  if (typeof stopVoiceChat === 'function') stopVoiceChat();

  const overlay      = el('partyFocusOverlay');
  const btn          = el('timerPartyBtn');
  const chatBtn      = el('timerChatBtn');
  const leaveBtn     = el('timerLeavePartyBtn');
  const soloPartyRow = el('soloPartyControlsRow');

  if (overlay) { overlay.classList.remove('in-active-party'); overlay.style.display = 'none'; overlay.style.setProperty('display','none','important'); }
  if (soloPartyRow) soloPartyRow.style.display = 'flex';
  if (btn) {
    btn.style.display = 'inline-flex';
    btn.title         = 'Odak Odası';
    btn.innerHTML     = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  }
  if (chatBtn)  chatBtn.style.display  = 'none';
  if (leaveBtn) leaveBtn.style.display = 'none';
  if (typeof togglePartyChatModal === 'function') togglePartyChatModal(false);

  const solo      = el('timerSolo');
  const duelInner = el('timerDuelInner');
  if (solo)      solo.style.display      = 'flex';
  if (duelInner) duelInner.style.display = 'none';

  _partyLiveMembers    = [];
  _lastFocusingMembers = {};
}

async function checkActiveParty() {
  try {
    const res     = await fetch('/api/parties');
    if (!res.ok) return;
    const parties = await res.json();
    const active  = parties.find(p => p.is_member > 0);
    if (active) setActiveParty(active.id);
    else clearActiveParty();
  } catch (err) { console.error('checkActiveParty error:', err); }
}

async function leavePartyFromTimer() {
  if (!_currentPartyId) { clearActiveParty(); return; }
  const pid = _currentPartyId;
  try {
    const res   = await fetch(`/api/parties/${pid}`);
    if (!res.ok) { clearActiveParty(); return; }
    const party = await res.json();
    if (currentUser && party.owner_id === currentUser.id) {
      if (typeof deleteParty === 'function') await deleteParty(pid);
    } else {
      if (typeof leaveParty === 'function') await leaveParty(pid);
    }
  } catch (err) { console.error('leavePartyFromTimer error:', err); }
}


// ─────────────────────────────────────────────────────────────
// § 21. STATUS CHIP ANIMATION
// ─────────────────────────────────────────────────────────────
function startStatusChipAnimation() {
  if (window._statusChipInterval) return;
  const chip    = el('timerStatusChip');
  const avatarEl = el('statusChipAvatar');
  const nameEl   = el('statusChipUsername');
  const textEl   = el('statusText');
  const dotEl    = el('statusDot');
  if (!chip) return;

  const SPRING   = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const FAST_OUT = 'cubic-bezier(0.55, 0, 1, 0.45)';
  const COLORS   = { online: '#4ade80', away: '#fbbf24', dnd: '#ef4444', invisible: '#9ca3af' };
  const LABELS   = { online: 'ÇEVRİMİÇİ', away: 'UZAKTA', dnd: 'R. ETME', invisible: 'GÖRÜNMEz' };

  let _transitioning = false;

  const freeze = (elmt) => {
    if (!elmt) return;
    elmt.getAnimations().forEach(a => { try { a.commitStyles(); } catch { } a.cancel(); });
  };

  const refreshData = () => {
    if (!currentUser) return;
    const s = currentUser.status || 'online';
    const c = COLORS[s] || COLORS.online;
    if (dotEl) {
      dotEl.setAttribute('data-status', s);
      dotEl.style.background  = c;
      dotEl.style.boxShadow   = `0 0 6px ${c}`;
      dotEl.style.transform   = '';
      dotEl.style.color       = c;
    }
    if (avatarEl) {
      if (currentUser.profile_photo && !currentUser.profile_photo.includes('default-avatar.png')) {
        avatarEl.style.backgroundImage = `url('${currentUser.profile_photo}')`;
        avatarEl.textContent = '';
      } else {
        avatarEl.style.backgroundImage = 'none';
        avatarEl.textContent = currentUser.username ? currentUser.username[0].toUpperCase() : '?';
        Object.assign(avatarEl.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', color: '#fff' });
      }
    }
    if (nameEl) nameEl.textContent = `@${currentUser.username || ''}`;
    if (textEl) textEl.textContent = LABELS[s] || 'ÇEVRİMİÇİ';
    if (chip && window._statusTooltips) {
      const list     = window._statusTooltips[s] || window._statusTooltips.online;
      const template = list[window._statusTooltipIndex] || list[0];
      chip.setAttribute('data-tooltip', template.replace(/@username/g, currentUser.username ? `@${currentUser.username}` : 'Sen'));
    }
  };

  const toProfile = async () => {
    refreshData();
    if (nameEl) nameEl.style.animation = '';
    const exits = [];
    if (dotEl) {
      freeze(dotEl);
      exits.push(dotEl.animate([
        { transform: 'translateY(-50%) scale(1)', opacity: 1 },
        { transform: 'translateY(-50%) scale(1.45)', opacity: 1, offset: 0.3 },
        { transform: 'translateY(-50%) translateX(-32px) scale(0.1)', opacity: 0 }
      ], { duration: 290, easing: FAST_OUT, fill: 'forwards' }).finished.catch(() => {}));
    }
    if (textEl) {
      freeze(textEl);
      exits.push(textEl.animate([
        { opacity: 1, transform: 'translateY(-50%) translateX(-50%) scale(1)' },
        { opacity: 0, transform: 'translateY(-66%) translateX(-50%) scale(0.82)' }
      ], { duration: 210, easing: FAST_OUT, fill: 'forwards' }).finished.catch(() => {}));
    }
    await Promise.all(exits).catch(() => {});
    chip.classList.remove('state-status'); chip.classList.add('state-profile');
    if (avatarEl) {
      freeze(avatarEl);
      avatarEl.animate([
        { opacity: 0, transform: 'translateY(-50%) translateX(38px) scale(0.52)' },
        { opacity: 1, transform: 'translateY(-50%) translateX(-4px) scale(1.08)', offset: 0.60 },
        { opacity: 1, transform: 'translateY(-50%) translateX(0) scale(1)' }
      ], { duration: 530, easing: SPRING, fill: 'forwards' });
    }
    await new Promise(r => setTimeout(r, 110));
    if (nameEl) {
      freeze(nameEl);
      nameEl.animate([
        { opacity: 0, transform: 'translateY(-50%) translateX(22px)' },
        { opacity: 1, transform: 'translateY(-50%) translateX(0)' }
      ], { duration: 480, easing: SPRING, fill: 'forwards' }).finished.then(() => {
        if (chip.classList.contains('state-profile') && nameEl) nameEl.style.animation = 'metallicShimmer 5s 0.5s ease-in-out infinite';
      }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 60));
    if (dotEl) {
      freeze(dotEl);
      dotEl.animate([
        { transform: 'translateY(-50%) translateX(26px) scale(0.1)', opacity: 0 },
        { transform: 'translateY(-50%) translateX(-4px) scale(1.32)', opacity: 1, offset: 0.58 },
        { transform: 'translateY(-50%) translateX(1px) scale(0.93)', opacity: 1, offset: 0.80 },
        { transform: 'translateY(-50%) translateX(0) scale(1)', opacity: 1 }
      ], { duration: 510, easing: SPRING, fill: 'forwards' }).finished.then(() => {
        if (dotEl) dotEl.style.transform = '';
      }).catch(() => {});
    }
  };

  const toStatus = async () => {
    refreshData();
    if (nameEl) nameEl.style.animation = '';
    const exits = [];
    if (dotEl) {
      freeze(dotEl);
      exits.push(dotEl.animate([
        { transform: 'translateY(-50%) scale(1)', opacity: 1 },
        { transform: 'translateY(-50%) scale(1.45)', opacity: 1, offset: 0.28 },
        { transform: 'translateY(-50%) translateX(-32px) scale(0.1)', opacity: 0 }
      ], { duration: 275, easing: FAST_OUT, fill: 'forwards' }).finished.catch(() => {}));
    }
    if (nameEl) {
      freeze(nameEl);
      exits.push(nameEl.animate([
        { opacity: 1, transform: 'translateY(-50%) translateX(0)' },
        { opacity: 0, transform: 'translateY(-50%) translateX(-18px)' }
      ], { duration: 195, easing: FAST_OUT, fill: 'forwards' }).finished.catch(() => {}));
    }
    if (avatarEl) {
      freeze(avatarEl);
      exits.push(avatarEl.animate([
        { opacity: 1, transform: 'translateY(-50%) translateX(0) scale(1)' },
        { opacity: 0, transform: 'translateY(-50%) translateX(-24px) scale(0.6)' }
      ], { duration: 230, delay: 35, easing: FAST_OUT, fill: 'forwards' }).finished.catch(() => {}));
    }
    await Promise.all(exits).catch(() => {});
    chip.classList.remove('state-profile'); chip.classList.add('state-status');
    if (textEl) {
      freeze(textEl);
      textEl.animate([
        { opacity: 0, transform: 'translateY(-38%) translateX(-50%) scale(0.86)' },
        { opacity: 1, transform: 'translateY(-50%) translateX(-50%) scale(1)' }
      ], { duration: 440, easing: SPRING, fill: 'forwards' });
    }
    await new Promise(r => setTimeout(r, 130));
    if (dotEl) {
      freeze(dotEl);
      dotEl.animate([
        { transform: 'translateY(-50%) translateX(24px) scale(0.1)', opacity: 0 },
        { transform: 'translateY(-50%) translateX(-4px) scale(1.28)', opacity: 1, offset: 0.60 },
        { transform: 'translateY(-50%) translateX(1px) scale(0.92)', opacity: 1, offset: 0.80 },
        { transform: 'translateY(-50%) translateX(0) scale(1)', opacity: 1 }
      ], { duration: 490, easing: SPRING, fill: 'forwards' }).finished.then(() => {
        if (dotEl) dotEl.style.transform = '';
      }).catch(() => {});
    }
  };

  // Init
  [avatarEl, nameEl, textEl, dotEl].forEach(e => { if (!e) return; e.getAnimations().forEach(a => a.cancel()); e.style.cssText = ''; });
  if (nameEl) nameEl.style.animation = '';
  chip.classList.remove('state-profile', 'state-focus');
  chip.classList.add('state-status');
  refreshData();

  let _phase = 'status';
  window._statusChipInterval = setInterval(async () => {
    if (chip.classList.contains('state-focus') || _transitioning) return;
    _transitioning = true;
    const goToProfile = _phase === 'status';
    try {
      await (goToProfile ? toProfile() : toStatus());
      _phase = goToProfile ? 'profile' : 'status';
    } catch { /* DOMException from cancelled animations */ } finally {
      _transitioning = false;
    }
  }, 4500);
}


// ─────────────────────────────────────────────────────────────
// § 22. PARTY INVITE
// ─────────────────────────────────────────────────────────────
function copyPartyInviteLink() {
  const partyId   = window._currentPartyId;
  const partyData = window._currentPartyData;
  if (!partyId) { if (typeof showToast === 'function') showToast('Önce bir odak odasına katılmalısınız'); return; }
  const code = partyData?.code ? partyData.code : partyId;
  const url  = `${window.location.origin}?party=${code}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => { if (typeof showToast === 'function') showToast('Oda davet bağlantısı kopyalandı!'); }).catch(() => _fallbackCopy(url));
  } else {
    _fallbackCopy(url);
  }
}

function _fallbackCopy(text) {
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  try { document.execCommand('copy'); if (typeof showToast === 'function') showToast('Oda davet bağlantısı kopyalandı!'); }
  catch { if (typeof showToast === 'function') showToast('Kopyalanamadı'); }
  input.remove();
}

window.copyPartyInviteLink = async function() {
  const partyId = window._currentPartyId;
  if (!partyId) { if (typeof showToast === 'function') showToast('Şu an aktif bir odak odasında değilsiniz.'); return; }
  try {
    let code = window._currentPartyData?.invite_code;
    if (!code || code === 'null' || code === '') {
      try {
        const res = await fetch(`/api/parties/${partyId}`);
        if (res.ok) code = (await res.json()).invite_code;
      } catch { /* ignore */ }
    }
    if (!code || code === 'null' || code === '') {
      try {
        const res = await fetch(`/api/parties/${partyId}/regenerate-invite`, { method: 'POST' });
        if (res.ok) code = (await res.json()).inviteCode;
      } catch { /* ignore */ }
    }
    if (!code) code = partyId;
    const inviteUrl  = `${window.location.origin}/?join=${code}`;
    const inviteText = `📢 BLUNK Sesli Odaklanma Odası Daveti!\n🚀 Odama katıl ve benimle birlikte odaklanmaya başla:\n🔗 ${inviteUrl}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'BLUNK Odak Odası Daveti', text: '📢 BLUNK Sesli Çalışma Odası Daveti!\n🚀 Odama katıl ve benimle birlikte odaklanmaya başla:', url: inviteUrl }); return; }
      catch { /* fallthrough to clipboard */ }
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(inviteText);
      if (typeof showToast === 'function') showToast('Oda davet bağlantısı panoya kopyalandı! 📋');
    } else {
      window.prompt('Oda davet bağlantınızı kopyalayın:', inviteText);
    }
  } catch (err) {
    console.error('copyPartyInviteLink error:', err);
    if (typeof showToast === 'function') showToast('Davet bağlantısı oluşturulurken hata meydana geldi.');
  }
};


// ─────────────────────────────────────────────────────────────
// § 23. DRAGGABLE PARTY OVERLAY
// ─────────────────────────────────────────────────────────────
function _isMobileView() { return window.innerWidth <= 768; }

function _placeOverlayFixed(overlay) {
  overlay.style.position  = 'fixed';
  overlay.style.transform = 'none';
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('os_overlay_snap') || 'null'); } catch { /* ignore */ }

  if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
    const W = window.innerWidth, H = window.innerHeight;
    const ow = overlay.offsetWidth || 44, oh = overlay.offsetHeight || 240;
    overlay.style.left   = `${Math.max(0, Math.min(W - ow, saved.left))}px`;
    overlay.style.top    = `${Math.max(56, Math.min(H - oh - 8, saved.top))}px`;
    overlay.style.right  = 'auto';
    overlay.style.bottom = 'auto';
  } else if (_isMobileView()) {
    const navBottom = 76 + (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0') || 0);
    overlay.style.right  = '16px';
    overlay.style.bottom = `${navBottom + 16}px`;
    overlay.style.left   = 'auto';
    overlay.style.top    = 'auto';
  } else {
    overlay.style.left   = '12px';
    overlay.style.top    = `${Math.max(56, Math.round((window.innerHeight - 240) / 2))}px`;
    overlay.style.right  = 'auto';
    overlay.style.bottom = 'auto';
  }
  overlay.classList.add('has-drag-pos');
}

function _snapToEdge(overlay) {
  const isMobile = _isMobileView();
  const W      = window.innerWidth, H = window.innerHeight;
  const MARGIN = isMobile ? 0 : 12;
  const rect   = overlay.getBoundingClientRect();
  const cx     = rect.left + rect.width / 2;
  const snapRight = cx > W / 2;
  const left   = snapRight ? (W - rect.width - MARGIN) : MARGIN;
  const top    = Math.max(56, Math.min(H - rect.height - 76, rect.top));

  overlay.style.transition = 'left 0.3s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s cubic-bezier(0.25, 1, 0.5, 1), right 0.3s, bottom 0.3s';
  overlay.style.left   = `${left}px`;
  overlay.style.top    = `${top}px`;
  overlay.style.right  = 'auto';
  overlay.style.bottom = 'auto';
  overlay.classList.add('has-drag-pos');
  try { localStorage.setItem('os_overlay_snap', JSON.stringify({ left, top })); } catch { /* ignore */ }
  updatePartyOverlayCollapseBtn();
  setTimeout(() => { overlay.style.transition = ''; }, 320);
}

function togglePartyFocusOverlay() {
  const overlay = el('partyFocusOverlay');
  if (!overlay) return;
  if (overlay.classList.contains('collapsed')) {
    overlay.classList.remove('collapsed', 'has-drag-pos');
    ['position','left','top','right','bottom','transform'].forEach(p => overlay.style[p] = '');
    try { localStorage.setItem('os_focus_overlay_collapsed', '0'); } catch { /* ignore */ }
  } else {
    overlay.classList.add('collapsed');
    _placeOverlayFixed(overlay);
    try { localStorage.setItem('os_focus_overlay_collapsed', '1'); } catch { /* ignore */ }
  }
  updatePartyOverlayCollapseBtn();
}

function updatePartyOverlayCollapseBtn() {
  const overlay = el('partyFocusOverlay');
  const btn     = el('partyOverlayCollapseBtn');
  if (!overlay || !btn) return;
  const isCollapsed = overlay.classList.contains('collapsed');
  btn.setAttribute('data-tooltip', isCollapsed ? 'Paneli Genişlet' : 'Paneli Daralt');
  let chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15"><polyline points="15 18 9 12 15 6"/></svg>';
  if (isCollapsed) {
    const rect       = overlay.getBoundingClientRect();
    const isRight    = (rect.left + rect.width / 2) > (window.innerWidth / 2);
    chevron = isRight
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15"><polyline points="15 18 9 12 15 6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15"><polyline points="9 18 15 12 9 6"/></svg>';
  }
  btn.innerHTML = chevron;
}

function initDraggablePartyOverlay() {
  const overlay = el('partyFocusOverlay');
  if (!overlay) return;

  if (localStorage.getItem('os_focus_overlay_collapsed') === '1') {
    overlay.classList.add('collapsed');
    _placeOverlayFixed(overlay);
    updatePartyOverlayCollapseBtn();
  }

  let dragging = false, moved = false;
  let startX = 0, startY = 0, initLeft = 0, initTop = 0;

  const dragStart = (clientX, clientY, target, pointerId) => {
    if (!overlay.classList.contains('collapsed') || target.closest('button')) return;
    dragging = true; moved = false;
    try { overlay.setPointerCapture(pointerId); } catch { /* ignore */ }
    overlay.classList.add('is-dragging', 'has-drag-pos');
    const rect = overlay.getBoundingClientRect();
    initLeft = rect.left; initTop = rect.top; startX = clientX; startY = clientY;
    overlay.style.position = 'fixed';
    overlay.style.left   = `${initLeft}px`;
    overlay.style.top    = `${initTop}px`;
    overlay.style.right  = 'auto';
    overlay.style.bottom = 'auto';
    overlay.style.transform = 'none';
  };

  const dragMove = (clientX, clientY) => {
    if (!dragging) return;
    const dx = clientX - startX, dy = clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    const W = window.innerWidth, H = window.innerHeight;
    const ow = overlay.offsetWidth, oh = overlay.offsetHeight;
    overlay.style.left = `${Math.max(0, Math.min(W - ow, initLeft + dx))}px`;
    overlay.style.top  = `${Math.max(56, Math.min(H - oh - 8, initTop + dy))}px`;
  };

  const dragEnd = (pointerId) => {
    if (!dragging) return;
    dragging = false;
    try { overlay.releasePointerCapture(pointerId); } catch { /* ignore */ }
    overlay.classList.remove('is-dragging');
    if (moved) _snapToEdge(overlay);
  };

  overlay.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStart(e.clientX, e.clientY, e.target, e.pointerId);
  });
  overlay.addEventListener('pointermove', (e) => { if (dragging) { e.preventDefault(); dragMove(e.clientX, e.clientY); } }, { passive: false });
  overlay.addEventListener('pointerup',     (e) => dragEnd(e.pointerId));
  overlay.addEventListener('pointercancel', (e) => dragEnd(e.pointerId));
}


// ─────────────────────────────────────────────────────────────
// § 24. REAL-TIME CLOCK
// ─────────────────────────────────────────────────────────────
function _startRealTimeClock() {
  const update = () => {
    const clockEl = el('timerRealClock');
    if (!clockEl) return;
    const now     = new Date();
    const dateStr = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    clockEl.textContent = `${dateStr} · ${timeStr}`;
  };
  update();
  setInterval(update, 1000);
}


// ─────────────────────────────────────────────────────────────
// § 25. BOOT — DOMContentLoaded
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restore UI mode
  selectSetupMode(_timerMode || 'free');
  restorePomodoroBreakState();
  syncMainTimerModeUI();

  // Button & Display bindings
  const startBtn = el('timerStartBtn');
  if (startBtn) startBtn.addEventListener('click', e => { e.stopPropagation(); onMainTimerButtonClick(); });
  
  const soloDisplay = el('timerDisplaySolo');
  if (soloDisplay) soloDisplay.addEventListener('click', e => { e.stopPropagation(); onMainTimerButtonClick(); });
  
  const statusTxt = el('timerStatusText');
  if (statusTxt) statusTxt.addEventListener('click', e => { e.stopPropagation(); onMainTimerButtonClick(); });

  el('timerModeFreeBtn')?.addEventListener('click', e => { e.stopPropagation(); setMainTimerMode('free'); });
  el('timerModePomoBtn')?.addEventListener('click', e => { e.stopPropagation(); setMainTimerMode('pomodoro'); });
  el('fsmBtnFree')?.addEventListener('click',  e => { e.stopPropagation(); selectSetupMode('free'); });
  el('fsmBtnPomo')?.addEventListener('click',  e => { e.stopPropagation(); selectSetupMode('pomodoro'); });

  // Init overlay & clock
  try { initDraggablePartyOverlay(); } catch (e) { console.error('initDraggablePartyOverlay error:', e); }
  _startRealTimeClock();
});

// Global click delegation for timerStartBtn (backup)
document.addEventListener('click', e => {
  const btn = e.target.closest('#timerStartBtn');
  if (btn && (!window._activeSession || btn.style.display !== 'none')) {
    e.preventDefault();
    onMainTimerButtonClick();
  }
});

// ─────────────────────────────────────────────────────────────
// § 26. INITIAL DATA LOAD
// ─────────────────────────────────────────────────────────────
if (typeof currentUser !== 'undefined' && currentUser) {
  updateTimerStats();
  checkActiveSession();
  checkActiveParty();
  setTimeout(checkUnratedSession, 2000);
  setInterval(checkUnratedSession, 30000);
}

// ─────────────────────────────────────────────────────────────
// § 27. GLOBAL EXPORTS
// ─────────────────────────────────────────────────────────────
Object.assign(window, {
  // Modal
  openFocusSetupModal, closeFocusSetupModal,
  fsmSelectCat, fsmSearchActivities, fsmPickActivity, fsmToStep2,
  fsmSelectMode, fsmStep2Next, fsm2ApplyPreset, fsm2AdjustInput, fsmGoBack,
  selectSetupMode, setMainTimerMode, syncMainTimerModeUI,
  confirmStartFocusFromModal, onMainTimerButtonClick,
  applyPomoPreset, adjustPomoInput, clearPresetSelection,

  // Pomodoro
  skipPomodorBreak, startNextPomodoro,
  claimPomodoroBreak, openPomodoroInfoModal, closePomodoroInfoModal,
  restorePomodoroBreakState,

  // Nudge
  confirmNudgeContinue, confirmNudgeStop, closeNudgeTimeoutModal,

  // Session
  startFocusSession, stopFocusSession, endSession, handleViolation,
  checkActiveSession, startTimerTick,

  // Summary
  goToStep, openSummaryModal, closeFocusSummaryModal,
  selectFeeling, selectCategory, onActivitySearch, selectActivity,
  submitRating, openUnratedSessionRating,

  // Party
  setActiveParty, clearActiveParty, checkActiveParty, leavePartyFromTimer,
  startPartyPoll, fetchPartyAndRender, renderPartyDuel,
  sendPartyChatMessage, togglePartyChatModal,
  fetchPartyMessages,

  // Channel
  openChannelConfigModal, closeChannelConfigModal,
  submitChannelConfigModal, submitChannelDeleteFromModal,
  updateCcmLimitDisplay, triggerPartyRenameFromHeader,
  promptAddChannel, promptEditChannel, promptDeleteChannel,
  reorderChannel, joinSubChannel,
  handleMemberDragStart, handleChannelDragOver, handleChannelDragLeave, handleChannelDrop,
  openPartyModerationPanel,

  // Overlay
  togglePartyFocusOverlay, updatePartyOverlayCollapseBtn, initDraggablePartyOverlay,
  setGlobalCardSize,

  // Status chip
  startStatusChipAnimation,

  // Helpers
  updateTimerStats, updateXPBarUI, animateXPBar,
  playChannelSound, playNotificationSound,

  // Legacy alias
  fallbackCopyText: _fallbackCopy,
});
