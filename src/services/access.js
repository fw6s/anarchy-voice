/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { store } from '../db.js';
import { log } from '../logger.js';

export const TRUST = 'trust';
export const BLOCK = 'block';

export const accessOf = (guildId, ownerId, userId) =>
  store.getAccess(guildId, ownerId, userId)?.kind ?? null;

export const isTrusted = (guildId, ownerId, userId) =>
  accessOf(guildId, ownerId, userId) === TRUST;

/**
 * Who is allowed to change a room's settings: its owner, plus anyone the owner
 * trusts. Handing over the room, its access lists and its existence stays with
 * the owner alone — see LEVEL_OWNER in ../interactions/router.js.
 */
export const canManage = (record, userId) =>
  record.owner_id === userId || isTrusted(record.guild_id, record.owner_id, userId);

/** Resolves `<user>` from a command argument: mention, raw id, or username. */
export async function resolveTarget(message, args) {
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned;

  const raw = String(args ?? '').trim();
  if (!raw) return null;

  const id = raw.match(/\d{15,25}/)?.[0];
  if (id) {
    const user = await message.client.users.fetch(id).catch(() => null);
    if (user) return user;
  }

  const found = await message.guild.members
    .fetch({ query: raw.replace(/^@/, ''), limit: 1 })
    .catch(() => null);
  return found?.first()?.user ?? null;
}

/**
 * Trusts a member: they can join the room even while it is private, and they
 * can change its settings. Trust follows the owner, so it survives into every
 * room they open next. Never throws: failures come back as { ok: false }.
 */
export async function trustUser(channel, ownerId, target) {
  const guildId = channel.guild.id;

  if (target.id === ownerId) return { ok: false, reason: 'You already own this room.' };
  if (target.bot) return { ok: false, reason: 'Bots cannot be trusted.' };
  if (accessOf(guildId, ownerId, target.id) === TRUST) {
    return { ok: false, reason: `<@${target.id}> is already trusted.` };
  }

  try {
    await channel.permissionOverwrites.edit(
      target,
      { ViewChannel: true, Connect: true },
      { reason: `Trusted by owner ${ownerId}` },
    );
  } catch (error) {
    log.error(`trust failed for ${target.id} in ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that change.' };
  }

  // setAccess upserts, so trusting someone currently blocked clears the block.
  const wasBlocked = accessOf(guildId, ownerId, target.id) === BLOCK;
  store.setAccess(guildId, ownerId, target.id, TRUST);
  log.info(`${target.id} trusted by ${ownerId} in ${channel.id}`);

  return { ok: true, target, wasBlocked };
}

/**
 * Drops someone's trust and removes the overwrite that carried it, so a private
 * room closes to them again. Never throws: failures come back as { ok: false }.
 */
export async function untrustUser(channel, ownerId, target) {
  const guildId = channel.guild.id;

  if (target.id === ownerId) return { ok: false, reason: 'You cannot untrust yourself.' };
  if (accessOf(guildId, ownerId, target.id) !== TRUST) {
    return { ok: false, reason: `<@${target.id}> is not trusted.` };
  }

  try {
    await channel.permissionOverwrites.delete(target, `Untrusted by owner ${ownerId}`);
  } catch (error) {
    log.error(`untrust failed for ${target.id} in ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that change.' };
  }

  store.clearAccess(guildId, ownerId, target.id);
  log.info(`${target.id} untrusted by ${ownerId} in ${channel.id}`);

  return { ok: true, target };
}

/**
 * Blocks a member: the room disappears for them and they cannot join. If they
 * are already inside they get disconnected, otherwise blocking someone in the
 * room would only hide it from them while they stay connected.
 * Never throws: failures come back as { ok: false }.
 */
export async function blockUser(channel, ownerId, target) {
  const guildId = channel.guild.id;

  if (target.id === ownerId) return { ok: false, reason: 'You cannot block yourself.' };
  if (accessOf(guildId, ownerId, target.id) === BLOCK) {
    return { ok: false, reason: `<@${target.id}> is already blocked.` };
  }

  try {
    await channel.permissionOverwrites.edit(
      target,
      { ViewChannel: false, Connect: false },
      { reason: `Blocked by owner ${ownerId}` },
    );
  } catch (error) {
    log.error(`block failed for ${target.id} in ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that change.' };
  }

  const wasTrusted = accessOf(guildId, ownerId, target.id) === TRUST;
  store.setAccess(guildId, ownerId, target.id, BLOCK);

  const present = channel.members.get(target.id);
  if (present) await present.voice.disconnect(`Blocked by owner ${ownerId}`).catch(() => {});

  log.info(`${target.id} blocked by ${ownerId} in ${channel.id}`);
  return { ok: true, target, wasTrusted, disconnected: Boolean(present) };
}

/** Lifts a block and drops the overwrite that enforced it. */
export async function unblockUser(channel, ownerId, target) {
  const guildId = channel.guild.id;

  if (accessOf(guildId, ownerId, target.id) !== BLOCK) {
    return { ok: false, reason: `<@${target.id}> is not blocked.` };
  }

  try {
    await channel.permissionOverwrites.delete(target, `Unblocked by owner ${ownerId}`);
  } catch (error) {
    log.error(`unblock failed for ${target.id} in ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that change.' };
  }

  store.clearAccess(guildId, ownerId, target.id);
  log.info(`${target.id} unblocked by ${ownerId} in ${channel.id}`);
  return { ok: true, target };
}

/** Disconnects someone from the room without touching their access. */
export async function kickUser(channel, ownerId, target) {
  if (target.id === ownerId) return { ok: false, reason: 'You cannot kick yourself.' };

  const member = channel.members.get(target.id);
  if (!member) return { ok: false, reason: `<@${target.id}> is not in this room.` };

  try {
    await member.voice.disconnect(`Kicked by owner ${ownerId}`);
  } catch (error) {
    log.error(`kick failed for ${target.id} in ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that change.' };
  }

  log.info(`${target.id} kicked by ${ownerId} from ${channel.id}`);
  return { ok: true, target };
}
