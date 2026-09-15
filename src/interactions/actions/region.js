/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { currentRegion, listRegions, setRoomRegion } from '../../services/region.js';
import { onButton, onSelect } from '../handlers.js';
import { LEVEL_MANAGER, reply, resolveRoom } from '../router.js';
import { openPicker, optionPicker } from './_shared.js';

onButton('region', (interaction) =>
  openPicker(interaction, LEVEL_MANAGER, 'Which voice region should this room use?', async (room) => {
    const regions = await listRegions(interaction.client);
    const active = currentRegion(room.channel);
    return optionPicker(
      'vc:region:pick',
      'Pick a region',
      regions.map((r) => ({
        label: r.name,
        value: r.id,
        description: r.id === active ? 'Currently in use' : undefined,
        default: r.id === active,
      })),
    );
  }),
);

onSelect('region:pick', async (interaction) => {
  const room = await resolveRoom(interaction, LEVEL_MANAGER);
  if (!room) return;

  const picked = interaction.values[0];
  const regions = await listRegions(interaction.client);
  const region = regions.find((r) => r.id === picked);
  if (!region) {
    await reply(interaction, 'That region is no longer available.');
    return;
  }

  const result = await setRoomRegion(room.channel, interaction.user.id, region);
  await interaction.update({
    content: result.ok
      ? `Region set to **${result.region.name}**, and saved for your next room.`
      : result.reason,
    components: [],
  });
});
