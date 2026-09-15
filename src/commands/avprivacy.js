/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { PRIVATE, PUBLIC, currentMode, describePrivacy, parsePrivacy, setRoomPrivacy } from '../services/privacy.js';
import { command } from './registry.js';

command('avprivacy', {
  usage: `avprivacy <${PUBLIC}/${PRIVATE}>`,
  summary: 'lock the room so nobody can join, while still being visible',
  async run(message, args) {
    if (!args) {
      await message.reply(
        `Usage: \`avprivacy <${PUBLIC}/${PRIVATE}>\` — this room is currently ` +
          `**${currentMode(message.channel)}**.`,
      );
      return;
    }

    const parsed = parsePrivacy(args);
    if (!parsed.ok) {
      await message.reply(parsed.reason);
      return;
    }

    const result = await setRoomPrivacy(message.channel, message.author.id, parsed.mode);
    await message.reply(
      result.ok ? `${describePrivacy(result.mode)}, and saved for your next room.` : result.reason,
    );
  },
});
