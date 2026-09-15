/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { MessageFlags } from 'discord.js';
import { store } from '../db.js';
import { canManage } from '../services/access.js';
import { log } from '../logger.js';
import { buttons, modals, selects } from './handlers.js';

/** Room settings: the owner and everyone they trust. */
export const LEVEL_MANAGER = 'manager';
/** Access lists, ownership and deletion: the owner only. */
export const LEVEL_OWNER = 'owner';
/** Anyone sitting in the room, used by claim. */
export const LEVEL_ANY = 'any';

export const reply = (interaction, content, extra = {}) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral, ...extra });

/**
 * Resolves the room an interaction applies to: the voice channel the member is
 * sitting in, which has to be a temp room they are allowed to act on.
 * Returns null after replying when any of that does not hold.
 */
export async function resolveRoom(interaction, level = LEVEL_MANAGER) {
  const channel = interaction.member?.voice?.channel;
  if (!channel) {
    await reply(interaction, 'You need to be in a voice channel to use this.');
    return null;
  }

  const record = store.getChannel(channel.id);
  if (!record) {
    await reply(interaction, 'This only works inside a temporary voice channel.');
    return null;
  }

  const allowed =
    level === LEVEL_ANY
      ? true
      : level === LEVEL_OWNER
        ? record.owner_id === interaction.user.id
        : canManage(record, interaction.user.id);

  if (!allowed) {
    await reply(
      interaction,
      level === LEVEL_OWNER
        ? `Only <@${record.owner_id}> can do that.`
        : `Only <@${record.owner_id}> and the people they trust can manage this room.`,
    );
    return null;
  }

  return { channel, record };
}

async function dispatch(interaction, kind, key, handler) {
  if (!handler) {
    await reply(interaction, `\`${key}\` is not wired up yet.`);
    return;
  }

  try {
    await handler(interaction);
  } catch (error) {
    log.error(`${kind} handler "${key}" failed:`, error);
    const content = 'Something went wrong handling that.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await reply(interaction, content).catch(() => {});
    }
  }
}

const keyOf = (interaction) => interaction.customId.slice('vc:'.length);

export const routeButton = (i) => dispatch(i, 'button', keyOf(i), buttons.get(keyOf(i)));
export const routeModal = (i) => dispatch(i, 'modal', keyOf(i), modals.get(keyOf(i)));
export const routeSelect = (i) => dispatch(i, 'select', keyOf(i), selects.get(keyOf(i)));
