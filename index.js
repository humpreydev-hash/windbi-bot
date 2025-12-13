import makeWASocket, {
  useMultiFileAuthState,
  downloadContentFromMessage
} from "@whiskeysockets/baileys"

import qrcode from "qrcode-terminal"
import sharp from "sharp"
import fs from "fs"

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info")

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  })

  sock.ev.on("creds.update", saveCreds)

  console.log("🤖 Bot WhatsApp siap...")

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

      // download gambar
      const stream = await downloadContentFromMessage(
        quoted.imageMessage,
        "image"
      )

      let buffer = Buffer.from([])
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
      }

      // convert ke sticker (webp)
      const stickerBuffer = await sharp(buffer)
        .resize(512, 512, { fit: "contain" })
        .webp()
        .toBuffer()

      await sock.sendMessage(
        from,
        {
          sticker: stickerBuffer
        },
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
