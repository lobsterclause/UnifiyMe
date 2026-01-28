import 'dotenv/config';
import { UnifiClient } from './unifi/client.js';

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  const iotVlanId = "6978fa84b93d621dde083f4f";
  const mainVlanId = "5edf0533bf393c051fe6ad16";

  const payload = {
    description: "Block YouTube (Test)",
    enabled: true,
    action: "BLOCK",
    matching_target: "APP",
    target_app_ids: ["5e3d789e0000000000000000"], // Dummy ID
    target_network_ids: [iotVlanId]
  };

  try {
    console.log('Connecting to UniFi...');
    await unifi.connect();
    
    console.log('Creating Traffic Rule...');
    const result = await unifi.createTrafficRule(payload);
    console.log('Success:', JSON.stringify(result, null, 2));
    
  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.response && err.response.data) {
        console.error('Response Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

main();
