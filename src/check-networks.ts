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

    console.log('--- Networks ---');
    const networks = await unifi.getNetworkConf();
    console.log(JSON.stringify(networks, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
