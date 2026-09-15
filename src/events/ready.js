/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { Events } from 'discord.js';
import { store } from '../db.js';
import { loadEmojis } from '../emojis.js';
import { log } from '../logger.js';
import { sweepOrphans } from '../services/tempvc.js';
import { slashCommandData } from '../slash/index.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    log.info(`logged in as ${client.user.tag}, in ${client.guilds.cache.size} server(s)`);
    await loadEmojis(client);

    try {
      await client.application.commands.set(slashCommandData());
      log.info('slash commands registered');
    } catch (error) {
      log.error('could not register slash commands:', error);
    }

    // Map.groupBy only exists from Node 21; this bot runs on 20.
    const byGuild = new Map();
    for (const setup of store.allSetups()) {
      byGuild.set(setup.guild_id, [...(byGuild.get(setup.guild_id) ?? []), setup]);
    }
    for (const [guildId, setups] of byGuild) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        log.warn(`configured server ${guildId} is not reachable, skipping`);
        continue;
      }
      try {
        await guild.channels.fetch();
        await sweepOrphans(guild);
        log.info(`watching ${setups.length} lobby(s) in ${guild.name}: slot ${setups.map((s) => s.slot).join(', ')}`);
      } catch (error) {
        log.error(`startup sweep failed in ${guild.name}:`, error);
      }
    }

    const unconfigured = client.guilds.cache.filter((g) => !byGuild.has(g.id));
    if (unconfigured.size) {
      log.info(`not set up yet: ${unconfigured.map((g) => g.name).join(', ')} (run /setup there)`);
    }
  },
};
