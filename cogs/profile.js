// /profile: the bot's nickname in this server, and (for the bot's owner) its status line.
import { UserError, shift } from '../lib/parse.js';
import { card, command, footer, success } from '../lib/ui.js';

const USAGE = [
  '`/profile name <nickname>`: what I\'m called in this server (32 characters)',
  '`/profile clear`: back to my normal name',
  '`/profile status online|idle|dnd [activity]`: my status everywhere (bot owner only)',
  '-# Yapin\' bots have one avatar and banner for every server; change them in Settings → Developer → your bot → Profile.',
].join('\n');

export default function setup(bot) {
  bot.command('profile', "My nickname in this server: /profile name <nickname> or /profile clear", command(bot, async (msg) => {
    const [sub, rest] = shift(msg.args);
    switch (sub.toLowerCase()) {
      case 'name':
      case 'nick':
      case 'nickname': {
        const nick = rest.trim();
        if (!nick) throw new UserError('What should I be called? `/profile name Hooky`');
        if (nick.length > 32) throw new UserError('Nicknames can be up to 32 characters.');
        await bot.setNickname(msg.server_id, bot.me.id, nick);
        return msg.reply('', { embeds: [success(`I'm **${nick}** in this server now.`)] });
      }
      case 'clear':
      case 'reset':
        await bot.setNickname(msg.server_id, bot.me.id, '');
        return msg.reply('', { embeds: [success('Back to my normal name.')] });
      case 'status': {
        if (msg.author_id !== bot.me?.bot?.owner_id) throw new UserError("Only my owner can change my status, since it shows in every server I'm in.");
        const [status, activity] = shift(rest);
        if (!['online', 'idle', 'dnd'].includes(status)) throw new UserError('`/profile status online|idle|dnd [activity]`');
        if (activity.length > 60) throw new UserError('The activity can be up to 60 characters.');
        await bot.setStatus(status, activity || null);
        return msg.reply('', { embeds: [success(`Status set to **${status}**${activity ? `: ${activity}` : ''}.`)] });
      }
      default:
        return msg.reply('', { embeds: [footer(card('🪪 Profile', USAGE))] });
    }
  }, { need: 'manageServer' }));
}
