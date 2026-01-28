import Unifi from 'node-unifi';

export interface UnifiDevice {
  mac: string;
  ip: string;
  name?: string;
  model: string;
  type: string;
  site_id: string;
  uptime: number;
  [key: string]: any;
}

export interface UnifiClientDevice {
  mac: string;
  ip: string;
  hostname?: string;
  name?: string;
  oui: string;
  is_wired: boolean;
  is_guest: boolean;
  first_seen: number;
  last_seen: number;
  uptime: number;
  rx_bytes: number;
  tx_bytes: number;
  [key: string]: any;
}

export class UnifiClient {
  public controller: any;
  private cache: Map<string, { data: any, timestamp: number }> = new Map();
  private cacheTTL = 10000; // 10 seconds cache
  private gatewayUrl: string | null = process.env.UNIFI_GATEWAY_URL || null;
  
  constructor(
    private host: string,
    private username: string,
    private password: string,
    private site: string = 'default'
  ) {}
  
  async connect(): Promise<void> {
    if (this.gatewayUrl) return; // Gateway handles connection
    // Strip protocol if present
    const cleanHost = this.host.replace(/(^\w+:|^)\/\//, '');
    
    this.controller = new (Unifi.Controller as any)({
      host: cleanHost,
      port: 443,
      username: this.username,
      password: this.password,
      site: this.site, 
      sslverify: false,
      timeout: 120000 // 120s for extremely slow routers
    });

    return new Promise((resolve, reject) => {
        this.controller.login(this.username, this.password)
            .then(() => {
                // Optimization: Monkey-patch node-unifi to skip redundant session checks.
                // This reduces API overhead on the router by ~50%.
                const originalEnsureLoggedIn = this.controller._ensureLoggedIn;
                if (originalEnsureLoggedIn) {
                    this.controller._ensureLoggedIn = async function() {
                        if (!this._instance) return originalEnsureLoggedIn.apply(this);
                        return true;
                    };
                }
                resolve();
            })
            .catch((err: any) => reject(err));
    });
  }
  
  private async getCached<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp < this.cacheTTL)) {
      return cached.data;
    }
    
    const data = await fetchFn();
    this.cache.set(key, { data, timestamp: now });
    return data;
  }

  async getDevices(): Promise<UnifiDevice[]> {
    if (this.gatewayUrl) {
        try {
            const res = await fetch(`${this.gatewayUrl}/status`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.devices || [];
        } catch {
            return [];
        }
    }
    return this.getCached('devices', () => {
      return new Promise((resolve, reject) => {
        this.controller.getAccessDevices()
          .then((data: any) => resolve(data || []))
          .catch((err: any) => reject(err));
      });
    });
  }

  async getDevicesBasic(): Promise<any[]> {
    return this.getCached('devices_basic', () => {
      return new Promise((resolve, reject) => {
        this.controller.getAccessDevicesBasic()
          .then((data: any) => resolve(data || []))
          .catch((err: any) => reject(err));
      });
    });
  }
  
  async getClients(): Promise<UnifiClientDevice[]> {
    if (this.gatewayUrl) {
        try {
            const res = await fetch(`${this.gatewayUrl}/status`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.clients || [];
        } catch {
            return [];
        }
    }
    return this.getCached('clients', () => {
      return new Promise((resolve, reject) => {
        this.controller.getClientDevices()
          .then((data: any) => resolve(data || []))
          .catch((err: any) => reject(err));
      });
    });
  }
  
  async getSites(): Promise<any[]> {
    return this.getCached('sites', () => {
      return new Promise((resolve, reject) => {
        this.controller.getSitesStats()
          .then((data: any) => resolve(data))
          .catch((err: any) => reject(err));
      });
    });
  }

  async getSiteSysinfo(): Promise<any[]> {
    return this.getCached('sysinfo', () => {
      return new Promise((resolve, reject) => {
        this.controller.getSiteSysinfo()
          .then((data: any) => resolve(data || []))
          .catch((err: any) => reject(err));
      });
    });
  }

  async getAlarms(params: any = {}): Promise<any[]> {
    if (this.gatewayUrl) {
        try {
            const res = await fetch(`${this.gatewayUrl}/status`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.alarms || [];
        } catch {
            return [];
        }
    }
    return new Promise((resolve, reject) => {
      this.controller.getAlarms(params)
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }

  async blockClient(mac: string): Promise<void> {
    if (this.gatewayUrl) {
        await fetch(`${this.gatewayUrl}/action/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mac })
        });
        return;
    }
    return new Promise((resolve, reject) => {
        this.controller.blockClient(mac)
            .then(() => resolve())
            .catch((err: any) => reject(err));
    });
  }

  async setClientFixedIp(client_id: string, network_id: string, ip?: string): Promise<void> {
    const payload: any = {
      use_fixedip: true,
      network_id: network_id
    };
    if (ip) payload.fixed_ip = ip;

    return new Promise((resolve, reject) => {
      this.controller.customApiRequest(`/api/s/${this.site}/rest/user/${client_id}`, 'PUT', payload)
        .then(() => resolve())
        .catch((err: any) => reject(err));
    });
  }

  async setClientNote(client_id: string, note: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.controller.customApiRequest(`/api/s/${this.site}/rest/user/${client_id}`, 'PUT', { note })
        .then(() => resolve())
        .catch((err: any) => reject(err));
    });
  }

  async unblockClient(mac: string): Promise<void> {
    if (this.gatewayUrl) {
        await fetch(`${this.gatewayUrl}/action/unblock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mac })
        });
        return;
    }
    return new Promise((resolve, reject) => {
        this.controller.unblockClient(mac)
            .then(() => resolve())
            .catch((err: any) => reject(err));
    });
  }

  async setUserGroup(client_id: string, group_id: string): Promise<void> {
    if (this.gatewayUrl) {
        await fetch(`${this.gatewayUrl}/action/throttle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: client_id, groupId: group_id })
        });
        return;
    }
    return new Promise((resolve, reject) => {
        this.controller.setUserGroup(client_id, group_id)
            .then(() => resolve())
            .catch((err: any) => reject(err));
    });
  }

  async getUserGroups(): Promise<any[]> {
    if (this.gatewayUrl) {
        try {
            const res = await fetch(`${this.gatewayUrl}/status`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.groups || [];
        } catch {
            return [];
        }
    }
    return new Promise((resolve, reject) => {
        this.controller.getUserGroups()
            .then((data: any) => resolve(data || []))
            .catch((err: any) => reject(err));
    });
  }

  async createUserGroup(name: string, down: number = -1, up: number = -1): Promise<any> {
    if (this.gatewayUrl) {
        const res = await fetch(`${this.gatewayUrl}/action/createGroup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, down, up })
        });
        const data = await res.json();
        return data.result;
    }
    return new Promise((resolve, reject) => {
        this.controller.createUserGroup(name, down, up)
            .then((data: any) => resolve(data))
            .catch((err: any) => reject(err));
    });
  }

  async restartDevice(mac: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.controller.restartDevice(mac)
        .then(() => resolve())
        .catch((err: any) => reject(err));
    });
  }

  async getAllUsers(withinHours: number = 8760): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.controller.getAllUsers(withinHours)
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }

  async getHealth(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.controller.getHealth()
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }

  async getDPIStats(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.controller.getDPIStats()
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }

  async powerCyclePort(mac: string, portIndex: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.controller.powerCyclePort(mac, portIndex)
        .then(() => resolve())
        .catch((err: any) => reject(err));
    });
  }

  async setLocate(mac: string, enable: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const method = enable ? 'setLocate' : 'unsetLocate';
      this.controller[method](mac)
        .then(() => resolve())
        .catch((err: any) => reject(err));
    });
  }

  async reconnectClient(mac: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.controller.reconnectClient(mac)
        .then(() => resolve())
        .catch((err: any) => reject(err));
    });
  }

  async createVoucher(minutes: number, count: number = 1, quota: number = 0, note?: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.controller.createVouchers(minutes, count, quota, note)
        .then((data: any) => resolve(data))
        .catch((err: any) => reject(err));
    });
  }

  async getWlanConf(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.controller.getWlanConf()
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }

  async getNetworkConf(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.controller.getNetworkConf()
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }

  async createNetwork(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.controller.customApiRequest(`/api/s/${this.site}/rest/networkconf`, 'POST', payload)
        .then((data: any) => resolve(data))
        .catch((err: any) => reject(err));
    });
  }

  async updateNetwork(id: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.controller.customApiRequest(`/api/s/${this.site}/rest/networkconf/${id}`, 'PUT', payload)
        .then((data: any) => resolve(data))
        .catch((err: any) => reject(err));
    });
  }

  async createFirewallRule(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.controller.customApiRequest(`/api/s/${this.site}/rest/firewallrule`, 'POST', payload)
        .then((data: any) => resolve(data))
        .catch((err: any) => reject(err));
    });
  }

  async getFirewallRules(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.controller.getFirewallRules()
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }

  async getFirewallGroups(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.controller.getFirewallGroups()
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }

  async getTrafficRules(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.controller.customApiRequest(`/api/s/${this.site}/rest/trafficrule`)
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }

  async createTrafficRule(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.controller.customApiRequest(`/api/s/${this.site}/rest/trafficrule`, 'POST', payload)
        .then((data: any) => resolve(data))
        .catch((err: any) => reject(err));
    });
  }

  async updateTrafficRule(id: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.controller.customApiRequest(`/api/s/${this.site}/rest/trafficrule/${id}`, 'PUT', payload)
        .then((data: any) => resolve(data))
        .catch((err: any) => reject(err));
    });
  }

  async deleteTrafficRule(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.controller.customApiRequest(`/api/s/${this.site}/rest/trafficrule/${id}`, 'DELETE')
        .then(() => resolve())
        .catch((err: any) => reject(err));
    });
  }

  async getDPIApps(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.controller.customApiRequest(`/api/s/${this.site}/stat/dpi-apps`)
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }
}
