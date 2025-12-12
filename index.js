import { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage, getAggregateVotesInPollMessage } from '@whiskeysockets/baileys';
import pkg from '@whiskeysockets/baileys';
const { Browsers, fetchLatestBaileysVersion } = pkg;
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import sqlite3 from 'sqlite3';
import ffmpeg from 'fluent-ffmpeg';
import { exec } from 'child_process';
import util from 'util';
const execAsync = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const botPrefix = '.';
const ownerNumber = '6285929088764@s.whatsapp.net';
let selfMode = false;
let botStartTime = Date.now();

const sessionId = 'whatsapp_bot_session';
const authPath = path.join(__dirname, 'auth_info_' + sessionId);
const dbPath = path.join(__dirname, 'verified_users.db');
const tempDir = path.join(__dirname, 'temp');

async function ensureTempDir() {
    try {
        await fs.mkdir(tempDir, { recursive: true });
        console.log('✅ Direktori temp siap');
    } catch (error) {
        console.log('⚠️ Direktori temp sudah ada');
    }
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS verified_users (jid TEXT PRIMARY KEY, name TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)');
    db.run('CREATE TABLE IF NOT EXISTS user_stats (jid TEXT PRIMARY KEY, command_count INTEGER DEFAULT 0, last_active DATETIME)');
    console.log('✅ Database siap');
});

function isUserVerified(jid) {
    return new Promise((resolve, reject) => {
        const cleanJid = jid.split(':')[0] || jid;
        db.get('SELECT jid FROM verified_users WHERE jid LIKE ?', [`${cleanJid}%`], (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
        });
    });
}

