// FIX UNTUK RAILWAYS - TAMBAHKAN INI DI BARIS PERTAMA
if (typeof globalThis.crypto === 'undefined') {
    const webcrypto = require('crypto');
    globalThis.crypto = webcrypto;
}

// Import package yang diperlukan
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Import handler kita
const { handleMessage } = require('./handler');

// Folder untuk menyimpan session
const sessionFolder = './session';

async function startBot() {
    // Buat folder session jika belum ada
    if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder);
    }

    // Load session yang tersimpan
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    // Buat koneksi ke WhatsApp
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        defaultQueryTimeoutMs: 60 * 1000,
        // Tambahkan config untuk Railway
        browser: ['Railway Bot', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false
    });

    // Event ketika QR code digenerate
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Tampilkan QR code di terminal
        if (qr) {
            console.log('\n📱 Scan QR Code ini dengan WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        // Handle koneksi
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, reconnecting...', shouldReconnect);
            
            if (shouldReconnect) {
                setTimeout(() => {
                    startBot();
                }, 5000); // Delay 5 detik sebelum reconnect
            }
        } else if (connection === 'open') {
            console.log('✅ Bot berhasil terhubung!');
            console.log('Bot siap menerima pesan...');
        }
    });

    // Simpan credentials ketika ada perubahan
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        
        // Hanya proses pesan yang baru
        if (!message.key.fromMe && m.type === 'notify') {
            // Panggil handler pesan
            await handleMessage(sock, message);
        }
    });

    // Handle pesan sendiri (outgoing)
    sock.ev.on('messages.upsert', (m) => {
        if (m.messages[0].key.fromMe) {
            console.log('Pesan terkirim:', m.messages[0].message?.conversation || 'Media');
        }
    });

    // Error handling
    sock.ev.on('connection.update', ({ lastDisconnect }) => {
        if (lastDisconnect?.error) {
            console.log('Error:', lastDisconnect.error);
        }
    });
}

// Handle process exit
process.on('SIGINT', () => {
    console.log('\n👋 Bot dimatikan...');
    process.exit(0);
});

// Handle uncaught errors (untuk Railway)
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Mulai bot
console.log('🚀 Starting WhatsApp Bot on Railway...');
console.log('Node version:', process.version);
startBot().catch(console.error);