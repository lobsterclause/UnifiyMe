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

    // 3:30 PM America/Chicago on Jan 27, 2026
    // UTC is +6 hours during Standard Time, but Jan 27 is Standard Time.
    // Wait, America/Chicago is UTC-6. So 3:30 PM (15:30) + 6 = 21:30 UTC.
    const switchTime = new Date(process.env.SWITCH_TIME || '2026-01-01T00:00:00Z').getTime();
    console.log(`Checking events since: ${new Date(switchTime).toISOString()}`);

    console.log('\n--- Alarms Since Switch ---');
    const alarms = await unifi.getAlarms();
    const recentAlarms = alarms.filter(a => {
        const t = new Date(a.time || a.datetime).getTime();
        return t >= switchTime;
    });

    if (recentAlarms.length > 0) {
        recentAlarms.forEach(a => {
            console.log(`- [${new Date(a.time || a.datetime).toISOString()}] ${a.msg}`);
        });
    } else {
        console.log('No alarms since the switch.');
    }

    console.log('\n--- Events Since Switch ---');
    // getEvents usually takes (site, hours)
    const events = await new Promise<any[]>((resolve, reject) => {
        controller.getEvents('default', 24)
            .then((data: any) => resolve(data || []))
            .catch((err: any) => reject(err));
    });

    const recentEvents = events.filter(e => {
        const t = new Date(e.time || e.datetime).getTime();
        return t >= switchTime;
    });

    if (recentEvents.length > 0) {
        console.log(`Found ${recentEvents.length} events since the switch.`);
        recentEvents.slice(0, 10).forEach(e => {
            console.log(`- [${new Date(e.time || e.datetime).toISOString()}] ${e.msg}`);
        });
    } else {
        console.log('No events since the switch.');
        if (events.length > 0) {
            console.log(`Total events in last 24h: ${events.length}`);
            console.log('Last 3 events overall:');
            events.slice(0, 3).forEach(e => {
                console.log(`- [${new Date(e.time || e.datetime).toISOString()}] ${e.msg}`);
            });
        }
    }

    console.log('\n--- Current WAN Status ---');
    const sites = await unifi.getSites();
    const site = sites[0];
    if (site && site.health) {
        const wan = site.health.find((h: any) => h.subsystem === 'wan');
        if (wan) {
            console.log(`WAN Status: ${wan.status.toUpperCase()}`);
            if (wan.gw_system_stats) {
                console.log(`CPU: ${wan.gw_system_stats.cpu}%`);
                console.log(`Mem: ${wan.gw_system_stats.mem}%`);
            }
        }
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