function addVerifiedUser(jid, name = '') {
    return new Promise((resolve, reject) => {
        const cleanJid = jid.split(':')[0] || jid;
        db.run('INSERT OR REPLACE INTO verified_users (jid, name) VALUES (?, ?)', [cleanJid, name], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

function updateUserStats(jid) {
    return new Promise((resolve, reject) => {
        const cleanJid = jid.split(':')[0] || jid;
        db.run('INSERT OR REPLACE INTO user_stats (jid, command_count, last_active) VALUES (?, COALESCE((SELECT command_count FROM user_stats WHERE jid = ?), 0) + 1, CURRENT_TIMESTAMP)', [cleanJid, cleanJid], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getVerifiedCount() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM verified_users', (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

function isOwner(jid) {
    if (!jid) return false;
    const cleanJid = jid.split(':')[0] || jid;
    const cleanOwner = ownerNumber.split(':')[0] || ownerNumber;
    return cleanJid.includes(cleanOwner) || cleanOwner.includes(cleanJid);
}

async function autoVerifyOwner(jid, name = '') {
    if (isOwner(jid)) {
        if (!(await isUserVerified(jid))) {
            await addVerifiedUser(jid, name || 'Owner');
            console.log(`✅ Owner ${jid} terverifikasi otomatis`);
        }
        return true;
    }
    return false;
}

function extractMessageText(msg) {
    if (!msg.message) return '';
    const msgType = Object.keys(msg.message)[0];
    if (msgType === 'conversation') return msg.message.conversation;
    if (msgType === 'extendedTextMessage') return msg.message.extendedTextMessage.text;
    if (msgType === 'imageMessage') return msg.message.imageMessage?.caption || '';
    if (msgType === 'videoMessage') return msg.message.videoMessage?.caption || '';
    return '';
}

function parseMention(text) {
    if (!text) return [];
    const matches = text.match(/\d{10,}@s\.whatsapp\.net/g);
    return matches || [];
}

async function getGroupAdmins(groupJid, sock) {
    try {
        const metadata = await sock.groupMetadata(groupJid);
        return metadata.participants.filter(p => p.admin).map(p => p.id);
    } catch (error) {
        console.error('Error ambil admin:', error);
        return [];
    }
}

async function isGroupAdmin(groupJid, userJid, sock) {
    const admins = await getGroupAdmins(groupJid, sock);
    return admins.includes(userJid);
}

async function createStickerFromImage(imageBuffer) {
    const tempInput = path.join(tempDir, `input_${Date.now()}.jpg`);
    const tempOutput = path.join(tempDir, `sticker_${Date.now()}.webp`);
    
    await fs.writeFile(tempInput, imageBuffer);
    
    return new Promise((resolve, reject) => {
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
    });
}

async function createStickerFromVideo(videoBuffer) {
    const tempInput = path.join(tempDir, `video_${Date.now()}.mp4`);
    const tempOutput = path.join(tempDir, `sticker_video_${Date.now()}.webp`);
    
    await fs.writeFile(tempInput, videoBuffer);
    
    return new Promise((resolve, reject) => {
        ffmpeg(tempInput)
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
    });
}

async function convertWebpToPng(webpBuffer) {
    const tempInput = path.join(tempDir, `webp_${Date.now()}.webp`);
    const tempOutput = path.join(tempDir, `png_${Date.now()}.png`);
    
    await fs.writeFile(tempInput, webpBuffer);
    
    return new Promise((resolve, reject) => {
        ffmpeg(tempInput)
            .output(tempOutput)
            .on('end', async () => {
                try {
                    const pngBuffer = await fs.readFile(tempOutput);
                    await fs.unlink(tempInput).catch(() => {});
                    await fs.unlink(tempOutput).catch(() => {});
                    resolve(pngBuffer);
                } catch (err) {
                    reject(err);
                }
            })
            .on('error', (err) => {
                fs.unlink(tempInput).catch(() => {});
                fs.unlink(tempOutput).catch(() => {});
                reject(err);
            })
            .run();
    });
}

async function showMenu(sock, message) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const totalMem = os.totalmem() / 1024 / 1024;
    const usedMem = (os.totalmem() - os.freemem()) / 1024 / 1024;
    const ramUsage = ((usedMem / totalMem) * 100).toFixed(2);
    
    const verifiedCount = await getVerifiedCount();
    
    const menuText = `
🤖 *WINDY BOT WHATSAPP*

📊 *STATISTIK SISTEM*
• ⏱️ Uptime: ${hours}j ${minutes}m ${seconds}d
• 💾 RAM: ${ramUsage}% (${usedMem.toFixed(1)}MB/${totalMem.toFixed(1)}MB)
• 👥 User: ${verifiedCount} verified

━━━━━━━━━━━━━━━━━━━

📋 *MENU PUBLIK*
• .menu - Tampilkan menu ini
• .verify - Verifikasi akun
• .ping - Cek status bot
• .owner - Info owner
• .github <user> - Cek profil GitHub

🎮 *MENU GAME*
• .tebakkata - Game tebak kata
• .mathquiz - Kuis matematika
• .tebakangka - Tebak angka 1-100
• .hint - Minta petunjuk

😄 *MENU FUN*
• .cekiman [@tag] - Cek kadar iman
• .cekfemboy [@tag] - Cek kadar femboy
• .cekfurry [@tag] - Cek kadar furry
• .cekjamet [@tag] - Cek kadar jamet

⬇️ *MENU DOWNLOADER*
• .tiktok <url> - Download TikTok
• .yt <url> - Download YouTube
• .ig <url> - Download Instagram
• .stiker - Buat stiker (reply gambar/video)
• .tostiker - Convert ke stiker
• .tomedia - Convert stiker ke media

👥 *MENU GRUP*
• .link - Dapatkan link grup
• .gig - Info grup
• .totag <pesan> - Tag semua member
• .kick @tag - Keluarkan member
• .grup buka/tutup - Buka/tutup grup

⚙️ *MENU OWNER*
• .self - Mode hanya owner
• .unself - Mode publik
• .apistatus - Cek status API
• .log - Log sistem
• .npm <pkg> - Info package npm

━━━━━━━━━━━━━━━━━━━
Owner: ${ownerNumber}
Prefix: ${botPrefix}
Bot aktif sejak: ${new Date(botStartTime).toLocaleString()}
    `;
    
    await sock.sendMessage(message.key.remoteJid, { text: menuText });
}

async function verifyCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const senderName = message.pushName || 'User';
    
    if (isOwner(senderJid)) {
        await addVerifiedUser(senderJid, senderName);
        await sock.sendMessage(message.key.remoteJid, { text: '✅ Owner otomatis terverifikasi!' });
        return;
    }
    
    if (await isUserVerified(senderJid)) {
        await sock.sendMessage(message.key.remoteJid, { text: '✅ Kamu sudah terverifikasi sebelumnya.' });
        return;
    }
    
    await addVerifiedUser(senderJid, senderName);
    await sock.sendMessage(message.key.remoteJid, { text: '✅ Verifikasi berhasil! Selamat menggunakan bot.' });
}

async function selfCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    
    if (!isOwner(senderJid)) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
        return;
    }
    
    selfMode = true;
    await sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self diaktifkan. Hanya owner yang bisa menggunakan bot.' });
}

async function unselfCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    
    if (!isOwner(senderJid)) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
        return;
    }
    
    selfMode = false;
    await sock.sendMessage(message.key.remoteJid, { text: '✅ Mode self dinonaktifkan. Bot bisa digunakan semua user.' });
}

async function tiktokCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Kirim link TikTok!\nContoh: .tiktok https://vt.tiktok.com/xxx' });
        return;
    }
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Mendownload video TikTok...' });
        
        const response = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, {
            timeout: 30000
        });
        
        const data = response.data;
        
        if (data.videos && data.videos[0]) {
            const videoUrl = data.videos[0];
            
            await sock.sendMessage(message.key.remoteJid, {
                video: { url: videoUrl },
                caption: `*TIKTOK DOWNLOADER*\n\n🎵 ${data.title || 'Tanpa judul'}\n👤 ${data.author?.nickname || 'Unknown'}`,
                gifPlayback: false
            });
        } else {
            await sock.sendMessage(message.key.remoteJid, { text: '❌ Video tidak ditemukan' });
        }
    } catch (error) {
        console.error('Error TikTok:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Coba link lain.' });
    }
}

