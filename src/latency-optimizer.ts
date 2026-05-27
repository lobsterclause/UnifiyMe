import 'dotenv/config';
import { UnifiClient } from './unifi/client.js';

/**
 * Low-Latency Network Optimization Tool
 * 
 * Addresses latency across all dimensions:
 * 1. WiFi (airtime, channel, width, roaming)
 * 2. WAN (Smart Queues, DNS)
 * 3. LAN (switch priorities, IGMP)
 * 4. Application (traffic rules, DPI prioritization)
 */

export interface LatencyOptimizationConfig {
  wanId: string;
  downloadMbps: number;
  uploadMbps: number;
  // Set Smart Queue speeds to this percentage of actual (85-95% recommended)
  smartQueuePercentage: number;
  // Minimum RSSI for client connection (-67 to -80 typical)
  minRssi: number;
  // Enable 80MHz on 5GHz
  enable80MhzWidth: boolean;
  // Enable fast roaming (802.11r)
  enableFastRoaming: boolean;
  // Low-latency apps to prioritize
  priorityApps: string[];
}

export interface LatencyAuditResult {
  category: string;
  item: string;
  currentValue: string | number | boolean;
  recommendedValue: string | number | boolean;
  impact: 'high' | 'medium' | 'low';
  status: 'optimal' | 'suboptimal' | 'critical';
}

export class LatencyOptimizer {
  private client: UnifiClient;
  private config: LatencyOptimizationConfig;

  constructor(client: UnifiClient, config: LatencyOptimizationConfig) {
    this.client = client;
    this.config = config;
  }

  /**
   * Perform a full latency audit of the network
   */
  async audit(): Promise<LatencyAuditResult[]> {
    const results: LatencyAuditResult[] = [];
    
    // Get current configurations
    const devices = await this.client.getDevices();
    const networks = await this.client.getNetworkConf();
    
    // Find the gateway/router
    const gateway = devices.find((d: any) => d.type === 'udm' || d.type === 'ugw');
    if (!gateway) {
      console.error('No gateway found');
      return results;
    }

    // 1. WiFi Optimizations
    results.push(...this.auditWiFi(gateway));
    
    // 2. WAN/Smart Queue Optimizations
    results.push(...await this.auditWan(networks));
    
    // 3. Network Configuration
    results.push(...this.auditNetworkConfig(networks));
    
    // 4. Device Health
    results.push(...this.auditDeviceHealth(gateway));

    return results;
  }

  private auditWiFi(gateway: any): LatencyAuditResult[] {
    const results: LatencyAuditResult[] = [];
    
    if (!gateway.radio_table) return results;

    for (const radio of gateway.radio_table) {
      // Check 5GHz channel width
      if (radio.radio === 'na') {
        const currentWidth = radio.ht || 20;
        results.push({
          category: 'WiFi',
          item: `5GHz Channel Width (${radio.name})`,
          currentValue: `${currentWidth}MHz`,
          recommendedValue: '80MHz',
          impact: 'high',
          status: currentWidth >= 80 ? 'optimal' : 'suboptimal'
        });

        // Check if using DFS channels (can cause latency during radar detection)
        const channel = parseInt(radio.channel);
        const isDFS = channel >= 52 && channel <= 144;
        results.push({
          category: 'WiFi',
          item: '5GHz DFS Channel',
          currentValue: isDFS ? `Yes (Ch ${channel})` : `No (Ch ${channel})`,
          recommendedValue: 'Non-DFS (36-48, 149-165)',
          impact: 'medium',
          status: isDFS ? 'suboptimal' : 'optimal'
        });
      }

      // Check 2.4GHz settings
      if (radio.radio === 'ng') {
        const currentWidth = radio.ht || 20;
        // 20MHz is actually better for 2.4GHz due to congestion
        results.push({
          category: 'WiFi',
          item: `2.4GHz Channel Width (${radio.name})`,
          currentValue: `${currentWidth}MHz`,
          recommendedValue: '20MHz',
          impact: 'medium',
          status: currentWidth === 20 ? 'optimal' : 'suboptimal'
        });

        // Check channel - should be 1, 6, or 11
        const channel = parseInt(radio.channel);
        const goodChannels = [1, 6, 11];
        results.push({
          category: 'WiFi',
          item: '2.4GHz Channel Selection',
          currentValue: `Channel ${channel}`,
          recommendedValue: 'Channel 1, 6, or 11',
          impact: 'medium',
          status: goodChannels.includes(channel) ? 'optimal' : 'suboptimal'
        });
      }

      // Check minimum RSSI
      results.push({
        category: 'WiFi',
        item: `Minimum RSSI (${radio.name})`,
        currentValue: radio.min_rssi_enabled ? `${radio.min_rssi} dBm` : 'Disabled',
        recommendedValue: '-75 dBm enabled',
        impact: 'medium',
        status: radio.min_rssi_enabled ? 'optimal' : 'suboptimal'
      });
    }

    // Check band steering
    const bandSteering = gateway.bandsteering_mode || 'off';
    results.push({
      category: 'WiFi',
      item: 'Band Steering',
      currentValue: bandSteering,
      recommendedValue: 'prefer_5g',
      impact: 'high',
      status: bandSteering === 'prefer_5g' ? 'optimal' : 'suboptimal'
    });

    // Check channel utilization from radio_table_stats
    if (gateway.radio_table_stats) {
      for (const stat of gateway.radio_table_stats) {
        const cuTotal = stat.cu_total || 0;
        results.push({
          category: 'WiFi',
          item: `Channel Utilization (${stat.radio})`,
          currentValue: `${cuTotal}%`,
          recommendedValue: '< 50%',
          impact: 'high',
          status: cuTotal < 50 ? 'optimal' : cuTotal < 70 ? 'suboptimal' : 'critical'
        });

        // Check retry rate
        const retryPct = stat.tx_retries_pct || 0;
        results.push({
          category: 'WiFi',
          item: `TX Retry Rate (${stat.radio})`,
          currentValue: `${retryPct.toFixed(1)}%`,
          recommendedValue: '< 10%',
          impact: 'high',
          status: retryPct < 10 ? 'optimal' : retryPct < 20 ? 'suboptimal' : 'critical'
        });
      }
    }

    return results;
  }

