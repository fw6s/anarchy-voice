/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { blockUser, kickUser, trustUser, unblockUser, untrustUser } from '../../services/access.js';
import { store } from '../../db.js';
import { onButton, onSelect } from '../handlers.js';
import { LEVEL_OWNER, reply } from '../router.js';
import { memberOptions, openPicker, optionPicker, runOnTargets, userPicker } from './_shared.js';

/** Turns stored access rows into select options labelled with real names. */
async function accessOptions(client, rows) {
  return Promise.all(
    rows.slice(0, 25).map(async (row) => {
      const user = await client.users.fetch(row.target_id).catch(() => null);
      return { label: (user?.username ?? `Unknown user ${row.target_id}`).slice(0, 100), value: row.target_id };
    }),
  );
}

onButton('trust', (interaction) =>
  openPicker(
    interaction,
    LEVEL_OWNER,
    'Who should be trusted? They can join even while the room is private, and change its settings.',
    () => userPicker('vc:trust:pick', 'Pick up to 5 members to trust'),
  ),
);

onSelect('trust:pick', (interaction) =>
  runOnTargets(interaction, LEVEL_OWNER, async (room, target) => {
    const result = await trustUser(room.channel, interaction.user.id, target);
    if (!result.ok) return result;
    return {
      ok: true,
      line: `<@${target.id}> is now trusted${result.wasBlocked ? ' and no longer blocked' : ''}.`,
    };
  }),
);

onButton('untrust', (interaction) =>
  openPicker(interaction, LEVEL_OWNER, 'Whose trust should be removed?', async (room) => {
    const trusted = store.listAccessKind(room.record.guild_id, room.record.owner_id, 'trust');
    if (!trusted.length) {
      await reply(interaction, 'You have not trusted anyone yet.');
      return null;
    }
    return optionPicker(
      'vc:untrust:pick',
      'Pick who to untrust',
      await accessOptions(interaction.client, trusted),
    );
  }),
);

onSelect('untrust:pick', (interaction) =>
  runOnTargets(interaction, LEVEL_OWNER, async (room, target) => {
    const result = await untrustUser(room.channel, interaction.user.id, target);
    return result.ok ? { ok: true, line: `<@${target.id}> is no longer trusted.` } : result;
  }),
);

onButton('block', (interaction) =>
  openPicker(
    interaction,
    LEVEL_OWNER,
    'Who should be blocked? They will not see or be able to join your rooms.',
    () => userPicker('vc:block:pick', 'Pick up to 5 members to block'),
  ),
);

onSelect('block:pick', (interaction) =>
  runOnTargets(interaction, LEVEL_OWNER, async (room, target) => {
    const result = await blockUser(room.channel, interaction.user.id, target);
    if (!result.ok) return result;
    return {
      ok: true,
      line:
        `<@${target.id}> is blocked${result.wasTrusted ? ' and no longer trusted' : ''}` +
        `${result.disconnected ? ', and was disconnected' : ''}.`,
    };
  }),
);

onButton('unblock', (interaction) =>
  openPicker(interaction, LEVEL_OWNER, 'Who should be unblocked?', async (room) => {
    const blocked = store.listAccessKind(room.record.guild_id, room.record.owner_id, 'block');
    if (!blocked.length) {
      await reply(interaction, 'You have not blocked anyone.');
      return null;
    }
    return optionPicker(
      'vc:unblock:pick',
      'Pick who to unblock',
      await accessOptions(interaction.client, blocked),
    );
  }),
);

onSelect('unblock:pick', (interaction) =>
  runOnTargets(interaction, LEVEL_OWNER, async (room, target) => {
    const result = await unblockUser(room.channel, interaction.user.id, target);
    return result.ok ? { ok: true, line: `<@${target.id}> is no longer blocked.` } : result;
  }),
);

onButton('kick', (interaction) =>
  openPicker(interaction, LEVEL_OWNER, 'Who should be disconnected?', async (room) => {
    const options = memberOptions(room.channel, { exclude: [interaction.user.id] });
    if (!options.length) {
      await reply(interaction, 'There is nobody else in the room.');
      return null;
    }
    return optionPicker('vc:kick:pick', 'Pick who to disconnect', options);
  }),
);

onSelect('kick:pick', (interaction) =>
  runOnTargets(interaction, LEVEL_OWNER, async (room, target) => {
    const result = await kickUser(room.channel, interaction.user.id, target);
    return result.ok ? { ok: true, line: `<@${target.id}> was disconnected.` } : result;
  }),
);
