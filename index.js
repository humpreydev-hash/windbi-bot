import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import fs from 'fs/promises';
import os from 'os';
import osUtils from 'os-utils';
import sqlite3 from 'sqlite3';
import ffmpeg from 'fluent-ffmpeg';

// --- PENYESUAIAN UNTUK ESM ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// -----------------------------

// --- KONFIGURASI BOT ---
const ownerNumber = '6285929088764@s.whatsapp.net';
const botPrefix = '.';
let selfMode = false;

// Path untuk Railway
const sessionId = process.env.RAILWAY_SERVICE_NAME || 'session';
const dbPath = path.join('/tmp', 'verified_users.db');
const authPath = path.join(__dirname, 'auth_info_' + sessionId);
const tempDir = path.join('/tmp', 'bot_temp');

// Buat temp directory jika belum ada
try {
    await fs.mkdir(tempDir, { recursive: true });
    console.log('✅ Temporary directory created');
} catch (error) {
    console.log('Temporary directory already exists');
}
// -------------------------

// --- FUNGSI DATABASE ---
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS verified_users (jid TEXT PRIMARY KEY)');
    console.log('✅ Database initialized');
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
// -------------------------

// --- DATA GAME ---
const tebakkataData = [
    { soal: "Aku punya daun tapi bukan pohon, aku punya duri tapi bukan mawar. Siapa aku?", jawab: "nanas" },
    { soal: "Berjalan tanpa kaki, bernyanyi tanpa mulut, tak pernah tidur tapi selalu diam. Siapa aku?", jawab: "sungai" },
    { soal: "Semakin dikeringkan, semakin basah. Apa itu?", jawab: "handuk" },
    { soal: "Benda apa yang selalu naik tapi tidak pernah turun?", jawab: "umur" },
    { soal: "Bisa menembus kaca tanpa merusaknya. Apa itu?", jawab: "cahaya" }
];

let activeGames = {};
// -------------------------

// --- FUNGSI HELPER ---
function extractMessageText(msg) {
    const msgType = Object.keys(msg.message)[0];
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
    const cleanJid = jid.replace(/:[^@]*@/, '@').replace(/\.0$/, '');
    const cleanOwner = ownerNumber.replace(/:[^@]*@/, '@').replace(/\.0$/, '');
    return cleanJid === cleanOwner;
}

async function getGroupAdmins(groupJid, sock) {
    try {
        const metadata = await sock.groupMetadata(groupJid);
        return metadata.participants.filter(p => p.admin).map(p => p.id);
    } catch (error) {
        console.error('Error getting group admins:', error);
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
            console.log(`✅ Owner ${jid} auto-verified`);
        }
        return true;
    }
    return false;
}

// Fungsi untuk convert WebP ke PNG menggunakan ffmpeg
async function convertWebpToPng(webpBuffer) {
    return new Promise((resolve, reject) => {
        const tempWebp = path.join(tempDir, `webp_${Date.now()}.webp`);
        const tempPng = path.join(tempDir, `png_${Date.now()}.png`);
        
        fs.writeFile(tempWebp, webpBuffer)
            .then(() => {
                ffmpeg(tempWebp)
                    .output(tempPng)
                    .on('end', async () => {
                        try {
                            const pngBuffer = await fs.readFile(tempPng);
                            // Cleanup
                            await fs.unlink(tempWebp).catch(() => {});
                            await fs.unlink(tempPng).catch(() => {});
                            resolve(pngBuffer);
                        } catch (err) {
                            reject(err);
                        }
                    })
                    .on('error', (err) => {
                        fs.unlink(tempWebp).catch(() => {});
                        fs.unlink(tempPng).catch(() => {});
                        reject(err);
                    })
                    .run();
            })
            .catch(reject);
    });
}

// Fungsi untuk membuat sticker dari gambar (ffmpeg only)
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

// Fungsi untuk membuat sticker dari video
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

