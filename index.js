import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} from '@whiskeysockets/baileys'

import P from 'pino'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const authPath = path.join(__dirname, 'auth_info')
const pairingNumber = '628XXXXXXXXX'

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(authPath)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    auth: state,
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false
  })

  if (!sock.authState.creds.registered) {
    const code = await sock.requestPairingCode(pairingNumber)
    console.log('PAIRING CODE:', code)
  }

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode
      if (reason !== DisconnectReason.loggedOut) startBot()
    }
    if (connection === 'open') console.log('BOT CONNECTED')
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text || !text.startsWith(';stiker')) return

    const quoted =
      msg.message.extendedTextMessage?.contextInfo?.quotedMessage

    if (!quoted?.imageMessage) {
      return sock.sendMessage(
        msg.key.remoteJid,
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

    await sock.sendMessage(
      msg.key.remoteJid,
      {
        sticker: buffer,
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
