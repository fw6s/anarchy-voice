/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { renameRoom } from '../services/rename.js';
import { command } from './registry.js';

command('avname', {
  usage: 'avname <new room name>',
  summary: 'rename this room',
  async run(message, args) {
    if (!args) {
      await message.reply('Usage: `avname <new room name>`');
      return;
    }

    const result = await renameRoom(message.channel, message.author.id, args);
    await message.reply(
      result.ok
        ? `Room renamed to **${result.name}** and saved for your next room.`
        : result.reason,
    );
  },
});