// Fungsi untuk konversi WebP ke video (untuk sticker animated)
async function convertWebpToVideo(webpBuffer) {
    return new Promise((resolve, reject) => {
        const tempInput = path.join(tempDir, `animated_input_${Date.now()}.webp`);
        const tempOutput = path.join(tempDir, `video_output_${Date.now()}.mp4`);
        
        fs.writeFile(tempInput, webpBuffer)
            .then(() => {
                ffmpeg(tempInput)
                    .outputOptions([
                        '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p',
                        '-vf', 'scale=512:512',
                        '-r', '10'
                    ])
                    .toFormat('mp4')
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

// Fungsi untuk convert WebP ke GIF
async function convertWebpToGif(webpBuffer) {
    return new Promise((resolve, reject) => {
        const tempInput = path.join(tempDir, `gif_input_${Date.now()}.webp`);
        const tempOutput = path.join(tempDir, `gif_output_${Date.now()}.gif`);
        
        fs.writeFile(tempInput, webpBuffer)
            .then(() => {
                ffmpeg(tempInput)
                    .outputOptions([
                        '-vf', 'scale=512:512:flags=lanczos',
                        '-r', '10'
                    ])
                    .toFormat('gif')
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
// -------------------------

// --- FUNGSI-FUNGSI FITUR ---

// 1. Menu
async function showMenu(sock, message) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const statusUptime = `${hours} Jam ${minutes} Menit ${seconds} Detik`;

    let cpuUsage = 0;
    let ramUsage = '0';
    let usedMem = 0;
    let totalMem = 0;
    
    try {
        cpuUsage = await new Promise(resolve => osUtils.cpuUsage(resolve));
        const freeMem = osUtils.freemem();
        totalMem = osUtils.totalmem();
        usedMem = totalMem - freeMem;
        ramUsage = ((usedMem / totalMem) * 100).toFixed(2);
    } catch (error) {
        console.log('Error getting system info:', error.message);
    }
    
    const menuText = `
╭╼━━━━━━━━━━━━━━━━━━━━╾❐
│ 𝗪𝗜𝗡𝗗𝗕𝗜 𝗕𝗢𝗧 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣
├╼━━━━━━━━━━━━━━━━━━━━╾╮
│ 𝗨𝗣𝗧𝗜𝗠𝗘 𝗦𝗬𝗦𝗧𝗘𝗠
│ • CPU   : ${cpuUsage.toFixed(2)}%
│ • RAM   : ${ramUsage}% (${(usedMem / 1024).toFixed(2)}MB / ${(totalMem / 1024).toFixed(2)}MB)
│
│ 𝗦𝗧𝗔𝗧𝗨𝗦 : ${statusUptime}
├╼━━━━━━━━━━━━━━━━━━━━╾〢
│ Bot ini dibuat oleh aal
│ [humpreyDev]. Bot simple
│ menggunakan Node.js.
╰╼━━━━━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗣𝗨𝗕𝗟𝗜𝗞 ⧽━╾❐
│ • .verify
│ • .link
│ • .gig
│ • .github <user>
│ • .menu
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗚𝗔𝗠𝗘𝗦 ⧽━╾❐
│ • .tebakkata
│ • .mathquiz
│ • .tebakangka
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗙𝗨𝗡 ⧽━╾❐
│ • .cekiman <@tag>
│ • .cekfemboy <@tag>
│ • .cekfurry <@tag>
│ • .cekjamet <@tag>
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥 ⧽━╾❐
│ • .yt <url>
│ • .ig <url>
│ • .tiktok <url>
│ • .stiker
│ • .tostiker
│ • .tomedia
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗔𝗗𝗠𝗜𝗡 ⧽━╾❐
│ • .kick <@tag>
│ • .ban <@tag>
│ • .grup buka|tutup
│ • .totag <pesan>
│ • .self
│ • .unself
╰╼━━━━━━━━━━━━━━━━╾❏

╭╼━⧼ 𝗠𝗘𝗡𝗨 𝗢𝗪𝗡𝗘𝗥 ⧽━╾❐
│ • .npm <package>
│ • .gclone <link>
│ • .apistatus
│ • .log
╰╼━━━━━━━━━━━━━━━━╾❏
📱 Owner: 6285929088764
🔄 Prefix: ${botPrefix}
`;
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: menuText });
    } catch (error) {
        console.error('Error sending menu:', error);
        await sock.sendMessage(message.key.remoteJid, { text: 'Menu bot:\n.menu - Tampilkan menu\n.verify - Verifikasi\n.help - Bantuan' });
    }
}

// 2. Verify
async function verifyCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    
    if (isOwner(senderJid)) {
        if (!(await isUserVerified(senderJid))) {
            await addUserToDatabase(senderJid);
        }
        return sock.sendMessage(message.key.remoteJid, { text: '✅ Owner otomatis terverifikasi!' });
    }
    
    if (await isUserVerified(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '✅ Nomor kamu sudah terverifikasi.' });
    }
    await addUserToDatabase(senderJid);
    return sock.sendMessage(message.key.remoteJid, { text: '✅ Verifikasi berhasil! Selamat menggunakan bot.' });
}

// 3. Self / Unself
async function selfCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    selfMode = true;
    return sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self diaktifkan. Hanya owner yang bisa menggunakan bot.' });
}

async function unselfCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    selfMode = false;
    return sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self dinonaktifkan.' });
}

// 4. TikTok Downloader
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
        console.error('TikTok download error:', error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Coba link lain.' });
    }
}

// 5. Instagram Downloader
async function igCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link Instagramnya!\nContoh: .ig https://instagram.com/p/xxx' });
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Sedang memproses...' });
        
        // Coba ambil video/image dari Instagram
        const apiUrl = `https://www.instagram.com/p/${url.split('/').pop()}/?__a=1&__d=1`;
        const response = await axios.get(apiUrl, { timeout: 30000 });
        
        if (response.data && response.data.graphql) {
            const media = response.data.graphql.shortcode_media;
            
            if (media.is_video) {
                await sock.sendMessage(message.key.remoteJid, {
                    video: { url: media.video_url },
                    caption: `*Instagram Downloader*\n\n👤 *Author:* ${media.owner.username}`
                });
            } else {
                await sock.sendMessage(message.key.remoteJid, {
                    image: { url: media.display_url },
                    caption: `*Instagram Downloader*\n\n👤 *Author:* ${media.owner.username}`
                });
            }
        } else {
            throw new Error('Tidak bisa mengambil data');
        }
    } catch (error) {
        console.error('Instagram download error:', error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Coba link lain.' });
    }
}

