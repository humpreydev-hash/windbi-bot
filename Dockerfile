# Gunakan image Node.js versi 18 sebagai dasar
FROM node:18-slim

# Set direktori kerja di dalam container
WORKDIR /app

# Install library sistem yang dibutuhkan oleh Chromium/Puppeteer
# --no-install-recommends untuk mengurangi ukuran image
RUN apt-get update && apt-get install -yq \
    libglib2.0-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Salin file package.json dan package-lock.json
COPY package*.json ./

# Install dependensi Node.js
RUN npm install

# Salin semua file source code ke dalam container
COPY . .

# Beritahu Puppeteer untuk mengabaikan sandbox dan menggunakan Chromium yang sudah diinstall
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Perintah untuk menjalankan aplikasi
CMD ["node", "index.js"]