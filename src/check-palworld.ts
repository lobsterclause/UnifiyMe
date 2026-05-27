import 'dotenv/config';
import { UnifiClient } from './unifi/client.js';

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  const targetMac = process.env.TARGET_MAC;
  if (!targetMac) {
    console.error('Set TARGET_MAC in your environment (e.g. aa:bb:cc:dd:ee:ff) for the Palworld host.');
    process.exit(1);
  }

  try {
    await unifi.connect();
    console.log('Connected to UniFi Controller');

    // 1. Check Traffic Rules
    console.log('\n--- Checking Traffic Rules ---');
    const trafficRules = await (unifi as any).controller.customApiRequest(`/api/s/default/rest/trafficrule`);
    
    let isBlocked = false;
    
    if (trafficRules && Array.isArray(trafficRules)) {
        for (const rule of trafficRules) {
            console.log(`Rule: ${rule.description} (${rule.action}) - Enabled: ${rule.enabled}`);
            
            // Check if this rule targets the device
            const targetsDevice = rule.target_devices && rule.target_devices.some((d: any) => d.mac === targetMac);
            const targetsNetwork = rule.target_networks && rule.target_networks.length > 0; // Assuming it might be on a blocked network
            
            // Check if it targets games or similar
            const targetsApp = rule.target_apps && rule.target_apps.length > 0;
            const targetsAppGroup = rule.target_app_groups && rule.target_app_groups.length > 0;
            
            if (rule.enabled && (targetsDevice || targetsNetwork)) {
                console.log(`  -> POTENTIAL MATCH: Targets device or network`);
                if (targetsApp) console.log(`  -> Apps: ${JSON.stringify(rule.target_apps)}`);
                if (targetsAppGroup) console.log(`  -> App Groups: ${JSON.stringify(rule.target_app_groups)}`);
                
                // Check for "Games" category or specific app
                // App category 4 is often Games, but depends on version
            }
        }
    } else {
        console.log('No traffic rules found.');
    }

    // 2. Check Client DPI
    console.log('\n--- Checking Client DPI for Kep-PC ---');
    try {
        const clientDpi = await (unifi as any).controller.customApiRequest(`/api/s/default/stat/dpi-user-app?mac=${targetMac}`);
        if (clientDpi && clientDpi.length > 0) {
            // Sort by bytes
            clientDpi.sort((a: any, b: any) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes));
            
            console.log('Top 10 Apps:');
            for (const app of clientDpi.slice(0, 10)) {
                const total = (app.rx_bytes + app.tx_bytes) / 1024 / 1024;
                console.log(`  - Cat: ${app.cat_id}, App: ${app.app_id} : ${total.toFixed(2)} MB`);
                // Palworld is likely identified as 'STEAM' or 'Unknown' or UDP traffic
            }
        } else {
            console.log('No DPI data available for client.');
        }
    } catch (e: any) {
        console.log('Could not fetch DPI stats:', e.message);
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