// 6. YouTube Video Downloader
async function ytCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Kirim link YouTube!\nContoh: .yt https://youtube.com/watch?v=xxx' });
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Sedang mengunduh video...' });
        
        const apiUrl = `https://y2mate.guru/api/convert`;
        const response = await axios.post(apiUrl, {
            url: url,
            format: 'mp4',
            quality: '360p'
        }, { timeout: 60000 });
        
        const data = response.data;
        
        if (data.url) {
            await sock.sendMessage(message.key.remoteJid, {
                video: { url: data.url },
                caption: `*YouTube Downloader*\n\n📹 *Judul:* ${data.title || 'YouTube Video'}`
            });
        } else {
            throw new Error('Download URL tidak ditemukan');
        }
        
    } catch (error) {
        console.error('YouTube video error:', error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengunduh video. Coba link lain.' });
    }
}

// 7. Sticker dengan ffmpeg
async function stikerCommand(sock, message, text) {
    try {
        const msgType = Object.keys(message.message)[0];
        const isQuoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
        
        let mediaBuffer;
        let isVideo = false;
        
        if (isQuoted) {
            const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedType = Object.keys(quotedMsg)[0];
            
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
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal membuat stiker.' });
    }
}

// 8. To Sticker
async function tostikerCommand(sock, message) {
    try {
        const msgType = Object.keys(message.message)[0];
        const isQuoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
        
        let mediaBuffer;
        let isVideo = false;
        
        if (isQuoted) {
            const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedType = Object.keys(quotedMsg)[0];
            
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
                return sock.sendMessage(message.key.remoteJid, { text: 'Reply gambar/video dengan caption .tostiker' });
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
        console.error('To sticker error:', error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal membuat stiker.' });
    }
}

// 9. To Media (convert sticker to image/video)
async function tomediaCommand(sock, message) {
    try {
        const msgType = Object.keys(message.message)[0];
        const isQuoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
        
        let stickerMsg;
        
        if (isQuoted) {
            const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
            if (!quotedMsg.stickerMessage) {
                return sock.sendMessage(message.key.remoteJid, { text: 'Reply stiker dengan caption .tomedia' });
            }
            stickerMsg = quotedMsg.stickerMessage;
        } else {
            if (msgType !== 'stickerMessage') {
                return sock.sendMessage(message.key.remoteJid, { text: 'Reply stiker dengan caption .tomedia' });
            }
            stickerMsg = message.message.stickerMessage;
        }
        
        const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const webpBuffer = Buffer.concat(chunks);
        
        const isAnimated = stickerMsg.isAnimated || false;
        
        if (isAnimated) {
            // Convert animated WebP to video atau gif
            try {
                const videoBuffer = await convertWebpToVideo(webpBuffer);
                await sock.sendMessage(message.key.remoteJid, {
                    video: videoBuffer,
                    caption: 'Converted from animated sticker'
                }, { quoted: message });
            } catch (videoError) {
                // Fallback ke GIF
                const gifBuffer = await convertWebpToGif(webpBuffer);
                await sock.sendMessage(message.key.remoteJid, {
                    video: gifBuffer,
                    caption: 'Converted from animated sticker (GIF)'
                }, { quoted: message });
            }
        } else {
            // Convert static WebP to PNG
            const pngBuffer = await convertWebpToPng(webpBuffer);
            await sock.sendMessage(message.key.remoteJid, {
                image: pngBuffer,
                caption: 'Converted from sticker'
            }, { quoted: message });
        }
        
    } catch (error) {
        console.error('To media error:', error);
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengkonversi stiker.' });
    }
}

// 10. Group Open/Close
async function grupCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk admin grup!' });
    }
    
    const action = text.split(' ')[1]?.toLowerCase();
    if (action === 'buka') {
        await sock.groupSettingUpdate(groupJid, 'not_announcement');
        await sock.sendMessage(groupJid, { text: '✅ Grup telah dibuka untuk semua member.' });
    } else if (action === 'tutup') {
        await sock.groupSettingUpdate(groupJid, 'announcement');
        await sock.sendMessage(groupJid, { text: '✅ Grup telah ditutup, hanya admin yang bisa mengirim pesan.' });
    } else {
        await sock.sendMessage(senderJid, { text: '❌ Gunakan: .grup buka atau .grup tutup' });
    }
}

// 11. Tag All
async function totagCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk admin grup!' });
    }
    
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const participants = metadata.participants;
        const mentions = participants.map(p => p.id);
        const msgToTag = text.slice(7).trim() || 'Halo semua!';
        
        await sock.sendMessage(groupJid, {
            text: `📢 *PEMBERITAHUAN*\n\n${msgToTag}\n\n_Dari: ${senderJid.split('@')[0]}_`,
            mentions
        });
        
    } catch (error) {
        console.error('Tag all error:', error);
        return sock.sendMessage(senderJid, { text: '❌ Gagal melakukan tag all.' });
    }
}

