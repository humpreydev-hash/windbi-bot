import * as baileys from "@whiskeysockets/baileys";
import P from "pino";
import qrcodeTerminal from "qrcode-terminal";
import { Sticker, StickerTypes } from "wa-sticker-formatter";

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage,
} = baileys;

const AUTH_PATH = "auth_info";

async function startBot() {
  console.log("Starting bot...");

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger: P({ level: "silent" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Tampilkan QR scan di terminal
      qrcodeTerminal.generate(qr, { small: true });
      console.log("Scan QR ini dengan WhatsApp kamu!");
    }

    if (connection === "close") {
      const reason =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnecting...");
      if (reason) startBot();
    }

    if (connection === "open") {
      console.log("BOT CONNECTED");
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

    if (!quoted?.imageMessage && !quoted?.videoMessage) {
      return sock.sendMessage(
        msg.key.remoteJid,
        { text: "Reply gambar atau video dengan ;stiker <nama>" },
        { quoted: msg }
      );
    }

    // Nama pembuat stiker
    const author = text.split(" ")[1] || "humpreyDev";

    // Download media
    const mediaType = quoted.imageMessage ? "image" : "video";
    const stream = await downloadContentFromMessage(quoted[`${mediaType}Message`], mediaType);

    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    // Buat stiker
    const sticker = new Sticker(buffer, {
      pack: "MyPack",
      author: author,
      type: StickerTypes.FULL,
      quality: 70,
    });

    const out = await sticker.toBuffer();

    // Kirim stiker
    await sock.sendMessage(
      msg.key.remoteJid,
      { sticker: out },
      { quoted: msg }
    );
  });
}

// Jalankan bot
startBot().catch((err) => {
  console.error("Fatal error:", err);
});
