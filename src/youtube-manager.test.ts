import { describe, it, expect, vi } from 'vitest';
import { RestrictedManager } from './youtube-manager.js';
import { UnifiClientDevice } from './unifi/client.js';

describe('RestrictedManager', () => {
  it('should identify devices with "Restricted" in their name', () => {
    const clients = [
      { mac: '00:11:22:33:44:55', name: 'Restricted-Device-1', hostname: 'Device-1' },
      { mac: '66:77:88:99:AA:BB', name: 'Device-2', hostname: 'Restricted-Device-2' },
      { mac: 'CC:DD:EE:FF:00:11', name: 'Workstation', hostname: 'Workstation-01' },
    ];
    
    const manager = new RestrictedManager();
    const restrictedDevices = manager.identifyRestrictedDevices(clients as any[]);
    
    expect(restrictedDevices).toHaveLength(2);
    expect(restrictedDevices.map((d: UnifiClientDevice) => d.mac)).toContain('00:11:22:33:44:55');
    expect(restrictedDevices.map((d: UnifiClientDevice) => d.mac)).toContain('66:77:88:99:AA:BB');
  });

  it('should be case-insensitive', () => {
    const clients = [
      { mac: '00:11:22:33:44:55', name: 'restricted-device' },
    ];
    
    const manager = new RestrictedManager();
    const restrictedDevices = manager.identifyRestrictedDevices(clients as any[]);
    
    expect(restrictedDevices).toHaveLength(1);
  });

  describe('Traffic Rule Management (Two-Rule System)', () => {
    it('should create both block and allow rules targeting the Restricted network if found', async () => {
      const mockUnifi = {
        getNetworkConf: vi.fn().mockResolvedValue([
          { _id: 'net_id', name: 'Restricted' }
        ]),
        getClients: vi.fn().mockResolvedValue([]),
        getTrafficRules: vi.fn().mockResolvedValue([]),
        createTrafficRule: vi.fn().mockResolvedValue({ _id: 'new_rule' }),
        getDPIApps: vi.fn().mockResolvedValue([
          { _id: 'youtube_id', name: 'YouTube' }
        ])
      };

      const manager = new RestrictedManager();
      await manager.setupRules(mockUnifi as any);

      expect(mockUnifi.createTrafficRule).toHaveBeenCalledTimes(2);
      expect(mockUnifi.createTrafficRule).toHaveBeenCalledWith(expect.objectContaining({
        description: 'Block YouTube for Restricted (Baseline)',
        action: 'BLOCK',
        enabled: true,
        target_network_ids: ['net_id']
      }));
    });

    it('should fallback to device MACs if Restricted network is not found', async () => {
      const mockUnifi = {
        getNetworkConf: vi.fn().mockResolvedValue([]),
        getClients: vi.fn().mockResolvedValue([
          { mac: '00:11:22:33:44:55', name: 'Restricted-Device-1' }
        ]),
        getTrafficRules: vi.fn().mockResolvedValue([]),
        createTrafficRule: vi.fn().mockResolvedValue({ _id: 'new_rule' }),
        getDPIApps: vi.fn().mockResolvedValue([
          { _id: 'youtube_id', name: 'YouTube' }
        ])
      };

      const manager = new RestrictedManager();
      await manager.setupRules(mockUnifi as any);

      expect(mockUnifi.createTrafficRule).toHaveBeenCalledWith(expect.objectContaining({
        target_devices: ['00:11:22:33:44:55']
      }));
    });

    it('should create both block and allow rules if they do not exist', async () => {
      const mockUnifi = {
        getNetworkConf: vi.fn().mockResolvedValue([]),
        getClients: vi.fn().mockResolvedValue([
          { mac: '00:11:22:33:44:55', name: 'Restricted-Device-1' }
        ]),
        getTrafficRules: vi.fn().mockResolvedValue([]),
        createTrafficRule: vi.fn().mockResolvedValue({ _id: 'new_rule' }),
        getDPIApps: vi.fn().mockResolvedValue([
          { _id: 'youtube_id', name: 'YouTube' }
        ])
      };

      const manager = new RestrictedManager();
      await manager.setupRules(mockUnifi as any);

      expect(mockUnifi.createTrafficRule).toHaveBeenCalledTimes(2);
      expect(mockUnifi.createTrafficRule).toHaveBeenCalledWith(expect.objectContaining({
        description: 'Block YouTube for Restricted (Baseline)',
        action: 'BLOCK',
        enabled: true
      }));
      expect(mockUnifi.createTrafficRule).toHaveBeenCalledWith(expect.objectContaining({
        description: 'Allow YouTube for Restricted (Temporary Override)',
        action: 'ALLOW',
        enabled: false
      }));
    });

    it('should enable the Allow rule when unblocking', async () => {
      const mockUnifi = {
        getNetworkConf: vi.fn().mockResolvedValue([]),
        getClients: vi.fn().mockResolvedValue([
          { mac: '00:11:22:33:44:55', name: 'Restricted-Device-1' }
        ]),
        getTrafficRules: vi.fn().mockResolvedValue([
          { _id: 'block_id', description: 'Block YouTube for Restricted (Baseline)', enabled: true },
          { _id: 'allow_id', description: 'Allow YouTube for Restricted (Temporary Override)', enabled: false }
        ]),
        updateTrafficRule: vi.fn().mockResolvedValue({}),
        getDPIApps: vi.fn().mockResolvedValue([
          { _id: 'youtube_id', name: 'YouTube' }
        ])
      };

      const manager = new RestrictedManager();
      await manager.unblockYouTube(mockUnifi as any);

      expect(mockUnifi.updateTrafficRule).toHaveBeenCalledWith('allow_id', expect.objectContaining({
        enabled: true
      }));
    });

    it('should disable the Allow rule when blocking', async () => {
      const mockUnifi = {
        getNetworkConf: vi.fn().mockResolvedValue([]),
        getClients: vi.fn().mockResolvedValue([{ mac: '00:11:22:33:44:55', name: 'Restricted' }]),
        getTrafficRules: vi.fn().mockResolvedValue([
          { _id: 'block_id', description: 'Block YouTube for Restricted (Baseline)', enabled: true },
          { _id: 'allow_id', description: 'Allow YouTube for Restricted (Temporary Override)', enabled: true }
        ]),
        updateTrafficRule: vi.fn().mockResolvedValue({}),
        getDPIApps: vi.fn().mockResolvedValue([{ _id: 'yt', name: 'YouTube' }])
      };

      const manager = new RestrictedManager();
      await manager.blockYouTube(mockUnifi as any);

      expect(mockUnifi.updateTrafficRule).toHaveBeenCalledWith('allow_id', expect.objectContaining({
        enabled: false
      }));
    });

    it('should correctly report if YouTube is blocked', async () => {
      const manager = new RestrictedManager();
      const mockUnifi = {
        getTrafficRules: vi.fn()
          .mockResolvedValueOnce([{ description: 'Allow YouTube for Restricted (Temporary Override)', enabled: false }])
          .mockResolvedValueOnce([{ description: 'Allow YouTube for Restricted (Temporary Override)', enabled: true }])
      };

      expect(await manager.isYouTubeBlocked(mockUnifi as any)).toBe(true);
      expect(await manager.isYouTubeBlocked(mockUnifi as any)).toBe(false);
    });

    it('should re-enforce rules calling setupRules', async () => {
      const manager = new RestrictedManager();
      const setupSpy = vi.spyOn(manager, 'setupRules').mockResolvedValue();
      
      await manager.reEnforceBlocking({} as any);
      expect(setupSpy).toHaveBeenCalled();
    });
  });
});
