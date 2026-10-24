// /buttons: role, message and link buttons on the bot's own messages (Discohook's button flows, Yapin' style).
import { Button } from '../yapper.js';
import { BOT_LIMITS, CAPS } from '../lib/config.js';
import { memberVars } from '../lib/automation.js';
import { UserError, shift, takeOptions } from '../lib/parse.js';
import * as store from '../lib/store.js';
import { card, clicked, command, failure, footer, resolveRole, roleName, rows, success, targetMessage, warningsCard } from '../lib/ui.js';
import { applyVars, isLayoutMessage, readMessageInput, toBotMessage } from '../lib/yaphook.js';

const STYLES = {
  primary: 'primary', blurple: 'primary', blue: 'primary',
  secondary: 'secondary', grey: 'secondary', gray: 'secondary',
  success: 'success', green: 'success',
  danger: 'danger', red: 'danger',
};
const TYPES = {
  role: 'toggles',
  'role-add': 'gives',
  'role-remove': 'takes away',
  message: 'shows a private message',
  link: 'opens a link',
};
const USAGE = [
  '**Reply** to one of my messages with:',
  '`/buttons add role @Role` · `role-add @Role` · `role-remove @Role`',
  '`/buttons add message <share link>` · `/buttons add link https://…`',
  'Options at the end: `label="Get pinged" style=green emoji=🔔`',
  '`/buttons list` · `/buttons remove <number>` · `/buttons clear`',
].join('\n');

const newId = () => Math.random().toString(36).slice(2, 10);

/** Every button on a message, in reading order, with where it sits. */
const flatten = (components) => (components || []).flatMap((row, r) => (row.components || []).map((b, c) => ({ b, r, c })));

/** The message, checked to be one of ours with plain button rows. */
async function ownMessage(bot, msg, args) {
  const { message, rest } = await targetMessage(bot, msg, args, { usage: USAGE });
  if (message.author_id !== bot.me.id) {
    throw new UserError("I can only put buttons on messages I sent. Post your YapHook message with `/send` first, then reply to it with `/buttons add …`.\n-# Nobody can add buttons to webhook messages on Yapin'.");
  }
  if (isLayoutMessage(message)) throw new UserError("That's a Components V2 message; I can only add buttons to regular messages.");
  return { message, rest };
}

async function describe(bot, serverId, b) {
  if (b.style === 'link' || b.url) return `opens ${b.url}`;
  const entry = store.buttons()[String(b.custom_id).replace(/^yh:/, '')];
  if (!entry) return 'not managed by me';
  if (entry.action === 'message') return TYPES.message;
  return `${TYPES[entry.action]} **${await roleName(bot, serverId, entry.role)}**`;
}

async function listCard(bot, serverId, message) {
  const all = flatten(message.components);
  const lines = await Promise.all(all.map(async ({ b }, n) => `\`${n + 1}\` ${b.emoji ? `${b.emoji} ` : ''}**${b.label || 'no label'}** · ${await describe(bot, serverId, b)}`));
  const e = footer(card('🔘 Buttons', lines.length ? lines.join('\n') : 'This message has no buttons yet.\n\n' + USAGE), 'press a number to remove that button');
  const remove = all.slice(0, 25).map((_, n) => Button.danger(`${n + 1}`, `yhm:rm:${message.channel_id}:${message.id}:${n}`).emoji('🗑️'));
  return { embeds: [e], components: rows(remove) };
}

function forgetButtons(buttons) {
  for (const { b } of buttons) if (b.custom_id?.startsWith('yh:')) delete store.buttons()[b.custom_id.slice(3)];
  store.save();
}

/** Take button n (0-based) off a message. Returns the message as it is now. */
async function removeAt(bot, message, n) {
  const all = flatten(message.components);
  const hit = all[n];
  if (!hit) throw new UserError(`There's no button ${n + 1} on that message.`);
  const components = structuredClone(message.components);
  components[hit.r].components.splice(hit.c, 1);
  const left = components.filter((row) => row.components.length);
  const edited = await bot.edit(message.channel_id, message.id, null, { components: left.length ? left : null });
  forgetButtons([hit]);
  return { ...message, ...edited, components: left };
}

