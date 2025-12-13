import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} from "@whiskeysockets/baileys"

import qrcode from "qrcode-terminal"
import fs from "fs"
import sharp from "sharp"

async function startBot() {
  // Ambil auth
  const { state, saveCreds } = await useMultiFileAuthState("./auth")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  })

  // Simpan session
  sock.ev.on("creds.update", saveCreds)

  // QR LOGIN
  sock.ev.on("connection.update", ({ qr, connection }) => {
    if (qr) {
      qrcode.generate(qr, { small: true })
      console.log("Scan QR untuk login")
    }
    if (connection === "open") {
      console.log("Bot WA aktif")
    }
  })

  // PESAN MASUK
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    // COMMAND ;stiker
    if (text?.startsWith(";stiker")) {
      const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage

      if (!quoted || !quoted.imageMessage) {
        return sock.sendMessage(from, {
          text: "Reply gambar dengan ;stiker"
        })
      }

      // DOWNLOAD GAMBAR
      const stream = await downloadContentFromMessage(
        quoted.imageMessage,
        "image"
      )

      let buffer = Buffer.from([])
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
      }

      // BUAT STIKER
      const stickerBuffer = await sharp(buffer)
        .resize(512, 512, { fit: "contain" })
        .webp()
        .toBuffer()

      await sock.sendMessage(from, {
        sticker: stickerBuffer,
        contextInfo: {
          externalAdReply: {
            title: "Sticker Bot",
            body: "Dibuat oleh humpreyDev",
            showAdAttribution: true
          }
        }
      })
    }
  })
}

startBot()
