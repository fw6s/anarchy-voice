/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { store } from '../db.js';
import { formatDelay } from '../format.js';
import { log } from '../logger.js';

export const NAME_MIN = 1;
export const NAME_MAX = 100;

// Discord allows 2 channel renames per 10 minutes. Going over does not throw —
// the request just parks until the window clears, which would stall the
// interaction past its 3 second ack window. Track the budget ourselves instead.
const MAX_RENAMES = 2;
const WINDOW_MS = 10 * 60 * 1000;
const history = new Map();

function recent(channelId) {
  const now = Date.now();
  const times = (history.get(channelId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length) history.set(channelId, times);
  else history.delete(channelId);
  return times;
}

export function renameBudget(channelId) {
  const times = recent(channelId);
  if (times.length < MAX_RENAMES) return { allowed: true, remaining: MAX_RENAMES - times.length };
  return { allowed: false, retryAfterMs: WINDOW_MS - (Date.now() - times[0]) };
}

export function forgetRenames(channelId) {
  history.delete(channelId);
}

export function sanitizeName(input) {
  const name = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < NAME_MIN) return { ok: false, reason: 'The name cannot be empty.' };
  if (name.length > NAME_MAX) {
    return { ok: false, reason: `The name has to be ${NAME_MAX} characters or fewer.` };
  }
  return { ok: true, name };
}

/**
 * Renames a temp room and remembers the name, so the owner's next room opens
 * with it already applied. Never throws: failures come back as { ok: false }.
 */
export async function renameRoom(channel, ownerId, rawName) {
  const parsed = sanitizeName(rawName);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  if (parsed.name === channel.name) {
    return { ok: false, reason: 'That is already the name of this room.' };
  }

  const budget = renameBudget(channel.id);
  if (!budget.allowed) {
    return {
      ok: false,
      reason:
        `Discord only allows two renames per 10 minutes per channel. ` +
        `Try again in **${formatDelay(budget.retryAfterMs)}**.`,
    };
  }

  try {
    await channel.setName(parsed.name, `Renamed by owner ${ownerId}`);
  } catch (error) {
    log.error(`rename failed for ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that name.' };
  }

  history.set(channel.id, [...recent(channel.id), Date.now()]);
  store.saveSettings(channel.guild.id, ownerId, { name: parsed.name });
  log.info(`room ${channel.id} renamed to "${parsed.name}" by ${ownerId}`);

  return { ok: true, name: parsed.name, remaining: renameBudget(channel.id).remaining ?? 0 };
}
