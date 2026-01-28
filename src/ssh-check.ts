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
    const output = await ssh.execute('uptime; ps w | grep unifi');
    console.log('SSH Output:');
    console.log(output);
  } catch (err: any) {
    console.error('SSH Error:', err.message);
  }
}

main();
