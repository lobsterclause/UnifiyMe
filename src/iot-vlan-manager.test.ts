import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IotVlanManager, IoTDetectionCriteria } from './iot-vlan-manager.js';
import { UnifiClient, UnifiClientDevice } from './unifi/client.js';

describe('IotVlanManager', () => {
  let mockUnifi: any;
  let manager: IotVlanManager;

  const criteria: IoTDetectionCriteria = {
    ouiPatterns: ['Hui Zhou', 'Wistron', 'Espressif'],
    hostnamePatterns: ['roku', 'chromecast', 'smart', 'tuya', 'espressif'],
    fingerprintPatterns: ['IoT', 'Smart TV', 'Media Player']
  };

  beforeEach(() => {
    mockUnifi = {
      getClients: vi.fn(),
      setClientFixedIp: vi.fn(),
      setClientNote: vi.fn(),
      reconnectClient: vi.fn(),
    };
    manager = new IotVlanManager(mockUnifi as any, criteria);
  });

  it('should detect IoT devices based on OUI', async () => {
    const clients: Partial<UnifiClientDevice>[] = [
      { mac: '11:22:33:44:55:66', oui: 'Hui Zhou Gaoshengda', hostname: 'unknown' },
      { mac: 'aa:bb:cc:dd:ee:ff', oui: 'Apple', hostname: 'iPhone' }
    ];
    mockUnifi.getClients.mockResolvedValue(clients as UnifiClientDevice[]);

    const detected = await manager.detectIotDevices();
    expect(detected).toHaveLength(1);
    expect(detected[0].mac).toBe('11:22:33:44:55:66');
  });

  it('should detect IoT devices based on hostname', async () => {
    const clients: Partial<UnifiClientDevice>[] = [
      { mac: '22:33:44:55:66:77', oui: 'Unknown', hostname: 'roku-43-tv' },
      { mac: 'bb:cc:dd:ee:ff:00', oui: 'Unknown', hostname: 'MacBook-Pro' }
    ];
    mockUnifi.getClients.mockResolvedValue(clients as UnifiClientDevice[]);

    const detected = await manager.detectIotDevices();
    expect(detected).toHaveLength(1);
    expect(detected[0].mac).toBe('22:33:44:55:66:77');
  });

  it('should detect IoT devices based on fingerprint (raw data)', async () => {
    const clients: any[] = [
      { 
        mac: '33:44:55:66:77:88', 
        oui: 'Unknown', 
        hostname: 'device1',
        fingerprint_id: '123',
        dev_family: 'Smart TV' 
      },
      { mac: 'cc:dd:ee:ff:00:11', oui: 'Unknown', hostname: 'PC' }
    ];
    mockUnifi.getClients.mockResolvedValue(clients);

    const detected = await manager.detectIotDevices();
    expect(detected).toHaveLength(1);
    expect(detected[0].mac).toBe('33:44:55:66:77:88');
  });

  it('should not detect devices already on the IoT VLAN', async () => {
    const clients: any[] = [
      { 
        mac: '44:55:66:77:88:99', 
        oui: 'Hui Zhou', 
        hostname: 'roku',
        network_id: 'iot_vlan_id' 
      }
    ];
    mockUnifi.getClients.mockResolvedValue(clients);

    const detected = await manager.detectIotDevices('iot_vlan_id');
    expect(detected).toHaveLength(0);
  });

  it('should migration devices with dryRun: true (default)', async () => {
    const devices = [{ mac: '11:22:33:44:55:66', hostname: 'test-iot' }] as any;
    const results = await manager.migrateDevices(devices, 'new_network');
    
    expect(results[0]).toContain('DRY RUN');
    expect(results[0]).toContain('test-iot');
    expect(mockUnifi.setClientFixedIp).not.toHaveBeenCalled();
  });

  it('should migration devices with dryRun: false', async () => {
    mockUnifi.setClientFixedIp = vi.fn().mockResolvedValue({});
    mockUnifi.setClientNote = vi.fn().mockResolvedValue({});
    mockUnifi.reconnectClient = vi.fn().mockResolvedValue({});

    const devices = [{ _id: 'id1', mac: '11:22:33:44:55:66', hostname: 'test-iot' }] as any;
    const results = await manager.migrateDevices(devices, 'new_network', false);
    
    expect(results[0]).toContain('ACTION');
    expect(mockUnifi.setClientFixedIp).toHaveBeenCalledWith('id1', 'new_network');
    expect(mockUnifi.setClientNote).toHaveBeenCalled();
    expect(mockUnifi.reconnectClient).toHaveBeenCalledWith('11:22:33:44:55:66');
  });

  it('should handle errors during migration', async () => {
    mockUnifi.setClientFixedIp = vi.fn().mockRejectedValue(new Error('API Error'));

    const devices = [{ _id: 'id1', mac: '11:22:33:44:55:66' }] as any;
    const results = await manager.migrateDevices(devices, 'network_fail', false);
    
    expect(results).toContain('[ERROR] Failed to migrate 11:22:33:44:55:66: API Error');
  });
});
