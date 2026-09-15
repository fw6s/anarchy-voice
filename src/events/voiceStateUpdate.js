/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { Events } from 'discord.js';
import { store } from '../db.js';
import { createTempChannel, deleteIfEmpty } from '../services/tempvc.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const left = oldState.channel;
    const joined = newState.channel;
    if (left?.id === joined?.id) return;

    // Someone dropped into the lobby: give them a room of their own.
    const setup = joined && newState.member ? store.setupByLobby(joined.id) : null;
    if (setup) {
      await createTempChannel(newState.member, setup);
    }

    // Whatever they left may now be an empty temp room.
    if (left && store.isTempChannel(left.id)) {
      await deleteIfEmpty(left);
    }
  },
};
