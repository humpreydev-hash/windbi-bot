import * as baileys from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { writeFile, readFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync, rmSync } from 'fs';

// --- PENYESUAIAN UNTUK ESM ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// -----------------------------

// Ambil fungsi yang diperlukan dari baileys
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} = baileys;

// --- KONFIGURASI BOT ---
const ownerNumber = '6285929088764@s.whatsapp.net'; // Ganti dengan nomor WA kamu
const botPrefix = ';'; // Menggunakan prefix sesuai permintaan Anda
let selfMode = false; // State untuk mode self

// Path untuk Railway (sesuaikan)
const sessionId = process.env.RAILWAY_SERVICE_NAME || 'session';
const authPath = path.join(__dirname, 'auth_info_' + sessionId); // Sesi unik per service
// -------------------------

// --- FUNGSI HELPER ---
function extractMessageText(msg) {
  const msgType = Object.keys(msg.message)[0];
  if (msgType === 'conversation') return msg.message.conversation;
  if (msgType === 'extendedTextMessage') return msg.message.extendedTextMessage.text;
  if (msgType === 'imageMessage') return msg.message.imageMessage.caption;
  if (msgType === 'videoMessage') return msg.message.videoMessage.caption;
  return '';
}

// --- FUNGSI-FUNGSI FITUR ---

// 1. Menu
async function showMenu(sock, message) {
  const menuText = `
╭╼━━━━━━━━━━━━━━━━━━━━╾❐
│ 𝗪𝗜𝗡𝗗𝗕𝗜 𝗕𝗢𝗧 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣
├╼━━━━━━━━━━━━━━━━━━━━╾╮
│ Bot ini dibuat oleh aal
│ [humpreyDev]. Bot simple
│ menggunakan Node.js.
╰╼━━━━━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗣𝗨𝗕𝗟𝗜𝗞 ⧽━╾❐
│ • ;stiker <reply gambar>
│ • ;menu
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗔𝗗𝗠𝗜𝗡 ⧽━╾❐
│ • ;self
│ • ;unself
╰╼━━━━━━━━━━━━━━━━╾❏
> copyright aal dev
> humpreyDEV
    `;
  await sock.sendMessage(message.key.remoteJid, { text: menuText });
}

// 2. Self / Unself
async function selfCommand(sock, message) {
  selfMode = true;
  return sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self diaktifkan.' });
}

async function unselfCommand(sock, message) {
  selfMode = false;
  return sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self dinonaktifkan.' });
}

// 3. Stiker (Fitur utama Anda)
async function stikerCommand(sock, message) {
  const msgType = Object.keys(message.message)[0];
  const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
  
  if (!quoted?.imageMessage) {
    return sock.sendMessage(
      message.key.remoteJid,
      { text: "Reply gambar dengan ;stiker <nama>" },
      { quoted: message }
    );
  }

  const text = extractMessageText(message);
  const author = text.split(" ")[1] || "humpreyDev";

  try {
    const stream = await downloadContentFromMessage(
      quoted.imageMessage,
      "image"
    );

    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    // Konversi gambar ke WebP dengan metadata stiker
    const webpBuffer = await sharp(buffer)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80 })
      .toBuffer();

    await sock.sendMessage(
      message.key.remoteJid,
      {
        sticker: webpBuffer,
        packName: "Sticker Pack",
        packAuthor: author,
      },
      { quoted: message }
    );
    
    console.log("✅ Sticker sent successfully");
  } catch (error) {
    console.error("Error creating sticker:", error);
    sock.sendMessage(
      message.key.remoteJid,
      { text: "Gagal membuat stiker. Error: " + error.message },
      { quoted: message }
    );
  }
}

