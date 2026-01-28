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

    console.log('--- Firewall Rules ---');
    const rules = await unifi.getFirewallRules();
    console.log(JSON.stringify(rules, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
