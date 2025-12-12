import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    downloadContentFromMessage,
    getContentType,
    proto 
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import fs from 'fs/promises';
import os from 'os';
import sqlite3 from 'sqlite3';
import ffmpeg from 'fluent-ffmpeg';
import ytdl from 'ytdl-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ownerNumber = '6285929088764@s.whatsapp.net';
const botPrefix = '.';
let selfMode = false;

const sessionId = process.env.RAILWAY_SERVICE_NAME || 'windbi_session';
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

function extractMessageText(msg) {
    const msgType = getContentType(msg.message);
    if (msgType === 'conversation') return msg.message.conversation;
    if (msgType === 'extendedTextMessage') return msg.message.extendedTextMessage.text;
    if (msgType === 'imageMessage') return msg.message.imageMessage?.caption || '';
    if (msgType === 'videoMessage') return msg.message.videoMessage?.caption || '';
    return '';
}

function parseMention(text) {
    const matches = text.match(/@(\d+)/g);
    if (!matches) return [];
    return matches.map(m => m.replace('@', '') + '@s.whatsapp.net');
}

function isOwner(jid) {
    if (!jid) return false;
    const cleanJid = jid.split(':')[0] || jid;
    return cleanJid === ownerNumber.split(':')[0];
}

async function getGroupAdmins(groupJid, sock) {
    try {
        const metadata = await sock.groupMetadata(groupJid);
        return metadata.participants.filter(p => p.admin).map(p => p.id);
    } catch (error) {
        console.error('Error getting admins:', error);
        return [];
    }
}

async function isGroupAdmin(groupJid, userJid, sock) {
    const admins = await getGroupAdmins(groupJid, sock);
    return admins.includes(userJid);
}

async function autoVerifyOwner(jid) {
    if (isOwner(jid)) {
        if (!(await isUserVerified(jid))) {
            await addUserToDatabase(jid);
            console.log(`✅ Owner ${jid} otomatis terverifikasi`);
        }
        return true;
    }
    return false;
}

async function createStickerFromImage(imageBuffer) {
    return new Promise((resolve, reject) => {
        const tempInput = path.join(tempDir, `img_input_${Date.now()}.jpg`);
        const tempOutput = path.join(tempDir, `sticker_img_${Date.now()}.webp`);
        
        fs.writeFile(tempInput, imageBuffer)
            .then(() => {
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
                    .on('end', async () => {
                        try {
                            const outputBuffer = await fs.readFile(tempOutput);
                            await fs.unlink(tempInput).catch(() => {});
                            await fs.unlink(tempOutput).catch(() => {});
                            resolve(outputBuffer);
                        } catch (err) {
                            reject(err);
                        }
                    })
                    .on('error', (err) => {
                        fs.unlink(tempInput).catch(() => {});
                        fs.unlink(tempOutput).catch(() => {});
                        reject(err);
                    })
                    .save(tempOutput);
            })
            .catch(reject);
    });
}

async function createStickerFromVideo(videoBuffer) {
    return new Promise((resolve, reject) => {
        const tempInput = path.join(tempDir, `video_input_${Date.now()}.mp4`);
        const tempOutput = path.join(tempDir, `sticker_video_${Date.now()}.webp`);
        
        fs.writeFile(tempInput, videoBuffer)
            .then(() => {
                ffmpeg(tempInput)
                    .inputOptions(['-f', 'mp4'])
                    .outputOptions([
                        '-vcodec', 'libwebp',
                        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=10',
                        '-loop', '0',
                        '-preset', 'default',
                        '-an',
                        '-vsync', '0',
                        '-s', '512:512'
                    ])
                    .toFormat('webp')
                    .on('end', async () => {
                        try {
                            const outputBuffer = await fs.readFile(tempOutput);
                            await fs.unlink(tempInput).catch(() => {});
                            await fs.unlink(tempOutput).catch(() => {});
                            resolve(outputBuffer);
                        } catch (err) {
                            reject(err);
                        }
                    })
                    .on('error', (err) => {
                        fs.unlink(tempInput).catch(() => {});
                        fs.unlink(tempOutput).catch(() => {});
                        reject(err);
                    })
                    .save(tempOutput);
            })
            .catch(reject);
    });
}

