FROM node:20-slim

# Puppeteer / Chromium sistem bağımlılıkları
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    ca-certificates \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer kendi Chromium'unu indirmesin — sistem Chromium kullan
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

# Bağımlılıkları önce yükle (Docker layer cache için)
COPY package*.json ./
RUN npm install --omit=dev

# TypeScript derle
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm install typescript ts-node --save-dev && \
    npx tsc && \
    npm prune --production

# Chromium sandbox için
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app

USER pptruser

EXPOSE 3001

CMD ["node", "dist/index.js"]
