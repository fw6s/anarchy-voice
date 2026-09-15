/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { PermissionFlagsBits } from 'discord.js';
import { store } from '../db.js';
import { log } from '../logger.js';

export const PUBLIC = 'public';
export const PRIVATE = 'private';

const ALIASES = new Map([
  ['public', PUBLIC], ['open', PUBLIC], ['unlock', PUBLIC], ['unlocked', PUBLIC],
  ['private', PRIVATE], ['lock', PRIVATE], ['locked', PRIVATE], ['closed', PRIVATE],
]);

export function parsePrivacy(input) {
  const mode = ALIASES.get(String(input ?? '').trim().toLowerCase());
  if (!mode) return { ok: false, reason: 'Choose either `public` or `private`.' };
  return { ok: true, mode };
}

/** Private means @everyone is denied Connect; View is left alone so the room stays visible. */
export function isPrivate(channel) {
  const everyone = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
  return Boolean(everyone?.deny.has(PermissionFlagsBits.Connect));
}

export const currentMode = (channel) => (isPrivate(channel) ? PRIVATE : PUBLIC);

export function describePrivacy(mode) {
  return mode === PRIVATE
    ? 'Room is now **private**, nobody new can join but everyone can still see it'
    : 'Room is now **public**, anyone can join again';
}

/**
 * Switches a room between public and private and remembers the choice.
 * Only the Connect bit is touched, so a hidden room stays hidden and trusted
 * members keep their explicit allow. Never throws: failures come back as
 * { ok: false }.
 */
export async function setRoomPrivacy(channel, ownerId, mode) {
  if (currentMode(channel) === mode) {
    // Confirm against the API before refusing. Reading this from cache alone
    // means a single missed update would leave the room stuck in the wrong
    // state, with every retry answered "it already is".
    await channel.fetch(true).catch(() => {});
    if (currentMode(channel) === mode) {
      return { ok: false, reason: `This room is already **${mode}**.` };
    }
  }

  try {
    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      { Connect: mode === PRIVATE ? false : null },
      { reason: `Privacy set to ${mode} by owner ${ownerId}` },
    );
  } catch (error) {
    log.error(`privacy change failed for ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that change.' };
  }

  store.saveSettings(channel.guild.id, ownerId, { locked: mode === PRIVATE });
  log.info(`room ${channel.id} set to ${mode} by ${ownerId}`);

  return { ok: true, mode };
}

/** The panel button flips whichever state the room is in right now. */
export const toggleRoomPrivacy = (channel, ownerId) =>
  setRoomPrivacy(channel, ownerId, isPrivate(channel) ? PUBLIC : PRIVATE);
