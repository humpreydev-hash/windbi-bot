const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// API endpoint untuk meme
const MEME_API = 'https://api-faa.my.id/faa/meme';

// Folder untuk menyimpan session
const SESSION_DIR = './sessions';

// Membuat folder session jika belum ada
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR);
}

// Fungsi utama untuk membuat socket
async function startBot() {
  // Menggunakan auth state untuk multi-device
  const { state, saveCreds } = await useMultiFileAuthState(`${SESSION_DIR}/auth_info_baileys`);
  
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using Baileys v${version}${isLatest ? ' (latest)' : ''}`);
  
  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    logger: P({ level: 'silent' }),
    auth: state
  });

  // Menyimpan kredensial
  sock.ev.on('creds.update', saveCreds);

  // Menangani QR code
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('QR Code ditemukan. Scan QR code ini:');
      qrcode.generate(qr, { small: true }, (code) => {
        console.log(code);
      });
    }
    
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
      console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
      if (shouldReconnect) {
        startBot();
      }
    } else if (connection === 'open') {
      console.log('Bot terhubung!');
    }
  });

  // Menangani pesan
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    
    if (!msg.message) return;
    
    const chatId = msg.key.remoteJid;
    const messageText = msg.message.conversation || 
                      (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) ||
                      '';
    
    // Cek jika pesan mengandung perintah <!>meme
    if (messageText && messageText.toLowerCase().includes('<!>meme')) {
      try {
        await sendMeme(sock, chatId);
      } catch (error) {
        console.error('Error sending meme:', error);
        await sock.sendMessage(chatId, { text: 'Maaf, gagal mengirim meme. Coba lagi nanti.' });
      }
    }
  });
}

// Fungsi untuk mengirim meme
async function sendMeme(sock, chatId) {
  try {
    // Mengambil meme dari API
    const response = await axios.get(MEME_API, {
      responseType: 'arraybuffer'
    });
    
    // Mengirim meme sebagai media
    await sock.sendMessage(chatId, {
      image: response.data,
      caption: 'Nih meme buat kamu! 😄'
    });
    
  } catch (error) {
    console.error('Error fetching meme:', error);
    throw error;
  }
}

// Memulai bot
startBot();