FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY data/urls.example.json ./data/urls.example.json

# data/urls.json a data/db/ se pripojuji jako persistent volume (viz README)
RUN mkdir -p data/db

# index.js pri kazdem skutecnem tiku zapisuje heartbeat (viz src/healthcheck.js) -
# pokud zestara (proces spadl nebo scraper zatuhl), healthcheck selze a kontejner se restartuje
HEALTHCHECK --interval=1m --timeout=5s --start-period=30s --retries=3 \
  CMD node src/healthcheck.js

CMD ["node", "src/index.js"]
