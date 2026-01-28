import { UnifiClient } from './unifi/client.js';

export interface TrafficRulePayload {
  description: string;
  action: 'BLOCK' | 'ALLOW' | 'ISOLATE';
  matching_target: 'NETWORK' | 'DOMAIN' | 'APP' | 'APP_GROUP' | 'IP_GROUP';
  target_network_ids?: string[];
  target_device_ids?: string[];
  target_domain_ids?: string[];
  target_app_ids?: string[];
  target_ip_group_ids?: string[];
  destination_network_ids?: string[];
  schedule_id?: string;
  enabled?: boolean;
  [key: string]: any;
}

export class FirewallManager {
  constructor(private unifi: UnifiClient) {}

  async ensureTrafficRule(payload: TrafficRulePayload): Promise<void> {
    const existingRules = await this.unifi.getTrafficRules();
    const existing = existingRules.find((r: any) => r.description === payload.description);

    if (!existing) {
      console.log(`Creating traffic rule: ${payload.description}`);
      await this.unifi.createTrafficRule({
        enabled: true,
        ...payload
      });
    } else {
      // Check if update is needed
      let needsUpdate = false;
      for (const key of Object.keys(payload)) {
        if (existing[key] !== payload[key]) {
          needsUpdate = true;
          break;
        }
      }

      if (needsUpdate) {
        console.log(`Updating traffic rule: ${payload.description}`);
        await this.unifi.updateTrafficRule(existing._id, {
          ...existing,
          ...payload
        });
      }
    }
  }

  async getIotVlanId(vlanId: number = 20): Promise<string | null> {
    const networks = await this.unifi.getNetworkConf();
    const iotNetwork = networks.find((n: any) => n.vlan === vlanId);
    return iotNetwork ? iotNetwork._id : null;
  }

  async getMainVlanId(): Promise<string | null> {
    const networks = await this.unifi.getNetworkConf();
    const mainNetwork = networks.find((n: any) => n.is_default === true || n.vlan === 1 || n.attr_hidden_id === 'LAN');
    return mainNetwork ? mainNetwork._id : null;
  }
}
