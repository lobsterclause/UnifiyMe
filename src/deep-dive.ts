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
    const controller = (unifi as any).controller;

    console.log('\n--- Router Health & Resource Load ---');
    const sites = await unifi.getSites();
    const site = sites[0];
    if (site && site.health) {
        const wan = site.health.find((h: any) => h.subsystem === 'wan');
        if (wan && wan['gw_system-stats']) {
            console.log(`CPU Load: ${wan['gw_system-stats'].cpu}%`);
            console.log(`Memory Usage: ${wan['gw_system-stats'].mem}%`);
        }
    }

    console.log('\n--- DPI Statistics (Top Apps) ---');
    try {
        const apps = await unifi.getDPIApps();
        if (apps && apps.length > 0) {
            const sortedApps = apps.sort((a: any, b: any) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes));
            sortedApps.slice(0, 10).forEach((d: any) => {
                const total = ((d.rx_bytes + d.tx_bytes) / 1024 / 1024).toFixed(2);
                console.log(`- App: ${d.cat || 'Unknown'}/${d.app || 'Unknown'}, Traffic: ${total} MB`);
            });
        } else {
            console.log('DPI stats not available or empty.');
        }
    } catch (e) {
        console.log('DPI stats fetch failed.');
    }

    console.log('\n--- Client Usage (Top Real-time) ---');
    const clients = await unifi.getClients();
    console.log(`Analyzing ${clients.length} clients...`);
    const activeClients = clients
        .filter(c => (c.rx_rate || 0) > 0 || (c.tx_rate || 0) > 0)
        .sort((a, b) => ((b.rx_rate || 0) + (b.tx_rate || 0)) - ((a.rx_rate || 0) + (a.tx_rate || 0)))
        .slice(0, 10);
    
    if (activeClients.length === 0) {
        console.log('No active client traffic detected in real-time.');
    }

    activeClients.forEach(c => {
        const rate = (((c.rx_rate || 0) + (c.tx_rate || 0)) / 1024 / 1024 * 8).toFixed(2);
        console.log(`- Client: ${c.hostname || c.name || c.mac} (${c.oui || 'Unknown'}), Activity: ${rate} Mbps`);
    });

    console.log('\n--- Recent Threats (Last 24h) ---');
    const alarms = await unifi.getAlarms({ within: 24 });
    const threats = alarms.filter((a: any) => {
        const msg = (a.msg || '').toLowerCase();
        const key = (a.key || '').toLowerCase();
        return key.includes('ips') || msg.includes('p2p') || msg.includes('corporate privacy');
    }).slice(0, 5);

    if (threats.length > 0) {
        threats.forEach((t: any) => {
            console.log(`- [${new Date(t.time || t.datetime).toISOString()}] ${t.msg}`);
        });
    } else {
        console.log('No recent threats detected.');
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
