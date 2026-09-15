/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { onButton } from '../handlers.js';
import { reply } from '../router.js';

// Not built yet. They still answer, so the panel never looks broken.
for (const action of ['waiting', 'chat']) {
  onButton(action, (interaction) => reply(interaction, 'This command is currently not working.'));
}
