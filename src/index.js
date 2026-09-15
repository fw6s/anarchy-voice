/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { log } from './logger.js';
import interactionCreate from './events/interactionCreate.js';
import messageCreate from './events/messageCreate.js';
import ready from './events/ready.js';
import voiceStateUpdate from './events/voiceStateUpdate.js';
import './commands/index.js';
import './interactions/actions/index.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

for (const event of [ready, voiceStateUpdate, interactionCreate, messageCreate]) {
  const bind = (...args) => event.execute(...args);
  if (event.once) client.once(event.name, bind);
  else client.on(event.name, bind);
}

client.on('error', (error) => log.error('client error:', error));
process.on('unhandledRejection', (error) => log.error('unhandled rejection:', error));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log.info(`${signal} received, shutting down`);
    client.destroy();
    process.exit(0);
  });
}

client.login(config.token);
