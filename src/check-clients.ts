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

    const clients = await unifi.getClients();
    const restrictedClients = clients.filter(c => 
        (c.name || '').toLowerCase().includes('restricted') || 
        (c.hostname || '').toLowerCase().includes('restricted')
    );
    console.log('--- Restricted Clients ---');
    console.log(JSON.stringify(restrictedClients, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
