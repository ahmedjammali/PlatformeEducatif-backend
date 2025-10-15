FROM node:18-alpine

WORKDIR /app

# Install dependencies needed for Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Puppeteer to use the system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000
CMD ["npm", "run", "dev"]