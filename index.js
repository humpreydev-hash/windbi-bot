import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import P from 'pino';
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import fse from 'fs-extra';

// API endpoint untuk meme
const MEME_API = 'https://api-faa.my.id/faa/meme';

// Folder untuk menyimpan session
const SESSION_DIR = './sessions';

// Membuat folder session jika belum ada
fse.ensureDirSync(SESSION_DIR);

// Fungsi untuk logging yang lebih baik
const logger = P({ 
  level: 'info',
  timestamp: () => `,"time":"${new Date().toLocaleString()}"`
});

// Fungsi utama untuk membuat socket
async function startBot() {
  try {
    // Menggunakan auth state untuk multi-device
    const { state, saveCreds } = await useMultiFileAuthState(`${SESSION_DIR}/auth_info_baileys`);
    
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`Using Baileys v${version}${isLatest ? ' (latest)' : ''}`);
    
    const sock = makeWASocket({
      version,
      printQRInTerminal: true,
      logger: P({ level: 'silent' }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      }
    });

    // Menyimpan kredensial
    sock.ev.on('creds.update', saveCreds);

    // Menangani QR code
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        logger.info('QR Code ditemukan. Scan QR code ini:');
        qrcode.generate(qr, { small: true }, (code) => {
          console.log(code);
        });
      }
      
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
        logger.info('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
        if (shouldReconnect) {
          startBot();
        }
      } else if (connection === 'open') {
        logger.info('Bot terhubung!');
      }
    });

    // Menangani pesan dengan fitur advanced
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
          logger.error('Error sending meme:', error);
          await sock.sendMessage(chatId, { text: 'Maaf, gagal mengirim meme. Coba lagi nanti.' });
        }
      }
      
      // Fitur tambahan: cek command !help
      if (messageText && messageText.toLowerCase().includes('!help')) {
        await sock.sendMessage(chatId, {
          text: `🤖 *Bot Meme Generator*\n\n` +
                `✨ Perintah:\n` +
                `• <!>meme - Dapatkan meme acak\n` +
                `• !help - Lihat bantuan ini\n\n` +
                `📝 Made with Node.js & Baileys`
        });
      }
    });

    // Menangani error global
    sock.ev.on('connection.update', (update) => {
      if (update.connection === 'close') {
        logger.error('Connection lost, reconnecting...');
        setTimeout(startBot, 5000);
      }
    });

  } catch (error) {
    logger.error('Bot startup error:', error);
    setTimeout(startBot, 10000);
  }
}

// Fungsi untuk mengirim meme dengan retry mechanism
async function sendMeme(sock, chatId) {
  const maxRetries = 3;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      // Mengambil meme dari API dengan timeout
      const response = await axios.get(MEME_API, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
      
      // Mengirim meme sebagai media
      await sock.sendMessage(chatId, {
        image: response.data,
        caption: 'Nih meme buat kamu! 😄'
      });
      
      return; // Success, exit function
      
    } catch (error) {
      retryCount++;
      logger.error(`Attempt ${retryCount} failed:`, error.message);
      
      if (retryCount >= maxRetries) {
        throw new Error(`Failed to fetch meme after ${maxRetries} attempts`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Memulai bot dengan error handling
startBot().catch(error => {
  logger.error('Bot failed to start:', error);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});