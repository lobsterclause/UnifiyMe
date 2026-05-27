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

    const wanId = '5edf06324f71a0eba140b4a7';
    
    console.log('Enabling Smart Queues on WAN...');
    // We use the speedtest results: 604 Mbps down, 42 Mbps up
    // Smart Queues usually perform best when set to 80-90% of actual speed
    // but we will set them to the reported speed for now.
    await (unifi as any).controller.customApiRequest(
      `/api/s/${process.env.UNIFI_SITE || 'default'}/rest/networkconf/${wanId}`,
      'PUT',
      {
        wan_smartq_enabled: true,
        wan_provider_capabilities: {
          download_kilobits_per_second: 600000,
          upload_kilobits_per_second: 40000
        }
      }
    );

    console.log('Smart Queues enabled successfully.');
  } catch (err: any) {
    console.error('Error enabling Smart Queues:', err.message);
    if (err.response) {
        console.error('Response data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

main();
