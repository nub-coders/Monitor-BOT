/**
 * Virtualizor End-User API Client (CommonJS) for Express backend
 */

const net = require('net');

class VirtualizorClient {
  constructor(config = {}) {
    this.panelUrl = (config.panelUrl || 'https://arjun.defaultserverdns.com:4083').replace(/\/+$/, '');
    this.apiKey = config.apiKey || '';
    this.apiPass = config.apiPass || '';
    this.vpsId = String(config.vpsId || '514');
    this.hostname = config.hostname || 'mails.nubcoders.com';
    this.ip = config.ip || '103.190.93.162';
    this.probePorts = config.probePorts || [80, 443, 22, 25];
  }

  /**
   * Probe a specific TCP port using a raw socket
   */
  checkTcpPort(host, port, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const startTime = Date.now();
      let finished = false;

      const done = (isOpen) => {
        if (!finished) {
          finished = true;
          socket.destroy();
          resolve({ isOpen, port, host, responseTimeMs: Date.now() - startTime });
        }
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      socket.once('timeout', () => done(false));

      try {
        socket.connect(port, host);
      } catch {
        done(false);
      }
    });
  }

  /**
   * Probe direct reachability of the VPS directly (bypassing Virtualizor panel)
   * Tries TCP ports (80, 443, 22, 25) and HTTP/HTTPS endpoints
   */
  async checkDirectReachability(timeoutMs = 3000) {
    const host = this.ip || this.hostname;

    // 1. Try TCP ports first (fast & reliable)
    for (const port of this.probePorts) {
      try {
        const res = await this.checkTcpPort(host, port, timeoutMs);
        if (res.isOpen) {
          return {
            isReachable: true,
            method: 'tcp',
            host,
            port,
            responseTimeMs: res.responseTimeMs
          };
        }
      } catch {
        // Continue to next probe
      }
    }

    // 2. Try HTTP/HTTPS endpoints if port 80 or 443 are in probePorts
    if (this.probePorts.includes(80) || this.probePorts.includes(443)) {
      const httpTargets = [];
      if (this.probePorts.includes(80) && this.ip) httpTargets.push(`http://${this.ip}`);
      if (this.probePorts.includes(443) && this.hostname) httpTargets.push(`https://${this.hostname}`);
      if (this.probePorts.includes(80) && this.hostname) httpTargets.push(`http://${this.hostname}`);

      for (const target of httpTargets) {
        try {
          const startTime = Date.now();
          const response = await fetch(target, {
            method: 'HEAD',
            headers: { 'User-Agent': 'MonitorBOT-DirectProbe/1.0' },
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'manual'
          });
          // Any HTTP response (including 3xx, 4xx) indicates the server is active
          return {
            isReachable: true,
            method: 'http',
            target,
            status: response.status,
            responseTimeMs: Date.now() - startTime
          };
        } catch {
          // Continue to next target
        }
      }
    }

    return {
      isReachable: false,
      host,
      portsChecked: this.probePorts,
      responseTimeMs: 0
    };
  }

  async request(params = {}, timeoutMs = 12000) {
    if (!this.apiKey || !this.apiPass) {
      throw new Error('Missing Virtualizor API credentials (VIRTUALIZOR_API_KEY / VIRTUALIZOR_API_PASS)');
    }

    const url = new URL(`${this.panelUrl}/index.php`);
    url.searchParams.set('api', 'json');
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('apipass', this.apiPass);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const startTime = Date.now();
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'MonitorBOT-Express/1.0',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(timeoutMs)
      });

      const responseTimeMs = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Invalid JSON from Virtualizor: ${rawText.substring(0, 150)}`);
      }

      return { data, responseTimeMs };
    } catch (err) {
      const responseTimeMs = Date.now() - startTime;
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error(`Connection timed out after ${timeoutMs}ms while contacting ${this.panelUrl}`);
      }
      throw err;
    }
  }

  async getStatus() {
    let panelError = null;
    let data = null;
    let responseTimeMs = 0;

    try {
      const res = await this.request({
        act: 'status',
        svs: this.vpsId,
        vpsid: this.vpsId
      });
      data = res.data;
      responseTimeMs = res.responseTimeMs;
    } catch (err) {
      panelError = err.message;
    }

    let isOnline = false;
    let rawStatus = null;

    if (data) {
      if (data.info && data.info.status !== undefined) {
        rawStatus = data.info.status;
      } else if (data.status) {
        const entry = data.status[this.vpsId] ?? data.status;
        if (typeof entry === 'object' && entry !== null) {
          rawStatus = entry.status ?? entry.status_txt;
        } else {
          rawStatus = entry;
        }
      }
      isOnline = rawStatus === 1 || rawStatus === '1' || rawStatus === 'online';
    }

    // Use direct reachability only when the Virtualizor API could not be contacted.
    // An API response reporting offline is authoritative and must not be overridden.
    if (panelError) {
      const direct = await this.checkDirectReachability();
      if (direct.isReachable) {
        return {
          vpsId: this.vpsId,
          isOnline: true,
          panelStatus: panelError ? 'unreachable' : 'reported_offline',
          verifiedVia: 'direct_reachability_fallback',
          fallbackDetail: direct,
          rawStatus,
          panelError,
          responseTimeMs: direct.responseTimeMs || responseTimeMs,
          timestamp: new Date().toISOString()
        };
      }
    }

    if (panelError) {
      return {
        vpsId: this.vpsId,
        isOnline: false,
        panelStatus: 'unreachable',
        verifiedVia: 'none',
        rawStatus: null,
        panelError,
        responseTimeMs: 0,
        timestamp: new Date().toISOString()
      };
    }

    return {
      vpsId: this.vpsId,
      isOnline,
      panelStatus: 'online',
      verifiedVia: 'virtualizor_api',
      rawStatus,
      responseTimeMs,
      timestamp: new Date().toISOString()
    };
  }

  async getVpsInfo() {
    let statusRes, perfRes, panelError = null;

    try {
      [statusRes, perfRes] = await Promise.all([
        this.request({ act: 'status', svs: this.vpsId, vpsid: this.vpsId }),
        this.request({ act: 'performance', svs: this.vpsId }).catch(() => ({ data: {} }))
      ]);
    } catch (err) {
      panelError = err;
    }

    if (panelError) {
      // Panel is unreachable - execute Direct Reachability Fallback
      const direct = await this.checkDirectReachability();
      if (direct.isReachable) {
        return {
          vpsId: this.vpsId,
          hostname: this.hostname,
          ip: this.ip,
          isOnline: true,
          panelStatus: 'unreachable',
          verifiedVia: 'direct_reachability_fallback',
          fallbackDetail: direct,
          panelError: panelError.message,
          isSuspended: false,
          isRescue: false,
          os: 'Ubuntu 24.04 x86_64',
          cores: 12,
          cpuUsagePercent: 0,
          ramUsedMb: 0,
          ramTotalMb: 64000,
          ramUsagePercent: 0,
          diskUsedGb: 0,
          diskTotalGb: 1000,
          diskUsagePercent: 0,
          bandwidthUsedGb: 0,
          bandwidthTotalGb: 0,
          activeTime: 'Online (Direct Reachability)',
          serverName: 'Direct Network Probe',
          latestTask: null,
          responseTimeMs: direct.responseTimeMs || 0,
          timestamp: new Date().toISOString()
        };
      }
      throw panelError;
    }

    const data = statusRes.data || {};
    const responseTimeMs = statusRes.responseTimeMs;
    const info = data.info || {};
    const vpsData = info.vps ?? data.vs?.[this.vpsId] ?? {};
    const perf = perfRes.data?.perfomance || {};

    let isOnline = false;
    let rawStatus = null;
    if (info.status !== undefined) {
      rawStatus = info.status;
    } else if (data.status) {
      const entry = data.status[this.vpsId] ?? data.status;
      rawStatus = typeof entry === 'object' && entry !== null ? (entry.status ?? entry.status_txt) : entry;
    }
    isOnline = rawStatus === 1 || rawStatus === '1' || rawStatus === 'online';

    let verifiedVia = 'virtualizor_api';
    let panelStatus = 'online';
    let fallbackDetail = null;

    // The API response is authoritative. Direct reachability fallback is handled
    // only when the API request itself fails above.

    let cpuUsage = 0;
    if (perf.cpu !== undefined) {
      cpuUsage = parseFloat(perf.cpu) || 0;
    } else if (vpsData.cpu_percent !== undefined) {
      cpuUsage = parseFloat(vpsData.cpu_percent) || 0;
    }

    let ramTotalMb = vpsData.ram ? parseFloat(vpsData.ram) : 64000;
    let ramUsagePercent = 0;
    let ramUsedMb = 0;

    if (perf.ram !== undefined) {
      ramUsagePercent = Math.round(parseFloat(perf.ram) * 10) / 10;
      ramUsedMb = Math.round((ramUsagePercent / 100) * ramTotalMb);
    } else if (vpsData.used_ram !== undefined) {
      ramUsedMb = parseFloat(vpsData.used_ram) || 0;
      ramUsagePercent = ramTotalMb > 0 ? Math.round((ramUsedMb / ramTotalMb) * 100) : 0;
    }

    let diskUsedGb = 0;
    let diskTotalGb = vpsData.space ? parseFloat(vpsData.space) : 1000;
    if (vpsData.cached_disk?.disk?.Used) {
      diskUsedGb = Math.round((parseInt(vpsData.cached_disk.disk.Used, 10) / (1024 * 1024)) * 10) / 10;
    } else if (vpsData.used_disk !== undefined) {
      diskUsedGb = parseFloat(vpsData.used_disk) || 0;
    }
    const diskUsagePercent = diskTotalGb > 0 ? Math.round((diskUsedGb / diskTotalGb) * 100) : 0;

    let bandwidthUsedGb = vpsData.used_bandwidth ? parseFloat(vpsData.used_bandwidth) : 0;
    let bandwidthTotalGb = vpsData.bandwidth ? parseFloat(vpsData.bandwidth) : 0;

    const ips = Array.isArray(info.ip) ? info.ip : (Array.isArray(vpsData?.ips) ? vpsData.ips : [vpsData?.ip || '103.190.93.162']);

    return {
      vpsId: this.vpsId,
      hostname: info.hostname || vpsData?.hostname || 'mails.nubcoders.com',
      ip: ips[0] || '103.190.93.162',
      isOnline,
      panelStatus,
      verifiedVia,
      fallbackDetail,
      rawStatus,
      isSuspended: vpsData?.suspended === 1 || vpsData?.suspended === '1',
      isRescue: vpsData?.rescue === 1 || vpsData?.rescue === '1',
      os: vpsData?.os_name || 'Ubuntu 24.04 x86_64',
      cores: parseInt(vpsData?.cores, 10) || 12,
      cpuUsagePercent: cpuUsage,
      ramUsedMb,
      ramTotalMb,
      ramUsagePercent,
      diskUsedGb,
      diskTotalGb,
      diskUsagePercent,
      bandwidthUsedGb,
      bandwidthTotalGb,
      activeTime: info.show_vps_active_time ? info.show_vps_active_time.trim() : null,
      serverName: info.server_name || 'Noida 01',
      latestTask: await this.getLatestTask(),
      responseTimeMs,
      timestamp: new Date().toISOString()
    };
  }

  async getLatestTask() {
    try {
      const { data } = await this.request({ act: 'tasks', svs: this.vpsId });
      if (data && data.tasks) {
        const list = Object.values(data.tasks);
        if (list.length > 0) return list[0];
      }
    } catch {}
    return null;
  }

  async start() {
    return this.request({ act: 'start', svs: this.vpsId, vpsid: this.vpsId, do: '1' });
  }

  async stop() {
    return this.request({ act: 'stop', svs: this.vpsId, vpsid: this.vpsId, do: '1' });
  }

  async restart() {
    return this.request({ act: 'restart', svs: this.vpsId, vpsid: this.vpsId, do: '1' });
  }
}

module.exports = { VirtualizorClient };
