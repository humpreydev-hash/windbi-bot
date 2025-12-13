import makeWASocket, {
  useMultiFileAuthState,
  downloadContentFromMessage,
  DisconnectReason
} from "@whiskeysockets/baileys"

import qrcode from "qrcode-terminal"
import sharp from "sharp"

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info")

  const sock = makeWASocket({
    auth: state
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("📱 Scan QR ini:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("✅ Bot berhasil login ke WhatsApp")
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode
      console.log("❌ Koneksi terputus:", reason)
      startBot()
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""

    // ======================
    // COMMAND STIKER
    // ======================
    if (text.startsWith(";stiker")) {
      const quoted =
        msg.message.extendedTextMessage?.contextInfo?.quotedMessage

      if (!quoted || !quoted.imageMessage) {
        await sock.sendMessage(from, {
          text: "❌ Reply gambar!\nContoh:\n;stiker dibuat oleh humpreyDev"
        })
        return
      }

      const pembuat =
        text.replace(";stiker", "").trim() || "Unknown"

      const stream = await downloadContentFromMessage(
        quoted.imageMessage,
        "image"
      )

      let buffer = Buffer.from([])
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
      }

      const stickerBuffer = await sharp(buffer)
        .resize(512, 512, { fit: "contain" })
        .webp()
        .toBuffer()

      await sock.sendMessage(
        from,
        { sticker: stickerBuffer },
        {
          stickerMetadata: {
            pack: "Bot Stiker",
            author: pembuat
          }
        }
      )
    }
  })
}

startBot()
