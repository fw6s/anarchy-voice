/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { currentRegion, listRegions, resolveRegion, setRoomRegion } from '../services/region.js';
import { command } from './registry.js';

command('avregion', {
  usage: 'avregion <region>',
  summary: 'pin the room to a voice region, or `auto`',
  level: 'manager',
  async run(message, args) {
    const regions = await listRegions(message.client);
    const names = regions.map((r) => `\`${r.id}\``).join(', ');

    if (!args) {
      await message.reply(
        `This room is on **${currentRegion(message.channel)}**.\n` +
          `Usage: \`avregion <region>\` — one of: ${names}`,
      );
      return;
    }

    const region = await resolveRegion(message.client, args);
    if (!region) {
      await message.reply(`No region matches \`${args}\`. Pick one of: ${names}`);
      return;
    }

    const result = await setRoomRegion(message.channel, message.author.id, region);
    await message.reply(
      result.ok
        ? `Region set to **${result.region.name}**, and saved for your next room.`
        : result.reason,
    );
  },
});