// 12. Kick Member
async function kickCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk admin grup!' });
    }
    
    const mentions = parseMention(text);
    if (mentions.length === 0) {
        return sock.sendMessage(senderJid, { text: '❌ Tag member yang ingin di-kick!\nContoh: .kick @member' });
    }
    
    try {
        for (const userJid of mentions) {
            await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove');
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        await sock.sendMessage(groupJid, { text: `✅ Berhasil mengeluarkan ${mentions.length} member.` });
    } catch (error) {
        console.error('Kick error:', error);
        return sock.sendMessage(senderJid, { text: '❌ Gagal mengeluarkan member.' });
    }
}

// 13. Ban Member
async function banCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        return sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk admin grup!' });
    }
    
    const mentions = parseMention(text);
    if (mentions.length === 0) {
        return sock.sendMessage(senderJid, { text: '❌ Tag member yang ingin di-ban!\nContoh: .ban @member' });
    }
    
    try {
        for (const userJid of mentions) {
            await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove');
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        await sock.sendMessage(groupJid, { text: `✅ Berhasil mem-ban ${mentions.length} member.` });
    } catch (error) {
        console.error('Ban error:', error);
        return sock.sendMessage(senderJid, { text: '❌ Gagal mem-ban member.' });
    }
}

// 14. GitHub Info
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