async function igCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Kirim link Instagram!\nContoh: .ig https://instagram.com/p/xxx' });
        return;
    }
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Memproses link Instagram...' });
        
        const response = await axios.get(`https://api.ichsan.eu.org/api/instagram?url=${encodeURIComponent(url)}`, {
            timeout: 30000
        });
        
        const data = response.data;
        
        if (data.data && data.data[0]) {
            const mediaUrl = data.data[0].url;
            const isVideo = mediaUrl.includes('.mp4');
            
            if (isVideo) {
                await sock.sendMessage(message.key.remoteJid, {
                    video: { url: mediaUrl },
                    caption: `*INSTAGRAM DOWNLOADER*\n\n👤 ${data.data[0].username || 'Unknown'}`,
                    gifPlayback: false
                });
            } else {
                await sock.sendMessage(message.key.remoteJid, {
                    image: { url: mediaUrl },
                    caption: `*INSTAGRAM DOWNLOADER*\n\n👤 ${data.data[0].username || 'Unknown'}`
                });
            }
        } else {
            await sock.sendMessage(message.key.remoteJid, { text: '❌ Media tidak ditemukan' });
        }
    } catch (error) {
        console.error('Error Instagram:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Coba link lain.' });
    }
}

async function ytCommand(sock, message, text) {
    const url = text.split(' ')[1];
    if (!url) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Kirim link YouTube!\nContoh: .yt https://youtu.be/xxx' });
        return;
    }
    
    try {
        await sock.sendMessage(message.key.remoteJid, { text: '⏳ Mendownload video YouTube...' });
        
        const response = await axios.get(`https://api.ytb.blue/v1/download?url=${encodeURIComponent(url)}`, {
            timeout: 60000
        });
        
        const data = response.data;
        
        if (data.url) {
            await sock.sendMessage(message.key.remoteJid, {
                video: { url: data.url },
                caption: `*YOUTUBE DOWNLOADER*\n\n📹 ${data.title || 'YouTube Video'}`,
                gifPlayback: false
            });
        } else {
            await sock.sendMessage(message.key.remoteJid, { text: '❌ Video tidak ditemukan' });
        }
    } catch (error) {
        console.error('Error YouTube:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mendownload. Coba link lain.' });
    }
}

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
                await sock.sendMessage(message.key.remoteJid, { text: '❌ Hanya bisa reply gambar/video!' });
                return;
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
                await sock.sendMessage(message.key.remoteJid, { text: '❌ Reply gambar/video dengan caption .stiker' });
                return;
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
        console.error('Error stiker:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal membuat stiker.' });
    }
}

