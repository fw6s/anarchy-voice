/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { formatDelay } from '../../format.js';
import { NAME_MAX, renameBudget, renameRoom } from '../../services/rename.js';
import { onButton, onModal } from '../handlers.js';
import { reply, resolveRoom } from '../router.js';

const MODAL_ID = 'vc:name:submit';
const INPUT_ID = 'room-name';

onButton('name', async (interaction) => {
  const room = await resolveRoom(interaction);
  if (!room) return;

  // Check the budget before opening the modal, so nobody types a name only to
  // be told afterwards that the rename cannot go through.
  const budget = renameBudget(room.channel.id);
  if (!budget.allowed) {
    await reply(
      interaction,
      `Discord only allows two renames per 10 minutes per channel. ` +
        `Try again in **${formatDelay(budget.retryAfterMs)}**.`,
    );
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('Rename your room')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(INPUT_ID)
          .setLabel('New room name')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(NAME_MAX)
          .setValue(room.channel.name)
          .setPlaceholder('e.g. chill zone')
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
});

onModal('name:submit', async (interaction) => {
  const room = await resolveRoom(interaction);
  if (!room) return;

  const result = await renameRoom(
    room.channel,
    interaction.user.id,
    interaction.fields.getTextInputValue(INPUT_ID),
  );

  await reply(
    interaction,
    result.ok
      ? `Room renamed to **${result.name}** and saved for your next room.`
      : result.reason,
  );
});
