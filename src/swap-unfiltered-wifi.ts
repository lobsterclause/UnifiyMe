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

    const site = process.env.UNIFI_SITE || 'default';

    // 1. Revert "Unfiltered WiFi" back to "I LIKE TURTLES!!!"
    // ID: 638911708a74c803d8ebdcaf
    // Original Network ID: 5edf0533bf393c051fe6ad16 (Default)
    const turtleWlanId = '638911708a74c803d8ebdcaf';
    const defaultNetworkId = '5edf0533bf393c051fe6ad16';
    
    console.log('Reverting "I LIKE TURTLES!!!"...');
    await (unifi as any).controller.customApiRequest(`/api/s/${site}/rest/wlanconf/${turtleWlanId}`, 'PUT', {
      name: 'I LIKE TURTLES!!!',
      x_passphrase: 'greatzombie',
      networkconf_id: defaultNetworkId
    });

    // 2. Reconfigure "Capital Tech Service_2G" to "Unfiltered WiFi"
    // ID: 603c83d4b5f9bd0486e559c0
    // Target Network ID: 6922945ac2df8c07b55763e8 (Unrestricted)
    const targetWlanId = '603c83d4b5f9bd0486e559c0';
    const unrestrictedNetworkId = '6922945ac2df8c07b55763e8';

    console.log('Reconfiguring "Capital Tech Service_2G" to "Unfiltered WiFi"...');
    const result = await (unifi as any).controller.customApiRequest(`/api/s/${site}/rest/wlanconf/${targetWlanId}`, 'PUT', {
      name: 'Unfiltered WiFi',
      x_passphrase: 'unfilteredaccess',
      networkconf_id: unrestrictedNetworkId,
      wlan_band: '2g' // Keeping it as 2G to avoid the 4-WLAN limit on 5G
    });

    console.log('Success. Result:', JSON.stringify(result, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.response?.data) {
        console.error('API Error:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

main();
