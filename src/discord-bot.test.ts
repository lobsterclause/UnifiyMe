import { describe, it, expect, vi } from 'vitest';
import { DiscordBot } from './discord-bot.js';

vi.mock('discord.js', () => {
  const Client = vi.fn();
  Client.prototype.on = vi.fn();
  Client.prototype.login = vi.fn().mockResolvedValue('token');

  const ButtonBuilder = vi.fn();
  ButtonBuilder.prototype.setCustomId = vi.fn().mockReturnThis();
  ButtonBuilder.prototype.setLabel = vi.fn().mockReturnThis();
  ButtonBuilder.prototype.setStyle = vi.fn().mockReturnThis();

  const ActionRowBuilder = vi.fn();
  ActionRowBuilder.prototype.addComponents = vi.fn().mockReturnThis();

  return {
    Client,
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 2,
    },
    ButtonStyle: {
      Success: 1,
      Danger: 2,
    },
    ButtonBuilder,
    ActionRowBuilder,
  };
});

describe('DiscordBot', () => {
  it('should initialize and login', () => {
    const mockUnifi = {};
    const mockRestricted = {};
    const bot = new DiscordBot('token', mockUnifi as any, mockRestricted as any);
    expect(bot).toBeDefined();
  });
});
