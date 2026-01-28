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
    console.log('Connecting to UniFi...');
    await unifi.connect();
    console.log('Login successful!');
  } catch (err: any) {
    console.error('Login failed:', err.message);
  }
}

main();
