// YapHook bot: the companion to https://yaphook.dev for Yapin'. Run with `node bot.js` (Node 18+).
import fs from 'node:fs';
import { Bot } from './yapper.js';
import { BRAND } from './lib/config.js';
import { dataFile, flush } from './lib/store.js';

// A .env next to this file, if there is one (Yapin' bot hosting passes the token itself).
try {
  for (const line of fs.readFileSync(new URL('./.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line);
    if (m && !line.trimStart().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env */ }

const token = process.env.YAPPER_BOT_TOKEN;
if (!token) {
  console.error('Set YAPPER_BOT_TOKEN: copy .env.example to .env and paste your token (Settings → Developer → your bot → Token).');
  process.exit(1);
}

const bot = new Bot(token);
const cogs = await bot.loadCogs('./cogs');

bot.on('ready', (me) => {
  console.log(`[yaphook] ${me.display_name || me.username} ready · cogs: ${cogs.join(', ')} · data: ${dataFile}`);
  bot.setStatus('online', BRAND.status).catch(() => {});
});
bot.on('error', (e) => console.error(e?.cog ? `[yaphook] [${e.cog}${e.where ? ` ${e.where}` : ''}]` : '[yaphook]', e?.message || e));

// Save settings before exiting.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { bot.stop(); flush(); process.exit(0); });
}

bot.start().catch((e) => {
  console.error('[yaphook] could not start:', e.message);
  // exitCode, not exit(): exiting while fetch sockets close crashes Node on Windows.
  process.exitCode = 1;
});
