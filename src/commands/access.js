/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { blockUser, kickUser, trustUser, unblockUser, untrustUser } from '../services/access.js';
import { targetCommand } from './_target.js';

targetCommand('avtrust', {
  summary: 'let someone join while private and manage the room',
  apply: (m, target) => trustUser(m.channel, m.author.id, target),
  done: (r) =>
    `<@${r.target.id}> is now trusted${r.wasBlocked ? ' and no longer blocked' : ''}. ` +
    'They can join while the room is private and change its settings.',
});

targetCommand('avuntrust', {
  summary: 'take that trust back',
  apply: (m, target) => untrustUser(m.channel, m.author.id, target),
  done: (r) => `<@${r.target.id}> is no longer trusted.`,
});

targetCommand('avblock', {
  summary: 'hide the room from someone and keep them out, saved for next time',
  apply: (m, target) => blockUser(m.channel, m.author.id, target),
  done: (r) =>
    `<@${r.target.id}> is blocked${r.wasTrusted ? ' and no longer trusted' : ''}` +
    `${r.disconnected ? ', and was disconnected' : ''}. ` +
    'They cannot see or join your rooms.',
});

targetCommand('avunblock', {
  summary: 'lift a block',
  apply: (m, target) => unblockUser(m.channel, m.author.id, target),
  done: (r) => `<@${r.target.id}> is no longer blocked.`,
});

targetCommand('avkick', {
  summary: 'disconnect someone from the room',
  apply: (m, target) => kickUser(m.channel, m.author.id, target),
  done: (r) => `<@${r.target.id}> was disconnected. They can still come back.`,
});
