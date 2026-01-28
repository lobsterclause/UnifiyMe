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
});
