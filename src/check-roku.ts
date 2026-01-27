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
    const rokuClients = clients.filter(c => 
        (c.name || '').toLowerCase().includes('roku') || 
        (c.hostname || '').toLowerCase().includes('roku') ||
        (c.oui || '').toLowerCase().includes('roku')
    );

    if (rokuClients.length === 0) {
        console.log('No Roku clients found.');
        return;
    }

    console.log(`Found ${rokuClients.length} Roku client(s):`);
    for (const roku of rokuClients) {
        const rateMbps = (((roku.rx_rate || 0) + (roku.tx_rate || 0)) / 1024 / 1024 * 8).toFixed(2);
        console.log(`\n--- Roku Client: ${roku.name || roku.hostname || roku.mac} ---`);
        console.log(`MAC: ${roku.mac}`);
        console.log(`IP: ${roku.ip}`);
        console.log(`OUI: ${roku.oui}`);
        console.log(`Current Rate: ${rateMbps} Mbps`);
        console.log(`RX Rate: ${(roku.rx_rate / 1024 / 1024 * 8).toFixed(2)} Mbps`);
        console.log(`TX Rate: ${(roku.tx_rate / 1024 / 1024 * 8).toFixed(2)} Mbps`);
        
        // Fetch DPI stats for this client
        const controller = (unifi as any).controller;
        const clientDpi = await controller.customApiRequest(`/api/s/default/stat/dpi-user-app?mac=${roku.mac}`);
        
        if (clientDpi && clientDpi.length > 0) {
            console.log('DPI Stats (Top 10 Apps):');
            const sortedDpi = clientDpi.sort((a: any, b: any) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes));
            sortedDpi.slice(0, 10).forEach((app: any) => {
                const totalMB = ((app.rx_bytes + app.tx_bytes) / 1024 / 1024).toFixed(2);
                console.log(`- ${app.cat || 'Unknown'}/${app.app || 'Unknown'}: ${totalMB} MB`);
            });
        } else {
            console.log('No DPI stats available for this client.');
        }
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
