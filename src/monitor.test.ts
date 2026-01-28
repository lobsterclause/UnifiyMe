import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiMonitor } from './monitor.js';

describe('UnifiMonitor Mitigation Logic', () => {
  let mockClient: any;
  let monitor: UnifiMonitor;

  beforeEach(() => {
    mockClient = {
      getDevices: vi.fn(),
      getAlarms: vi.fn(),
      getClients: vi.fn(),
      blockClient: vi.fn(),
      unblockClient: vi.fn(),
      getUserGroups: vi.fn().mockResolvedValue([
        { _id: 'default_id', name: 'Default' },
        { _id: 'throttle_id', name: 'Throttled' },
        { _id: 'iot_low_id', name: 'IoT Low Priority' }
      ]),
      setUserGroup: vi.fn(),
      getSiteSysinfo: vi.fn().mockResolvedValue([{ subsystem: 'test' }]),
      connect: vi.fn().mockResolvedValue(true)
    };
    monitor = new UnifiMonitor(mockClient as any);
  });

  it('should throttle high bandwidth clients when load is high', async () => {
    // Setup groups
    await (monitor as any).setupGroups();

    // High load
    mockClient.getDevices.mockResolvedValue([
      {
        model: 'UDM',
        sys_stats: {
          loadavg_1: '4.5',
          mem_used: 1900 * 1024 * 1024,
        }
      }
    ]);

    // One client using lots of bandwidth
    mockClient.getClients.mockResolvedValue([
      { _id: 'offender_id', mac: 'offender-mac', name: 'Offender', rx_rate: 25 * 1024 * 1024 / 8, tx_rate: 0, ip: '192.168.1.50', oui: 'Apple' }, // 25 Mbps
      { _id: 'normal_id', mac: 'normal-mac', name: 'Normal', rx_rate: 1 * 1024 * 1024 / 8, tx_rate: 0, ip: '192.168.1.51' }    // 1 Mbps
    ]);

    await (monitor as any).cycle();

    expect(mockClient.setUserGroup).toHaveBeenCalledWith('offender_id', 'throttle_id');
    expect(mockClient.setUserGroup).not.toHaveBeenCalledWith('normal_id', 'throttle_id');
  });

  it('should restore original group after penalty duration', async () => {
    vi.useFakeTimers();
    
    // Setup groups
    await (monitor as any).setupGroups();

    // High load
    mockClient.getDevices.mockResolvedValue([
      { model: 'UDM', sys_stats: { loadavg_1: '4.5' } }
    ]);

    // Offender
    mockClient.getClients.mockResolvedValue([
      { _id: 'offender_id', mac: 'offender-mac', name: 'Offender', rx_rate: 25 * 1024 * 1024 / 8, usergroup_id: 'original_id' }
    ]);

    await (monitor as any).cycle();
    expect(mockClient.setUserGroup).toHaveBeenCalledWith('offender_id', 'throttle_id');

    // Advance time by 11 minutes (PENALTY_DURATION_MS is 10 mins)
    vi.advanceTimersByTime(11 * 60 * 1000);

    // Next cycle should restore
    await (monitor as any).cycle();
    expect(mockClient.setUserGroup).toHaveBeenCalledWith('offender_id', 'original_id');

    vi.useRealTimers();
  });

  it('should apply aggressive IoT throttling when CPU load > 80%', async () => {
    // Mock VIP_MACS
    process.env.VIP_MACS = 'vip-mac';

    // Setup groups
    await (monitor as any).setupGroups();

    // High CPU load (80% of 4 cores = 3.2)
    mockClient.getDevices.mockResolvedValue([
      {
        model: 'UDM',
        sys_stats: {
          loadavg_1: '3.5',
          mem_used: 1000 * 1024 * 1024,
        }
      }
    ]);

    // IoT device using 3 Mbps (above 2 Mbps aggressive threshold, below 5 Mbps normal)
    mockClient.getClients.mockResolvedValue([
      { _id: 'iot_id', mac: 'iot-mac', name: 'IoT-Camera', rx_rate: 3 * 1024 * 1024 / 8, tx_rate: 0, usergroup_id: 'default_id', oui: 'Generic' },
      { _id: 'vip_id', mac: 'vip-mac', name: 'VIP-Workstation', rx_rate: 10 * 1024 * 1024 / 8, tx_rate: 0, usergroup_id: 'default_id' }
    ]);

    await (monitor as any).cycle();

    expect(mockClient.setUserGroup).toHaveBeenCalledWith('iot_id', 'iot_low_id');
    expect(mockClient.setUserGroup).not.toHaveBeenCalledWith('vip_id', 'iot_low_id');
  });

  it('should protect VIPs from being in the low priority group', async () => {
    process.env.VIP_MACS = 'vip-mac';

    // Setup groups
    await (monitor as any).setupGroups();

    mockClient.getDevices.mockResolvedValue([
      { model: 'UDM', sys_stats: { loadavg_1: '1.0' } }
    ]);

    // VIP accidentally in low priority group
    mockClient.getClients.mockResolvedValue([
      { _id: 'vip_id', mac: 'vip-mac', name: 'VIP', rx_rate: 0, tx_rate: 0, usergroup_id: 'iot_low_id' }
    ]);

    await (monitor as any).cycle();

    expect(mockClient.setUserGroup).toHaveBeenCalledWith('vip_id', 'default_id');
  });
});
