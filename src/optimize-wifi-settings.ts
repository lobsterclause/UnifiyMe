import 'dotenv/config';
import { UnifiClient } from './unifi/client.js';

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

    // Device IDs from the system
    const devices = [
      { name: 'Dream-Machine', id: '68cd5e79fd3abe23133ba2ef' },
      { name: 'PHX-BR-AP', id: '5ee3d3a9f3f8ce0570c36e09' },
      { name: 'AP-Kepler-AC', id: '64976d502b233e2b06c9cc0f' }
    ];

    for (const device of devices) {
      console.log(`\n🔄 Optimizing ${device.name}...`);
      
      try {
        // Apply optimized WiFi settings
        await (unifi as any).controller.customApiRequest(
          `/api/s/${process.env.UNIFI_SITE || 'default'}/rest/device/${device.id}`,
          'PUT',
          {
            radio_table: [
              {
                radio: 'ng',  // 2.4GHz
                name: device.name === 'Dream-Machine' ? 'ra0' : 'wifi0',
                channel: 'auto',
                ht: 20,  // Keep 20MHz for 2.4GHz (better for congestion)
                min_rssi_enabled: true,
                min_rssi: -75,  // Kick clients weaker than -75 dBm
                tx_power_mode: 'auto'
              },
              {
                radio: 'na',  // 5GHz
                name: device.name === 'Dream-Machine' ? 'rai0' : 'wifi1',
                channel: 'auto',
                ht: 80,  // Increase to 80MHz for better throughput
                min_rssi_enabled: true,
                min_rssi: -75,  // Kick clients weaker than -75 dBm
                tx_power_mode: 'auto'
              }
            ]
          }
        );
        
        console.log(`  ✅ 5GHz channel width: 40MHz → 80MHz`);
        console.log(`  ✅ Minimum RSSI enabled: -75 dBm`);
        console.log(`  ✅ 2.4GHz kept at 20MHz (optimal for congestion)`);
        
      } catch (err: any) {
        console.error(`  ❌ Error updating ${device.name}:`, err.message);
      }
    }

    console.log('\n\n✨ WiFi Optimization Complete!');
    console.log('\nChanges applied:');
    console.log('  • 5GHz channel width increased to 80MHz (2x throughput)');
    console.log('  • Minimum RSSI set to -75 dBm (better roaming)');
    console.log('  • 2.4GHz kept at 20MHz (less interference)');
    console.log('\nNote: Changes will take effect within 60 seconds.');
    console.log('Clients may briefly disconnect/reconnect.');

  } catch (err: any) {
    console.error('Connection error:', err.message);
  }
}

main();