async function showMenu(sock, message) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const menuText = `
╔═══════════════════════════════════════╗
║          🌟 WINDIBOT MENU 🌟          ║
╠═══════════════════════════════════════╣
║ 🤖 *Bot Status*: Aktif ${hours}j ${minutes}m ║
║ 📞 *Owner*: 6285929088764             ║
║ 🔧 *Prefix*: ${botPrefix}                    ║
╠═══════════════════════════════════════╣
║ 🎮 *GAMES*                           ║
║ • ${botPrefix}tebakkata - Game tebak kata  ║
║ • ${botPrefix}mathquiz - Kuis matematika   ║
║ • ${botPrefix}tebakangka - Tebak angka     ║
╠═══════════════════════════════════════╣
║ 📥 *DOWNLOADER*                       ║
║ • ${botPrefix}tiktok <url> - Download TikTok║
║ • ${botPrefix}yt <url> - Download YouTube  ║
║ • ${botPrefix}ig <url> - Download Instagram║
╠═══════════════════════════════════════╣
║ 🎨 *MEDIA*                            ║
║ • ${botPrefix}stiker - Buat stiker         ║
║ • ${botPrefix}tostiker - Convert ke stiker ║
║ • ${botPrefix}tomedia - Stiker ke media    ║
╠═══════════════════════════════════════╣
║ 👥 *GROUP*                            ║
║ • ${botPrefix}gig - Info grup              ║
║ • ${botPrefix}link - Link invite grup      ║
║ • ${botPrefix}kick @tag - Keluarkan member ║
║ • ${botPrefix}totag - Tag semua member     ║
╠═══════════════════════════════════════╣
║ 🔧 *TOOLS*                            ║
║ • ${botPrefix}verify - Verifikasi akun     ║
║ • ${botPrefix}github <user> - Info GitHub  ║
║ • ${botPrefix}ping - Cek status bot        ║
║ • ${botPrefix}menu - Tampilkan menu ini    ║
╚═══════════════════════════════════════╝
`;
    
    await sock.sendMessage(message.key.remoteJid, { text: menuText });
}

async function verifyCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    
    if (isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '✅ Owner otomatis terverifikasi!' });
    }
    
    if (await isUserVerified(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '✅ Nomor kamu sudah terverifikasi.' });
    }
    
    await addUserToDatabase(senderJid);
    return sock.sendMessage(message.key.remoteJid, { text: '✅ Verifikasi berhasil! Selamat menggunakan bot.' });
}

async function tiktokCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link TikToknya!\nContoh: .tiktok https://vt.tiktok.com/xxx' });
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Sedang mendownload dari TikTok...' });
        
        const apiUrl = `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl, { timeout: 30000 });
        const data = response.data;
        
        if (data.videos && data.videos[0]) {
            const videoUrl = data.videos[0];
            
            await sock.sendMessage(message.key.remoteJid, {
                video: { url: videoUrl },
                caption: `*TikTok Downloader*\n\n🎵 *Judul:* ${data.title || 'Tanpa judul'}\n👤 *Author:* ${data.author?.nickname || 'Unknown'}`
            });
        } else {
            throw new Error('Video tidak ditemukan');
        }
    } catch (error) {
        console.error('TikTok error:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Coba link lain.' });
    }
}

async function ytCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link YouTube!\nContoh: .yt https://youtube.com/watch?v=xxx' });
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Sedang mengunduh video...' });
        
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, { quality: 'lowest', filter: 'audioandvideo' });
        
        if (!format) {
            throw new Error('Format tidak ditemukan');
        }
        
        await sock.sendMessage(message.key.remoteJid, {
            video: { url: format.url },
            caption: `*YouTube Downloader*\n\n📹 *Judul:* ${info.videoDetails.title}\n⏱️ *Durasi:* ${info.videoDetails.lengthSeconds} detik`
        });
        
    } catch (error) {
        console.error('YouTube error:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengunduh video. Pastikan link valid.' });
    }
}

async function igCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link Instagram!\nContoh: .ig https://instagram.com/p/xxx' });
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Sedang memproses...' });
        
        const apiUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl, { timeout: 30000 });
        
        if (response.data) {
            const instaData = response.data;
            
            await sock.sendMessage(message.key.remoteJid, {
                text: `*Instagram Info*\n\n📷 *Author:* ${instaData.author_name || 'Unknown'}\n📝 *Title:* ${instaData.title || 'No title'}\n🔗 *URL:* ${instaData.author_url || url}`
            });
        } else {
            throw new Error('Tidak bisa mengambil data');
        }
    } catch (error) {
        console.error('Instagram error:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengambil info Instagram.' });
    }
}

async function stikerCommand(sock, message, text) {
    try {
        const msgType = getContentType(message.message);
        const isQuoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        let mediaBuffer;
        let isVideo = false;
        
        if (isQuoted) {
            const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedType = getContentType(quotedMsg);
            
            if (!['imageMessage', 'videoMessage'].includes(quotedType)) {
                return sock.sendMessage(message.key.remoteJid, { text: 'Hanya bisa reply gambar/video!' });
            }
            
            const stream = await downloadContentFromMessage(quotedMsg[quotedType], quotedType.replace('Message', ''));
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            mediaBuffer = Buffer.concat(chunks);
            isVideo = quotedType === 'videoMessage';
        } else {
            if (!['imageMessage', 'videoMessage'].includes(msgType)) {
                return sock.sendMessage(message.key.remoteJid, { text: 'Reply gambar/video dengan caption .stiker' });
            }
            
            const stream = await downloadContentFromMessage(message.message[msgType], msgType.replace('Message', ''));
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            mediaBuffer = Buffer.concat(chunks);
            isVideo = msgType === 'videoMessage';
        }
        
        let stickerBuffer;
        
        if (isVideo) {
            stickerBuffer = await createStickerFromVideo(mediaBuffer);
        } else {
            stickerBuffer = await createStickerFromImage(mediaBuffer);
        }
        
        await sock.sendMessage(message.key.remoteJid, {
            sticker: stickerBuffer
        }, { quoted: message });
        
    } catch (error) {
        console.error('Sticker error:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal membuat stiker.' });
    }
}

async function githubCommand(sock, message, text) {
    const username = text.split(' ')[1];
    if (!username) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan username GitHub.\nContoh: .github humpreydev-hash' });
    
    try {
        const { data } = await axios.get(`https://api.github.com/users/${username}`, { timeout: 10000 });
        const resultText = `*GitHub Profile*\n\n👤 *Username:* ${data.login}\n📝 *Name:* ${data.name || 'No name'}\n📊 *Public Repos:* ${data.public_repos}\n👥 *Followers:* ${data.followers}\n🔗 *Profile:* ${data.html_url}`;
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ User tidak ditemukan.' });
    }
}

