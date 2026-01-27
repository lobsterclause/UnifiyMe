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

    const sites = await unifi.getSites();
    console.log(JSON.stringify(sites, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
