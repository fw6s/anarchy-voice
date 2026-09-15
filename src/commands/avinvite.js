/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { inviteUser } from '../services/invite.js';
import { targetCommand } from './_target.js';

targetCommand('avinvite', {
  summary: 'send someone a DM invite to this room',
  level: 'manager',
  apply: (m, target) => inviteUser(m.channel, m.member, target),
  done: (r) =>
    `Invite sent to <@${r.target.id}>. ${r.remaining} left for the next 10 minutes.` +
    (r.locked ? '\n⚠️ This room is private, so they still need `avtrust` to get in.' : ''),
});
