/* ============================================================
   TIMER-WORKER.JS — Background timer worker for BLUNK
   ============================================================ */

'use strict';

let _interval  = null;
let _startTime = null;
let _mode      = 'free';
let _durationSecs = 0;

self.onmessage = function(e) {
  const { action, startTime, mode, durationSecs } = e.data || {};

  if (action === 'start') {
    if (_interval) clearInterval(_interval);
    _startTime    = startTime || Date.now();
    _mode         = mode || 'free';
    _durationSecs = durationSecs || 0;

    _interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - _startTime) / 1000);
      self.postMessage({
        type: 'tick',
        elapsed,
        remaining: _mode === 'pomodoro' ? Math.max(0, _durationSecs - elapsed) : null,
        isOver:    _mode === 'pomodoro' ? elapsed >= _durationSecs : false
      });
    }, 1000);

  } else if (action === 'stop') {
    if (_interval) { clearInterval(_interval); _interval = null; }
    _startTime = null;
  }
};
