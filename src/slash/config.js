/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ActionRowBuilder,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { MAX_SETUPS, store } from '../db.js';
import { emojis } from '../emojis.js';
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  applyLook,
  formatColor,
  parseColor,
  removeSetup,
  resetLook,
  storeAttachmentImage,
  visibleToHidden,
} from '../services/panelConfig.js';
import { BUTTON_LABELS, BUTTON_ORDER, NO_IMAGE, PANEL_IMAGE_DIR, lookOf } from '../ui/panel.js';

const slotOption = (o) =>
  o.setName('slot')
    .setDescription(`Which setup, 1-${MAX_SETUPS}. Left empty: 1`)
    .setMinValue(1)
    .setMaxValue(MAX_SETUPS);

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configure the temp voice setups and their control panels')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) => sub.setName('view').setDescription('Show every setup on this server and how its panel looks'))
  .addSubcommand((sub) =>
    sub.setName('panel')
      .setDescription('Change the panel text, color or banner. No options: show the current look')
      .addIntegerOption(slotOption)
      .addStringOption((o) => o.setName('title').setDescription('Heading shown on the panel').setMaxLength(TITLE_MAX))
      .addStringOption((o) =>
        o.setName('description').setDescription('Text under the heading. Write \\n for a new line').setMaxLength(DESCRIPTION_MAX),
      )
      .addStringOption((o) => o.setName('color').setDescription('Embed color as hex, e.g. #5865F2'))
      .addAttachmentOption((o) => o.setName('image').setDescription('New banner image (PNG, JPG, GIF or WebP, up to 8 MB)'))
      .addBooleanOption((o) => o.setName('remove_image').setDescription('Show the panel without any banner'))
      .addBooleanOption((o) => o.setName('reset').setDescription('Put text, color, banner and buttons back to default')),
  )
  .addSubcommand((sub) =>
    sub.setName('buttons').setDescription('Choose which buttons appear on the panel').addIntegerOption(slotOption),
  )
  .addSubcommand((sub) =>
    sub.setName('remove')
      .setDescription('Remove a setup and its panel. Its channels stay where they are')
      .addIntegerOption((o) => slotOption(o).setRequired(true).setDescription(`Which setup to remove, 1-${MAX_SETUPS}`)),
  );

const ephemeral = { flags: MessageFlags.Ephemeral };
const canConfigure = (interaction) => interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

function describeLook(setup) {
  const look = lookOf(setup);
  const image =
    look.image === NO_IMAGE ? 'none' : look.image ? 'custom upload' : 'default banner';
  const hidden = look.hiddenButtons.length
    ? look.hiddenButtons.map((b) => BUTTON_LABELS[b]).join(', ')
    : 'none';
  return [
    `Title: **${look.title}**`,
    `Color: \`${formatColor(look.color)}\` · Banner: ${image}`,
    `Hidden buttons: ${hidden}`,
  ].join('\n');
}

const panelNote = {
  refreshed: 'The panel was updated.',
  reposted: 'The panel message was missing, so a new one was posted.',
  missing: 'The interface channel is gone, so nothing was posted. Run `/setup` for this slot to recreate it.',
};

function bannerWarning(look) {
  // The bundled banner spells out all 15 buttons in order; hiding some makes it wrong.
  if (look.image || !look.hiddenButtons.length) return '';
  return '\n⚠️ The default banner still labels all 15 buttons. Upload your own with `image`, or use `remove_image`.';
}

async function view(interaction) {
  const setups = store.listSetups(interaction.guildId);
  const embed = new EmbedBuilder().setColor(0x010101);
  const lines = [`# Temp voice setups (${setups.length}/${MAX_SETUPS})`];

  for (let slot = 1; slot <= MAX_SETUPS; slot++) {
    const setup = setups.find((s) => s.slot === slot);
    lines.push('');
    if (!setup) {
      lines.push(`**Slot ${slot}** — free. Run \`/setup slot:${slot}\` to use it.`);
      continue;
    }
    lines.push(
      `**Slot ${slot}**`,
      `Lobby <#${setup.lobby_id}> · Category <#${setup.category_id}> · Interface <#${setup.panel_channel_id}>`,
      describeLook(setup),
    );
  }

  await interaction.reply({ embeds: [embed.setDescription(lines.join('\n'))], ...ephemeral });
}

