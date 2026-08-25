/**
 * WebSocket Manager with Redis Pub/Sub
 *
 * Architecture:
 *   - Each PM2 worker keeps its own local WS connection Map (partyConnections).
 *   - Voice states & broadcast messages go through Redis pub/sub.
 *   - When Redis is absent, the in-memory fallback in redis.js handles everything
 *     transparently — single-process behaviour is identical to before.
 *
 * Channels:
 *   party:{partyId}:broadcast  → JSON message to all members of a party
 *   party:{partyId}:voice      → voice_state_list update
 */

const WebSocket = require('ws');
const jwt       = require('jsonwebtoken');
const { getPubClient, getSubClient } = require('./redis');

// Local per-process connection registry: Map<partyId, Map<userId, {ws, username}>>
global.partyConnections      = global.partyConnections      || new Map();
global.partyVoiceStates      = global.partyVoiceStates      || {};
global.partyDisconnectTimers = global.partyDisconnectTimers || {};
global.userActiveVoiceSessions = global.userActiveVoiceSessions || {};

const JWT_SECRET = process.env.JWT_SECRET;

// ─── Pub/Sub setup ───────────────────────────────────────────────────────────
const pub = getPubClient();
const sub = getSubClient();

// Subscribe to all party broadcast channels using pattern subscribe
// We handle this by subscribing per-party on first connection.
const subscribedChannels = new Set();

function ensureSubscribed(partyId) {
  const chan = `party:${partyId}:broadcast`;
  if (subscribedChannels.has(chan)) return;
  subscribedChannels.add(chan);

  sub.subscribe(chan, (channel, message) => {
    // Deliver to all local WS clients in this party
    const partyConns = global.partyConnections.get(partyId);
    if (!partyConns) return;
    partyConns.forEach((conn) => {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    });
  });
}

// ─── Broadcast helpers ───────────────────────────────────────────────────────

/**
 * Publish a message to ALL workers for a given party (via Redis pub).
 * Falls back to in-memory delivery for single-process mode.
 */
function broadcastToParty(partyId, data) {
  const payload = JSON.stringify(data);
  pub.publish(`party:${partyId}:broadcast`, payload);
}

// ─── Voice state helpers (Redis hash) ───────────────────────────────────────

function setVoiceState(partyId, userId, state) {
  // Keep local mirror for fast reads
  if (!global.partyVoiceStates[partyId]) global.partyVoiceStates[partyId] = {};
  if (state === null) {
    delete global.partyVoiceStates[partyId][userId];
  } else {
    global.partyVoiceStates[partyId][userId] = state;
  }
}

function getVoiceStates(partyId) {
  return global.partyVoiceStates[partyId] || {};
}

// ─── Global helpers exposed for REST routes ──────────────────────────────────

global.closePartyWebSocket = (partyId, userId, reason = 'Oda üyesi değilsiniz') => {
  const partyConns = global.partyConnections.get(parseInt(partyId));
  if (partyConns && partyConns.has(parseInt(userId))) {
    const conn = partyConns.get(parseInt(userId));
    try { conn.ws.close(4004, reason); } catch (e) {}
  }
};

// ─── Main WSS setup ──────────────────────────────────────────────────────────

