/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { Events, MessageFlags } from 'discord.js';
import { routeButton, routeModal, routeSelect } from '../interactions/router.js';
import { emojisLoaded } from '../emojis.js';
import { log } from '../logger.js';
import { handleComponent as handleConfigComponent } from '../slash/config.js';
import { slashCommands } from '../slash/index.js';

async function runSlash(interaction) {
  const command = slashCommands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    log.error(`/${interaction.commandName} failed:`, error);
    const content = 'Something went wrong running that command.';
    const reply = interaction.deferred || interaction.replied
      ? interaction.editReply(content)
      : interaction.reply({ content, flags: MessageFlags.Ephemeral });
    await reply.catch(() => {});
  }
}

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Panels are built from the emoji ids, which are only known after startup.
    await emojisLoaded;
    if (interaction.isChatInputCommand()) return runSlash(interaction);

    if (interaction.customId?.startsWith('cfg:')) {
      try {
        await handleConfigComponent(interaction);
      } catch (error) {
        log.error(`config component ${interaction.customId} failed:`, error);
        const content = 'Something went wrong saving that.';
        const reply = interaction.deferred || interaction.replied
          ? interaction.editReply({ content, components: [] })
          : interaction.reply({ content, flags: MessageFlags.Ephemeral });
        await reply.catch(() => {});
      }
      return;
    }

    if (!interaction.customId?.startsWith('vc:')) return;
    if (interaction.isButton()) await routeButton(interaction);
    else if (interaction.isModalSubmit()) await routeModal(interaction);
    else if (interaction.isAnySelectMenu()) await routeSelect(interaction);
  },
};
