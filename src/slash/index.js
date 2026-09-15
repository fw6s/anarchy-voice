/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import * as config from './config.js';
import * as setup from './setup.js';

export const slashCommands = new Map([
  [setup.data.name, setup],
  [config.data.name, config],
]);
export const slashCommandData = () => [...slashCommands.values()].map((c) => c.data.toJSON());
