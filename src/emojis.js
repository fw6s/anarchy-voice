/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { log } from './logger.js';

const EMOJI_DIR = fileURLToPath(new URL('../assets/emojis/', import.meta.url));

// One application emoji per panel button, looked up by name.
export const EMOJI_NAMES = [
  'name', 'limit', 'privacy', 'waiting', 'chat',
  'trust', 'untrust', 'invite', 'kick', 'region',
  'block', 'unblock', 'claim', 'transfer', 'delete',
];

/** name -> emoji id for this bot's application. Filled by loadEmojis() at startup. */
export const emojis = {};

let markLoaded;
/** Resolves once loadEmojis() has run, successfully or not. */
export const emojisLoaded = new Promise((resolve) => {
  markLoaded = resolve;
});

/**
 * Finds the panel emojis on this bot's application and uploads any that are
 * missing from assets/emojis, so a fresh install needs no manual emoji setup
 * and no ids hardcoded to one particular bot.
 */
export async function loadEmojis(client) {
  try {
    const existing = await client.application.emojis.fetch();
    let uploaded = 0;

    for (const name of EMOJI_NAMES) {
      let emoji = existing.find((e) => e.name === name);
      if (!emoji) {
        const file = `${EMOJI_DIR}${name}.png`;
        if (!existsSync(file)) {
          log.warn(`emoji "${name}" is missing and ${file} does not exist; its button will show a text label`);
          continue;
        }
        try {
          emoji = await client.application.emojis.create({ attachment: file, name });
          uploaded++;
        } catch (error) {
          log.error(`could not upload emoji "${name}":`, error.message);
          continue;
        }
      }
      emojis[name] = emoji.id;
    }

    log.info(`panel emojis ready: ${Object.keys(emojis).length}/${EMOJI_NAMES.length}` +
      (uploaded ? ` (${uploaded} uploaded)` : ''));
  } catch (error) {
    log.error('could not load application emojis:', error);
  } finally {
    markLoaded();
  }
}