  private async auditWan(networks: any[]): Promise<LatencyAuditResult[]> {
    const results: LatencyAuditResult[] = [];
    
    const wan = networks.find((n: any) => n.purpose === 'wan');
    if (!wan) return results;

    // Smart Queues
    const smartQEnabled = wan.wan_smartq_enabled || false;
    results.push({
      category: 'WAN',
      item: 'Smart Queues (SQM/fq_codel)',
      currentValue: smartQEnabled ? 'Enabled' : 'Disabled',
      recommendedValue: 'Enabled',
      impact: 'high',
      status: smartQEnabled ? 'optimal' : 'critical'
    });

    if (smartQEnabled && wan.wan_provider_capabilities) {
      const configuredDown = wan.wan_provider_capabilities.download_kilobits_per_second / 1000;
      const configuredUp = wan.wan_provider_capabilities.upload_kilobits_per_second / 1000;
      const recommendedDown = this.config.downloadMbps * (this.config.smartQueuePercentage / 100);
      const recommendedUp = this.config.uploadMbps * (this.config.smartQueuePercentage / 100);

      results.push({
        category: 'WAN',
        item: 'Smart Queue Download Speed',
        currentValue: `${configuredDown} Mbps`,
        recommendedValue: `${recommendedDown.toFixed(0)} Mbps (${this.config.smartQueuePercentage}% of ${this.config.downloadMbps})`,
        impact: 'medium',
        status: configuredDown <= recommendedDown * 1.1 ? 'optimal' : 'suboptimal'
      });

      results.push({
        category: 'WAN',
        item: 'Smart Queue Upload Speed',
        currentValue: `${configuredUp} Mbps`,
        recommendedValue: `${recommendedUp.toFixed(0)} Mbps (${this.config.smartQueuePercentage}% of ${this.config.uploadMbps})`,
        impact: 'high',  // Upload is more critical for latency
        status: configuredUp <= recommendedUp * 1.1 ? 'optimal' : 'suboptimal'
      });
    }

    // DNS Settings
    const dns1 = wan.wan_dns1 || '';
    const dns2 = wan.wan_dns2 || '';
    const isCustomDns = wan.wan_dns_preference === 'manual';
    results.push({
      category: 'WAN',
      item: 'Custom DNS',
      currentValue: isCustomDns ? `${dns1}, ${dns2}` : 'ISP Default',
      recommendedValue: 'Low-latency DNS (NextDNS, Cloudflare, etc.)',
      impact: 'medium',
      status: isCustomDns ? 'optimal' : 'suboptimal'
    });

    return results;
  }