async function panel(interaction) {
  const slot = interaction.options.getInteger('slot') ?? 1;
  const setup = store.getSetup(interaction.guildId, slot);
  if (!setup) {
    await interaction.reply({ content: `Slot ${slot} is not set up. Run \`/setup slot:${slot}\` first.`, ...ephemeral });
    return;
  }

  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');
  const colorInput = interaction.options.getString('color');
  const image = interaction.options.getAttachment('image');
  const removeImage = interaction.options.getBoolean('remove_image');
  const reset = interaction.options.getBoolean('reset');

  const nothingGiven = [title, description, colorInput, image, removeImage, reset].every((v) => v === null);
  if (nothingGiven) {
    await interaction.reply({ content: `**Slot ${slot} panel**\n${describeLook(setup)}`, ...ephemeral });
    return;
  }

  if (reset && [title, description, colorInput, image, removeImage].some((v) => v !== null)) {
    await interaction.reply({ content: '`reset` cannot be combined with other changes.', ...ephemeral });
    return;
  }
  if (image && removeImage) {
    await interaction.reply({ content: 'Pick either `image` or `remove_image`, not both.', ...ephemeral });
    return;
  }

  const patch = {};
  if (title !== null) patch.title = title.trim() || null;
  if (description !== null) patch.description = description.replaceAll('\\n', '\n').trim() || null;
  if (colorInput !== null) {
    const color = parseColor(colorInput);
    if (color === null) {
      await interaction.reply({ content: `\`${colorInput}\` is not a hex color. Try something like \`#5865F2\`.`, ...ephemeral });
      return;
    }
    patch.color = color;
  }
  if (removeImage) patch.image = NO_IMAGE;

  await interaction.deferReply(ephemeral);

  let uploaded = null;
  if (image) {
    const stored = await storeAttachmentImage(image, interaction.guildId, slot);
    if (!stored.ok) {
      await interaction.editReply(stored.reason);
      return;
    }
    uploaded = stored.file;
    patch.image = stored.file;
  }

  try {
    const result = reset ? await resetLook(interaction.guild, slot) : await applyLook(interaction.guild, slot, patch);
    if (!result.ok) {
      await interaction.editReply(result.reason);
      return;
    }
    uploaded = null; // now owned by the saved look
    await interaction.editReply(
      `${reset ? 'Panel reset to default.' : 'Panel updated.'} ${panelNote[result.panel]}\n\n` +
        describeLook({ ...store.getSetup(interaction.guildId, slot) }) +
        bannerWarning(result.look),
    );
  } finally {
    // Downloaded but never saved as the look (refused or Discord failed): drop it.
    if (uploaded) await unlink(join(PANEL_IMAGE_DIR, uploaded)).catch(() => {});
  }
}

async function buttons(interaction) {
  const slot = interaction.options.getInteger('slot') ?? 1;
  const setup = store.getSetup(interaction.guildId, slot);
  if (!setup) {
    await interaction.reply({ content: `Slot ${slot} is not set up. Run \`/setup slot:${slot}\` first.`, ...ephemeral });
    return;
  }

  const hidden = lookOf(setup).hiddenButtons;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cfg:buttons:${slot}`)
    .setPlaceholder('Buttons to show on the panel')
    .setMinValues(1)
    .setMaxValues(BUTTON_ORDER.length)
    .addOptions(
      BUTTON_ORDER.map((action) => ({
        label: BUTTON_LABELS[action],
        value: action,
        ...(emojis[action] ? { emoji: { id: emojis[action], name: action } } : {}),
        default: !hidden.includes(action),
      })),
    );

  await interaction.reply({
    content: `Pick the buttons **slot ${slot}** should show. Hidden buttons keep working as \`av\` commands.`,
    components: [new ActionRowBuilder().addComponents(menu)],
    ...ephemeral,
  });
}

async function remove(interaction) {
  const slot = interaction.options.getInteger('slot');
  await interaction.deferReply(ephemeral);
  const result = await removeSetup(interaction.guild, slot);
  if (!result.ok) {
    await interaction.editReply(result.reason);
    return;
  }
  const s = result.setup;
  await interaction.editReply(
    `Slot ${slot} removed${result.panelDeleted ? ' and its panel deleted' : ''}. Joining <#${s.lobby_id}> no longer creates rooms.\n` +
      `These channels were left in place, delete them yourself if you no longer need them: ` +
      `<#${s.lobby_id}>, <#${s.category_id}>, <#${s.panel_channel_id}>.\n` +
      'Rooms that are already open keep working until they empty out.',
  );
}

const subcommands = { view, panel, buttons, remove };

export async function execute(interaction) {
  if (!canConfigure(interaction)) {
    await interaction.reply({ content: 'You need the **Manage Server** permission to use /config.', ...ephemeral });
    return;
  }
  await subcommands[interaction.options.getSubcommand()](interaction);
}

/** The select menu opened by `/config buttons`. */
export async function handleComponent(interaction) {
  const [, action, slotText] = interaction.customId.split(':');
  if (action !== 'buttons' || !interaction.isStringSelectMenu()) return;

  if (!canConfigure(interaction)) {
    await interaction.reply({ content: 'You need the **Manage Server** permission to use /config.', ...ephemeral });
    return;
  }

  await interaction.deferUpdate();
  const slot = Number(slotText);
  const result = await applyLook(interaction.guild, slot, { hiddenButtons: visibleToHidden(interaction.values) });
  const content = result.ok
    ? `Slot ${slot} now shows ${interaction.values.length} of ${BUTTON_ORDER.length} buttons. ${panelNote[result.panel]}` +
      bannerWarning(result.look)
    : result.reason;
  await interaction.editReply({ content, components: [] });
}
