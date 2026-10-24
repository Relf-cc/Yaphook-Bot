// Branding and limits shared by every cog.

export const BRAND = {
  name: 'YapHook',
  /** YapHook orange (#ff6b4a), the same accent the site uses. */
  color: 0xff6b4a,
  success: 0x3fcf82,
  danger: 0xf2555a,
  warn: 0xffcc66,
  emoji: '🪝',
  site: (process.env.YAPHOOK_SITE || 'https://yaphook.dev').replace(/\/$/, ''),
  server: 'https://yapin.gg/invite/yaphook',
  docs: 'https://www.yapin.gg/developers',
  status: 'yaphook.dev · /help',
};

/** What a bot message may hold (webhooks allow more: 10 embeds, 25 fields). */
export const BOT_LIMITS = {
  content: 2000,
  embeds: 5,
  fields: 10,
  embedTotal: 6000,
  rows: 5,
  buttonsPerRow: 5,
  label: 80,
  /** Embed url fields (links and pictures). */
  url: 512,
};

export const WEBHOOK_LIMITS = { content: 2000, embeds: 10, fields: 25, embedTotal: 6000, username: 80 };

/** Per-server caps so one server can't fill the data file. */
export const CAPS = {
  triggers: 10,
  actions: 10,
  reactionRolesPerMessage: 20,
  reactionRoleMessages: 50,
  buttonsPerServer: 250,
  maxWait: 300,
  maxDeleteAfter: 86400,
  sendMessages: 10,
};

/** Hosts Yapin' accepts for embed pictures (from /developers#embeds), plus Yapin's own uploads. */
export const IMAGE_HOSTS = [
  'files.yapper.website', 'www.yapin.gg', 'yapin.gg',
  'i.imgur.com', 'media.tenor.com', 'media.giphy.com', 'i.giphy.com', 'upload.wikimedia.org',
  'raw.githubusercontent.com', 'avatars.githubusercontent.com', 'user-images.githubusercontent.com',
  'i.ytimg.com', 'cdn.discordapp.com', 'media.discordapp.net', 'pbs.twimg.com', 'i.redd.it',
  'static-cdn.jtvnw.net', 'i.scdn.co', 's4.anilist.co', 'cdn.myanimelist.net', 'nekos.best', 'cdn.weeb.sh',
];
