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

    const controller = (unifi as any).controller;
    
    console.log('--- DPI Stats (Raw) ---');
    const dpi = await controller.getDPIStats();
    console.log(JSON.stringify(dpi?.slice(0, 5), null, 2));

    console.log('\n--- Client DPI Stats ---');
    // Get clients first to find an active one
    const clients = await unifi.getClients();
    const activeClient = clients.find(c => (c.rx_rate || 0) > 0);
    
    if (activeClient) {
        console.log(`Fetching DPI for active client: ${activeClient.name || activeClient.mac} (${activeClient.mac})`);
        // node-unifi might have a method for client-specific DPI
        // Usually it's /api/s/<SITE>/stat/dpi-user-app
        const clientDpi = await controller.customApiRequest(`/api/s/default/stat/dpi-user-app?mac=${activeClient.mac}`);
        console.log(JSON.stringify(clientDpi?.slice(0, 10), null, 2));
    } else {
        console.log('No active client found for DPI check.');
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
