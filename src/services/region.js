/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { store } from '../db.js';
import { log } from '../logger.js';

export const AUTO = 'auto';
const AUTO_OPTION = { id: AUTO, name: 'Automatic' };

let cache = null;

/** Voice regions Discord currently offers, with Automatic first. */
export async function listRegions(client) {
  if (cache) return cache;
  const regions = await client.fetchVoiceRegions().catch(() => null);
  const usable = regions
    ? [...regions.values()]
        .filter((r) => !r.deprecated && !r.custom)
        .map((r) => ({ id: r.id, name: r.name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  cache = [AUTO_OPTION, ...usable];
  return cache;
}

/** Accepts a region id or its display name, case-insensitively. */
export async function resolveRegion(client, input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;
  const regions = await listRegions(client);
  return (
    regions.find((r) => r.id.toLowerCase() === raw) ??
    regions.find((r) => r.name.toLowerCase() === raw) ??
    regions.find((r) => r.name.toLowerCase().startsWith(raw)) ??
    null
  );
}

export const currentRegion = (channel) => channel.rtcRegion ?? AUTO;

/**
 * Pins the room to a voice region, or back to Automatic, and remembers it.
 * Never throws: failures come back as { ok: false }.
 */
export async function setRoomRegion(channel, ownerId, region) {
  if (currentRegion(channel) === region.id) {
    return { ok: false, reason: `This room is already on **${region.name}**.` };
  }

  try {
    await channel.setRTCRegion(region.id === AUTO ? null : region.id, `Region set by ${ownerId}`);
  } catch (error) {
    log.error(`region change failed for ${channel.id}:`, error);
    return { ok: false, reason: 'Discord rejected that region.' };
  }

  store.saveSettings(channel.guild.id, ownerId, { region: region.id });
  log.info(`room ${channel.id} region set to ${region.id} by ${ownerId}`);

  return { ok: true, region };
}
