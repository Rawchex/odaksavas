/**
 * PM2 Cluster Configuration
 *
 * Usage:
 *   npm install -g pm2
 *   pm2 start pm2.config.js --env production
 *   pm2 save && pm2 startup
 *
 * Scale: instances: 'max' uses all CPU cores.
 *        Set instances: 2 for Railway free tier (limited cores).
 */
module.exports = {
  apps: [{
    name: 'blunk-server',
    script: './server/index.js',
    instances: process.env.PM2_INSTANCES || 'max',
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '512M',

    // Environment variables
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
    },

    // Logging
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

    // Graceful restart
    kill_timeout: 10000,      // 10s — matches gracefulShutdown.js timeout
    wait_ready: false,
    listen_timeout: 8000,

    // Restart policy
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
  }]
};