async function tostikerCommand(sock, message) {
    try {
        const isQuoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!isQuoted) {
            await sock.sendMessage(message.key.remoteJid, { text: '❌ Reply gambar/video dengan caption .tostiker' });
            return;
        }
        
        const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
        const quotedType = Object.keys(quotedMsg)[0];
        
        if (!['imageMessage', 'videoMessage'].includes(quotedType)) {
            await sock.sendMessage(message.key.remoteJid, { text: '❌ Hanya bisa convert gambar/video!' });
            return;
        }
        
        const stream = await downloadContentFromMessage(quotedMsg[quotedType], quotedType.replace('Message', ''));
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const mediaBuffer = Buffer.concat(chunks);
        const isVideo = quotedType === 'videoMessage';
        
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
        console.error('Error tostiker:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal convert ke stiker.' });
    }
}

async function tomediaCommand(sock, message) {
    try {
        const isQuoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!isQuoted) {
            await sock.sendMessage(message.key.remoteJid, { text: '❌ Reply stiker dengan caption .tomedia' });
            return;
        }
        
        const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
        
        if (!quotedMsg.stickerMessage) {
            await sock.sendMessage(message.key.remoteJid, { text: '❌ Hanya bisa convert stiker!' });
            return;
        }
        
        const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const webpBuffer = Buffer.concat(chunks);
        
        const pngBuffer = await convertWebpToPng(webpBuffer);
        
        await sock.sendMessage(message.key.remoteJid, {
            image: pngBuffer,
            caption: '✅ Stiker berhasil di-convert ke gambar'
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error tomedia:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal convert stiker ke media.' });
    }
}

async function grupCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Command ini hanya untuk grup!' });
        return;
    }
    
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Hanya admin grup yang bisa menggunakan command ini!' });
        return;
    }
    
    const action = text.split(' ')[1]?.toLowerCase();
    
    if (action === 'buka') {
        await sock.groupSettingUpdate(groupJid, 'not_announcement');
        await sock.sendMessage(groupJid, { text: '✅ Grup telah dibuka untuk semua member.' });
    } else if (action === 'tutup') {
        await sock.groupSettingUpdate(groupJid, 'announcement');
        await sock.sendMessage(groupJid, { text: '✅ Grup telah ditutup, hanya admin yang bisa mengirim pesan.' });
    } else {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gunakan: .grup buka atau .grup tutup' });
    }
}

async function totagCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        await sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk grup!' });
        return;
    }
    
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        await sock.sendMessage(senderJid, { text: '❌ Hanya admin grup yang bisa menggunakan command ini!' });
        return;
    }
    
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const participants = metadata.participants;
        const mentions = participants.map(p => p.id);
        const msgToTag = text.slice(7).trim() || 'Halo semua member grup!';
        
        await sock.sendMessage(groupJid, {
            text: `📢 *PEMBERITAHUAN UNTUK SEMUA*\n\n${msgToTag}\n\n_Dari: @${senderJid.split('@')[0]}_`,
            mentions
        });
        
    } catch (error) {
        console.error('Error totag:', error);
        await sock.sendMessage(senderJid, { text: '❌ Gagal melakukan tag all.' });
    }
}

