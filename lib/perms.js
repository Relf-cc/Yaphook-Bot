// Who may do what. Yapin' roles carry manage_server / manage_messages flags; the server owner can do anything.

const TTL = 30_000;
const cache = new Map();

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - TTL) return hit.value;
  const value = await fn();
  cache.set(key, { value, at: Date.now() });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return value;
}

export const getServer = (bot, id) => cached(`s:${id}`, () => bot.server(id));
export const getRoles = (bot, id) => cached(`r:${id}`, () => bot.roles(id));
export const getChannels = (bot, id) => cached(`c:${id}`, () => bot.channels(id));
export const forget = (serverId) => { for (const k of cache.keys()) if (k.endsWith(serverId)) cache.delete(k); };

/** { owner, manageServer, manageMessages } for someone in a server. */
export async function access(bot, serverId, userId) {
  if (!serverId || !userId) return { owner: false, manageServer: false, manageMessages: false };
  const [server, roles, member] = await Promise.all([
    getServer(bot, serverId),
    getRoles(bot, serverId),
    bot.member(serverId, userId).catch(() => null),
  ]);
  const owner = server?.owner_id === userId;
  const mine = new Set(member?.roles || []);
  const held = (roles || []).filter((r) => mine.has(r.id) || r.auto === 'everyone' || r.auto === 'default');
  const admin = held.some((r) => r.perms?.administrator === true);
  const manageServer = owner || admin || held.some((r) => r.manage_server);
  const manageMessages = manageServer || held.some((r) => r.manage_messages);
  return { owner, manageServer, manageMessages };
}

export const NEED = {
  manageServer: 'You need **Manage Server** to set this up.',
  manageMessages: 'You need **Manage Messages** (or Manage Server) for this.',
};
