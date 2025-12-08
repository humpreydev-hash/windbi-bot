// Menggunakan require untuk library CommonJS
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// --- KONFIGURASI ---
// Nama folder untuk menyimpan sesi login
const SESSION_FOLDER = 'session';
const ownerNumber = '628xxxxxxxxxx@s.whatsapp.net'; // GANTI DENGAN NOMOR WA KAMU

// --- FUNGSI UTAMA ---
async function startBot() {
    console.log('🐾 Memulai FurryBot... Siap-siap untuk keceriaan!');

    // Import library ES Module secara dinamis
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = await import('@whiskeysockets/baileys');
    const sharp = await import('sharp');
    const { fileTypeFromBuffer } = await import('file-type');

    // Membuat folder session jika belum ada
    if (!fs.existsSync(SESSION_FOLDER)) {
        fs.mkdirSync(SESSION_FOLDER);
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false
    });

    // --- GENERATE & TAMPILKAN QR CODE ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📲 Paw-scan QR Code ini dengan WhatsApp kamu, ya!');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔌 Oh no! Koneksi terputus... FurryBot coba hubungkan kembali, ya! 🐾', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ FurryBot berhasil terhubung! Ayo bermain! 🥳');
        }
    });

    // --- SIMPAN KREDENSIAL OTOMATIS ---
    sock.ev.on('creds.update', saveCreds);

    // --- PESAN MASUK ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;
        if (m.key.fromMe) return;

        const from = m.key.remoteJid;
        const msgText = m.message.conversation || m.message.extendedTextMessage?.text || '';

        console.log(`📩 Pesan dari ${from.split('@')[0]}: ${msgText}`);

        const prefix = '.';
        if (!msgText.startsWith(prefix)) return;

        const command = msgText.slice(1).trim().split(' ')[0].toLowerCase();

        switch (command) {
            case 'menu':
                const menuText = `
🐾 *MENU FURRYBOT* 🐾

Hai, @${from.split('@')[0]}! Senang bertemu denganmu! ✨ Ini dia daftar perintah yang bisa FurryBot lakukan untukmu:

👑 *Pemilik yang Baik Hati*: @${ownerNumber.split('@')[0]}

➥ *.menu*
   Menampilkan menu lucu ini.

➥ *.ping*
   Ngecek seberapa cepat FurryBot menjawab! 🐾

➥ *.sticker* (Balas gambar)
   Ubah gambar jadi stiker lucu! 🐶

➥ *.toimg* (Balas stiker)
   Ubah stiker jadi gambar biar jelas! 🐱

➥ *.owner*
   Mau kenal sama pemilik FurryBot? Cek di sini! 🦊
                `;
                await sock.sendMessage(from, { text: menuText, mentions: [from, ownerNumber] }, { quoted: m });
                break;

            case 'ping':
                const startTime = Date.now();
                await sock.sendMessage(from, { text: 'Woof woof! FurryBot di sini! ⚡' }, { quoted: m });
                const endTime = Date.now();
                const pingTime = endTime - startTime;
                await sock.sendMessage(from, { text: `Waktu respon FurryBot: *${pingTime}ms* 🐇` }, { quoted: m });
                break;

            case 'sticker':
            case 's':
                const quotedMsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (m.message.imageMessage || quotedMsg?.imageMessage) {
                    const encMedia = m.message.imageMessage || quotedMsg.imageMessage;
                    try {
                        const mediaStream = await downloadContentFromMessage(encMedia, 'image');
                        let buffer = Buffer.from([]);
                        for await (const chunk of mediaStream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }

                        // Gunakan sharp yang sudah di-import
                        const webpSticker = await sharp.default(buffer)
                            .resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                            .webp({ quality: 80 })
                            .toBuffer();

                        await sock.sendMessage(from, { sticker: webpSticker }, { quoted: m });
                        console.log(`✅ Stiker lucu berhasil dikirim ke ${from.split('@')[0]}!`);
                    } catch (error) {
                        console.error('Gagal membuat stiker lucu:', error);
                        await sock.sendMessage(from, { text: '❌ Aduh, FurryBot kesulitan bikin stikernya. Coba lagi, ya! 😿' }, { quoted: m });
                    }
                } else {
                    await sock.sendMessage(from, { text: '❌ Kamu harus balas gambar dulu dengan caption *.sticker* biar FurryBot ubahin, ya! 🖼️' }, { quoted: m });
                }
                break;

            case 'toimg':
                const quotedSticker = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (m.message.stickerMessage || quotedSticker?.stickerMessage) {
                    const encMedia = m.message.stickerMessage || quotedSticker.stickerMessage;
                    try {
                        const mediaStream = await downloadContentFromMessage(encMedia, 'sticker');
                        let buffer = Buffer.from([]);
                        for await (const chunk of mediaStream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        
                        // Gunakan sharp yang sudah di-import
                        const imageBuffer = await sharp.default(buffer).png().toBuffer();

                        await sock.sendMessage(from, { image: imageBuffer, caption: 'Nih, stikernya udah FurryBot ubah jadi gambar! Lihat, lucu kan? 🐾' }, { quoted: m });
                        console.log(`✅ Gambar dari stiker berhasil dikirim ke ${from.split('@')[0]}!`);
                    } catch (error) {
                        console.error('Gagal mengubah stiker ke gambar:', error);
                        await sock.sendMessage(from, { text: '❌ Aduh, stikernya mungkin bergerak, jadi FurryBot gak bisa ubah. Coba stiker diam, ya! 😿' }, { quoted: m });
                    }
                } else {
                    await sock.sendMessage(from, { text: '❌ Balas stiker yang mau diubah jadi gambar dengan caption *.toimg*, ya! 🖼️' }, { quoted: m });
                }
                break;

            case 'owner':
                await sock.sendMessage(from, { 
                    contacts: { 
                        displayName: 'Pemilik FurryBot', 
                        contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Pemilik FurryBot\nTEL;type=CELL;type=VOICE;waid=${ownerNumber.split('@')[0]}:+${ownerNumber.split('@')[0]}\nEND:VCARD` }] 
                    } 
                }, { quoted: m });
                break;

            default:
                await sock.sendMessage(from, { text: `❌ Perintah *${prefix}${command}* belum FurryBot kenali. Ketik *.menu* untuk lihat daftar perintah yang ada, ya! 🐾` }, { quoted: m });
                break;
        }
    });
}

// Jalankan botnya!
startBot().catch(err => {
    console.error("Oh tidak! Terjadi kesalahan yang serius pada FurryBot:", err);
});