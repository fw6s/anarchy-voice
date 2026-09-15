/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { EmbedBuilder } from 'discord.js';
import { listCommands } from '../commands/registry.js';
import { store } from '../db.js';

/** The welcome card dropped into a new room's chat, addressed to its owner. */
export function buildGuideEmbed(ownerId, guildId, slot) {
  const panelChannelId = (store.getSetup(guildId, slot) ?? store.listSetups(guildId)[0])?.panel_channel_id;
  const panel = panelChannelId ? ` in <#${panelChannelId}>` : '';
  const lines = listCommands().map((c) => `\`${c.usage}\` — ${c.summary}`);

  return new EmbedBuilder().setColor(0x010101).setDescription(
    [
      '# ANARCHY Voice',
      `This room voice belongs to <@${ownerId}>.`,
      'Only they, and anyone they trust, can change its settings.',
      '',
      `Use the interface${panel}, or send these commands here:`,
      ...lines,
      '',
      'Your settings are remembered, so your next room opens the same way.',
    ].join('\n'),
  );
}

export const buildGuidePayload = (ownerId, guildId, slot) => ({
  content: `<@${ownerId}>`,
  embeds: [buildGuideEmbed(ownerId, guildId, slot)],
});
