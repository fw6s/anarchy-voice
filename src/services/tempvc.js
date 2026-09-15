/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { ChannelType, OverwriteType, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { store } from '../db.js';
import { log } from '../logger.js';
import { AUTO } from './region.js';
import { buildGuidePayload } from '../ui/guide.js';
import { forgetRenames } from './rename.js';

const P = PermissionFlagsBits;

// Everything the room owner is allowed to do inside their own room.
const OWNER_ALLOW = [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD, P.MoveMembers];

const cooldowns = new Map();
const creating = new Set();

function onCooldown(userId) {
  const until = cooldowns.get(userId) ?? 0;
  if (Date.now() < until) return true;
  cooldowns.set(userId, Date.now() + config.createCooldownMs);
  return false;
}

export function renderName(member, template = config.nameTemplate) {
  const name = template
    .replaceAll('{user}', member.displayName)
    .replaceAll('{tag}', member.user.username)
    .trim();
  return (name || member.displayName).slice(0, 100);
}

/**
 * Permission overwrites for a fresh room, built from the owner's saved preferences.
 * Every entry carries an explicit `type`: without it discord.js resolves the id
 * against its user cache and throws for anyone it has not seen, which would sink
 * the whole room for owners whose trust or block list has gone cold.
 */
export function buildOverwrites(guild, ownerId, settings) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      allow: [],
      deny: [
        ...(settings?.locked ? [P.Connect] : []),
        ...(settings?.hidden ? [P.ViewChannel] : []),
      ],
    },
    { id: ownerId, type: OverwriteType.Member, allow: OWNER_ALLOW, deny: [] },
  ];

  for (const entry of store.listAccess(guild.id, ownerId)) {
    if (entry.target_id === ownerId) continue;
    overwrites.push(
      entry.kind === 'trust'
        ? {
            id: entry.target_id,
            type: OverwriteType.Member,
            allow: [P.ViewChannel, P.Connect],
            deny: [],
          }
        : {
            id: entry.target_id,
            type: OverwriteType.Member,
            allow: [],
            deny: [P.ViewChannel, P.Connect],
          },
    );
  }
  return overwrites;
}

/** `setup` is the guild_setups row whose lobby the member joined. */
export async function createTempChannel(member, setup) {
  const { guild } = member;

  if (creating.has(member.id)) return null;
  if (onCooldown(member.id)) {
    log.warn(`create skipped, ${member.user.tag} is on cooldown`);
    return null;
  }

  creating.add(member.id);
  try {
    const settings = store.getSettings(guild.id, member.id);
    const channel = await guild.channels.create({
      name: settings?.name ? settings.name.slice(0, 100) : renderName(member),
      type: ChannelType.GuildVoice,
      parent: setup.category_id,
      userLimit: settings?.user_limit ?? 0,
      rtcRegion: settings?.region && settings.region !== AUTO ? settings.region : null,
      permissionOverwrites: buildOverwrites(guild, member.id, settings),
      reason: `Temp voice channel for ${member.user.tag}`,
    });

    store.addChannel(channel.id, guild.id, member.id, setup.slot);

    // The member may have left the lobby while the channel was being created.
    if (member.voice.channelId !== setup.lobby_id) {
      await deleteTempChannel(channel, 'owner left before the move');
      return null;
    }

    await member.voice.setChannel(channel, 'Moved into their temp voice channel');
    await channel.send(buildGuidePayload(member.id, guild.id, setup.slot)).catch((error) => {
      log.warn(`could not post the guide in ${channel.id}:`, error.message);
    });
    log.info(`created "${channel.name}" (${channel.id}) for ${member.user.tag}`);
    return channel;
  } catch (error) {
    log.error(`failed to create a temp channel for ${member.user.tag}:`, error);
    return null;
  } finally {
    creating.delete(member.id);
  }
}

