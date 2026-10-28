/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { OverwriteType, PermissionFlagsBits } from 'discord.js';
import { store } from '../db.js';
import { log } from '../logger.js';

const P = PermissionFlagsBits;

/**
 * A room mute is a member overwrite that denies Speak. It lives on the channel
 * itself, so it only applies in that room, works on people who are not in it
 * yet, and is gone together with the room. It is not saved for the owner.
 */
export const isMutedIn = (channel, userId) =>
  Boolean(channel.permissionOverwrites.cache.get(userId)?.deny.has(P.Speak));

/** Ids of everyone muted in this room. */
export const mutedIn = (channel) =>
  channel.permissionOverwrites.cache
    .filter((o) => o.type === OverwriteType.Member && o.deny.has(P.Speak))
    .map((o) => o.id);

/**
 * Carries a room's mutes into a freshly built overwrite list, so claiming or
 * transferring the room does not quietly unmute anyone. The new owner is never
 * kept muted in their own room.
 */
export function withMutes(overwrites, muted, ownerId) {
  for (const id of muted) {
    if (id === ownerId) continue;
    const entry = overwrites.find((o) => o.id === id);
    if (entry) entry.deny = [...entry.deny, P.Speak];
    else overwrites.push({ id, type: OverwriteType.Member, allow: [], deny: [P.Speak] });
  }
  return overwrites;
}

/**
 * Mutes someone in this room only. Discord checks Speak when a member connects,
 * so anyone already in the room is also server-muted until they leave it; see
 * settleLiveMute. Never throws: failures come back as { ok: false }.
 */
export async function muteUser(channel, ownerId, target) {
  if (target.id === ownerId) return { ok: false, reason: 'You cannot mute yourself.' };
  if (isMutedIn(channel, target.id)) {
    return { ok: false, reason: `<@${target.id}> is already muted in this room.` };
  }

  const reason = `Muted in room by owner ${ownerId}`;
  try {
    await channel.permissionOverwrites.edit(target, { Speak: false }, { reason });
  } catch (error) {
    log.error(`mute failed for ${target.id} in ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that change.' };
  }

  const member = channel.members.get(target.id);
  let pending = false;
  // Already server-muted by someone else: that mute is theirs, leave it alone.
  if (member && !member.voice.serverMute) {
    try {
      await member.voice.setMute(true, reason);
      store.setLiveMute(channel.guild.id, target.id, channel.id);
    } catch (error) {
      // Usually a missing Mute Members permission. The overwrite still takes
      // effect the next time they connect.
      log.warn(`could not server-mute ${target.id} in ${channel.id}:`, error.message);
      pending = true;
    }
  }

  log.info(`${target.id} muted by ${ownerId} in ${channel.id}`);
  return { ok: true, target, pending };
}

/** Lifts a room mute, and the server mute that went with it if they are still here. */
export async function unmuteUser(channel, ownerId, target) {
  if (!isMutedIn(channel, target.id)) {
    return { ok: false, reason: `<@${target.id}> is not muted in this room.` };
  }

  // Trust and block share this overwrite. Drop it only when Speak was all it
  // held; the cache is not refreshed until the gateway echoes the edit, so
  // decide from the state before it.
  const reason = `Unmuted in room by owner ${ownerId}`;
  const overwrite = channel.permissionOverwrites.cache.get(target.id);
  const onlySpeak = !overwrite.allow.bitfield && overwrite.deny.bitfield === P.Speak;
  try {
    if (onlySpeak) await overwrite.delete(reason);
    else await channel.permissionOverwrites.edit(target, { Speak: null }, { reason });
  } catch (error) {
    log.error(`unmute failed for ${target.id} in ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that change.' };
  }

  const member = channel.members.get(target.id);
  if (member && store.getLiveMute(channel.guild.id, target.id)) {
    await member.voice
      .setMute(false, reason)
      .then(() => store.clearLiveMute(channel.guild.id, target.id))
      .catch((error) => log.warn(`could not lift server mute on ${target.id}:`, error.message));
  }

  log.info(`${target.id} unmuted by ${ownerId} in ${channel.id}`);
  return { ok: true, target };
}

/**
 * A server mute the bot placed only holds while that member sits in the room
 * that muted them. Called on every voice move; Discord refuses to unmute someone
 * who is not connected, so a member who disconnected is released the next time
 * they connect anywhere.
 */
export async function settleLiveMute(state) {
  if (!state.channel) return;
  const record = store.getLiveMute(state.guild.id, state.id);
  if (!record) return;
  if (state.channelId === record.channel_id && isMutedIn(state.channel, state.id)) return;

  try {
    if (state.serverMute) await state.setMute(false, 'Left the room that muted them');
    store.clearLiveMute(state.guild.id, state.id);
  } catch (error) {
    log.warn(`could not lift server mute on ${state.id}:`, error.message);
  }
}
