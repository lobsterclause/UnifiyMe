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
    console.log('Connected.');

    console.log('--- User Groups ---');
    const userGroups = await (unifi as any).controller.getUserGroups();
    console.log(JSON.stringify(userGroups, null, 2));

    console.log('\n--- Firewall Groups ---');
    const firewallGroups = await unifi.getFirewallGroups();
    console.log(JSON.stringify(firewallGroups, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
