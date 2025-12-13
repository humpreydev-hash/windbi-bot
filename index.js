import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage
} from "@whiskeysockets/baileys";
import qrcodeTerminal from "qrcode-terminal";
import { writeFile } from "fs/promises";

const AUTH_PATH = "auth_info";

async function startBot() {
  console.log("Starting bot...");

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
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

    // ambil media reply
    const quoted =
      msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted?.imageMessage && !quoted?.videoMessage) {
      return sock.sendMessage(
        msg.key.remoteJid,
        { text: "Reply gambar/video dengan ;stiker" },
        { quoted: msg }
      );
    }

    const mediaType = quoted.imageMessage ? "image" : "video";
    const stream = await downloadContentFromMessage(
      quoted[`${mediaType}Message`],
      mediaType
    );

    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    // Kirim stiker langsung (WA bisa buat stiker dari buffer gambar/video)
    await sock.sendMessage(
      msg.key.remoteJid,
      { sticker: buffer },
      { quoted: msg }
    );
  });
}

startBot().catch(console.error);
