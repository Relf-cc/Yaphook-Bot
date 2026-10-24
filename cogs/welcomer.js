// /welcomer: a hello (or goodbye) message when someone joins or leaves. For more steps, see /triggers.
import { Button, Row } from '../yapper.js';
import { BOT_LIMITS, BRAND, CAPS } from '../lib/config.js';
import { deleteLater, memberVars, refreshServer, sendTemplate } from '../lib/automation.js';
import { UserError, formatDuration, parseDuration, shift, takeOptions } from '../lib/parse.js';
import * as store from '../lib/store.js';
import { card, clicked, command, failure, footer, messageInput, resolveChannel, success, warningsCard } from '../lib/ui.js';
import { shareUrl, toBotMessage } from '../lib/yaphook.js';

const EVENTS = { join: 'join', hello: 'join', welcome: 'join', leave: 'leave', bye: 'leave', goodbye: 'leave', remove: 'leave' };
const LABEL = { join: 'Join (hello)', leave: 'Leave (goodbye)' };

export const DEFAULTS = {
  join: {
    content: '{member.mention}',
    embeds: [{
      title: '👋 Welcome to {server.name}!',
      description: "Glad you're here, **{member.display_name}**. You're member **#{server.members}**.",
      color: BRAND.color,
      thumbnail: { url: '{member.avatar_url}' },
    }],
  },
  leave: {
    content: '',
    embeds: [{ description: "**{member.name}** left {server.name}. We're {server.members} members now.", color: 0x95a5a6 }],
  },
};

const USAGE = [
  '`/welcomer set join [#channel] [share link or JSON] [delete-after=1h]`',
  '-# No message given? I use a built-in one, or **reply** to a message to copy it.',
  '`/welcomer view [join|leave]` · `/welcomer test join` · `/welcomer delete join`',
].join('\n');

const eventOf = (word) => {
  const ev = EVENTS[String(word).toLowerCase()];
  if (!ev) throw new UserError(`Join or leave? \`/welcomer set join …\` or \`/welcomer set leave …\`\n\n${USAGE}`);
  return ev;
};

/** Runs a welcomer for someone. Returns the message sent. */
async function fire(bot, serverId, event, ev) {
  const w = store.server(serverId).welcomer[event];
  if (!w) return null;
  const vars = await memberVars(bot, { ...ev, server_id: serverId });
  const sent = await sendTemplate(bot, w.channel, w.payload || DEFAULTS[event], vars);
  deleteLater(bot, w.channel, sent?.id, w.deleteAfter);
  return sent;
}

function viewCard(serverId, event) {
  const w = store.server(serverId).welcomer[event];
  if (!w) return { embeds: [card(`👋 ${LABEL[event]} welcomer`, `Not set up.\n\n${USAGE}`)] };
  const template = w.payload || DEFAULTS[event];
  const url = shareUrl([template]);
  const e = footer(card(`👋 ${LABEL[event]} welcomer`))
    .field('Channel', `<#${w.channel}>`, true)
    .field('Delete after', w.deleteAfter ? formatDuration(w.deleteAfter) : 'Never', true)
    .field('Message', w.payload ? 'Custom' : 'Built-in', true)
    .field('Set by', `<@${w.by}>`, true);
  const buttons = [Button.primary('Test', `yhw:test:${event}`).emoji('▶️'), Button.danger('Delete', `yhw:del:${event}`).emoji('🗑️')];
  if (url.length <= BOT_LIMITS.url) buttons.push(Button.link('Edit in YapHook', url).emoji(BRAND.emoji));
  else e.field('Edit in YapHook', 'Too long for a button; reply to a test message with `/restore`.');
  return { embeds: [e], components: [new Row(buttons)] };
}