async function kickCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        await sock.sendMessage(senderJid, { text: '❌ Command ini hanya untuk grup!' });
        return;
    }
    
    const isAdmin = await isGroupAdmin(groupJid, senderJid, sock);
    if (!isAdmin && !isOwner(senderJid)) {
        await sock.sendMessage(senderJid, { text: '❌ Hanya admin grup yang bisa menggunakan command ini!' });
        return;
    }
    
    const mentions = parseMention(text);
    if (mentions.length === 0) {
        await sock.sendMessage(senderJid, { text: '❌ Tag member yang ingin di-kick!\nContoh: .kick @member' });
        return;
    }
    
    try {
        await sock.groupParticipantsUpdate(groupJid, mentions, 'remove');
        await sock.sendMessage(groupJid, { text: `✅ Berhasil mengeluarkan ${mentions.length} member.` });
    } catch (error) {
        console.error('Error kick:', error);
        await sock.sendMessage(senderJid, { text: '❌ Gagal mengeluarkan member.' });
    }
}

async function githubCommand(sock, message, text) {
    const username = text.split(' ')[1];
    if (!username) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Masukkan username GitHub!\nContoh: .github humpreydev-hash' });
        return;
    }
    
    try {
        const response = await axios.get(`https://api.github.com/users/${username}`, {
            timeout: 10000
        });
        
        const data = response.data;
        const resultText = `
*GITHUB PROFILE*

👤 *Username:* ${data.login}
📝 *Name:* ${data.name || 'No name'}
🏢 *Company:* ${data.company || 'No company'}
📍 *Location:* ${data.location || 'No location'}
📊 *Public Repos:* ${data.public_repos}
👥 *Followers:* ${data.followers}
🔗 *Following:* ${data.following}
🌐 *Blog:* ${data.blog || 'No blog'}
📧 *Email:* ${data.email || 'No email'}
🔗 *Profile:* ${data.html_url}
        `;
        
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ User tidak ditemukan atau API error.' });
    }
}

async function npmCommand(sock, message, text) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
        return;
    }
    
    const packageName = text.split(' ')[1];
    if (!packageName) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Masukkan nama package!\nContoh: .npm axios' });
        return;
    }
    
    try {
        const response = await axios.get(`https://registry.npmjs.org/${packageName}`, {
            timeout: 10000
        });
        
        const data = response.data;
        const latestVersion = data['dist-tags']?.latest || 'Unknown';
        const description = data.versions?.[latestVersion]?.description || 'No description';
        
        const resultText = `
*NPM PACKAGE INFO*

📦 *Name:* ${packageName}
🔖 *Version:* ${latestVersion}
📄 *Description:* ${description}
👤 *Author:* ${data.author?.name || 'Unknown'}
📅 *Modified:* ${new Date(data.time?.modified || Date.now()).toLocaleDateString()}
🔗 *NPM:* https://www.npmjs.com/package/${packageName}
        `;
        
        await sock.sendMessage(message.key.remoteJid, { text: resultText });
    } catch (error) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Package tidak ditemukan.' });
    }
}

async function apistatusCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
        return;
    }
    
    try {
        const apis = [
            { name: 'GitHub API', url: 'https://api.github.com' },
            { name: 'NPM Registry', url: 'https://registry.npmjs.org' },
            { name: 'TikTok API', url: 'https://api.tiklydown.eu.org' },
            { name: 'YouTube API', url: 'https://api.ytb.blue' }
        ];
        
        let statusText = '*API STATUS CHECK*\n\n';
        
        for (const api of apis) {
            try {
                const start = Date.now();
                await axios.get(api.url, { timeout: 5000 });
                const latency = Date.now() - start;
                statusText += `✅ ${api.name}: ONLINE (${latency}ms)\n`;
            } catch (error) {
                statusText += `❌ ${api.name}: OFFLINE\n`;
            }
        }
        
        await sock.sendMessage(message.key.remoteJid, { text: statusText });
    } catch (error) {
        console.error('Error apistatus:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengecek status API.' });
    }
}

async function logCommand(sock, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    if (!isOwner(senderJid)) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
        return;
    }
    
    try {
        const verifiedCount = await getVerifiedCount();
        
        const logInfo = `
*SYSTEM LOG INFORMATION*

🖥️ *Platform:* ${process.platform}
📦 *Node.js:* ${process.version}
🗺️ *Architecture:* ${process.arch}
⏱️ *Uptime:* ${Math.floor(process.uptime())} detik
💾 *Memory Usage:* ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
📂 *Working Directory:* ${process.cwd()}
📊 *Verified Users:* ${verifiedCount}

*BOT STATUS:*
✅ Connected
🔧 Self Mode: ${selfMode ? 'ON' : 'OFF'}
📅 Start Time: ${new Date(botStartTime).toLocaleString()}
🕒 Running For: ${Math.floor((Date.now() - botStartTime) / 1000)} detik
        `;
        
        await sock.sendMessage(message.key.remoteJid, { text: logInfo });
    } catch (error) {
        console.error('Error log:', error);
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Gagal mengambil log.' });
    }
}

