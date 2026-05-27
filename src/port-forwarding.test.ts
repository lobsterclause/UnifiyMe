import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirewallManager, PortForwardPayload } from './firewall-manager.js';

describe('FirewallManager - Port Forwarding', () => {
  let mockUnifi: any;
  let manager: FirewallManager;

  beforeEach(() => {
    mockUnifi = {
      getPortForwardRules: vi.fn(),
      createPortForwardRule: vi.fn(),
      updatePortForwardRule: vi.fn(),
    };
    manager = new FirewallManager(mockUnifi as any);
  });

  it('should create a port forward rule if it does not exist', async () => {
    mockUnifi.getPortForwardRules.mockResolvedValue([]);
    mockUnifi.createPortForwardRule.mockResolvedValue({ _id: 'new_pf_id' });

    const palworldRule: PortForwardPayload = {
      name: 'Palworld',
      enabled: true,
      proto: 'udp',
      fwd: '192.0.2.10',
      fwd_port: '8211',
      dst_port: '8211',
      src: 'any'
    };

    await manager.ensurePortForwardRule(palworldRule);

    expect(mockUnifi.createPortForwardRule).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Palworld',
      proto: 'udp',
      fwd: '192.0.2.10'
    }));
  });

  it('should update a port forward rule if it exists but differs', async () => {
    mockUnifi.getPortForwardRules.mockResolvedValue([
      {
        _id: 'existing_pf_id',
        name: 'Palworld',
        proto: 'tcp', // Different protocol
        fwd: '192.0.2.10',
        fwd_port: '8211',
        dst_port: '8211',
        src: 'any'
      }
    ]);

    const palworldRule: PortForwardPayload = {
      name: 'Palworld',
      enabled: true,
      proto: 'udp',
      fwd: '192.0.2.10',
      fwd_port: '8211',
      dst_port: '8211',
      src: 'any'
    };

    await manager.ensurePortForwardRule(palworldRule);

    expect(mockUnifi.updatePortForwardRule).toHaveBeenCalledWith('existing_pf_id', expect.objectContaining({
      proto: 'udp'
    }));
  });
});