  private auditNetworkConfig(networks: any[]): LatencyAuditResult[] {
    const results: LatencyAuditResult[] = [];

    for (const network of networks) {
      if (network.purpose !== 'corporate') continue;

      // IGMP Snooping (important for multicast/streaming)
      results.push({
        category: 'LAN',
        item: `IGMP Snooping (${network.name})`,
        currentValue: network.igmp_snooping ? 'Enabled' : 'Disabled',
        recommendedValue: 'Enabled',
        impact: 'medium',
        status: network.igmp_snooping ? 'optimal' : 'suboptimal'
      });

      // mDNS (important for local device discovery)
      results.push({
        category: 'LAN',
        item: `mDNS (${network.name})`,
        currentValue: network.mdns_enabled ? 'Enabled' : 'Disabled',
        recommendedValue: 'Enabled',
        impact: 'low',
        status: network.mdns_enabled ? 'optimal' : 'suboptimal'
      });
    }

    return results;
  }

  private auditDeviceHealth(gateway: any): LatencyAuditResult[] {
    const results: LatencyAuditResult[] = [];

    // CPU Load
    if (gateway['system-stats']) {
      const cpuLoad = parseFloat(gateway['system-stats'].cpu || '0');
      results.push({
        category: 'Device Health',
        item: 'Gateway CPU Usage',
        currentValue: `${cpuLoad.toFixed(1)}%`,
        recommendedValue: '< 70%',
        impact: 'high',
        status: cpuLoad < 70 ? 'optimal' : cpuLoad < 90 ? 'suboptimal' : 'critical'
      });

      const memUsage = parseFloat(gateway['system-stats'].mem || '0');
      results.push({
        category: 'Device Health',
        item: 'Gateway Memory Usage',
        currentValue: `${memUsage.toFixed(1)}%`,
        recommendedValue: '< 80%',
        impact: 'medium',
        status: memUsage < 80 ? 'optimal' : memUsage < 95 ? 'suboptimal' : 'critical'
      });
    }

    // Temperature
    if (gateway.temperatures) {
      for (const temp of gateway.temperatures) {
        results.push({
          category: 'Device Health',
          item: `${temp.name} Temperature`,
          currentValue: `${temp.value}°C`,
          recommendedValue: '< 80°C',
          impact: 'medium',
          status: temp.value < 80 ? 'optimal' : temp.value < 90 ? 'suboptimal' : 'critical'
        });
      }
    }

    // WAN Latency
    if (gateway.uplink) {
      const latency = gateway.uplink.latency || gateway.uplink.speedtest_ping || 0;
      results.push({
        category: 'WAN',
        item: 'WAN Latency (to ISP)',
        currentValue: `${latency}ms`,
        recommendedValue: '< 20ms',
        impact: 'high',
        status: latency < 20 ? 'optimal' : latency < 50 ? 'suboptimal' : 'critical'
      });
    }

    return results;
  }

