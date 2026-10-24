// YapHook share links and payloads <-> Yapin' messages.
// A payload is the webhook JSON YapHook builds: { content, username, avatar_url, embeds[] }.
import { BRAND, BOT_LIMITS, IMAGE_HOSTS, WEBHOOK_LIMITS } from './config.js';
import { UserError } from './parse.js';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');

/** '#ff6b4a', 'ff6b4a' or 16739146 → 16739146 (YapHook's editor only reads numbers). */
export function colorNumber(c) {
  if (typeof c === 'number' && c >= 0 && c <= 0xffffff) return Math.floor(c);
  const m = /^#?([0-9a-f]{6})$/i.exec(str(c).trim());
  return m ? parseInt(m[1], 16) : undefined;
}

// ---------- share links ----------

const b64urlEncode = (s) => Buffer.from(s, 'utf8').toString('base64url');
const b64urlDecode = (s) => Buffer.from(s, 'base64url').toString('utf8');

/** A YapHook link that opens these payloads in the editor (the same `#data=` format the site's Share button makes). */
export function shareUrl(payloads) {
  const backup = { version: 'yaphook-1', messages: [].concat(payloads).map((data) => ({ data })) };
  return `${BRAND.site}/#data=${b64urlEncode(JSON.stringify(backup))}`;
}

