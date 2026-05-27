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
    console.log('Connected to UniFi Controller');
    console.log('🚨 EMERGENCY REVERT: Disabling Min RSSI and resetting Channel Widths 🚨');

    const devices = await unifi.getDevices();
    
    for (const device of devices) {
      if (device.type !== 'uap' && device.type !== 'udm') continue;
      if (!device.radio_table) continue;

      console.log(`\nReverting WiFi for ${device.name || device.mac}:`);
      
      const radioTable = [...device.radio_table];
      let hasChanges = false;

      for (const radio of radioTable) {
        // Disable Min RSSI
        if (radio.min_rssi_enabled) {
          console.log(`  - Disabling min RSSI on ${radio.name}`);
          radio.min_rssi_enabled = false;
          hasChanges = true;
        }

        // Revert 5GHz to 40MHz (safer for mesh)
        if (radio.radio === 'na' && radio.ht !== '40') {
          console.log(`  - Reverting 5GHz channel width to 40MHz on ${radio.name}`);
          radio.ht = "40";
          hasChanges = true;
        }
      }

      if (hasChanges) {
          try {
              await unifi.updateDevice(device._id, { radio_table: radioTable });
              console.log('  ✓ Device settings reverted');
          } catch (err: any) {
              console.error('  ✗ Failed to revert device settings:', err.message);
          }
      } else {
          console.log('  - No changes needed');
      }
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