// 15. NPM Info
async function npmCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    
    const packageName = text.split(' ')[1];
    if (!packageName) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan nama package.\nContoh: .npm axios' });
    
    try {
        const { data } = await axios.get(`https://registry.npmjs.org/${packageName}`, { timeout: 10000 });
        const latestVersion = data['dist-tags'].latest;
        const description = data.versions[latestVersion].description || 'Tidak ada deskripsi.';
        const resultText = `*NPM Package Info*\n\n📦 *Name:* ${packageName}\n🔖 *Version:* ${latestVersion}\n📄 *Description:* ${description}`;
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Package tidak ditemukan.' });
    }
}

// 16. GitHub Clone
async function gcloneCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    
    const url = text.split(' ')[1];
    if (!url) return sock.sendMessage(message.key.remoteJid, { text: 'Masukkan link GitHub.\nContoh: .gclone https://github.com/user/repo' });
    
    try {
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            return sock.sendMessage(message.key.remoteJid, { text: '❌ Format URL tidak valid.' });
        }
        
        const [, user, repo] = match;
        const repoUrl = `https://github.com/${user}/${repo}`;
        const apiUrl = `https://api.github.com/repos/${user}/${repo}`;
        
        const { data } = await axios.get(apiUrl, { timeout: 10000 });
        const resultText = `*GitHub Repository Info*\n\n📂 *Repo:* ${data.full_name}\n📝 *Description:* ${data.description || 'No description'}\n⭐ *Stars:* ${data.stargazers_count}\n🍴 *Forks:* ${data.forks_count}\n🔗 *URL:* ${repoUrl}\n📥 *Clone:* \`git clone ${repoUrl}.git\``;
        
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        console.error('GitHub clone error:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendapatkan info repository.' });
    }
}

// 17. API Status
async function apistatusCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    
    try {
        const apis = [
            { name: 'GitHub API', url: 'https://api.github.com' },
            { name: 'NPM Registry', url: 'https://registry.npmjs.org' },
            { name: 'YouTube', url: 'https://www.youtube.com' }
        ];
        
        let statusText = '*API Status Check*\n\n';
        
        for (const api of apis) {
            try {
                const start = Date.now();
                await axios.get(api.url, { timeout: 5000 });
                const latency = Date.now() - start;
                statusText += `✅ ${api.name}: Online (${latency}ms)\n`;
            } catch (error) {
                statusText += `❌ ${api.name}: Offline\n`;
            }
        }
        
        await sock.sendMessage(message.key.remoteJid, { text: statusText });
    } catch (error) {
        console.error('API status error:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengecek status API.' });
    }
}

// 18. Log
async function logCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk owner!' });
    }
    
    try {
        const verifiedCount = await getVerifiedCount();
        const logInfo = `
*System Log Information*
        
🖥️ *Platform:* ${process.platform}
📦 *Node.js:* ${process.version}
🗺️ *Architecture:* ${process.arch}
⏱️ *Uptime:* ${Math.floor(process.uptime())} detik
💾 *Memory Usage:* ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
📂 *Working Directory:* ${process.cwd()}
        
*Bot Status:*
✅ Connected
🔧 Self Mode: ${selfMode ? 'ON' : 'OFF'}
📊 Verified Users: ${verifiedCount} users
        `;
        
        await sock.sendMessage(message.key.remoteJid, { text: logInfo });
    } catch (error) {
        console.error('Log error:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengambil log.' });
    }
}

