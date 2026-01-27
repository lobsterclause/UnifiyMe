import { Client, GatewayIntentBits, Interaction, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel } from 'discord.js';
import { RestrictedManager } from './restricted-manager.js';
import { UnifiClient } from './unifi/client.js';

export class DiscordBot {
  private client: Client;
  private restrictedManager: RestrictedManager;
  private unifi: UnifiClient;

  constructor(token: string, unifi: UnifiClient, restrictedManager: RestrictedManager) {
    this.unifi = unifi;
    this.restrictedManager = restrictedManager;
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
    });

    this.client.on('interactionCreate', this.handleInteraction.bind(this));
    this.client.login(token);
  }

  private async handleInteraction(interaction: Interaction) {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'request-youtube') {
        await this.handleRequest(interaction);
      }
    } else if (interaction.isButton()) {
      if (interaction.customId === 'approve-youtube') {
        await this.handleApproval(interaction);
      } else if (interaction.customId === 'deny-youtube') {
        await this.handleDenial(interaction);
      }
    }
  }

  private async handleRequest(interaction: any) {
    const approve = new ButtonBuilder()
      .setCustomId('approve-youtube')
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success);

    const deny = new ButtonBuilder()
      .setCustomId('deny-youtube')
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(approve, deny);

    await interaction.reply({
      content: `${interaction.user.username} is requesting YouTube access!`,
      components: [row]
    });
  }

  private async handleApproval(interaction: any) {
    // Check if user is admin (optional, depends on server setup)
    await this.restrictedManager.unblockYouTube(this.unifi);
    await interaction.update({
      content: `YouTube access APPROVED by ${interaction.user.username}. YouTube is now unblocked.`,
      components: []
    });
    
    // Optional: Re-block after some time
    setTimeout(async () => {
        await this.restrictedManager.blockYouTube(this.unifi);
        // We might want to log this or notify
    }, 3600000); // 1 hour
  }

  private async handleDenial(interaction: any) {
    await interaction.update({
      content: `YouTube access DENIED by ${interaction.user.username}.`,
      components: []
    });
  }
}
