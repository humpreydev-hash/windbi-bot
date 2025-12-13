import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} from '@whiskeysockets/baileys'

import P from 'pino'
import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

// === FIX __dirname DI ESM ===
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// === AUTH PATH ===
const authPath = path.join(__dirname, 'auth_info')

// === NOMOR UNTUK PAIRING CODE ===
const pairingNumber = '628XXXXXXXXX' // GANTI NOMOR KAMU

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(authPath)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    auth: state,
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false
  })

  // === PAIRING CODE LOGIN ===
  if (!sock.authState.creds.registered) {
    const code = await sock.requestPairingCode(pairingNumber)
    console.log('PAIRING CODE:', code)
  }

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode
      if (reason !== DisconnectReason.loggedOut) {
        startBot()
      }
    }

    if (connection === 'open') {
      console.log('BOT CONNECTED')
    }
  })

  // === MESSAGE HANDLER ===
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return
    if (!text.startsWith(';stiker')) return

    const quoted =
      msg.message.extendedTextMessage?.contextInfo?.quotedMessage

    if (!quoted || !quoted.imageMessage) {
      return sock.sendMessage(
        from,
        { text: 'Reply gambar dengan ;stiker <nama>' },
        { quoted: msg }
      )
    }

    const author = text.split(' ')[1] || 'humpreyDev'

    const stream = await downloadContentFromMessage(
      quoted.imageMessage,
      'image'
    )

    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    const sticker = await sharp(buffer)
      .resize(512, 512, { fit: 'contain' })
      .webp()
      .toBuffer()

    await sock.sendMessage(
      from,
      {
        sticker,
        contextInfo: {
          externalAdReply: {
            title: 'Sticker',
            body: `Dibuat oleh ${author}`,
            mediaType: 1
          }
        }
      },
      { quoted: msg }
    )
  })
}

startBot()