export default function setup(bot) {
  bot.command('welcomer', 'Hello and goodbye messages: /welcomer set|view|test|delete join|leave', command(bot, async (msg) => {
    const [sub, rest0] = shift(msg.args);
    const welcomer = store.server(msg.server_id).welcomer;
    switch (sub.toLowerCase()) {
      case 'set': {
        const [word, rest1] = shift(rest0);
        const event = eventOf(word);
        const [opts, rest2] = takeOptions(rest1, ['delete-after', 'delete_after']);
        const after = opts['delete-after'] ?? opts.delete_after;
        const deleteAfter = after === undefined ? 0 : parseDuration(after);
        if (deleteAfter === null || deleteAfter > CAPS.maxDeleteAfter) throw new UserError('`delete-after` takes a time up to 1 day, like `delete-after=30s` or `delete-after=1h` (0 = never).');

        let [first, rest] = shift(rest2);
        let channel = first && !/^(https?:|[[{`])/i.test(first) ? await resolveChannel(bot, msg.server_id, first) : null;
        if (!channel) { rest = rest2; channel = { id: msg.channel_id }; }

        const payloads = await messageInput(bot, msg, rest);
        if (payloads?.length > 1) throw new UserError('That share link has several messages; a welcomer sends one.');
        const payload = payloads?.[0] || null;
        const { warnings } = toBotMessage(payload || DEFAULTS[event]);

        welcomer[event] = { channel: channel.id, payload, deleteAfter, by: msg.author_id, at: new Date().toISOString() };
        store.save();
        return msg.reply('', {
          embeds: [success(`The ${event} welcomer posts in <#${channel.id}>${payload ? '' : ' with the built-in message'}. Try it with \`/welcomer test ${event}\`.`), warningsCard(warnings)].filter(Boolean),
        });
      }
      case 'view': {
        const [word] = shift(rest0);
        if (!word) {
          const a = viewCard(msg.server_id, 'join');
          const b = viewCard(msg.server_id, 'leave');
          return msg.reply('', { embeds: [...a.embeds, ...b.embeds], components: [...(a.components || []), ...(b.components || [])] });
        }
        return msg.reply('', viewCard(msg.server_id, eventOf(word)));
      }
      case 'test': {
        const event = eventOf(shift(rest0)[0] || 'join');
        if (!welcomer[event]) throw new UserError(`There's no ${event} welcomer yet.\n\n${USAGE}`);
        await fire(bot, msg.server_id, event, { user_id: msg.author_id, username: msg.author?.username });
        return msg.reply('', { embeds: [success(`Sent a test to <#${welcomer[event].channel}>, as if you had ${event === 'join' ? 'joined' : 'left'}.`)] });
      }
      case 'delete':
      case 'remove': {
        const event = eventOf(shift(rest0)[0]);
        if (!welcomer[event]) throw new UserError(`There's no ${event} welcomer.`);
        delete welcomer[event];
        store.save();
        return msg.reply('', { embeds: [success(`Deleted the ${event} welcomer.`)] });
      }
      default:
        return msg.reply('', { embeds: [footer(card('👋 Welcomer', USAGE), 'see /help welcomer and /help variables')] });
    }
  }, { need: 'manageServer' }));

  bot.onButton(/^yhw:/, clicked(bot, async (i) => {
    const [, action, event] = i.custom_id.split(':');
    const welcomer = store.server(i.server_id).welcomer;
    if (!welcomer[event]) return i.update({ embeds: [failure(`There's no ${event} welcomer any more.`)], components: null });
    if (action === 'test') {
      await fire(bot, i.server_id, event, { user_id: i.user_id, username: i.username });
      return i.ephemeral('', { embeds: [success(`Sent a test to <#${welcomer[event].channel}>.`)] });
    }
    delete welcomer[event];
    store.save();
    return i.update({ embeds: [success(`Deleted the ${event} welcomer.`)], components: null });
  }, { need: 'manageServer' }));

  const on = (event) => async (ev) => {
    if (!ev.server_id) return;
    refreshServer(ev.server_id);
    try { await fire(bot, ev.server_id, event, ev); } catch (e) {
      console.warn(`[yaphook] ${event} welcomer in ${ev.server_id}: ${e.message}`);
    }
  };
  bot.on('member_join', on('join'));
  bot.on('member_leave', on('leave'));
}
