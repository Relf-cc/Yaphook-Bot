// Offline end-to-end test: every cog against a fake Yapin' API. `npm test`. No token or network needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yaphook-test-'));
process.env.YAPHOOK_DATA_FILE = path.join(tmp, 'db.json');

const { Bot } = await import('../yapper.js');
const { shareUrl, readShareLink } = await import('../lib/yaphook.js');
const { parseDuration, parseWhen, messageRef } = await import('../lib/parse.js');
const store = await import('../lib/store.js');

// ---------- fake Yapin' ----------
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const BOT = uuid(), OWNER = uuid(), USER = uuid(), SERVER = uuid(), GENERAL = uuid(), WELCOME = uuid(), OTHER_SERVER = uuid(), FOREIGN = uuid();
const GAMER = uuid(), MODS = uuid();

const state = {
  server: { id: SERVER, name: 'Hook Club', owner_id: OWNER, member_count: 42, icon_path: null },
  roles: [
    { id: GAMER, name: 'Gamer', manage_server: false, manage_messages: false },
    { id: MODS, name: 'Mods', manage_server: true, manage_messages: true },
  ],
  channels: [
    { id: GENERAL, name: 'general', type: 'text', kind: 'text', server_id: SERVER },
    { id: WELCOME, name: 'welcome', type: 'text', kind: 'text', server_id: SERVER },
    { id: FOREIGN, name: 'secret', type: 'text', kind: 'text', server_id: OTHER_SERVER },
  ],
  members: { [OWNER]: [], [USER]: [], [BOT]: [] },
  users: {
    [OWNER]: { id: OWNER, username: 'owner', display_name: 'The Owner', avatar_path: `${OWNER}/a.png` },
    [USER]: { id: USER, username: 'pat', display_name: null, avatar_path: null },
  },
  messages: new Map(),
  reactions: [],
  callbacks: [],
  nick: null,
};
const sent = () => [...state.messages.values()].filter((m) => m.author_id === BOT);
const lastSent = () => sent().at(-1);

function addMessage(m) {
  const msg = { id: uuid(), created_at: new Date().toISOString(), embeds: null, components: null, content: '', ...m };
  state.messages.set(msg.id, msg);
  return msg;
}

async function api(method, p, body) {
  const fail = (status, error) => { const e = new Error(error); e.status = status; throw e; };
  let m;
  if (method === 'GET' && p === '/me') return { id: BOT, username: 'yaphook', display_name: 'YapHook', bot: { name: 'YapHook', public: false, owner_id: OWNER } };
  if ((m = /^\/servers\/([\w-]+)$/.exec(p))) return m[1] === SERVER ? { server: state.server } : fail(404, 'Unknown server');
  if (/^\/servers\/[\w-]+\/roles$/.test(p)) return { roles: state.roles };
  if (/^\/servers\/[\w-]+\/channels/.test(p)) return { channels: state.channels.filter((c) => c.server_id === SERVER), categories: [] };
  if ((m = /^\/servers\/[\w-]+\/members\/([\w-]+)\/roles\/([\w-]+)$/.exec(p))) {
    const roles = state.members[m[1]];
    if (method === 'PUT' && !roles.includes(m[2])) roles.push(m[2]);
    if (method === 'DELETE') state.members[m[1]] = roles.filter((r) => r !== m[2]);
    return { ok: true };
  }
  if ((m = /^\/servers\/[\w-]+\/members\/([\w-]+)$/.exec(p))) {
    if (method === 'PATCH') { state.nick = body.nickname; return { ok: true }; }
    return state.members[m[1]] ? { member: { ...state.users[m[1]], roles: state.members[m[1]] } } : fail(404, 'Not a member');
  }
  if ((m = /^\/channels\/([\w-]+)$/.exec(p))) {
    const ch = state.channels.find((c) => c.id === m[1]);
    return ch ? { channel: ch } : fail(404, 'Unknown channel');
  }
  if ((m = /^\/channels\/([\w-]+)\/messages$/.exec(p)) && method === 'POST') {
    if (body.embeds?.length > 5) fail(400, 'Up to 5 embeds');
    if (!body.content && !body.embeds?.length && !body.components?.length) fail(400, 'Empty message');
    return { message: addMessage({ channel_id: m[1], author_id: BOT, content: body.content, embeds: body.embeds ?? null, components: body.components ?? null, reply_to_id: body.reply_to ?? null }) };
  }
  if ((m = /^\/channels\/([\w-]+)\/messages\/([\w-]+)\/reactions\/(.+)$/.exec(p))) {
    state.reactions.push([method, m[2], decodeURIComponent(m[3])]);
    return { ok: true };
  }
  if ((m = /^\/channels\/([\w-]+)\/messages\/([\w-]+)$/.exec(p))) {
    const msg = state.messages.get(m[2]);
    if (!msg || msg.channel_id !== m[1]) fail(404, 'Unknown message');
    if (method === 'GET') return { message: msg, author: state.users[msg.author_id] ?? null };
    if (method === 'DELETE') { state.messages.delete(m[2]); return { ok: true }; }
    if (method === 'PATCH') {
      if (msg.author_id !== BOT) fail(403, 'Not your message');
      for (const k of ['content', 'embeds', 'components']) if (k in body) msg[k] = body[k];
      return { message: msg };
    }
  }
  if ((m = /^\/users\/([\w-]+)$/.exec(p))) return { user: state.users[m[1]] };
  if ((m = /^\/users\/([\w-]+)\/dm$/.exec(p))) return { channel_id: `dm-${m[1]}` };
  if ((m = /^\/interactions\/([\w-]+)\/[\w-]+\/callback$/.exec(p))) { state.callbacks.push(body); return { ok: true }; }
  if (p === '/me/status') return { ok: true };
  throw new Error(`fake API has no ${method} ${p}`);
}

