/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ChannelType } from 'discord.js';
import { store } from '../db.js';
import { log } from '../logger.js';
import { BUTTON_ORDER, DEFAULT_LOOK, NO_IMAGE, PANEL_IMAGE_DIR, lookOf } from '../ui/panel.js';
import { placePanel } from './setup.js';

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 1000;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };

/** "#ff0055", "ff0055" or "0xff0055". */
export function parseColor(input) {
  const hex = String(input ?? '').trim().replace(/^(#|0x)/i, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

export const formatColor = (value) => `#${value.toString(16).padStart(6, '0')}`;

const isCustomImage = (image) => Boolean(image) && image !== NO_IMAGE;

async function removeImageFile(image) {
  if (!isCustomImage(image)) return;
  await unlink(join(PANEL_IMAGE_DIR, image)).catch(() => {});
}

/** Downloads a Discord attachment into PANEL_IMAGE_DIR. Discord's own URLs expire, so the panel re-uploads it. */
export async function storeAttachmentImage(attachment, guildId, slot) {
  const ext = IMAGE_TYPES[attachment.contentType?.split(';')[0]];
  if (!ext) return { ok: false, reason: 'The image has to be a PNG, JPG, GIF or WebP.' };
  if (attachment.size > IMAGE_MAX_BYTES) return { ok: false, reason: 'The image has to be 8 MB or smaller.' };

  const response = await fetch(attachment.url).catch(() => null);
  if (!response?.ok) return { ok: false, reason: 'Could not download that image from Discord, try again.' };

  const file = `${guildId}-${slot}-${Date.now()}${ext}`;
  await mkdir(PANEL_IMAGE_DIR, { recursive: true });
  await writeFile(join(PANEL_IMAGE_DIR, file), Buffer.from(await response.arrayBuffer()));
  return { ok: true, file };
}

/**
 * Applies a new look to a slot: the live panel is updated first and the look is
 * only saved once Discord accepted it, so a failure never leaves the database
 * describing a panel that does not exist. `patch` fields set to undefined keep
 * their current value; `null` resets them to the default.
 */
export async function applyLook(guild, slot, patch) {
  const setup = store.getSetup(guild.id, slot);
  if (!setup) return { ok: false, reason: `Slot ${slot} is not set up. Run \`/setup slot:${slot}\` first.` };

  const current = lookOf(setup);
  const stored = {
    title: setup.panel_title,
    description: setup.panel_description,
    color: setup.panel_color,
    image: setup.panel_image,
    hiddenButtons: current.hiddenButtons,
  };
  const next = { ...stored };
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) next[key] = value;
  if (!next.hiddenButtons) next.hiddenButtons = [];

  const preview = {
    ...setup,
    panel_title: next.title,
    panel_description: next.description,
    panel_color: next.color,
    panel_image: next.image,
    hidden_buttons: next.hiddenButtons.join(',') || null,
  };

  const panelChannel = guild.channels.cache.get(setup.panel_channel_id);
  let panelNote = null;
  if (panelChannel?.type === ChannelType.GuildText) {
    const placed = await placePanel(guild, panelChannel, setup, preview);
    if (placed.message.id !== setup.panel_message_id) store.setPanelMessage(guild.id, slot, placed.message.id);
    panelNote = placed.reused ? 'refreshed' : 'reposted';
  } else {
    panelNote = 'missing';
  }

  store.savePanelLook(guild.id, slot, next);
  if (stored.image !== next.image) await removeImageFile(stored.image);
  log.info(`panel look for slot ${slot} in ${guild.id} updated (${Object.keys(patch).join(', ')})`);

  return { ok: true, look: lookOf(preview), panel: panelNote };
}

export const resetLook = (guild, slot) =>
  applyLook(guild, slot, { title: null, description: null, color: null, image: null, hiddenButtons: [] });

export function visibleToHidden(visible) {
  return BUTTON_ORDER.filter((action) => !visible.includes(action));
}

/**
 * Frees a slot. Its lobby, category and interface channel are left in place —
 * they may hold people or be channels the admin picked — and rooms it already
 * opened keep working until they empty out.
 */
export async function removeSetup(guild, slot) {
  const setup = store.getSetup(guild.id, slot);
  if (!setup) return { ok: false, reason: `Slot ${slot} is not set up.` };

  const channel = guild.channels.cache.get(setup.panel_channel_id);
  const message = await channel?.messages?.fetch(setup.panel_message_id).catch(() => null);
  if (message?.author.id === guild.client.user.id) await message.delete().catch(() => {});

  store.removeSetup(guild.id, slot);
  await removeImageFile(setup.panel_image);
  log.info(`slot ${slot} removed in ${guild.id}`);
  return { ok: true, setup, panelDeleted: Boolean(message) };
}

export { DEFAULT_LOOK };
