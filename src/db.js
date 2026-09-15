/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS temp_channels (
    channel_id      TEXT PRIMARY KEY,
    guild_id        TEXT NOT NULL,
    owner_id        TEXT NOT NULL,
    waiting_room_id TEXT,
    created_at      INTEGER NOT NULL
  );

  -- Room preferences remembered per owner, reapplied to every room they open.
  CREATE TABLE IF NOT EXISTS user_settings (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    name       TEXT,
    user_limit INTEGER,
    locked     INTEGER NOT NULL DEFAULT 0,
    hidden     INTEGER NOT NULL DEFAULT 0,
    region     TEXT,
    PRIMARY KEY (guild_id, user_id)
  );

  -- Up to MAX_SETUPS lobby/category/panel sets per server, written by /setup.
  -- managed_category = 1 only when /setup created the category itself, which
  -- is what makes it safe to adopt or delete untracked voice channels in it.
  -- The panel_* columns are the look set with /config; NULL means default.
  CREATE TABLE IF NOT EXISTS guild_setups (
    guild_id          TEXT NOT NULL,
    slot              INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
    lobby_id          TEXT NOT NULL UNIQUE,
    category_id       TEXT NOT NULL,
    panel_channel_id  TEXT,
    panel_message_id  TEXT,
    managed_category  INTEGER NOT NULL DEFAULT 0,
    panel_title       TEXT,
    panel_description TEXT,
    panel_color       INTEGER,
    panel_image       TEXT,
    hidden_buttons    TEXT,
    updated_at        INTEGER NOT NULL,
    PRIMARY KEY (guild_id, slot)
  );

  -- Trust / block lists follow the owner, not a single room.
  CREATE TABLE IF NOT EXISTS user_access (
    guild_id  TEXT NOT NULL,
    owner_id  TEXT NOT NULL,
    target_id TEXT NOT NULL,
    kind      TEXT NOT NULL CHECK (kind IN ('trust', 'block')),
    PRIMARY KEY (guild_id, owner_id, target_id)
  );
`);

// guild_config held a single setup per server; it becomes slot 1.
const hasTable = (name) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
const hasColumn = (table, column) =>
  db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);

db.transaction(() => {
  if (hasTable('guild_config')) {
    db.exec(`
      INSERT OR IGNORE INTO guild_setups
        (guild_id, slot, lobby_id, category_id, panel_channel_id, panel_message_id, managed_category, updated_at)
      SELECT guild_id, 1, lobby_id, category_id, panel_channel_id, panel_message_id, managed_category, updated_at
      FROM guild_config;
      DROP TABLE guild_config;
    `);
  }
  // Which setup a room came from, so its guide can point at the right panel.
  if (!hasColumn('temp_channels', 'setup_slot')) {
    db.exec('ALTER TABLE temp_channels ADD COLUMN setup_slot INTEGER');
  }
})();

export const MAX_SETUPS = 3;

const statements = {
  insertChannel: db.prepare(
    `INSERT INTO temp_channels (channel_id, guild_id, owner_id, setup_slot, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  deleteChannel: db.prepare('DELETE FROM temp_channels WHERE channel_id = ?'),
  getChannel: db.prepare('SELECT * FROM temp_channels WHERE channel_id = ?'),
  allChannels: db.prepare('SELECT * FROM temp_channels WHERE guild_id = ?'),
  setOwner: db.prepare('UPDATE temp_channels SET owner_id = ? WHERE channel_id = ?'),
  setWaitingRoom: db.prepare('UPDATE temp_channels SET waiting_room_id = ? WHERE channel_id = ?'),
  ownedChannel: db.prepare(
    'SELECT * FROM temp_channels WHERE guild_id = ? AND owner_id = ? LIMIT 1',
  ),

  getSetup: db.prepare('SELECT * FROM guild_setups WHERE guild_id = ? AND slot = ?'),
  listSetups: db.prepare('SELECT * FROM guild_setups WHERE guild_id = ? ORDER BY slot'),
  allSetups: db.prepare('SELECT * FROM guild_setups ORDER BY guild_id, slot'),
  setupByLobby: db.prepare('SELECT * FROM guild_setups WHERE lobby_id = ?'),
  removeSetup: db.prepare('DELETE FROM guild_setups WHERE guild_id = ? AND slot = ?'),
  // Location only: re-running /setup must not wipe the look set with /config.
  saveSetup: db.prepare(`
    INSERT INTO guild_setups
      (guild_id, slot, lobby_id, category_id, panel_channel_id, panel_message_id, managed_category, updated_at)
    VALUES
      (@guild_id, @slot, @lobby_id, @category_id, @panel_channel_id, @panel_message_id, @managed_category, @updated_at)
    ON CONFLICT (guild_id, slot) DO UPDATE SET
      lobby_id         = excluded.lobby_id,
      category_id      = excluded.category_id,
      panel_channel_id = excluded.panel_channel_id,
      panel_message_id = excluded.panel_message_id,
      managed_category = excluded.managed_category,
      updated_at       = excluded.updated_at
  `),
  savePanelLook: db.prepare(`
    UPDATE guild_setups SET
      panel_title       = @panel_title,
      panel_description = @panel_description,
      panel_color       = @panel_color,
      panel_image       = @panel_image,
      hidden_buttons    = @hidden_buttons,
      updated_at        = @updated_at
    WHERE guild_id = @guild_id AND slot = @slot
  `),
  setPanelMessage: db.prepare(
    'UPDATE guild_setups SET panel_message_id = ? WHERE guild_id = ? AND slot = ?',
  ),

  getSettings: db.prepare('SELECT * FROM user_settings WHERE guild_id = ? AND user_id = ?'),
  // A patch only carries the fields it wants to change; every other field is
  // passed as NULL and must keep whatever is already stored. On insert the two
  // NOT NULL flags fall back to 0, on update they fall back to the stored row.
  upsertSettings: db.prepare(`
    INSERT INTO user_settings (guild_id, user_id, name, user_limit, locked, hidden, region)
    VALUES (@guild_id, @user_id, @name, @user_limit,
            COALESCE(@locked, 0), COALESCE(@hidden, 0), @region)
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      name       = COALESCE(@name, user_settings.name),
      user_limit = COALESCE(@user_limit, user_settings.user_limit),
      locked     = COALESCE(@locked, user_settings.locked),
      hidden     = COALESCE(@hidden, user_settings.hidden),
      region     = COALESCE(@region, user_settings.region)
  `),

  listAccess: db.prepare('SELECT * FROM user_access WHERE guild_id = ? AND owner_id = ?'),
  listAccessKind: db.prepare(
    'SELECT * FROM user_access WHERE guild_id = ? AND owner_id = ? AND kind = ?',
  ),
  getAccess: db.prepare(
    'SELECT * FROM user_access WHERE guild_id = ? AND owner_id = ? AND target_id = ?',
  ),
  setAccess: db.prepare(`
    INSERT INTO user_access (guild_id, owner_id, target_id, kind) VALUES (?, ?, ?, ?)
    ON CONFLICT (guild_id, owner_id, target_id) DO UPDATE SET kind = excluded.kind
  `),
  clearAccess: db.prepare(
    'DELETE FROM user_access WHERE guild_id = ? AND owner_id = ? AND target_id = ?',
  ),
};

