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
    
    console.log('Fetching Network Data...');
    const devices = await unifi.getDevices();
    const clients = await unifi.getClients();
    const sites = await unifi.getSites();
    const sysinfo = await (unifi as any).controller.getSiteSysinfo();

    console.log('--- Network Status ---');
    console.log(`Total Devices: ${devices.length}`);
    console.log(`Total Clients (History): ${clients.length}`);
    console.log(`Sites Managed: ${sites.length}`);
    
    if (sysinfo && sysinfo[0]) {
        console.log(`\n--- Router (${sysinfo[0].name}) ---`);
        console.log(`Version: ${sysinfo[0].udm_version || sysinfo[0].version}`);
        console.log(`Uptime: ${Math.floor(sysinfo[0].uptime / 3600)} hours`);
    }

    console.log('\n--- Devices ---');
    devices.forEach(d => {
        console.log(`- ${d.name || d.model} (${d.ip}) [${d.state === 1 ? 'ONLINE' : 'OFFLINE'}]`);
        if (d.sys_stats) {
            console.log(`  Load: ${d.sys_stats['loadavg_1'] || 'N/A'}, Mem: ${Math.round((d.sys_stats['mem_used'] || 0) / 1024 / 1024)}MB / ${Math.round((d.sys_stats['mem_total'] || 0) / 1024 / 1024)}MB`);
        }
    });

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
