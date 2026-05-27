import 'dotenv/config';
import { UnifiClient } from './unifi/client.js';
import { FirewallManager } from './firewall-manager.js';

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  const manager = new FirewallManager(unifi);

  try {
    await unifi.connect();
    console.log('Connected to UniFi Controller');

    const fwdIp = process.env.PALWORLD_HOST_IP;
    if (!fwdIp) {
      console.error('Set PALWORLD_HOST_IP in your environment (LAN IP of the Palworld server).');
      process.exit(1);
    }

    await manager.ensurePortForwardRule({
      name: 'Palworld',
      enabled: true,
      proto: 'udp',
      fwd: fwdIp,
      fwd_port: '8211',
      dst_port: '8211',
      src: 'any'
    });

    console.log('Palworld port forwarding ensured.');
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
