import 'dotenv/config';
import { UnifiSSH } from './unifi/ssh.js';

async function main() {
  const ssh = new UnifiSSH(
    process.env.SSH_HOST!,
    process.env.SSH_USERNAME!,
    process.env.SSH_PASSWORD!
  );

  try {
    console.log('Connecting via SSH...');
    // Check if it's using iptables or nftables
    const output = await ssh.execute('which nft && nft list ruleset | head -n 20 || iptables -L -n -v | head -n 20');
    console.log('SSH Output:');
    console.log(output);
  } catch (err: any) {
    console.error('SSH Error:', err.message);
  }
}

main();
