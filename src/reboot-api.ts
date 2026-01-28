import { UnifiClient } from './unifi/client.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  try {
    console.log('Connecting...');
    await unifi.connect();
    
    // UDM Base MAC from environment or placeholder
    const mac = process.env.TARGET_DEVICE_MAC || '00:00:00:00:00:00';
    console.log(`Sending restart command to device ${mac}...`);
    
    await (unifi as any).controller.restartDevice(mac);
    console.log('Restart command sent successfully.');

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
