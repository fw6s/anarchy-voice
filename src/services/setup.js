/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { ChannelType, OverwriteType, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { MAX_SETUPS, store } from '../db.js';
import { log } from '../logger.js';
import { buildPanelPayload } from '../ui/panel.js';

// Everything the bot does across rooms. Overwrites can only grant bits the bot
// holds itself, which is why Speak, Stream and UseVAD are here: the owner
// overwrite hands them out.
export const REQUIRED_PERMISSIONS = new PermissionsBitField([
  P.ViewChannel, P.ManageChannels, P.ManageRoles, P.MoveMembers, P.CreateInstantInvite,
  P.Connect, P.Speak, P.Stream, P.UseVAD,
  P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory,
]);

const NAMES = {
  category: 'Join to Create',
  lobby: '🔏JOIN TO CREATE',
  panel: '🔎┃interface',
};

export function missingPermissions(channelOrGuild, me) {
  const have = channelOrGuild.permissionsFor
    ? channelOrGuild.permissionsFor(me)
    : me.permissions;
  return REQUIRED_PERMISSIONS.toArray().filter((name) => !have?.has(name));
}

const alive = (guild, id, type) => {
  const channel = id ? guild.channels.cache.get(id) : null;
  return channel?.type === type ? channel : null;
};

/** Posts the panel, or edits the one already there so re-running never duplicates it. */
export async function placePanel(guild, panelChannel, previous, look = previous) {
  const payload = buildPanelPayload(look);

  if (previous?.panel_message_id) {
    const oldChannel = alive(guild, previous.panel_channel_id, ChannelType.GuildText);
    const oldMessage = await oldChannel?.messages.fetch(previous.panel_message_id).catch(() => null);

    if (oldMessage?.author.id === guild.client.user.id && oldChannel.id === panelChannel.id) {
      await oldMessage.edit({ ...payload, attachments: [] });
      return { message: oldMessage, reused: true };
    }

    const message = await panelChannel.send(payload);
    // Moving the panel: take the old copy down only once the new one is up.
    if (oldMessage?.author.id === guild.client.user.id) await oldMessage.delete().catch(() => {});
    return { message, reused: false };
  }

  const message = await panelChannel.send(payload);
  return { message, reused: false };
}

/**
 * Configures temp voice for a server. Each of lobby / category / panel channel
 * is taken from `options` when given, otherwise the one already configured is
 * reused if it still exists, otherwise a new one is created. That makes /setup
 * both the first-time installer and the repair tool.
 */
export async function runSetup(guild, slot, options, actor) {
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_SETUPS) {
    return { ok: false, reason: `Slot has to be between 1 and ${MAX_SETUPS}.` };
  }
  const created = [];
  const rollback = async () => {
    for (const channel of created.reverse()) await channel.delete('/setup did not finish').catch(() => {});
  };

  try {
    const result = await configure(guild, slot, options, actor, created);
    if (!result.ok) await rollback();
    return result;
  } catch (error) {
    await rollback();
    throw error;
  }
}

/** Channels it makes are pushed onto `created` so runSetup can undo them. */
async function configure(guild, slot, options, actor, created) {
  const me = guild.members.me;
  const previous = store.getSetup(guild.id, slot);
  const others = store.listSetups(guild.id).filter((s) => s.slot !== slot);
  const reason = `/setup slot ${slot} by ${actor.tag}`;
  const report = {};

  const guildMissing = missingPermissions(guild, me);
  if (guildMissing.length) return { ok: false, missing: guildMissing, where: 'server' };

  // Category
  let category = options.category;
  let managedCategory;
  if (category) {
    managedCategory = [previous, ...others].some(
      (s) => s?.category_id === category.id && s.managed_category,
    );
    report.category = 'selected';
  } else if ((category = alive(guild, previous?.category_id, ChannelType.GuildCategory))) {
    managedCategory = Boolean(previous.managed_category);
    report.category = 'kept';
  } else {
    category = await guild.channels.create({
      name: slot === 1 ? NAMES.category : `${NAMES.category} ${slot}`,
      type: ChannelType.GuildCategory,
      reason,
    });
    created.push(category);
    managedCategory = true;
    report.category = 'created';
  }

  const categoryMissing = missingPermissions(category, me);
  if (categoryMissing.length) {
    return { ok: false, missing: categoryMissing, where: `<#${category.id}>` };
  }

  // Lobby
  let lobby = options.lobby;
  if (lobby) {
    if (store.isTempChannel(lobby.id)) {
      return { ok: false, reason: `<#${lobby.id}> is somebody's temp room, pick a permanent voice channel.` };
    }
    const taken = others.find((s) => s.lobby_id === lobby.id);
    if (taken) {
      return { ok: false, reason: `<#${lobby.id}> is already the lobby of slot ${taken.slot}.` };
    }
    report.lobby = 'selected';
  } else if ((lobby = alive(guild, previous?.lobby_id, ChannelType.GuildVoice))) {
    report.lobby = 'kept';
  } else {
    lobby = await guild.channels.create({
      name: NAMES.lobby, type: ChannelType.GuildVoice, parent: category.id, reason,
    });
    created.push(lobby);
    report.lobby = 'created';
  }

  // Panel channel
  let panelChannel = options.panel;
  if (panelChannel) {
    report.panel = 'selected';
  } else if ((panelChannel = alive(guild, previous?.panel_channel_id, ChannelType.GuildText))) {
    report.panel = 'kept';
  } else {
    // Read-only for members: the panel is the only thing that belongs in there.
    panelChannel = await guild.channels.create({
      name: NAMES.panel,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [P.SendMessages] },
        {
          id: me.id,
          type: OverwriteType.Member,
          allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory],
        },
      ],
      reason,
    });
    created.push(panelChannel);
    report.panel = 'created';
  }

  const panelMissing = [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory]
    .map((bit) => new PermissionsBitField(bit).toArray()[0])
    .filter((name) => !panelChannel.permissionsFor(me)?.has(name));
  if (panelMissing.length) return { ok: false, missing: panelMissing, where: `<#${panelChannel.id}>` };

  const panel = await placePanel(guild, panelChannel, previous);

  store.saveSetup(guild.id, slot, {
    lobbyId: lobby.id,
    categoryId: category.id,
    panelChannelId: panelChannel.id,
    panelMessageId: panel.message.id,
    managedCategory,
  });
  log.info(
    `setup slot ${slot} in ${guild.name} (${guild.id}) by ${actor.tag}: lobby ${lobby.id}, ` +
      `category ${category.id} (managed=${managedCategory}), panel ${panel.message.id}`,
  );

  return { ok: true, slot, lobby, category, panelChannel, panel, managedCategory, report, firstTime: !previous };
}
