/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { MAX_SETUPS } from '../db.js';
import { log } from '../logger.js';
import { runSetup } from '../services/setup.js';

const LABEL = { created: 'created', kept: 'already set up', selected: 'chosen by you' };

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Set up temporary voice channels for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .addIntegerOption((o) =>
    o.setName('slot')
      .setDescription(`Which setup to create or repair, 1-${MAX_SETUPS}. Left empty: 1`)
      .setMinValue(1)
      .setMaxValue(MAX_SETUPS),
  )
  .addChannelOption((o) =>
    o.setName('lobby')
      .setDescription('Voice channel people join to get their own room. Left empty: created for you')
      .addChannelTypes(ChannelType.GuildVoice),
  )
  .addChannelOption((o) =>
    o.setName('category')
      .setDescription('Category new rooms are created in. Left empty: created for you')
      .addChannelTypes(ChannelType.GuildCategory),
  )
  .addChannelOption((o) =>
    o.setName('interface')
      .setDescription('Text channel for the control panel. Left empty: created for you')
      .addChannelTypes(ChannelType.GuildText),
  );

export async function execute(interaction) {
  // default_member_permissions can be loosened per server in Integrations
  // settings; /setup spends the bot's own Manage Channels, so check again here.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'You need the **Manage Server** permission to run /setup.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let result;
  try {
    result = await runSetup(
      interaction.guild,
      interaction.options.getInteger('slot') ?? 1,
      {
        lobby: interaction.options.getChannel('lobby'),
        category: interaction.options.getChannel('category'),
        panel: interaction.options.getChannel('interface'),
      },
      interaction.user,
    );
  } catch (error) {
    log.error(`/setup failed in ${interaction.guildId}:`, error);
    await interaction.editReply('Setup failed while talking to Discord. Any channels it had just created were removed, so it is safe to run /setup again.');
    return;
  }

  if (!result.ok) {
    await interaction.editReply(
      result.missing
        ? `I am missing permissions in ${result.where}: **${result.missing.join(', ')}**.\n` +
            'Grant them to my role and run /setup again.'
        : result.reason,
    );
    return;
  }

  const { lobby, category, panelChannel, panel, report, managedCategory } = result;
  const embed = new EmbedBuilder()
    .setColor(0x010101)
    .setDescription(
      [
        `# Slot ${result.slot} ${result.firstTime ? 'is ready' : 'updated'}`,
        `**Lobby** <#${lobby.id}> — ${LABEL[report.lobby]}`,
        `**Category** <#${category.id}> — ${LABEL[report.category]}`,
        `**Interface** <#${panelChannel.id}> — ${LABEL[report.panel]}, panel ${panel.reused ? 'refreshed' : 'posted'}`,
        '',
        `Anyone who joins <#${lobby.id}> gets their own room in **${category.name}**.`,
        managedCategory
          ? 'This category belongs to the bot, so leftover empty voice channels in it are cleaned up on restart.'
          : 'This category was picked by you, so voice channels in it that are not temp rooms are always left alone.',
        '',
        `Run \`/setup slot:${result.slot}\` again to move things or repair a deleted channel, ` +
          'and `/config` to change how the panel looks.',
      ].join('\n'),
    );

  await interaction.editReply({ embeds: [embed] });
}
