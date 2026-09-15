/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { emojis } from '../emojis.js';

const DEFAULT_IMAGE = fileURLToPath(new URL('../../assets/interface.png', import.meta.url));

/** Custom banners uploaded with /config live next to the database. */
export const PANEL_IMAGE_DIR = join(dirname(resolve(config.dbPath)), 'panels');

export const DEFAULT_LOOK = {
  title: 'ANARCHY Voice Interface',
  description: 'This interface can be used to manage temporary voice channels.',
  color: 0x010101,
};

/** panel_image: NULL = bundled banner, 'none' = no image, anything else = a file in PANEL_IMAGE_DIR. */
export const NO_IMAGE = 'none';

// The bundled banner labels all 15 buttons in exactly this order.
export const BUTTON_ORDER = [
  'name', 'limit', 'privacy', 'waiting', 'chat',
  'trust', 'untrust', 'invite', 'kick', 'region',
  'block', 'unblock', 'claim', 'transfer', 'delete',
];

export const BUTTON_LABELS = {
  name: 'Name', limit: 'Limit', privacy: 'Privacy', waiting: 'Waiting Room', chat: 'Chat',
  trust: 'Trust', untrust: 'Untrust', invite: 'Invite', kick: 'Kick', region: 'Region',
  block: 'Block', unblock: 'Unblock', claim: 'Claim', transfer: 'Transfer', delete: 'Delete',
};

export const hiddenButtonsOf = (setup) =>
  (setup?.hidden_buttons ?? '').split(',').filter((b) => BUTTON_ORDER.includes(b));

/** The effective look of a setup: its saved fields over the defaults. */
export function lookOf(setup) {
  return {
    title: setup?.panel_title ?? DEFAULT_LOOK.title,
    description: setup?.panel_description ?? DEFAULT_LOOK.description,
    color: setup?.panel_color ?? DEFAULT_LOOK.color,
    image: setup?.panel_image ?? null,
    hiddenButtons: hiddenButtonsOf(setup),
  };
}

function imageFile(look) {
  if (look.image === NO_IMAGE) return null;
  if (look.image) {
    const path = join(PANEL_IMAGE_DIR, look.image);
    // A banner deleted from disk falls back to the default instead of breaking the panel.
    if (existsSync(path)) return { path, name: `panel${extname(look.image)}` };
  }
  return { path: DEFAULT_IMAGE, name: 'interface.png' };
}

export function buildPanelRows(hidden = []) {
  const visible = BUTTON_ORDER.filter((action) => !hidden.includes(action));
  const rows = [];
  for (let i = 0; i < visible.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        visible.slice(i, i + 5).map((action) => {
          const button = new ButtonBuilder().setCustomId(`vc:${action}`).setStyle(ButtonStyle.Secondary);
          // A missing emoji (upload failed) falls back to a text label rather than a broken button.
          return emojis[action]
            ? button.setEmoji({ id: emojis[action], name: action })
            : button.setLabel(BUTTON_LABELS[action]);
        }),
      ),
    );
  }
  return rows;
}

export function buildPanelPayload(setup) {
  const look = lookOf(setup);
  const image = imageFile(look);

  const embed = new EmbedBuilder()
    .setColor(look.color)
    .setDescription(`# ${look.title}\n${look.description}`);
  if (image) embed.setImage(`attachment://${image.name}`);

  return {
    content: '',
    embeds: [embed],
    components: buildPanelRows(look.hiddenButtons),
    files: image ? [new AttachmentBuilder(image.path, { name: image.name })] : [],
  };
}
