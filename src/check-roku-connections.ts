import { Client } from 'ssh2';
import 'dotenv/config';

const conn = new Client();
const config = {
  host: process.env.SSH_HOST || '192.168.1.1',
  port: 22,
  username: process.env.SSH_USERNAME || 'root',
  password: process.env.SSH_PASSWORD,
  readyTimeout: 60000,
  algorithms: {
    kex: ['diffie-hellman-group1-sha1', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha1'],
    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-cbc', '3des-cbc'],
    serverHostKey: ['ssh-rsa', 'ssh-dss']
  } as any
};

const ROKU_IP = process.env.TARGET_ROKU_IP || '192.168.1.x';

console.log(`Connecting to ${config.host} via SSH to investigate Roku (${ROKU_IP})...`);

conn.on('ready', () => {
  console.log('SSH Ready.');
  
  // Check active connections for the Roku IP
  const command = `cat /proc/net/nf_conntrack | grep ${ROKU_IP} | awk '{print $1,$4,$5,$6,$7,$8,$9,$10,$11}'`;
  
  conn.exec(command, (err, stream) => {
    if (err) {
        console.error('Exec error:', err);
        return conn.end();
    }
    
    console.log('--- Active Connections for Roku ---');
    stream.on('close', (code: any, signal: any) => {
      conn.end();
    }).on('data', (data: any) => {
      process.stdout.write(data);
    }).stderr.on('data', (data: any) => {
      process.stderr.write(data);
    });
  });
  
}).on('error', (err) => {
    console.error('Connection Error:', err);
}).connect(config);
