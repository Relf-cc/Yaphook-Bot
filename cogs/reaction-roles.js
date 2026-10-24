// /reaction-role: react to get a role, unreact to lose it.
import { CAPS } from '../lib/config.js';
import { CUSTOM_EMOJI, UserError, sameEmoji, shift, takeEmoji } from '../lib/parse.js';
import * as store from '../lib/store.js';
import { card, command, footer, resolveRole, roleName, success, targetMessage, warning } from '../lib/ui.js';

const USAGE = [
  '**Reply** to the message with:',
  '`/reaction-role create 🎮 @Gamer`',
  '`/reaction-role delete 🎮` (no emoji: all of them on that message)',
  '`/reaction-role list` (no reply: every one in the server)',
  '-# Or put the message link first instead of replying.',
].join('\n');

const where = (channelId, messageId) => `<#${channelId}> \`${messageId}\``;

async function listAll(bot, msg, onlyMessageId) {
  const rr = store.server(msg.server_id).reactionRoles;
  const entries = Object.entries(rr).filter(([id]) => !onlyMessageId || id === onlyMessageId);
  if (!entries.length) return msg.reply('', { embeds: [card('🎭 Reaction roles', onlyMessageId ? 'That message has no reaction roles.' : `None yet.\n\n${USAGE}`)] });
  const e = footer(card('🎭 Reaction roles'));
  for (const [messageId, { channel, roles }] of entries.slice(0, 10)) {
    const lines = await Promise.all(roles.map(async (r) => `${r.emoji} → **${await roleName(bot, msg.server_id, r.role)}**`));
    e.field(`Message in #${(await bot.channel(channel).catch(() => null))?.name || 'unknown'}`, `${where(channel, messageId)}\n${lines.join('\n')}`.slice(0, 1024));
  }
  if (entries.length > 10) e.description(`Showing 10 of ${entries.length} messages.`);
  return msg.reply('', { embeds: [e] });
}

export default function setup(bot) {
  bot.command('reaction-role', 'React-for-role messages: /reaction-role create|delete|list (reply to the message)', command(bot, async (msg) => {
    const [sub, rest0] = shift(msg.args);
    const rr = store.server(msg.server_id).reactionRoles;
    switch (sub.toLowerCase()) {
      case 'create':
      case 'add': {
        const { message, rest } = await targetMessage(bot, msg, rest0, { usage: USAGE });
        const [emoji, roleText] = takeEmoji(rest);
        if (!emoji) throw new UserError('Which emoji? `/reaction-role create 🎮 @Gamer`');
        if (CUSTOM_EMOJI.test(emoji)) throw new UserError('Bots can only react with regular emoji on Yapin\' for now, so pick a regular one.');
        const role = await resolveRole(bot, msg.server_id, roleText);
        if (!role) throw new UserError('Which role? Mention it or type its name: `/reaction-role create 🎮 @Gamer`');

        const entry = rr[message.id] || { channel: message.channel_id, roles: [] };
        if (!rr[message.id] && Object.keys(rr).length >= CAPS.reactionRoleMessages) throw new UserError(`This server has ${CAPS.reactionRoleMessages} reaction-role messages, the most I keep.`);
        if (entry.roles.length >= CAPS.reactionRolesPerMessage) throw new UserError(`A message can have ${CAPS.reactionRolesPerMessage} reaction roles.`);
        const same = entry.roles.find((r) => sameEmoji(r.emoji, emoji));
        if (same) same.role = role.id;
        else entry.roles.push({ emoji, role: role.id });
        rr[message.id] = entry;
        store.save();

        const reacted = await bot.react(message.channel_id, message.id, emoji).then(() => true, () => false);
        const embeds = [success(`${emoji} on that message now gives **${role.name}**.`)];
        if (!reacted) embeds.push(warning("I couldn't react with that emoji myself, so people will have to add it first."));
        embeds.push(card(null, '-# I need **Manage Roles**, with my role above the one I hand out.'));
        return msg.reply('', { embeds });
      }
      case 'delete':
      case 'remove': {
        const { message, rest } = await targetMessage(bot, msg, rest0, { usage: USAGE });
        const entry = rr[message.id];
        if (!entry) throw new UserError('That message has no reaction roles.');
        const [emoji] = takeEmoji(rest);
        const gone = emoji ? entry.roles.filter((r) => sameEmoji(r.emoji, emoji)) : entry.roles;
        if (!gone.length) throw new UserError(`${emoji} isn't a reaction role on that message.`);
        entry.roles = entry.roles.filter((r) => !gone.includes(r));
        if (!entry.roles.length) delete rr[message.id];
        store.save();
        for (const r of gone) await bot.unreact(message.channel_id, message.id, r.emoji).catch(() => {});
        return msg.reply('', { embeds: [success(`Removed ${gone.map((r) => r.emoji).join(' ')} from that message.`)] });
      }
      case 'list': {
        const { message } = await targetMessage(bot, msg, rest0, { required: false });
        return listAll(bot, msg, message?.id);
      }
      default:
        return msg.reply('', { embeds: [footer(card('🎭 Reaction roles', USAGE), 'see /help reaction-roles')] });
    }
  }, { need: 'manageServer' }));

  const react = (give) => async (ev) => {
    if (!ev.server_id || ev.user_id === bot.me?.id) return;
    const entry = store.server(ev.server_id).reactionRoles[ev.message_id];
    const hit = entry?.roles.find((r) => sameEmoji(r.emoji, ev.emoji));
    if (!hit) return;
    try {
      if (give) await bot.addRole(ev.server_id, ev.user_id, hit.role);
      else await bot.removeRole(ev.server_id, ev.user_id, hit.role);
    } catch (e) {
      console.warn(`[yaphook] reaction role ${hit.emoji} in ${ev.server_id}: ${e.message}`);
    }
  };
  bot.on('reaction_add', react(true));
  bot.on('reaction_remove', react(false));
}
