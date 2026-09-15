/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { LIMIT_MAX, LIMIT_MIN, describeLimit, setRoomLimit } from '../../services/limit.js';
import { onButton, onModal } from '../handlers.js';
import { reply, resolveRoom } from '../router.js';

const MODAL_ID = 'vc:limit:submit';
const INPUT_ID = 'room-limit';

onButton('limit', async (interaction) => {
  const room = await resolveRoom(interaction);
  if (!room) return;

  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('Set the user limit')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(INPUT_ID)
          .setLabel(`How many people? (${LIMIT_MIN}-${LIMIT_MAX})`)
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(2)
          .setValue(String(room.channel.userLimit ?? 0))
          .setPlaceholder('0 removes the limit')
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
});

onModal('limit:submit', async (interaction) => {
  const room = await resolveRoom(interaction);
  if (!room) return;

  const result = await setRoomLimit(
    room.channel,
    interaction.user.id,
    interaction.fields.getTextInputValue(INPUT_ID),
  );

  await reply(
    interaction,
    result.ok ? `${describeLimit(result.value)}, and saved for your next room.` : result.reason,
  );
});
