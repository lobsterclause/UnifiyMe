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

    console.log('\n--- Health Check ---');
    const health = await controller.getHealth();
    health.forEach((h: any) => {
        console.log(`[${h.subsystem}] Status: ${h.status}, Details: ${JSON.stringify(h.details || {})}`);
    });

    console.log('\n--- DPI Statistics (Top Apps) ---');
    try {
        const dpi = await controller.getDPIStats();
        // DPI might be large, let's sort and show top 10
        if (Array.isArray(dpi)) {
            const sortedDpi = dpi.sort((a: any, b: any) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes));
            sortedDpi.slice(0, 10).forEach((d: any) => {
                const total = ((d.rx_bytes + d.tx_bytes) / 1024 / 1024).toFixed(2);
                console.log(`- App: ${d.cat || 'Unknown'}/${d.app || 'Unknown'}, Traffic: ${total} MB`);
            });
        } else {
            console.log('DPI stats not available or empty.');
        }
    } catch (e) {
        console.log('DPI stats fetch failed (might be disabled).');
    }

    console.log('\n--- IPS/IDS (Threat Management) Check ---');
    try {
        const alarms = await controller.getAlarms(); // Alarms often contain IPS hits
        const recentAlarms = alarms.filter((a: any) => !a.archived).slice(0, 5);
        if (recentAlarms.length > 0) {
            recentAlarms.forEach((a: any) => {
                console.log(`- [${new Date(a.datetime).toISOString()}] ${a.msg}`);
            });
        } else {
            console.log('No recent unarchived alarms/threats.');
        }
    } catch (e) {
        console.log('Could not fetch alarms.');
    }

    console.log('\n--- Client Usage (Top Real-time) ---');
    const clients = await unifi.getClients();
    console.log(`Analyzing ${clients.length} clients...`);
    const activeClients = clients
        .filter(c => c.rx_rate !== undefined || c.tx_rate !== undefined)
        .sort((a, b) => ((b.rx_rate || 0) + (b.tx_rate || 0)) - ((a.rx_rate || 0) + (a.tx_rate || 0)))
        .slice(0, 10);
    
    if (activeClients.length === 0) {
        console.log('No active client traffic detected in real-time.');
    }

    activeClients.forEach(c => {
        const rate = (((c.rx_rate || 0) + (c.tx_rate || 0)) / 1024 / 1024 * 8).toFixed(2);
        console.log(`- Client: ${c.hostname || c.name || c.mac}, IP: ${c.ip}, Activity: ${rate} Mbps`);
    });

  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.stack) console.error(err.stack);
  }
}

main();
