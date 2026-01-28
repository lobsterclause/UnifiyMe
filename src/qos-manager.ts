import { UnifiClient } from './unifi/client.js';

export interface QoSConfig {
  vipMacs: string[];
  iotLowGroupId: string;
  iotKeywords?: string[];
}

export class QoSManager {
  private iotKeywords: string[];

  constructor(
    private client: UnifiClient,
    private config: QoSConfig
  ) {
    this.iotKeywords = config.iotKeywords || [
      'esp', 'wled', 'shelly', 'tasmota', 'aqara', 'tuya', 
      'smart', 'iot', 'camera', 'ring', 'nest', 'roku', 
      'sonos', 'vizio', 'samsung', 'lg', 'tv', 'bridge',
      'hub', 'light', 'plug', 'switch'
    ];
  }

  /**
   * Identifies high-bandwidth IoT devices and moves them to a low-bandwidth user group.
   * @param clients List of active clients
   * @param thresholdMbps Bandwidth threshold in Mbps
   */
  async enforceIoTLimits(clients: any[], thresholdMbps: number): Promise<void> {
    const thresholdBytesPerSec = (thresholdMbps * 1024 * 1024) / 8;

    for (const client of clients) {
      // Protect VIPs
      if (this.config.vipMacs.includes(client.mac)) continue;
      
      // Skip if already in the low priority group
      if (client.usergroup_id === this.config.iotLowGroupId) continue;

      const rate = (client.rx_rate || 0) + (client.tx_rate || 0);
      if (rate > thresholdBytesPerSec) {
        if (this.isIot(client)) {
          console.log(`[QoS] Throttling IoT device ${client.name || client.hostname || client.mac} (Rate: ${(rate * 8 / 1024 / 1024).toFixed(2)} Mbps)`);
          await this.client.setUserGroup(client._id, this.config.iotLowGroupId);
        }
      }
    }
  }

  /**
   * Ensures VIP devices are never in the low priority group.
   * @param clients List of active clients
   * @param defaultGroupId The group ID to restore VIPs to
   */
  async protectVIPs(clients: any[], defaultGroupId: string): Promise<void> {
    for (const client of clients) {
      if (this.config.vipMacs.includes(client.mac)) {
        if (client.usergroup_id === this.config.iotLowGroupId) {
          console.log(`[QoS] Restoring VIP device ${client.name || client.hostname || client.mac} to default group`);
          await this.client.setUserGroup(client._id, defaultGroupId);
        }
      }
    }
  }

  private isIot(client: any): boolean {
    const name = (client.name || client.hostname || '').toLowerCase();
    const oui = (client.oui || '').toLowerCase();
    
    const matchesKeyword = this.iotKeywords.some(k => name.includes(k) || oui.includes(k));
    
    // IoT devices often have specific OUI patterns or names, 
    // but for this implementation we rely on the keyword list and non-VIP status.
    return matchesKeyword;
  }
}
