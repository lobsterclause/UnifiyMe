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

export interface PortForwardPayload {
  name: string;
  enabled: boolean;
  proto: 'tcp' | 'udp' | 'tcp_udp';
  fwd: string;
  fwd_port: string;
  dst_port: string;
  src: string;
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
        if (Array.isArray(payload[key]) && Array.isArray(existing[key])) {
          if (JSON.stringify([...payload[key]].sort()) !== JSON.stringify([...existing[key]].sort())) {
            needsUpdate = true;
            break;
          }
        } else if (existing[key] !== payload[key]) {
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

  async ensurePortForwardRule(payload: PortForwardPayload): Promise<void> {
    const existingRules = await this.unifi.getPortForwardRules();
    const existing = existingRules.find((r: any) => r.name === payload.name);

    if (!existing) {
      console.log(`Creating port forward rule: ${payload.name}`);
      await this.unifi.createPortForwardRule(payload);
    } else {
      // Check if update is needed
      let needsUpdate = false;
      for (const key of Object.keys(payload)) {
        if (Array.isArray(payload[key]) && Array.isArray(existing[key])) {
          if (JSON.stringify([...payload[key]].sort()) !== JSON.stringify([...existing[key]].sort())) {
            needsUpdate = true;
            break;
          }
        } else if (existing[key] !== payload[key]) {
          needsUpdate = true;
          break;
        }
      }

      if (needsUpdate) {
        console.log(`Updating port forward rule: ${payload.name}`);
        await this.unifi.updatePortForwardRule(existing._id, {
          ...existing,
          ...payload
        });
      }
    }
  }
}