// Helper: Get verified users count
function getVerifiedCount() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM verified_users', (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

// 19. Get Group Info
async function gigCommand(sock, message) {
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        return sock.sendMessage(groupJid, { text: '❌ Command ini hanya untuk grup!' });
    }
    
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const participants = metadata.participants;
        const admins = participants.filter(p => p.admin).map(p => p.id.split('@')[0]);
        
        const groupInfo = `
*Group Information*
        
📛 *Nama Grup:* ${metadata.subject}
👑 *Pembuat:* ${metadata.owner?.split('@')[0] || 'Unknown'}
👥 *Total Member:* ${participants.length} orang
🛡️ *Admin:* ${admins.length} orang
🔗 *Group ID:* ${metadata.id}
📅 *Dibuat:* ${new Date(metadata.creation * 1000).toLocaleDateString()}
🔒 *Status:* ${metadata.announce ? 'Terkunci (hanya admin)' : 'Terbuka (semua bisa chat)'}
        `;
        
        await sock.sendMessage(groupJid, { text: groupInfo });
    } catch (error) {
        console.error('Group info error:', error);
        await sock.sendMessage(groupJid, { text: '❌ Gagal mendapatkan info grup.' });
    }
}

// 20. Link Group
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
        await sock.sendMessage(groupJid, { text: '❌ Gagal membuat link grup. Pastikan bot adalah admin.' });
    }
}

// 21. Tebak Kata Game
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

// 22. Math Quiz Game
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

// 23. Tebak Angka Game
async function tebakangkaCommand(sock, message) {
    const gameId = message.key.remoteJid;
    const answer = Math.floor(Math.random() * 100) + 1;
    
    activeGames[gameId] = {
        type: 'tebakangka',
        answer: answer.toString(),
        timestamp: Date.now(),
        attempts: 0,
        hints: 0
    };
    
    await sock.sendMessage(gameId, {
        text: `*Game Tebak Angka* 🎯\n\nSaya memikirkan angka antara 1-100.\nTebak angka yang saya pikirkan!\n\nKetik .hint untuk mendapatkan petunjuk.`
    });
    
    setTimeout(() => {
        if (activeGames[gameId]) {
            delete activeGames[gameId];
        }
    }, 5 * 60 * 1000);
}

// 24. Cek Fun
function cekFun(sock, message, text, type) {
    const mentions = parseMention(text);
    const senderJid = message.key.participant || message.key.remoteJid;
    
    if (mentions.length === 0) {
        const percentage = Math.floor(Math.random() * 101);
        const types = {
            'iman': 'Kadar iman',
            'femboy': 'Kadar femboy',
            'furry': 'Kadar furry',
            'jamet': 'Kadar jamet'
        };
        
        sock.sendMessage(message.key.remoteJid, {
            text: `${types[type]} kamu: ${percentage}% ${percentage > 70 ? '😱' : percentage > 40 ? '😅' : '😌'}`
        }, { quoted: message });
    } else {
        const target = mentions[0];
        const percentage = Math.floor(Math.random() * 101);
        const types = {
            'iman': 'Kadar iman',
            'femboy': 'Kadar femboy',
            'furry': 'Kadar furry',
            'jamet': 'Kadar jamet'
        };
        
        sock.sendMessage(message.key.remoteJid, {
            text: `${types[type]} orang itu: ${percentage}%`,
            mentions: [target]
        }, { quoted: message });
    }
}

