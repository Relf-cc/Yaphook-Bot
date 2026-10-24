// /triggers: run a list of actions when someone joins or leaves (Discohook's flows, in text form).
import { Button, Row } from '../yapper.js';
import { CAPS } from '../lib/config.js';
import { deleteLater, dmTemplate, memberVars, sendTemplate } from '../lib/automation.js';
import { UserError, formatDuration, parseDuration, shift } from '../lib/parse.js';
import * as store from '../lib/store.js';
import { card, clicked, command, failure, footer, messageInput, resolveChannel, resolveRole, roleName, rows, success, warning, warningsCard } from '../lib/ui.js';
import { toBotMessage } from '../lib/yaphook.js';

const EVENTS = { join: 'join', 'member-join': 'join', leave: 'leave', remove: 'leave', 'member-leave': 'leave', 'member-remove': 'leave' };
const EVENT_LABEL = { join: 'Member joins', leave: 'Member leaves' };
const ACTIONS = ['send', 'dm', 'role-add', 'role-remove', 'wait', 'delete-after'];

const USAGE = [
  '`/triggers add <name> join|leave`',
  '`/triggers action <name> send [#channel] <share link or JSON>` (or reply to a message to copy it)',
  '`/triggers action <name> dm <share link or JSON>`',
  '`/triggers action <name> role-add @Role` · `role-remove @Role`',
  '`/triggers action <name> wait 30s` · `delete-after 1h`',
  '`/triggers view <name>` · `/triggers list` · `/triggers remove <name> <number>` · `/triggers delete <name>`',
].join('\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanName = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);

function getTrigger(serverId, rawName) {
  const name = cleanName(rawName);
  if (!name) throw new UserError(`Which trigger? \`/triggers view <name>\`. See them all with \`/triggers list\`.`);
  const t = store.server(serverId).triggers[name];
  if (!t) throw new UserError(`There's no trigger called \`${name}\`. See them all with \`/triggers list\`.`);
  return [name, t];
}

async function describe(bot, serverId, a) {
  switch (a.type) {
    case 'send': return `📨 Send a message in <#${a.channel}>`;
    case 'dm': return '✉️ DM them a message';
    case 'role-add': return `➕ Give **${await roleName(bot, serverId, a.role)}**`;
    case 'role-remove': return `➖ Take away **${await roleName(bot, serverId, a.role)}**`;
    case 'wait': return `⏳ Wait ${formatDuration(a.seconds)}`;
    case 'delete-after': return `🗑️ Delete the last message after ${formatDuration(a.seconds)}`;
    default: return a.type;
  }
}

async function viewCard(bot, serverId, name) {
  const t = store.server(serverId).triggers[name];
  if (!t) return { embeds: [failure(`The trigger \`${name}\` is gone.`)], components: null };
  const lines = await Promise.all(t.actions.map(async (a, n) => `\`${n + 1}\` ${await describe(bot, serverId, a)}`));
  const e = footer(card(`⚡ ${name}`, lines.length ? lines.join('\n') : 'No actions yet. Add one:\n' + USAGE.split('\n').slice(1, 5).join('\n')), 'buttons: manage it · numbers: remove that action')
    .field('When', EVENT_LABEL[t.event], true)
    .field('Status', t.enabled ? '🟢 On' : '⚪ Off', true)
    .field('Actions', `${t.actions.length}/${CAPS.actions}`, true);
  const top = new Row(
    t.enabled ? Button.secondary('Turn off', `yht:toggle:${name}`).emoji('⏸️') : Button.success('Turn on', `yht:toggle:${name}`).emoji('▶️'),
    Button.primary('Test on me', `yht:test:${name}`).emoji('🧪'),
    Button.danger('Delete', `yht:delete:${name}`).emoji('🗑️'),
  );
  const remove = t.actions.map((_, n) => Button.secondary(`${n + 1}`, `yht:rm:${name}:${n}`).emoji('✖️'));
  return { embeds: [e], components: [top, ...rows(remove).slice(0, 4)] };
}

/** Run a trigger's actions in order. Returns the problems (an action that fails doesn't stop the rest). */
async function run(bot, serverId, t, ev) {
  const problems = [];
  const vars = await memberVars(bot, { ...ev, server_id: serverId });
  let last = null;
  for (const [n, a] of t.actions.entries()) {
    try {
      if (a.type === 'send') {
        const m = await sendTemplate(bot, a.channel, a.payload, vars);
        last = { channel: a.channel, id: m?.id };
      } else if (a.type === 'dm') {
        const m = await dmTemplate(bot, ev.user_id, a.payload, vars);
        last = { channel: m?.channel_id, id: m?.id };
      } else if (a.type === 'role-add' || a.type === 'role-remove') {
        if (t.event === 'leave') continue; // they're gone, no roles to change
        await (a.type === 'role-add' ? bot.addRole : bot.removeRole).call(bot, serverId, ev.user_id, a.role);
      } else if (a.type === 'wait') {
        await sleep(a.seconds * 1000);
      } else if (a.type === 'delete-after' && last?.id) {
        deleteLater(bot, last.channel, last.id, a.seconds);
      }
    } catch (e) {
      problems.push(`Action ${n + 1} (${a.type}): ${e.message}`);
    }
  }
  return problems;
}

async function addAction(bot, msg, args) {
  const [rawName, rest] = shift(args);
  const [name, t] = getTrigger(msg.server_id, rawName);
  if (t.actions.length >= CAPS.actions) throw new UserError(`\`${name}\` has ${CAPS.actions} actions, the most a trigger can have.`);
  const [rawType, value] = shift(rest);
  const type = rawType.toLowerCase();
  if (!ACTIONS.includes(type)) throw new UserError(`What should it do? ${ACTIONS.map((a) => `\`${a}\``).join(', ')}\n\n${USAGE}`);

  let action;
  let warnings = [];
  if (type === 'send' || type === 'dm') {
    let channel = null;
    let text = value;
    if (type === 'send') {
      const [first, after] = shift(value);
      channel = first && !/^(https?:|[[{`])/i.test(first) ? await resolveChannel(bot, msg.server_id, first) : null;
      if (channel) text = after;
      else channel = { id: msg.channel_id };
    }
    const payloads = await messageInput(bot, msg, text);
    if (!payloads) throw new UserError(`Which message? Add a YapHook share link or JSON, or reply to a message: \`/triggers action ${name} ${type} …\``);
    if (payloads.length > 1) throw new UserError('That share link has several messages; add one `send` action for each.');
    warnings = toBotMessage(payloads[0]).warnings;
    action = { type, payload: payloads[0], ...(channel ? { channel: channel.id } : {}) };
  } else if (type === 'role-add' || type === 'role-remove') {
    const role = await resolveRole(bot, msg.server_id, value);
    if (!role) throw new UserError(`Which role? \`/triggers action ${name} ${type} @Role\``);
    action = { type, role: role.id };
    if (t.event === 'leave') warnings.push("This trigger runs when people leave, when there's no one to give roles to, so this action will be skipped.");
  } else {
    const seconds = parseDuration(value);
    const max = type === 'wait' ? CAPS.maxWait : CAPS.maxDeleteAfter;
    if (!seconds || seconds > max) throw new UserError(`How long? Like \`30s\` or \`2m\`, up to ${formatDuration(max)}.`);
    action = { type, seconds };
    if (type === 'delete-after' && !t.actions.some((a) => a.type === 'send' || a.type === 'dm')) warnings.push('`delete-after` removes the last message the trigger sent, so put a `send` or `dm` before it.');
  }
  t.actions.push(action);
  store.save();
  return msg.reply('', { embeds: [success(`Added to \`${name}\`: ${await describe(bot, msg.server_id, action)}`), warningsCard(warnings)].filter(Boolean) });
}

