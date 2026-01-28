import 'dotenv/config';
import { UnifiClient } from './unifi/client.js';
import { IotVlanManager, IoTDetectionCriteria } from './iot-vlan-manager.js';
import { FirewallManager } from './firewall-manager.js';

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  const criteria: IoTDetectionCriteria = {
    ouiPatterns: [
      'Hui Zhou Gaoshengda', // Roku
      'Wistron Neweb',
      'Espressif',
      'Tuya',
      'Samsung Electronics',
      'Amazon Technologies',
      'TP-Link',
      'Shenzhen'
    ],
    hostnamePatterns: [
      'roku',
      'chromecast',
      'smart',
      'tuya',
      'espressif',
      'alexa',
      'echo',
      'nest',
      'ring',
      'sonos',
      'philips-hue'
    ],
    fingerprintPatterns: [
      'IoT',
      'Smart TV',
      'Media Player',
      'Camera',
      'Plug',
      'Light'
    ]
  };

  try {
    console.log('Connecting to UniFi...');
    await unifi.connect();

    const iotManager = new IotVlanManager(unifi, criteria);
    const fwManager = new FirewallManager(unifi);

    console.log('Finding IoT VLAN...');
    const iotVlanId = await fwManager.getIotVlanId(20);
    const mainVlanId = await fwManager.getMainVlanId();
    console.log(`IoT VLAN ID: ${iotVlanId}, Main VLAN ID: ${mainVlanId}`);

    if (!iotVlanId) {
      console.warn('IoT VLAN (20) not found in UniFi. Please create it first.');
    }

    console.log('Detecting IoT devices on the network...');
    const iotDevices = await iotManager.detectIotDevices(iotVlanId || undefined);

    if (iotDevices.length === 0) {
      console.log('No new IoT devices detected for migration.');
    } else {
      console.log(`\n--- Detected ${iotDevices.length} IoT Candidates ---`);
      iotDevices.forEach(d => {
        console.log(`- ${d.hostname || d.name || d.mac} (Vendor: ${d.oui}, IP: ${d.ip})`);
      });

      if (iotVlanId) {
        console.log('\n--- Migration Proposal (DRY RUN) ---');
        const proposals = await iotManager.migrateDevices(iotDevices, iotVlanId, true);
        proposals.forEach(p => console.log(p));
      }
    }

    console.log('\n--- Ensuring Firewall Rules (Traffic Rules) ---');
    if (iotVlanId && mainVlanId) {
      await fwManager.ensureTrafficRule({
        description: 'Block IoT to Main LAN',
        action: 'BLOCK',
        matching_target: 'NETWORK',
        target_network_ids: [iotVlanId],
        destination_network_ids: [mainVlanId],
        enabled: true
      });
      console.log('Traffic Rule: Block IoT to Main LAN ensured.');
    } else {
      console.warn('Skipping firewall rules: VLAN IDs not found.');
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