async function gigCommand(sock, message) {
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        await sock.sendMessage(groupJid, { text: '❌ Command ini hanya untuk grup!' });
        return;
    }
    
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const participants = metadata.participants;
        const admins = participants.filter(p => p.admin).map(p => p.id.split('@')[0]);
        
        const groupInfo = `
*GROUP INFORMATION*

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
        console.error('Error gig:', error);
        await sock.sendMessage(groupJid, { text: '❌ Gagal mendapatkan info grup.' });
    }
}

async function linkCommand(sock, message) {
    const groupJid = message.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) {
        await sock.sendMessage(groupJid, { text: '❌ Command ini hanya untuk grup!' });
        return;
    }
    
    try {
        const code = await sock.groupInviteCode(groupJid);
        const inviteLink = `https://chat.whatsapp.com/${code}`;
        
        await sock.sendMessage(groupJid, {
            text: `*GROUP INVITE LINK*\n\n🔗 ${inviteLink}\n\nShare link ini untuk mengundang orang ke grup.`
        });
    } catch (error) {
        console.error('Error link:', error);
        await sock.sendMessage(groupJid, { text: '❌ Gagal membuat link grup. Pastikan bot adalah admin.' });
    }
}

const tebakkataData = [
    { soal: "Aku punya daun tapi bukan pohon, aku punya duri tapi bukan mawar. Siapa aku?", jawab: "nanas" },
    { soal: "Berjalan tanpa kaki, bernyanyi tanpa mulut, tak pernah tidur tapi selalu diam. Siapa aku?", jawab: "sungai" },
    { soal: "Semakin dikeringkan, semakin basah. Apa itu?", jawab: "handuk" },
    { soal: "Benda apa yang selalu naik tapi tidak pernah turun?", jawab: "umur" },
    { soal: "Bisa menembus kaca tanpa merusaknya. Apa itu?", jawab: "cahaya" }
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
        text: `*GAME TEBAK KATA* 🎮\n\n${randomGame.soal}\n\nJawab dengan mengetik jawaban kamu!`
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
        text: `*MATH QUIZ* 🧮\n\nBerapakah hasil dari: ${num1} ${operator} ${num2} ?\n\nJawab dengan angka!`
    });
    
    setTimeout(() => {
        if (activeGames[gameId]) {
            delete activeGames[gameId];
        }
    }, 3 * 60 * 1000);
}

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
        text: `*GAME TEBAK ANGKA* 🎯\n\nSaya memikirkan angka antara 1-100.\nTebak angka yang saya pikirkan!\n\nKetik .hint untuk mendapatkan petunjuk.`
    });
    
    setTimeout(() => {
        if (activeGames[gameId]) {
            delete activeGames[gameId];
        }
    }, 5 * 60 * 1000);
}

