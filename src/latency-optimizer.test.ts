import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LatencyOptimizer, LatencyOptimizationConfig, LatencyAuditResult } from './latency-optimizer.js';

// Mock UnifiClient
const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  getDevices: vi.fn(),
  getNetworkConf: vi.fn(),
};

describe('LatencyOptimizer', () => {
  let optimizer: LatencyOptimizer;
  let config: LatencyOptimizationConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    config = {
      wanId: 'test-wan-id',
      downloadMbps: 600,
      uploadMbps: 40,
      smartQueuePercentage: 90,
      minRssi: -75,
      enable80MhzWidth: true,
      enableFastRoaming: true,
      priorityApps: ['gaming', 'voip']
    };

    optimizer = new LatencyOptimizer(mockClient as any, config);
  });

  describe('audit()', () => {
    it('should return empty results when no gateway found', async () => {
      mockClient.getDevices.mockResolvedValue([]);
      mockClient.getNetworkConf.mockResolvedValue([]);

      const results = await optimizer.audit();
      
      expect(results).toEqual([]);
    });

    it('should audit WiFi settings when gateway has radio_table', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        radio_table: [
          {
            radio: 'na',
            name: 'rai0',
            ht: 40,
            channel: '149',
            min_rssi_enabled: false,
            min_rssi: -90
          },
          {
            radio: 'ng',
            name: 'ra0',
            ht: 20,
            channel: '6',
            min_rssi_enabled: true,
            min_rssi: -75
          }
        ],
        bandsteering_mode: 'prefer_5g',
        radio_table_stats: [
          { radio: 'na', cu_total: 30, tx_retries_pct: 5 },
          { radio: 'ng', cu_total: 20, tx_retries_pct: 8 }
        ]
      }]);
      mockClient.getNetworkConf.mockResolvedValue([]);

      const results = await optimizer.audit();
      
      // Should have WiFi audit results
      const wifiResults = results.filter((r: LatencyAuditResult) => r.category === 'WiFi');
      expect(wifiResults.length).toBeGreaterThan(0);
      
      // Check 5GHz width detection
      const widthResult = wifiResults.find((r: LatencyAuditResult) => r.item.includes('5GHz Channel Width'));
      expect(widthResult).toBeDefined();
      expect(widthResult?.currentValue).toBe('40MHz');
      expect(widthResult?.status).toBe('suboptimal');
      
      // Check band steering detection
      const bandSteeringResult = wifiResults.find((r: LatencyAuditResult) => r.item === 'Band Steering');
      expect(bandSteeringResult?.status).toBe('optimal');
    });

    it('should audit WAN/Smart Queue settings', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        radio_table: []
      }]);
      mockClient.getNetworkConf.mockResolvedValue([{
        purpose: 'wan',
        wan_smartq_enabled: true,
        wan_provider_capabilities: {
          download_kilobits_per_second: 600000,
          upload_kilobits_per_second: 40000
        },
        wan_dns_preference: 'manual',
        wan_dns1: '45.90.28.61',
        wan_dns2: '45.90.30.61'
      }]);

      const results = await optimizer.audit();
      
      const wanResults = results.filter((r: LatencyAuditResult) => r.category === 'WAN');
      
      // Smart Queues should be detected as enabled
      const sqResult = wanResults.find((r: LatencyAuditResult) => r.item.includes('Smart Queues'));
      expect(sqResult?.currentValue).toBe('Enabled');
      expect(sqResult?.status).toBe('optimal');
      
      // DNS should be custom
      const dnsResult = wanResults.find((r: LatencyAuditResult) => r.item === 'Custom DNS');
      expect(dnsResult?.status).toBe('optimal');
    });

    it('should flag disabled Smart Queues as critical', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        radio_table: []
      }]);
      mockClient.getNetworkConf.mockResolvedValue([{
        purpose: 'wan',
        wan_smartq_enabled: false
      }]);

      const results = await optimizer.audit();
      
      const sqResult = results.find((r: LatencyAuditResult) => r.item.includes('Smart Queues'));
      expect(sqResult?.status).toBe('critical');
      expect(sqResult?.impact).toBe('high');
    });

    it('should audit network configuration (IGMP, mDNS)', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        radio_table: []
      }]);
      mockClient.getNetworkConf.mockResolvedValue([
        { purpose: 'wan' },
        {
          purpose: 'corporate',
          name: 'Default',
          igmp_snooping: true,
          mdns_enabled: true
        },
        {
          purpose: 'corporate',
          name: 'IoT',
          igmp_snooping: false,
          mdns_enabled: true
        }
      ]);

      const results = await optimizer.audit();
      
      const lanResults = results.filter((r: LatencyAuditResult) => r.category === 'LAN');
      expect(lanResults.length).toBe(4); // 2 networks × 2 settings
      
      // Default network should have optimal IGMP
      const defaultIgmp = lanResults.find((r: LatencyAuditResult) => r.item === 'IGMP Snooping (Default)');
      expect(defaultIgmp?.status).toBe('optimal');
      
      // IoT network should have suboptimal IGMP
      const iotIgmp = lanResults.find((r: LatencyAuditResult) => r.item === 'IGMP Snooping (IoT)');
      expect(iotIgmp?.status).toBe('suboptimal');
    });

    it('should audit device health metrics', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        radio_table: [],
        'system-stats': {
          cpu: '45.5',
          mem: '75.0'
        },
        temperatures: [
          { name: 'CPU', value: 65 },
          { name: 'Local', value: 70 }
        ],
        uplink: {
          latency: 15
        }
      }]);
      mockClient.getNetworkConf.mockResolvedValue([]);

      const results = await optimizer.audit();
      
      const healthResults = results.filter((r: LatencyAuditResult) => r.category === 'Device Health');
      
      // CPU should be optimal (< 70%)
      const cpuResult = healthResults.find((r: LatencyAuditResult) => r.item === 'Gateway CPU Usage');
      expect(cpuResult?.status).toBe('optimal');
      
      // Memory should be optimal (< 80%)
      const memResult = healthResults.find((r: LatencyAuditResult) => r.item === 'Gateway Memory Usage');
      expect(memResult?.status).toBe('optimal');
      
      // Temperatures should be optimal (< 80°C)
      const tempResults = healthResults.filter((r: LatencyAuditResult) => r.item.includes('Temperature'));
      expect(tempResults.every((r: LatencyAuditResult) => r.status === 'optimal')).toBe(true);
    });

    it('should flag high CPU usage as critical', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        radio_table: [],
        'system-stats': {
          cpu: '95.0',
          mem: '50.0'
        }
      }]);
      mockClient.getNetworkConf.mockResolvedValue([]);

      const results = await optimizer.audit();
      
      const cpuResult = results.find((r: LatencyAuditResult) => r.item === 'Gateway CPU Usage');
      expect(cpuResult?.status).toBe('critical');
    });

    it('should flag high WAN latency appropriately', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        radio_table: [],
        uplink: {
          latency: 55
        }
      }]);
      mockClient.getNetworkConf.mockResolvedValue([]);

      const results = await optimizer.audit();
      
      const latencyResult = results.find((r: LatencyAuditResult) => r.item === 'WAN Latency (to ISP)');
      expect(latencyResult?.status).toBe('critical');
    });

    it('should detect DFS channels as suboptimal', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        radio_table: [
          {
            radio: 'na',
            name: 'rai0',
            ht: 80,
            channel: '100', // DFS channel
            min_rssi_enabled: true,
            min_rssi: -75
          }
        ],
        bandsteering_mode: 'prefer_5g'
      }]);
      mockClient.getNetworkConf.mockResolvedValue([]);

      const results = await optimizer.audit();
      
      const dfsResult = results.find((r: LatencyAuditResult) => r.item === '5GHz DFS Channel');
      expect(dfsResult?.status).toBe('suboptimal');
      expect(dfsResult?.currentValue).toContain('Yes');
    });

    it('should detect high channel utilization as critical', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        radio_table: [],
        radio_table_stats: [
          { radio: 'na', cu_total: 85, tx_retries_pct: 5 }
        ]
      }]);
      mockClient.getNetworkConf.mockResolvedValue([]);

      const results = await optimizer.audit();
      
      const cuResult = results.find((r: LatencyAuditResult) => r.item === 'Channel Utilization (na)');
      expect(cuResult?.status).toBe('critical');
    });

    it('should detect high TX retry rate as critical', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        radio_table: [],
        radio_table_stats: [
          { radio: 'ng', cu_total: 30, tx_retries_pct: 35 }
        ]
      }]);
      mockClient.getNetworkConf.mockResolvedValue([]);

      const results = await optimizer.audit();
      
      const retryResult = results.find((r: LatencyAuditResult) => r.item === 'TX Retry Rate (ng)');
      expect(retryResult?.status).toBe('critical');
    });
  });

  describe('optimize()', () => {
    it('should perform dry run by default', async () => {
      mockClient.getDevices.mockResolvedValue([{
        type: 'udm',
        name: 'UDM',
        radio_table: []
      }]);

      // Capture console output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await optimizer.optimize(true);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'));
      consoleSpy.mockRestore();
    });
  });
});
