import { Client } from 'ssh2';

const conn = new Client();
const config = {
  host: '192.168.1.1',
  port: 22,
  username: 'root',
  password: 'PASSWORD_PLACEHOLDER',
  readyTimeout: 60000,
  algorithms: {
    kex: ['diffie-hellman-group1-sha1', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha1'],
    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-cbc', '3des-cbc'],
    serverHostKey: ['ssh-rsa', 'ssh-dss']
  } as any // Bypass strict algorithm typing issues
};

console.log('Connecting via ssh2...');

conn.on('ready', () => {
  console.log('Client :: ready');
  
  // Use exec instead of shell to avoid PTY allocation if possible
  conn.exec('cat /var/log/messages | grep -E "oom-killer|suricata|kernel|UBIC"', (err, stream) => {
    if (err) {
        console.error('Exec error:', err);
        return conn.end();
    }
    
    stream.on('close', (code: any, signal: any) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data: any) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data: any) => {
      console.log('STDERR: ' + data);
    });
  });
  
}).on('error', (err) => {
    console.error('Connection Error:', err);
}).connect(config);
