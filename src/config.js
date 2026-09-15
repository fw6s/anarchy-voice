/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import 'dotenv/config';

function required(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

// Per-server channels (lobby, category, panel) live in the guild_config table
// and are managed with /setup, so only process-wide settings belong here.
export const config = {
  token: required('DISCORD_TOKEN'),
  nameTemplate: process.env.VC_NAME_TEMPLATE || '{user}',
  createCooldownMs: Number(process.env.CREATE_COOLDOWN_MS ?? 5000),
  dbPath: process.env.DB_PATH || './data/anarchyvoice.db',
};