export default function setup(bot) {
  bot.command('triggers', 'Do things when people join or leave: /triggers add|action|view|list|delete', command(bot, async (msg) => {
    const [sub, rest] = shift(msg.args);
    const triggers = store.server(msg.server_id).triggers;
    switch (sub.toLowerCase()) {
      case 'add':
      case 'create': {
        const [rawName, rest2] = shift(rest);
        const name = cleanName(rawName);
        if (!name) throw new UserError(`Give it a name (letters, numbers, - and _): \`/triggers add welcome-role join\``);
        if (triggers[name]) throw new UserError(`There's already a trigger called \`${name}\`.`);
        if (Object.keys(triggers).length >= CAPS.triggers) throw new UserError(`This server has ${CAPS.triggers} triggers, the most I keep.`);
        const event = EVENTS[shift(rest2)[0].toLowerCase()];
        if (!event) throw new UserError(`When should it run? \`/triggers add ${name} join\` or \`/triggers add ${name} leave\``);
        triggers[name] = { event, enabled: true, actions: [], by: msg.author_id, at: new Date().toISOString() };
        store.save();
        return msg.reply('', { embeds: [success(`Made \`${name}\`, which runs when a member ${event === 'join' ? 'joins' : 'leaves'}. Now give it actions:\n${USAGE.split('\n').slice(1, 5).join('\n').replaceAll('<name>', name)}`)] });
      }
      case 'action':
        return addAction(bot, msg, rest);
      case 'view':
      case 'edit': {
        const [name] = getTrigger(msg.server_id, shift(rest)[0]);
        return msg.reply('', await viewCard(bot, msg.server_id, name));
      }
      case 'list': {
        const all = Object.entries(triggers);
        const lines = all.map(([n, t]) => `${t.enabled ? '🟢' : '⚪'} \`${n}\` · ${EVENT_LABEL[t.event]} · ${t.actions.length} action${t.actions.length === 1 ? '' : 's'}`);
        return msg.reply('', { embeds: [footer(card('⚡ Triggers', lines.length ? lines.join('\n') : `None yet.\n\n${USAGE}`), `${all.length}/${CAPS.triggers}`)] });
      }
      case 'remove': {
        const [rawName, rest2] = shift(rest);
        const [name, t] = getTrigger(msg.server_id, rawName);
        const n = Number(shift(rest2)[0]);
        if (!Number.isInteger(n) || n < 1 || n > t.actions.length) throw new UserError(`Which action? \`/triggers remove ${name} 2\` (numbers are in \`/triggers view ${name}\`).`);
        t.actions.splice(n - 1, 1);
        store.save();
        return msg.reply('', { embeds: [success(`Removed action ${n} from \`${name}\`.`)] });
      }
      case 'enable':
      case 'disable': {
        const [name, t] = getTrigger(msg.server_id, shift(rest)[0]);
        t.enabled = sub.toLowerCase() === 'enable';
        store.save();
        return msg.reply('', { embeds: [success(`\`${name}\` is ${t.enabled ? 'on' : 'off'}.`)] });
      }
      case 'test': {
        const [name, t] = getTrigger(msg.server_id, shift(rest)[0]);
        const problems = await run(bot, msg.server_id, t, { user_id: msg.author_id, username: msg.author?.username });
        return msg.reply('', { embeds: [problems.length ? warning(`Ran \`${name}\` on you, with problems:\n${problems.join('\n')}`) : success(`Ran \`${name}\` on you.`)] });
      }
      case 'delete': {
        const [name] = getTrigger(msg.server_id, shift(rest)[0]);
        delete triggers[name];
        store.save();
        return msg.reply('', { embeds: [success(`Deleted \`${name}\`.`)] });
      }
      default:
        return msg.reply('', { embeds: [footer(card('⚡ Triggers', USAGE), 'see /help triggers and /help variables')] });
    }
  }, { need: 'manageServer' }));

  bot.onButton(/^yht:/, clicked(bot, async (i) => {
    const [, op, name, n] = i.custom_id.split(':');
    const triggers = store.server(i.server_id).triggers;
    const t = triggers[name];
    if (!t) return i.update({ embeds: [failure(`The trigger \`${name}\` is gone.`)], components: null });
    switch (op) {
      case 'toggle':
        t.enabled = !t.enabled;
        break;
      case 'rm':
        t.actions.splice(Number(n), 1);
        break;
      case 'test': {
        const problems = await run(bot, i.server_id, t, { user_id: i.user_id, username: i.username });
        return i.ephemeral('', { embeds: [problems.length ? warning(`Ran \`${name}\` on you, with problems:\n${problems.join('\n')}`) : success(`Ran \`${name}\` on you.`)] });
      }
      case 'delete':
        // Ask first: one stray click shouldn't lose a trigger.
        return i.update({
          embeds: [warning(`Delete the trigger \`${name}\` and its ${t.actions.length} action${t.actions.length === 1 ? '' : 's'}?`)],
          components: [new Row(Button.danger('Delete it', `yht:really:${name}`), Button.secondary('Keep it', `yht:back:${name}`))],
        });
      case 'really':
        delete triggers[name];
        store.save();
        return i.update({ embeds: [success(`Deleted \`${name}\`.`)], components: null });
      default:
        break; // 'back': just show it again
    }
    store.save();
    return i.update(await viewCard(bot, i.server_id, name));
  }, { need: 'manageServer' }));

  const on = (event) => async (ev) => {
    if (!ev.server_id) return;
    for (const [name, t] of Object.entries(store.server(ev.server_id).triggers)) {
      if (!t.enabled || t.event !== event || !t.actions.length) continue;
      // Each trigger on its own, so a long wait in one doesn't hold up the others.
      run(bot, ev.server_id, t, ev).then(
        (problems) => { if (problems.length) console.warn(`[yaphook] trigger ${name} in ${ev.server_id}: ${problems.join('; ')}`); },
        (e) => console.warn(`[yaphook] trigger ${name} in ${ev.server_id}: ${e.message}`),
      );
    }
  };
  bot.on('member_join', on('join'));
  bot.on('member_leave', on('leave'));
}
