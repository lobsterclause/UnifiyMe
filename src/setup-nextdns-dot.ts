import 'dotenv/config';
import { UnifiSSH } from './unifi/ssh.js';
import { UnifiClient } from './unifi/client.js';
import { getRouterDoTEndpoint } from './utils/nextdns.js';

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  const ssh = new UnifiSSH(
    process.env.SSH_HOST!,
    process.env.SSH_USERNAME!,
    process.env.SSH_PASSWORD!
  );

  const configId = process.env.NEXTDNS_CONFIG_ID || '6ca463';

  try {
    await unifi.connect();
    const devices = await unifi.getDevices();
    const gateway = devices.find((d: any) => d.type === 'udm' || d.type === 'ugw');

    if (!gateway) {
      console.error('No gateway found to configure');
      return;
    }

    const routerName = gateway.name || 'Dream-Machine';
    const dotEndpoint = getRouterDoTEndpoint(routerName, configId);

    console.log(`Configuring NextDNS DoT on ${routerName}...`);
    console.log(`Endpoint: ${dotEndpoint}`);

    // On UDM/UDR/UDM-Pro (UniFi OS), DNS-over-TLS is typically configured via the UI or 
    // by modifying the configuration files if using tools like nextdns-cli or manual stubby/unbound.
    // For standard UniFi, we might just be reporting what it SHOULD be, 
    // or if the user has nextdns-cli installed, we can configure it.
    
    const checkNextDNS = await ssh.execute('nextdns version').catch(() => '');
    
    if (checkNextDNS) {
      console.log('NextDNS CLI detected. Configuring...');
      await ssh.execute(`nextdns install -config ${configId} -report-client-info -setup-router`);
      console.log('✓ NextDNS CLI configured');
    } else {
      console.log('\nNextDNS CLI not found on router. Attempting installation...');
      // Official installation command for NextDNS CLI
      const installCmd = 'sh -c "$(curl -sL https://nextdns.io/install)"';
      console.log(`Running: ${installCmd}`);
      
      // We use a simplified non-interactive install if possible,
      // but usually the script requires some interaction.
      // For now, let's try to trigger it and see if it succeeds.
      try {
        await ssh.execute(`export NEXTDNS_INSTALL_AUTOMATIC=1; ${installCmd}`);
        console.log('✓ NextDNS CLI installation triggered');
        
        console.log('Configuring...');
        await ssh.execute(`nextdns install -config ${configId} -report-client-info -setup-router`);
        console.log('✓ NextDNS CLI configured');
      } catch (err: any) {
        console.error('  ✗ Installation failed:', err.message);
        console.log('\nPlease run the installation manually on the router:');
        console.log(`  ${installCmd}`);
      }
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