async function addButton(bot, msg, args) {
  const { message, rest } = await ownMessage(bot, msg, args);
  const [opts, rest2] = takeOptions(rest, ['label', 'style', 'emoji']);
  const [type, value] = shift(rest2);
  const action = String(type).toLowerCase();
  if (!TYPES[action]) throw new UserError(`What kind of button? \`role\`, \`role-add\`, \`role-remove\`, \`message\` or \`link\`.\n\n${USAGE}`);

  const count = Object.values(store.buttons()).filter((b) => b.server === msg.server_id).length;
  if (count >= CAPS.buttonsPerServer) throw new UserError(`This server has ${count} buttons, the most I keep. Remove some with \`/buttons remove\`.`);

  const style = opts.style ? STYLES[opts.style.toLowerCase()] : null;
  if (opts.style && !style) throw new UserError('Styles are `blurple`, `grey`, `green` and `red`.');
  const button = { type: 'button', style: style || (action === 'link' ? 'link' : action === 'message' ? 'secondary' : 'primary') };
  const entry = { server: msg.server_id, channel: message.channel_id, message: message.id, action, by: msg.author_id, at: new Date().toISOString() };
  let warnings = [];

  if (action.startsWith('role')) {
    const role = await resolveRole(bot, msg.server_id, value);
    if (!role) throw new UserError(`Which role? Mention it or type its name: \`/buttons add ${action} @Role\`.`);
    entry.role = role.id;
    button.label = role.name;
  } else if (action === 'message') {
    const payloads = readMessageInput(value);
    if (!payloads) throw new UserError('Which message should it show? Add a YapHook share link or JSON: `/buttons add message <share link>`.');
    const fitted = toBotMessage(payloads[0]);
    warnings = fitted.warnings;
    entry.payload = { content: fitted.content, embeds: fitted.embeds };
    button.label = 'Show';
  } else {
    const [url] = shift(value);
    if (!/^https:\/\/\S+$/i.test(url)) throw new UserError('Link buttons need an https link: `/buttons add link https://example.com`.');
    button.style = 'link';
    button.url = url;
    button.label = 'Open';
  }
  if (opts.label !== undefined) button.label = opts.label;
  if (opts.emoji) button.emoji = opts.emoji;
  if (button.label) button.label = button.label.slice(0, BOT_LIMITS.label);
  if (!button.label) delete button.label;
  if (!button.label && !button.emoji) throw new UserError('A button needs a label or an emoji.');

  let id = null;
  if (action !== 'link') {
    id = newId();
    button.custom_id = `yh:${id}`;
  }

  const components = structuredClone((message.components || []).filter((r) => r.type === 'row' || r.type === 1));
  const last = components[components.length - 1];
  if (last && last.components.length < BOT_LIMITS.buttonsPerRow) last.components.push(button);
  else if (components.length < BOT_LIMITS.rows) components.push({ type: 'row', components: [button] });
  else throw new UserError(`That message is full (${BOT_LIMITS.rows} rows of ${BOT_LIMITS.buttonsPerRow}). Remove one with \`/buttons remove\`.`);

  await bot.edit(message.channel_id, message.id, null, { components });
  if (id) { store.buttons()[id] = entry; store.save(); }
  const what = action.startsWith('role') ? `${TYPES[action]} <@&${entry.role}>` : TYPES[action];
  await msg.reply('', { embeds: [success(`Added **${button.label || button.emoji}**, which ${what}.`), warningsCard(warnings)].filter(Boolean) });
}

export default function setup(bot) {
  bot.command('buttons', 'Add role, message and link buttons to my messages: /buttons add|list|remove|clear', command(bot, async (msg) => {
    const [sub, rest] = shift(msg.args);
    switch (sub.toLowerCase()) {
      case 'add':
        return addButton(bot, msg, rest);
      case 'list': {
        const { message } = await ownMessage(bot, msg, rest);
        return msg.reply('', await listCard(bot, msg.server_id, message));
      }
      case 'remove':
      case 'delete': {
        const { message, rest: r } = await ownMessage(bot, msg, rest);
        const n = Number(shift(r)[0]);
        if (!Number.isInteger(n) || n < 1) throw new UserError('Which one? `/buttons remove 2` (see the numbers with `/buttons list`).');
        await removeAt(bot, message, n - 1);
        return msg.reply('', { embeds: [success(`Removed button ${n}.`)] });
      }
      case 'clear': {
        const { message } = await ownMessage(bot, msg, rest);
        const all = flatten(message.components);
        if (!all.length) throw new UserError('That message has no buttons.');
        await bot.edit(message.channel_id, message.id, null, { components: null });
        forgetButtons(all);
        return msg.reply('', { embeds: [success(`Removed all ${all.length} button${all.length === 1 ? '' : 's'}.`)] });
      }
      default:
        return msg.reply('', { embeds: [footer(card('🔘 Buttons', USAGE), 'see /help buttons')] });
    }
  }, { need: 'manageServer' }));

  // Remove buttons from the /buttons list card.
  bot.onButton(/^yhm:rm:/, clicked(bot, async (i) => {
    const [, , channelId, messageId, n] = i.custom_id.split(':');
    const message = await bot.message(channelId, messageId).catch(() => null);
    if (!message) return i.update({ embeds: [failure('That message is gone.')], components: null });
    const now = await removeAt(bot, message, Number(n));
    return i.update(await listCard(bot, i.server_id, now));
  }, { need: 'manageServer' }));

  // Someone pressed one of the buttons people made.
  bot.onButton(/^yh:/, clicked(bot, async (i) => {
    const entry = store.buttons()[i.custom_id.slice(3)];
    if (!entry || entry.server !== i.server_id) return i.ephemeral('', { embeds: [failure("This button isn't set up any more.")] });

    if (entry.action === 'message') {
      const p = JSON.stringify(entry.payload).includes('{')
        ? applyVars(entry.payload, await memberVars(bot, { server_id: i.server_id, user_id: i.user_id, username: i.username }))
        : entry.payload;
      return i.ephemeral(p.content || '', { embeds: p.embeds });
    }

    const member = await bot.member(i.server_id, i.user_id);
    const has = (member.roles || []).includes(entry.role);
    const give = entry.action === 'role' ? !has : entry.action === 'role-add';
    const name = await roleName(bot, i.server_id, entry.role);
    if (give === has) return i.ephemeral('', { embeds: [card(null, give ? `You already have **${name}**.` : `You don't have **${name}**.`)] });
    if (give) await bot.addRole(i.server_id, i.user_id, entry.role);
    else await bot.removeRole(i.server_id, i.user_id, entry.role);
    return i.ephemeral('', { embeds: [success(give ? `Gave you **${name}**.` : `Took away **${name}**.`)] });
  }));
}