/** The payloads in a YapHook (`#data=`) or Discohook-style (`?data=`) link, or null when there's no link. */
export function readShareLink(text) {
  const m = /[#?&]data=([A-Za-z0-9_-]+)/.exec(String(text ?? ''));
  if (!m) return null;
  let json;
  try { json = JSON.parse(b64urlDecode(m[1])); } catch {
    throw new UserError("That share link is broken or cut off. Copy it again with **Share** in YapHook.");
  }
  return payloadsFrom(json);
}

/** Single payload, a list of them, or a `{ messages: [{ data }] }` backup (YapHook or Discohook). */
export function payloadsFrom(json) {
  let list;
  if (Array.isArray(json)) list = json;
  else if (isObj(json) && Array.isArray(json.messages)) list = json.messages.map((m) => (isObj(m?.data) ? m.data : m));
  else list = [json];
  const out = list.filter(isObj).map(cleanPayload).filter((p) => p.content || p.embeds.length);
  if (!out.length) throw new UserError('That has no message in it: it needs some content or at least one embed.');
  return out;
}

function cleanEmbed(e) {
  if (!isObj(e)) return null;
  const o = {};
  if (isObj(e.author) && str(e.author.name)) {
    o.author = { name: e.author.name };
    if (str(e.author.url)) o.author.url = e.author.url;
    if (str(e.author.icon_url)) o.author.icon_url = e.author.icon_url;
  }
  for (const k of ['title', 'url', 'description', 'timestamp']) if (str(e[k])) o[k] = e[k];
  const color = colorNumber(e.color);
  if (color !== undefined) o.color = color;
  if (Array.isArray(e.fields)) {
    const fields = e.fields.filter((f) => isObj(f) && (str(f.name) || str(f.value)))
      .map((f) => ({ name: str(f.name), value: str(f.value), ...(f.inline ? { inline: true } : {}) }));
    if (fields.length) o.fields = fields;
  }
  for (const k of ['image', 'thumbnail']) if (str(e[k]?.url)) o[k] = { url: e[k].url };
  if (isObj(e.footer) && str(e.footer.text)) {
    o.footer = { text: e.footer.text };
    if (str(e.footer.icon_url)) o.footer.icon_url = e.footer.icon_url;
  }
  return Object.keys(o).some((k) => k !== 'color') ? o : null;
}

/** Keep only what YapHook and Yapin' understand. */
export function cleanPayload(p) {
  const out = { content: str(p.content), embeds: (Array.isArray(p.embeds) ? p.embeds : []).map(cleanEmbed).filter(Boolean) };
  if (str(p.username)) out.username = p.username;
  if (str(p.avatar_url)) out.avatar_url = p.avatar_url;
  return out;
}

/**
 * The message someone handed the bot: a share link or JSON somewhere in `text`.
 * Returns payloads, or null if `text` has neither (so the caller can fall back to a replied-to message).
 */
export function readMessageInput(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const fromLink = readShareLink(s);
  if (fromLink) return fromLink;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  const raw = fenced ? fenced[1] : /^[[{]/.test(s) ? s : null;
  if (raw === null) return null;
  try { return payloadsFrom(JSON.parse(raw)); } catch (e) {
    if (e instanceof UserError) throw e;
    throw new UserError(`That JSON doesn't parse: ${e.message}. Copy it from **JSON** in YapHook.`);
  }
}

// ---------- Yapin' messages -> payloads ----------

/** A message from the API as a YapHook payload (buttons, layouts and attachments aren't part of YapHook). */
export function messageToPayload(message) {
  const p = cleanPayload({ content: message.content, embeds: message.embeds || [] });
  return { content: p.content || undefined, embeds: p.embeds.length ? p.embeds : undefined };
}

export const isLayoutMessage = (message) =>
  Array.isArray(message.components) && message.components.some((c) => c && c.type !== 'row' && c.type !== 1);

// ---------- payloads -> bot messages ----------

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const goodPicture = (u) => /^https:\/\//i.test(u) && u.length <= BOT_LIMITS.url && IMAGE_HOSTS.includes(hostOf(u));
const goodLink = (u) => /^https?:\/\/\S+$/i.test(u) && u.length <= BOT_LIMITS.url;
const embedChars = (e) => (e.title?.length || 0) + (e.description?.length || 0) + (e.author?.name?.length || 0)
  + (e.footer?.text?.length || 0) + (e.fields || []).reduce((n, f) => n + f.name.length + f.value.length, 0);

/**
 * Fit a webhook payload into what a bot message can carry. Returns { content, embeds, warnings }.
 * Pictures from hosts Yapin' doesn't allow are dropped (Yapin' would refuse the whole message).
 */
export function toBotMessage(payload) {
  const warnings = new Set();
  const p = cleanPayload(payload);
  if (p.username || p.avatar_url) warnings.add('Custom names and avatars only work through a webhook, so I posted as myself.');
  let content = p.content;
  if (content.length > BOT_LIMITS.content) { content = content.slice(0, BOT_LIMITS.content); warnings.add(`Content was cut to ${BOT_LIMITS.content} characters.`); }
  let embeds = p.embeds;
  if (embeds.length > BOT_LIMITS.embeds) { embeds = embeds.slice(0, BOT_LIMITS.embeds); warnings.add(`Bots can send ${BOT_LIMITS.embeds} embeds per message, so the rest were left out.`); }
  let total = 0;
  embeds = embeds.map((e0) => {
    const e = structuredClone(e0);
    if (e.fields?.length > BOT_LIMITS.fields) { e.fields = e.fields.slice(0, BOT_LIMITS.fields); warnings.add(`Bots can show ${BOT_LIMITS.fields} fields per embed, so extra fields were left out.`); }
    for (const k of ['image', 'thumbnail']) if (e[k] && !goodPicture(e[k].url)) { delete e[k]; warnings.add('A picture from a host Yapin\' doesn\'t allow for bots was left out (see `/help images`).'); }
    for (const o of [e.author, e.footer]) if (o?.icon_url && !goodPicture(o.icon_url)) { delete o.icon_url; warnings.add('An icon from a host Yapin\' doesn\'t allow for bots was left out (see `/help images`).'); }
    if (e.url && !goodLink(e.url)) delete e.url;
    if (e.author?.url && !goodLink(e.author.url)) delete e.author.url;
    total += embedChars(e);
    return e;
  }).filter((e) => Object.keys(e).some((k) => k !== 'color'));
  if (total > BOT_LIMITS.embedTotal) throw new UserError(`The embeds have ${total} characters in all; a message can hold ${BOT_LIMITS.embedTotal}.`);
  if (!content && !embeds.length) throw new UserError('After fitting it to bot limits there was nothing left to send.');
  return { content, embeds, warnings: [...warnings] };
}

export const fitsWebhook = (p) => p.embeds.length <= WEBHOOK_LIMITS.embeds && p.embeds.every((e) => (e.fields?.length || 0) <= WEBHOOK_LIMITS.fields);

// ---------- variables ----------

/**
 * Fill {member.mention}-style variables in every string of a payload. Unknown ones stay as typed.
 * Pictures and links that end up empty are dropped so the message still sends.
 */
export function applyVars(payload, vars) {
  const fill = (s) => s.replace(/\{([a-z_.]+)\}/gi, (all, k) => (Object.hasOwn(vars, k.toLowerCase()) ? String(vars[k.toLowerCase()] ?? '') : all));
  const walk = (v) => (typeof v === 'string' ? fill(v) : Array.isArray(v) ? v.map(walk) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  const out = walk(payload);
  for (const e of out.embeds || []) {
    for (const k of ['image', 'thumbnail']) if (e[k] && !e[k].url) delete e[k];
    for (const o of [e.author, e.footer]) if (o && 'icon_url' in o && !o.icon_url) delete o.icon_url;
    if ('url' in e && !e.url) delete e.url;
  }
  return out;
}

export const VARIABLES = [
  ['{member.mention}', 'Pings them: <@id>'],
  ['{member.name}', 'Their username'],
  ['{member.display_name}', 'Their display name (or username)'],
  ['{member.id}', 'Their user ID'],
  ['{member.avatar_url}', 'Link to their avatar (empty if none)'],
  ['{server.name}', 'The server name'],
  ['{server.id}', 'The server ID'],
  ['{server.members}', 'Member count after they joined or left'],
  ['{server.icon_url}', 'Link to the server icon (empty if none)'],
];

/** Yapin' picture paths → links (see /developers#pictures). */
export const picture = (bucket, p) => (!p ? '' : p.startsWith('/') ? `https://www.yapin.gg${p}` : `https://files.yapper.website/${bucket}/${p}`);