// 25. Game Handler
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
    } else if (game.type === 'tebakangka') {
        game.attempts++;
        const userNum = parseInt(userAnswer);
        const answerNum = parseInt(game.answer);
        
        if (isNaN(userNum)) return false;
        
        if (userNum === answerNum) {
            delete activeGames[gameId];
            await sock.sendMessage(gameId, {
                text: `🎉 *Benar!*\nAngka yang saya pikirkan: ${game.answer}\n\nKamu menebak dalam ${game.attempts} percobaan!\nSelamat ${senderJid.split('@')[0]}!`
            }, { quoted: message });
            return true;
        } else {
            let hint = '';
            if (userNum < answerNum) {
                hint = '📈 Angka terlalu kecil!';
            } else {
                hint = '📉 Angka terlalu besar!';
            }
            
            if (game.attempts % 3 === 0 && game.hints < 3) {
                game.hints++;
                const rangeHint = `Angka antara ${Math.max(1, answerNum - 10)} dan ${Math.min(100, answerNum + 10)}`;
                await sock.sendMessage(gameId, {
                    text: `❌ Salah!\n${hint}\n\n💡 *Hint ${game.hints}:* ${rangeHint}`
                }, { quoted: message });
            } else {
                await sock.sendMessage(gameId, {
                    text: `❌ Salah!\n${hint}`
                }, { quoted: message });
            }
            return true;
        }
    }
    
    return false;
}

// 26. Hint
async function hintCommand(sock, message) {
    const gameId = message.key.remoteJid;
    const game = activeGames[gameId];
    
    if (!game || game.type !== 'tebakangka') {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Tidak ada game tebak angka yang aktif!' });
    }
    
    if (game.hints >= 3) {
        return sock.sendMessage(message.key.remoteJid, { text: '❌ Sudah menggunakan semua hint!' });
    }
    
    game.hints++;
    const answerNum = parseInt(game.answer);
    let hint;
    
    switch(game.hints) {
        case 1:
            hint = `Angka ini ${answerNum % 2 === 0 ? 'genap' : 'ganjil'}`;
            break;
        case 2:
            hint = `Angka ini ${answerNum > 50 ? 'lebih dari' : 'kurang dari atau sama dengan'} 50`;
            break;
        case 3:
            const tens = Math.floor(answerNum / 10) * 10;
            hint = `Angka ini berada di antara ${tens} dan ${tens + 10}`;
            break;
    }
    
    await sock.sendMessage(message.key.remoteJid, {
        text: `💡 *Hint ${game.hints}:* ${hint}`
    });
}

