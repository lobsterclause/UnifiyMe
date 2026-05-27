import 'dotenv/config';
import { UnifiClient } from './unifi/client.js';

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  const sonyMac = process.env.SONY_TV_MAC;
  if (!sonyMac) {
    console.error('Set SONY_TV_MAC in your environment (e.g. aa:bb:cc:dd:ee:ff).');
    process.exit(1);
  }

  try {
    await unifi.connect();
    console.log('Connected.');

    const controller = (unifi as any).controller;

    console.log('--- Checking Traffic Rules for Sony TV ---');
    try {
        const rules = await unifi.getTrafficRules();
        console.log(`Found ${rules.length} traffic rules.`);
        const sonyRules = rules.filter((r: any) =>
            (r.target_device_ids && r.target_device_ids.includes(sonyMac)) ||
            (r.target_devices && r.target_devices.includes(sonyMac))
        );
        if (sonyRules.length > 0) {
            console.log(`Found ${sonyRules.length} rules for Sony TV:`);
            console.log(JSON.stringify(sonyRules, null, 2));
        } else {
            console.log('No specific rules found for Sony TV.');
            console.log('All rules:');
            console.log(JSON.stringify(rules.map((r: any) => ({ description: r.description, action: r.action, enabled: r.enabled, target: r.matching_target })), null, 2));
        }
    } catch (err: any) {
        console.error('Error fetching traffic rules:', err.message);
    }

    console.log('\n--- Checking Client Details ---');
    const clients = await unifi.getClients();
    const sony = clients.find(c => c.mac === sonyMac);
    if (sony) {
        console.log('Active Sony TV found:');
        console.log(JSON.stringify(sony, null, 2));
    } else {
        console.log('Sony TV not found in active clients.');
    }

    console.log('\n--- Checking DPI Apps ---');
    try {
        const apps = await unifi.getDPIApps();
        console.log(`Found ${apps.length} DPI apps.`);
        const blockedApps = apps.filter((a: any) => a.blocked);
        if (blockedApps.length > 0) {
            console.log(`Found ${blockedApps.length} blocked apps:`);
            console.log(JSON.stringify(blockedApps.map((a: any) => a.name), null, 2));
        } else {
            console.log('No DPI apps are explicitly blocked.');
        }
    } catch (err: any) {
        console.error('Error fetching DPI apps:', err.message);
    }

    console.log('\n--- Checking Events (Manual API Call) ---');
    try {
        // Try to get events specifically for this client
        const events = await controller.customApiRequest('/api/s/default/stat/event', 'POST', {
            _limit: 50,
            _sort: "-time",
            text: sonyMac
        });
        
        if (events && events.length > 0) {
            console.log(`Found ${events.length} events for ${sonyMac}:`);
            events.forEach((e: any) => {
                console.log(`- [${new Date(e.time).toISOString()}] ${e.key} - ${e.msg}`);
            });
        } else {
            console.log(`No events found for ${sonyMac}.`);
        }
    } catch (err: any) {
        console.error('Error fetching events:', err.message);
    }

    console.log('\n--- Checking All Known Users (History) ---');
    const users = await unifi.getAllUsers(8760);
    const sonyUsers = users.filter((u: any) =>
        (u.name || u.hostname || '').toLowerCase().includes('sony') ||
        (u.oui || '').toLowerCase().includes('sony') ||
        (u.mac && (u.mac.startsWith('00:1d:ba') || u.mac.startsWith('00:1e:dc') || u.mac.startsWith('00:21:ad') || u.mac.startsWith('e8:6e:3a')))
    );

    if (sonyUsers.length > 0) {
        console.log(`Found ${sonyUsers.length} Sony-related devices in history:`);
        sonyUsers.forEach((u: any) => {
            console.log(`- MAC: ${u.mac}, Name: ${u.name || u.hostname || 'Unknown'}, OUI: ${u.oui}, Last IP: ${u.last_ip}, Last Seen: ${new Date(u.last_seen * 1000).toISOString()}`);
        });
    } else {
        console.log('No Sony-related devices found in history.');
    }

    console.log('\n--- All Active Clients ---');
    clients.forEach(c => {
        console.log(`- IP: ${c.ip}, Name: ${c.name || c.hostname || 'Unknown'}, OUI: ${c.oui}, MAC: ${c.mac}`);
    });

    console.log('\n--- Site Sysinfo ---');
    const sysinfo = await unifi.getSiteSysinfo();
    console.log(JSON.stringify(sysinfo, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
