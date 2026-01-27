import { Client } from 'ssh2';

export class UnifiSSH {
  private config: any;

  constructor(host: string, username: string, password: string) {
    this.config = {
      host,
      port: 22,
      username,
      password,
      readyTimeout: 60000,
      algorithms: {
        kex: ['diffie-hellman-group1-sha1', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha1'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-cbc', '3des-cbc'],
        serverHostKey: ['ssh-rsa', 'ssh-dss']
      } as any
    };
  }

  async execute(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          let output = '';
          let stderr = '';

          stream.on('close', (code: number) => {
            conn.end();
            if (code !== 0 && !output) {
              reject(new Error(`Command failed with code ${code}: ${stderr}`));
            } else {
              resolve(output);
            }
          }).on('data', (data: Buffer) => {
            output += data.toString();
          }).stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
        });
      }).on('error', (err) => {
        reject(err);
      }).connect(this.config);
    });
  }
}
