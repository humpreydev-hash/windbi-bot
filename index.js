import makeWASocket, {
  useMultiFileAuthState,
  downloadContentFromMessage
} from "@whiskeysockets/baileys"
import sharp from "sharp"

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info")

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  })

  sock.ev.on("creds.update", saveCreds)

  let pairingDone = false

  sock.ev.on("connection.update", async (update) => {
    const { connection } = update

    if (connection === "open") {
      console.log("✅ WhatsApp socket OPEN")

      if (!state.creds.registered && !pairingDone) {
        pairingDone = true

        const nomor = "628xxxxxxxxxx" // tanpa +
        const code = await sock.requestPairingCode(nomor)

        console.log("🔐 PAIRING CODE:", code)
        console.log("Masukkan di WhatsApp > Perangkat tertaut")
      }
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

    if (text.startsWith(";stiker")) {
      const quoted =
        msg.message.extendedTextMessage?.contextInfo?.quotedMessage

      if (!quoted?.imageMessage) {
        await sock.sendMessage(from, {
          text: "Reply gambar lalu ketik ;stiker nama"
        })
        return
      }

      const author =
        text.replace(";stiker", "").trim() || "Unknown"

      const stream = await downloadContentFromMessage(
        quoted.imageMessage,
        "image"
      )

      let buffer = Buffer.from([])
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
      }

      const sticker = await sharp(buffer)
        .resize(512, 512, { fit: "contain" })
        .webp()
        .toBuffer()

      await sock.sendMessage(
        from,
        { sticker },
        {
          stickerMetadata: {
            pack: "Bot Stiker",
            author
          }
        }
      )
    }
  })
}

startBot()