// --- FUNGSI UTAMA BOT ---
async function startBot() {
    console.log('🚀 Memulai bot WhatsApp...');

    try {
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📱 Menggunakan WA Web v${version.join('.')}, isLatest: ${isLatest}`);

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            defaultStoreOptions: { syncHistory: false },
            markOnlineOnConnect: true,
            syncFullHistory: false,
            retryRequestDelayMs: 1000,
            maxMsgRetryCount: 3,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📲 Scan QR code ini dengan WhatsApp Anda:');
                qrcode.generate(qr, { small: true });
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
                console.log(`🔗 Atau buka link ini di browser: ${qrUrl}`);
            }
            
            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log(`❌ Koneksi terputus. Status: ${statusCode}`);
                
                if (statusCode !== DisconnectReason.loggedOut) {
                    console.log('🔄 Mencoba reconnect dalam 10 detik...');
                    setTimeout(() => {
                        console.log('🔁 Reconnecting...');
                        startBot();
                    }, 10000);
                } else {
                    console.log('📵 Logged out, perlu scan QR lagi');
                    try {
                        await fs.rm(authPath, { recursive: true, force: true });
                        console.log('🗑️ Session dihapus, silakan scan QR lagi');
                    } catch (e) {
                        console.log('⚠️ Gagal hapus session:', e.message);
                    }
                }
            } else if (connection === 'open') {
                console.log('✅ Bot berhasil terhubung!');
                console.log(`👤 Bot ID: ${sock.user?.id}`);
            }
        });

        // Listener untuk pesan masuk
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            const msg = messages[0];
            if (!msg.message) return;
            if (msg.message.protocolMessage) return;
            if (msg.key.fromMe) return;

            const senderJid = msg.key.participant || msg.key.remoteJid;
            const messageText = extractMessageText(msg);
            
            console.log(`\n📩 --- Pesan Masuk ---`);
            console.log(`👤 Dari: ${senderJid}`);
            console.log(`💬 Pesan: ${messageText?.substring(0, 50)}...`);
            console.log(`📝 --------------------\n`);
            
            // Auto-verify owner
            await autoVerifyOwner(senderJid);
            
            // Cek game answer
            const isGameAnswer = await handleGameAnswer(sock, msg);
            if (isGameAnswer) return;
            
            if (!messageText || !messageText.startsWith(botPrefix)) return;

            const command = messageText.toLowerCase().trim().split(/ +/)[0];

            // Verifikasi check
            const isVerified = await isUserVerified(senderJid);
            
            if (command !== '.verify' && !isVerified) {
                return sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Kamu belum terverifikasi.\nKetik *.verify* untuk menggunakan bot.'
                });
            }
            
            // Self mode check
            if (selfMode && !isOwner(senderJid)) {
                console.log(`🔒 Self mode aktif, blokir: ${senderJid}`);
                return;
            }

            try {
                switch (command) {
                    case '.menu': case '.help': await showMenu(sock, msg); break;
                    case '.verify': await verifyCommand(sock, msg); break;
                    case '.self': await selfCommand(sock, msg); break;
                    case '.unself': await unselfCommand(sock, msg); break;
                    case '.tiktok': case '.tos': await tiktokCommand(sock, msg, messageText); break;
                    case '.ig': await igCommand(sock, msg, messageText); break;
                    case '.yt': await ytCommand(sock, msg, messageText); break;
                    case '.stiker': await stikerCommand(sock, msg, messageText); break;
                    case '.tostiker': await tostikerCommand(sock, msg); break;
                    case '.tomedia': await tomediaCommand(sock, msg); break;
                    case '.grup': await grupCommand(sock, msg, messageText); break;
                    case '.totag': await totagCommand(sock, msg, messageText); break;
                    case '.kick': await kickCommand(sock, msg, messageText); break;
                    case '.ban': await banCommand(sock, msg, messageText); break;
                    case '.github': await githubCommand(sock, msg, messageText); break;
                    case '.npm': await npmCommand(sock, msg, messageText); break;
                    case '.gclone': await gcloneCommand(sock, msg, messageText); break;
                    case '.apistatus': await apistatusCommand(sock, msg); break;
                    case '.log': await logCommand(sock, msg); break;
                    case '.gig': await gigCommand(sock, msg); break;
                    case '.link': await linkCommand(sock, msg); break;
                    case '.tebakkata': await tebakkataCommand(sock, msg); break;
                    case '.mathquiz': await mathquizCommand(sock, msg); break;
                    case '.tebakangka': await tebakangkaCommand(sock, msg); break;
                    case '.hint': await hintCommand(sock, msg); break;
                    case '.cekiman': cekFun(sock, msg, messageText, 'iman'); break;
                    case '.cekfemboy': cekFun(sock, msg, messageText, 'femboy'); break;
                    case '.cekfurry': cekFun(sock, msg, messageText, 'furry'); break;
                    case '.cekjamet': cekFun(sock, msg, messageText, 'jamet'); break;
                    case '.ping': await sock.sendMessage(msg.key.remoteJid, { text: '🏓 Pong!' }); break;
                    default: await sock.sendMessage(msg.key.remoteJid, { text: `❌ Command "${command}" tidak ditemukan. Ketik .menu` }); break;
                }
            } catch (error) {
                console.error(`❌ Error saat menjalankan command ${command}:`, error.message);
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Maaf, terjadi kesalahan.' });
            }
        });

        console.log('🎉 Bot siap menerima pesan!');

    } catch (error) {
        console.error('❌ Error saat setup bot:', error.message);
        console.log('🔄 Mencoba restart dalam 5 detik...');
        setTimeout(() => {
            console.log('🔁 Restarting bot...');
            startBot();
        }, 5000);
    }
}

// Jalankan bot
try {
    startBot().catch(err => {
        console.error("❌ Gagal menjalankan bot:", err.message);
        console.log("🔄 Mencoba restart dalam 10 detik...");
        setTimeout(() => {
            console.log("🔁 Restarting bot...");
            startBot();
        }, 10000);
    });
} catch (error) {
    console.error("💥 Fatal error:", error.message);
}