function cekFun(sock, message, text, type) {
    const mentions = parseMention(text);
    const senderJid = message.key.participant || message.key.remoteJid;
    
    const types = {
        'iman': { name: 'Kadar Iman', emoji: '🕌' },
        'femboy': { name: 'Kadar Femboy', emoji: '👗' },
        'furry': { name: 'Kadar Furry', emoji: '🐾' },
        'jamet': { name: 'Kadar Jamet', emoji: '🛵' }
    };
    
    if (mentions.length === 0) {
        const percentage = Math.floor(Math.random() * 101);
        const emoji = percentage > 80 ? '😱' : percentage > 50 ? '😅' : percentage > 20 ? '😌' : '😴';
        
        sock.sendMessage(message.key.remoteJid, {
            text: `${types[type].emoji} *${types[type].name}*\n\nKamu: ${percentage}%\n${'█'.repeat(Math.floor(percentage/10))}${'░'.repeat(10-Math.floor(percentage/10))} ${emoji}`
        }, { quoted: message });
    } else {
        const target = mentions[0];
        const percentage = Math.floor(Math.random() * 101);
        const emoji = percentage > 80 ? '😱' : percentage > 50 ? '😅' : percentage > 20 ? '😌' : '😴';
        
        sock.sendMessage(message.key.remoteJid, {
            text: `${types[type].emoji} *${types[type].name}*\n\n@${target.split('@')[0]}: ${percentage}%\n${'█'.repeat(Math.floor(percentage/10))}${'░'.repeat(10-Math.floor(percentage/10))} ${emoji}`,
            mentions: [target]
        }, { quoted: message });
    }
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
                text: `🎉 *BENAR!*\nJawaban: ${game.answer}\n\nSelamat @${senderJid.split('@')[0]}! 🏆`,
                mentions: [senderJid]
            }, { quoted: message });
            return true;
        }
    } else if (game.type === 'mathquiz') {
        if (userAnswer === game.answer) {
            delete activeGames[gameId];
            await sock.sendMessage(gameId, {
                text: `🎉 *BENAR!*\nJawaban: ${game.answer}\n\nSelamat @${senderJid.split('@')[0]}! 🏆`,
                mentions: [senderJid]
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
                text: `🎉 *BENAR!*\nAngka yang saya pikirkan: ${game.answer}\n\nKamu menebak dalam ${game.attempts} percobaan!\nSelamat @${senderJid.split('@')[0]}! 🏆`,
                mentions: [senderJid]
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

async function hintCommand(sock, message) {
    const gameId = message.key.remoteJid;
    const game = activeGames[gameId];
    
    if (!game || game.type !== 'tebakangka') {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Tidak ada game tebak angka yang aktif!' });
        return;
    }
    
    if (game.hints >= 3) {
        await sock.sendMessage(message.key.remoteJid, { text: '❌ Sudah menggunakan semua hint!' });
        return;
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

async function pingCommand(sock, message) {
    const start = Date.now();
    await sock.sendMessage(message.key.remoteJid, { text: '🏓 Pong!' });
    const latency = Date.now() - start;
    
    await sock.sendMessage(message.key.remoteJid, { 
        text: `🏓 Pong!\n⏱️ Latency: ${latency}ms\n📅 Server Time: ${new Date().toLocaleString()}` 
    });
}

async function ownerCommand(sock, message) {
    await sock.sendMessage(message.key.remoteJid, { 
        text: `*OWNER INFORMATION*\n\n👤 Name: aal [humpreyDev]\n📱 WhatsApp: ${ownerNumber}\n💻 GitHub: humpreydev-hash\n\nHubungi owner untuk bantuan atau bug report.` 
    });
}

async function startBot() {
    console.log('🚀 Memulai bot WhatsApp...');
    
    await ensureTempDir();
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true,
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: true,
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 5
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📲 Scan QR code dengan WhatsApp:');
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log(`❌ Koneksi terputus. Status: ${statusCode}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('📵 Logged out, hapus session dan scan ulang');
                    startBot();
                } else {
                    console.log('🔄 Mencoba reconnect dalam 5 detik...');
                    setTimeout(() => {
                        console.log('🔁 Reconnecting...');
                        startBot();
                    }, 5000);
                }
            } else if (connection === 'open') {
                console.log('✅ Bot berhasil terhubung!');
                console.log(`👤 Bot ID: ${sock.user?.id}`);
                console.log(`📱 Push Name: ${sock.user?.name}`);
                console.log(`📧 Phone: ${sock.user?.phone}`);
            }
        });
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            
            const msg = messages[0];
            if (!msg.message) return;
            if (msg.key.fromMe) return;
            
            const senderJid = msg.key.participant || msg.key.remoteJid;
            const messageText = extractMessageText(msg);
            const senderName = msg.pushName || 'Unknown';
            
            console.log(`\n📩 [${new Date().toLocaleTimeString()}]`);
            console.log(`👤 From: ${senderJid} (${senderName})`);
            console.log(`💬 Msg: ${messageText?.substring(0, 100) || '[Media/Sticker]'}`);
            
            await autoVerifyOwner(senderJid, senderName);
            
            const isGameAnswer = await handleGameAnswer(sock, msg);
            if (isGameAnswer) return;
            
            if (!messageText || !messageText.startsWith(botPrefix)) return;
            
            const command = messageText.toLowerCase().trim().split(/ +/)[0];
            
            if (command !== '.verify') {
                const isVerified = await isUserVerified(senderJid);
                if (!isVerified) {
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: '❌ Kamu belum terverifikasi.\nKetik *.verify* untuk menggunakan bot.'
                    });
                    return;
                }
            }
            
            if (selfMode && !isOwner(senderJid)) {
                console.log(`🔒 Self mode aktif, blokir: ${senderJid}`);
                return;
            }
            
            await updateUserStats(senderJid);
            
            try {
                switch (command) {
                    case '.menu': case '.help': await showMenu(sock, msg); break;
                    case '.verify': await verifyCommand(sock, msg); break;
                    case '.ping': await pingCommand(sock, msg); break;
                    case '.owner': await ownerCommand(sock, msg); break;
                    case '.self': await selfCommand(sock, msg); break;
                    case '.unself': await unselfCommand(sock, msg); break;
                    case '.tiktok': case '.tt': case '.tos': await tiktokCommand(sock, msg, messageText); break;
                    case '.ig': case '.instagram': await igCommand(sock, msg, messageText); break;
                    case '.yt': case '.youtube': await ytCommand(sock, msg, messageText); break;
                    case '.stiker': case '.sticker': await stikerCommand(sock, msg, messageText); break;
                    case '.tostiker': case '.tosticker': await tostikerCommand(sock, msg); break;
                    case '.tomedia': case '.tovid': await tomediaCommand(sock, msg); break;
                    case '.grup': case '.group': await grupCommand(sock, msg, messageText); break;
                    case '.totag': case '.tagall': await totagCommand(sock, msg, messageText); break;
                    case '.kick': case '.remove': await kickCommand(sock, msg, messageText); break;
                    case '.github': case '.git': await githubCommand(sock, msg, messageText); break;
                    case '.npm': await npmCommand(sock, msg, messageText); break;
                    case '.apistatus': case '.status': await apistatusCommand(sock, msg); break;
                    case '.log': case '.logs': await logCommand(sock, msg); break;
                    case '.gig': case '.groupinfo': await gigCommand(sock, msg); break;
                    case '.link': case '.invite': await linkCommand(sock, msg); break;
                    case '.tebakkata': case '.tebak': await tebakkataCommand(sock, msg); break;
                    case '.mathquiz': case '.math': await mathquizCommand(sock, msg); break;
                    case '.tebakangka': case '.angka': await tebakangkaCommand(sock, msg); break;
                    case '.hint': case '.petunjuk': await hintCommand(sock, msg); break;
                    case '.cekiman': cekFun(sock, msg, messageText, 'iman'); break;
                    case '.cekfemboy': cekFun(sock, msg, messageText, 'femboy'); break;
                    case '.cekfurry': cekFun(sock, msg, messageText, 'furry'); break;
                    case '.cekjamet': cekFun(sock, msg, messageText, 'jamet'); break;
                    default: await sock.sendMessage(msg.key.remoteJid, { text: `❌ Command "${command}" tidak dikenal. Ketik .menu` }); break;
                }
            } catch (error) {
                console.error(`❌ Error command ${command}:`, error.message);
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Maaf, terjadi kesalahan sistem.' });
            }
        });
        
        console.log('🎉 Bot siap menerima pesan!');
        
        process.on('SIGINT', () => {
            console.log('\n🛑 Bot dimatikan...');
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Error setup bot:', error.message);
        console.log('🔄 Restart dalam 10 detik...');
        setTimeout(() => {
            console.log('🔁 Restarting bot...');
            startBot();
        }, 10000);
    }
}

startBot().catch(console.error);