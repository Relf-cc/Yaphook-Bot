// /format, /id and /timestamp: the codes to paste into YapHook.
import { getChannels, getRoles } from '../lib/perms.js';
import { CUSTOM_EMOJI, UserError, isId, parseWhen, words } from '../lib/parse.js';
import { card, command, footer } from '../lib/ui.js';

const STYLES = [['t', 'Short time'], ['T', 'Long time'], ['d', 'Short date'], ['D', 'Long date'], ['f', 'Date & time'], ['F', 'Full date & time'], ['R', 'Relative']];

/**
 * Work out what each word is: a user, role or channel mention, a custom emoji, or the name of a channel or role.
 * Returns [{ kind, id, label, code }].
 */
async function resolveAll(bot, serverId, text) {
  const found = [];
  const add = (kind, id, label, code) => { if (!found.some((f) => f.code === code)) found.push({ kind, id, label, code }); };
  let rest = String(text ?? '');
  for (const m of rest.matchAll(/<@&([\w-]+)>/g)) add('Role', m[1], null, `<@&${m[1]}>`);
  for (const m of rest.matchAll(/<@!?([\w-]+)>/g)) add('User', m[1], null, `<@${m[1]}>`);
  for (const m of rest.matchAll(/<#([\w-]+)>/g)) add('Channel', m[1], null, `<#${m[1]}>`);
  for (const m of rest.matchAll(new RegExp(CUSTOM_EMOJI.source, 'g'))) add('Emoji', m[3], `:${m[2]}:`, m[0]);
  rest = rest.replace(/<[@#][!&]?[\w-]+>|<a?:[\w~-]+:[\w-]+>/g, ' ');

  const names = words(rest);
  if (names.length) {
    const [channels, roles] = await Promise.all([getChannels(bot, serverId), getRoles(bot, serverId)]);
    // Role names can have spaces, so try the whole text first.
    const whole = rest.trim().replace(/^@/, '').toLowerCase();
    const wholeRole = roles.find((r) => r.name.toLowerCase() === whole);
    if (wholeRole && names.length > 1) add('Role', wholeRole.id, wholeRole.name, `<@&${wholeRole.id}>`);
    else {
      for (const w of names) {
        const n = w.replace(/^[#@]/, '').toLowerCase();
        const ch = channels.find((c) => c.id === w || c.name.toLowerCase() === n);
        const role = roles.find((r) => r.id === w || r.name.toLowerCase() === n);
        if (ch && !w.startsWith('@')) add('Channel', ch.id, `#${ch.name}`, `<#${ch.id}>`);
        else if (role) add('Role', role.id, role.name, `<@&${role.id}>`);
        else if (isId(w)) add('User', w, null, `<@${w}>`);
        else add('?', null, w, null);
      }
    }
  }
  return found;
}

export default function setup(bot) {
  bot.command('format', 'Mention codes for YapHook: /format @someone #channel @Role :emoji:', command(bot, async (msg) => {
    if (!msg.args) throw new UserError('Give me something to format: `/format @someone #general @Moderators`.\nFor times use `/timestamp`.');
    if (/^(time|timestamp)\b/i.test(msg.args)) return timestamp(msg, msg.args.replace(/^\S+\s*/, ''));
    const found = await resolveAll(bot, msg.server_id, msg.args);
    const lines = found.map((f) => (f.code
      ? `**${f.kind}** ${f.code} → \`${f.code}\``
      : `**?** \`${f.label}\`: no channel or role called that. Mention it instead.`));
    return msg.reply('', { embeds: [footer(card('✍️ Formatting', lines.join('\n')), 'copy the code into YapHook')] });
  }));

  bot.command('id', 'Get IDs: /id @someone #channel @Role, or reply to a message for its ID', command(bot, async (msg) => {
    const e = footer(card('🆔 IDs'));
    if (msg.args) {
      const found = await resolveAll(bot, msg.server_id, msg.args);
      e.description(found.map((f) => (f.id ? `**${f.kind}** ${f.code} → \`${f.id}\`` : `**?** \`${f.label}\`: not found`)).join('\n'));
    } else {
      e.field('Server', `\`${msg.server_id}\``).field('Channel', `<#${msg.channel_id}> \`${msg.channel_id}\``).field('You', `\`${msg.author_id}\``);
      if (msg.reply_to_id) {
        const m = await bot.message(msg.channel_id, msg.reply_to_id).catch(() => null);
        e.field('Message', `\`${msg.reply_to_id}\``);
        if (m?.author_id) e.field('Message author', `<@${m.author_id}> \`${m.author_id}\``);
      }
    }
    return msg.reply('', { embeds: [e] });
  }));

  const timestamp = (msg, when) => {
    const t = parseWhen(when);
    if (t === null) throw new UserError("I can't tell when that is. Try `now`, `in 2 hours`, `3 days ago`, `2026-12-25 18:00` or a unix time.");
    const lines = STYLES.map(([s, label]) => `<t:${t}:${s}> · ${label}\n\`<t:${t}:${s}>\``);
    return msg.reply('', { embeds: [footer(card('🕒 Timestamp', `Unix time \`${t}\`. Each reader sees their own time zone.\n\n${lines.join('\n')}`), 'paste into YapHook')] });
  };
  bot.command('timestamp', 'Make <t:…> timestamps: /timestamp in 2h, /timestamp 2026-12-25 18:00', command(bot, (msg) => timestamp(msg, msg.args)));
}
