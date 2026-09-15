/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { claimRoom, transferRoom } from '../../services/ownership.js';
import { deleteTempChannel } from '../../services/tempvc.js';
import { onButton, onSelect } from '../handlers.js';
import { LEVEL_ANY, LEVEL_OWNER, reply, resolveRoom } from '../router.js';
import { memberOptions, openPicker, optionPicker, runOnTargets } from './_shared.js';

onButton('claim', async (interaction) => {
  const room = await resolveRoom(interaction, LEVEL_ANY);
  if (!room) return;

  const result = await claimRoom(room.channel, room.record, interaction.user);
  await reply(
    interaction,
    result.ok ? 'You now own this room, and your saved settings have been applied.' : result.reason,
  );
});

onButton('transfer', (interaction) =>
  openPicker(interaction, LEVEL_OWNER, 'Who should take over this room?', async (room) => {
    const options = memberOptions(room.channel, { exclude: [interaction.user.id] });
    if (!options.length) {
      await reply(interaction, 'There is nobody else in the room to hand it to.');
      return null;
    }
    return optionPicker('vc:transfer:pick', 'Pick the new owner', options);
  }),
);

onSelect('transfer:pick', (interaction) =>
  runOnTargets(interaction, LEVEL_OWNER, async (room, target) => {
    const result = await transferRoom(room.channel, room.record, target);
    return result.ok
      ? { ok: true, line: `<@${target.id}> now owns this room, with their own settings applied.` }
      : result;
  }),
);

onButton('delete', async (interaction) => {
  const room = await resolveRoom(interaction, LEVEL_OWNER);
  if (!room) return;

  // Acknowledge first: the reply cannot land once the channel is gone.
  await reply(interaction, 'Deleting this room.');
  await deleteTempChannel(room.channel, `Deleted by owner ${interaction.user.id}`);
});
