/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import {
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { resolveRoom } from '../router.js';

export const userPicker = (customId, placeholder, max = 5) =>
  new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(max),
  );

export const optionPicker = (customId, placeholder, options) =>
  new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(options.slice(0, 25)),
  );

/** Opens a picker as an ephemeral reply to a panel button press. */
export async function openPicker(interaction, level, content, buildRow) {
  const room = await resolveRoom(interaction, level);
  if (!room) return;

  const row = await buildRow(room, interaction);
  if (!row) return; // buildRow already answered

  await interaction.reply({ content, components: [row], flags: MessageFlags.Ephemeral });
}

/**
 * Runs an action over everyone picked, reporting one line each, then closes the
 * picker. `apply` returns the service result plus a `line` on success.
 */
export async function runOnTargets(interaction, level, apply) {
  const room = await resolveRoom(interaction, level);
  if (!room) return;

  const targets = interaction.users
    ? [...interaction.users.values()]
    : await Promise.all(interaction.values.map((id) => interaction.client.users.fetch(id)));

  const lines = [];
  for (const target of targets) {
    const result = await apply(room, target, interaction);
    lines.push(result.ok ? `✅ ${result.line}` : `⚠️ ${result.reason}`);
  }

  await interaction.update({ content: lines.join('\n'), components: [] });
}

/** Members currently in the room, as select options. */
export const memberOptions = (channel, { exclude = [] } = {}) =>
  [...channel.members.values()]
    .filter((m) => !exclude.includes(m.id))
    .map((m) => ({ label: m.displayName.slice(0, 100), value: m.id }));
