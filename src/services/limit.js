/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { store } from '../db.js';
import { log } from '../logger.js';

export const LIMIT_MIN = 0;
export const LIMIT_MAX = 99;

/** Only whole numbers 0-99; 0 means "no limit" on Discord's side too. */
export function parseLimit(input) {
  const raw = String(input ?? '').trim();
  if (!/^\d{1,2}$/.test(raw)) {
    return {
      ok: false,
      reason: `Give a whole number between ${LIMIT_MIN} and ${LIMIT_MAX}. \`0\` removes the limit.`,
    };
  }
  return { ok: true, value: Number(raw) };
}

export function describeLimit(value) {
  if (value === 0) return 'Limit removed, this room is open to everyone';
  return `Limit set to **${value}** ${value === 1 ? 'member' : 'members'}`;
}

/**
 * Applies a user limit and remembers it for the owner's next room.
 * Never throws: failures come back as { ok: false }.
 */
export async function setRoomLimit(channel, ownerId, rawValue) {
  const parsed = parseLimit(rawValue);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  if (channel.userLimit === parsed.value) {
    return {
      ok: false,
      reason:
        parsed.value === 0
          ? 'This room already has no limit.'
          : `The limit is already **${parsed.value}**.`,
    };
  }

  try {
    await channel.setUserLimit(parsed.value, `Limit set by owner ${ownerId}`);
  } catch (error) {
    log.error(`limit change failed for ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that limit.' };
  }

  store.saveSettings(channel.guild.id, ownerId, { userLimit: parsed.value });
  log.info(`room ${channel.id} limit set to ${parsed.value} by ${ownerId}`);

  return { ok: true, value: parsed.value };
}
