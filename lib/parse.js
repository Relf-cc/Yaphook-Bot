// Reading command arguments. Yapin' commands are free text (`/cmd the rest`), so options are parsed here.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_ALL = new RegExp(UUID, 'gi');
export const isId = (s) => new RegExp(`^${UUID}$`, 'i').test(String(s ?? ''));

export const USER_MENTION = /<@!?([\w-]+)>/;
export const ROLE_MENTION = /<@&([\w-]+)>/;
export const CHANNEL_MENTION = /<#([\w-]+)>/;
export const CUSTOM_EMOJI = /<(a?):([\w~-]+):([\w-]+)>/;

/** Thrown for mistakes the person can fix; the message is shown to them as is. */
export class UserError extends Error {}

/**
 * The first word of `str` and the rest, untouched. "Double quotes" group words: shift('"Get role" x') → ['Get role', 'x'].
 */
export function shift(str) {
  const s = String(str ?? '').trimStart();
  if (!s) return ['', ''];
  const q = /^"([^"]*)"/.exec(s) || /^“([^”]*)”/.exec(s);
  if (q) return [q[1], s.slice(q[0].length).trim()];
  const m = /^(\S+)\s*([\s\S]*)$/.exec(s);
  return [m[1], m[2].trim()];
}

/** All words, quotes respected. */
export function words(str) {
  const out = [];
  let rest = String(str ?? '');
  while (rest.trim()) {
    const [w, r] = shift(rest);
    out.push(w);
    rest = r;
  }
  return out;
}

/**
 * Pull `key=value` / `key="two words"` options out of a string.
 * takeOptions('role @x label="Get it" style=green', ['label', 'style']) → [{ label: 'Get it', style: 'green' }, 'role @x']
 */
export function takeOptions(str, keys) {
  const opts = {};
  const re = new RegExp(`(^|\\s)(${keys.join('|')})=(?:"([^"]*)"|“([^”]*)”|(\\S+))`, 'gi');
  const rest = String(str ?? '').replace(re, (_, pre, k, a, b, c) => {
    opts[k.toLowerCase()] = a ?? b ?? c;
    return pre;
  });
  return [opts, rest.replace(/\s{2,}/g, ' ').trim()];
}

/** Every UUID in a piece of text, in order. */
export const idsIn = (s) => String(s ?? '').match(UUID_ALL) || [];

/** A message link or id (not a mention). */
export const looksLikeMessageRef = (s) => !!s && !/^<[@#]/.test(s) && !/[#?&]data=/.test(s) && idsIn(s).length > 0;

/**
 * Where a message is: from a reply, or a link / "channel-id message-id" / message id at the start of `args`.
 * Returns { ref: { channelId, messageId } | null, rest }.
 */
export function messageRef(msg, args) {
  if (msg.reply_to_id) return { ref: { channelId: msg.channel_id, messageId: msg.reply_to_id }, rest: String(args ?? '').trim() };
  let [first, rest] = shift(args);
  if (!looksLikeMessageRef(first)) return { ref: null, rest: String(args ?? '').trim() };
  let ids = idsIn(first);
  // "channel-id message-id" as two words.
  if (ids.length === 1) {
    const [second, after] = shift(rest);
    if (isId(second)) { ids = [ids[0], second]; rest = after; }
  }
  const ref = ids.length >= 2
    ? { channelId: ids[ids.length - 2], messageId: ids[ids.length - 1] }
    : { channelId: msg.channel_id, messageId: ids[0] };
  return { ref, rest };
}

const UNITS = { s: 1, sec: 1, secs: 1, second: 1, seconds: 1, m: 60, min: 60, mins: 60, minute: 60, minutes: 60, h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, d: 86400, day: 86400, days: 86400, w: 604800, week: 604800, weeks: 604800 };

/** "90", "1h30m", "2 hours", "45s" → seconds, or null. A bare number is seconds. */
export function parseDuration(str) {
  const s = String(str ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0;
  let matched = '';
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)) {
    const unit = UNITS[m[2]];
    if (!unit) return null;
    total += Number(m[1]) * unit;
    matched += m[0];
  }
  return matched.replace(/\s/g, '') === s.replace(/\s|and|,/g, '') && total > 0 ? Math.round(total) : null;
}

/**
 * When something happens, as unix seconds: "now", 1760000000, an ISO date, "2026-12-25 18:00",
 * "in 2h", "3 days ago", "tomorrow". Returns null if it can't tell.
 */
export function parseWhen(str, now = Date.now()) {
  const s = String(str ?? '').trim().toLowerCase();
  const nowS = Math.floor(now / 1000);
  if (!s || s === 'now') return nowS;
  if (/^\d{9,10}$/.test(s)) return Number(s);
  if (/^\d{12,13}$/.test(s)) return Math.floor(Number(s) / 1000);
  if (s === 'tomorrow') return nowS + 86400;
  if (s === 'yesterday') return nowS - 86400;
  let m = /^(?:in\s+)?(.+?)\s+ago$/.exec(s);
  if (m) { const d = parseDuration(m[1]); if (d !== null) return nowS - d; }
  m = /^(?:in\s+|\+)?(.+)$/.exec(s);
  if (m && !/\d{4}-/.test(s)) { const d = parseDuration(m[1]); if (d !== null) return nowS + d; }
  const t = Date.parse(s.toUpperCase().replace(/^(\d{4}-\d\d-\d\d) (\d)/, '$1T$2'));
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/** "1h 30m" for 5400. */
export function formatDuration(sec) {
  if (!sec) return '0s';
  const parts = [];
  for (const [u, n] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) {
    if (sec >= n) { parts.push(`${Math.floor(sec / n)}${u}`); sec %= n; }
  }
  return parts.join(' ');
}

/** Unicode emoji compare without the invisible variation selector (❤ vs ❤️). */
export const sameEmoji = (a, b) => String(a ?? '').replace(/️/g, '') === String(b ?? '').replace(/️/g, '');

/** A single emoji (unicode or <:name:id>) at the start of a string. */
export function takeEmoji(str) {
  const [first, rest] = shift(str);
  if (CUSTOM_EMOJI.test(first) || /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(first)) return [first, rest];
  return [null, String(str ?? '').trim()];
}
