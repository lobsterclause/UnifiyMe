import { UnifiClient } from './unifi/client.js';
import dotenv from 'dotenv';
import { formatDoH, formatDoT } from './utils/nextdns.js';

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
    const targetIp = process.env.TARGET_CLIENT_IP || '192.168.1.x';
    
    // Check both active and history
    // console.log(`Searching ${clients.length} clients...`);
    const potentialTargets = clients.filter(c => c.ip && c.ip.startsWith('192.168.1.')); // Narrow down
    
    if (potentialTargets.length > 0) {
        console.log(`\n--- Found Potential Matches ---`);
        const configId = process.env.NEXTDNS_CONFIG_ID || '6ca463';
        potentialTargets.forEach(target => {
            const name = target.name || target.hostname || 'Unknown';
            console.log(`IP: ${target.ip}, Name: ${name}, Vendor: ${target.oui}`);
            console.log(`  NextDNS DoT: ${formatDoT(name, configId)}`);
            console.log(`  NextDNS DoH: ${formatDoH(name, configId)}`);
        });
    } else {
        console.log('No partial IP matches found either.');
        // Fallback: Show all active
        console.log('\n--- All Active IPs ---');
        const configId = process.env.NEXTDNS_CONFIG_ID || '6ca463';
        clients.filter(c => c.ip).forEach(c => {
            const name = c.name || c.hostname || 'Unknown';
            console.log(`${c.ip} - ${name}`);
            console.log(`  DoT: ${formatDoT(name, configId)}`);
            console.log(`  DoH: ${formatDoH(name, configId)}`);
        });
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
