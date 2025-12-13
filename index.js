import { webcrypto } from 'crypto';
import baileys from "@whiskeysockets/baileys";
import P from "pino";
import { writeFile } from 'fs/promises';
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

// ===== BOT START =====
async function startBot() {
  console.log("Starting bot...");

  try {
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
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      
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
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log("Connection closed due to", lastDisconnect?.error, "Reconnecting:", shouldReconnect);
        if (shouldReconnect) {
          setTimeout(() => startBot(), 5000);
        }
      }

      if (connection === "open") {
        console.log("BOT CONNECTED - Bot siap digunakan!");
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
  } catch (error) {
    console.error("Error in startBot:", error);
    setTimeout(() => startBot(), 10000);
  }
}

// Jalankan bot
startBot().catch((err) => {
  console.error("Fatal error:", err);
  setTimeout(() => startBot(), 10000);
});