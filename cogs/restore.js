// /restore and /json: copy any message back into the YapHook editor.
import { Button, Row } from '../yapper.js';
import { BOT_LIMITS, BRAND } from '../lib/config.js';
import { UserError } from '../lib/parse.js';
import { card, command, footer, targetMessage } from '../lib/ui.js';
import { isLayoutMessage, messageToPayload, shareUrl } from '../lib/yaphook.js';

const USAGE = '`/restore` while replying to a message, or `/restore <message link>`';

async function payloadOf(bot, msg) {
  const { message } = await targetMessage(bot, msg, msg.args, { usage: USAGE });
  if (isLayoutMessage(message)) throw new UserError("That message is a Components V2 layout, which YapHook can't edit yet. `/json` still shows its raw data.");
  const payload = messageToPayload(message);
  if (!payload.content && !payload.embeds) throw new UserError('That message has no text or embeds to restore.');
  return { message, payload };
}

/** What was left behind, so nobody is surprised. */
function leftOut(message) {
  const notes = [];
  if (message.components?.length) notes.push('buttons');
  if (message.attachment_path) notes.push('the attachment');
  return notes.length ? `-# Not included: ${notes.join(' and ')} (YapHook doesn't support them).` : '';
}

export default function setup(bot) {
  bot.command('restore', 'Open a copy of a message in YapHook. Reply to it, or give its link', command(bot, async (msg) => {
    const { message, payload } = await payloadOf(bot, msg);
    const url = shareUrl([payload]);
    const by = message.author ? ` from <@${message.author_id}>` : '';
    const summary = [
      payload.content ? `${payload.content.length} characters of content` : null,
      payload.embeds ? `${payload.embeds.length} embed${payload.embeds.length === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' and ');
    const e = footer(card('♻️ Restored message'), 'share links never expire');

    // Short links get a button; long ones go in the card as text (embed links stop at 512 characters).
    if (url.length <= BOT_LIMITS.url) {
      e.description(`A copy of the message${by}: ${summary}.\n${leftOut(message)}`.trim());
      e.field('Safe to share', '✅ YapHook links never include a webhook URL.');
      return msg.reply('', { embeds: [e], components: [new Row(Button.link('Open in YapHook', url).emoji(BRAND.emoji))] });
    }
    if (url.length <= 3800) {
      e.description(`A copy of the message${by}: ${summary}. Open this link:\n${url}\n${leftOut(message)}`.trim());
      e.field('Safe to share', '✅ YapHook links never include a webhook URL.');
      return msg.reply('', { embeds: [e] });
    }
    throw new UserError('That message is too big to fit in a link here. Use `/json` instead and paste it into **JSON** in YapHook.');
  }));

  bot.command('json', 'Show a message as YapHook JSON. Reply to it, or give its link', command(bot, async (msg) => {
    const { message } = await targetMessage(bot, msg, msg.args, { usage: '`/json` while replying to a message, or `/json <message link>`' });
    // Layout messages have no YapHook form, so show what Yapin' has.
    const data = isLayoutMessage(message) ? { flags: 32768, components: message.components } : messageToPayload(message);
    const json = JSON.stringify(data, null, 2);
    if (json.length <= 3900) {
      return msg.reply('', { embeds: [footer(card('🧾 Message JSON', `\`\`\`json\n${json}\n\`\`\``), 'paste into JSON in YapHook')] });
    }
    // Too long for one card: plain messages, split on line breaks.
    const chunks = [];
    let cur = '';
    for (const line of json.split('\n')) {
      if (cur.length + line.length + 1 > 1900) { chunks.push(cur); cur = ''; }
      cur += (cur ? '\n' : '') + line;
    }
    if (cur) chunks.push(cur);
    if (chunks.length > 4) throw new UserError('That message is too big to show here.');
    for (const [n, c] of chunks.entries()) await (n === 0 ? msg.reply(`\`\`\`json\n${c}\n\`\`\``) : msg.say(`\`\`\`json\n${c}\n\`\`\``));
  }));
}
