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

    console.log('--- Traffic Rules ---');
    try {
      const rules = await unifi.getTrafficRules();
      console.log(JSON.stringify(rules, null, 2));
    } catch (e: any) {
      console.error('Failed to get traffic rules:', e.response?.data || e.message);
    }

    console.log('--- Firewall Rules ---');
    const fwRules = await unifi.getFirewallRules();
    console.log(JSON.stringify(fwRules, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
