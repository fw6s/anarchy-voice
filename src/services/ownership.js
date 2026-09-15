/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { store } from '../db.js';
import { log } from '../logger.js';
import { renameBudget, sanitizeName } from './rename.js';
import { AUTO } from './region.js';
import { buildOverwrites } from './tempvc.js';

/**
 * Reshapes a room around whoever owns it now: their saved name, limit, region,
 * privacy and their own trust/block lists. Used by both claim and transfer, so
 * a room always reflects the person actually holding it.
 *
 * Renaming is skipped when the channel has burned its two renames per 10
 * minutes; everything else still applies rather than failing the handover.
 */
export async function applyOwnerSettings(channel, ownerId) {
  const settings = store.getSettings(channel.guild.id, ownerId);
  const applied = [];

  try {
    await channel.permissionOverwrites.set(
      buildOverwrites(channel.guild, ownerId, settings),
      `Applying settings for new owner ${ownerId}`,
    );
    applied.push('permissions');
  } catch (error) {
    log.error(`could not apply overwrites for ${ownerId} in ${channel.id}:`, error);
  }

  const edit = {};
  if (settings?.user_limit != null && settings.user_limit !== channel.userLimit) {
    edit.userLimit = settings.user_limit;
  }
  if (settings?.region && settings.region !== (channel.rtcRegion ?? AUTO)) {
    edit.rtcRegion = settings.region === AUTO ? null : settings.region;
  }
  if (Object.keys(edit).length) {
    try {
      await channel.edit({ ...edit, reason: `Applying settings for new owner ${ownerId}` });
      applied.push(...Object.keys(edit));
    } catch (error) {
      log.error(`could not apply channel settings for ${ownerId} in ${channel.id}:`, error);
    }
  }

  const wanted = settings?.name ? sanitizeName(settings.name) : null;
  if (wanted?.ok && wanted.name !== channel.name) {
    if (renameBudget(channel.id).allowed) {
      try {
        await channel.setName(wanted.name, `Applying settings for new owner ${ownerId}`);
        applied.push('name');
      } catch (error) {
        log.error(`could not rename ${channel.id} for ${ownerId}:`, error);
      }
    } else {
      applied.push('name skipped (rename limit)');
    }
  }

  return applied;
}

/** Takes over a room whose owner has left. */
export async function claimRoom(channel, record, user) {
  if (record.owner_id === user.id) return { ok: false, reason: 'You already own this room.' };
  if (channel.members.has(record.owner_id)) {
    return { ok: false, reason: `<@${record.owner_id}> is still here, so the room cannot be claimed.` };
  }

  store.setOwner(channel.id, user.id);
  const applied = await applyOwnerSettings(channel, user.id);
  log.info(`room ${channel.id} claimed by ${user.id} (was ${record.owner_id})`);

  return { ok: true, applied };
}

/** Hands a room to someone else who is currently in it. */
export async function transferRoom(channel, record, target) {
  if (target.id === record.owner_id) return { ok: false, reason: 'You already own this room.' };
  if (target.bot) return { ok: false, reason: 'Bots cannot own a room.' };
  if (!channel.members.has(target.id)) {
    return { ok: false, reason: `<@${target.id}> has to be in the room to receive it.` };
  }

  store.setOwner(channel.id, target.id);
  const applied = await applyOwnerSettings(channel, target.id);
  log.info(`room ${channel.id} transferred from ${record.owner_id} to ${target.id}`);

  return { ok: true, target, applied };
}
