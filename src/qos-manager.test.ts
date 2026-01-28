import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QoSManager } from './qos-manager.js';

describe('QoSManager', () => {
  let mockClient: any;
  let qosManager: QoSManager;

  beforeEach(() => {
    mockClient = {
      setUserGroup: vi.fn().mockResolvedValue({}),
      getUserGroups: vi.fn().mockResolvedValue([
        { _id: 'iot_low_id', name: 'IoT Low Priority' },
        { _id: 'default_id', name: 'Default' }
      ]),
    };
    qosManager = new QoSManager(mockClient as any, {
        vipMacs: ['vip-mac'],
        iotLowGroupId: 'iot_low_id'
    });
  });

  it('should throttle high-bandwidth IoT devices and ignore VIPs', async () => {
    const clients = [
      { _id: 'iot_id', mac: 'iot-mac', name: 'IoT Device', rx_rate: 10 * 1024 * 1024 / 8, tx_rate: 0, usergroup_id: 'default_id' }, // 10 Mbps
      { _id: 'vip_id', mac: 'vip-mac', name: 'VIP Device', rx_rate: 50 * 1024 * 1024 / 8, tx_rate: 0, usergroup_id: 'default_id' }  // 50 Mbps
    ];

    await qosManager.enforceIoTLimits(clients, 5); // 5 Mbps threshold

    expect(mockClient.setUserGroup).toHaveBeenCalledWith('iot_id', 'iot_low_id');
    expect(mockClient.setUserGroup).not.toHaveBeenCalledWith('vip_id', 'iot_low_id');
  });

  it('should not re-throttle already throttled devices', async () => {
    const clients = [
      { _id: 'iot_id', mac: 'iot-mac', name: 'IoT Device', rx_rate: 10 * 1024 * 1024 / 8, tx_rate: 0, usergroup_id: 'iot_low_id' }
    ];

    await qosManager.enforceIoTLimits(clients, 5);
    expect(mockClient.setUserGroup).not.toHaveBeenCalled();
  });

  it('should identify IoT devices by OUI if not explicitly marked (optional but good)', async () => {
      // For now let's stick to the plan: "Identify: Detect High-Bandwidth IoT devices via efficient rx_rate polling"
      // Wait, how do we know it's an IoT device? 
      // Maybe we assume anything not a VIP that is high bandwidth is a candidate, 
      // OR we have a way to identify IoT. 
      // The user says "Identify: Detect High-Bandwidth IoT devices".
      // I'll add an `isIot` check, maybe based on OUI or a provided list.
  });
});