// ---------- the bot ----------
const bot = new Bot('yb_test', { log: false, gateway: false });
bot.api = api;
bot.me = await api('GET', '/me');
const errors = [];
bot.on('error', (e) => errors.push(e));
await bot.loadCogs(path.join(root, 'cogs'));

/** Someone types a command. Returns the bot's reply to it. */
async function run(author, line, extra = {}) {
  const [, name, args = ''] = /^\/(\S+)\s*([\s\S]*)$/.exec(line);
  const msg = addMessage({ channel_id: GENERAL, author_id: author, content: line, ...extra });
  const before = state.messages.size;
  await bot.handle({ id: ++n, type: 'message', data: { ...msg, server_id: SERVER, channel_name: 'general', author: state.users[author], command: name, args, mentioned: false } });
  await new Promise((r) => setTimeout(r, 5));
  return [...state.messages.values()].slice(before - 1).find((m) => m.reply_to_id === msg.id);
}
const text = (m) => [m?.content, ...(m?.embeds || []).flatMap((e) => [e.title, e.description, ...(e.fields || []).flatMap((f) => [f.name, f.value])])].filter(Boolean).join('\n');
async function click(user, customId, messageId) {
  state.callbacks = [];
  await bot.handle({ id: ++n, type: 'interaction', data: { id: uuid(), token: 't', type: 'button', custom_id: customId, message_id: messageId, channel_id: GENERAL, server_id: SERVER, user_id: user, username: state.users[user]?.username } });
  return state.callbacks.at(-1);
}
const buttonsOf = (m) => (m.components || []).flatMap((r) => r.components);

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(['✔', name]); } catch (e) { results.push(['✘', name, e]); }
}

// ---------- unit bits ----------
await test('parse: durations and times', () => {
  assert.equal(parseDuration('1h30m'), 5400);
  assert.equal(parseDuration('2 hours'), 7200);
  assert.equal(parseDuration('45'), 45);
  assert.equal(parseDuration('soon'), null);
  const now = Date.UTC(2026, 9, 24, 12) ;
  assert.equal(parseWhen('in 2h', now), now / 1000 + 7200);
  assert.equal(parseWhen('3 days ago', now), now / 1000 - 3 * 86400);
  assert.equal(parseWhen('1760000000'), 1760000000);
  assert.equal(parseWhen('2026-12-25T18:00:00Z'), Date.UTC(2026, 11, 25, 18) / 1000);
});

