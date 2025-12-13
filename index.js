const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys')

const P = require('pino')
const sharp = require('sharp')

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    auth: state,
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false
  })

  // === PAIRING CODE LOGIN ===
  if (!sock.authState.creds.registered) {
    const pairingCode = await sock.requestPairingCode('628XXXXXXXXX')
    console.log('PAIRING CODE:', pairingCode)
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
      console.log('BOT ONLINE')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return

    // === COMMAND STIKER ===
    if (text.startsWith(';stiker')) {
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

      const buffer = await sock.downloadMediaMessage({
        message: quoted,
        key: {
          remoteJid: from,
          id: msg.message.extendedTextMessage.contextInfo.stanzaId,
          fromMe: false
        }
      })

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
    }
  })
}

startBot()
