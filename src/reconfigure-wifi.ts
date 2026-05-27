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
    console.log('Connected.');

    // WLAN ID for "I LIKE TURTLES!!!": 638911708a74c803d8ebdcaf
    // Unrestricted Network ID: 6922945ac2df8c07b55763e8
    const wlanId = '638911708a74c803d8ebdcaf';
    const networkId = '6922945ac2df8c07b55763e8';

    const payload = {
      name: 'Unfiltered WiFi',
      x_passphrase: 'unfilteredaccess',
      networkconf_id: networkId
    };

    console.log('Updating WLAN...');
    const result = await (unifi as any).controller.customApiRequest(`/api/s/${process.env.UNIFI_SITE || 'default'}/rest/wlanconf/${wlanId}`, 'PUT', payload);
    console.log('Result:', JSON.stringify(result, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.response?.data) {
        console.error('API Error:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

main();
