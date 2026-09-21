/**
 * Virtualizor End-User API Client for Cloudflare Workers & Node.js
 */

export class VirtualizorClient {
  /**
   * @param {Object} config
   * @param {string} config.panelUrl - e.g. "https://arjun.defaultserverdns.com:4083"
   * @param {string} config.apiKey - Virtualizor API key
   * @param {string} config.apiPass - Virtualizor API password
   * @param {string|number} config.vpsId - Virtualizor VPS ID (e.g. 514)
   */
  constructor(config = {}) {
    this.panelUrl = (config.panelUrl || 'https://arjun.defaultserverdns.com:4083').replace(/\/+$/, '');
    this.apiKey = config.apiKey || '';
    this.apiPass = config.apiPass || '';
    this.vpsId = String(config.vpsId || '514');
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
          'User-Agent': 'MonitorBOT-Virtualizor/1.0',
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
    const { data, responseTimeMs } = await this.request({
      act: 'status',
      svs: this.vpsId,
      vpsid: this.vpsId
    });

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

    return {
      vpsId: this.vpsId,
      isOnline,
      rawStatus,
      responseTimeMs,
      timestamp: new Date().toISOString()
    };
  }

  async getVpsInfo() {
    const [statusRes, perfRes] = await Promise.all([
      this.request({ act: 'status', svs: this.vpsId, vpsid: this.vpsId }),
      this.request({ act: 'performance', svs: this.vpsId }).catch(() => ({ data: {} }))
    ]);

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
