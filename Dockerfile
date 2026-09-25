FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY data/urls.example.json ./data/urls.example.json

# data/urls.json a data/db/ se pripojuji jako persistent volume (viz README)
RUN mkdir -p data/db

CMD ["node", "src/index.js"]
