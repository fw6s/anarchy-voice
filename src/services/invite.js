/*
 * ANARCHY Voice for Discord
 * Copyright (C) 2026 lowkeyavoidant
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

import { EmbedBuilder } from 'discord.js';
import { formatDelay } from '../format.js';
import { log } from '../logger.js';
import { isPrivate } from './privacy.js';

export const MAX_INVITES = 2;
export const WINDOW_MS = 10 * 60 * 1000;
const INVITE_MAX_AGE = 15 * 60; // seconds

// Tracked per inviter rather than per room: a spammer would otherwise just
// hop back through the lobby for a fresh room and a fresh allowance.
const history = new Map();

function recent(userId) {
  const now = Date.now();
  const times = (history.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length) history.set(userId, times);
  else history.delete(userId);
  return times;
}

export function inviteBudget(userId) {
  const times = recent(userId);
  if (times.length < MAX_INVITES) return { allowed: true, remaining: MAX_INVITES - times.length };
  return { allowed: false, retryAfterMs: WINDOW_MS - (Date.now() - times[0]) };
}

const noteInvite = (userId) => history.set(userId, [...recent(userId), Date.now()]);

function buildInviteEmbed(inviter, channel, url) {
  return new EmbedBuilder()
    .setColor(0x010101)
    .setDescription(
      [
        '# ANARCHY Voice',
        `**${inviter.displayName}** invited you to their voice room in **${channel.guild.name}**.`,
        '',
        `Room: **${channel.name}**`,
        `[Click here to join](${url})`,
      ].join('\n'),
    );
}

/**
 * DMs someone an invite to the room. Consumes one of the inviter's two slots
 * per 10 minutes, and only on an invite that actually got delivered.
 * Never throws: failures come back as { ok: false }.
 */
export async function inviteUser(channel, inviter, target) {
  if (target.id === inviter.id) return { ok: false, reason: 'You are already here.' };
  if (target.bot) return { ok: false, reason: 'Bots cannot be invited.' };
  if (channel.members.has(target.id)) {
    return { ok: false, reason: `<@${target.id}> is already in this room.` };
  }

  const budget = inviteBudget(inviter.id);
  if (!budget.allowed) {
    return {
      ok: false,
      reason:
        `You can only invite ${MAX_INVITES} people per 10 minutes. ` +
        `Try again in **${formatDelay(budget.retryAfterMs)}**.`,
    };
  }

  let url;
  try {
    const invite = await channel.createInvite({
      maxAge: INVITE_MAX_AGE,
      maxUses: 1,
      unique: true,
      reason: `Invite sent by ${inviter.id}`,
    });
    url = invite.url;
  } catch (error) {
    log.error(`could not create an invite for ${channel.id}:`, error);
    return { ok: false, reason: 'Could not create an invite for this room.' };
  }

  try {
    await target.send({ embeds: [buildInviteEmbed(inviter, channel, url)] });
  } catch {
    // 50007: the target does not accept DMs from this server.
    return { ok: false, reason: `<@${target.id}> does not accept DMs, so nothing was sent.` };
  }

  noteInvite(inviter.id);
  log.info(`${inviter.id} invited ${target.id} to ${channel.id}`);

  return { ok: true, target, locked: isPrivate(channel), remaining: inviteBudget(inviter.id).remaining };
}
