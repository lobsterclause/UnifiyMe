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
    await unifi.connect();
    const clients = await unifi.getClients();
    const targetIp = '192.168.1.x';
    
    // Check both active and history
    // console.log(`Searching ${clients.length} clients...`);
    const potentialTargets = clients.filter(c => c.ip && c.ip.startsWith('192.168.1.10')); // Narrow down
    
    if (potentialTargets.length > 0) {
        console.log(`\n--- Found Potential Matches ---`);
        potentialTargets.forEach(target => {
            console.log(`IP: ${target.ip}, Name: ${target.name || target.hostname}, Vendor: ${target.oui}`);
        });
    } else {
        console.log('No partial IP matches found either.');
        // Fallback: Show all active
        console.log('\n--- All Active IPs ---');
        clients.filter(c => c.ip).forEach(c => console.log(`${c.ip} - ${c.name || c.hostname}`));
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
