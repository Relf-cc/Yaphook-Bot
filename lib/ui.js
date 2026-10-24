// Cards, replies and the wrapper every command runs in.
import { Embed, Button, Row } from '../yapper.js';
import { BRAND } from './config.js';
import { UserError, messageRef } from './parse.js';
import { access, NEED, getChannels, getRoles } from './perms.js';
import { cleanPayload, isLayoutMessage, readMessageInput } from './yaphook.js';

export const card = (title, description) => {
  const e = new Embed().color(BRAND.color);
  if (title) e.title(title);
  if (description) e.description(description);
  return e;
};
export const success = (text, title) => card(title || null, `✅ ${text}`).color(BRAND.success);
export const failure = (text, title) => card(title || null, `❌ ${text}`).color(BRAND.danger);
export const warning = (text) => card(null, `⚠️ ${text}`).color(BRAND.warn);
export const footer = (e, extra) => e.footer(extra ? `${BRAND.name} · ${extra}` : `${BRAND.name} · ${BRAND.site.replace(/^https?:\/\//, '')}`);

export const siteButton = (label = 'Open YapHook', url = BRAND.site) => Button.link(label, url).emoji(BRAND.emoji);
export const supportButton = () => Button.link('Support server', BRAND.server).emoji('💬');
export const linksRow = () => new Row(siteButton(), supportButton());

/** Up to 25 buttons into rows of 5. */
export const rows = (buttons) => {
  const out = [];
  for (let i = 0; i < buttons.length && out.length < 5; i += 5) out.push(new Row(buttons.slice(i, i + 5)));
  return out;
};

/** A list of warnings as one card, or nothing. */
export const warningsCard = (warnings) => (warnings?.length ? warning(warnings.join('\n')) : null);

/** What to tell people when Yapin' says no. */
export function explain(e) {
  if (e instanceof UserError) return e.message;
  const why = e?.message ? `\n-# Yapin' said: ${e.message}` : '';
  if (e?.status === 403) return `I'm not allowed to do that here. Give me a role with the right permission (Server settings → Members → ${BRAND.name} → Roles), and make sure that role is above any role I hand out.${why}`;
  if (e?.status === 404) return `I couldn't find that, or I can't see it.${why}`;
  if (e?.status === 400) return `Yapin' didn't accept that.${why}`;
  if (e?.status === 429) return `I'm being rate limited, try again in a moment.${why}`;
  return `Something went wrong on my side.${why}`;
}

/**
 * Wrap a command: checks permissions first ({ need: 'manageServer' | 'manageMessages' }),
 * and turns any error into a red card instead of silence.
 */
export function command(bot, fn, { need } = {}) {
  return async (msg) => {
    try {
      if (!msg.server_id) throw new UserError('This only works in a server.');
      if (need) {
        const a = await access(bot, msg.server_id, msg.author_id);
        if (!a[need]) throw new UserError(NEED[need]);
        msg.access = a;
      }
      await fn(msg);
    } catch (e) {
      if (!(e instanceof UserError)) console.error(`[yaphook] /${msg.command}:`, e);
      await msg.reply('', { embeds: [failure(explain(e))] }).catch(() => {});
    }
  };
}

/** The same for a button click: answers with an ephemeral red card. */
export function clicked(bot, fn, { need } = {}) {
  return async (i) => {
    try {
      if (need) {
        const a = await access(bot, i.server_id, i.user_id);
        if (!a[need]) throw new UserError(NEED[need]);
      }
      await fn(i);
    } catch (e) {
      if (!(e instanceof UserError)) console.error(`[yaphook] button ${i.custom_id}:`, e);
      await i.ephemeral('', { embeds: [failure(explain(e))] }).catch(() => {});
    }
  };
}

/**
 * The message a command points at (a reply, or a link / id first in the args), checked to be in this server.
 * Returns { message, rest }. message has `.author`.
 */
export async function targetMessage(bot, msg, args, { required = true, usage = '' } = {}) {
  const { ref, rest } = messageRef(msg, args);
  if (!ref) {
    if (!required) return { message: null, rest };
    throw new UserError(`Which message? **Reply** to it with this command, or put its link or ID first.${usage ? `\n${usage}` : ''}`);
  }
  if (ref.channelId !== msg.channel_id) {
    const ch = await bot.channel(ref.channelId);
    if (!ch || ch.server_id !== msg.server_id) throw new UserError("I can't find that message in this server.");
  }
  let message;
  try { message = await bot.message(ref.channelId, ref.messageId); } catch (e) {
    if (e.status === 404 || e.status === 403) throw new UserError("I can't find that message. Is the link right, and can I see that channel?");
    throw e;
  }
  return { message: { ...message, channel_id: message.channel_id || ref.channelId }, rest };
}

/** A text channel in this server from a <#mention>, an id or a name. */
export async function resolveChannel(bot, serverId, token, { kind = 'text' } = {}) {
  if (!token) return null;
  const channels = await getChannels(bot, serverId);
  const id = /<#([\w-]+)>/.exec(token)?.[1] || token;
  const name = token.replace(/^#/, '').toLowerCase();
  const ch = channels.find((c) => c.id === id) || channels.find((c) => c.name.toLowerCase() === name);
  if (ch && kind && (ch.type || ch.kind) !== kind) throw new UserError(`<#${ch.id}> isn't a ${kind} channel.`);
  return ch || null;
}

/** A role in this server from a <@&mention>, an id or its name (case-insensitive). */
export async function resolveRole(bot, serverId, text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const roles = await getRoles(bot, serverId);
  const id = /<@&?([\w-]+)>/.exec(t)?.[1] || t;
  const name = t.replace(/^@/, '').toLowerCase();
  return roles.find((r) => r.id === id) || roles.find((r) => r.name.toLowerCase() === name) || null;
}

/** "**Role**" for a role id, falling back to the id. */
export async function roleName(bot, serverId, roleId) {
  const r = (await getRoles(bot, serverId).catch(() => [])).find((x) => x.id === roleId);
  return r ? r.name : 'deleted role';
}

/**
 * The message(s) someone gave a command: a YapHook share link or JSON in `text`, or else the message they replied to.
 * Returns payloads, or null if there's neither.
 */
export async function messageInput(bot, msg, text) {
  const given = readMessageInput(text);
  if (given) return given;
  if (!msg.reply_to_id) return null;
  const { message } = await targetMessage(bot, msg, '');
  if (isLayoutMessage(message)) throw new UserError("That message is a Components V2 layout, which YapHook can't edit yet.");
  const p = cleanPayload(message);
  if (!p.content && !p.embeds.length) throw new UserError('That message has no text or embeds to copy.');
  return [p];
}
