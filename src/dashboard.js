/**
 * Web Status Dashboard for Monitor-BOT & Virtualizor VPS 514
 * Secure HTML with strict CSP, zero innerHTML, and dark-mode glassmorphic styling
 */

export const SECURITY_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

export function renderDashboardHtml(env) {
  const vpsId = env.VPS_ID || '514';
  const hostname = env.VPS_HOSTNAME || 'mails.nubcoders.com';
  const ip = env.VPS_IP || '103.190.93.162';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monitor-BOT — Unified Live Dashboard</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 30, 49, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-blue: #3b82f6;
      --accent-green: #10b981;
      --accent-red: #ef4444;
      --accent-yellow: #f59e0b;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 0%, #17223b 0%, var(--bg) 75%);
      color: var(--text-main);
      font-family: var(--font-family);
      min-height: 100vh;
      padding: 2rem 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      width: 100%;
      max-width: 900px;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--card-border);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .brand-icon {
      width: 42px;
      height: 42px;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 1.25rem;
      color: white;
      box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
    }
    .brand-text h1 {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand-text p {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      padding: 0.55rem 1.1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.2);
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .status-banner {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.75rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1.25rem;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.45rem 1rem;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 0.95rem;
    }
    .status-badge.online {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-badge.offline {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .status-badge.loading {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 10px currentColor;
    }
    .banner-meta { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .meta-item { display: flex; flex-direction: column; gap: 0.2rem; }
    .meta-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .meta-value { font-weight: 600; font-size: 0.95rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(10px);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      transition: transform 0.2s ease;
    }
    .card:hover { transform: translateY(-2px); }
    .card-title { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; }
    .card-metric { font-size: 1.75rem; font-weight: 700; display: flex; align-items: baseline; gap: 0.3rem; }
    .card-sub { font-size: 0.8rem; color: var(--text-muted); }
    .progress-bar-bg {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 0.25rem;
    }
    .progress-bar-fill {
      height: 100%;
      background: var(--accent-blue);
      border-radius: 3px;
      width: 0%;
      transition: width 0.5s ease;
    }
    .specs-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1.25rem;
    }
    .specs-card h3 { font-size: 1rem; margin-bottom: 1rem; }
    .specs-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem 1.5rem;
      font-size: 0.85rem;
    }
    .spec-row {
      display: flex;
      justify-content: space-between;
      padding: 0.4rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    .spec-key { color: var(--text-muted); }
    .spec-val { font-weight: 600; font-family: monospace; }
    footer {
      margin-top: auto;
      padding-top: 2rem;
      font-size: 0.8rem;
      color: var(--text-muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-icon">M</div>
        <div class="brand-text">
          <h1>Monitor-BOT Hub</h1>
          <p>VPS 514 &bull; ${hostname} &bull; Downstream Bots</p>
        </div>
      </div>
      <div class="header-actions">
        <button id="refresh-btn" class="btn">
          <svg id="refresh-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Refresh Now
        </button>
      </div>
    </header>

    <div class="status-banner">
      <div>
        <div class="meta-label">Virtualizor VPS 514 State</div>
        <div style="margin-top: 0.4rem;">
          <span id="status-pill" class="status-badge loading">
            <span class="dot"></span>
            <span id="status-text">Checking Status...</span>
          </span>
        </div>
      </div>
      <div class="banner-meta">
        <div class="meta-item">
          <span class="meta-label">Edge Node</span>
          <span class="meta-value">Cloudflare Workers</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">API Latency</span>
          <span class="meta-value" id="api-latency">-- ms</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Last Checked</span>
          <span class="meta-value" id="last-checked">Just now</span>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <span class="card-title">VPS CPU</span>
        <div class="card-metric"><span id="cpu-val">--</span><span style="font-size: 1rem;">%</span></div>
        <div class="progress-bar-bg"><div id="cpu-progress" class="progress-bar-fill"></div></div>
        <span class="card-sub">12 vCPU Cores</span>
      </div>

      <div class="card">
        <span class="card-title">VPS RAM</span>
        <div class="card-metric"><span id="ram-val">--</span><span style="font-size: 1rem;">%</span></div>
        <div class="progress-bar-bg"><div id="ram-progress" class="progress-bar-fill"></div></div>
        <span class="card-sub" id="ram-detail">64 GB Total</span>
      </div>

      <div class="card">
        <span class="card-title">Bandwidth</span>
        <div class="card-metric"><span id="bandwidth-val">--</span><span style="font-size: 1rem;">GB</span></div>
        <span class="card-sub">Monthly Used</span>
      </div>

      <div class="card">
        <span class="card-title">Uptime Ratio</span>
        <div class="card-metric"><span id="uptime-val">100</span><span style="font-size: 1rem;">%</span></div>
        <span class="card-sub">Automated 1m checks</span>
      </div>
    </div>

    <div class="specs-card">
      <h3>Infrastructure Details</h3>
      <div class="specs-list">
        <div class="spec-row">
          <span class="spec-key">VPS ID:</span>
          <span class="spec-val">${vpsId}</span>
        </div>
        <div class="spec-row">
          <span class="spec-key">Hostname:</span>
          <span class="spec-val">${hostname}</span>
        </div>
        <div class="spec-row">
          <span class="spec-key">Primary IP:</span>
          <span class="spec-val">${ip}</span>
        </div>
        <div class="spec-row">
          <span class="spec-key">Datacenter:</span>
          <span class="spec-val">Noida 01</span>
        </div>
        <div class="spec-row">
          <span class="spec-key">OS:</span>
          <span class="spec-val">Ubuntu 24.04 x86_64</span>
        </div>
        <div class="spec-row">
          <span class="spec-key">Heartbeat Node URL:</span>
          <span class="spec-val">/ping</span>
        </div>
      </div>
    </div>

    <footer>
      Monitor-BOT Enterprise &bull; Cloudflare Workers D1 + KV &bull; Auto-refreshes every 60s
    </footer>
  </div>

  <script>
    async function loadStatus() {
      const refreshBtn = document.getElementById('refresh-btn');
      const statusPill = document.getElementById('status-pill');
      const statusText = document.getElementById('status-text');
      const latencyVal = document.getElementById('api-latency');
      const lastChecked = document.getElementById('last-checked');
      const cpuVal = document.getElementById('cpu-val');
      const cpuProgress = document.getElementById('cpu-progress');
      const ramVal = document.getElementById('ram-val');
      const ramProgress = document.getElementById('ram-progress');
      const ramDetail = document.getElementById('ram-detail');
      const bandwidthVal = document.getElementById('bandwidth-val');
      const uptimeVal = document.getElementById('uptime-val');

      if (refreshBtn) refreshBtn.disabled = true;

      try {
        const res = await fetch('/api/vps-status');
        const data = await res.json();

        if (data.isOnline) {
          statusPill.className = 'status-badge online';
          if (data.panelStatus === 'unreachable' || data.verifiedVia === 'direct_reachability_fallback') {
            statusText.textContent = 'ONLINE (Direct IP Probe)';
          } else {
            statusText.textContent = 'ONLINE (Active)';
          }
        } else {
          statusPill.className = 'status-badge offline';
          statusText.textContent = 'OFFLINE';
        }

        latencyVal.textContent = (data.responseTimeMs || 0) + ' ms';
        lastChecked.textContent = new Date().toLocaleTimeString();

        const cpu = (data.cpuUsagePercent || 0).toFixed(1);
        cpuVal.textContent = cpu;
        cpuProgress.style.width = Math.min(cpu, 100) + '%';

        const ramPct = data.ramUsagePercent || 0;
        ramVal.textContent = ramPct;
        ramProgress.style.width = Math.min(ramPct, 100) + '%';
        if (data.ramUsedMb && data.ramTotalMb) {
          ramDetail.textContent = (data.ramUsedMb / 1024).toFixed(1) + ' GB / ' + (data.ramTotalMb / 1024).toFixed(0) + ' GB';
        }

        bandwidthVal.textContent = (data.bandwidthUsedGb || 0).toFixed(2);
        if (data.uptimeRatio !== undefined) {
          uptimeVal.textContent = data.uptimeRatio;
        }
      } catch (err) {
        statusPill.className = 'status-badge offline';
        statusText.textContent = 'Status Error';
        latencyVal.textContent = 'Error';
      } finally {
        if (refreshBtn) refreshBtn.disabled = false;
      }
    }

    document.getElementById('refresh-btn').addEventListener('click', loadStatus);
    loadStatus();
    setInterval(loadStatus, 60000);
  </script>
</body>
</html>`;
}