export const store = {
  addChannel: (channelId, guildId, ownerId, slot = null) =>
    statements.insertChannel.run(channelId, guildId, ownerId, slot, Date.now()),
  removeChannel: (channelId) => statements.deleteChannel.run(channelId),
  getChannel: (channelId) => statements.getChannel.get(channelId),
  isTempChannel: (channelId) => Boolean(statements.getChannel.get(channelId)),
  listChannels: (guildId) => statements.allChannels.all(guildId),
  setOwner: (channelId, ownerId) => statements.setOwner.run(ownerId, channelId),
  setWaitingRoom: (channelId, waitingRoomId) =>
    statements.setWaitingRoom.run(waitingRoomId, channelId),
  channelOwnedBy: (guildId, ownerId) => statements.ownedChannel.get(guildId, ownerId),

  getSetup: (guildId, slot) => statements.getSetup.get(guildId, slot) ?? null,
  listSetups: (guildId) => statements.listSetups.all(guildId),
  allSetups: () => statements.allSetups.all(),
  setupByLobby: (lobbyId) => statements.setupByLobby.get(lobbyId) ?? null,
  removeSetup: (guildId, slot) => statements.removeSetup.run(guildId, slot),
  saveSetup: (guildId, slot, cfg) =>
    statements.saveSetup.run({
      guild_id: guildId,
      slot,
      lobby_id: cfg.lobbyId,
      category_id: cfg.categoryId,
      panel_channel_id: cfg.panelChannelId ?? null,
      panel_message_id: cfg.panelMessageId ?? null,
      managed_category: Number(Boolean(cfg.managedCategory)),
      updated_at: Date.now(),
    }),
  /** Replaces the whole look: pass the full, already merged set of fields. */
  savePanelLook: (guildId, slot, look) =>
    statements.savePanelLook.run({
      guild_id: guildId,
      slot,
      panel_title: look.title ?? null,
      panel_description: look.description ?? null,
      panel_color: look.color ?? null,
      panel_image: look.image ?? null,
      hidden_buttons: look.hiddenButtons?.length ? look.hiddenButtons.join(',') : null,
      updated_at: Date.now(),
    }),
  setPanelMessage: (guildId, slot, messageId) =>
    statements.setPanelMessage.run(messageId, guildId, slot),

  getSettings: (guildId, userId) => statements.getSettings.get(guildId, userId) ?? null,
  saveSettings: (guildId, userId, patch) =>
    statements.upsertSettings.run({
      guild_id: guildId,
      user_id: userId,
      name: patch.name ?? null,
      user_limit: patch.userLimit ?? null,
      locked: patch.locked === undefined ? null : Number(patch.locked),
      hidden: patch.hidden === undefined ? null : Number(patch.hidden),
      region: patch.region ?? null,
    }),

  listAccess: (guildId, ownerId) => statements.listAccess.all(guildId, ownerId),
  listAccessKind: (guildId, ownerId, kind) =>
    statements.listAccessKind.all(guildId, ownerId, kind),
  getAccess: (guildId, ownerId, targetId) =>
    statements.getAccess.get(guildId, ownerId, targetId) ?? null,
  setAccess: (guildId, ownerId, targetId, kind) =>
    statements.setAccess.run(guildId, ownerId, targetId, kind),
  clearAccess: (guildId, ownerId, targetId) =>
    statements.clearAccess.run(guildId, ownerId, targetId),
};

export default db;
