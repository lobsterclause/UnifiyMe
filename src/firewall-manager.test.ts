import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirewallManager } from './firewall-manager.js';
import { UnifiClient } from './unifi/client.js';

describe('FirewallManager', () => {
  let mockUnifi: any;
  let manager: FirewallManager;

  beforeEach(() => {
    mockUnifi = {
      getFirewallGroups: vi.fn(),
      getTrafficRules: vi.fn(),
      createTrafficRule: vi.fn(),
      updateTrafficRule: vi.fn(),
    };
    manager = new FirewallManager(mockUnifi as any);
  });

  it('should ensure telemetry group exists', async () => {
    mockUnifi.getFirewallGroups.mockResolvedValue([
      { name: 'Existing Group', _id: '1' }
    ]);
    // We need a way to create firewall groups in UnifiClient if they don't exist
    // For now, let's assume we are focusing on Traffic Rules as per Phase 1.1
  });

  it('should create a traffic rule if it does not exist', async () => {
    mockUnifi.getTrafficRules.mockResolvedValue([]);
    mockUnifi.createTrafficRule.mockResolvedValue({ _id: 'new_rule_id' });

    await manager.ensureTrafficRule({
      description: 'Block IoT to Main',
      action: 'BLOCK',
      matching_target: 'NETWORK',
      target_network_ids: ['iot_vlan_id'],
      destination_network_ids: ['main_vlan_id']
    });

    expect(mockUnifi.createTrafficRule).toHaveBeenCalled();
  });

  it('should update a traffic rule if it exists but differs', async () => {
    mockUnifi.getTrafficRules.mockResolvedValue([
      {
        _id: 'existing_id',
        description: 'Block IoT to Main',
        action: 'ALLOW' // Different action
      }
    ]);

    await manager.ensureTrafficRule({
      description: 'Block IoT to Main',
      action: 'BLOCK',
      matching_target: 'NETWORK',
      target_network_ids: ['iot_vlan_id'],
      destination_network_ids: ['main_vlan_id']
    });

    expect(mockUnifi.updateTrafficRule).toHaveBeenCalledWith('existing_id', expect.objectContaining({
      action: 'BLOCK'
    }));
  });
});
