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
    
    // Access underlying controller to call getAllUsers (history)
    // The wrapper doesn't expose it directly yet
    const controller = (unifi as any).controller;
    
    // Fetch all known clients (history)
    console.log('Fetching all user history...');
    const allUsers = await controller.getAllUsers(8760); // Check last year of data
    
    const targetIp = '192.168.1.x';
    
    // Look for matches in 'ip' (current) or 'last_ip' (historical)
    const matches = allUsers.filter((u: any) => 
        u.ip === targetIp || u.last_ip === targetIp
    );

    if (matches.length > 0) {
        console.log(`\n--- Historical Matches for ${targetIp} ---`);
        matches.forEach((user: any) => {
            console.log(`Name:        ${user.name || 'N/A'}`);
            console.log(`Hostname:    ${user.hostname || 'N/A'}`);
            console.log(`MAC Address: ${user.mac}`);
            console.log(`Manufacturer: ${user.oui || 'Unknown'} (Vendor: ${user.vendor || 'Unknown'})`);
            console.log(`First Seen:  ${new Date(user.first_seen * 1000).toLocaleString()}`);
            console.log(`Last Seen:   ${new Date(user.last_seen * 1000).toLocaleString()}`);
            console.log(`Last IP:     ${user.last_ip}`);
            console.log(`Note:        ${user.note || ''}`);
            console.log('-------------------------------------------');
        });
    } else {
        console.log(`No historical record found for IP ${targetIp}.`);
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
