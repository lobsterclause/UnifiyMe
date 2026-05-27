import 'dotenv/config';
import { UnifiSSH } from './dist/unifi/ssh.js';

async function clearDnsCache() {
  const ssh = new UnifiSSH(
    process.env.SSH_HOST,
    process.env.SSH_USER,
    process.env.SSH_PASSWORD
  );

  try {
    console.log('Connecting to UniFi router via SSH...');
    const result = await ssh.execute('clear dns cache');
    console.log('DNS cache cleared successfully!');
    console.log('Output:', result || '(no output)');
  } catch (error) {
    console.error('Error clearing DNS cache:', error.message);
    process.exit(1);
  }
}

clearDnsCache();
