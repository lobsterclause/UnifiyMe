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
  
  constructor(
    private host: string,
    private username: string, 
    private password: string,
    private site: string = 'default'
  ) {}
  
  async connect(): Promise<void> {
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
            .then(() => resolve())
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
    return new Promise((resolve, reject) => {
      this.controller.getAlarms(params)
        .then((data: any) => resolve(data || []))
        .catch((err: any) => reject(err));
    });
  }

  async blockClient(mac: string): Promise<void> {
    return new Promise((resolve, reject) => {
        this.controller.blockClient(mac)
            .then(() => resolve())
            .catch((err: any) => reject(err));
    });
  }

  async unblockClient(mac: string): Promise<void> {
    return new Promise((resolve, reject) => {
        this.controller.unblockClient(mac)
            .then(() => resolve())
            .catch((err: any) => reject(err));
    });
  }
}
