# YapHook Bot

The companion bot for [YapHook](https://yaphook.dev), the message & embed builder for [Yapin'](https://yapin.gg) webhooks.
It's modelled on the [Discohook bot](https://github.com/discohook/discohook/tree/main/packages/bot), rebuilt for Yapin's bot API.
Questions? Join the [YapHook server](https://yapin.gg/invite/yaphook).

## What it does

| Command | What it does | Discohook equivalent |
| --- | --- | --- |
| `/help [topic] [@someone]` | Overview with topic buttons; topics answer privately | `/help` |
| `/restore` | **Reply** to any message → a YapHook link with a copy of it | `/restore`, "Restore" app |
| `/json` | **Reply** to any message → its JSON for YapHook's JSON editor | "Debug" app |
| `/send [#channel] <share link\|JSON>` | Post a YapHook message as the bot (or reply to copy a message) | — |
| `/edit <share link\|JSON>` | **Reply** to one of the bot's messages to change it | "Quick Edit" app |
| `/buttons add\|list\|remove\|clear` | Role toggle / give / take, private message, and link buttons | `/buttons` |
| `/reaction-role create\|delete\|list` | React to get a role, unreact to lose it | `/reaction-role` |
| `/welcomer set\|view\|test\|delete join\|leave` | Hello / goodbye messages with variables and `delete-after` | `/welcomer` |
| `/triggers add\|action\|view\|list\|remove\|delete` | On join/leave: send, DM, give/take role, wait, delete-after | `/triggers` |
| `/format`, `/id` | Mention codes and IDs for users, roles, channels, emoji | `/format`, `/id` |
| `/timestamp <when>` | `<t:…>` codes in every style (`in 2h`, `2026-12-25 18:00`, …) | — |
| `/profile name\|clear\|status` | The bot's nickname in this server (status: owner only) | `/profile` |
| `/invite`, `/webhook` | How to add the bot; how to make and use webhooks | `/invite`, `/webhook` |

Anywhere a command needs a message, it accepts a **YapHook share link** (`https://yaphook.dev/#data=…`),
Discohook `?data=` links, raw **JSON**, or a **reply** to an existing message.

### Why it differs from Discohook

Yapin's bot API is simpler than Discord's, so a few things work differently:

- **No slash-command options, autocomplete, modals or select menus.** Commands are `/name free text`, so replying
  to a message stands in for Discord's right-click Apps menu, and management screens use buttons with private
  (ephemeral) answers.
- **Bots can't create, list or edit webhooks.** That's why `/send` and `/edit` post and edit messages as the bot, and
  why `/buttons` only works on the bot's own messages. The bot never asks for a webhook URL.
- **Bot messages are smaller than webhook ones:** 5 embeds × 10 fields (webhooks: 10 × 25), no custom
  name/avatar, and pictures only from [Yapin's allowed hosts](https://www.yapin.gg/developers#embeds).
  The bot trims to fit and tells you what it dropped.
- **No per-server avatar or banner**, so `/profile` sets a server nickname only.
- **Discohook short links (`?share=`) aren't supported.** They live on Discohook's servers. YapHook links hold the
  whole message, so they never expire.

## Set up

1. **Make the bot.** In Yapin': Settings → Developer → type a name → Create. Copy the token (it's shown once).
2. **Add it to your server.** Same screen, or Server settings → Bots → Your bots → Add.
3. **Give it a role** with:
   - **Manage Roles**, for role buttons, reaction roles and trigger roles. Its role must sit above the roles it hands out.
   - **Manage Messages**, for `delete-after`.
   - **Manage Nicknames**, for `/profile name`.
4. **Run it** (Node 18+, no dependencies):

   ```sh
   cp .env.example .env     # then paste the token into .env
   npm start
   ```

Optional: give it the YapHook logo (export the site's `public/favicon.svg` as a PNG) in Settings → Developer → your bot → Profile.

### Who can use what

- **Anyone:** `/help` `/restore` `/json` `/format` `/id` `/timestamp` `/invite` `/webhook`
- **Manage Messages:** `/send` `/edit`
- **Manage Server** (or the server owner): `/buttons` `/reaction-role` `/welcomer` `/triggers` `/profile`

## Docker

```sh
cp .env.example .env          # paste YAPPER_BOT_TOKEN into it
docker compose up -d --build
docker compose logs -f        # "[yaphook] … ready" means it's online
```

- No ports to open: the bot connects out to Yapin', nothing connects in.
- Settings are kept in the `yaphook-data` volume (`/app/data` in the container), so rebuilding or recreating the
  container keeps them. Back up with
  `docker run --rm -v yaphook-bot_yaphook-data:/d -v "$PWD":/b alpine cp /d/yaphook.json /b/`.
- The token is read from `.env` at runtime and is never copied into the image (`.dockerignore` excludes it).
- `docker compose down` / `docker stop` sends SIGTERM, and the bot saves before it exits.
- Update: `git pull && docker compose up -d --build`.
- A rejected token makes the container exit with an error in the logs. `restart: unless-stopped` will keep retrying
  until you fix `.env` and run `docker compose up -d` again.

Without Compose: `docker build -t yaphook-bot . && docker run -d --name yaphook-bot --restart unless-stopped --env-file .env -v yaphook-data:/app/data yaphook-bot`.

## Hosting

The bot long-polls Yapin' for events, so it runs anywhere: your PC, a VPS, Docker, or Yapin's **Bot hosting** (verified bots only).
Bot hosting only takes a single uploaded `bot.js`, so link a public GitHub repo of this folder instead. It runs
`npm start` (`node bot.js`) and passes the token as `YAPPER_BOT_TOKEN`.

Settings (welcomers, triggers, buttons, reaction roles) are saved in `data/yaphook.json`. Set `YAPHOOK_DATA_FILE`
to keep them somewhere else. If your host wipes the disk on restart, point it at storage that persists.

## Layout

```text
bot.js              entry point: loads .env, cogs, starts polling
yapper.js           Yapin's official SDK (unchanged copy from YapinAssets/)
lib/config.js       branding (YapHook orange #ff6b4a), limits, allowed picture hosts
lib/yaphook.js      share links <-> payloads, fitting payloads to bot limits, {variables}
lib/parse.js        argument parsing: words, key=value options, message refs, durations, times
lib/ui.js           cards, the command/button wrappers (permission checks + friendly errors), resolvers
lib/perms.js        Manage Server / Manage Messages checks from Yapin' roles
lib/store.js        JSON file storage
lib/automation.js   member variables + sending templates (welcomer and triggers)
cogs/*.js           one file per feature; each is loaded with bot.loadCogs('./cogs')
test/smoke.js       offline end-to-end test against a fake Yapin' API
```

## Test

```sh
npm test
```

Runs every command, button and event against an in-memory fake of the Yapin' API. No token or network needed.
