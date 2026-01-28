import { UnifiClient, UnifiClientDevice } from './unifi/client.js';

export interface IoTDetectionCriteria {
  ouiPatterns: string[];
  hostnamePatterns: string[];
  fingerprintPatterns: string[];
}

export class IotVlanManager {
  constructor(
    private unifi: UnifiClient,
    private criteria: IoTDetectionCriteria
  ) {}

  async detectIotDevices(iotVlanId?: string): Promise<UnifiClientDevice[]> {
    const clients = await this.unifi.getClients();
    return clients.filter(client => {
      // Skip if already on IoT VLAN
      if (iotVlanId && client.network_id === iotVlanId) {
        return false;
      }
      return this.isIot(client);
    });
  }

  private isIot(client: UnifiClientDevice): boolean {
    const hostname = (client.hostname || client.name || '').toLowerCase();
    const oui = (client.oui || '').toLowerCase();
    
    // Check hostname patterns
    if (this.criteria.hostnamePatterns.some(p => hostname.includes(p.toLowerCase()))) {
      return true;
    }

    // Check OUI patterns
    if (this.criteria.ouiPatterns.some(p => oui.includes(p.toLowerCase()))) {
      return true;
    }

    // Check fingerprint patterns in raw data
    const rawData = JSON.stringify(client).toLowerCase();
    if (this.criteria.fingerprintPatterns.some(p => rawData.includes(p.toLowerCase()))) {
      return true;
    }

    return false;
  }

  /**
   * Proposes migration for detected devices.
   * In a real implementation, this might also handle fixed IP assignment
   * or port profile changes.
   */
  async migrateDevices(devices: UnifiClientDevice[], targetNetworkId: string, dryRun: boolean = true): Promise<string[]> {
    const results: string[] = [];
    for (const device of devices) {
      const msg = `[${dryRun ? 'DRY RUN' : 'ACTION'}] Migrating ${device.hostname || device.mac} to network ${targetNetworkId}`;
      results.push(msg);
      if (!dryRun) {
        // Implementation for actual migration would go here.
        // For example, setting fixed IP on the target network:
        // await this.unifi.setFixedIp(device.mac, targetNetworkId, ...);
      }
    }
    return results;
  }
}
