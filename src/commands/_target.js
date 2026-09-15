/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { resolveTarget } from '../services/access.js';
import { command } from './registry.js';

/**
 * Most commands are "do this to that person", differing only in the verb.
 * `apply` receives (message, target, room) and returns the service result.
 */
export function targetCommand(name, { summary, level = 'owner', apply, done }) {
  command(name, {
    usage: `${name} <user>`,
    summary,
    level,
    async run(message, args, room) {
      if (!args) {
        await message.reply(`Usage: \`${name} <user>\` — mention them, or give a name or id.`);
        return;
      }

      const target = await resolveTarget(message, args);
      if (!target) {
        await message.reply(`Could not find anyone matching \`${args}\`.`);
        return;
      }

      const result = await apply(message, target, room);
      await message.reply(result.ok ? done(result) : result.reason);
    },
  });
}
