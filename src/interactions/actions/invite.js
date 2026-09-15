/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { MAX_INVITES, inviteUser } from '../../services/invite.js';
import { onButton, onSelect } from '../handlers.js';
import { LEVEL_MANAGER } from '../router.js';
import { openPicker, runOnTargets, userPicker } from './_shared.js';

onButton('invite', (interaction) =>
  openPicker(interaction, LEVEL_MANAGER, 'Who should get a DM invite to this room?', () =>
    userPicker('vc:invite:pick', `Pick up to ${MAX_INVITES} members to invite`, MAX_INVITES),
  ),
);

onSelect('invite:pick', (interaction) =>
  runOnTargets(interaction, LEVEL_MANAGER, async (room, target) => {
    const result = await inviteUser(room.channel, interaction.member, target);
    if (!result.ok) return result;
    return {
      ok: true,
      line:
        `Invite sent to <@${target.id}>.` +
        (result.locked ? ' The room is private, so they still need to be trusted.' : ''),
    };
  }),
);
