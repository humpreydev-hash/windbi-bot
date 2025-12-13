import * as baileys from "@whiskeysockets/baileys";
import P from "pino";
import sharp from "sharp";

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
      logger: P({ level: "trace" }), // Ubah ke trace agar QR terlihat
      printQRInTerminal: true,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
        console.log("Connection closed. Reconnecting...", shouldReconnect);
        if (shouldReconnect) {
          startBot();
        }
      }

      if (connection === "open") {
        console.log("✅ BOT CONNECTED");
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      try {
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
            { text: "❌ Reply gambar dengan ;stiker <nama>" },
            { quoted: msg }
          );
        }

        const author = text.split(" ")[1] || "humpreyDev";

        console.log("🔄 Processing sticker request...");
        
        const stream = await downloadContentFromMessage(
          quoted.imageMessage,
          "image"
        );

        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }

        // Konversi ke WebP menggunakan sharp
        const webpBuffer = await sharp(buffer)
          .resize(512, 512, { 
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 } // Background transparan
          })
          .webp({ 
            quality: 80,
            lossless: false
          })
          .toBuffer();

        console.log("✅ Sticker created successfully!");

        await sock.sendMessage(
          msg.key.remoteJid,
          {
            sticker: webpBuffer,
            contextInfo: {
              externalAdReply: {
                title: "Sticker",
                body: `Dibuat oleh ${author}`,
                mediaType: 1,
              },
            },
          },
          { quoted: msg }
        );
      } catch (error) {
        console.error("❌ Error creating sticker:", error);
        sock.sendMessage(
          msg.key.remoteJid,
          { text: "❌ Gagal membuat stiker. Pastikan Anda me-reply gambar dengan benar!" },
          { quoted: msg }
        );
      }
    });
  } catch (error) {
    console.error("❌ Fatal error:", error);
    setTimeout(startBot, 5000); // Restart setelah 5 detik
  }
}

// Jalankan bot
startBot().catch((err) => {
  console.error("❌ Fatal error:", err);
});