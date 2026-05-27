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

    // 1. Update Dream Machine (68cd5e79fd3abe23133ba2ef) 5GHz to Channel 149
    console.log('Updating Dream Machine 5GHz channel to 149...');
    await (unifi as any).controller.customApiRequest(
      `/api/s/${process.env.UNIFI_SITE || 'default'}/rest/device/68cd5e79fd3abe23133ba2ef`,
      'PUT',
      {
        radio_table: [
          {
            radio: 'ng',
            name: 'ra0',
            channel: 'auto'
          },
          {
            radio: 'na',
            name: 'rai0',
            channel: '149',
            ht: '40'
          }
        ]
      }
    );

    // 2. Update PHX-BR-AP (5ee3d3a9f3f8ce0570c36e09) 2.4GHz to Channel 11
    console.log('Updating PHX-BR-AP 2.4GHz channel to 11...');
    await (unifi as any).controller.customApiRequest(
      `/api/s/${process.env.UNIFI_SITE || 'default'}/rest/device/5ee3d3a9f3f8ce0570c36e09`,
      'PUT',
      {
        radio_table: [
          {
            radio: 'ng',
            name: 'wifi0',
            channel: '11'
          },
          {
            radio: 'na',
            name: 'wifi1',
            channel: 'auto'
          }
        ]
      }
    );

    console.log('RF adjustments applied successfully.');
  } catch (err: any) {
    console.error('Error applying RF adjustments:', err.message);
    if (err.response) {
        console.error('Response data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

main();
