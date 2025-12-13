import { webcrypto } from 'crypto';
import baileys from "@whiskeysockets/baileys";
import P from "pino";
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs'; // Perbaikan: existsSync harus diimpor dari fs biasa
import { join } from 'path';
import sharp from 'sharp';

// Polyfill untuk crypto
if (typeof global.crypto === 'undefined') {
  global.crypto = webcrypto;
}

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage,
} = baileys;

// ===== PATH AUTH =====
const AUTH_PATH = "auth_info";

// Fungsi untuk membersihkan session jika ada masalah
async function clearSession() {
  try {
    if (existsSync(AUTH_PATH)) {
      console.log("Membersihkan session yang bermasalah...");
      // Implementasi pembersihan session bisa ditambahkan di sini
    }
  } catch (error) {
    console.error("Gagal membersihkan session:", error);
  }
}

// ===== BOT START =====
async function startBot() {
  console.log("Starting bot...");

  try {
    // Cek dan bersihkan session jika perlu
    await clearSession();
    
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      version,
      logger: P({ level: "silent" }),
      printQRInTerminal: true,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      options: {
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000, // 60 detik timeout
        keepAliveIntervalMs: 30000, // 30 detik keep alive
        qrTimeout: 0, // QR tidak timeout
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update;
      
      if (qr) {
        console.log("\n=== QR CODE DITERIMA ===");
        console.log("Buka link berikut di browser untuk melihat QR code:");
        
        // Generate QR code URL menggunakan API
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
        console.log(qrUrl);
        
        console.log("\nAtau scan QR code di bawah ini:");
        console.log(qr);
        console.log("=========================\n");
        
        // Simpan QR ke file untuk backup
        writeFile(join(process.cwd(), 'qr.txt'), qr)
          .then(() => console.log("QR juga disimpan di file qr.txt"))
          .catch(err => console.error("Gagal menyimpan QR:", err));
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`Connection closed. Status: ${statusCode}, Reconnecting: ${shouldReconnect}`);
        
        if (statusCode === DisconnectReason.connectionClosed) {
          console.log("Koneksi ditutup, mencoba reconnect dalam 5 detik...");
          setTimeout(() => startBot(), 5000);
        } else if (statusCode === DisconnectReason.connectionLost) {
          console.log("Koneksi hilang, mencoba reconnect dalam 5 detik...");
          setTimeout(() => startBot(), 5000);
        } else if (statusCode === DisconnectReason.timedOut) {
          console.log("Koneksi timeout, mencoba reconnect dalam 10 detik...");
          setTimeout(() => startBot(), 10000);
        } else if (shouldReconnect) {
          console.log("Mencoba reconnect dalam 5 detik...");
          setTimeout(() => startBot(), 5000);
        } else {
          console.log("Session tidak valid, menghapus session dan memulai ulang...");
          await clearSession();
          setTimeout(() => startBot(), 5000);
        }
      }

      if (connection === "open") {
        console.log("BOT CONNECTED - Bot siap digunakan!");
        
        // Kirim pesan notifikasi ke nomor sendiri
        try {
          const ownNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          await sock.sendMessage(ownNumber, { 
            text: "Bot WhatsApp aktif! Kirim ;stiker <nama> dengan reply gambar untuk membuat stiker." 
          });
        } catch (error) {
          console.error("Gagal mengirim pesan notifikasi:", error);
        }
      }
      
      // Handle new login
      if (isNewLogin) {
        console.log("Login baru terdeteksi, menyimpan session...");
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0];
      if (!msg?.message || msg.key.fromMe) return;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text;

      if (!text?.startsWith(";stiker")) return;

      const quoted =
        msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

      if (!quoted?.imageMessage) {
        return sock.sendMessage(
          msg.key.remoteJid,
          { text: "Reply gambar dengan ;stiker <nama>" },
          { quoted: msg }
        );
      }

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
          msg.key.remoteJid,
          {
            sticker: webpBuffer,
            packName: "Sticker Pack",
            packAuthor: author,
          },
          { quoted: msg }
        );
        
        console.log("Sticker sent successfully");
      } catch (error) {
        console.error("Error creating sticker:", error);
        sock.sendMessage(
          msg.key.remoteJid,
          { text: "Gagal membuat stiker. Error: " + error.message },
          { quoted: msg }
        );
      }
    });
    
    // Handle error pada socket
    sock.ev.on("error", (error) => {
      console.error("Socket error:", error);
    });
    
  } catch (error) {
    console.error("Error in startBot:", error);
    console.log("Memulai ulang bot dalam 10 detik...");
    setTimeout(() => startBot(), 10000);
  }
}

// Jalankan bot
startBot().catch((err) => {
  console.error("Fatal error:", err);
  console.log("Memulai ulang bot dalam 10 detik...");
  setTimeout(() => startBot(), 10000);
});