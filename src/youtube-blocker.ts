import 'dotenv/config';
import { UnifiClient } from './unifi/client.js';
import { RestrictedManager } from './youtube-manager.js';
import { DiscordBot } from './discord-bot.js';
import { REST, Routes } from 'discord.js';

async function main() {
  const unifi = new UnifiClient(
    process.env.UNIFI_HOST!,
    process.env.UNIFI_USERNAME!,
    process.env.UNIFI_PASSWORD!,
    process.env.UNIFI_SITE || 'default'
  );

  try {
    console.log('Connecting to UniFi...');
    await unifi.connect();
    console.log('Connected to UniFi.');

    const restrictedManager = new RestrictedManager();
    
    // Ensure YouTube is blocked on startup
    console.log('Ensuring YouTube is blocked for Restricted...');
    await restrictedManager.blockYouTube(unifi);
    console.log('YouTube block enforced.');

    const token = process.env.DISCORD_TOKEN!;
    const clientId = process.env.DISCORD_CLIENT_ID!;

    // Register slash commands
    const commands = [
      {
        name: 'request-youtube',
        description: 'Request temporary access to YouTube for Restricted'
      }
    ];

    const rest = new REST({ version: '10' }).setToken(token);

    console.log('Registering Discord commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Discord commands registered.');

    console.log('Starting Discord Bot...');
    new DiscordBot(token, unifi, restrictedManager);
    console.log('Discord Bot is online.');

  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
