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

    // Unrestricted Network ID from previous check: 6922945ac2df8c07b55763e8
    const networkId = '6922945ac2df8c07b55763e8';
    const apGroupId = '603c83d3b5f9bd0486e559bf'; // From existing WLANs

    const payload = {
      name: 'Unfiltered WiFi',
      x_passphrase: 'unfilteredaccess',
      security: 'wpapsk',
      wpa_mode: 'wpa2',
      wpa_enc: 'ccmp',
      networkconf_id: networkId,
      ap_group_ids: [apGroupId],
      enabled: true,
      wlan_band: 'both'
    };

    console.log('Creating WLAN...');
    const result = await (unifi as any).controller.customApiRequest(`/api/s/${process.env.UNIFI_SITE || 'default'}/rest/wlanconf`, 'POST', payload);
    console.log('Result:', JSON.stringify(result, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.response?.data) {
        console.error('API Error:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

main();
