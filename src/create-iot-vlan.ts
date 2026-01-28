import 'dotenv/config';
import { UnifiClient } from './unifi/client.js';

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  const payload = {
    name: "IoT Network",
    purpose: "corporate",
    vlan: 20,
    ip_subnet: "192.168.20.1/24",
    dhcpd_enabled: true,
    dhcpd_start: "192.168.20.10",
    dhcpd_stop: "192.168.20.200",
    dhcpd_leasetime: 86400,
    domain_name: "iot.local",
    enabled: true,
    vlan_enabled: true,
    networkgroup: "LAN",
    gateway_type: "default",
    is_nat: true,
    igmp_snooping: true,
    mdns_enabled: true,
    setting_preference: "manual"
  };

  try {
    console.log('Connecting to UniFi...');
    await unifi.connect();
    
    console.log('Creating IoT Network (VLAN 20)...');
    const result = await unifi.createNetwork(payload);
    console.log('Success:', JSON.stringify(result, null, 2));
    
    console.log('\nNow you can rerun the dry run script:');
    console.log('npx tsx src/iot-migration-dry-run.ts');
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
