/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { LIMIT_MAX, LIMIT_MIN, describeLimit, setRoomLimit } from '../services/limit.js';
import { command } from './registry.js';

command('avlimit', {
  usage: `avlimit <${LIMIT_MIN}-${LIMIT_MAX}>`,
  summary: 'set how many people can join, `0` removes the limit',
  async run(message, args) {
    if (!args) {
      await message.reply(
        `Usage: \`avlimit <${LIMIT_MIN}-${LIMIT_MAX}>\` — \`avlimit 0\` removes the limit.`,
      );
      return;
    }

    const result = await setRoomLimit(message.channel, message.author.id, args);
    await message.reply(
      result.ok ? `${describeLimit(result.value)}, and saved for your next room.` : result.reason,
    );
  },
});
