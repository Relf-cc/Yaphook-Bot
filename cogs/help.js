// /help: an overview with topic buttons, or one topic straight away (/help buttons @someone).
import { Button } from '../yapper.js';
import { BRAND, BOT_LIMITS, IMAGE_HOSTS, WEBHOOK_LIMITS } from '../lib/config.js';
import { shift, USER_MENTION } from '../lib/parse.js';
import { card, command, footer, linksRow, rows } from '../lib/ui.js';
import { VARIABLES } from '../lib/yaphook.js';

const now = () => Math.floor(Date.now() / 1000);

/** Each topic: [button label, emoji, title, description, fields?]. */
const TOPICS = {
  start: ['Start', '🚀', 'Getting started', () => [
    `**${BRAND.name}** is a message and embed builder for Yapin' webhooks: **${BRAND.site.replace(/^https:\/\//, '')}**. This bot is its companion in your server.`,
    '',
    '**1.** Build a message at YapHook and send it through a webhook, or press **Share** to copy a link to it.',
    '**2.** Use the bot to do what webhooks can\'t: add **buttons**, **reaction roles**, a **welcomer** and **triggers**, or post and edit messages as the bot.',
    '**3.** Seen a message you like? **Reply** to it with `/restore` to open a copy in YapHook.',
    '',
    'Anywhere the bot asks for a message you can give it a **share link**, **JSON** from YapHook, or **reply** to an existing message.',
  ].join('\n')],
  sharing: ['Share links', '🔗', 'Share links & JSON', () => [
    `YapHook share links look like \`${BRAND.site}/#data=…\`. The whole message is inside the link, so nothing is stored anywhere and they never expire.`,
    '',
    '**Share links never contain webhook URLs**, so they\'re safe to post.',
    '',
    'The bot reads share links (YapHook or Discohook `?data=`), raw JSON, or JSON in a ```` ```json ```` code block. Use `/json` to get any message\'s JSON for YapHook\'s JSON editor.',
  ].join('\n')],
  restore: ['Restore', '♻️', 'Restoring messages', () => [
    '**Reply** to any message with `/restore` and you get a YapHook link with a copy of it: content and embeds, ready to edit and send again.',
    '',
    'No reply? Put the message link or ID first: `/restore <message link>`.',
    '`/json` does the same but gives you the raw JSON.',
    '',
    '-# Buttons, layouts and attachments aren\'t part of YapHook, so they\'re left out.',
  ].join('\n')],
  send: ['Send & edit', '📨', 'Sending and editing as the bot', () => [
    'Webhook messages can\'t be edited later, and they can\'t have buttons. Messages sent **by the bot** can.',
    '',
    '`/send [#channel] <share link or JSON>`: post a YapHook message as the bot (up to 10 at once, from a multi-message share link).',
    '`/send #channel` while **replying** to a message copies that message.',
    '`/edit <share link or JSON>` while **replying** to one of my messages swaps its content and embeds. Its buttons stay.',
    '',
    `-# Bot messages hold ${BOT_LIMITS.embeds} embeds of ${BOT_LIMITS.fields} fields; webhooks hold ${WEBHOOK_LIMITS.embeds} of ${WEBHOOK_LIMITS.fields}. Extra ones are left out and you're told. Needs Manage Messages.`,
  ].join('\n')],
  buttons: ['Buttons', '🔘', 'Buttons', () => [
    'Add buttons to messages the bot sent (post yours with `/send` first). **Reply** to the message with:',
    '',
    '`/buttons add role @Role` toggles a role on click',
    '`/buttons add role-add @Role` / `role-remove @Role` only gives / only takes',
    '`/buttons add message <share link>` shows a message only the clicker sees',
    '`/buttons add link https://…` opens a link',
    '',
    'Options go at the end: `label="Get pinged" style=green emoji=🔔`. Styles: `blurple`, `grey`, `green`, `red`.',
    '`/buttons list` shows them with remove buttons; `/buttons clear` removes all. Needs Manage Server.',
  ].join('\n')],
  'reaction-roles': ['Reaction roles', '🎭', 'Reaction roles', () => [
    'React to get a role, unreact to lose it. **Reply** to the message with:',
    '',
    '`/reaction-role create 🎮 @Gamer`',
    '`/reaction-role delete 🎮` (or no emoji to remove all on that message)',
    '`/reaction-role list` (no reply: every reaction role in the server)',
    '',
    'The bot reacts first so people can click. Use regular emoji. Works on any message, webhook ones too. Needs Manage Server, and the bot needs **Manage Roles** with its role above the ones it gives.',
  ].join('\n')],
  welcomer: ['Welcomer', '👋', 'Welcomer', () => [
    'Greet people who join, or say bye when they leave.',
    '',
    '`/welcomer set join #welcome` uses a built-in card, or add a share link / reply to a message to use your own.',
    '`/welcomer set leave #goodbye <share link> delete-after=1h`',
    '`/welcomer view join` · `/welcomer test join` · `/welcomer delete join`',
    '',
    'Templates can use variables like `{member.mention}` and `{server.name}`, see `/help variables`. Needs Manage Server. For more steps (roles, DMs, waits), use `/triggers`.',
  ].join('\n')],
  triggers: ['Triggers', '⚡', 'Triggers', () => [
    'A trigger runs a list of actions when someone joins or leaves.',
    '',
    '`/triggers add <name> join` (or `leave`)',
    '`/triggers action <name> send #channel <share link>`',
    '`/triggers action <name> dm <share link>`',
    '`/triggers action <name> role-add @Role` · `role-remove @Role`',
    '`/triggers action <name> wait 30s`',
    '`/triggers action <name> delete-after 1h` (removes the last message the trigger sent)',
    '`/triggers view <name>` to enable, test, delete, or remove actions with buttons. `/triggers list` for all.',
    '',
    'Same variables as the welcomer. Needs Manage Server.',
  ].join('\n')],
  variables: ['Variables', '🧩', 'Variables', () => [
    'Use these in welcomer and trigger messages (content, embed text, links and pictures):',
    '',
    ...VARIABLES.map(([v, d]) => `\`${v}\` ${d}`),
  ].join('\n')],
  formatting: ['Formatting', '✍️', 'Formatting', () => [
    '`**bold**` · `*italic*` · `__underline__` · `~~strike~~` · `||spoiler||` · `` `code` ``',
    '`[masked link](https://yapin.gg)` · `# heading` · `-# subtext` · `> quote` · `- list`',
    '',
    '**Mentions:** `<@user id>` · `<@&role id>` · `<#channel id>`',
    '`/format @someone #channel @Role` prints the code to paste into YapHook.',
    '`/id` gives raw IDs (this server and channel and you; reply to a message for its ID too).',
  ].join('\n')],
  timestamps: ['Timestamps', '🕒', 'Timestamps', () => [
    `\`<t:UNIX:STYLE>\` shows a time in each reader's own time zone. Right now is \`${now()}\`.`,
    '',
    ...[['t', 'Short time'], ['T', 'Long time'], ['d', 'Short date'], ['D', 'Long date'], ['f', 'Date & time'], ['F', 'Full date & time'], ['R', 'Relative']]
      .map(([s, l]) => `\`<t:${now()}:${s}>\` <t:${now()}:${s}> · ${l}`),
    '',
    '`/timestamp in 2 hours` · `/timestamp 2026-12-25 18:00` · `/timestamp 3 days ago` makes them for you.',
  ].join('\n')],
  limits: ['Limits', '📏', 'Limits', () => [
    '```',
    `                   Webhook   Bot`,
    `Content            ${String(WEBHOOK_LIMITS.content).padEnd(10)}${BOT_LIMITS.content}`,
    `Embeds per msg     ${String(WEBHOOK_LIMITS.embeds).padEnd(10)}${BOT_LIMITS.embeds}`,
    `Fields per embed   ${String(WEBHOOK_LIMITS.fields).padEnd(10)}${BOT_LIMITS.fields}`,
    `All embed text     ${String(WEBHOOK_LIMITS.embedTotal).padEnd(10)}${BOT_LIMITS.embedTotal}`,
    `Custom name/avatar yes       no`,
    `Buttons            no        ${BOT_LIMITS.rows} rows × ${BOT_LIMITS.buttonsPerRow}`,
    `Edit later         no        yes`,
    '```',
    'Title 256 · description 4096 · field name 256 / value 1024 · footer 2048 · author 256.',
  ].join('\n')],
  webhooks: ['Webhooks', '🪝', 'Webhooks', () => [
    '**Make one:** Edit channel → **Webhooks** → New (needs Manage Webhooks, up to 10 per channel). Give it a name and picture, then copy the URL.',
    'It looks like `https://www.yapin.gg/api/webhooks/<id>/<token>`.',
    '',
    `**Use it:** paste it into the Webhooks box at ${BRAND.site.replace(/^https:\/\//, '')} and press Send.`,
    '',
    '**Keep it secret.** Anyone with the URL can post in that channel. Never paste it in chat. If it leaks, press **New URL** on the webhook to kill the old one.',
    '',
    '-# Bots can\'t make or edit webhooks on Yapin\', so this bot never asks for your webhook URL.',
  ].join('\n')],
  permissions: ['Permissions', '🛡️', 'Permissions', () => [
    '**Who can use what**',
    '• Anyone: `/help` `/restore` `/json` `/format` `/id` `/timestamp` `/invite` `/webhook`',
    '• Manage Messages: `/send` `/edit`',
    '• Manage Server: `/buttons` `/reaction-role` `/welcomer` `/triggers` `/profile`',
    '',
    '**What the bot needs** (Server settings → Members → the bot → Roles)',
    '• **Manage Roles** for role buttons, reaction roles and trigger roles, with its role **above** those roles',
    '• **Manage Messages** for `delete-after`',
    '• **Manage Nicknames** for `/profile name`',
  ].join('\n')],
  images: ['Pictures', '🖼️', 'Pictures in bot messages', () => [
    'Yapin\' only lets bots show pictures from some hosts. Pictures from anywhere else are left out when the bot sends your message (webhooks drop them too).',
    '',
    IMAGE_HOSTS.map((h) => `\`${h}\``).join(' · '),
  ].join('\n')],
};