function setupWebSocketServer(wss, db) {

  wss.on('connection', (ws, req) => {
    // 1. Parse cookies for JWT
    const cookies = {};
    if (req.headers.cookie) {
      req.headers.cookie.split(';').forEach(c => {
        const parts = c.split('=');
        cookies[parts[0].trim()] = decodeURIComponent(parts[1] || '').trim();
      });
    }

    const token = cookies.token;
    if (!token) { ws.close(4001, 'Giriş yapmalısın'); return; }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err || !decoded || !decoded.id) {
        ws.close(4002, 'Geçersiz oturum');
        return;
      }

      const userId   = decoded.id;
      const username = decoded.username;

      const urlObj  = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const partyId = parseInt(urlObj.searchParams.get('partyId'));

      if (!partyId) { ws.close(4003, 'partyId gerekli'); return; }

      // 2. Verify party membership
      db.get('SELECT id FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, userId], (dbErr, member) => {
        if (dbErr || !member) { ws.close(4004, 'Oda üyesi değilsiniz'); return; }

        // 3. Check server-side mute
        db.get(`SELECT id FROM party_voice_moderation WHERE party_id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`, [partyId, userId], (muteErr, muteRow) => {
          const serverMuted = !muteErr && !!muteRow;

          // 4. Ensure pub/sub subscription for this party
          ensureSubscribed(partyId);

          // 5. Register connection
          if (!global.partyConnections.has(partyId)) {
            global.partyConnections.set(partyId, new Map());
          }
          const connections = global.partyConnections.get(partyId);

          // Cancel pending disconnect grace timer (reconnect case)
          const graceKey = `${partyId}_${userId}`;
          if (global.partyDisconnectTimers[graceKey]) {
            clearTimeout(global.partyDisconnectTimers[graceKey]);
            delete global.partyDisconnectTimers[graceKey];
          }

          // Close old tab/device if already connected
          if (connections.has(userId)) {
            try { connections.get(userId).ws.close(4005, 'Başka sekmede bağlandınız'); } catch (e) {}
          }

          connections.set(userId, { ws, username });
          let socketDeviceId = null;

          // ── Message handler ────────────────────────────────────────────────
          ws.on('message', (messageStr) => {
            try {
              const message = JSON.parse(messageStr);
              const { type } = message;

              if (type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
                return;
              }

              if (type === 'voice_state_update') {
                const { micMuted, deafened, channelId, pingMs, deviceId } = message;
                if (deviceId) socketDeviceId = deviceId;

                const state = {
                  username,
                  micMuted: !!micMuted || serverMuted,
                  serverMuted,
                  deafened:  !!deafened,
                  channelId: channelId ? parseInt(channelId) : null,
                  pingMs:    parseInt(pingMs) || 0,
                  deviceId:  deviceId || null,
                  lastSeen:  Date.now()
                };

                setVoiceState(partyId, userId, state);

                if (deviceId && channelId) {
                  global.userActiveVoiceSessions[userId] = {
                    partyId:   parseInt(partyId),
                    channelId: parseInt(channelId),
                    deviceId:  deviceId || null,
                    lastSeen:  Date.now()
                  };
                } else {
                  delete global.userActiveVoiceSessions[userId];
                }

                // Publish updated voice list to all workers
                broadcastToParty(partyId, {
                  type:    'voice_state_list',
                  members: getVoiceStates(partyId)
                });

              } else if (type === 'rtc_signal') {
                // RTC signals are point-to-point; deliver locally if target is on this worker,
                // otherwise publish so other workers can deliver.
                const { toUsername, signal } = message;
                const partyConns = global.partyConnections.get(partyId);
                if (partyConns) {
                  const targetConn = Array.from(partyConns.values()).find(c => c.username === toUsername);
                  if (targetConn && targetConn.ws.readyState === WebSocket.OPEN) {
                    targetConn.ws.send(JSON.stringify({ type: 'rtc_signal', fromUsername: username, signal }));
                    return;
                  }
                }
                // Target not on this worker → broadcast so another worker delivers it
                broadcastToParty(partyId, { type: 'rtc_signal', fromUsername: username, toUsername, signal });
              }
            } catch (e) {
              console.error('[WS Message Error]', e.message);
            }
          });

          // ── Disconnect handler ─────────────────────────────────────────────
          ws.on('close', () => {
            const gKey = `${partyId}_${userId}`;
            if (global.partyDisconnectTimers[gKey]) {
              clearTimeout(global.partyDisconnectTimers[gKey]);
            }

            global.partyDisconnectTimers[gKey] = setTimeout(() => {
              delete global.partyDisconnectTimers[gKey];

              // Verify user hasn't reconnected on THIS worker
              const partyConns = global.partyConnections.get(partyId);
              if (partyConns && partyConns.has(userId)) {
                const currentConn = partyConns.get(userId);
                if (currentConn.ws !== ws) return; // New connection, don't remove
              }

              // Clean up local registry
              if (partyConns) {
                partyConns.delete(userId);
                if (partyConns.size === 0) global.partyConnections.delete(partyId);
              }

              // Remove voice state and broadcast update
              setVoiceState(partyId, userId, null);
              broadcastToParty(partyId, {
                type:    'voice_state_list',
                members: getVoiceStates(partyId)
              });

              // Clean up active voice session
              if (global.userActiveVoiceSessions[userId]) {
                if (global.userActiveVoiceSessions[userId].deviceId === socketDeviceId) {
                  delete global.userActiveVoiceSessions[userId];
                }
              }
            }, 8000); // 8 second grace period
          });

          ws.on('error', () => ws.close());
        });
      });
    });
  });
}

module.exports = { setupWebSocketServer, broadcastToParty };
