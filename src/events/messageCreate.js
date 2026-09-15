/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { Events } from 'discord.js';
import { commands } from '../commands/registry.js';
import { store } from '../db.js';
import { canManage } from '../services/access.js';
import { log } from '../logger.js';

// `avname chill zone`, `!avlimit 5`, ... A leading punctuation prefix is
// tolerated so `!av…` and `.av…` work as well as the bare word.
const COMMAND = /^[!.\-/$>?]?(av[a-z0-9]+)(?:\s+([\s\S]+))?$/i;

/**
 * A command is only valid in the chat of a temp room the author is sitting in
 * and is allowed to act on. Commands marked `level: 'owner'` stay with the
 * owner; the rest are open to trusted members too.
 * Returns the room record, or null after replying.
 */
async function resolveRoom(message, command) {
  const record = store.getChannel(message.channel.id);
  if (!record) {
    await message.reply(`\`${command.name}\` only works in the chat of your own voice room.`);
    return null;
  }

  if (message.member?.voice?.channelId !== message.channel.id) {
    await message.reply(`You have to be connected to this room to use \`${command.name}\`.`);
    return null;
  }

  // Mirrors the levels in ../interactions/router.js.
  const allowed =
    command.level === 'any'
      ? true
      : command.level === 'owner'
        ? record.owner_id === message.author.id
        : canManage(record, message.author.id);

  if (!allowed) {
    await message.reply(
      command.level === 'owner'
        ? `Only <@${record.owner_id}> can do that.`
        : `Only <@${record.owner_id}> and the people they trust can manage this room.`,
    );
    return null;
  }

  return record;
}

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot || !message.inGuild()) return;

    const match = COMMAND.exec(message.content.trim());
    if (!match) return;

    // Unknown av-words are ordinary chat ("average", "available"), so stay quiet.
    const command = commands.get(match[1].toLowerCase());
    if (!command) return;

    const room = await resolveRoom(message, command);
    if (!room) return;

    try {
      await command.run(message, match[2]?.trim() ?? '', room);
    } catch (error) {
      log.error(`command "${command.name}" failed:`, error);
      await message.reply('Something went wrong running that command.').catch(() => {});
    }
  },
};