const ALIASES = { tags: 'start', share: 'sharing', json: 'sharing', 'reaction-role': 'reaction-roles', rr: 'reaction-roles', reactions: 'reaction-roles', welcome: 'welcomer', trigger: 'triggers', vars: 'variables', markdown: 'formatting', format: 'formatting', mentions: 'formatting', time: 'timestamps', timestamp: 'timestamps', webhook: 'webhooks', perms: 'permissions', pictures: 'images', image: 'images', edit: 'send' };

const find = (q) => {
  const k = String(q ?? '').toLowerCase().replace(/^\//, '');
  if (TOPICS[k]) return k;
  if (ALIASES[k]) return ALIASES[k];
  return Object.keys(TOPICS).find((t) => t.startsWith(k) || TOPICS[t][2].toLowerCase().includes(k)) || null;
};

const topicCard = (key) => {
  const [, emoji, title, body] = TOPICS[key];
  return footer(card(`${emoji} ${title}`, body()), '/help for all topics');
};

const topicButtons = () => rows(Object.entries(TOPICS).map(([k, [label, emoji]]) => Button.secondary(label, `help:${k}`).emoji(emoji)));

const overview = (me) => footer(card(`${BRAND.emoji} ${me?.display_name || BRAND.name} help`, [
  `The companion bot for **[${BRAND.name}](${BRAND.site})**, the message & embed builder for Yapin' webhooks.`,
  'Pick a topic below (only you will see it), or type `/help <topic>`.',
])
  .field('Messages', '`/restore` `/json` `/send` `/edit`', true)
  .field('Interactive', '`/buttons` `/reaction-role`', true)
  .field('Automation', '`/welcomer` `/triggers`', true)
  .field('Tools', '`/format` `/id` `/timestamp` `/webhook`', true)
  .field('Bot', '`/profile` `/invite` `/help`', true)
  .field('Tip', '**Reply** to a message with a command to point it at that message.', true));

export default function setup(bot) {
  bot.command('help', 'Help with YapHook and this bot: /help, or /help <topic> [@someone]', command(bot, async (msg) => {
    const [q, rest] = shift(msg.args);
    if (!q) return msg.reply('', { embeds: [overview(bot.me)], components: topicButtons() });
    const key = find(q);
    if (!key) return msg.reply('', { embeds: [card('No topic like that', `Try one of: ${Object.keys(TOPICS).map((k) => `\`${k}\``).join(', ')}`)] });
    // "/help buttons @someone" pings them, Discohook style.
    const who = USER_MENTION.exec(rest)?.[1];
    return msg.reply(who ? `<@${who}>` : '', { embeds: [topicCard(key)], components: [linksRow()] });
  }));

  bot.onButton(/^help:/, (i) => {
    const key = find(i.custom_id.slice(5));
    return key ? i.ephemeral('', { embeds: [topicCard(key)] }) : i.ack();
  });

  // "@YapHook" with no command: point people at /help.
  bot.on('message', (msg) => {
    if (msg.mentioned && !msg.command && !msg.author_bot) {
      msg.reply('', { embeds: [card(null, `Hey ${msg.authorMention}! I'm the **${BRAND.name}** bot. Type \`/help\` to see what I can do.`)], components: [linksRow()] });
    }
  });
}