async function gigCommand(sock, message) {
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(groupJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const participants = metadata.participants;
        
        const groupInfo = `
*Group Information*
📛 *Nama Grup:* ${metadata.subject}
👥 *Total Member:* ${participants.length} orang
🔗 *Group ID:* ${metadata.id}
📅 *Dibuat:* ${new Date(metadata.creation * 1000).toLocaleDateString('id-ID')}
🔒 *Status:* ${metadata.announce ? 'Terkunci' : 'Terbuka'}
        `;
        
        await sock.sendMessage(groupJid, { text: groupInfo });
    } catch (error) {
        console.error('Group info error:', error);
        await sock.sendMessage(groupJid, { text: '❌ Gagal mendapatkan info grup.' });
    }
}

async function linkCommand(sock, message) {
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(groupJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    try {
        const code = await sock.groupInviteCode(groupJid);
        const inviteLink = `https://chat.whatsapp.com/${code}`;
        
        await sock.sendMessage(groupJid, {
            text: `*Group Invite Link*\n\n🔗 ${inviteLink}\n\nShare link ini untuk mengundang orang ke grup.`
        });
    } catch (error) {
        console.error('Link error:', error);
        await sock.sendMessage(groupJid, { text: '❌ Gagal membuat link. Pastikan bot admin.' });
    }
}

const tebakkataData = [
    { soal: "Aku punya daun tapi bukan pohon, aku punya duri tapi bukan mawar. Siapa aku?", jawab: "nanas" },
    { soal: "Berjalan tanpa kaki, bernyanyi tanpa mulut, tak pernah tidur tapi selalu diam. Siapa aku?", jawab: "sungai" }
];

let activeGames = {};

async function tebakkataCommand(sock, message) {
    const gameId = message.key.remoteJid;
    const randomGame = tebakkataData[Math.floor(Math.random() * tebakkataData.length)];
    
    activeGames[gameId] = {
        type: 'tebakkata',
        answer: randomGame.jawab.toLowerCase(),
        timestamp: Date.now()
    };
    
    await sock.sendMessage(gameId, {
        text: `*Game Tebak Kata* 🎮\n\n${randomGame.soal}\n\nJawab dengan mengetik jawaban kamu!`
    });
    
    setTimeout(() => {
        if (activeGames[gameId]) {
            delete activeGames[gameId];
        }
    }, 5 * 60 * 1000);
}

async function mathquizCommand(sock, message) {
    const gameId = message.key.remoteJid;
    const num1 = Math.floor(Math.random() * 50) + 1;
    const num2 = Math.floor(Math.random() * 50) + 1;
    const operators = ['+', '-', '*'];
    const operator = operators[Math.floor(Math.random() * operators.length)];
    
    let answer;
    switch(operator) {
        case '+': answer = num1 + num2; break;
        case '-': answer = num1 - num2; break;
        case '*': answer = num1 * num2; break;
    }
    
    activeGames[gameId] = {
        type: 'mathquiz',
        answer: answer.toString(),
        timestamp: Date.now()
    };
    
    await sock.sendMessage(gameId, {
        text: `*Math Quiz* 🧮\n\nBerapakah hasil dari: ${num1} ${operator} ${num2} ?\n\nJawab dengan angka!`
    });
    
    setTimeout(() => {
        if (activeGames[gameId]) {
            delete activeGames[gameId];
        }
    }, 3 * 60 * 1000);
}

async function handleGameAnswer(sock, message) {
    const gameId = message.key.remoteJid;
    const game = activeGames[gameId];
    
    if (!game) return false;
    
    const userAnswer = extractMessageText(message).toLowerCase().trim();
    const senderJid = message.key.participant || message.key.remoteJid;
    
    if (game.type === 'tebakkata') {
        if (userAnswer === game.answer) {
            delete activeGames[gameId];
            await sock.sendMessage(gameId, {
                text: `🎉 *Benar!*\nJawaban: ${game.answer}\n\nSelamat ${senderJid.split('@')[0]}!`
            }, { quoted: message });
            return true;
        }
    } else if (game.type === 'mathquiz') {
        if (userAnswer === game.answer) {
            delete activeGames[gameId];
            await sock.sendMessage(gameId, {
                text: `🎉 *Benar!*\nJawaban: ${game.answer}\n\nSelamat ${senderJid.split('@')[0]}!`
            }, { quoted: message });
            return true;
        }
    }
    
    return false;
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
                console.log('📲 Scan QR code ini dengan WhatsApp Anda:');
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
                    console.log('🔄 Mencoba sambung ulang dalam 10 detik...');
                    setTimeout(() => {
                        console.log('🔁 Menyambung ulang...');
                        startBot();
                    }, 10000);
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
            const messageText = extractMessageText(msg);
            
            console.log(`📩 Dari: ${senderJid.split('@')[0]} | Pesan: ${messageText.substring(0, 50)}...`);
            
            await autoVerifyOwner(senderJid);
            
            const isGameAnswer = await handleGameAnswer(sock, msg);
            if (isGameAnswer) return;
            
            if (!messageText || !messageText.startsWith(botPrefix)) return;

            const isVerified = await isUserVerified(senderJid);
            
            if (messageText !== '.verify' && !isVerified) {
                return sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Kamu belum terverifikasi.\nKetik *.verify* untuk menggunakan bot.'
                });
            }
            
            if (selfMode && !isOwner(senderJid)) {
                console.log(`🔒 Self mode aktif, blokir: ${senderJid}`);
                return;
            }

            const command = messageText.toLowerCase().trim().split(/ +/)[0];

            try {
                switch (command) {
                    case '.menu': case '.help': await showMenu(sock, msg); break;
                    case '.verify': await verifyCommand(sock, msg); break;
                    case '.ping': await sock.sendMessage(msg.key.remoteJid, { text: '🏓 Pong! Bot aktif.' }); break;
                    case '.owner': await sock.sendMessage(msg.key.remoteJid, { text: `👑 Owner: ${ownerNumber}` }); break;
                    case '.tiktok': case '.tt': await tiktokCommand(sock, msg, messageText); break;
                    case '.yt': case '.youtube': await ytCommand(sock, msg, messageText); break;
                    case '.ig': case '.instagram': await igCommand(sock, msg, messageText); break;
                    case '.stiker': case '.sticker': await stikerCommand(sock, msg, messageText); break;
                    case '.github': await githubCommand(sock, msg, messageText); break;
                    case '.gig': await gigCommand(sock, msg); break;
                    case '.link': await linkCommand(sock, msg); break;
                    case '.tebakkata': await tebakkataCommand(sock, msg); break;
                    case '.mathquiz': await mathquizCommand(sock, msg); break;
                    case '.self': 
                        if (isOwner(senderJid)) {
                            selfMode = true;
                            await sock.sendMessage(msg.key.remoteJid, { text: '✅ Mode self diaktifkan.' });
                        }
                        break;
                    case '.unself': 
                        if (isOwner(senderJid)) {
                            selfMode = false;
                            await sock.sendMessage(msg.key.remoteJid, { text: '✅ Mode self dinonaktifkan.' });
                        }
                        break;
                    default: 
                        if (messageText.startsWith(botPrefix)) {
                            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Command "${command}" tidak dikenal. Ketik .menu` });
                        }
                        break;
                }
            } catch (error) {
                console.error(`❌ Error command ${command}:`, error.message);
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Maaf, terjadi kesalahan.' });
            }
        });

        console.log('🎉 Bot siap menerima pesan!');

    } catch (error) {
        console.error('❌ Error setup bot:', error.message);
        console.log('🔄 Restart dalam 5 detik...');
        setTimeout(startBot, 5000);
    }
}

startBot().catch(err => {
    console.error("💥 Fatal error:", err.message);
    setTimeout(startBot, 10000);
});