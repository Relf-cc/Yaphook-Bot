// Shared by the welcomer and triggers: who the event is about, and sending a template for them.
import { getServer, forget } from './perms.js';
import { applyVars, picture, toBotMessage } from './yaphook.js';

/** Variables for a member_join / member_leave event (or a test run by someone). */
export async function memberVars(bot, ev) {
  const [server, user] = await Promise.all([
    getServer(bot, ev.server_id).catch(() => null),
    bot.user(ev.user_id).catch(() => null),
  ]);
  const name = user?.username || ev.username || 'someone';
  return {
    'member.mention': `<@${ev.user_id}>`,
    'member.name': name,
    'member.display_name': user?.display_name || name,
    'member.id': ev.user_id,
    'member.avatar_url': picture('avatars', user?.avatar_path),
    'server.name': server?.name || 'this server',
    'server.id': ev.server_id,
    'server.members': ev.member_count ?? server?.member_count ?? '',
    'server.icon_url': picture('icons', server?.icon_path),
    // Short forms people tend to type.
    user: `<@${ev.user_id}>`,
    mention: `<@${ev.user_id}>`,
    username: name,
    server: server?.name || 'this server',
  };
}

/** Send a template into a channel with the variables filled in. Returns the message. */
export async function sendTemplate(bot, channelId, payload, vars) {
  const { content, embeds } = toBotMessage(applyVars(payload, vars));
  return bot.send(channelId, content, { embeds });
}

/** DM a template to someone. */
export async function dmTemplate(bot, userId, payload, vars) {
  const { content, embeds } = toBotMessage(applyVars(payload, vars));
  return bot.dmSend(userId, content, { embeds });
}

/** Delete a message after a while, quietly. */
export function deleteLater(bot, channelId, messageId, seconds) {
  if (!seconds || !messageId) return;
  setTimeout(() => bot.delete(channelId, messageId).catch(() => {}), seconds * 1000).unref?.();
}

/** Member counts change on join/leave, so the cached server is stale. */
export const refreshServer = (serverId) => forget(serverId);
