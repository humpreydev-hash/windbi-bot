import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } from '@jkt48connect-corp/baileys-lite';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import fs from 'fs/promises';
import os from 'os';
import sqlite3 from 'sqlite3';
import ffmpeg from 'fluent-ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ownerNumber = '6285929088764@s.whatsapp.net';
const botPrefix = '.';
let selfMode = false;

const sessionId = process.env.RAILWAY_SERVICE_NAME || 'session_default';
const dbPath = path.join('/tmp', 'verified_users.db');
const authPath = path.join(__dirname, 'auth_info_' + sessionId);
const tempDir = path.join('/tmp', 'bot_temp');

try {
    await fs.mkdir(tempDir, { recursive: true });
    console.log('✅ Direktori temporary siap');
} catch (error) {
    console.log('Direktori temporary sudah ada');
}

const db = new sqlite3.Database(dbPath);
db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS verified_users (jid TEXT PRIMARY KEY)');
    console.log('✅ Database siap');
});

function isUserVerified(jid) {
    return new Promise((resolve, reject) => {
        db.get('SELECT jid FROM verified_users WHERE jid = ?', [jid], (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
        });
    });
}

function addUserToDatabase(jid) {
    return new Promise((resolve, reject) => {
        db.run('INSERT OR IGNORE INTO verified_users (jid) VALUES (?)', [jid], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function startBot() {
    console.log('🚀 Menyalakan bot WhatsApp...');

    try {
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 Menggunakan WA Web v${version.join('.')}`);

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true,
            defaultStoreOptions: { syncHistory: false },
            markOnlineOnConnect: true,
            syncFullHistory: false,
            retryRequestDelayMs: 1000,
            maxMsgRetryCount: 3,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            mobile: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('📲 Scan QR code di bawah dengan WhatsApp Anda:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log(`❌ Koneksi terputus. Kode: ${statusCode}`);

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('📵 Logged out, menghapus session...');
                    try {
                        await fs.rm(authPath, { recursive: true, force: true });
                        console.log('🗑️ Session dihapus. Silakan scan QR lagi.');
                    } catch (e) {
                        console.log('⚠️ Gagal hapus session:', e.message);
                    }
                }

                if (statusCode !== DisconnectReason.loggedOut) {
                    console.log('🔄 Mencoba sambung ulang dalam 15 detik...');
                    setTimeout(() => {
                        console.log('🔁 Menyambung ulang...');
                        startBot();
                    }, 15000);
                }
            } else if (connection === 'open') {
                console.log('✅ Bot berhasil terhubung!');
                console.log(`👤 Bot ID: ${sock.user?.id}`);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const senderJid = msg.key.participant || msg.key.remoteJid;
            let messageText = '';

            if (msg.message.conversation) messageText = msg.message.conversation;
            else if (msg.message.extendedTextMessage) messageText = msg.message.extendedTextMessage.text;
            else if (msg.message.imageMessage) messageText = msg.message.imageMessage?.caption || '';
            else if (msg.message.videoMessage) messageText = msg.message.videoMessage?.caption || '';

            console.log(`📩 Pesan dari ${senderJid}: ${messageText.substring(0, 50)}...`);

            if (!messageText.startsWith(botPrefix)) return;

            const isVerified = await isUserVerified(senderJid);
            if (!isVerified && !messageText.startsWith('.verify')) {
                return sock.sendMessage(msg.key.remoteJid, { text: '❌ Kamu belum terverifikasi.\nKetik *.verify* dulu.' });
            }

            if (selfMode && senderJid !== ownerNumber) {
                console.log(`🔒 Self mode aktif, blokir: ${senderJid}`);
                return;
            }

            const command = messageText.toLowerCase().trim().split(/ +/)[0];

            try {
                switch (command) {
                    case '.menu':
                        const uptime = process.uptime();
                        const hours = Math.floor(uptime / 3600);
                        const minutes = Math.floor((uptime % 3600) / 60);
                        const seconds = Math.floor(uptime % 60);
                        const menuText = `
╭━━━━━━━━━━━━━━━━━━━━╮
│   WINDIBOT MENU    │
├────────────────────┤
│ • .menu - Menu ini
│ • .ping - Cek bot
│ • .owner - Info owner
│ • .stiker - Buat stiker
│ • .tiktok <url> - Download
╰━━━━━━━━━━━━━━━━━━━━╯
                        `;
                        await sock.sendMessage(msg.key.remoteJid, { text: menuText });
                        break;

                    case '.verify':
                        if (senderJid === ownerNumber) {
                            await sock.sendMessage(msg.key.remoteJid, { text: '✅ Owner otomatis terverifikasi!' });
                        } else {
                            await addUserToDatabase(senderJid);
                            await sock.sendMessage(msg.key.remoteJid, { text: '✅ Verifikasi berhasil!' });
                        }
                        break;

                    case '.ping':
                        await sock.sendMessage(msg.key.remoteJid, { text: '🏓 Pong! Bot aktif.' });
                        break;

                    case '.owner':
                        await sock.sendMessage(msg.key.remoteJid, { text: `👑 Owner bot: ${ownerNumber}\nJangan spam ya!` });
                        break;

                    case '.stiker':
                        try {
                            const msgType = Object.keys(msg.message)[0];
                            let mediaBuffer;
                            let isVideo = false;

                            if (msgType === 'imageMessage') {
                                const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
                                const chunks = [];
                                for await (const chunk of stream) chunks.push(chunk);
                                mediaBuffer = Buffer.concat(chunks);
                            } else if (msgType === 'videoMessage') {
                                const stream = await downloadContentFromMessage(msg.message.videoMessage, 'video');
                                const chunks = [];
                                for await (const chunk of stream) chunks.push(chunk);
                                mediaBuffer = Buffer.concat(chunks);
                                isVideo = true;
                            } else {
                                return sock.sendMessage(msg.key.remoteJid, { text: '❌ Balas gambar/video dengan caption .stiker' });
                            }

                            const tempInput = path.join(tempDir, `input_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`);
                            const tempOutput = path.join(tempDir, `sticker_${Date.now()}.webp`);

                            await fs.writeFile(tempInput, mediaBuffer);

                            await new Promise((resolve, reject) => {
                                ffmpeg(tempInput)
                                    .outputOptions([
                                        '-vcodec', 'libwebp',
                                        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                                        '-lossless', '0',
                                        '-quality', '80',
                                        '-preset', 'default',
                                        '-loop', '0',
                                        '-an',
                                        '-vsync', '0'
                                    ])
                                    .toFormat('webp')
                                    .on('end', resolve)
                                    .on('error', reject)
                                    .save(tempOutput);
                            });

                            const stickerBuffer = await fs.readFile(tempOutput);
                            await sock.sendMessage(msg.key.remoteJid, { sticker: stickerBuffer });
                            await fs.unlink(tempInput).catch(() => {});
                            await fs.unlink(tempOutput).catch(() => {});
                        } catch (error) {
                            console.error('Stiker error:', error);
                            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal buat stiker.' });
                        }
                        break;

                    case '.tiktok':
                        const url = messageText.split(' ')[1];
                        if (!url) return sock.sendMessage(msg.key.remoteJid, { text: 'Kirim link TikTok!\nContoh: .tiktok https://vt.tiktok.com/xxx' });

                        try {
                            await sock.sendMessage(msg.key.remoteJid, { text: '⏳ Sedang download dari TikTok...' });
                            const apiUrl = `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`;
                            const response = await axios.get(apiUrl, { timeout: 30000 });
                            const data = response.data;

                            if (data.videos && data.videos[0]) {
                                const videoUrl = data.videos[0];
                                await sock.sendMessage(msg.key.remoteJid, {
                                    video: { url: videoUrl },
                                    caption: `*TikTok Downloader*\n\n🎵 ${data.title || 'Tanpa judul'}`
                                });
                            } else {
                                throw new Error('Video tidak ditemukan');
                            }
                        } catch (error) {
                            console.error('TikTok error:', error);
                            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal download. Coba link lain.' });
                        }
                        break;

                    default:
                        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Perintah "${command}" tidak dikenal. Ketik .menu` });
                        break;
                }
            } catch (error) {
                console.error(`Error command ${command}:`, error);
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Maaf, terjadi kesalahan internal.' });
            }
        });

        console.log('🎉 Bot siap menerima pesan!');

    } catch (error) {
        console.error('❌ Error setup bot:', error.message);
        console.log('🔄 Restart dalam 10 detik...');
        setTimeout(startBot, 10000);
    }
}

startBot().catch(err => {
    console.error("💥 Fatal error:", err.message);
    setTimeout(startBot, 15000);
});