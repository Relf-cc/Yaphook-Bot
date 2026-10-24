// /invite and /webhook: how to get the bot into a server, and how webhooks work with YapHook.
import { Button, Row } from '../yapper.js';
import { BRAND } from '../lib/config.js';
import { card, command, footer, siteButton, supportButton } from '../lib/ui.js';

export default function setup(bot) {
  bot.command('invite', 'Add the YapHook bot to another server', command(bot, async (msg) => {
    const me = bot.me;
    const e = footer(card(`${BRAND.emoji} Add ${me?.display_name || BRAND.name} to a server`, [
      'You need **Manage Server** in the server you add it to.',
      '',
      me?.bot?.public
        ? '**Server settings → Bots → Community bots**, search for me and press **Add**.'
        : '**Server settings → Bots → Have a bot ID?** and paste my ID:',
      `\`\`\`\n${me?.id}\n\`\`\``,
      'Then give me a role with the permissions you need (`/help permissions`).',
    ].join('\n')));
    return msg.reply('', { embeds: [e], components: [new Row(siteButton(), supportButton(), Button.link('Yapin\' bots', 'https://www.yapin.gg/bots').emoji('🤖'))] });
  }));

  bot.command('webhook', 'How to make a Yapin\' webhook and send YapHook messages with it', command(bot, async (msg) => {
    const e = footer(card('🪝 Webhooks', [
      '**1. Make one.** Edit channel → **Webhooks** → New. Give it a name and a picture, then copy its URL. (Needs Manage Webhooks; up to 10 per channel.)',
      '',
      `**2. Build your message** at **${BRAND.site.replace(/^https:\/\//, '')}**, paste the URL into **Webhooks** and press **Send**.`,
      '',
      '**3. Keep the URL secret.** Anyone who has it can post in that channel. Don\'t paste it in chat; if it leaks, press **New URL** on the webhook.',
    ].join('\n')))
      .field('Need buttons or edits later?', 'Webhook messages can\'t have either. Press **Share** in YapHook and post it with `/send` instead.')
      .field('Want to change an old message?', '**Reply** to it with `/restore` to open a copy in YapHook.');
    return msg.reply('', { embeds: [e], components: [new Row(siteButton('Open YapHook'), Button.link('Webhook docs', `${BRAND.docs}#webhooks`).emoji('📘'))] });
  }));
}
