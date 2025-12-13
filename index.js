import makeWASocket, {
  useMultiFileAuthState,
  downloadContentFromMessage
} from "@whiskeysockets/baileys"

import sharp from "sharp"

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info")

  const sock = makeWASocket({
    auth: state
  })

  sock.ev.on("creds.update", saveCreds)

  // ===== LOGIN PAIRING CODE =====
  if (!state.creds.registered) {
    const nomorWA = "6281234567890" // GANTI NOMOR KAMU (tanpa +)
    const code = await sock.requestPairingCode(nomorWA)
    console.log("🔐 Pairing Code:", code)
    console.log("Masukkan kode ini di WhatsApp kamu")
  }

  sock.ev.on("connection.update", (update) => {
    if (update.connection === "open") {
      console.log("✅ Bot berhasil login ke WhatsApp")
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

    // ===== COMMAND STIKER =====
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