// --- FUNGSI UTAMA BOT ---
async function startBot() {
  console.log('Memulai bot WhatsApp...');

  // Pastikan folder auth ada
  if (!existsSync(authPath)) {
    mkdirSync(authPath, { recursive: true });
    console.log("Folder auth dibuat");
  }

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Menggunakan WA Web v${version.join('.')}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Chrome", "Windows", "10.0"],
    defaultStoreOptions: { syncHistory: false },
    options: {
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 120000, // 2 menit timeout
      keepAliveIntervalMs: 30000,
      qrTimeout: 120000, // QR timeout 2 menit
      retryRequestDelayMs: 2000,
      maxRetries: 20,
      generateHighQualityLinkPreview: true,
      auth: {
        creds: state.creds,
        keys: state.keys,
      },
      defaultQueryTimeoutMs: 60000,
      fetchLatest: true,
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n=== QR CODE DITERIMA ===');
      console.log('Buka link berikut di browser untuk melihat QR code:');
      
      // Generate QR code URL menggunakan API
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
      console.log(qrUrl);
      
      console.log('\nAtau scan QR code di bawah ini:');
      qrcode.generate(qr, { small: true });
      console.log('=========================\n');
      console.log('⚠️ QR Code hanya berlaku 2 menit! Segera scan!');
      
      // Simpan QR ke file untuk backup
      writeFile(path.join(process.cwd(), 'qr.txt'), qr)
        .then(() => console.log('QR juga disimpan di file qr.txt'))
        .catch(err => console.error('Gagal menyimpan QR:', err));
    }
    
    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`Connection closed. Status: ${statusCode}, Reconnecting: ${shouldReconnect}`);
      
      if (statusCode === DisconnectReason.connectionClosed) {
        console.log('Koneksi ditutup, mencoba reconnect dalam 5 detik...');
        setTimeout(() => startBot(), 5000);
      } else if (statusCode === DisconnectReason.connectionLost) {
        console.log('Koneksi hilang, mencoba reconnect dalam 5 detik...');
        setTimeout(() => startBot(), 5000);
      } else if (statusCode === DisconnectReason.timedOut) {
        console.log('Koneksi timeout, mencoba reconnect dalam 10 detik...');
        setTimeout(() => startBot(), 10000);
      } else if (statusCode === DisconnectReason.badSession) {
        console.log('Session tidak valid, menghapus session dan memulai ulang...');
        if (existsSync(authPath)) {
          rmSync(authPath, { recursive: true, force: true });
        }
        setTimeout(() => startBot(), 5000);
      } else if (statusCode === 515) { // Restart Required
        console.log('Restart diperlukan, memulai ulang bot tanpa menghapus session...');
        setTimeout(() => startBot(), 3000); // Cepat restart untuk status 515
      } else if (shouldReconnect) {
        console.log('Mencoba reconnect dalam 5 detik...');
        setTimeout(() => startBot(), 5000);
      } else {
        console.log('Session tidak valid, menghapus session dan memulai ulang...');
        if (existsSync(authPath)) {
          rmSync(authPath, { recursive: true, force: true });
        }
        setTimeout(() => startBot(), 5000);
      }
    } else if (connection === 'open') {
      console.log('✅ BOT CONNECTED - Bot siap digunakan!');
      
      // Kirim pesan notifikasi ke nomor sendiri
      try {
        const ownNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sock.sendMessage(ownNumber, { 
          text: "🤖 Bot WhatsApp aktif! Kirim ;stiker <nama> dengan reply gambar untuk membuat stiker." 
        });
      } catch (error) {
        console.error('Gagal mengirim pesan notifikasi:', error);
      }
    }
  });

  // Listener untuk pesan masuk
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message) return;
    if (msg.message.protocolMessage) return;
    if (msg.key.fromMe) return;

    const senderJid = msg.key.remoteJid;
    const messageText = extractMessageText(msg);
    if (!messageText.startsWith(botPrefix)) return;

    const command = messageText.toLowerCase().trim().split(/ +/)[0];

    console.log(`\n--- Pesan Masuk ---`);
    console.log(`Dari: ${senderJid}`);
    console.log(`Command: ${command}`);
    console.log(`--------------------\n`);

    // --- SISTEM SELF MODE ---
    if (selfMode && senderJid !== ownerNumber) {
      return;
    }
    // --- AKHIR SISTEM ---

    try {
      switch (command) {
        case ';menu': 
        case ';help': 
          await showMenu(sock, msg); 
          break;
        case ';stiker': 
          await stikerCommand(sock, msg); 
          break;
        case ';self': 
          if (senderJid === ownerNumber) await selfCommand(sock, msg); 
          break;
        case ';unself': 
          if (senderJid === ownerNumber) await unselfCommand(sock, msg); 
          break;
        default: 
          await sock.sendMessage(senderJid, { text: `Command "${command}" tidak ditemukan. Ketik ;menu` }); 
          break;
      }
    } catch (error) {
      console.error(`❌ Error saat menjalankan command ${command}:`, error);
      await sock.sendMessage(senderJid, { text: 'Maaf, terjadi kesalahan.' });
    }
  });
}

// Jalankan bot
startBot().catch(err => {
  console.error("Gagal menjalankan bot:", err);
});