await test('parse: message refs from replies, links and ids', () => {
  const msg = { channel_id: GENERAL };
  assert.deepEqual(messageRef({ ...msg, reply_to_id: 'abc' }, 'x').ref, { channelId: GENERAL, messageId: 'abc' });
  const id = uuid();
  assert.deepEqual(messageRef(msg, `https://www.yapin.gg/channels/${SERVER}/${WELCOME}/${id} rest`), { ref: { channelId: WELCOME, messageId: id }, rest: 'rest' });
  assert.deepEqual(messageRef(msg, `${id} 🎮`).ref, { channelId: GENERAL, messageId: id });
  assert.equal(messageRef(msg, `${shareUrl([{ content: 'hi' }])}`).ref, null);
});

await test('share links round-trip in the format the YapHook site reads', () => {
  const url = shareUrl([{ content: 'hello', embeds: [{ title: 'T', color: 0xff6b4a }] }]);
  assert.match(url, /^https:\/\/yaphook\.dev\/#data=[\w-]+$/);
  const raw = JSON.parse(Buffer.from(url.split('#data=')[1], 'base64url').toString());
  assert.equal(raw.version, 'yaphook-1');
  assert.equal(raw.messages[0].data.content, 'hello');
  assert.equal(readShareLink(url)[0].embeds[0].title, 'T');
  // Discohook-style ?data= works too.
  const dh = `https://discohook.app/?data=${Buffer.from(JSON.stringify({ messages: [{ data: { content: 'dh' } }] })).toString('base64url')}`;
  assert.equal(readShareLink(dh)[0].content, 'dh');
});

// ---------- commands ----------
await test('/help shows an overview with topic buttons, and topics answer privately', async () => {
  const r = await run(USER, '/help');
  assert.match(text(r), /help/i);
  assert.ok(buttonsOf(r).length >= 10);
  const cb = await click(USER, 'help:buttons', r.id);
  assert.equal(cb.type, 'ephemeral');
  assert.match(text(cb), /Buttons/);
  const r2 = await run(USER, `/help webhooks <@${OWNER}>`);
  assert.equal(r2.content, `<@${OWNER}>`);
});

const webhookMsg = addMessage({ channel_id: GENERAL, author_id: uuid(), content: 'Patch notes', embeds: [{ title: 'v2', color: '#ff6b4a', fields: [{ name: 'New', value: 'stuff' }] }] });

await test('/restore (reply) gives a YapHook link with the message in it', async () => {
  const r = await run(USER, '/restore', { reply_to_id: webhookMsg.id });
  const url = buttonsOf(r).find((b) => b.url)?.url || /https:\/\/\S+#data=\S+/.exec(text(r))?.[0];
  assert.ok(url, `no link in: ${text(r)}`);
  const [p] = readShareLink(url);
  assert.equal(p.content, 'Patch notes');
  assert.equal(p.embeds[0].color, 0xff6b4a, 'string colours become numbers for the editor');
});

await test('/restore refuses messages from another server', async () => {
  const foreign = addMessage({ channel_id: FOREIGN, author_id: OWNER, content: 'secret' });
  const r = await run(USER, `/restore ${FOREIGN} ${foreign.id}`);
  assert.match(text(r), /can't find that message/);
});

await test('/json shows the payload', async () => {
  const r = await run(USER, '/json', { reply_to_id: webhookMsg.id });
  assert.match(text(r), /```json[\s\S]*"Patch notes"/);
});

await test('/send needs Manage Messages', async () => {
  const r = await run(USER, `/send ${shareUrl([{ content: 'nope' }])}`);
  assert.match(text(r), /Manage Messages/);
});

let posted;
await test('/send posts a share link as the bot and fits it to bot limits', async () => {
  const embeds = Array.from({ length: 7 }, (_, i) => ({ title: `E${i}`, image: { url: 'https://evil.example/x.png' } }));
  const r = await run(OWNER, `/send #welcome ${shareUrl([{ content: 'Rules', username: 'Custom', embeds }])}`);
  posted = sent().find((m) => m.channel_id === WELCOME && m.content === 'Rules');
  assert.ok(posted, 'message posted in #welcome');
  assert.equal(posted.embeds.length, 5);
  assert.ok(!posted.embeds[0].image, 'disallowed picture host dropped');
  assert.match(text(r), /5 embeds/);
  assert.match(text(r), /names and avatars/);
});

await test('/send while replying copies that message', async () => {
  const before = sent().length;
  await run(OWNER, '/send', { reply_to_id: webhookMsg.id });
  assert.equal(sent().length, before + 1);
  assert.equal(lastSent().content, 'Patch notes');
});

await test('/edit swaps content on my message, refuses others', async () => {
  const r = await run(OWNER, `/edit ${shareUrl([{ content: 'Rules v2' }])}`, { reply_to_id: posted.id, channel_id: WELCOME });
  assert.match(text(r), /edited/);
  assert.equal(state.messages.get(posted.id).content, 'Rules v2');
  const r2 = await run(OWNER, `/edit ${shareUrl([{ content: 'x' }])}`, { reply_to_id: webhookMsg.id });
  assert.match(text(r2), /only edit messages I sent/);
});

let menu;
await test('/buttons add role, then clicking toggles the role', async () => {
  menu = sent().find((m) => m.content === 'Patch notes');
  const r = await run(OWNER, `/buttons add role <@&${GAMER}> label="Get Gamer" style=green emoji=🎮`, { reply_to_id: menu.id });
  assert.match(text(r), /Added/);
  const [b] = buttonsOf(state.messages.get(menu.id));
  assert.equal(b.label, 'Get Gamer');
  assert.equal(b.style, 'success');
  let cb = await click(USER, b.custom_id, menu.id);
  assert.match(text(cb), /Gave you \*\*Gamer\*\*/);
  assert.ok(state.members[USER].includes(GAMER));
  cb = await click(USER, b.custom_id, menu.id);
  assert.match(text(cb), /Took away/);
  assert.ok(!state.members[USER].includes(GAMER));
});

await test('/buttons add message and link, list, remove from the list card', async () => {
  await run(OWNER, `/buttons add message ${shareUrl([{ content: 'Hi {member.mention}!' }])} label=Rules`, { reply_to_id: menu.id });
  await run(OWNER, '/buttons add link https://yaphook.dev', { reply_to_id: menu.id });
  const all = buttonsOf(state.messages.get(menu.id));
  assert.equal(all.length, 3);
  const cb = await click(USER, all[1].custom_id, menu.id);
  assert.equal(cb.type, 'ephemeral');
  assert.equal(cb.content, `Hi <@${USER}>!`);
  const list = await run(OWNER, '/buttons list', { reply_to_id: menu.id });
  assert.match(text(list), /Get Gamer[\s\S]*Rules[\s\S]*opens https:\/\/yaphook\.dev/);
  const rm = buttonsOf(list)[2];
  assert.equal((await click(USER, rm.custom_id, list.id)).content ?? 'refused', '', 'non-manager can\'t remove');
  assert.equal(buttonsOf(state.messages.get(menu.id)).length, 3);
  const upd = await click(OWNER, rm.custom_id, list.id);
  assert.equal(upd.type, 'update');
  assert.equal(buttonsOf(state.messages.get(menu.id)).length, 2);
});

await test('/buttons refuses messages the bot did not send', async () => {
  const r = await run(OWNER, `/buttons add role Gamer`, { reply_to_id: webhookMsg.id });
  assert.match(text(r), /only put buttons on messages I sent/);
});

await test('/reaction-role create, react to get the role, unreact to lose it', async () => {
  const r = await run(OWNER, `/reaction-role create 🎮 Gamer`, { reply_to_id: webhookMsg.id });
  assert.match(text(r), /gives \*\*Gamer\*\*/);
  assert.ok(state.reactions.some(([m, id, e]) => m === 'PUT' && id === webhookMsg.id && e === '🎮'), 'bot reacted');
  const ev = { message_id: webhookMsg.id, channel_id: GENERAL, server_id: SERVER, user_id: USER, emoji: '🎮' };
  await bot.handle({ id: ++n, type: 'reaction_add', data: ev });
  assert.ok(state.members[USER].includes(GAMER));
  await bot.handle({ id: ++n, type: 'reaction_remove', data: ev });
  assert.ok(!state.members[USER].includes(GAMER));
  assert.match(text(await run(OWNER, '/reaction-role list')), /🎮 → \*\*Gamer\*\*/);
  assert.match(text(await run(OWNER, '/reaction-role delete', { reply_to_id: webhookMsg.id })), /Removed/);
});

await test('/welcomer set join posts on member_join with variables filled', async () => {
  const r = await run(OWNER, '/welcomer set join #welcome');
  assert.match(text(r), /posts in/);
  await bot.handle({ id: ++n, type: 'member_join', data: { server_id: SERVER, channel_id: null, user_id: USER, username: 'pat', member_count: 43 } });
  const w = lastSent();
  assert.equal(w.channel_id, WELCOME);
  assert.equal(w.content, `<@${USER}>`);
  assert.match(w.embeds[0].title, /Welcome to Hook Club/);
  assert.match(w.embeds[0].description, /#43/);
  assert.ok(!w.embeds[0].thumbnail, 'empty avatar thumbnail dropped');
  const v = await run(OWNER, '/welcomer view join');
  assert.match(text(v), /Built-in/);
});

await test('/triggers: add, actions, run on join, view buttons', async () => {
  await run(OWNER, '/triggers add newbie join');
  await run(OWNER, '/triggers action newbie role-add Gamer');
  await run(OWNER, `/triggers action newbie send #general ${shareUrl([{ content: 'Say hi to {member.display_name}' }])}`);
  const r = await run(OWNER, '/triggers action newbie wait 2s');
  assert.match(text(r), /Wait 2s/);
  await run(OWNER, '/triggers remove newbie 3');
  state.members[OWNER] = [];
  await bot.handle({ id: ++n, type: 'member_join', data: { server_id: SERVER, user_id: OWNER, username: 'owner', member_count: 44 } });
  await new Promise((res) => setTimeout(res, 20));
  assert.ok(state.members[OWNER].includes(GAMER), 'role given');
  assert.ok(sent().some((m) => m.channel_id === GENERAL && m.content === 'Say hi to The Owner'));
  const view = await run(OWNER, '/triggers view newbie');
  assert.match(text(view), /Give \*\*Gamer\*\*[\s\S]*Send a message/);
  const toggle = buttonsOf(view).find((b) => b.custom_id === 'yht:toggle:newbie');
  await click(OWNER, toggle.custom_id, view.id);
  assert.equal(store.server(SERVER).triggers.newbie.enabled, false);
  const del = await click(OWNER, 'yht:delete:newbie', view.id);
  assert.match(text(del), /Delete the trigger/);
  await click(OWNER, 'yht:really:newbie', view.id);
  assert.equal(store.server(SERVER).triggers.newbie, undefined);
});

await test('/format and /id resolve mentions and names', async () => {
  const r = await run(USER, `/format <@${OWNER}> #welcome Mods`);
  assert.match(text(r), new RegExp(`\`<@${OWNER}>\``));
  assert.match(text(r), new RegExp(`\`<#${WELCOME}>\``));
  assert.match(text(r), new RegExp(`\`<@&${MODS}>\``));
  const id = await run(USER, '/id', { reply_to_id: webhookMsg.id });
  assert.match(text(id), new RegExp(webhookMsg.id));
});

await test('/timestamp makes all the styles', async () => {
  const r = await run(USER, '/timestamp 1760000000');
  for (const s of 'tTdDfFR') assert.ok(text(r).includes(`<t:1760000000:${s}>`));
});

await test('/profile, /invite and /webhook', async () => {
  assert.match(text(await run(OWNER, '/profile name Hooky')), /Hooky/);
  assert.equal(state.nick, 'Hooky');
  assert.match(text(await run(USER, '/profile name x')), /Manage Server/);
  assert.match(text(await run(USER, '/invite')), new RegExp(BOT));
  assert.match(text(await run(USER, '/webhook')), /Webhooks/);
});

await test('settings are saved to disk', async () => {
  store.flush();
  const saved = JSON.parse(fs.readFileSync(process.env.YAPHOOK_DATA_FILE, 'utf8'));
  assert.ok(saved.servers[SERVER].welcomer.join);
  assert.ok(Object.keys(saved.buttons).length >= 2);
});

await test('no unexpected errors were logged', () => assert.deepEqual(errors.map((e) => e.message), []));

// ---------- report ----------
for (const [mark, name, e] of results) {
  console.log(`${mark} ${name}`);
  if (e) console.log(`   ${String(e.stack || e).split('\n').slice(0, 4).join('\n   ')}`);
}
const failed = results.filter((r) => r[0] === '✘').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
