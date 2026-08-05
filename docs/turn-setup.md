Overview

This guide shows how to set up a production-ready Coturn TURN server, secure it with Let's Encrypt, create long-term credentials, and wire it into the BLUNK app via environment variables so clients receive TURN servers from `/api/rtc-config`.

Goals

- Provide STUN + TURN servers to clients so WebRTC works reliably across NATs/firewalls.
- Use long-term credentials for clients (username/password).
- Expose TURN info via env vars `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD` consumed by the app's `/api/rtc-config` endpoint.

Prerequisites

- A Linux VM (Ubuntu 20.04/22.04 recommended) with a public domain name (e.g. `turn.example.com`).
- Ports opened: UDP/TCP 3478, TCP/UDP 5349 (TLS). Adjust firewall rules accordingly.
- Docker is optional but instructions below use system packages.

1) Install coturn (Ubuntu)

```bash
sudo apt update
sudo apt install coturn -y
```

2) Obtain TLS certs (Let's Encrypt)

Install certbot and obtain cert for your `turn` domain:

```bash
sudo apt install certbot -y
sudo certbot certonly --standalone -d turn.example.com
# Certs will be in /etc/letsencrypt/live/turn.example.com/
```

3) Configure `/etc/turnserver.conf`

Create or edit `/etc/turnserver.conf` with the following minimal production config:

```
# /etc/turnserver.conf
listening-port=3478
relay-ip=0.0.0.0
min-port=49152
max-port=65535
listening-ip=0.0.0.0
fingerprint
use-auth-secret
static-auth-secret=REPLACE_WITH_A_STRONG_SECRET
realm=turn.example.com
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
no-multicast-peers
log-file=/var/log/turnserver/turnserver.log
simple-log
lt-cred-mech
mobility
stun-only
# allow both UDP and TCP relay
alt-listening-port=5349
alt-listening-ip=0.0.0.0
```

Notes:
- Use `static-auth-secret` + `use-auth-secret` to generate time-limited credentials server-side OR use `lt-cred-mech` + `turnadmin` to add persistent users. The config above enables long-term credential mechanism.
- `min-port`/`max-port` define the UDP relay port range; open them in firewall.

4) Create a long-term user (turnadmin) — optional

You can add a permanent username/password pair (helpful for simple deployments):

```bash
sudo turnadmin -a -u blunk_turn_user -p SUPER_SECRET_PW -r turn.example.com
```

This writes credential info into the Coturn DB (if configured). Alternately, use the HMAC/time-limited method below.

5) Using time-limited credentials (recommended)

If you prefer not to store users on the TURN server, create short-lived credentials with HMAC using `static-auth-secret` (set earlier). On the app side you must generate a username and credential pair per connection. Example generation (server-side):

```js
// pseudo-code: generate TURN long-term credential
const secret = process.env.TURN_STATIC_SECRET; // same as static-auth-secret
const username = Math.floor(Date.now()/1000) + 3600 + ':' + 'blunk-' + Math.random().toString(36).slice(2,8);
const hmac = require('crypto').createHmac('sha1', secret).update(username).digest('base64');
// return username and hmac as credential to client
```

The BLUNK server currently reads environment variables `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`. For a simple start, set these to a permanent user created with `turnadmin`.

6) Start/restart coturn

```bash
sudo systemctl enable coturn
sudo systemctl restart coturn
sudo journalctl -u coturn -f
```

7) Firewall rules (ufw example)

```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
# allow UDP relay port range
sudo ufw allow 49152:65535/udp
```

8) Set environment variables for BLUNK backend

On your production host (or container orchestrator) set:

- `TURN_URL`: e.g. `turn:turn.example.com:3478` or `turns:turn.example.com:5349?transport=tcp`
- `TURN_USERNAME`: the username you created (or generated)
- `TURN_PASSWORD`: password / credential
- If using static-auth-secret HMAC method, instead set `TURN_STATIC_SECRET` on the app and implement dynamic credential generation in the server (I can add this change if preferred).

Examples (systemd/env):

```ini
# /etc/systemd/system/blunk.service (EnvironmentFile or ExecStart env)
Environment=TURN_URL=turn:turn.example.com:3478
Environment=TURN_USERNAME=blunk_turn_user
Environment=TURN_PASSWORD=SUPER_SECRET_PW
```

9) Verify from the BLUNK server

Request `/api/rtc-config`:

```bash
curl http://localhost:3000/api/rtc-config
```

You should see your TURN server in `iceServers`.

10) Client verification

Open two devices on different networks and check Chrome/Firefox console for ICE logs:

- `[ICE] user: checking` -> `connected` or `completed`
- If still failing on some NATs, confirm TURN ports are reachable from both networks: `nmap -sU -p 3478 turn.example.com` (UDP may be blocked by some hosts).

11) Optional: enable metrics and logging

Coturn logs are in `/var/log/turnserver/turnserver.log`. For debugging, increase verbosity in `turnserver.conf`.

Appendix: Quick Docker Compose (dev)

If you prefer Docker for testing, here's a very quick compose snippet (NOT for production TLS):

```yaml
version: '3.7'
services:
  coturn:
    image: instrumentisto/coturn
    ports:
      - "3478:3478/udp"
      - "3478:3478/tcp"
    environment:
      - REALM=turn.example.com
      - USERNAME=blunk_turn_user
      - PASSWORD=SUPER_SECRET_PW
    command: ["--lt-cred-mech"]
```

This provides a quick local TURN for testing (no TLS). Use proper certs for production.

If you want I can:
- Add HMAC time-limited credential generation into the BLUNK server so we avoid static passwords, or
- Prepare a systemd unit + env examples for deploying eventually, or
- Help run tests from your environment and evaluate ICE logs.

Tell me which of the above you'd like me to implement next.