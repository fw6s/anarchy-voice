/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { deleteTempChannel } from '../services/tempvc.js';
import { claimRoom, transferRoom } from '../services/ownership.js';
import { resolveTarget } from '../services/access.js';
import { command } from './registry.js';

command('avclaim', {
  usage: 'avclaim',
  summary: 'take over the room when its owner has left',
  level: 'any',
  async run(message, args, room) {
    const result = await claimRoom(message.channel, room, message.author);
    await message.reply(
      result.ok
        ? `You now own this room, and your saved settings have been applied.`
        : result.reason,
    );
  },
});

command('avtransfer', {
  usage: 'avtransfer <user>',
  summary: 'hand the room to someone else in it',
  level: 'owner',
  async run(message, args, room) {
    if (!args) {
      await message.reply('Usage: `avtransfer <user>` — they have to be in the room.');
      return;
    }

    const target = await resolveTarget(message, args);
    if (!target) {
      await message.reply(`Could not find anyone matching \`${args}\`.`);
      return;
    }

    const result = await transferRoom(message.channel, room, target);
    await message.reply(
      result.ok
        ? `<@${target.id}> now owns this room, and their saved settings have been applied.`
        : result.reason,
    );
  },
});

command('avdelete', {
  usage: 'avdelete',
  summary: 'delete the room',
  level: 'owner',
  async run(message) {
    // No confirmation reply: the channel it would be posted in is about to go.
    await deleteTempChannel(message.channel, `Deleted by owner ${message.author.id}`);
  },
});
