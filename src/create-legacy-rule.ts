import 'dotenv/config';
import { UnifiClient } from './unifi/client.js';

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  const iotVlanId = "6978fa84b93d621dde083f4f";
  const mainVlanId = "5edf0533bf393c051fe6ad16";

  const payload = {
    name: "Block IoT to Main",
    ruleset: "LAN_IN",
    rule_index: 2000,
    action: "drop",
    enabled: true,
    src_networkconf_id: iotVlanId,
    dst_address: "192.168.1.0/24",
    protocol: "all"
  };

  try {
    console.log('Connecting to UniFi...');
    await unifi.connect();
    
    console.log('Creating Legacy Firewall Rule: Block IoT to Main...');
    const result = await unifi.createFirewallRule(payload);
    console.log('Success:', JSON.stringify(result, null, 2));
    
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