export async function deleteTempChannel(channel, reason = 'Temp voice channel is empty') {
  const record = store.getChannel(channel.id);
  store.removeChannel(channel.id);
  forgetRenames(channel.id);

  if (record?.waiting_room_id) {
    const waiting = channel.guild.channels.cache.get(record.waiting_room_id);
    await waiting?.delete(reason).catch(() => {});
  }

  await channel.delete(reason).catch((error) => {
    if (error.code !== 10003) log.error(`failed to delete ${channel.id}:`, error);
  });
  log.info(`deleted temp channel ${channel.id} (${reason})`);
}

export async function deleteIfEmpty(channel) {
  if (!channel || !store.isTempChannel(channel.id)) return;
  if (channel.members.size > 0) return;
  await deleteTempChannel(channel);
}

/** Drop rooms that died while the bot was offline, and adopt ones still in use. */
export async function sweepOrphans(guild) {
  for (const record of store.listChannels(guild.id)) {
    const channel = guild.channels.cache.get(record.channel_id);
    if (!channel) {
      store.removeChannel(record.channel_id);
      continue;
    }
    if (channel.members.size === 0) await deleteTempChannel(channel, 'empty after restart');
  }

  // Anything left in the category that we lost track of entirely.
  //
  // Only in categories /setup created. When an admin points /setup at an
  // existing category it can hold permanent voice channels, and this loop
  // would adopt the occupied ones as temp rooms and delete the empty ones.
  // Every slot's lobby is skipped: slot 2's lobby may sit in slot 1's category.
  const setups = store.listSetups(guild.id);
  const lobbies = new Set(setups.map((s) => s.lobby_id));
  const managed = new Set(setups.filter((s) => s.managed_category).map((s) => s.category_id));
  for (const categoryId of managed) {
    await sweepCategory(guild, categoryId, lobbies);
  }
}

async function sweepCategory(guild, categoryId, lobbies) {
  const category = guild.channels.cache.get(categoryId);
  if (!category) return;
  const slot = store.listSetups(guild.id).find((s) => s.category_id === categoryId)?.slot ?? null;
  for (const channel of category.children.cache.values()) {
    if (channel.type !== ChannelType.GuildVoice) continue;
    if (lobbies.has(channel.id)) continue;
    if (store.isTempChannel(channel.id)) continue;

    // Masih dipakai orang → ADOPSI, jangan ditinggal.
    //
    // Dulu baris ini cuma `continue`, jadi room yang kepisah dari DB (DB kehapus,
    // room dibikin manual, atau bot mati pas lagi bikin room) lepas manage
    // SELAMANYA: pemiliknya ga bisa pakai av* lagi, DAN karena voiceStateUpdate
    // cuma manggil deleteIfEmpty buat channel yang kelacak, room itu ga akan
    // pernah kehapus walau udah kosong — numpuk terus di kategori.
    if (channel.members.size > 0) {
      const ownerId = guessOwner(channel);
      if (!ownerId) {
        log.warn(`cannot adopt ${channel.id}: no owner overwrite and no members`);
        continue;
      }
      try {
        store.addChannel(channel.id, guild.id, ownerId, slot);
        log.info(`adopted untracked channel ${channel.id} (owner ${ownerId})`);
      } catch (error) {
        log.error(`failed to adopt ${channel.id}:`, error);
      }
      continue;
    }

    await channel.delete('Untracked temp voice channel left over from a previous run').catch(() => {});
    log.info(`removed untracked leftover channel ${channel.id}`);
  }
}

/**
 * Tebak pemilik room yang kelepas dari DB.
 *
 * Pemilik selalu dikasih overwrite OWNER_ALLOW yang memuat MoveMembers, sedangkan
 * user yang cuma di-trust dapetnya ViewChannel + Connect doang — jadi MoveMembers
 * itu penanda yang ga ambigu. Kalau overwrite-nya udah kehapus manual, jatuh ke
 * member yang lagi ada di dalam biar room-nya tetap kelacak (bisa di-claim ulang).
 */
function guessOwner(channel) {
  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    if (overwrite.type !== OverwriteType.Member) continue;
    if (overwrite.allow.has(P.MoveMembers)) return overwrite.id;
  }
  return channel.members.first()?.id ?? null;
}
