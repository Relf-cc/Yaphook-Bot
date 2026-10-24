// /send and /edit: post YapHook messages as the bot, so they can be edited and get buttons later.
import { CAPS } from '../lib/config.js';
import { UserError, shift } from '../lib/parse.js';
import { command, messageInput, resolveChannel, success, targetMessage, warningsCard } from '../lib/ui.js';
import { isLayoutMessage, readMessageInput, toBotMessage } from '../lib/yaphook.js';

const SEND_USAGE = '`/send [#channel] <YapHook share link or JSON>`, or reply to a message with `/send [#channel]` to copy it.';

export default function setup(bot) {
  bot.command('send', 'Post a YapHook message as the bot: /send [#channel] <share link or JSON>', command(bot, async (msg) => {
    // An optional channel first.
    let [first, rest] = shift(msg.args);
    let channel = null;
    if (first && !/^(https?:|[[{`])/i.test(first)) channel = await resolveChannel(bot, msg.server_id, first);
    if (!channel) { rest = msg.args; channel = { id: msg.channel_id }; }

    const payloads = await messageInput(bot, msg, rest);
    if (!payloads) throw new UserError(`What should I send?\n${SEND_USAGE}`);
    if (payloads.length > CAPS.sendMessages) throw new UserError(`That's ${payloads.length} messages; I send up to ${CAPS.sendMessages} at a time.`);

    // Fit everything first, so a problem in message 3 doesn't leave 1 and 2 half-sent.
    const fitted = payloads.map(toBotMessage);
    const sent = [];
    for (const m of fitted) sent.push(await bot.send(channel.id, m.content, { embeds: m.embeds }));

    const warnings = [...new Set(fitted.flatMap((m) => m.warnings))];
    const where = channel.id === msg.channel_id ? 'here' : `to <#${channel.id}>`;
    const tip = '\n-# Reply to it with `/buttons add …` to add buttons, or `/edit` to change it.';
    const embeds = [success(`Sent ${sent.length === 1 ? 'the message' : `${sent.length} messages`} ${where}.${tip}`), warningsCard(warnings)].filter(Boolean);
    // Sending into this channel: no need for a confirmation unless something was changed.
    if (channel.id !== msg.channel_id || warnings.length) await msg.reply('', { embeds });
  }, { need: 'manageMessages' }));

  bot.command('edit', 'Change one of my messages: reply to it with /edit <share link or JSON>', command(bot, async (msg) => {
    const { message, rest } = await targetMessage(bot, msg, msg.args, { usage: '`/edit <share link or JSON>` while replying to one of my messages.' });
    if (message.author_id !== bot.me.id) throw new UserError("I can only edit messages I sent. Webhook messages can't be edited by anyone; post yours with `/send` to be able to edit it.");
    if (isLayoutMessage(message)) throw new UserError("That's a Components V2 message, which YapHook can't build yet.");
    const payloads = readMessageInput(rest);
    if (!payloads) throw new UserError('What should it say? Add a YapHook share link or JSON after `/edit`.');
    if (payloads.length > 1) throw new UserError('That share link has several messages; `/edit` changes one. Share just the one you want.');
    const m = toBotMessage(payloads[0]);
    await bot.edit(message.channel_id, message.id, m.content, { embeds: m.embeds.length ? m.embeds : null });
    await msg.reply('', { embeds: [success('Message edited. Its buttons are unchanged.'), warningsCard(m.warnings)].filter(Boolean) });
  }, { need: 'manageMessages' }));
}
