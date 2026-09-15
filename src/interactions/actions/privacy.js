/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { describePrivacy, toggleRoomPrivacy } from '../../services/privacy.js';
import { onButton } from '../handlers.js';
import { reply, resolveRoom } from '../router.js';

// One press flips the room between public and private; `avprivacy` is there
// when someone wants to name the state explicitly.
onButton('privacy', async (interaction) => {
  const room = await resolveRoom(interaction);
  if (!room) return;

  const result = await toggleRoomPrivacy(room.channel, interaction.user.id);
  await reply(
    interaction,
    result.ok ? `${describePrivacy(result.mode)}, and saved for your next room.` : result.reason,
  );
});
