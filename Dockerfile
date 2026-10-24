# YapHook bot. No dependencies to install: the bot is plain Node (yapper.js is the whole SDK).
# Node 22+ has WebSocket built in, so the SDK uses Yapin's gateway when it's on for the bot, else long polling.
FROM node:22-alpine

ENV NODE_ENV=production \
    YAPHOOK_DATA_FILE=/app/data/yaphook.json

WORKDIR /app

COPY package.json bot.js yapper.js ./
COPY lib ./lib
COPY cogs ./cogs

# Settings live in /app/data; mount a volume there so they survive new containers.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
USER node

# The bot saves its settings on SIGTERM (docker stop).
STOPSIGNAL SIGTERM
CMD ["node", "bot.js"]
