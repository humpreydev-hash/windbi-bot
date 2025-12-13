// ==============================
// BOT STIKER WA - SIMPLE & STABLE
// Baileys v6.6.0 | ESM | Railway
// ==============================

import makeWASocket from '@whiskeysockets/baileys'
import {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} from '@whiskeysockets/baileys'

import P from 'pino'
import path from 'path'
import { fileURLToPath } from 'url'

// ===== FIX __dirname UNTUK ESM =====
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ===== PATH AUTH =====
const authPath = path.join(__dirname, 'auth_info')

// ===== NOMOR UNTUK PAIRING CODE =====
// GANTI DENGAN NOMOR WA KAMU (format internasional, tanpa +)
const pairingNumber = '6285929088764'

// ===================================
async function startBot() {
  console.log('Starting bot...')

  const { state, saveCreds } = await useMultiFileAuthState(authPath)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false
  })

  // ===== PAIRING CODE LOGIN =====
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
        console.log('Reconnect...')
        startBot()
      }
    }

    if (connection === 'open') {
      console.log('BOT CONNECTED')
    }
  })

  // ===== HANDLER PESAN =====
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return
    if (msg.key.fromMe) return

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

    // ===== DOWNLOAD GAMBAR =====
    const stream = await downloadContentFromMessage(
      quoted.imageMessage,
      'image'
    )

    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    // ===== KIRIM STIKER =====
    await sock.sendMessage(
      from,
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

// ===== RUN BOT =====
startBot().catch(err => {
  console.error('Fatal Error:', err)
})
