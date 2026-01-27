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
    const controller = (unifi as any).controller;
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(controller));
    console.log('Available methods:');
    console.log(methods.filter(m => m.toLowerCase().includes('group') || m.toLowerCase().includes('limit') || m.toLowerCase().includes('traffic')).join(', '));

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
