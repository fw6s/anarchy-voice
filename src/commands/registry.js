/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

// Chat commands typed inside a room's own text chat. Importing a command
// module registers it; see ./index.js.
export const commands = new Map();

/**
 * @param {string} name    command word without a prefix, e.g. "avlimit"
 * @param {object} spec
 * @param {string} spec.usage        shown in the room guide and on bad input
 * @param {string} spec.summary      one-line description for the room guide
 * @param {Function} spec.run        (message, args, room) => Promise<void>
 */
export function command(name, spec) {
  commands.set(name, { name, ...spec });
}

export const listCommands = () => [...commands.values()];
