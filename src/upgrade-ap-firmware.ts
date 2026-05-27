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
    console.log('Connected to UniFi Controller');

    const apMac = process.env.AP_MAC;
    if (!apMac) {
      console.error('Set AP_MAC in your environment (e.g. aa:bb:cc:dd:ee:ff) for the AP to upgrade.');
      process.exit(1);
    }

    console.log(`Triggering firmware upgrade for AP ${apMac}...`);
    console.log('This will take approximately 5-10 minutes...\n');

    // Trigger the upgrade via UniFi API
    await (unifi as any).controller.customApiRequest(
      `/api/s/${process.env.UNIFI_SITE || 'default'}/cmd/devmgr`,
      'POST',
      {
        cmd: 'upgrade',
        mac: apMac
      }
    );

    console.log('✓ Upgrade command sent successfully');
    console.log('The AP will reboot and install the new firmware.');
    console.log('You can monitor progress in the UniFi Network app.');

  } catch (err: any) {
    console.error('Error triggering upgrade:', err.message);
    if (err.response) {
      console.error('Response:', err.response.data);
    }
  }
}

main();