  /**
   * Apply recommended optimizations
   */
  async optimize(dryRun: boolean = true): Promise<void> {
    console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Applying latency optimizations...\n`);

    // 1. Optimize Smart Queues
    await this.optimizeSmartQueues(dryRun);

    // 2. Optimize WiFi Settings
    await this.optimizeWiFi(dryRun);

    // 3. Optimize Network Config
    await this.optimizeNetworkConfig(dryRun);

    console.log('\nOptimization complete.');
  }

  private async optimizeSmartQueues(dryRun: boolean): Promise<void> {
    const downloadKbps = Math.round(this.config.downloadMbps * (this.config.smartQueuePercentage / 100) * 1000);
    const uploadKbps = Math.round(this.config.uploadMbps * (this.config.smartQueuePercentage / 100) * 1000);

    console.log(`Smart Queues: Setting to ${downloadKbps / 1000} Mbps down / ${uploadKbps / 1000} Mbps up`);
    
    if (!dryRun) {
      try {
        await (this.client as any).controller.customApiRequest(
          `/api/s/${process.env.UNIFI_SITE || 'default'}/rest/networkconf/${this.config.wanId}`,
          'PUT',
          {
            wan_smartq_enabled: true,
            wan_provider_capabilities: {
              download_kilobits_per_second: downloadKbps,
              upload_kilobits_per_second: uploadKbps
            }
          }
        );
        console.log('  ✓ Smart Queues updated');
      } catch (err: any) {
        console.error('  ✗ Failed to update Smart Queues:', err.message);
      }
    }
  }

  private async optimizeWiFi(dryRun: boolean): Promise<void> {
    const devices = await this.client.getDevices();
    
    for (const device of devices) {
      if (device.type !== 'uap' && device.type !== 'udm') continue;
      if (!device.radio_table) continue;

      let hasChanges = false;
      const radioTable = [...device.radio_table];

      console.log(`\nOptimizing WiFi for ${device.name || device.mac}:`);

      for (const radio of radioTable) {
        let radioChanged = false;

        // Enable minimum RSSI
        if (!radio.min_rssi_enabled && this.config.minRssi) {
          console.log(`  - Enabling min RSSI (${this.config.minRssi} dBm) on ${radio.name}`);
          radio.min_rssi_enabled = true;
          radio.min_rssi = this.config.minRssi;
          radioChanged = true;
        }

        // 5GHz optimizations
        if (radio.radio === 'na' && this.config.enable80MhzWidth) {
          const currentWidth = radio.ht || 20;
          if (currentWidth < 80) {
            console.log(`  - Increasing 5GHz channel width from ${currentWidth}MHz to 80MHz`);
            radio.ht = "80"; // Note: Often string in API
            radioChanged = true;
          }
        }
        
        if (radioChanged) {
            hasChanges = true;
        }
      }

      if (hasChanges) {
          if (!dryRun) {
              try {
                  await this.client.updateDevice(device._id, { radio_table: radioTable });
                  console.log('  ✓ Device WiFi settings updated');
              } catch (err: any) {
                  console.error('  ✗ Failed to update device WiFi settings:', err.message);
              }
          } else {
              console.log('  [DRY RUN] Would update device WiFi settings');
          }
      } else {
          console.log('  - No changes needed');
      }
    }
  }

  private async optimizeNetworkConfig(dryRun: boolean): Promise<void> {
    const networks = await this.client.getNetworkConf();

    for (const network of networks) {
        if (network.purpose !== 'corporate') continue;
        
        // IGMP Snooping
        if (!network.igmp_snooping) {
            console.log(`\nOptimizing Network ${network.name}:`);
            console.log('  - Enabling IGMP Snooping');
            
            if (!dryRun) {
                try {
                    await this.client.updateNetwork(network._id, { igmp_snooping: true });
                    console.log('  ✓ Network settings updated');
                } catch (err: any) {
                    console.error('  ✗ Failed to update network settings:', err.message);
                }
            } else {
                console.log('  [DRY RUN] Would update network settings');
            }
        }
    }
  }
}

/**
 * Print audit results in a formatted table
 */
function printAuditResults(results: LatencyAuditResult[]): void {
  // Group by category
  const categories = new Map<string, LatencyAuditResult[]>();
  for (const result of results) {
    if (!categories.has(result.category)) {
      categories.set(result.category, []);
    }
    categories.get(result.category)!.push(result);
  }

  const statusEmoji = {
    optimal: '✅',
    suboptimal: '⚠️',
    critical: '🔴'
  };

  const impactEmoji = {
    high: '🔥',
    medium: '📊',
    low: '📝'
  };

  for (const [category, items] of categories) {
    console.log(`\n━━━ ${category} ━━━`);
    for (const item of items) {
      const status = statusEmoji[item.status];
      const impact = impactEmoji[item.impact];
      console.log(`${status} ${item.item}`);
      console.log(`   Current: ${item.currentValue}`);
      if (item.status !== 'optimal') {
        console.log(`   Recommended: ${item.recommendedValue} ${impact}`);
      }
    }
  }

  // Summary
  const optimal = results.filter(r => r.status === 'optimal').length;
  const suboptimal = results.filter(r => r.status === 'suboptimal').length;
  const critical = results.filter(r => r.status === 'critical').length;

  console.log('\n━━━ Summary ━━━');
  console.log(`✅ Optimal: ${optimal}`);
  console.log(`⚠️  Suboptimal: ${suboptimal}`);
  console.log(`🔴 Critical: ${critical}`);
  console.log(`\nLatency Score: ${Math.round((optimal / results.length) * 100)}%`);
}

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  try {
    await unifi.connect();
    console.log('Connected to UniFi Controller\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         LOW-LATENCY NETWORK OPTIMIZATION AUDIT               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    const config: LatencyOptimizationConfig = {
      wanId: '5edf06324f71a0eba140b4a7',
      downloadMbps: 604,  // From speedtest
      uploadMbps: 42,     // From speedtest
      smartQueuePercentage: 90, // 90% of actual speed for buffer
      minRssi: -75,
      enable80MhzWidth: true,
      enableFastRoaming: true,
      priorityApps: ['gaming', 'voip', 'video-conferencing']
    };

    const optimizer = new LatencyOptimizer(unifi, config);
    
    // Run audit
    const results = await optimizer.audit();
    printAuditResults(results);

    // Show what would be optimized
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              RECOMMENDED OPTIMIZATIONS                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    // Check for --apply flag
    const shouldApply = process.argv.includes('--apply');
    if (shouldApply) {
      console.log('⚠️  APPLYING OPTIMIZATIONS - This will modify network settings!\n');
    }
    
    await optimizer.optimize(!shouldApply);

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
